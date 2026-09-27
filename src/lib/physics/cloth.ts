/**
 * SHELVED (not used): live cloth for the blanket, parked in favour of a modelled blanket
 * (components/bed/Blanket.tsx). Settles and sleeps; kept in case we revisit.
 *
 * Real cloth, the way Matthias Müller's "Ten Minute Physics" #14/#15 does it (XPBD):
 *
 *   substeps        many tiny steps, one constraint pass each: stable without stiffness tricks
 *   bending         distance constraints two particles apart give the sheet body
 *   self-collision  particles closer than `thickness` push apart (spatial hash), but only when
 *                   they are closer than in the flat rest shape, so a particle never fights its
 *                   own neighbours: folds stack instead of passing through each other
 *   velocity clamp  nothing moves more than 0.2 × thickness per substep: no tunnelling, ever
 *   friction        applied by moving positions back, so it sticks where it lands
 *
 * What makes it read as soft, heavy fabric instead of rubber:
 *   fixed timestep  1/60 s steps regardless of frame rate: no energy pumped in by jittery frames
 *   fold memory     bend rest lengths slowly creep toward the current shape (plasticity), so
 *                   folds stay where they're made instead of springing back flat
 *   limp            neighbour velocity smoothing kills wobble; slow jitter is damped to rest
 *   stiff weave     stretch/shear solved twice per substep: it hangs, it doesn't stretch
 *   heavy hand      grabbing is a soft grip on a speed-limited hand, not a rigid pin: the rest of
 *                   the blanket (and its friction on the bed) pulls back
 *
 * Plus what a blanket on a bed needs: rounded-box colliders (the cover, the frame, the floor),
 * moving rounded boxes (the pillows), and sleeping when settled.
 *
 * Units: millimetres, seconds. One local frame (the bed's).
 */
export type RoundedBox = {
  c: [number, number, number] // centre
  h: [number, number, number] // half sizes of the inner box
  r: number // corner radius added around it
  friction: number // 0..1: how much tangential motion a contact kills per substep
}

type Quat = [number, number, number, number]
type Kinematic = RoundedBox & {
  q: Quat
  prev: [number, number, number] // centre at the last tick: contacts are dragged along with it
}

export type ClothOptions = {
  width: number // along local X
  depth: number // along local Z
  segX: number
  segZ: number
  center: [number, number, number]
  yaw: number
  thickness: number
  /** how close two layers may get (≥ ~1.1 × grid spacing, or a particle slips between the four below it) */
  selfThickness?: number
  bend: number // compliance: 0 = board, 1e-3 = silk
  shear: number
  /** mm of the +X end folded back over the top at the start (a turned-down blanket) */
  fold?: number
  foldRadius?: number
}

const GRAVITY = -9810
const STEP = 1 / 60
const SUBSTEPS = 10
const STRETCH_PASSES = 2
const AIR = 2.2 // 1/s: fleece is draggy, hanging flaps settle in about a second
const SMOOTH = 0.12 // neighbour velocity smoothing per substep (internal damping)
const REST_V = 40 // mm/s: slower than this is jitter or creep, damp it out
const REST_DAMP = 0.8
const PLASTIC = 0.003 // per tick: how fast folds are memorised
const SLEEP_TICKS = 30 // judge stillness over half a second...
const SLEEP_DIST = 5 // ...asleep if nothing moved more than this (mm) in that time
const HAND_SPEED = 900 // mm/s: the most the held part can be hauled
const GRIP = 1.6e-5 // grab compliance: soft grip
const STICK = 0.15 // mm per substep: slower tangential motion than this on a supporting surface sticks
const WAKE_MOVE = 3 // mm a resting pillow must move to wake a sleeping blanket
const WAKE_TURN = 0.01

type Grip = { i: number; off: [number, number, number]; w: number }

export class Cloth {
  readonly nx: number
  readonly nz: number
  readonly count: number
  readonly thickness: number
  readonly selfThickness: number
  readonly pos: Float32Array
  private prev: Float32Array
  private rest: Float32Array // flat layout: rest distances for self-collision and stretch
  private vel: Float32Array
  private tmp: Float32Array
  private invMass: Float32Array
  private ids: Int32Array
  private compliance: Float32Array
  private restLen: Float32Array
  private flatLen: Float32Array
  private bendStart: number
  private numConstraints: number
  private hash: Hash
  private statics: RoundedBox[] = []
  private kinematics = new Map<string, Kinematic>()
  private grips: Grip[] = []
  private hand: [number, number, number] = [0, 0, 0]
  private handTarget: [number, number, number] = [0, 0, 0]
  private tickStart: Float32Array
  private sleepRef: Float32Array // positions at the start of the current stillness window
  private lastDisp = Infinity // largest particle move last tick: sizes the neighbour search
  private acc = 0
  private still = 0
  awake = true
  lastSpeed = 0 // how fast the fastest particle moved last tick (mm/s)

  constructor(o: ClothOptions) {
    this.nx = o.segX + 1
    this.nz = o.segZ + 1
    this.count = this.nx * this.nz
    this.thickness = o.thickness
    const N = this.count
    this.tickStart = new Float32Array(3 * N)
    this.sleepRef = new Float32Array(3 * N)
    this.pos = new Float32Array(3 * N)
    this.prev = new Float32Array(3 * N)
    this.rest = new Float32Array(3 * N)
    this.vel = new Float32Array(3 * N)
    this.tmp = new Float32Array(3 * N)
    this.invMass = new Float32Array(N).fill(1)
    const spacing = Math.min(o.width / o.segX, o.depth / o.segZ)
    this.selfThickness = o.selfThickness ?? Math.max(o.thickness, 1.12 * spacing)
    const c = Math.cos(o.yaw)
    const s = Math.sin(o.yaw)
    const fold = o.fold ?? 0
    const R = o.foldRadius ?? o.thickness
    const crease = o.width / 2 - fold
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const n = j * this.nx + i
        const lx = -o.width / 2 + (o.width * i) / o.segX
        const lz = -o.depth / 2 + (o.depth * j) / o.segZ
        const jit = () => (Math.random() - 0.5) * 0.02 * spacing // so a flat sheet knows which way to buckle
        this.rest[3 * n] = o.center[0] + lx * c - lz * s
        this.rest[3 * n + 1] = o.center[1]
        this.rest[3 * n + 2] = o.center[2] + lx * s + lz * c
        // the start pose: past the crease line the sheet rolls over a half-circle and lies back on top
        let fx = lx
        let fy = 0
        const d = lx - crease
        if (fold > 0 && d > 0) {
          const arc = Math.PI * R
          if (d < arc) {
            fx = crease + R * Math.sin(d / R)
            fy = R * (1 - Math.cos(d / R))
          } else {
            fx = crease - (d - arc)
            fy = 2 * R
          }
        }
        this.pos[3 * n] = o.center[0] + fx * c - lz * s + jit()
        this.pos[3 * n + 1] = o.center[1] + fy + jit()
        this.pos[3 * n + 2] = o.center[2] + fx * s + lz * c + jit()
      }
    this.prev.set(this.pos)

    // six constraint families on the grid: stretch (2), shear (2), bend (2, last)
    const offsets = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 2, 0, 0, 2, 0]
    const comp = [0, 0, o.shear, o.shear, o.bend, o.bend]
    const ids: number[] = []
    const cs: number[] = []
    let bendStart = 0
    for (let t = 0; t < 6; t++) {
      if (t === 4) bendStart = cs.length
      for (let j = 0; j < this.nz; j++)
        for (let i = 0; i < this.nx; i++) {
          const i0 = i + offsets[4 * t]
          const j0 = j + offsets[4 * t + 1]
          const i1 = i + offsets[4 * t + 2]
          const j1 = j + offsets[4 * t + 3]
          if (i0 < this.nx && j0 < this.nz && i1 < this.nx && j1 < this.nz) {
            ids.push(j0 * this.nx + i0, j1 * this.nx + i1)
            cs.push(comp[t])
          }
        }
    }
    this.ids = new Int32Array(ids)
    this.compliance = new Float32Array(cs)
    this.numConstraints = cs.length
    this.bendStart = bendStart
    this.restLen = new Float32Array(this.numConstraints)
    this.flatLen = new Float32Array(this.numConstraints)
    for (let k = 0; k < this.numConstraints; k++) {
      const a = this.ids[2 * k]
      const b = this.ids[2 * k + 1]
      this.flatLen[k] = Math.sqrt(dist2(this.rest, a, this.rest, b))
      // stretch/shear rest = flat; bend rest = the start pose, so the turned-down fold is remembered
      this.restLen[k] = k < bendStart ? this.flatLen[k] : Math.min(this.flatLen[k], Math.sqrt(dist2(this.pos, a, this.pos, b)))
    }
    this.hash = new Hash(spacing, N)
  }

  addStatic(b: RoundedBox) {
    this.statics.push(b)
  }

  /** Register or move a rounded box the cloth drapes over (a pillow). */
  setKinematic(key: string, c: [number, number, number], q: Quat, h: [number, number, number], r: number, friction = 0.8) {
    let k = this.kinematics.get(key)
    if (!k) {
      k = { c: [c[0], c[1], c[2]], h, r, friction, q: [q[0], q[1], q[2], q[3]], prev: [c[0], c[1], c[2]] }
      this.kinematics.set(key, k)
      this.wake()
      return
    }
    if (!this.awake) {
      // asleep: ignore a resting body's micro-jitter; only a real nudge wakes the blanket
      const moved = Math.abs(c[0] - k.c[0]) + Math.abs(c[1] - k.c[1]) + Math.abs(c[2] - k.c[2])
      const turned = Math.abs(q[0] - k.q[0]) + Math.abs(q[1] - k.q[1]) + Math.abs(q[2] - k.q[2]) + Math.abs(q[3] - k.q[3])
      if (moved < WAKE_MOVE && turned < WAKE_TURN) return
      k.prev[0] = k.c[0]
      k.prev[1] = k.c[1]
      k.prev[2] = k.c[2]
      this.wake()
    }
    k.c[0] = c[0]
    k.c[1] = c[1]
    k.c[2] = c[2]
    k.q[0] = q[0]
    k.q[1] = q[1]
    k.q[2] = q[2]
    k.q[3] = q[3]
  }

  wake() {
    if (!this.awake) this.lastDisp = Infinity
    this.awake = true
    this.still = 0
  }

  /** Take a fistful: every particle within `radius` of `point`, gripped harder near the centre. */
  grab(point: [number, number, number], radius: number) {
    this.grips = []
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[3 * i] - point[0]
      const dy = this.pos[3 * i + 1] - point[1]
      const dz = this.pos[3 * i + 2] - point[2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < bestD) {
        bestD = d
        best = i
      }
      // offsets shrink: the fabric bunches up in the hand
      if (d < radius) this.grips.push({ i, off: [dx * 0.45, dy * 0.45, dz * 0.45], w: 1 - 0.7 * (d / radius) ** 2 })
    }
    if (this.grips.length === 0 && best >= 0) this.grips.push({ i: best, off: [0, 0, 0], w: 1 })
    this.hand = [point[0], point[1], point[2]]
    this.handTarget = [point[0], point[1], point[2]]
    this.wake()
  }

  /** Where the hand wants to be. The hand itself follows at a limited speed. */
  moveGrab(target: [number, number, number]) {
    this.handTarget = target
    this.wake()
  }

  release() {
    this.grips = []
    this.wake()
  }

  get holding() {
    return this.grips.length > 0
  }

  /** Advance by a frame's worth of time in fixed ticks. Returns true if anything moved. */
  step(frameDt: number) {
    if (!this.awake) {
      this.acc = 0
      return false
    }
    this.acc += Math.min(frameDt, 0.1)
    let ticks = 0
    while (this.acc >= STEP && ticks < 2) {
      this.tick()
      this.acc -= STEP
      ticks++
    }
    if (ticks === 2) this.acc = 0 // running behind: drop time rather than spiral
    return ticks > 0
  }

  private tick() {
    const dt = STEP / SUBSTEPS
    const th = this.thickness
    const maxV = (0.2 * th) / dt
    const { pos, prev, vel, invMass, count } = this

    // neighbour lists once per tick, wide enough for this tick's travel: at most what the clamp
    // allows, but when it's barely moving, a little more than it moved last tick (much cheaper)
    this.hash.create(pos)
    this.hash.queryAll(pos, this.selfThickness + Math.min(maxV * STEP, 2 * this.lastDisp + 6))
    this.tickStart.set(pos)

    // the hand hauls toward the cursor, no faster than a person drags a heavy blanket
    if (this.holding) {
      const h = this.hand
      const t = this.handTarget
      const dx = t[0] - h[0]
      const dy = t[1] - h[1]
      const dz = t[2] - h[2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const k = d > 0 ? Math.min(1, (HAND_SPEED * STEP) / d, 0.25) : 0
      h[0] += dx * k
      h[1] += dy * k
      h[2] += dz * k
    }

    const air = 1 - AIR * dt
    for (let s = 0; s < SUBSTEPS; s++) {
      for (let i = 0; i < count; i++) {
        if (invMass[i] === 0) continue
        const k = 3 * i
        vel[k + 1] += GRAVITY * dt
        vel[k] *= air
        vel[k + 1] *= air
        vel[k + 2] *= air
        const v = Math.sqrt(vel[k] * vel[k] + vel[k + 1] * vel[k + 1] + vel[k + 2] * vel[k + 2])
        if (v > maxV) {
          const f = maxV / v
          vel[k] *= f
          vel[k + 1] *= f
          vel[k + 2] *= f
        }
        prev[k] = pos[k]
        prev[k + 1] = pos[k + 1]
        prev[k + 2] = pos[k + 2]
        pos[k] += vel[k] * dt
        pos[k + 1] += vel[k + 1] * dt
        pos[k + 2] += vel[k + 2] * dt
      }
      for (let p = 0; p < STRETCH_PASSES; p++) this.solveConstraints(dt, 0, this.bendStart)
      this.solveConstraints(dt, this.bendStart, this.numConstraints)
      this.solveGrips(dt)
      this.solveObjects()
      this.solveSelf()
      for (let i = 0; i < count; i++) {
        if (invMass[i] === 0) continue
        const k = 3 * i
        vel[k] = (pos[k] - prev[k]) / dt
        vel[k + 1] = (pos[k + 1] - prev[k + 1]) / dt
        vel[k + 2] = (pos[k + 2] - prev[k + 2]) / dt
      }
      this.smoothVelocities()
      for (let i = 0; i < count; i++) {
        const k = 3 * i
        const v = Math.abs(vel[k]) + Math.abs(vel[k + 1]) + Math.abs(vel[k + 2])
        if (v < REST_V) {
          vel[k] *= REST_DAMP
          vel[k + 1] *= REST_DAMP
          vel[k + 2] *= REST_DAMP
        }
      }
    }
    for (const k of this.kinematics.values()) {
      k.prev[0] = k.c[0]
      k.prev[1] = k.c[1]
      k.prev[2] = k.c[2]
    }

    // fold memory: bend rest lengths creep toward the current shape (never longer than flat)
    const { ids, restLen, flatLen } = this
    for (let k = this.bendStart; k < this.numConstraints; k++) {
      const cur = Math.min(flatLen[k], Math.max(0.45 * flatLen[k], Math.sqrt(dist2(pos, ids[2 * k], pos, ids[2 * k + 1]))))
      restLen[k] += (cur - restLen[k]) * PLASTIC
    }

    let md2 = 0
    for (let i = 0; i < count; i++) md2 = Math.max(md2, dist2(pos, i, this.tickStart, i))
    this.lastDisp = Math.sqrt(md2)
    // speed = how far the fastest particle actually got this tick (substep velocities are noisy
    // wherever the cloth rests on something: gravity pulls a hair in, the contact pushes it out)
    this.lastSpeed = this.lastDisp / STEP
    // sleep once nothing has really moved for half a second (and nobody is holding it). Judged by
    // net displacement over the window, not per-tick speed: contact jitter of a fraction of a mm
    // never adds up, a real slide does
    if (this.holding || this.still === 0) {
      this.sleepRef.set(pos)
      this.still = this.holding ? 0 : 1
    } else if (++this.still > SLEEP_TICKS) {
      let m2 = 0
      for (let i = 0; i < count; i++) m2 = Math.max(m2, dist2(pos, i, this.sleepRef, i))
      if (m2 < SLEEP_DIST * SLEEP_DIST) {
        this.awake = false
        vel.fill(0)
      } else this.still = 0
    }
  }

  private solveConstraints(dt: number, from: number, to: number) {
    const { pos, invMass, ids, restLen, compliance } = this
    const idt2 = 1 / (dt * dt)
    for (let k = from; k < to; k++) {
      const a = ids[2 * k]
      const b = ids[2 * k + 1]
      const wa = invMass[a]
      const wb = invMass[b]
      const w = wa + wb
      if (w === 0) continue
      let dx = pos[3 * a] - pos[3 * b]
      let dy = pos[3 * a + 1] - pos[3 * b + 1]
      let dz = pos[3 * a + 2] - pos[3 * b + 2]
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len === 0) continue
      dx /= len
      dy /= len
      dz /= len
      const s = -(len - restLen[k]) / (w + compliance[k] * idt2)
      pos[3 * a] += dx * s * wa
      pos[3 * a + 1] += dy * s * wa
      pos[3 * a + 2] += dz * s * wa
      pos[3 * b] -= dx * s * wb
      pos[3 * b + 1] -= dy * s * wb
      pos[3 * b + 2] -= dz * s * wb
    }
  }

  /** Soft attachment of the gripped particles to the hand (XPBD, compliant). */
  private solveGrips(dt: number) {
    if (!this.grips.length) return
    const { pos } = this
    const h = this.hand
    const a = GRIP / (dt * dt)
    for (const g of this.grips) {
      const k = 3 * g.i
      const f = 1 / (1 + a / g.w)
      pos[k] += (h[0] + g.off[0] - pos[k]) * f
      pos[k + 1] += (h[1] + g.off[1] - pos[k + 1]) * f
      pos[k + 2] += (h[2] + g.off[2] - pos[k + 2]) * f
    }
  }

  /** Internal damping: each particle's velocity is pulled toward its grid neighbours' average. */
  private smoothVelocities() {
    const { vel, tmp, nx, nz } = this
    tmp.set(vel)
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const n = j * nx + i
        let sx = 0
        let sy = 0
        let sz = 0
        let c = 0
        if (i > 0) {
          const m = 3 * (n - 1)
          sx += tmp[m]
          sy += tmp[m + 1]
          sz += tmp[m + 2]
          c++
        }
        if (i < nx - 1) {
          const m = 3 * (n + 1)
          sx += tmp[m]
          sy += tmp[m + 1]
          sz += tmp[m + 2]
          c++
        }
        if (j > 0) {
          const m = 3 * (n - nx)
          sx += tmp[m]
          sy += tmp[m + 1]
          sz += tmp[m + 2]
          c++
        }
        if (j < nz - 1) {
          const m = 3 * (n + nx)
          sx += tmp[m]
          sy += tmp[m + 1]
          sz += tmp[m + 2]
          c++
        }
        const k = 3 * n
        vel[k] += (sx / c - tmp[k]) * SMOOTH
        vel[k + 1] += (sy / c - tmp[k + 1]) * SMOOTH
        vel[k + 2] += (sz / c - tmp[k + 2]) * SMOOTH
      }
  }

  /** Keep every particle `thickness/2` outside each rounded box; friction kills tangential motion. */
  private solveObjects() {
    const { invMass, count } = this
    const skin = this.thickness / 2
    for (let i = 0; i < count; i++) {
      if (invMass[i] === 0) continue
      const k = 3 * i
      for (const b of this.statics) this.collideBox(k, b, skin, null, 0, 0, 0)
      for (const b of this.kinematics.values())
        this.collideBox(k, b, skin, b.q, (b.c[0] - b.prev[0]) / SUBSTEPS, (b.c[1] - b.prev[1]) / SUBSTEPS, (b.c[2] - b.prev[2]) / SUBSTEPS)
    }
  }

  private collideBox(k: number, b: RoundedBox, skin: number, q: Quat | null, mx: number, my: number, mz: number) {
    const { pos, prev } = this
    // into the box's frame
    let px = pos[k] - b.c[0]
    let py = pos[k + 1] - b.c[1]
    let pz = pos[k + 2] - b.c[2]
    if (q) {
      const r = rot(px, py, pz, -q[0], -q[1], -q[2], q[3])
      px = r[0]
      py = r[1]
      pz = r[2]
    }
    const R = b.r + skin
    if (Math.abs(px) > b.h[0] + R || Math.abs(py) > b.h[1] + R || Math.abs(pz) > b.h[2] + R) return
    // closest point on the inner box
    const cx = Math.max(-b.h[0], Math.min(b.h[0], px))
    const cy = Math.max(-b.h[1], Math.min(b.h[1], py))
    const cz = Math.max(-b.h[2], Math.min(b.h[2], pz))
    let nx = px - cx
    let ny = py - cy
    let nz = pz - cz
    const d = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (d >= R) return
    if (d < 1e-6) {
      // inside the inner box: leave by the nearest face
      const fx = b.h[0] - Math.abs(px)
      const fy = b.h[1] - Math.abs(py)
      const fz = b.h[2] - Math.abs(pz)
      nx = ny = nz = 0
      if (fy <= fx && fy <= fz) {
        ny = py < 0 ? -1 : 1
        py = ny * (b.h[1] + R)
      } else if (fx <= fz) {
        nx = px < 0 ? -1 : 1
        px = nx * (b.h[0] + R)
      } else {
        nz = pz < 0 ? -1 : 1
        pz = nz * (b.h[2] + R)
      }
    } else {
      nx /= d
      ny /= d
      nz /= d
      px = cx + nx * R
      py = cy + ny * R
      pz = cz + nz * R
    }
    if (q) {
      const r = rot(px, py, pz, q[0], q[1], q[2], q[3])
      px = r[0]
      py = r[1]
      pz = r[2]
      const n = rot(nx, ny, nz, q[0], q[1], q[2], q[3])
      nx = n[0]
      ny = n[1]
      nz = n[2]
    }
    pos[k] = px + b.c[0]
    pos[k + 1] = py + b.c[1]
    pos[k + 2] = pz + b.c[2]
    // friction on this substep's tangential motion, measured relative to the object's own motion
    // (so a pillow pulled out from under it drags the blanket along):
    //   static   resting on top of something and only creeping: stop dead (fleece grips cotton)
    //   kinetic  otherwise: undo most of it
    const dx = pos[k] - (prev[k] + mx)
    const dy = pos[k + 1] - (prev[k + 1] + my)
    const dz = pos[k + 2] - (prev[k + 2] + mz)
    const along = dx * nx + dy * ny + dz * nz
    const tx = dx - along * nx
    const ty = dy - along * ny
    const tz = dz - along * nz
    const f = ny > 0.3 && tx * tx + ty * ty + tz * tz < (STICK * ny) ** 2 ? 1 : b.friction
    pos[k] -= tx * f
    pos[k + 1] -= ty * f
    pos[k + 2] -= tz * f
  }

  /** Self-collision: particles closer than `selfThickness` (and closer than at rest) push apart. */
  private solveSelf() {
    const { pos, prev, rest, invMass, hash } = this
    const T = this.selfThickness
    const th2 = T * T
    const friction = 0.4
    for (let a = 0; a < this.count; a++) {
      if (invMass[a] === 0) continue
      const first = hash.firstAdjId[a]
      const last = hash.firstAdjId[a + 1]
      for (let j = first; j < last; j++) {
        const b = hash.adjIds[j]
        if (invMass[b] === 0) continue
        let dx = pos[3 * b] - pos[3 * a]
        let dy = pos[3 * b + 1] - pos[3 * a + 1]
        let dz = pos[3 * b + 2] - pos[3 * a + 2]
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > th2 || d2 === 0) continue
        const rd2 = dist2(rest, a, rest, b)
        if (d2 > rd2) continue
        const minDist = rd2 < th2 ? Math.sqrt(rd2) : T
        const d = Math.sqrt(d2)
        const s = (minDist - d) / d
        dx *= s
        dy *= s
        dz *= s
        pos[3 * a] -= dx * 0.5
        pos[3 * a + 1] -= dy * 0.5
        pos[3 * a + 2] -= dz * 0.5
        pos[3 * b] += dx * 0.5
        pos[3 * b + 1] += dy * 0.5
        pos[3 * b + 2] += dz * 0.5
        // friction: both move toward their average displacement
        const ax = pos[3 * a] - prev[3 * a]
        const ay = pos[3 * a + 1] - prev[3 * a + 1]
        const az = pos[3 * a + 2] - prev[3 * a + 2]
        const bx = pos[3 * b] - prev[3 * b]
        const by = pos[3 * b + 1] - prev[3 * b + 1]
        const bz = pos[3 * b + 2] - prev[3 * b + 2]
        const mx = (ax + bx) / 2
        const my = (ay + by) / 2
        const mz = (az + bz) / 2
        pos[3 * a] += (mx - ax) * friction
        pos[3 * a + 1] += (my - ay) * friction
        pos[3 * a + 2] += (mz - az) * friction
        pos[3 * b] += (mx - bx) * friction
        pos[3 * b + 1] += (my - by) * friction
        pos[3 * b + 2] += (mz - bz) * friction
      }
    }
  }
}

/** Spatial hash (Müller): the neighbours of every particle within `maxDist`, rebuilt once per tick. */
class Hash {
  private spacing: number
  private tableSize: number
  private cellStart: Int32Array
  private cellEntries: Int32Array
  private queryIds: Int32Array
  private querySize = 0
  private max: number
  firstAdjId: Int32Array
  adjIds: Int32Array

  constructor(spacing: number, max: number) {
    this.spacing = spacing
    this.tableSize = 5 * max
    this.cellStart = new Int32Array(this.tableSize + 1)
    this.cellEntries = new Int32Array(max)
    this.queryIds = new Int32Array(max)
    this.max = max
    this.firstAdjId = new Int32Array(max + 1)
    this.adjIds = new Int32Array(10 * max)
  }

  private hashCoords(x: number, y: number, z: number) {
    const h = (x * 92837111) ^ (y * 689287499) ^ (z * 283923481)
    return Math.abs(h) % this.tableSize
  }

  private cell(v: number) {
    return Math.floor(v / this.spacing)
  }

  private hashPos(pos: Float32Array, i: number) {
    return this.hashCoords(this.cell(pos[3 * i]), this.cell(pos[3 * i + 1]), this.cell(pos[3 * i + 2]))
  }

  create(pos: Float32Array) {
    const n = this.max
    this.cellStart.fill(0)
    for (let i = 0; i < n; i++) this.cellStart[this.hashPos(pos, i)]++
    let start = 0
    for (let i = 0; i < this.tableSize; i++) {
      start += this.cellStart[i]
      this.cellStart[i] = start
    }
    this.cellStart[this.tableSize] = start
    for (let i = 0; i < n; i++) {
      const h = this.hashPos(pos, i)
      this.cellStart[h]--
      this.cellEntries[this.cellStart[h]] = i
    }
  }

  private query(pos: Float32Array, i: number, maxDist: number) {
    const x0 = this.cell(pos[3 * i] - maxDist)
    const y0 = this.cell(pos[3 * i + 1] - maxDist)
    const z0 = this.cell(pos[3 * i + 2] - maxDist)
    const x1 = this.cell(pos[3 * i] + maxDist)
    const y1 = this.cell(pos[3 * i + 1] + maxDist)
    const z1 = this.cell(pos[3 * i + 2] + maxDist)
    this.querySize = 0
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const h = this.hashCoords(x, y, z)
          for (let k = this.cellStart[h]; k < this.cellStart[h + 1]; k++) this.queryIds[this.querySize++] = this.cellEntries[k]
        }
  }

  queryAll(pos: Float32Array, maxDist: number) {
    let num = 0
    const md2 = maxDist * maxDist
    for (let a = 0; a < this.max; a++) {
      this.firstAdjId[a] = num
      this.query(pos, a, maxDist)
      for (let j = 0; j < this.querySize; j++) {
        const b = this.queryIds[j]
        if (b >= a) continue
        if (dist2(pos, a, pos, b) > md2) continue
        if (num >= this.adjIds.length) {
          const grown = new Int32Array(2 * num)
          grown.set(this.adjIds)
          this.adjIds = grown
        }
        this.adjIds[num++] = b
      }
    }
    this.firstAdjId[this.max] = num
  }
}

function dist2(a: Float32Array, i: number, b: Float32Array, j: number) {
  const dx = a[3 * i] - b[3 * j]
  const dy = a[3 * i + 1] - b[3 * j + 1]
  const dz = a[3 * i + 2] - b[3 * j + 2]
  return dx * dx + dy * dy + dz * dz
}

/** rotate (x,y,z) by the quaternion (qx,qy,qz,qw) */
function rot(x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): [number, number, number] {
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  return [ix * qw - iw * qx - iy * qz + iz * qy, iy * qw - iw * qy - iz * qx + ix * qz, iz * qw - iw * qz - ix * qy + iy * qx]
}
