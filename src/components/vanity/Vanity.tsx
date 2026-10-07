import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import {
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Path,
  Quaternion,
  SRGBColorSpace,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshLambertMaterial,
} from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedPolygon, roundedRect } from '../../lib/shapes'
import { Prompts } from '../prompt/Prompts'
import { MIRROR, STAND, ledSpots } from './spec'

/**
 * Her jewellery stand and her LED vanity mirror (./spec).
 *
 *   the stand    a clear acrylic foot and upright panel (pale, a little see-through), pegs along its top hung with
 *                gold chains and a pearl strand, earrings through holes to the right. The chains swing a little on
 *                their pegs when the stand is carried or knocked (a pendulum each, from how it's moved)
 *   the mirror   a white frame on a short post and foot, leaning back; the glass a soft painted gradient (the room
 *                in it, out of focus), the LED dots round it painted into the glass's own texture and glow map.
 *                Click it: the LEDs fade on or off
 *
 * Frames: ./spec (each footprint's middle, its bottom on y 0, the front toward +z).
 */
const S = STAND
const M = MIRROR
const ITEM = groups(GROUP.item, 0xffff)

// ---- shapes
/** a flat outline made solid, lying face up (shape y toward -z), from y0 up t, its edges rounded b */
function slab(shape: Shape, t: number, b: number, y0: number) {
  const g = new ExtrudeGeometry(shape, { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 12 })
  g.translate(0, 0, b)
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}
/** a flat outline made solid standing up (shape x, y as they are), t thick centred on z 0, its edges rounded b;
 *  its uv 0..1 over w × h (shape centred) */
function upright(shape: Shape, w: number, h: number, t: number, b: number) {
  const g = new ExtrudeGeometry(shape, { depth: Math.max(0.01, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 16 })
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h)
  g.translate(0, 0, -(t - 2 * b) / 2)
  return g
}
function heartShape(w: number) {
  const k = w / 10
  const s = new Shape()
  s.moveTo(0, -5 * k)
  s.bezierCurveTo(-1.5 * k, -3.2 * k, -5 * k, -1.5 * k, -5 * k, 1.4 * k)
  s.bezierCurveTo(-5 * k, 3.6 * k, -2.4 * k, 4.6 * k, 0, 2.6 * k)
  s.bezierCurveTo(2.4 * k, 4.6 * k, 5 * k, 3.6 * k, 5 * k, 1.4 * k)
  s.bezierCurveTo(5 * k, -1.5 * k, 1.5 * k, -3.2 * k, 0, -5 * k)
  return s
}
function starShape(R: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? R * 0.45 : R
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return roundedPolygon(pts, 0.8)
}

/** where a chain hangs from (its peg, a little back from the knob) */
const pegFront = S.panel.z + S.panel.t / 2
const hangZ = pegFront + S.pegs.len * 0.7
/** a necklace's loop, from its peg: over the peg, down both strands, meeting at the bottom (its pivot at 0) */
function necklaceCurve(drop: number, open: number) {
  const d = S.pegs.d / 2 + S.chain.r
  const p = (x: number, y: number, z: number) => new Vector3(x, y, z)
  return new CatmullRomCurve3(
    [
      p(0, d, 0),
      p(-d, 0, 0),
      p(-open / 2, -drop * 0.3, 0.6),
      p(-open * 0.38, -drop * 0.72, 1.2),
      p(-1.2, -drop + 1.5, 1.6),
      p(0, -drop, 1.6),
      p(1.2, -drop + 1.5, 1.6),
      p(open * 0.38, -drop * 0.72, 1.2),
      p(open / 2, -drop * 0.3, 0.6),
      p(d, 0, 0),
    ],
    true,
    'centripetal',
  )
}

type StandShapes = {
  base: BufferGeometry
  panel: BufferGeometry
  peg: BufferGeometry
  knob: BufferGeometry
  chains: (BufferGeometry | null)[]
  pearlStrands: (Vector3[] | null)[]
  pearl: BufferGeometry
  bigPearl: BufferGeometry
  heart: BufferGeometry
  star: BufferGeometry
  hook: BufferGeometry
  wire: BufferGeometry
}
let STAND_SHAPES: StandShapes | null = null
const standShapes = () => {
  if (STAND_SHAPES) return STAND_SHAPES
  const P = S.panel
  // the panel: its top corners rounded, the earring holes through it
  const w = P.w / 2
  const shape = roundedPolygon<Shape>([[-w, 0], [w, 0], [w, P.h], [-w, P.h]], [0, 0, P.r, P.r])
  for (const x of S.holes.x)
    for (const y of S.holes.y) shape.holes.push(new Path().absarc(x, y - S.base.h, S.holes.d / 2, 0, Math.PI * 2, true))
  const panel = new ExtrudeGeometry(shape, { depth: P.t - 2, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelOffset: -1, bevelSegments: 2, curveSegments: 8 })
  panel.translate(0, S.base.h - 3, P.z - (P.t - 2) / 2) // (standing 3 down into the foot's slot)
  const peg = new CylinderGeometry(S.pegs.d / 2, S.pegs.d / 2, S.pegs.len, 10).rotateX(Math.PI / 2).translate(0, 0, S.pegs.len / 2)
  const knob = new SphereGeometry(S.pegs.knob / 2, 12, 8).translate(0, 0, S.pegs.len)
  const chains = S.necklaces.map((n) => (n.pearls ? null : new TubeGeometry(necklaceCurve(n.drop, n.open), 220, S.chain.r, 5, true)))
  const pearlStrands = S.necklaces.map((n) => {
    if (!n.pearls) return null
    const c = necklaceCurve(n.drop, n.open)
    return c.getSpacedPoints(Math.round(c.getLength() / S.pearl.pitch)).slice(0, -1)
  })
  const hook = new TorusGeometry(4, 0.6, 6, 14, Math.PI).rotateY(-Math.PI / 2) // (an arc over the top, through the hole)
  const wire = new CylinderGeometry(0.6, 0.6, 5, 6).translate(0, -2.5, 0)
  STAND_SHAPES = {
    base: slab(roundedRect(S.base.w, S.base.d, S.base.r), S.base.h, 1.5, 0),
    panel,
    peg,
    knob,
    chains,
    pearlStrands,
    pearl: new SphereGeometry(S.pearl.r, 10, 8),
    bigPearl: new SphereGeometry(S.pearl.pendant, 14, 10),
    heart: upright(heartShape(10), 10, 10, 2.4, 0.8),
    star: upright(starShape(5), 10, 10, 2, 0.6),
    hook,
    wire,
  }
  return STAND_SHAPES
}

const standMats = () => ({
  acrylic: new MeshStandardMaterial({ color: S.colors.acrylic, transparent: true, opacity: 0.24, depthWrite: false, roughness: 0.2 }),
  gold: new MeshStandardMaterial({ color: S.colors.gold, roughness: 0.4 }),
  pearl: new MeshStandardMaterial({ color: S.colors.pearl, roughness: 0.35 }),
  heart: new MeshStandardMaterial({ color: S.colors.heart, roughness: 0.4 }),
})

// ---- the chains' swing: a pendulum each, its rest along what it feels as gravity (gravity less how the stand is
// being moved), seen in the stand's own frame
const G = 9810 // mm/s²
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _a = new Vector3()
function useSway(root: { current: Group | null }, pivots: { current: (Group | null)[] }) {
  const st = useRef<{ p: Vector3; v: Vector3; ready: boolean; ang: { z: number; x: number; vz: number; vx: number }[] }>({
    p: new Vector3(),
    v: new Vector3(),
    ready: false,
    ang: S.necklaces.map(() => ({ z: 0, x: 0, vz: 0, vx: 0 })),
  })
  useFrame((_, delta) => {
    const g = root.current
    if (!g) return
    const dt = Math.min(delta, 1 / 30)
    if (dt <= 0) return
    g.updateWorldMatrix(true, false)
    g.matrixWorld.decompose(_p, _q, _s)
    const s = st.current
    if (!s.ready) {
      s.p.copy(_p)
      s.ready = true
      return
    }
    // its velocity, smoothed (the physics steps and the frames don't line up), and so its acceleration
    const v = _a.copy(_p).sub(s.p).divideScalar(dt)
    s.p.copy(_p)
    const acc = v.clone().sub(s.v).divideScalar(dt)
    s.v.lerp(v, 0.5)
    acc.clampLength(0, 4 * G)
    // what the chains feel, in the stand's frame
    const feel = new Vector3(0, -G, 0).sub(acc.multiplyScalar(0.5)).applyQuaternion(_q.invert())
    const zRest = Math.atan2(feel.x, -feel.y)
    const xRest = Math.atan2(-feel.z, -feel.y)
    const k = feel.length()
    S.necklaces.forEach((n, i) => {
      const a = s.ang[i]
      const L = n.drop * 0.6
      const w2 = k / L
      for (let sub = 0; sub < 2; sub++) {
        const h = dt / 2
        a.vz += (w2 * Math.sin(zRest - a.z) - 2.2 * a.vz) * h
        a.vx += (w2 * Math.sin(xRest - a.x) - 2.2 * a.vx) * h
        a.z += a.vz * h
        a.x += a.vx * h
        // (not back into the panel: the chain's a peg's length in front of it)
        const back = Math.asin(Math.min(1, (hangZ - pegFront - 2) / n.drop))
        if (a.x > back) {
          a.x = back
          a.vx = Math.min(0, a.vx)
        }
        a.z = Math.max(-1.2, Math.min(1.2, a.z))
      }
      const pv = pivots.current[i]
      if (pv) pv.rotation.set(a.x, 0, a.z)
    })
  })
}

/** the acrylic stand with her necklaces and earrings */
export function JewelryStandModel() {
  const s = standShapes()
  const mat = useMemo(standMats, [])
  const root = useRef<Group>(null)
  const pivots = useRef<(Group | null)[]>([])
  useSway(root, pivots)
  const pearls = (pts: Vector3[]) => (m: InstancedMesh | null) => {
    if (!m) return
    const o = new Object3D()
    pts.forEach((p, i) => {
      o.position.copy(p)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }
  const holeAt = (col: number, row: number) => [S.holes.x[col], S.holes.y[row]] as const
  return (
    <group ref={root}>
      <mesh geometry={s.base} material={mat.acrylic} receiveShadow />
      <mesh geometry={s.panel} material={mat.acrylic} />
      {S.pegs.at.map((x, i) => (
        <group key={i} position={[x, S.pegs.y, pegFront]}>
          <mesh geometry={s.peg} material={mat.acrylic} />
          <mesh geometry={s.knob} material={mat.acrylic} />
        </group>
      ))}
      {S.necklaces.map((n, i) => (
        <group key={i} position={[S.pegs.at[n.peg], S.pegs.y, hangZ + (i % 2) * 1.5]}>
          <group ref={(g) => void (pivots.current[i] = g)}>
            {s.chains[i] && <mesh geometry={s.chains[i]!} material={mat.gold} castShadow />}
            {s.pearlStrands[i] && <instancedMesh ref={pearls(s.pearlStrands[i]!)} args={[s.pearl, mat.pearl, s.pearlStrands[i]!.length]} castShadow />}
            <group position={[0, -n.drop, 1.6]}>
              {n.pendant === 'pearl' && <mesh geometry={s.bigPearl} material={mat.pearl} position={[0, -S.pearl.pendant, 0]} castShadow />}
              {n.pendant === 'heart' && <mesh geometry={s.heart} material={mat.gold} position={[0, -5, 0]} rotation={[0, 0, Math.PI]} castShadow />}
              {n.pendant === 'star' && <mesh geometry={s.star} material={mat.gold} position={[0, -5, 0]} castShadow />}
            </group>
          </group>
        </group>
      ))}
      {S.earrings.map((e, i) => {
        const [x, y] = holeAt(e.col, e.row)
        const front = S.panel.z + 4
        return (
          <group key={i} position={[x, y, S.panel.z]}>
            <mesh geometry={s.hook} material={mat.gold} />
            <group position={[0, 0, front - S.panel.z]}>
              <mesh geometry={s.wire} material={mat.gold} />
              {e.kind === 'pearl' && <mesh geometry={s.bigPearl} material={mat.pearl} position={[0, -5 - S.pearl.pendant, 0]} castShadow />}
              {e.kind === 'heart' && <mesh geometry={s.heart} material={mat.heart} position={[0, -9.5, 0]} rotation={[0, 0, Math.PI]} castShadow />}
            </group>
          </group>
        )
      })}
    </group>
  )
}

// ---- the mirror
const PX = 4 // the glass's pixels a mm
const GW = M.head.w - 2 * M.head.rim
const GH = M.head.h - 2 * M.head.rim
/** the glass's face (the room in it, soft) and its glow map (only the LED dots) */
function paintGlass() {
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = GW * PX
    c.height = GH * PX
    return c
  }
  const face = mk()
  const glow = mk()
  const f = face.getContext('2d')!
  const W = face.width
  const H = face.height
  const grad = f.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, M.colors.glassTop)
  grad.addColorStop(0.55, '#bdbcb9')
  grad.addColorStop(1, M.colors.glassBottom)
  f.fillStyle = grad
  f.fillRect(0, 0, W, H)
  // a soft bright band across it, as a mirror catches the room's light
  const sheen = f.createLinearGradient(0, H * 0.15, W, H * 0.6)
  sheen.addColorStop(0.3, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.22)')
  sheen.addColorStop(0.7, 'rgba(255,255,255,0)')
  f.fillStyle = sheen
  f.fillRect(0, 0, W, H)
  // the far wall in it: a darker block low right, blurred
  f.filter = `blur(${6 * PX}px)`
  f.fillStyle = 'rgba(120,118,122,0.35)'
  f.fillRect(W * 0.55, H * 0.55, W * 0.45, H * 0.3)
  f.filter = 'none'
  const g = glow.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  const r = (M.leds.d / 2) * PX
  for (const [x, y] of ledSpots()) {
    const cx = (x + GW / 2) * PX
    const cy = (GH / 2 - y) * PX
    // the dot in the glass: a pale frosted round, a faint ring round it
    f.fillStyle = 'rgba(120,118,112,0.35)'
    f.beginPath()
    f.arc(cx, cy, r + 0.6 * PX, 0, Math.PI * 2)
    f.fill()
    f.fillStyle = M.colors.ledOff
    f.beginPath()
    f.arc(cx, cy, r, 0, Math.PI * 2)
    f.fill()
    // lit: bright in the middle, soft at its edge
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6)
    rg.addColorStop(0, '#ffffff')
    rg.addColorStop(0.55, '#ffffff')
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = rg
    g.beginPath()
    g.arc(cx, cy, r * 1.6, 0, Math.PI * 2)
    g.fill()
  }
  const t = (c: HTMLCanvasElement) => {
    const x = new CanvasTexture(c)
    x.colorSpace = SRGBColorSpace
    x.anisotropy = 8
    return x
  }
  return { map: t(face), glow: t(glow) }
}

type MirrorShapes = { back: BufferGeometry; rim: BufferGeometry; glass: BufferGeometry; base: BufferGeometry; neck: BufferGeometry; barrel: BufferGeometry }
let MIRROR_SHAPES: MirrorShapes | null = null
const mirrorShapes = () => {
  if (MIRROR_SHAPES) return MIRROR_SHAPES
  const H = M.head
  const front = H.t / 2
  const glassFront = front - M.glass.inset
  // the back shell up to just behind the glass; the rim round the front; the glass in it
  const back = upright(roundedRect(H.w, H.h, H.r), H.w, H.h, H.t - M.glass.inset - 2, 2.5).translate(0, H.h / 2, -(M.glass.inset + 2) / 2)
  const ring = roundedRect(H.w, H.h, H.r)
  ring.holes.push(roundedRect(GW, GH, H.r - H.rim, new Path()))
  const rim = upright(ring, H.w, H.h, 4, 1).translate(0, H.h / 2, front - 2)
  const glass = upright(roundedRect(GW, GH, H.r - H.rim), GW, GH, 2, 0).translate(0, H.h / 2, glassFront - 1)
  MIRROR_SHAPES = {
    back,
    rim,
    glass,
    base: slab(roundedRect(M.base.w, M.base.d, M.base.r), M.base.h, 3, 0),
    neck: upright(roundedRect(M.neck.w, M.hinge.y - M.base.h + 4, 5), M.neck.w, 1, M.neck.d, 3).translate(0, (M.hinge.y + M.base.h - 4) / 2, 0),
    barrel: new CylinderGeometry(7, 7, M.neck.w + 12, 16).rotateZ(Math.PI / 2),
  }
  return MIRROR_SHAPES
}
const TILT = (M.tilt * Math.PI) / 180

/** the LED mirror; `on`: its LEDs lit (they fade); `onToggle` when it's clicked */
export function MirrorModel({ on = true, onToggle }: { on?: boolean; onToggle?: () => void }) {
  const s = mirrorShapes()
  const tex = useMemo(paintGlass, [])
  const mat = useMemo(
    () => ({
      frame: new MeshStandardMaterial({ color: M.colors.frame, roughness: 0.6 }),
      glass: new MeshStandardMaterial({ map: tex.map, emissiveMap: tex.glow, emissive: M.colors.led, emissiveIntensity: on ? 1.6 : 0, roughness: 0.15 }),
    }),
    [tex], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // (the glow fades: set on whatever material the glass wears now, Stylize's Lambert copy included)
  const glass = useRef<Mesh>(null)
  const level = useRef(on ? 1 : 0)
  useFrame((_, dt) => {
    const target = on ? 1 : 0
    if (level.current === target || !glass.current) return
    level.current += Math.sign(target - level.current) * Math.min(Math.abs(target - level.current), dt * 6)
    ;(glass.current.material as MeshLambertMaterial).emissiveIntensity = 1.6 * level.current
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onToggle?.()
  }
  return (
    <group>
      <mesh geometry={s.base} material={mat.frame} castShadow receiveShadow />
      <mesh geometry={s.neck} material={mat.frame} castShadow receiveShadow position={[0, 0, -M.head.t / 2 + 2]} />
      <group position={[0, M.hinge.y, 0]} rotation={[-TILT, 0, 0]} onClick={click}>
        <mesh geometry={s.barrel} material={mat.frame} position={[0, 4, -M.head.t / 2 + 2]} castShadow />
        <mesh geometry={s.back} material={mat.frame} castShadow receiveShadow />
        <mesh geometry={s.rim} material={mat.frame} castShadow receiveShadow />
        <mesh ref={glass} geometry={s.glass} material={mat.glass} receiveShadow />
      </group>
    </group>
  )
}

// ---- live
export function LiveJewelryStand({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const perch = usePerch({
    key: 'jewelry-stand',
    label: 'Return jewellery stand',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0,
    away: 150,
    lift: S.base.h + S.panel.h + 40,
  })
  const P = S.panel
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <JewelryStandModel />
        </group>
        <CuboidCollider args={[S.base.w / 2, S.base.h / 2, S.base.d / 2]} position={[0, S.base.h / 2, 0]} mass={S.mass * 0.45} friction={0.8} collisionGroups={ITEM} />
        <CuboidCollider args={[P.w / 2, P.h / 2, 6]} position={[0, S.base.h + P.h / 2, P.z + 4]} mass={S.mass * 0.55} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

export function LiveMirror({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const [on, setOn] = useState(true)
  const perch = usePerch({
    key: 'vanity-mirror',
    label: 'Return mirror',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0,
    away: 150,
    lift: M.hinge.y + M.head.h + 40,
  })
  const H = M.head
  const mid = new Vector3(0, H.h / 2, 0).applyAxisAngle(new Vector3(1, 0, 0), -TILT).add(new Vector3(0, M.hinge.y, 0))
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <MirrorModel on={on} onToggle={() => setOn((o) => !o)} />
        </group>
        <CuboidCollider args={[M.base.w / 2, M.base.h / 2, M.base.d / 2]} position={[0, M.base.h / 2, 0]} mass={M.mass.base} friction={0.8} collisionGroups={ITEM} />
        <CuboidCollider args={[M.neck.w / 2, (M.hinge.y - M.base.h) / 2, M.neck.d / 2]} position={[0, (M.hinge.y + M.base.h) / 2, -H.t / 2 + 2]} mass={0.02} friction={0.8} collisionGroups={ITEM} />
        <CuboidCollider args={[H.w / 2, H.h / 2, H.t / 2]} position={mid.toArray()} rotation={[-TILT, 0, 0]} mass={M.mass.head} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
