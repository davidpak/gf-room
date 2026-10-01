import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, Group, IcosahedronGeometry, Matrix4, Quaternion, Vector3 } from 'three'
import { bruno } from '../../quad/bruno'
import { paint, rng } from '../../picnic/paint'
import { crumpleSound, foldSound, throwSound } from '../../../lib/sound/paper'
import { PAPER } from '../spec'
import { crease, fold, now, sheet, side, type Facet, type Line, type V2 } from './fold'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A sheet of paper to fold into a dart (./fold does the folding), and to throw.
 *
 *   folding    its folds shown as dashed lines (all seven at once: which comes when is the puzzle); hover one and it
 *              lights, click and the paper swings over along it. The dart: the two top corners in to the middle, the
 *              new slanted edges in to the middle again, folded in half (the keel), each wing folded down. Either
 *              corner first, either edge, either wing; but a fold before its time (an edge before its corner, the
 *              keel before the nose is done, a wing before the keel) and the sheet's crumpled into a ball
 *   the plane  in your hand: flick up and let go to throw it (how hard, which way, from the flick). It flies: lift
 *              with the square of its speed, drag, gravity, a wander in its roll; thrown hard it climbs and swoops,
 *              gently it glides down; it lands on its keel, tipped onto a wing. Click it to pick it up again
 *   the ball   flicked, it's thrown, and bounces
 *
 * World units are mm; `home` is where it's folded (on the ground, flat). The camera's hand: just in front of it.
 */
const { w: W, h: H, keel: KEEL, layer: LAYER } = PAPER
const TOP = H / 2
const T8 = Math.tan(Math.PI / 8)

/** a fold from a to b, the side holding point m the side that moves */
function line(a: V2, b: V2, m: V2): Line {
  const l: Line = { p: a, d: [b[0] - a[0], b[1] - a[1]] }
  return side(l, m) >= 0 ? l : { p: a, d: [a[0] - b[0], a[1] - b[1]] }
}
type Fold = { id: number; needs: number[]; seg: [V2, V2]; flat?: Line; bend?: 'a' | 'bL' | 'bR' }
const FOLDS: Fold[] = [
  { id: 1, needs: [], seg: [[0, TOP], [-W / 2, TOP - W / 2]], flat: line([0, TOP], [-W / 2, TOP - W / 2], [-W / 2, TOP]) },
  { id: 2, needs: [], seg: [[0, TOP], [W / 2, TOP - W / 2]], flat: line([0, TOP], [W / 2, TOP - W / 2], [W / 2, TOP]) },
  { id: 3, needs: [1], seg: [[0, TOP], [-W / 2, TOP - W / 2 / T8]], flat: line([0, TOP], [-W / 2, TOP - W / 2 / T8], [-W / 2, 0]) },
  { id: 4, needs: [2], seg: [[0, TOP], [W / 2, TOP - W / 2 / T8]], flat: line([0, TOP], [W / 2, TOP - W / 2 / T8], [W / 2, 0]) },
  { id: 5, needs: [1, 2, 3, 4], seg: [[0, TOP], [0, -TOP]], bend: 'a' },
  { id: 6, needs: [5], seg: [[-KEEL, TOP - KEEL / T8], [-KEEL, -TOP]], bend: 'bL' },
  { id: 7, needs: [5], seg: [[KEEL, TOP - KEEL / T8], [KEEL, -TOP]], bend: 'bR' },
]

// ---- what the page shows about it (the hint, the new-sheet button)
export type PlanePhase = 'folding' | 'ball' | 'held' | 'flying' | 'landed'
let phaseNow: PlanePhase = 'folding'
const subs = new Set<() => void>()
const setPhase = (p: PlanePhase) => {
  phaseNow = p
  subs.forEach((f) => f())
}
export const usePlanePhase = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => phaseNow)
let newSheet: () => void = () => {}
/** where it is now (world), for a camera to watch */
export const planeAt = new Vector3()
/** a fresh sheet from the stack */
export const takeSheet = () => newSheet()

const paperMats = new Map<string, ReturnType<typeof bruno>>()
function paperMat(color: string) {
  if (!paperMats.has(color)) {
    const t = paint(256, 256, (g) => {
      const r = rng(5)
      g.fillStyle = color
      g.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '120,100,110'},${0.04 + r() * 0.05})`
        g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1)
      }
    })
    paperMats.set(color, bruno({ map: t ?? undefined, color: '#ffffff', shade: '#9d93ad', side: DoubleSide }))
  }
  return paperMats.get(color)!
}
const LINE = bruno({ color: '#857993', shade: '#5a5068', side: DoubleSide })
const LINE_ON = bruno({ color: '#e7839f', shade: '#a05470', emissive: '#e7839f', emissiveIntensity: 0.3, side: DoubleSide })

const _v = new Vector3()
const _w = new Vector3()
const _m = new Matrix4()
const _q = new Quaternion()
const UP = new Vector3(0, 1, 0)

/** the bends after the flat folds: a (in half), bL bR (the wings), each 0..1 */
type Bend = { a: number; bL: number; bR: number }
/** where a point of the folded-flat paper (x across, y along) on layer `rank` is, with the paper bent so far: in
 *  the plane's own frame (x across, y up, -z its nose) */
function place(x: number, y: number, rank: number, bend: Bend | null, out: Vector3) {
  if (!bend) return out.set(x, 0.6 + rank * LAYER, -y)
  const s = x < 0 ? -1 : 1
  const d = Math.abs(x)
  const al = (bend.a * Math.PI) / 2 // (each half turned down about the middle)
  const be = al * (1 - (s < 0 ? bend.bL : bend.bR)) // (each wing turned back out flat from the half)
  const ux = s * Math.cos(al)
  const uy = -Math.sin(al)
  const wx = s * Math.cos(be)
  const wy = -Math.sin(be)
  let px: number
  let py: number
  let nx: number
  let ny: number
  if (d <= KEEL) {
    px = ux * d
    py = uy * d
    nx = s * Math.sin(al)
    ny = Math.cos(al)
  } else {
    px = ux * KEEL + wx * (d - KEEL)
    py = uy * KEEL + wy * (d - KEEL)
    nx = s * Math.sin(be)
    ny = Math.cos(be)
  }
  const lift = KEEL * Math.sin(al) // (the wing roots at 0)
  return out.set(px + nx * (0.6 + rank * LAYER), py + lift + ny * (0.6 + rank * LAYER), -y)
}

/** the folded paper's mesh: each facet a fan, both sides */
function build(facets: Facet[], bend: Bend | null, moving?: { facets: Facet[]; axis: { p: Vector3; k: Vector3 }; th: number }) {
  const ranks = [...new Set([...facets, ...(moving?.facets ?? [])].map((f) => f.layer))].sort((a, b) => a - b)
  const rank = (l: number) => ranks.indexOf(l)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const add = (f: Facet, rot: boolean) => {
    const pts = now(f)
    const base = pos.length / 3
    pts.forEach(([x, y], i) => {
      place(x, y, rank(f.layer), bend, _v)
      if (rot && moving) {
        // (swinging over: turned about the fold line)
        _v.sub(moving.axis.p).applyAxisAngle(moving.axis.k, moving.th).add(moving.axis.p)
      }
      pos.push(_v.x, _v.y, _v.z)
      const o = f.poly[i]
      uv.push(o[0] / W + 0.5, o[1] / H + 0.5)
    })
    for (let i = 1; i < pts.length - 1; i++) idx.push(base, base + i, base + i + 1)
  }
  facets.forEach((f) => add(f, false))
  moving?.facets.forEach((f) => add(f, true))
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** a dashed line along a segment of the paper, lying on its top */
function dashes(seg: [V2, V2], rank: number, bend: Bend | null, wide: number) {
  const [a, b] = seg
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(1, Math.floor(len / 9))
  const pos: number[] = []
  const idx: number[] = []
  const dx = (b[0] - a[0]) / len
  const dy = (b[1] - a[1]) / len
  for (let i = 0; i < n; i++) {
    const t0 = (i * len) / n
    const t1 = t0 + (len / n) * 0.6
    const base = pos.length / 3
    for (const [t, o] of [
      [t0, -1],
      [t0, 1],
      [t1, 1],
      [t1, -1],
    ] as const) {
      const x = a[0] + dx * t - dy * o * wide
      const y = a[1] + dy * t + dx * o * wide
      place(x, y, rank, bend, _v)
      pos.push(_v.x, _v.y + 0.3, _v.z)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
const dist = ([px, py]: V2, [a, b]: [V2, V2]) => {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)))
  return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t)
}

// ---- flight
const G = 9810
const CL = 9810 / 5500 ** 2 // (lift equal to its weight at 5.5 m/s)
const CD = CL / 5 // (a glide of about 5 to 1)
const LIFT_MAX = 1.4 * 9810 // (at most 1.4 g: thrown hard it climbs and swoops, but doesn't loop over backwards)
const BALL = 34

export function PaperPlane({ home, colors }: { home: [number, number, number]; colors: string[] }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const root = useRef<Group>(null)
  const [sheetNo, setSheetNo] = useState(0)
  const color = colors[sheetNo % colors.length]
  const mat = paperMat(color)
  // the paper: its facets, what's folded, the bends after the flat folds
  const st = useRef({ facets: sheet(W, H), done: [] as number[], bend: null as Bend | null })
  const anim = useRef<null | { f: Fold; t: number; moving?: Facet[]; stayed?: Facet[]; next?: Facet[]; axis?: { p: Vector3; k: Vector3 } }>(null)
  const crumple = useRef(0) // (0: paper; on to 1 as it balls up)
  const [geo, setGeo] = useState(() => build(st.current.facets, null))
  const [hover, setHover] = useState<number | null>(null)
  const [, redraw] = useState(0)
  const [phase, setLocal] = useState<PlanePhase>('folding')
  const go = (p: PlanePhase) => (setLocal(p), setPhase(p))
  // flying (or the ball): where, how fast, its roll
  const fly = useRef({ p: new Vector3(), v: new Vector3(), roll: 0, rollTo: 0, spin: new Vector3() })

  const fresh = () => {
    st.current = { facets: sheet(W, H), done: [], bend: null }
    anim.current = null
    crumple.current = 0
    setGeo(build(st.current.facets, null))
    setHover(null)
    go('folding')
    if (root.current) {
      root.current.position.set(...home)
      root.current.quaternion.identity()
    }
  }
  useEffect(() => {
    newSheet = () => {
      setSheetNo((n) => n + 1)
      fresh()
    }
    go('folding')
    return () => void (newSheet = () => {})
  }, [])

  // the folds left, and whether a fold may be done now
  const left = FOLDS.filter((f) => !st.current.done.includes(f.id))
  const ready = (f: Fold) => f.needs.every((n) => st.current.done.includes(n))
  const topRank = () => new Set(st.current.facets.map((f) => f.layer)).size

  const doFold = (f: Fold) => {
    if (anim.current || crumple.current) return
    if (!ready(f)) {
      // too soon: crumpled
      crumple.current = 0.001
      crumpleSound()
      return
    }
    foldSound()
    const s = st.current
    if (f.flat) {
      const r = fold(s.facets, f.flat)
      // its axis (the fold line, on top of everything), turned so the moving side lifts up and over
      const h = 0.6 + topRank() * LAYER
      const p = new Vector3(f.flat.p[0], h, -f.flat.p[1])
      const k = new Vector3(f.flat.d[0], 0, -f.flat.d[1]).normalize()
      const probe = new Vector3(f.flat.p[0] - f.flat.d[1], h, -(f.flat.p[1] + f.flat.d[0])) // (a point on the + side)
      const lifted = probe.clone().sub(p).applyAxisAngle(k, 0.2).add(p)
      if (lifted.y < h) k.negate()
      anim.current = { f, t: 0, moving: r.moved, stayed: r.stayed, next: r.facets, axis: { p, k } }
    } else {
      if (!s.bend) {
        // (creased where it'll bend: down the middle, and where each wing meets the keel)
        let fs = s.facets
        for (const x of [0, -KEEL, KEEL]) fs = crease(fs, { p: [x, 0], d: [0, 1] })
        s.facets = fs
        s.bend = { a: 0, bL: 0, bR: 0 }
      }
      anim.current = { f, t: 0 }
    }
  }

  useFrame((_, dt) => {
    const s = st.current
    const g = root.current
    // folding
    const a = anim.current
    if (a) {
      a.t = Math.min(1, a.t + dt * (a.f.flat ? 1.9 : 1.6))
      const e = a.t * a.t * (3 - 2 * a.t)
      if (a.f.flat && a.moving && a.axis) {
        setGeo(build(a.stayed!, s.bend, { facets: a.moving, axis: a.axis, th: e * Math.PI }))
        if (a.t >= 1) {
          s.facets = a.next!
          s.done = [...s.done, a.f.id]
          anim.current = null
          setGeo(build(s.facets, s.bend))
        }
      } else if (a.f.bend && s.bend) {
        s.bend[a.f.bend] = e
        setGeo(build(s.facets, s.bend))
        if (a.t >= 1) {
          s.done = [...s.done, a.f.id]
          anim.current = null
          redraw((n) => n + 1)
          if (s.done.length === FOLDS.length) go('held') // (a plane: into your hand)
        }
      }
    }
    // crumpling into a ball
    if (crumple.current > 0 && crumple.current < 1) {
      crumple.current = Math.min(1, crumple.current + dt * 2.6)
      redraw((n) => n + 1)
      if (crumple.current >= 1) go('ball')
    }
    if (!g) return
    g.getWorldPosition(planeAt)
    // in your hand: in front of the camera, nose out
    if (phase === 'held') {
      _v.set(60, -120, -700).applyQuaternion(camera.quaternion).add(camera.position)
      g.position.lerp(_v, Math.min(1, dt * 10))
      _w.set(0, 0, -1).applyQuaternion(camera.quaternion)
      _w.y += 0.12
      _m.lookAt(_v.set(0, 0, 0), _w, UP) // (its -z along where it'll go)
      _q.setFromRotationMatrix(_m)
      g.quaternion.slerp(_q, Math.min(1, dt * 10))
    }
    // flying
    if (phase === 'flying') {
      const f = fly.current
      const n = 4
      const h = Math.min(dt, 1 / 30) / n
      for (let i = 0; i < n; i++) {
        if (crumple.current >= 1) {
          // the ball: thrown, dragged, bouncing
          f.v.y -= G * h
          f.v.multiplyScalar(1 - 0.4 * h)
          f.p.addScaledVector(f.v, h)
          if (f.p.y < 0) {
            f.p.y = 0
            f.v.y = Math.abs(f.v.y) * 0.35
            f.v.x *= 0.7
            f.v.z *= 0.7
          }
        } else {
          const sp = f.v.length()
          const vh = _v.copy(f.v).divideScalar(sp || 1)
          // lift: square to the flight, rolled; drag back along it
          const up = _w.copy(UP).addScaledVector(vh, -vh.y).normalize()
          const across = new Vector3().crossVectors(vh, up)
          const liftDir = up.multiplyScalar(Math.cos(f.roll)).addScaledVector(across, Math.sin(f.roll))
          f.v.addScaledVector(liftDir, Math.min(LIFT_MAX, CL * sp * sp) * h)
          f.v.addScaledVector(vh, -CD * sp * sp * h)
          f.v.y -= G * h
          f.p.addScaledVector(f.v, h)
          f.roll += (f.rollTo - f.roll) * Math.min(1, h * 2)
        }
      }
      if (Math.random() < dt * 0.8) fly.current.rollTo = (Math.random() - 0.5) * 0.5
      g.position.copy(f.p)
      if (crumple.current >= 1) {
        g.rotation.x += f.spin.x * dt
        g.rotation.z += f.spin.z * dt
      } else {
        // nose along its flight, rolled
        _m.lookAt(_v.set(0, 0, 0), _w.copy(f.v).normalize(), UP)
        _q.setFromRotationMatrix(_m)
        g.quaternion.copy(_q).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -f.roll))
      }
      // down: it lands (on its keel, tipped onto a wing), or the ball stops rolling
      const landed = crumple.current >= 1 ? f.v.length() < 60 && f.p.y <= 1 : f.p.y < KEEL * 0.8
      const far = f.p.length() > 60000
      if (landed || far) {
        if (crumple.current < 1) {
          const yaw = Math.atan2(-f.v.x, -f.v.z)
          g.position.set(f.p.x, KEEL * 0.72, f.p.z)
          g.quaternion.setFromAxisAngle(UP, yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.34))
        }
        f.v.set(0, 0, 0)
        go('landed')
      }
    }
  })

  // throwing: a flick (where the pointer's been the last moment), let go
  const trail = useRef<{ x: number; y: number; t: number }[]>([])
  useEffect(() => {
    if (phase !== 'held') return
    if (controls) controls.enabled = false
    const move = (e: PointerEvent) => {
      trail.current.push({ x: e.clientX, y: e.clientY, t: performance.now() })
      if (trail.current.length > 12) trail.current.shift()
    }
    const down = (e: PointerEvent) => ((trail.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }]), window.addEventListener('pointermove', move))
    const up = () => {
      window.removeEventListener('pointermove', move)
      const tr = trail.current
      if (tr.length < 2) return
      const a = tr.find((p) => performance.now() - p.t < 120) ?? tr[0]
      const b = tr[tr.length - 1]
      const span = Math.max(16, b.t - a.t) / 1000
      const vx = (b.x - a.x) / span
      const vy = (b.y - a.y) / span
      if (vy > -120) return // (not flicked up: still in hand)
      const strength = Math.min(1, -vy / 2600)
      const speed = 2500 + strength * 5000
      const dir = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      dir.y = 0
      dir.normalize().applyAxisAngle(UP, -vx * 0.00025)
      dir.y = 0.02 + strength * 0.12
      dir.normalize()
      const f = fly.current
      f.p.copy(root.current!.position)
      f.v.copy(dir).multiplyScalar(speed)
      f.roll = (Math.random() - 0.5) * 0.3
      f.rollTo = f.roll
      f.spin.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12)
      throwSound(strength)
      go('flying')
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointermove', move)
      if (controls) controls.enabled = true
    }
  }, [phase, camera, controls])

  // hovering and clicking the paper
  const local = (e: ThreeEvent<PointerEvent | MouseEvent>): V2 => {
    const p = root.current!.worldToLocal(e.point.clone())
    return [p.x, -p.z]
  }
  const nearest = (q: V2) => {
    let best: Fold | null = null
    let bd = 22
    for (const f of left) {
      const d = dist(q, f.seg)
      if (d < bd) {
        bd = d
        best = f
      }
    }
    return best
  }
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (phase !== 'folding' || anim.current) return
    e.stopPropagation()
    let f: Fold | null
    if (st.current.bend) {
      // (bent: which wing is under the pointer)
      const x = root.current!.worldToLocal(e.point.clone()).x
      f = left.find((l) => l.bend === (x < 0 ? 'bL' : 'bR')) ?? null
    } else f = nearest(local(e))
    const id = f?.id ?? null
    if (id !== hover) setHover(id)
    document.body.style.cursor = id ? 'pointer' : ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (phase === 'landed' || phase === 'ball') {
      // picked up (again): into your hand
      go('held')
      return
    }
    if (phase !== 'folding' || hover == null) return
    const f = FOLDS.find((x) => x.id === hover)
    if (f) doFold(f)
    setHover(null)
  }

  const lines = useMemo(() => {
    if (phase !== 'folding' || anim.current) return []
    const rank = topRank()
    return left.map((f) => ({ id: f.id, geo: dashes(f.seg, rank, st.current.bend, f.id === hover ? 1.4 : 0.8) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hover, geo, left.length])
  const ball = useMemo(() => {
    // (its corners welded first, so each is pushed in or out once and the faces stay joined: crumpled, not broken;
    // then unwelded again, so each face is lit flat, a crease at every edge)
    const g = mergeVertices(new IcosahedronGeometry(BALL, 2).deleteAttribute('normal').deleteAttribute('uv'))
    const p = g.attributes.position as BufferAttribute
    const r = rng(9)
    for (let i = 0; i < p.count; i++) {
      const k = 0.8 + r() * 0.3
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
    }
    const flat = g.toNonIndexed()
    flat.computeVertexNormals()
    return flat
  }, [])
  const c = crumple.current
  return (
    <group ref={root} position={home}>
      {c < 1 && (
        <group scale={1 - c * 0.85} rotation={[c * 1.3, c * 2, c * 0.7]}>
          <mesh geometry={geo} material={mat} castShadow onPointerMove={over} onPointerOut={() => (setHover(null), (document.body.style.cursor = ''))} onClick={click} />
          {lines.map((l) => (
            <mesh key={l.id} geometry={l.geo} material={l.id === hover ? LINE_ON : LINE} />
          ))}
        </group>
      )}
      {c > 0 && (
        <mesh geometry={ball} material={mat} scale={Math.max(0.05, c)} position={[0, BALL * c, 0]} castShadow receiveShadow onClick={click} />
      )}
    </group>
  )
}
