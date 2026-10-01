import { useLayoutEffect, useMemo, useRef, type ReactNode, type Ref } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, ExtrudeGeometry, Quaternion, Shape, TorusGeometry, Vector2, Vector3, type Group, type Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bruno } from '../quad/bruno'
import { paint, rng } from '../picnic/paint'
import { AXLE, BAR, BASKET, DECK, FENDER, FOOTBOARD, HANDLE, HOUSING, KICKSTAND, LOOK, SEAT, SEAT_POST, SPINE, SPINE_SIZE, STAY, STEER, STEM, WHEEL } from './spec'

/**
 * The LimeGlider (./spec), in real millimetres, the toy look: its lime green frame (the down tube swooping from
 * the head into the low rail, a green stay up to the seat), the black housing under the big padded seat
 * ("LimeGlider · 100% Electric", its plate), the rear deck and fender with the window in its skirts, its tail
 * light; 20" spoked wheels (the front its hub motor), the footboards either side, the kickstand; the black
 * basket on the head with Lime's slice on it; the T bar with its display, QR code and phone channel, its grips,
 * levers and the green GO throttle.
 *
 * `steer` turns the front (fork, wheel, bars, basket) round the steering axis (radians, + to its left); `spin`
 * turns the wheels (radians); `stand` 1 has the kickstand down, 0 up.
 *
 * Its frame: x forward, y up, z to its right; the ground at y = 0, the rear axle at x = 0.
 */
const M = {
  green: bruno({ color: LOOK.green, shade: '#4f9a62', sheen: 0.35, lit: 1.15 }),
  black: bruno({ color: LOOK.black, shade: '#1d1c22' }),
  plastic: bruno({ color: '#2f2e34', shade: '#1e1d24', side: DoubleSide }),
  rubber: bruno({ color: LOOK.rubber, shade: '#161519' }),
  seat: bruno({ color: '#3a393f', shade: '#222128', sheen: 0.25 }),
  metal: bruno({ color: '#c7cbd2', shade: '#7c8494', sheen: 0.7 }),
  spoke: bruno({ color: '#4a4b52', shade: '#2a2a30' }),
  stripe: bruno({ color: '#f2f2ee', shade: '#a9a7b2' }),
  red: bruno({ color: '#e0343c', shade: '#8a2a3a', lit: 1.3 }),
}
const V = (p: [number, number], z = 0) => new Vector3(p[0], p[1], z)

// ---- shapes
/** a tube along a path whose section (half sizes across: in its plane, and z; how square) changes along it;
 *  uvs: u along it, v round it (v 0.25 its +z side, 0.75 its -z) */
function sweep(path: Vector3[], size: (t: number) => [number, number, number], n = 120, m = 28) {
  const curve = new CatmullRomCurve3(path, false, 'centripetal')
  const pts = curve.getSpacedPoints(n)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const Z = new Vector3(0, 0, 1)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const tan = curve.getTangentAt(t)
    const N = new Vector3(-tan.y, tan.x, 0).normalize()
    const [hy, hz, sq] = size(t)
    // (its ends closed: the last ring drawn in)
    const k = i === 0 || i === n ? 0.0001 : i === 1 || i === n - 1 ? 0.75 : 1
    for (let j = 0; j <= m; j++) {
      const a = (j / m) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      const e = 2 / sq
      const p = pts[i].clone().addScaledVector(N, hy * k * Math.sign(c) * Math.pow(Math.abs(c), e)).addScaledVector(Z, hz * k * Math.sign(s) * Math.pow(Math.abs(s), e))
      pos.push(p.x, p.y, p.z)
      uv.push(t, j / m)
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j
      const b = a + m + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return { g, length: curve.getLength() }
}
/** a straight rod from a to b */
function rod(a: Vector3, b: Vector3, r: number, r1 = r, seg = 10) {
  const g = new CylinderGeometry(r1, r, a.distanceTo(b), seg)
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return g
}
/** a box with its edges rounded (r), and its top crowned a little */
function roundedBox(w: number, h: number, d: number, r: number, crown = 0) {
  const g = new BoxGeometry(w, h, d, 24, 8, 16)
  const p = g.attributes.position
  const v = new Vector3()
  const inner = new Vector3(w / 2 - r, h / 2 - r, d / 2 - r)
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const c = new Vector3(Math.max(-inner.x, Math.min(inner.x, v.x)), Math.max(-inner.y, Math.min(inner.y, v.y)), Math.max(-inner.z, Math.min(inner.z, v.z)))
    const out = v.clone().sub(c)
    if (out.lengthSq() > 1e-9) v.copy(c).addScaledVector(out.normalize(), r)
    if (v.y > 0) v.y += crown * (1 - (v.x / (w / 2)) ** 2) * (1 - (v.z / (d / 2)) ** 2)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

// ---- its markings, painted into what they're on
const FONT = "'Nunito', 'Arial Rounded MT Bold', 'Helvetica Rounded', sans-serif"
/** the housing's sides: black, "LimeGlider" and "100% Electric" toward the front, its plate; its right side in
 *  the left half, its left in the right half (each drawn to read the right way round from its side) */
const HX0 = Math.min(...HOUSING.pts.map((p) => p[0]))
const HX1 = Math.max(...HOUSING.pts.map((p) => p[0]))
const HY0 = Math.min(...HOUSING.pts.map((p) => p[1]))
const HY1 = Math.max(...HOUSING.pts.map((p) => p[1]))
const HS = 3 // (px a mm)
const housingTex = paint(Math.round((HX1 - HX0) * HS * 2), Math.round((HY1 - HY0) * HS), (g) => {
  const W = (HX1 - HX0) * HS
  const H = (HY1 - HY0) * HS
  g.fillStyle = LOOK.black
  g.fillRect(0, 0, W * 2, H)
  const side = (x0: number, flip: boolean) => {
    // (mm along it from its front edge, up from its foot) into this half
    const at = (fromFront: number, up: number): [number, number] => [x0 + (flip ? fromFront : W / HS - fromFront) * HS, H - up * HS]
    g.textBaseline = 'alphabetic'
    g.textAlign = 'right'
    g.font = `900 ${34 * HS}px ${FONT}`
    const [tx, ty] = at(flip ? 118 : 120, 182)
    g.textAlign = 'left'
    const lime = 'Lime'
    const glider = 'Glider'
    const lw = g.measureText(lime).width
    const gw = g.measureText(glider).width
    const start = flip ? tx : tx - lw - gw
    g.fillStyle = LOOK.green
    g.fillText(lime, start, ty)
    g.fillStyle = '#f4f4f0'
    g.fillText(glider, start + lw, ty)
    g.font = `800 ${15 * HS}px ${FONT}`
    g.fillStyle = LOOK.green
    g.fillText('100% Electric', start + lw * 0.32, ty + 19 * HS)
    // its plate: white, its six letters
    const [px, py] = at(150, 105)
    const pw = 150 * HS
    const ph = 40 * HS
    const pl = flip ? px : px - pw
    g.fillStyle = '#fbfbf8'
    g.beginPath()
    g.roundRect(pl, py - ph, pw, ph, 5 * HS)
    g.fill()
    g.fillStyle = '#1a1a1e'
    g.textAlign = 'center'
    g.font = `900 ${28 * HS}px ${FONT}`
    g.fillText('HAQNPW', pl + pw / 2, py - 10 * HS)
  }
  side(0, false)
  side(W, true)
})
/** the down tube's wordmark: white "Lime" along it, both sides, reading up it on the right, down it on the left */
const spineTex = (length: number, from: number, to: number) =>
  paint(2048, 256, (g) => {
    g.fillStyle = LOOK.green
    g.fillRect(0, 0, 2048, 256)
    const u = (mm: number) => (mm / length) * 2048
    const mid = (from + to) / 2
    const k = 2048 / length // (px a mm along it; round it, 256 px over its girth)
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const [v, dir] of [
      [0.25, -1],
      [0.75, 1],
    ] as [number, number][]) {
      g.save()
      g.translate(u(mid), v * 256)
      g.scale(dir * k, dir * 1.5)
      g.font = `900 46px ${FONT}`
      g.fillText('Lime', 0, 0)
      g.restore()
    }
  })
/** the basket's sides: black, Lime's slice (a quarter of a lime: its rind, its segments, a pip) */
const basketTex = paint(512, 512, (g) => {
  g.fillStyle = '#2f2e34'
  g.fillRect(0, 0, 512, 512)
  const cx = 150
  const cy = 420
  g.strokeStyle = LOOK.green
  g.lineWidth = 30
  g.lineCap = 'round'
  g.beginPath()
  g.arc(cx, cy, 255, -Math.PI / 2 + 0.05, -0.02)
  g.stroke()
  g.fillStyle = LOOK.green
  for (const [a0, a1] of [
    [-1.5, -1.12],
    [-1.0, -0.6],
    [-0.48, -0.08],
  ]) {
    g.beginPath()
    g.moveTo(cx + Math.cos((a0 + a1) / 2) * 62, cy + Math.sin((a0 + a1) / 2) * 62)
    g.arc(cx, cy, 205, a0, a1)
    g.closePath()
    g.fill()
  }
  g.beginPath()
  g.arc(cx + 22, cy - 22, 26, 0, Math.PI * 2)
  g.fill()
})
/** the T bar's top, as it's seen from the seat (its front up the canvas): the phone channel, the QR code, the
 *  sticker, the display (speed, battery) nearest you */
const podTex = paint(256, 320, (g) => {
  const r = rng(4)
  g.fillStyle = LOOK.green
  g.fillRect(0, 0, 256, 320)
  g.fillStyle = '#1e1d22'
  g.beginPath()
  g.roundRect(28, 0, 200, 46, 10)
  g.fill()
  g.fillStyle = '#e8e8e4'
  g.fillRect(92, 70, 72, 72)
  g.fillStyle = '#1b1b1f'
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (r() < 0.5) g.fillRect(96 + x * 6.4, 74 + y * 6.4, 6.4, 6.4)
  for (const [x, y] of [
    [96, 74],
    [141, 74],
    [96, 119],
  ]) {
    g.fillStyle = '#1b1b1f'
    g.fillRect(x, y, 19, 19)
    g.fillStyle = '#e8e8e4'
    g.fillRect(x + 3, y + 3, 13, 13)
    g.fillStyle = '#1b1b1f'
    g.fillRect(x + 6, y + 6, 7, 7)
  }
  g.fillStyle = '#1b1b1f'
  g.fillRect(60, 160, 136, 34)
  g.fillStyle = '#e8e8e4'
  g.font = '600 9px sans-serif'
  g.textAlign = 'center'
  g.fillText('Please ensure your phone is', 128, 174)
  g.fillText('secure in the bottom channel', 128, 186)
  g.fillStyle = '#141418'
  g.beginPath()
  g.roundRect(70, 214, 116, 70, 14)
  g.fill()
  g.fillStyle = '#f4f4f0'
  g.font = '700 46px monospace'
  g.fillText('00', 116, 266)
  g.fillStyle = '#4fc6e8'
  g.fillRect(152, 240, 22, 14)
})
if (podTex) {
  // (laid on the pod's top: its front, +x, up the canvas)
  podTex.center.set(0.5, 0.5)
  podTex.rotation = -Math.PI / 2
}
const housingMat = bruno({ map: housingTex ?? undefined, color: '#ffffff', shade: '#1d1c22' })
const basketMat = bruno({ map: basketTex ?? undefined, color: '#ffffff', shade: '#1e1d24', side: DoubleSide })
const podMat = bruno({ map: podTex ?? undefined, color: '#ffffff', shade: '#3b7a5a' })

// ---- the parts
/** a wheel: its tyre, the reflective stripe on its walls, the rim, 36 spokes laced to the hub */
function wheelGeo(front: boolean) {
  const R = WHEEL.od / 2
  const T = WHEEL.tyre
  const tyre = new TorusGeometry(R - T / 2, T / 2, 14, 72)
  const stripes = mergeGeometries([-1, 1].map((s) => new TorusGeometry(WHEEL.rim / 2 + 9, 1.6, 4, 72).translate(0, 0, s * (T / 2 - 4))))
  const rim = new TorusGeometry(WHEEL.rim / 2 - 4, 7, 6, 72)
  const hubR = (front ? WHEEL.hubFront : WHEEL.hubRear) / 2
  const hub = new CylinderGeometry(hubR, hubR, front ? 70 : 54, 28).rotateX(Math.PI / 2)
  const spokes: BufferGeometry[] = []
  for (let i = 0; i < WHEEL.spokes; i++) {
    const a = (i / WHEEL.spokes) * Math.PI * 2
    const side = i % 2 ? 1 : -1
    const lead = (i % 4 < 2 ? 1 : -1) * 0.45
    const from = new Vector3(Math.cos(a) * hubR * 0.85, Math.sin(a) * hubR * 0.85, side * (front ? 28 : 22))
    const to = new Vector3(Math.cos(a + lead) * (WHEEL.rim / 2 - 8), Math.sin(a + lead) * (WHEEL.rim / 2 - 8), side * 2)
    spokes.push(rod(from, to, 1.3, 1.3, 4))
  }
  return { tyre, stripes, rim, hub, spokes: mergeGeometries(spokes), axle: new CylinderGeometry(9, 9, 120, 10).rotateX(Math.PI / 2) }
}

type Built = ReturnType<typeof build>
let made: Built | null = null
function build() {
  // the spine: round where it comes down from the head, flattening and squaring into the low rail
  const spinePath = SPINE.map((p) => V(p))
  const spine = sweep(spinePath, (t) => {
    const k = Math.min(1, Math.max(0, (t - 0.32) / 0.25))
    const tube = SPINE_SIZE.tube / 2
    return [tube + (SPINE_SIZE.rail[1] / 2 - tube) * k, tube + (SPINE_SIZE.rail[0] / 2 - tube) * k, 2 + 2.5 * k]
  })
  // (the wordmark on the down tube: along its first stretch, the swoop)
  const spineMat = bruno({ map: spineTex(spine.length, spine.length * 0.04, spine.length * 0.3) ?? undefined, color: '#ffffff', shade: '#4f9a62', sheen: 0.35, lit: 1.15 })
  const stay = mergeGeometries([-1, 1].map((s) => sweep([V(STAY.from, s * 58), V(STAY.from, s * 96).lerp(V(STAY.to, s * 96), 0.2), V(STAY.to, s * 104)], () => [STAY.size[1] / 2, STAY.size[0] / 2 - 6, 3], 16, 20).g))
  // the rear dropouts: green plates either side of the axle, the rail and the stay meeting there
  const dropout = new ExtrudeGeometry(new Shape().absellipse(30, 30, 40, 30, 0, Math.PI * 2, false, 0.5), { depth: 10, bevelEnabled: true, bevelSize: 3, bevelThickness: 3 })
  // the head tube, the stem up from it to the bar's clamp
  const head = sweep([V(STEER.crown), V(STEER.top)], () => [31, 31, 2], 10, 24).g
  const stem = sweep([V(STEER.top), V(STEM.top), V(STEM.clamp)], (t) => [26 - t * 4, 26 - t * 4, 2], 20, 24).g
  // the fork: a leg either side, down the steering axis to the axle; its crown
  const axle = V(AXLE.front)
  const crown = V(STEER.crown)
  const fork = mergeGeometries([-1, 1].map((s) => rod(crown.clone().setZ(s * 44), axle.clone().setZ(s * 44), 19, 14, 12)))
  const forkCrown = rod(crown.clone().setZ(-50), crown.clone().setZ(50), 26, 26, 16)
  // the bar: across, its ends swept back, green to the grips; the grips; the pod on top with its face
  const clamp = V(STEM.clamp)
  const barPath = (s: number) => [new Vector3(clamp.x, BAR.y + 8, 0), new Vector3(clamp.x - 20, BAR.y + 4, s * 120), new Vector3(clamp.x - BAR.back, BAR.y, s * 200)]
  const bars = mergeGeometries([-1, 1].map((s) => sweep(barPath(s), () => [15, 15, 2], 20, 16).g))
  const grips = mergeGeometries([-1, 1].map((s) => rod(new Vector3(clamp.x - BAR.back, BAR.y, s * 198), new Vector3(clamp.x - BAR.back - 4, BAR.y, s * (198 + BAR.grip)), 17.5, 17.5, 14)))
  const ends = mergeGeometries([-1, 1].map((s) => rod(new Vector3(clamp.x - BAR.back - 4, BAR.y, s * (198 + BAR.grip)), new Vector3(clamp.x - BAR.back - 4, BAR.y, s * (210 + BAR.grip)), 19, 19, 14)))
  const levers = mergeGeometries([-1, 1].map((s) => rod(new Vector3(clamp.x - BAR.back + 26, BAR.y + 6, s * 175), new Vector3(clamp.x - BAR.back + 46, BAR.y - 12, s * 290), 5, 4, 6)))
  const brakeBoxes = mergeGeometries([-1, 1].map((s) => new BoxGeometry(34, 38, 26).translate(clamp.x - BAR.back + 6, BAR.y + 4, s * 175)))
  const throttle = new BoxGeometry(22, 30, 10).translate(clamp.x - BAR.back + 2, BAR.y - 18, 200)
  const pod = new BoxGeometry(150, 40, 118).translate(clamp.x - 30, BAR.y + 22, 0)
  // the basket: its back against the head, wider at its top; a lip round its rim; open
  const bk = BASKET
  const ring = (y: number, x0: number, x1: number, hw: number, r: number) => {
    const pts: Vector3[] = []
    const corners: [number, number, number][] = [
      [x1 - r, hw - r, 0],
      [x0 + r, hw - r, Math.PI / 2],
      [x0 + r, -hw + r, Math.PI],
      [x1 - r, -hw + r, Math.PI * 1.5],
    ]
    for (const [cx, cz, a0] of corners) for (let k = 0; k <= 5; k++) pts.push(new Vector3(cx + Math.cos(a0 + (k / 5) * Math.PI * 0.5) * r, y, cz + Math.sin(a0 + (k / 5) * Math.PI * 0.5) * r))
    return pts
  }
  const [bt0, bt1] = bk.top
  const [bb0, bb1] = bk.bottom
  const topY = (bt0[1] + bt1[1]) / 2
  const botY = bb0[1]
  const rings = [
    ring(botY, bb0[0] + 30, bb1[0] - 30, 1, 1),
    ring(botY, bb0[0], bb1[0], bk.w / 2 - 22, 22),
    ring(topY, bt0[0], bt1[0], bk.w / 2, 26),
    ring(topY + 5, bt0[0] - 4, bt1[0] + 4, bk.w / 2 + 4, 28),
    ring(topY + 5, bt0[0] + bk.wall, bt1[0] - bk.wall, bk.w / 2 - bk.wall, 22),
    ring(botY + bk.wall, bb0[0] + bk.wall, bb1[0] - bk.wall, bk.w / 2 - 22 - bk.wall, 18),
    ring(botY + bk.wall, bb0[0] + 40, bb1[0] - 40, 1, 1),
  ]
  const basket = (() => {
    const n = rings[0].length
    const pos: number[] = []
    const uv: number[] = []
    rings.forEach((r, i) =>
      r.forEach((p) => {
        pos.push(p.x, p.y, p.z)
        // (the slice on its outside walls; inside, plain)
        uv.push(i < 3 ? (p.x - bt0[0]) / (bt1[0] - bt0[0]) : 0.02, i < 3 ? (p.y - botY) / (topY - botY) : 0.98)
      }),
    )
    const idx: number[] = []
    for (let i = 0; i < rings.length - 1; i++)
      for (let k = 0; k < n; k++) {
        const a = i * n + k
        const b = i * n + ((k + 1) % n)
        idx.push(a, a + n, b, b, a + n, b + n)
      }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  })()
  // the housing: its side outline, its width, its edges rounded; its sides painted
  const housing = new ExtrudeGeometry(new Shape(HOUSING.pts.map(([x, y]) => new Vector2(x, y))), { depth: HOUSING.w - 16, bevelEnabled: true, bevelSize: 8, bevelThickness: 8, bevelSegments: 3 })
  housing.translate(0, 0, -(HOUSING.w - 16) / 2)
  {
    const p = housing.attributes.position
    const uv = housing.attributes.uv
    const zMax = (HOUSING.w - 16) / 2 + 7.9
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      const z = p.getZ(i)
      const v = (y - HY0) / (HY1 - HY0)
      if (z >= zMax) uv.setXY(i, ((x - HX0) / (HX1 - HX0)) * 0.5, v)
      else if (z <= -zMax) uv.setXY(i, 0.5 + ((HX1 - x) / (HX1 - HX0)) * 0.5, v)
      else uv.setXY(i, 0.001, 0.001)
    }
  }
  // the rear: its deck, its fender over the wheel, the skirts either side with their windows, the tail light
  const ra = V(AXLE.rear)
  const fenderPath = (r: number, a0: number, a1: number, at: Vector3) => Array.from({ length: 13 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / 12) * Math.PI) / 180
    return new Vector3(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, 0)
  })
  const rearFender = sweep(fenderPath(FENDER.r, FENDER.rear.from, FENDER.rear.to, ra), () => [6, FENDER.w[0] / 2, 6], 40, 20).g
  const deck = new BoxGeometry(DECK.x1 - DECK.x0, 22, 138).translate((DECK.x0 + DECK.x1) / 2, DECK.top - 11, 0)
  const skirtShape = new Shape()
  {
    const R0 = 70
    const R1 = FENDER.r + 2
    const a0 = (32 * Math.PI) / 180
    const a1 = (166 * Math.PI) / 180
    skirtShape.moveTo(Math.cos(a0) * R0, Math.sin(a0) * R0)
    skirtShape.absarc(0, 0, R1, a0, a1, false)
    skirtShape.absarc(0, 0, R0, a1 + 0.35, a0 - 0.1, true)
    const win = new Shape()
    win.absarc(0, 0, 250, (78 * Math.PI) / 180, (142 * Math.PI) / 180, false)
    win.absarc(0, 0, 150, (150 * Math.PI) / 180, (70 * Math.PI) / 180, true)
    skirtShape.holes.push(win)
  }
  const skirt = mergeGeometries([-1, 1].map((s) => new ExtrudeGeometry(skirtShape, { depth: 6, bevelEnabled: false, curveSegments: 24 }).translate(ra.x, ra.y, s > 0 ? 62 : -68)))
  const tail = new BoxGeometry(14, 22, 70).translate(DECK.x0 - 4, DECK.top - 16, 0)
  const frontFender = sweep(fenderPath(FENDER.front.r, FENDER.front.from, FENDER.front.to, axle), () => [5, FENDER.w[1] / 2, 6], 36, 18).g
  // the seat: big and padded, its base under it; the strut and the clamp; the grab loop round its back
  const seatLen = SEAT.x1 - SEAT.x0
  const seat = roundedBox(seatLen, SEAT.t, SEAT.w, 34, 8).translate((SEAT.x0 + SEAT.x1) / 2, SEAT.top - SEAT.t / 2 - 8, 0)
  const seatBase = roundedBox(seatLen - 30, 18, SEAT.w - 40, 8).translate((SEAT.x0 + SEAT.x1) / 2, SEAT.top - SEAT.t - 12, 0)
  const post = rod(V(SEAT_POST.from), V(SEAT_POST.to), 17, 17, 12)
  const handle = mergeGeometries([
    ...[-1, 1].map((s) => sweep(HANDLE.map((p) => V(p, 0)), () => [11, 11, 2], 16, 12).g.translate(0, 0, s * 100)),
    rod(V(HANDLE[0], -100), V(HANDLE[0], 100), 11, 11, 10),
  ])
  const clampBox = new BoxGeometry(46, 30, 46).translate(R0x(458), R0y(312), 0)
  // the footboards: an aluminium plate each side, its black tread on top
  const fb = FOOTBOARD
  const boards = mergeGeometries([-1, 1].map((s) => new BoxGeometry(fb.x1 - fb.x0, fb.t, fb.out - 30).translate((fb.x0 + fb.x1) / 2, fb.top - fb.t / 2, s * (30 + (fb.out - 30) / 2))))
  const treads = mergeGeometries(
    [-1, 1].flatMap((s) => Array.from({ length: 7 }, (_, i) => new BoxGeometry(14, 4, fb.out - 44).translate(fb.x0 + 24 + i * 27, fb.top + 2, s * (30 + (fb.out - 30) / 2)))),
  )
  // the kickstand: down on its left, a little out
  const kick = rod(new Vector3(KICKSTAND.pivot[0], KICKSTAND.pivot[1], -42), new Vector3(KICKSTAND.foot[0] - 20, 6, -120), 9, 11, 8)
  const kickFoot = new BoxGeometry(46, 8, 28).translate(KICKSTAND.foot[0] - 22, 4, -122)
  // the cables: from the levers down the head to the frame
  const cables = mergeGeometries([-1, 1].map((s) => sweep([new Vector3(clamp.x - 40, BAR.y - 6, s * 150), new Vector3(clamp.x + 30, BAR.y - 90, s * 60), V(STEER.top, s * 20).add(new Vector3(40, -60, 0)), V(SPINE[1], s * 20).add(new Vector3(20, 0, 0))], () => [3.5, 3.5, 2], 30, 6).g))
  return { spine: spine.g, spineMat, stay, dropout, head, stem, fork, forkCrown, bars, grips, ends, levers, brakeBoxes, throttle, pod, basket, housing, rearFender, deck, skirt, tail, frontFender, seat, seatBase, post, handle, clampBox, boards, treads, kick, kickFoot, cables, wheels: [wheelGeo(false), wheelGeo(true)] }
}
/** (a point off the render, by its pixel: for small parts) */
function R0x(px: number) {
  return (px - 209) * 1.8
}
function R0y(py: number) {
  return (622 - py) * 1.8
}

function Wheel({ g, at, spin, wref, live }: { g: ReturnType<typeof wheelGeo>; at: Vector3; spin: number; wref?: Ref<Group>; live?: boolean }) {
  return (
    <group ref={wref} position={at} rotation={[0, 0, -spin]} userData={{ live }}>
      <mesh geometry={g.tyre} material={M.rubber} castShadow receiveShadow />
      <mesh geometry={g.stripes} material={M.stripe} />
      <mesh geometry={g.rim} material={M.black} />
      <mesh geometry={g.spokes} material={M.spoke} />
      <mesh geometry={g.hub} material={M.black} castShadow />
      <mesh geometry={g.axle} material={M.metal} />
    </group>
  )
}

/** the front (fork, wheel, bar, basket) turned round the steering axis */
const AXIS = new Vector3(AXLE.front[0] - STEER.top[0], AXLE.front[1] - STEER.top[1], 0).normalize().negate()
const ALIGN = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), AXIS)
const UNALIGN = ALIGN.clone().invert()
function Steered({ angle, turn, live, children }: { angle: number; turn?: Ref<Group>; live?: boolean; children: ReactNode }) {
  return (
    <group position={V(STEER.top)} quaternion={ALIGN} userData={{ live }}>
      <group ref={turn} rotation={[0, angle, 0]}>
        <group quaternion={UNALIGN}>
          <group position={V(STEER.top).negate()}>{children}</group>
        </group>
      </group>
    </group>
  )
}

/** a Glider being ridden (../quad/QuadLime): its bars turned, its wheels rolled, its kickstand up or down, each frame
 *  from `rig` (not by drawing it again); `live`, so a <Static> round it leaves those parts unmerged */
export type LimeRig = { current: { steer: number; spin: number; stand: number } }
export function Glider({ steer = 0, spin = 0, stand = 1, rig, live }: { steer?: number; spin?: number; stand?: number; rig?: LimeRig; live?: boolean }) {
  const g = useMemo(() => (made ??= build()), [])
  const turn = useRef<Group>(null)
  const rear = useRef<Group>(null)
  const front = useRef<Group>(null)
  const kick = useRef<Group>(null)
  useFrame(() => {
    const r = rig?.current
    if (!r) return
    if (turn.current) turn.current.rotation.y = r.steer
    if (rear.current) rear.current.rotation.z = -r.spin
    if (front.current) front.current.rotation.z = -r.spin
    if (kick.current) kick.current.rotation.set(-(1 - r.stand) * 0.2, 0, -(1 - r.stand) * 1.45)
  })
  // (let go: back as drawn, before a <Static> round it merges it again)
  useLayoutEffect(() => {
    if (rig) return
    turn.current?.rotation.set(0, steer, 0)
    rear.current?.rotation.set(0, 0, -spin)
    front.current?.rotation.set(0, 0, -spin)
    kick.current?.rotation.set(-(1 - stand) * 0.2, 0, -(1 - stand) * 1.45)
  }, [rig, steer, spin, stand])
  const mesh = (geo: BufferGeometry, m: Material, shadow = true) => <mesh geometry={geo} material={m} castShadow={shadow} receiveShadow />
  return (
    <group>
      {/* the frame */}
      {mesh(g.spine, g.spineMat)}
      {mesh(g.stay, M.green)}
      <mesh geometry={g.dropout} material={M.green} position={[V(AXLE.rear).x - 30, V(AXLE.rear).y - 30, 40]} castShadow />
      <mesh geometry={g.dropout} material={M.green} position={[V(AXLE.rear).x - 30, V(AXLE.rear).y - 30, -50]} castShadow />
      {mesh(g.head, M.green)}
      {/* under the seat: the housing; the rear deck, fender, skirts, tail light */}
      {mesh(g.housing, housingMat)}
      {mesh(g.deck, M.black)}
      {mesh(g.rearFender, M.black)}
      {mesh(g.skirt, M.black)}
      {mesh(g.tail, M.red, false)}
      {/* the seat, on its strut; its grab loop */}
      {mesh(g.seat, M.seat)}
      {mesh(g.seatBase, M.black)}
      {mesh(g.post, M.black)}
      {mesh(g.clampBox, M.metal)}
      {mesh(g.handle, M.black)}
      {/* the footboards; the kickstand (down, or folded up along the rail) */}
      {mesh(g.boards, M.metal)}
      {mesh(g.treads, M.rubber)}
      <group ref={kick} position={[KICKSTAND.pivot[0], KICKSTAND.pivot[1], -42]} rotation={[-(1 - stand) * 0.2, 0, -(1 - stand) * 1.45]} userData={{ live }}>
        <group position={[-KICKSTAND.pivot[0], -KICKSTAND.pivot[1], 42]}>
          {mesh(g.kick, M.black)}
          {mesh(g.kickFoot, M.black)}
        </group>
      </group>
      {/* the rear wheel */}
      <Wheel g={g.wheels[0]} at={V(AXLE.rear)} spin={spin} wref={rear} live={live} />
      {/* the front: fork, wheel, fender, stem, bar, basket, cables, turned together */}
      <Steered angle={steer} turn={turn} live={live}>
        {mesh(g.fork, M.green)}
        {mesh(g.forkCrown, M.green)}
        <Wheel g={g.wheels[1]} at={V(AXLE.front)} spin={spin * 1} wref={front} />
        {mesh(g.frontFender, M.black)}
        {mesh(g.stem, M.green)}
        {mesh(g.bars, M.green)}
        {mesh(g.grips, M.rubber)}
        {mesh(g.ends, M.black)}
        {mesh(g.levers, M.black)}
        {mesh(g.brakeBoxes, M.black)}
        {mesh(g.throttle, M.green)}
        <mesh geometry={g.pod} material={[M.green, M.green, podMat, M.green, M.green, M.green]} castShadow />
        {mesh(g.basket, basketMat)}
        {mesh(g.cables, M.black, false)}
      </Steered>
    </group>
  )
}
export const GLIDER_LENGTH = FENDER.r + AXLE.front[0] + WHEEL.od / 2
