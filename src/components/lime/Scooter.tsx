import { useMemo, type ReactNode } from 'react'
import { DoubleSide, Quaternion, Vector3, type BufferGeometry, type Material } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from '../picnic/paint'
import { bar, box, capsule, carve, cylinder, mesh, slab, smax, sphere, union, type Sdf } from '../../lib/sdf/sdf'
import { ARMS, AX, BARS, BATTERY, BEAM, DECK, HEAD, HOOD, LOOK, STEER_TOP, STEM, STEM_BOX, WHEELS } from './scooterSpec'

/**
 * Lime's Gen4 scooter (./scooterSpec), in real millimetres, sculpted (../../lib/sdf): every part a moulded shape
 * whose pieces flow into each other with fillets: the grey frame (the broad beam down from the head into the low
 * deck, the arms back to the rear axle) with "Lime" down its sides and the slice on its front, the battery
 * standing behind the beam with its handle, the black hood over the rear hub motor with its tail light and plate,
 * the green stem with its collars and the box on its front, the swept-back bars with their grips, levers and the
 * display, the suspended fork, the front fender, 12" and 10" balloon tyres, the grip pad on the deck.
 *
 * `steer` turns the front round the steering axis (+ to its left), `spin` the wheels.
 *
 * Its frame: x forward, y up, z to its right; the ground at y = 0, the rear axle at x = 0.
 */
type V3 = [number, number, number]
const A = AX.front
const T = STEER_TOP
/** the point on the steering axis at height y */
const axis = (y: number, z = 0): V3 => [A[0] + ((y - A[1]) * (T[0] - A[0])) / (T[1] - A[1]), y, z]

const M = {
  grey: bruno({ color: LOOK.grey, shade: '#69728a', sheen: 0.45 }),
  green: bruno({ color: LOOK.green, shade: '#3d7a58', sheen: 0.4, lit: 1.1 }),
  black: bruno({ color: LOOK.black, shade: '#1b1a20' }),
  rubber: bruno({ color: '#222125', shade: '#141317' }),
  chrome: bruno({ color: '#e4e6ea', shade: '#8d93a3', sheen: 0.9 }),
  red: bruno({ color: '#d8323c', shade: '#7a2434', lit: 1.4 }),
  amber: bruno({ color: '#f2a23a', shade: '#9a6a4a', lit: 1.3 }),
  lens: bruno({ color: '#f4f6f2', shade: '#b8bcc6', lit: 1.4 }),
}
const FONT = "'Nunito', 'Arial Rounded MT Bold', sans-serif"

// ---- the frame's paint: "Lime" down each side of the beam (reading the right way from each side), the slice on
// its front; laid on by where each point faces (its right side, its left, its front)
const FX0 = -110
const FX1 = 1070
const FY0 = 50
const FY1 = 610
const FW = FX1 - FX0
const FH = FY1 - FY0
const frameTex = paint(FW * 3, FH, (g) => {
  g.fillStyle = LOOK.grey
  g.fillRect(0, 0, FW * 3, FH)
  // (a point on the beam, in a side's canvas: the right side (0) seen with its front to the right, the left (1)
  // with its front to the left)
  const c = (side: number, x: number, y: number): [number, number] => [side * FW + (side ? FX1 - x : x - FX0), FY1 - y]
  const mid: [number, number] = [838, 282]
  const along: [number, number] = [-0.62, -0.78] // (down the beam)
  for (const side of [0, 1]) {
    const [ax, ay] = c(side, mid[0] - along[0] * 100, mid[1] - along[1] * 100)
    const [bx, by] = c(side, mid[0] + along[0] * 100, mid[1] + along[1] * 100)
    // (read left to right as it's seen: down the beam on the left side, up it on the right)
    const ang = bx > ax ? Math.atan2(by - ay, bx - ax) : Math.atan2(ay - by, ax - bx)
    const [mx, my] = c(side, mid[0], mid[1])
    g.save()
    g.translate(mx, my)
    g.rotate(ang)
    g.fillStyle = LOOK.green
    g.font = `900 92px ${FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('Lime', 0, 0)
    g.restore()
  }
  // the slice on its front, under the headlight (the front region: across is z, up is y)
  const fx = 2 * FW + FW / 2
  const fy = FY1 - 470
  g.strokeStyle = LOOK.green
  g.fillStyle = LOOK.green
  g.lineWidth = 5
  g.beginPath()
  g.arc(fx, fy, 24, 0, Math.PI * 2)
  g.stroke()
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.12
    const a1 = ((i + 1) / 6) * Math.PI * 2 - 0.12
    g.beginPath()
    g.moveTo(fx + Math.cos((a0 + a1) / 2) * 4, fy + Math.sin((a0 + a1) / 2) * 4)
    g.arc(fx, fy, 18, a0, a1)
    g.closePath()
    g.fill()
  }
})
/** which part of the frame's paint a point takes (by where it faces) */
const frameUV = (p: Vector3, n: Vector3): [number, number] => {
  const v = (p.y - FY0) / FH
  if (n.z > 0.45) return [(p.x - FX0) / FW / 3, v]
  if (n.z < -0.45) return [(1 + (FX1 - p.x) / FW) / 3, v]
  if (n.x > 0.55) return [(2 + 0.5 + p.z / FW) / 3, v]
  return [0.001, 0.001]
}
const frameMat = bruno({ map: frameTex ?? undefined, color: '#ffffff', shade: '#69728a', sheen: 0.45 })

// the deck's grip pad: black, a fine pattern, the slice and "Lime" along it
const padTex = paint(1024, 256, (g) => {
  const r = rng(3)
  g.fillStyle = '#2a292e'
  g.fillRect(0, 0, 1024, 256)
  for (let y = 8; y < 256; y += 14)
    for (let x = (y / 14) % 2 ? 7 : 0; x < 1024; x += 14) {
      g.fillStyle = `rgba(80,80,88,${0.5 + r() * 0.2})`
      g.beginPath()
      g.arc(x, y, 3, 0, Math.PI * 2)
      g.fill()
    }
  // (seen from its left, its front to the left: the slice, then the word)
  const cx = 250
  const cy = 128
  g.fillStyle = '#2a292e'
  g.fillRect(150, 70, 560, 116)
  g.strokeStyle = '#9a9aa2'
  g.fillStyle = '#9a9aa2'
  g.lineWidth = 7
  g.beginPath()
  g.arc(cx, cy, 44, 0, Math.PI * 2)
  g.stroke()
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.12
    const a1 = ((i + 1) / 6) * Math.PI * 2 - 0.12
    g.beginPath()
    g.moveTo(cx + Math.cos((a0 + a1) / 2) * 7, cy + Math.sin((a0 + a1) / 2) * 7)
    g.arc(cx, cy, 33, a0, a1)
    g.closePath()
    g.fill()
  }
  g.font = `800 92px ${FONT}`
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillText('Lime', 330, 132)
})
const padMat = bruno({ map: padTex ?? undefined, color: '#ffffff', shade: '#18171c' })
const screenTex = paint(128, 128, (g) => {
  g.fillStyle = '#16161a'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#1f3b2a'
  g.beginPath()
  g.roundRect(24, 24, 80, 80, 12)
  g.fill()
  g.strokeStyle = LOOK.green
  g.fillStyle = LOOK.green
  g.lineWidth = 5
  g.beginPath()
  g.arc(64, 64, 26, 0, Math.PI * 2)
  g.stroke()
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.14
    const a1 = ((i + 1) / 6) * Math.PI * 2 - 0.14
    g.beginPath()
    g.moveTo(64, 64)
    g.arc(64, 64, 19, a0, a1)
    g.closePath()
    g.fill()
  }
})
const screenMat = bruno({ map: screenTex ?? undefined, color: '#ffffff', shade: '#16161a', lit: 1.2 })
const plateTex = paint(256, 128, (g) => {
  g.fillStyle = '#f2f2ee'
  g.fillRect(0, 0, 256, 128)
  g.fillStyle = '#1b1b1f'
  g.font = `900 52px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('Q4L-7MX', 128, 66)
})
const plateMat = bruno({ map: plateTex ?? undefined, color: '#ffffff', shade: '#a6a4ae', side: DoubleSide })

// ---- the parts, sculpted
/** a tyre round the z axis at c: a balloon section (its tread flattening, its walls rounded) */
function tyre(c: V3, od: number, w: number): Sdf {
  const R = od / 2 - w / 2
  return (x, y, z) => {
    const rad = Math.hypot(x - c[0], y - c[1]) - R
    const qz = Math.abs(z - c[2])
    const dx = Math.abs(rad) - w / 2 + w * 0.42
    const dz = qz - w / 2 + w * 0.42
    return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - w * 0.42
  }
}
/** a five-spoked wheel (its rim, five spokes, its hub) round the z axis at c */
function rim(c: V3, r: number, w: number): Sdf {
  const disc = cylinder([c[0], c[1], c[2] - w / 2], [c[0], c[1], c[2] + w / 2], r, 6)
  const windows: Sdf = (x, y, z) => {
    const dx = x - c[0]
    const dy = y - c[1]
    const rad = Math.hypot(dx, dy)
    let a = Math.atan2(dy, dx)
    const seg = (Math.PI * 2) / 5
    a = ((a % seg) + seg) % seg - seg / 2
    // (each window: between the hub and the rim, between two spokes, its corners rounded)
    const across = Math.abs(a) * rad - (rad * seg) / 2 + 13
    const radial = Math.abs(rad - (r * 0.58)) - r * 0.27
    return Math.max(across, radial, Math.abs(z - c[2]) - w)
  }
  return carve(disc, windows, 6)
}

type Built = ReturnType<typeof build>
let made: Built | null = null
function build() {
  const t0 = performance.now()
  // the frame: the beam down from the head into the deck, the head tube, the arms back to the rear axle
  const head = cylinder(axis(HEAD.lo), axis(HEAD.hi), HEAD.r, 8)
  const beam = slab(BEAM.pts, BEAM.w, 16, 0, 4)
  const deck = box([(DECK.x0 + DECK.x1) / 2, (DECK.top + DECK.bottom) / 2, 0], [(DECK.x1 - DECK.x0) / 2, (DECK.top - DECK.bottom) / 2, DECK.w / 2], 20)
  const arms = union(6, ...[-1, 1].map((s) => bar([ARMS.from[0], ARMS.from[1], s * ARMS.z], [ARMS.to[0], ARMS.to[1], s * ARMS.z], 40, 20, 8)))
  const cradle = cylinder([BATTERY.lo[0] - 10, BATTERY.lo[1] - 8, -46], [BATTERY.lo[0] - 10, BATTERY.lo[1] - 8, 46], 22, 6)
  const frameSdf = union(22, beam, head, deck, cradle, arms)
  const frame = mesh(frameSdf, [-120, 50, -110], [1075, 610, 110], 4.5, frameUV)
  // the battery: standing behind the beam, its handle over its top
  const bdx = BATTERY.hi[0] - BATTERY.lo[0]
  const bdy = BATTERY.hi[1] - BATTERY.lo[1]
  const bl = Math.hypot(bdx, bdy)
  const bu = [bdx / bl, bdy / bl]
  const bn = [-bu[1], bu[0]] // (out from the beam's back)
  const top: V3 = [BATTERY.hi[0], BATTERY.hi[1], 0]
  const handle = carve(
    bar([top[0] - bn[0] * 30 - bu[0] * 6, top[1] - bn[1] * 30 - bu[1] * 6, 0], [top[0] + bn[0] * 34 + bu[0] * 30, top[1] + bn[1] * 34 + bu[1] * 30, 0], 26, 60, 10),
    bar([top[0] - bn[0] * 4 + bu[0] * 2, top[1] - bn[1] * 4 + bu[1] * 2, 0], [top[0] + bn[0] * 16 + bu[0] * 14, top[1] + bn[1] * 16 + bu[1] * 14, 0], 12, 80, 5),
    4,
  )
  const batterySdf = union(8, bar([BATTERY.lo[0], BATTERY.lo[1], 0], [BATTERY.hi[0], BATTERY.hi[1], 0], BATTERY.t, BATTERY.w, 16), handle)
  const battery = mesh(batterySdf, [560, 120, -70], [900, 580, 70], 3.5)
  // the rear hood: over the wheel, down its sides; the wheel's room carved out of it; the tail light's housing
  const domeBase = cylinder([-14, 146, -HOOD.w / 2], [-14, 146, HOOD.w / 2], 188, 42)
  const dome: Sdf = (x, y, z) => smax(domeBase(x, y, z), 106 - y, 14)
  const hoodSdf = carve(dome, cylinder([0, AX.rear[1], -46], [0, AX.rear[1], 46], WHEELS.rear.od / 2 + 12, 10), 8)
  const hood = mesh(union(8, hoodSdf, box([-182, 236, 0], [18, 30, 48], 10)), [-215, 90, -80], [190, 350, 80], 3.5)
  // the stem: green, its collars, the box on its front
  const stemSdf = union(
    10,
    cylinder(axis(STEM.lo), axis(STEM.hi), STEM.r, 4),
    ...STEM.collars.map(([a, b]) => cylinder(axis(a), axis(b), STEM.r + 7, 6)),
    slab(STEM_BOX.pts, STEM_BOX.w, 16, 0, 6),
  )
  const stem = mesh(stemSdf, [760, 570, -60], [1000, 1110, 60], 3.5)
  // the bars: swept back from the clamp, the grips, the brake levers, the display on the clamp
  const cx = axis(BARS.y)[0]
  const barPts = (s: number): V3[] => [
    [cx, BARS.y, 0],
    [cx - 14, BARS.y, s * 110],
    [cx - 60, BARS.y - 2, s * 190],
    [cx - BARS.sweep * 0.7, BARS.y - 4, s * 240],
  ]
  const barSdf = union(
    10,
    ...[-1, 1].flatMap((s) => {
      const p = barPts(s)
      return [capsule(p[0], p[1], 14), capsule(p[1], p[2], 14), capsule(p[2], p[3], 14)]
    }),
    box([cx - 6, BARS.y + 8, 0], [34, 22, 46], 12),
    ...[-1, 1].map((s) => capsule([cx - 36, BARS.y + 2, s * 172], [cx - 88, BARS.y - 16, s * 296], 5)),
    ...[-1, 1].map((s) => box([cx - 46, BARS.y + 2, s * 170], [16, 20, 14], 6)),
  )
  const bars = mesh(barSdf, [cx - 160, BARS.y - 50, -310], [cx + 60, BARS.y + 50, 310], 3)
  const grips = mesh(
    union(4, ...[-1, 1].map((s) => cylinder([cx - BARS.sweep * 0.7, BARS.y - 4, s * 240], [cx - BARS.sweep * 0.7 - 50, BARS.y - 5, s * (240 + BARS.grip)], 17, 6))),
    [cx - 230, BARS.y - 40, -380],
    [cx - 60, BARS.y + 30, 380],
    3,
  )
  // the display: on the clamp, its screen up
  const display = mesh(box([cx + 4, BARS.y + 36, 0], [26, 8, 30], 6), [cx - 30, BARS.y + 20, -40], [cx + 40, BARS.y + 52, 40], 1.5, (p, n) => (n.y > 0.7 ? [(p.z + 28) / 56, (p.x - cx + 24) / 56] : [0.02, 0.02]))
  // the fork: its crown under the head, a leg each side down to the axle (grey sleeves over chrome)
  const crownY = HEAD.lo - 22
  const forkSdf = union(
    14,
    box([axis(crownY)[0], crownY, 0], [30, 20, 82], 12, Math.atan2(T[1] - A[1], T[0] - A[0]) - Math.PI / 2),
    ...[-1, 1].map((s) => cylinder(axis(crownY - 10, s * 56), axis(crownY - 70, s * 56), 15, 4)),
    ...[-1, 1].map((s) => cylinder(axis(crownY - 110, s * 58), axis(A[1] - 6, s * 58), 23, 9)),
    ...[-1, 1].map((s) => sphere([A[0], A[1], s * 58], 25)),
  )
  const fork = mesh(forkSdf, [A[0] - 120, A[1] - 40, -100], [A[0] + 60, crownY + 40, 100], 3.5)
  const stanchions = mesh(union(0, ...[-1, 1].map((s) => cylinder(axis(crownY - 70, s * 56), axis(crownY - 120, s * 56), 11, 2))), [A[0] - 120, crownY - 140, -80], [A[0] + 40, crownY - 50, 80], 2.5)
  // the front fender: a band over the wheel from its front round to its back
  const fr = WHEELS.front.od / 2 + 22
  const fenderSdf: Sdf = (x, y, z) => {
    const dx = x - A[0]
    const dy = y - A[1]
    const rad = Math.hypot(dx, dy)
    let a = (Math.atan2(dy, dx) * 180) / Math.PI
    if (a < -90) a += 360
    const band = Math.abs(rad - fr) - 5
    const across = Math.abs(z) - 38
    const ends = Math.max(55 - a, a - 192) * ((rad * Math.PI) / 180)
    return smax(smax(band, across, 4), ends, 4)
  }
  const fender = mesh(fenderSdf, [A[0] - fr - 20, A[1] - 60, -50], [A[0] + fr * 0.7, A[1] + fr + 20, 50], 3)
  // the wheels: balloon tyres, the front's five-spoke rim, the rear's hub motor
  const front = { tyre: mesh(tyre([0, 0, 0], WHEELS.front.od, WHEELS.front.w), [-160, -160, -40], [160, 160, 40], 3.5), rim: mesh(union(6, rim([0, 0, 0], 92, 34), cylinder([0, 0, -38], [0, 0, 38], 24, 6)), [-100, -100, -45], [100, 100, 45], 3) }
  const rear = { tyre: mesh(tyre([0, 0, 0], WHEELS.rear.od, WHEELS.rear.w), [-130, -130, -42], [130, 130, 42], 3.5), rim: mesh(union(8, cylinder([0, 0, -26], [0, 0, 26], 80, 10), cylinder([0, 0, -44], [0, 0, 44], 18, 4)), [-90, -90, -50], [90, 90, 50], 3) }
  // the deck's grip pad, its paint on top
  const pad = mesh(box([(DECK.x0 + DECK.x1) / 2 - 8, DECK.top + 1.5, 0], [(DECK.x1 - DECK.x0) / 2 - 30, 3, DECK.w / 2 - 16], 2.5), [DECK.x0, DECK.top - 6, -DECK.w / 2], [DECK.x1, DECK.top + 8, DECK.w / 2], 2.5, (p, n) => (n.y > 0.7 ? [(DECK.x1 - p.x - 20) / (DECK.x1 - DECK.x0 - 50), (p.z + DECK.w / 2) / DECK.w] : [0.002, 0.002]))
  // the kickstand: folded up under the deck on its left
  const kick = mesh(union(6, capsule([520, DECK.bottom - 8, -62], [330, DECK.bottom - 12, -70], 9), sphere([520, DECK.bottom - 8, -62], 13)), [300, DECK.bottom - 40, -100], [560, DECK.bottom + 20, -30], 3)
  console.info(`scooter sculpted in ${Math.round(performance.now() - t0)} ms`)
  return { frame, battery, hood, stem, bars, grips, display, fork, stanchions, fender, front, rear, pad, kick }
}

/** the front (fork, wheel, fender, stem, bars) turned round the steering axis */
const AXIS = new Vector3(T[0] - A[0], T[1] - A[1], 0).normalize()
const ALIGN = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), AXIS)
const UNALIGN = ALIGN.clone().invert()
function Steered({ angle, children }: { angle: number; children: ReactNode }) {
  return (
    <group position={[A[0], A[1], 0]} quaternion={ALIGN}>
      <group rotation={[0, angle, 0]}>
        <group quaternion={UNALIGN}>
          <group position={[-A[0], -A[1], 0]}>{children}</group>
        </group>
      </group>
    </group>
  )
}

export function Scooter({ steer = 0, spin = 0 }: { steer?: number; spin?: number }) {
  const g = useMemo(() => (made ??= build()), [])
  const m = (geo: BufferGeometry, mat: Material, shadow = true) => <mesh geometry={geo} material={mat} castShadow={shadow} receiveShadow />
  return (
    <group>
      {m(g.frame, frameMat)}
      {m(g.battery, M.grey)}
      {m(g.hood, M.black)}
      {m(g.pad, padMat)}
      {m(g.kick, M.black)}
      {/* its lights: the tail light, the plate under it; the headlight and the amber signals on the head */}
      <mesh material={M.red} position={[-200, 240, 0]}>
        <boxGeometry args={[4, 30, 72]} />
      </mesh>
      <mesh material={plateMat} position={[-206, 168, 0]} rotation={[0, -Math.PI / 2, 0.35]}>
        <planeGeometry args={[110, 56]} />
      </mesh>
      <group position={[1010, 522, 0]} rotation={[0, 0, -Math.PI / 2 + 0.2]}>
        <mesh material={M.chrome} position={[0, 6, 0]}>
          <cylinderGeometry args={[22, 25, 18, 24]} />
        </mesh>
        <mesh material={M.lens} position={[0, 15.5, 0]}>
          <cylinderGeometry args={[16, 16, 4, 24]} />
        </mesh>
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} material={M.amber} position={[axis(592)[0] + 6, 592, s * (HEAD.r + 2)]}>
          <boxGeometry args={[18, 24, 8]} />
        </mesh>
      ))}
      {/* the rear wheel */}
      <group position={[AX.rear[0], AX.rear[1], 0]} rotation={[0, 0, -spin]}>
        {m(g.rear.tyre, M.rubber)}
        {m(g.rear.rim, M.black)}
      </group>
      <Steered angle={steer}>
        {m(g.fork, M.grey)}
        {m(g.stanchions, M.chrome)}
        {m(g.fender, M.black)}
        <group position={[A[0], A[1], 0]} rotation={[0, 0, -spin * (WHEELS.rear.od / WHEELS.front.od)]}>
          {m(g.front.tyre, M.rubber)}
          {m(g.front.rim, M.black)}
        </group>
        {m(g.stem, M.green)}
        {m(g.bars, M.black)}
        {m(g.grips, M.rubber)}
        {m(g.display, screenMat)}
      </Steered>
    </group>
  )
}
