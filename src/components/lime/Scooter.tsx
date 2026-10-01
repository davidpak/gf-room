import { useMemo, type ReactNode } from 'react'
import { DoubleSide, Quaternion, Vector3, type BufferGeometry, type Material } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from '../picnic/paint'
import { bar, box, capsule, carve, coarse, cylinder, mesh, slab, smax, sphere, union, type Sdf } from '../../lib/sdf/sdf'
import { ARMS, AX, BARS, BATTERY, BEAM, DECK, HEAD, HOOD, LOOK, STEER_TOP, STEM, WHEELS } from './scooterSpec'

/**
 * Lime's Gen4 scooter (./scooterSpec), in real millimetres, sculpted (../../lib/sdf): every part a moulded shape
 * whose pieces flow into each other with fillets: the grey frame (the broad beam down from the head into the low
 * deck, the arms back to the rear axle) with "Lime" down its sides and the slice on its front, the battery
 * standing behind the beam with its handle, the black hood over the rear hub motor with its tail light and plate,
 * the green stem with its collars and the lens on its front, the smooth green bar on it (the QR code on its plate, the
 * screen with the lime that shows the battery, the headlight in its front) and its arms out to the black grips, the suspended fork, the front fender, 12" and 10" balloon tyres, the grip pad on the deck.
 *
 * `steer` turns the front round the steering axis (+ to its left), `spin` the wheels; `battery` (0..1) colours the
 * lime on its screen (green, yellow, red).
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
/** the pod's top, as it's seen from the deck (its front up the canvas, its right to the right), for each battery
 *  colour: the black screen (the lime, the status icons), the QR code on its plate at the rider's end */
const HEAD_TOP = { x0: -50, x1: 30, z: 30 } // (from the steering axis at the bar, mm)
const headTop = (lime: string) =>
  paint(228, 348, (g) => {
    const r = rng(9)
    g.fillStyle = LOOK.green
    g.fillRect(0, 0, 228, 348)
    // the screen: a black glass oval, round at its front, the lime on it in the battery's colour
    g.fillStyle = '#121215'
    g.beginPath()
    g.moveTo(40, 226)
    g.lineTo(40, 112)
    g.arc(114, 112, 74, Math.PI, 0)
    g.lineTo(188, 226)
    g.quadraticCurveTo(188, 248, 166, 248)
    g.lineTo(62, 248)
    g.quadraticCurveTo(40, 248, 40, 226)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.fillRect(48, 70, 36, 170)
    g.strokeStyle = lime
    g.fillStyle = lime
    g.lineWidth = 8
    g.beginPath()
    g.arc(114, 150, 52, 0, Math.PI * 2)
    g.stroke()
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + 0.15
      const a1 = ((i + 1) / 6) * Math.PI * 2 - 0.15
      g.beginPath()
      g.moveTo(114 + Math.cos((a0 + a1) / 2) * 8, 150 + Math.sin((a0 + a1) / 2) * 8)
      g.arc(114, 150, 40, a0, a1)
      g.closePath()
      g.fill()
    }
    // the QR code on its steel plate, at the rider's end
    g.fillStyle = '#cfd3d8'
    g.beginPath()
    g.roundRect(74, 262, 80, 72, 8)
    g.fill()
    g.fillStyle = '#f2f2ee'
    g.fillRect(88, 270, 52, 52)
    g.fillStyle = '#1b1b1f'
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (r() < 0.5) g.fillRect(91 + x * 5, 273 + y * 5, 5, 5)
    for (const [x, y] of [
      [91, 273],
      [122, 273],
      [91, 304],
    ]) {
      g.fillStyle = '#1b1b1f'
      g.fillRect(x, y, 14, 14)
      g.fillStyle = '#f2f2ee'
      g.fillRect(x + 3, y + 3, 8, 8)
      g.fillStyle = '#1b1b1f'
      g.fillRect(x + 5, y + 5, 4, 4)
    }
  })
/** the battery's colour on the screen: green, yellow, red */
const BATTERY_COLOURS = ['#39d52a', '#f2cf2a', '#e8463c']
const headMats = BATTERY_COLOURS.map((c) => bruno({ map: headTop(c) ?? undefined, color: '#ffffff', shade: '#3d7a58', sheen: 0.4, lit: 1.1 }))
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
const made: Record<number, Built> = {}
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
    ...STEM.collars.map(([a, b]) => cylinder(axis(a), axis(b), STEM.r + 6, 6)),
    capsule([axis(760)[0] + 12, 760, 0], [axis(800)[0] + 12, 800, 0], STEM.r - 2),
  )
  const stem = mesh(stemSdf, [760, 570, -60], [1000, 1110, 60], 3.5)
  // the head: the stem flaring up and forward into a wedge under the bar (the headlight in its face), a small
  // pod on the bar's top (the screen, the QR code), the bar one smooth arc swept gently back to the black grips,
  // the brake levers lying in front of the grips
  const cx = axis(BARS.y)[0]
  const zEnd = BARS.half - BARS.grip
  /** the bar's line: x back by the square of how far out it is (so it leaves the head straight across) */
  const barAt = (s: number, t: number): V3 => [cx + 4 - BARS.sweep * t * t, BARS.y - 3 * t * t, s * zEnd * t]
  const tip = (s: number) => {
    const p = barAt(s, 1)
    const d = new Vector3(-2 * BARS.sweep, 0, s * zEnd).normalize()
    const fwd = s > 0 ? new Vector3(d.z, 0, -d.x) : new Vector3(-d.z, 0, d.x)
    return { p, d, fwd }
  }
  const barSdf = union(
    16,
    cylinder(axis(BARS.y - 140), axis(BARS.y - 30), STEM.r + 1, 6),
    box([cx + 12, BARS.y - 26, 0], [32, 30, 46], 16, 0.22),
    box([cx - 8, BARS.y + 4, 0], [38, 13, 29], 12),
    ...[-1, 1].flatMap((s) => Array.from({ length: 12 }, (_, i) => capsule(barAt(s, i / 12), barAt(s, (i + 1) / 12), 17.5 - 2.5 * (i / 12)))),
  )
  const bars = mesh(barSdf, [cx - 100, BARS.y - 160, -BARS.half + 80], [cx + 70, BARS.y + 30, BARS.half - 80], 3, (p) => {
    const v = (p.x - cx - HEAD_TOP.x0) / (HEAD_TOP.x1 - HEAD_TOP.x0)
    return [Math.min(1, Math.max(0, (p.z + HEAD_TOP.z) / (2 * HEAD_TOP.z))), p.y > BARS.y + 13 ? Math.min(1, Math.max(0, v)) : 0]
  })
  const at = (p: V3, d: Vector3, a: number, fwd: Vector3, b: number, dy: number): V3 => [p[0] + d.x * a + fwd.x * b, p[1] + dy, p[2] + d.z * a + fwd.z * b]
  const grips = mesh(
    union(
      5,
      ...[-1, 1].map((s) => {
        const { p, d } = tip(s)
        return cylinder([p[0] - d.x * 4, p[1], p[2] - d.z * 4], [p[0] + d.x * BARS.grip, p[1], p[2] + d.z * BARS.grip], 18, 6)
      }),
      // the brake levers: a clamp at the grip's inner end, its blade lying along in front of the grip, its end turned down
      ...[-1, 1].flatMap((s) => {
        const { p, d, fwd } = tip(s)
        return [
          box(at(p, d, 4, fwd, 12, 2), [18, 18, 16], 7),
          capsule(at(p, d, 10, fwd, 26, -2), at(p, d, 88, fwd, 34, -8), 5.5),
          capsule(at(p, d, 88, fwd, 34, -8), at(p, d, 100, fwd, 30, -20), 5),
        ]
      }),
    ),
    [cx - 220, BARS.y - 50, -BARS.half - 40],
    [cx + 80, BARS.y + 30, BARS.half + 40],
    3,
  )
  // the headlight: a rounded lens in the wedge's face; the stem boss's lens
  const lamp = mesh(union(0, box([cx + 44, BARS.y - 22, 0], [4, 13, 21], 5, 0.22), sphere([axis(780)[0] + 12 + STEM.r - 4, 780, 0], 8)), [cx + 20, 760, -30], [cx + 60, BARS.y + 10, 30], 1.5)
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
  return { frame, battery, hood, stem, bars, grips, lamp, fork, stanchions, fender, front, rear, pad, kick }
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

export function Scooter({ steer = 0, spin = 0, battery = 0.8, detail = 1 }: { steer?: number; spin?: number; battery?: number; /** 2: half as fine (seen small, in the Quad) */ detail?: number }) {
  const g = useMemo(() => (made[detail] ??= coarse(detail, build)), [detail])
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
        {m(g.bars, headMats[battery > 0.5 ? 0 : battery > 0.2 ? 1 : 2])}
        {m(g.grips, M.rubber)}
        {m(g.lamp, M.lens, false)}
      </Steered>
    </group>
  )
}
