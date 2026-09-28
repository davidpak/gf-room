import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, CylinderGeometry, ExtrudeGeometry, LatheGeometry, SRGBColorSpace, Shape, Vector2, type BufferGeometry, type Group, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { CIVIC, TOY } from './spec'

/**
 * David's car, the 2016 Civic LX sedan (./spec), as a toy in the Quad's light (./quad/bruno).
 *
 * Built in real millimetres from its side profile (the hood, the beltline, the deck, the roofline, the
 * sills and wheel arches: functions of s, the distance back from the front bumper), each piece a slice
 * of that profile extruded across the car:
 *
 *   the core      the body's middle, hollow where it should be: the cabin (a floor, the dash in front,
 *                 the rear seat's back behind) and the trunk's well
 *   the skins     the sides, in pieces cut where the panels are: the front fenders, the four doors, the
 *                 rear quarters. The doors hinge at their front edges and swing open
 *   the greenhouse  set in from the sides (they lean in): the roof, the pillars, the windshield and the
 *                 rear glass. Each door carries its own window and frame
 *   the trunk lid the deck and the plate panel under it, hinged at the rear glass: it lifts
 *   the details   headlights, the chrome wing across the grille, the H, the C-shaped tail lights, mirrors,
 *                 handles, the Washington plates (BTD2709) front and back, the LX's 16-inch wheel covers
 *
 * Click a door or the trunk to open it, again to shut it (`openings`; the car shuts its doors when it
 * drives off). Frame: +z forward (the front bumper at +length/2), +y up, the ground at 0; the whole
 * thing scaled to the toy (TOY) by <Civic>.
 */
const C = CIVIC
const L = C.length
const W = C.width
const SKIN = 60 // (how thick the side panels are)
const GAP = 6 // (the shut lines between panels)
const LIFT = C.tyre.r * TOY.wheel - C.tyre.r // (the toy's bigger tyres raise the body this much)
export const WHEEL_R = C.tyre.r * TOY.wheel

// ---- the profile
/** y along a curve through points (s, y): smooth (Catmull-Rom) between them */
function curve(pts: number[][], s: number) {
  if (s <= pts[0][0]) return pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, y0] = pts[i]
    const [s1, y1] = pts[i + 1]
    if (s > s1) continue
    if (s1 === s0) return y1
    const t = (s - s0) / (s1 - s0)
    const ym = pts[i - 1]?.[1] ?? y0 - (y1 - y0)
    const yp = pts[i + 2]?.[1] ?? y1 + (y1 - y0)
    const m0 = (y1 - ym) / 2
    const m1 = (yp - y0) / 2
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1
  }
  return pts[pts.length - 1][1]
}
/** the lower body's top edge: the hood, the beltline, the deck */
const top = (s: number) => (s <= 1520 ? curve(C.hood, s) : s <= 3960 ? curve(C.belt, s) : curve(C.deck.slice(0, 5), Math.min(s, 4630)))
/** the greenhouse's top: windshield, roof, rear glass */
const roof = (s: number) => curve(C.roof, s)
/** the underside: the chin, the sills, the rear bumper, round the wheel arches */
function bottom(s: number) {
  let y = C.rocker
  if (s < 300) y = 330 - (130 * s) / 300
  if (s > 4380) y = C.rocker + (220 * (s - 4380)) / 250
  for (const a of [C.axle.front, C.axle.rear]) {
    const d = s - a
    if (Math.abs(d) < C.arch.r) y = Math.max(y, C.tyre.r + Math.sqrt(C.arch.r * C.arch.r - d * d))
  }
  return y
}
/** the core's top: the lower body's, but hollow for the cabin and the trunk's well */
function coreTop(s: number) {
  if (s > C.cabin.dash && s < C.cabin.back) return C.cabin.floor
  if (s > C.trunk.s0 + 20 && s < C.trunk.s1 - 10) return C.trunk.floor
  if (s >= C.trunk.s1 - 10) return 790 // (under the lid's plate panel)
  return top(s)
}
const Z = (s: number) => L / 2 - s // (s back from the front → z, forward +)

/** a slice of the profile between s0 and s1, top and bottom edges given, as a shape (z, y) */
function slice(s0: number, s1: number, topFn: (s: number) => number, botFn: (s: number) => number, step = 20) {
  const sh = new Shape()
  const n = Math.max(2, Math.ceil((s1 - s0) / step))
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n
    i ? sh.lineTo(Z(s), topFn(s)) : sh.moveTo(Z(s), topFn(s))
  }
  for (let i = n; i >= 0; i--) {
    const s = s0 + ((s1 - s0) * i) / n
    sh.lineTo(Z(s), botFn(s))
  }
  sh.closePath()
  return sh
}
/** a shape through points (s, y) */
function poly(pts: [number, number][]) {
  const sh = new Shape()
  pts.forEach(([s, y], i) => (i ? sh.lineTo(Z(s), y) : sh.moveTo(Z(s), y)))
  sh.closePath()
  return sh
}
/** a shape extruded across the car: `depth` thick, its middle at x = xc; bevelled round its edges */
function slab(sh: Shape, depth: number, xc: number, bevel = 0): BufferGeometry {
  const g = new ExtrudeGeometry(sh, { depth: depth - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 8 })
  g.translate(0, 0, bevel)
  g.rotateY(-Math.PI / 2) // (the shape's z along the car, its depth across)
  g.translate(depth / 2 + xc, 0, 0)
  return pinch(g)
}
/** the body seen from above isn't square: it draws in toward the nose and a little toward the tail
 *  (its corners rounded), and a touch toward the top (the shoulders) */
export function narrowAt(s: number, y: number) {
  const nose = Math.max(0, 1 - s / 520)
  const tail = Math.max(0, (s - (L - 320)) / 320)
  return 1 - nose * nose * 0.14 - tail * tail * 0.06 - Math.min(1, Math.max(0, (y - 760) / 500)) * 0.03
}
function pinch(g: BufferGeometry) {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * narrowAt(L / 2 - p.getZ(i), p.getY(i)))
  g.computeVertexNormals()
  return g
}

// ---- materials
const PAINT = bruno({ color: '#25262f', shade: '#3b3758', sheen: 0.26 }) // (Crystal Black Pearl, lifted a touch, glossy: the toy's black)
const TRIM = bruno({ color: '#16161b' })
const GLASS = bruno({ color: '#6d7fa6', transparent: true, opacity: 0.5, depthWrite: false, sheen: 0.6 })
const INSIDE = bruno({ color: '#4a4852' })
const SEAT = bruno({ color: '#3a3842' })
const CHROME = bruno({ color: '#e4e7ee', shade: '#a9a6bd', emissive: '#ffffff', emissiveIntensity: 0.12, sheen: 0.3 })
const LENS = bruno({ color: '#aeb8c8', shade: '#8e93ad', sheen: 0.5 }) // (the clear headlight lens over its dark housing)
const LED = bruno({ color: '#ffffff', emissive: '#fff6e6', emissiveIntensity: 0.9, warm: 0 })
const TAIL = bruno({ color: '#b41e2c', emissive: '#ff3340', emissiveIntensity: 0.3, warm: 0 })
const TYRE = bruno({ color: '#2a2830' })
const RBOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.2)

// ---- the openings, shared (the car shuts its doors when it drives off: ./quad/Car)
export type Opening = 'fl' | 'fr' | 'rl' | 'rr' | 'trunk'
export const openings: Record<Opening, boolean> = { fl: false, fr: false, rl: false, rr: false, trunk: false }
export const shutDoors = () => void (['fl', 'fr', 'rl', 'rr'] as const).forEach((k) => (openings[k] = false))

/** a box, by its real-mm size and middle */
function Box({ size, at, m, rot }: { size: [number, number, number]; at: [number, number, number]; m: Material; rot?: [number, number, number] }) {
  return <mesh geometry={RBOX} material={m} position={at} rotation={rot} scale={size} castShadow receiveShadow />
}

// ---- the doors
type DoorKey = 'fl' | 'fr' | 'rl' | 'rr'
function doorShapes(d: { s0: number; s1: number; belt1: number }, front: boolean) {
  // the lower panel: from its front edge along the beltline to the rear edge's top, down to the sill,
  // back along the sill (round the rear arch for the rear door)
  const pts: [number, number][] = []
  const s0 = d.s0 + GAP / 2
  const b1 = d.belt1 - GAP / 2
  const s1 = d.s1 - GAP / 2
  for (let s = s0; s <= b1; s += 20) pts.push([s, top(s)])
  pts.push([b1, top(b1)])
  for (let s = s1; s >= s0; s -= 20) pts.push([s, bottom(s)])
  pts.push([s0, bottom(s0)])
  const panel = poly(pts)
  // the window: under the roofline between the pillars, over the beltline; its frame round it
  const w0 = front ? d.s0 + 60 : d.s0 + 40
  const w1 = front ? d.s1 - 40 : 3400
  const glassTop = (s: number) => roof(s) - 75
  const win = (inset: number) => {
    const sh = new Shape()
    const a = w0 + inset + (front ? 120 : 0)
    const b = w1 - inset
    const n = 24
    sh.moveTo(Z(a), top(a) + 18 + inset)
    for (let i = 0; i <= n; i++) {
      const s = a + ((b - a) * i) / n
      sh.lineTo(Z(s), Math.max(top(s) + 30, glassTop(s) - inset))
    }
    sh.lineTo(Z(b), top(b) + 18 + inset)
    sh.closePath()
    return sh
  }
  const frame = win(0)
  frame.holes.push(win(28))
  return { panel, frame, glass: win(24) }
}

function Door({ k, d, front }: { k: DoorKey; d: { s0: number; s1: number; belt1: number }; front: boolean }) {
  const left = k === 'fl' || k === 'rl' // (the driver's side, +x)
  const side = left ? 1 : -1
  const g = useMemo(() => {
    const sh = doorShapes(d, front)
    const hx = W / 2 // (the hinge line, the car's side)
    const gx = C.greenhouse.width / 2
    return {
      panel: slab(sh.panel, SKIN, side * (hx - SKIN / 2), 26),
      trim: slab(sh.panel, 10, side * (hx - SKIN - 5)), // (its inside, the door card)
      frame: slab(sh.frame, 30, side * (gx - 15), 6),
      glass: slab(sh.glass, 8, side * (gx - 12)),
    }
  }, [d, front, side])
  const hinge = useRef<Group>(null)
  const a = useRef(0)
  useFrame((_, dt) => {
    a.current += ((openings[k] ? 1 : 0) - a.current) * Math.min(1, dt * 5)
    if (hinge.current) hinge.current.rotation.y = -side * a.current * 1.1
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    openings[k] = !openings[k]
  }
  // hinged at its front edge: the group sits there, the door drawn back from it
  const hz = Z(d.s0)
  const hx = side * (W / 2)
  const handleS = front ? d.s1 - 230 : d.s1 - 170
  return (
    <group ref={hinge} position={[hx, 0, hz]}>
      <group position={[-hx, 0, -hz]} onClick={click} onPointerOver={pointer} onPointerOut={unpointer}>
        <mesh geometry={g.panel} material={PAINT} castShadow receiveShadow />
        <mesh geometry={g.trim} material={INSIDE} />
        <mesh geometry={g.frame} material={TRIM} castShadow />
        <mesh geometry={g.glass} material={GLASS} />
        {/* the handle, body colour */}
        <Box size={[22, 34, 150]} at={[side * (W / 2 + 8), top(handleS) - 70, Z(handleS)]} m={PAINT} />
        {front && (
          // the mirror, on its sail at the window's front corner
          <group position={[side * (W / 2 + 40), top(d.s0 + 180) + 60, Z(d.s0 + 180)]}>
            <Box size={[150, 110, 170]} at={[side * 40, 20, 0]} m={PAINT} rot={[0, side * 0.2, 0]} />
            <Box size={[60, 40, 70]} at={[-side * 30, -10, 10]} m={TRIM} />
          </group>
        )}
      </group>
    </group>
  )
}
const pointer = (e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation()
  document.body.style.cursor = 'pointer'
}
const unpointer = () => (document.body.style.cursor = '')

// ---- the trunk lid
function Trunk({ plate }: { plate: Material }) {
  const g = useMemo(() => {
    const t = C.trunk
    // the deck plate and the panel down the back to where the plate hangs, 40 thick
    const pts: [number, number][] = []
    for (let s = t.s0 + GAP; s <= 4600; s += 20) pts.push([s, top(s)])
    pts.push([4630, 1000], [4630, 800], [4590, 800])
    for (let s = 4590; s >= t.s0 + GAP; s -= 20) pts.push([s, top(s) - 40])
    const w = W - 2 * SKIN - GAP * 2
    return { lid: slab(poly(pts), w, 0, 10), w }
  }, [])
  const hinge = useRef<Group>(null)
  const a = useRef(0)
  useFrame((_, dt) => {
    a.current += ((openings.trunk ? 1 : 0) - a.current) * Math.min(1, dt * 4)
    if (hinge.current) hinge.current.rotation.x = a.current * 1.25
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    openings.trunk = !openings.trunk
  }
  const hz = Z(C.trunk.s0)
  const hy = top(C.trunk.s0)
  const back = Z(4630) - 3
  return (
    <group ref={hinge} position={[0, hy, hz]}>
      <group position={[0, -hy, -hz]} onClick={click} onPointerOver={pointer} onPointerOut={unpointer}>
        <mesh geometry={g.lid} material={PAINT} castShadow receiveShadow />
        {/* the inner halves of the tail lights, the H, the plate */}
        {[-1, 1].map((sx) => (
          <Box key={sx} size={[260, 70, 40]} at={[sx * (g.w / 2 - 140), 968, back + 8]} m={TAIL} />
        ))}
        <Box size={[90, 60, 14]} at={[0, 975, back - 2]} m={CHROME} />
        <mesh material={plate} position={[0, 880, back - 5]} rotation={[0, Math.PI, 0]}>
          <boxGeometry args={[C.plate.w, C.plate.h, 6]} />
        </mesh>
      </group>
    </group>
  )
}

// ---- the plate, the wheel covers: painted
function plateTexture() {
  const Wd = 610
  const Ht = 304
  const c = document.createElement('canvas')
  c.width = Wd
  c.height = Ht
  const g = c.getContext('2d')!
  g.fillStyle = '#f7f8fb'
  g.fillRect(0, 0, Wd, Ht)
  // Mt Rainier, pale blue, across its lower half
  g.fillStyle = '#bcd6ee'
  g.beginPath()
  g.moveTo(0, 250)
  g.lineTo(90, 200)
  g.lineTo(190, 170)
  g.lineTo(270, 118)
  g.lineTo(305, 104)
  g.lineTo(345, 122)
  g.lineTo(430, 170)
  g.lineTo(530, 196)
  g.lineTo(610, 215)
  g.lineTo(610, 304)
  g.lineTo(0, 304)
  g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(262, 124)
  g.lineTo(305, 104)
  g.lineTo(350, 125)
  g.lineTo(320, 135)
  g.lineTo(300, 128)
  g.lineTo(280, 138)
  g.fill()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#c8203a'
  g.font = '700 50px Georgia, "Times New Roman", serif'
  g.fillText('Washington', 250, 42)
  g.font = '700 30px Georgia, "Times New Roman", serif'
  g.fillText('EVERGREEN STATE', Wd / 2, 272)
  // the tabs: the month, the year
  g.fillStyle = '#d0453a'
  g.fillRect(470, 18, 52, 48)
  g.fillStyle = '#2f8a5a'
  g.fillRect(526, 18, 64, 48)
  g.fillStyle = '#ffffff'
  g.font = '700 28px Arial, sans-serif'
  g.fillText('9', 496, 43)
  g.font = '700 22px Arial, sans-serif'
  g.fillText('2026', 558, 43)
  // the number, deep blue
  g.fillStyle = '#1d2f7a'
  g.font = '800 150px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'
  g.save()
  g.translate(Wd / 2, 162)
  g.scale(0.82, 1)
  g.fillText(C.plate.text, 0, 0)
  g.restore()
  // the bolt holes, the pressed rim
  g.fillStyle = '#9aa0ab'
  for (const x of [150, 460]) {
    g.beginPath()
    g.arc(x, 24, 7, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = 'rgba(80,90,110,0.5)'
  g.lineWidth = 6
  g.strokeRect(6, 6, Wd - 12, Ht - 12)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
function coverTexture() {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const m = N / 2
  const face = g.createRadialGradient(m - 20, m - 30, 10, m, m, m)
  face.addColorStop(0, '#f1f3f6')
  face.addColorStop(1, '#a9aeb7')
  g.fillStyle = face
  g.beginPath()
  g.arc(m, m, m - 2, 0, Math.PI * 2)
  g.fill()
  // the LX cover's slots: ten, twisted a little, dark between spokes
  g.fillStyle = '#34363f'
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    g.beginPath()
    g.moveTo(m + Math.cos(a) * 44, m + Math.sin(a) * 44)
    g.lineTo(m + Math.cos(a + 0.36) * 104, m + Math.sin(a + 0.36) * 104)
    g.lineTo(m + Math.cos(a + 0.5) * 104, m + Math.sin(a + 0.5) * 104)
    g.lineTo(m + Math.cos(a + 0.2) * 44, m + Math.sin(a + 0.2) * 44)
    g.fill()
  }
  g.strokeStyle = '#8b909a'
  g.lineWidth = 6
  g.beginPath()
  g.arc(m, m, 112, 0, Math.PI * 2)
  g.stroke()
  // the centre cap, the H
  g.fillStyle = '#2b2d35'
  g.beginPath()
  g.arc(m, m, 32, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#e8eaef'
  g.fillRect(m - 14, m - 14, 7, 28)
  g.fillRect(m + 7, m - 14, 7, 28)
  g.fillRect(m - 8, m - 3, 16, 6)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const PLATE = typeof document !== 'undefined' ? bruno({ map: plateTexture(), emissive: '#ffffff', emissiveIntensity: 0.15 }) : TRIM
const COVER = typeof document !== 'undefined' ? bruno({ map: coverTexture(), shade: '#9794a8', sheen: 0.2 }) : CHROME

// ---- a wheel: the tyre (its section rounded), the cover on its outer face
const TYRE_GEO = (() => {
  const r = WHEEL_R
  const w = C.tyre.w
  const pts: Vector2[] = []
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI
    pts.push(new Vector2(r - 50 + Math.cos(a) * 50, (Math.sin(a) * w) / 2))
  }
  pts.unshift(new Vector2(r * 0.62, -w / 2))
  pts.push(new Vector2(r * 0.62, w / 2))
  const g = new LatheGeometry(pts, 28)
  g.rotateZ(Math.PI / 2) // (its axle across the car)
  return g
})()
const COVER_GEO = (() => {
  const g = new CylinderGeometry(WHEEL_R * 0.66, WHEEL_R * 0.66, 12, 28)
  g.rotateZ(Math.PI / 2)
  return g
})()
/** a wheel at the axle (x its side's outer face, +1 driver's side), for ./quad/Car to roll and steer */
export function CivicWheel({ side }: { side: 1 | -1 }) {
  return (
    <group>
      <mesh geometry={TYRE_GEO} material={TYRE} castShadow />
      <mesh geometry={COVER_GEO} material={[TRIM, COVER, COVER]} position={[(side * C.tyre.w) / 2 - side * 4, 0, 0]} rotation={[0, 0, 0]} />
    </group>
  )
}
/** where the wheels go (real mm, the car's frame): x, z, and whether it steers */
export const WHEELS = [
  { x: C.track.front / 2, z: Z(C.axle.front), front: true, side: 1 as const },
  { x: -C.track.front / 2, z: Z(C.axle.front), front: true, side: -1 as const },
  { x: C.track.rear / 2, z: Z(C.axle.rear), front: false, side: 1 as const },
  { x: -C.track.rear / 2, z: Z(C.axle.rear), front: false, side: -1 as const },
]

// ---- the body
export function CivicBody() {
  const g = useMemo(() => {
    const core = slab(slice(0, L, coreTop, bottom), W - 2 * SKIN + 2, 0, 70)
    const d = C.doors
    const fender = slice(0, d.front.s0 - GAP / 2, top, bottom)
    // the rear quarter: from the rear door's slanted edge back round the tail
    const q: [number, number][] = []
    for (let s = d.rear.belt1 + GAP / 2; s <= L; s += 20) q.push([s, top(s)])
    q.push([L, top(L)], [L, bottom(L)])
    for (let s = L; s >= d.rear.s1 + GAP / 2; s -= 20) q.push([s, bottom(s)])
    const quarter = poly(q)
    const skins: BufferGeometry[] = []
    for (const side of [1, -1]) {
      skins.push(slab(fender, SKIN, side * (W / 2 - SKIN / 2), 26))
      skins.push(slab(quarter, SKIN, side * (W / 2 - SKIN / 2), 26))
    }
    // the greenhouse: the roof, the pillars, the windshield and rear glass
    const gw = C.greenhouse.width
    const band = (s0: number, s1: number, th: number) => slice(s0, s1, roof, (s) => roof(s) - th)
    const roofPanel = slab(band(2230, 3520, 60), gw - 40, 0, 26)
    const windshield = slab(band(1530, 2250, 12), gw - 120, 0)
    const rearGlass = slab(band(3500, 3950, 12), gw - 260, 0)
    const pillars: BufferGeometry[] = []
    for (const side of [1, -1]) {
      pillars.push(slab(band(1530, 2260, 70), 70, side * (gw / 2 - 35), 10)) // A
      pillars.push(slab(band(3480, 3955, 90), 160, side * (gw / 2 - 80), 10)) // C
      pillars.push(slab(poly([[2690, top(2690) + 20], [2690, roof(2690) - 30], [2720, roof(2720) - 30], [2720, top(2720) + 20]]), 50, side * (gw / 2 - 30))) // B
    }
    return { core, skins, roofPanel, windshield, rearGlass, pillars }
  }, [])
  const plate = PLATE
  const front = Z(0)
  return (
    <group>
      <mesh geometry={g.core} material={PAINT} castShadow receiveShadow />
      {g.skins.map((s, i) => (
        <mesh key={i} geometry={s} material={PAINT} castShadow receiveShadow />
      ))}
      <mesh geometry={g.roofPanel} material={PAINT} castShadow receiveShadow />
      {g.pillars.map((s, i) => (
        <mesh key={i} geometry={s} material={i % 3 === 2 ? TRIM : PAINT} castShadow />
      ))}
      <mesh geometry={g.windshield} material={GLASS} />
      <mesh geometry={g.rearGlass} material={GLASS} />
      <Door k="fl" d={C.doors.front} front />
      <Door k="fr" d={C.doors.front} front />
      <Door k="rl" d={C.doors.rear} front={false} />
      <Door k="rr" d={C.doors.rear} front={false} />
      <Trunk plate={plate} />
      {/* the front: headlights at the corners, the chrome wing between them over the grille, the H,
          the lower intake, the plate */}
      {[-1, 1].map((sx) => (
        // (swept back round the corner, following the hood's rise)
        <group key={sx} position={[sx * (W / 2 - 260) * narrowAt(160, 700), 705, front - 130]} rotation={[0.22, sx * 0.34, 0]}>
          <Box size={[500, 76, 110]} at={[0, 0, 0]} m={LENS} />
          <Box size={[470, 12, 12]} at={[0, -30, 56]} m={LED} />
          <Box size={[140, 46, 16]} at={[sx * -140, 6, 52]} m={TRIM} />
        </group>
      ))}
      <Box size={[860, 40, 40]} at={[0, 668, front + 4]} m={CHROME} />
      <Box size={[760, 160, 30]} at={[0, 540, front]} m={TRIM} />
      <Box size={[90, 60, 14]} at={[0, 660, front + 26]} m={CHROME} />
      <Box size={[1180, 90, 30]} at={[0, 330, front + 12]} m={TRIM} />
      <mesh material={plate} position={[0, 395, front + 30]}>
        <boxGeometry args={[C.plate.w, C.plate.h, 6]} />
      </mesh>
      {/* the back: the outer halves of the C-shaped tail lights, wrapping the corners; reflectors low */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Box size={[330, 110, 170]} at={[sx * (W / 2 - 165), 955, Z(4545)]} m={TAIL} />
          <Box size={[60, 40, 14]} at={[sx * (W / 2 - 150), 470, Z(L) - 4]} m={TAIL} />
        </group>
      ))}
      {/* inside: the dash, the steering wheel (the driver's side, +x), the seats, the console */}
      <Box size={[W - 2 * SKIN - 40, 200, 300]} at={[0, 850, Z(1760)]} m={INSIDE} />
      <mesh material={TRIM} position={[W * 0.22, 880, Z(1930)]} rotation={[0.35, 0, 0]}>
        <torusGeometry args={[170, 22, 8, 24]} />
      </mesh>
      {[1, -1].map((sx) => (
        <group key={sx} position={[sx * W * 0.22, 0, Z(2400)]}>
          <Box size={[480, 110, 520]} at={[0, C.cabin.floor + 120, 0]} m={SEAT} />
          <Box size={[470, 560, 110]} at={[0, C.cabin.floor + 430, -270]} rot={[-0.18, 0, 0]} m={SEAT} />
          <Box size={[260, 170, 90]} at={[0, C.cabin.floor + 780, -330]} rot={[-0.18, 0, 0]} m={SEAT} />
        </group>
      ))}
      <Box size={[200, 180, 700]} at={[0, C.cabin.floor + 90, Z(2350)]} m={INSIDE} />
      <Box size={[W - 2 * SKIN - 60, 120, 480]} at={[0, C.cabin.floor + 120, Z(3160)]} m={SEAT} />
      <Box size={[W - 2 * SKIN - 60, 520, 110]} at={[0, C.cabin.floor + 420, Z(3390)]} rot={[-0.22, 0, 0]} m={SEAT} />
    </group>
  )
}

/** the whole car, the toy: body raised on its bigger tyres, scaled; wheels in place (still) */
export function Civic() {
  return (
    <group scale={[TOY.k * TOY.wide, TOY.k, TOY.k]}>
      <group position={[0, LIFT, 0]}>
        <CivicBody />
      </group>
      {WHEELS.map((w, i) => (
        <group key={i} position={[w.x, WHEEL_R, w.z]}>
          <CivicWheel side={w.side} />
        </group>
      ))}
    </group>
  )
}
