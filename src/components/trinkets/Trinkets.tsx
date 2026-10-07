import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, CylinderCollider } from '@react-three/rapier'
import {
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Group,
  type Matrix4,
} from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedRect } from '../../lib/shapes'
import { Prompts } from '../prompt/Prompts'
import { HAIRTIE, LANYARD, LOTION, LOTION_H, LOTION_TOP, VASELINE, WATCH } from './spec'

/**
 * Her little things (./spec): the green pump lotion (click its head: it presses down and springs back), the
 * Vaseline pot, a black hair tie lying loose, her white watch on its sport band in a loose curl (screen dark), her
 * navy COOPESA lanyard lying in a loose C with its keys and badge holder (a fixed shape: no rope physics).
 *
 * Labels and prints are painted into the surfaces' own textures (the lanyard's print repeats along it).
 * Frames: ./spec (each footprint's middle, its bottom on y 0, the front toward +z).
 */
const ITEM = groups(GROUP.item, 0xffff)

// ---- helpers
/** a canvas texture, drawn by `draw` at px pixels a mm over w × h mm */
function canvasTex(w: number, h: number, px: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
  const c = document.createElement('canvas')
  c.width = Math.round(w * px)
  c.height = Math.round(h * px)
  draw(c.getContext('2d')!, c.width, c.height)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
/** a lathe whose v runs with height (0 at y0, 1 at y1), for bands painted round it; u = 0.5 faces +z */
function lathe(pts: [number, number][], y0: number, y1: number, seg = 48) {
  const g = new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg)
  g.rotateY(Math.PI)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0))
  return g
}
/** a flat outline made solid, lying face up (shape y toward -z), from y0 up t, its edges rounded b */
function slab(shape: Shape, t: number, b: number, y0: number) {
  const g = new ExtrudeGeometry(shape, { depth: Math.max(0.01, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 16 })
  g.translate(0, 0, b)
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}
/**
 * A strap (w wide, t thick) along a line of points: `side` gives its width's direction at each, its thickness
 * square to that and the line. Flat faces (top, bottom, both edges, the two ends); the top and bottom's uv: u
 * across, v the length along it in mm / `tile`.
 */
function ribbon(pts: Vector3[], side: (tangent: Vector3, i: number) => Vector3, w: number, t: number, tile = 100) {
  const n = pts.length
  const S: Vector3[] = []
  const U: Vector3[] = []
  const len: number[] = [0]
  for (let i = 0; i < n; i++) {
    const tan = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize()
    const s = side(tan, i).clone().normalize()
    const u = new Vector3().crossVectors(s, tan).normalize()
    S.push(s)
    U.push(u)
    if (i) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]))
  }
  const pos: number[] = []
  const nor: number[] = []
  const uvs: number[] = []
  const corner = (i: number, a: number, b: number) => pts[i].clone().addScaledVector(S[i], (a * w) / 2).addScaledVector(U[i], (b * t) / 2)
  /** a triangle facing `nrm` (its winding turned to match) */
  const tri = (p: Vector3[], uv: [number, number][], nrm: Vector3) => {
    const f = new Vector3().subVectors(p[1], p[0]).cross(new Vector3().subVectors(p[2], p[0]))
    const order = f.dot(nrm) >= 0 ? [0, 1, 2] : [0, 2, 1]
    for (const k of order) {
      pos.push(p[k].x, p[k].y, p[k].z)
      nor.push(nrm.x, nrm.y, nrm.z)
      uvs.push(...uv[k])
    }
  }
  const quad = (p: Vector3[], uv: [number, number][], nrm: Vector3) => {
    tri([p[0], p[1], p[2]], [uv[0], uv[1], uv[2]], nrm)
    tri([p[0], p[2], p[3]], [uv[0], uv[2], uv[3]], nrm)
  }
  for (let i = 0; i < n - 1; i++) {
    const j = i + 1
    const v0 = len[i] / tile
    const v1 = len[j] / tile
    const m = U[i].clone().add(U[j]).normalize()
    const sd = S[i].clone().add(S[j]).normalize()
    quad([corner(i, -1, 1), corner(i, 1, 1), corner(j, 1, 1), corner(j, -1, 1)], [[0, v0], [1, v0], [1, v1], [0, v1]], m)
    quad([corner(i, -1, -1), corner(i, 1, -1), corner(j, 1, -1), corner(j, -1, -1)], [[1, v0], [0, v0], [0, v1], [1, v1]], m.clone().negate())
    quad([corner(i, 1, -1), corner(i, 1, 1), corner(j, 1, 1), corner(j, 1, -1)], [[0, v0], [0, v0], [0, v1], [0, v1]], sd)
    quad([corner(i, -1, -1), corner(i, -1, 1), corner(j, -1, 1), corner(j, -1, -1)], [[0, v0], [0, v0], [0, v1], [0, v1]], sd.clone().negate())
  }
  for (const [i, sgn] of [[0, -1], [n - 1, 1]] as const) {
    const tan = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize().multiplyScalar(sgn)
    quad([corner(i, -1, -1), corner(i, 1, -1), corner(i, 1, 1), corner(i, -1, 1)], [[0, 0], [0, 0], [0, 0], [0, 0]], tan)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  return g
}

// ---- the lotion
const L = LOTION
const PUMP_Y = LOTION_TOP + L.collar.h
let LOTION_SHAPES: { body: BufferGeometry; inside: BufferGeometry; collar: BufferGeometry; stem: BufferGeometry; head: BufferGeometry; spout: BufferGeometry } | null = null
const lotionShapes = () => {
  if (LOTION_SHAPES) return LOTION_SHAPES
  const R = L.body.r
  const H = L.body.h
  const sh = L.body.shoulder
  const top = L.collar.r + 1
  // round its foot, straight up, the shoulder rounding in to the neck
  const prof: [number, number][] = [[0, 0], [R - 4, 0], [R - 1, 1], [R, 4], [R, H - sh]]
  for (let k = 1; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2)
    prof.push([top + (R - top) * Math.cos(a), H - sh + sh * Math.sin(a)])
  }
  prof.push([0, H])
  const inside: [number, number][] = [[0, 2], [R - 2, 2], [R - 2, H * 0.62], [0, H * 0.62]]
  const hR = L.head.r
  const hH = L.head.h
  LOTION_SHAPES = {
    body: lathe(prof, 0, H),
    inside: lathe(inside, 0, H, 32),
    collar: lathe([[0, 0], [L.collar.r, 0], [L.collar.r, L.collar.h - 2], [L.collar.r - 2, L.collar.h], [0, L.collar.h]], 0, L.collar.h, 32).translate(0, LOTION_TOP, 0),
    stem: new CylinderGeometry(L.stem.r, L.stem.r, L.stem.h + L.travel + 2, 16).translate(0, (L.stem.h - L.travel - 2) / 2, 0),
    // the head: a round cap on the stem; its spout reaching forward, a little down
    head: lathe([[0, 0], [hR, 0], [hR, hH - 3], [hR - 3, hH], [0, hH]], 0, hH, 32).translate(0, L.stem.h, 0),
    spout: new CylinderGeometry(L.head.spoutR, L.head.spoutR * 1.1, L.head.spout, 14).rotateX(Math.PI / 2).translate(0, L.stem.h + hH * 0.55, hR + L.head.spout / 2 - 4),
  }
  return LOTION_SHAPES
}

/** the lotion bottle; click its head and it presses down and springs back */
export function LotionModel() {
  const s = lotionShapes()
  const mat = useMemo(() => {
    const band = canvasTex(4, L.body.h, 6, (g, W, H) => {
      g.fillStyle = L.colors.body
      g.fillRect(0, 0, W, H)
      const y = H * (1 - L.label.h / L.body.h)
      g.fillStyle = L.colors.label
      g.fillRect(0, y, W, H - y)
      g.fillStyle = '#6ea93a' // (a thin green line along the band's top)
      g.fillRect(0, y + 1.2 * 6, W, 0.8 * 6)
    })
    return {
      body: new MeshStandardMaterial({ map: band, transparent: true, opacity: 0.86, roughness: 0.35 }),
      inside: new MeshStandardMaterial({ color: '#e9f2cf', roughness: 0.7 }),
      pump: new MeshStandardMaterial({ color: L.colors.pump, roughness: 0.5 }),
    }
  }, [])
  const head = useRef<Group>(null)
  const press = useRef(0)
  useFrame((_, dt) => {
    if (press.current <= 0 || !head.current) return
    press.current = Math.max(0, press.current - Math.min(dt, 0.05) * 2.6)
    // down fast, back up with a little spring
    const p = press.current
    const k = p > 0.7 ? (1 - p) / 0.3 : Math.sin((p / 0.7) * Math.PI * 0.5) * (1 + 0.15 * Math.sin((1 - p / 0.7) * Math.PI * 3) * (1 - p))
    head.current.position.y = -L.travel * Math.min(1, k)
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (press.current < 0.3) press.current = 1
  }
  return (
    <group>
      <mesh geometry={s.inside} material={mat.inside} />
      <mesh geometry={s.body} material={mat.body} castShadow receiveShadow />
      <mesh geometry={s.collar} material={mat.pump} castShadow receiveShadow />
      <group position={[0, PUMP_Y, 0]}>
        <group ref={head}>
          <group onClick={click}>
            <mesh geometry={s.stem} material={mat.pump} castShadow />
            <mesh geometry={s.head} material={mat.pump} castShadow receiveShadow />
            <mesh geometry={s.spout} material={mat.pump} castShadow />
          </group>
        </group>
      </group>
    </group>
  )
}

// ---- the Vaseline
const V = VASELINE
let VAS_SHAPES: { body: BufferGeometry; lid: BufferGeometry } | null = null
const vasShapes = () =>
  (VAS_SHAPES ??= {
    body: lathe([[0, 0], [V.r - 2, 0], [V.r, 2], [V.r, V.body], [0, V.body]], 0, V.body),
    lid: lathe([[0, V.body], [V.r + 0.4, V.body], [V.r + 0.4, V.body + V.lid - 2.5], [V.r - 2, V.body + V.lid], [0, V.body + V.lid]], V.body, V.body + V.lid),
  })
export function VaselineModel() {
  const s = vasShapes()
  const mat = useMemo(() => {
    const C = 2 * Math.PI * V.r
    const label = canvasTex(C, V.body, 8, (g, W, H) => {
      const k = W / C
      g.fillStyle = V.colors.body
      g.fillRect(0, 0, W, H)
      // the front: the wordmark over "LIP THERAPY", the cocoa band low
      g.fillStyle = V.colors.band
      g.fillRect(W * 0.3, H * 0.62, W * 0.4, H * 0.3)
      g.fillStyle = V.colors.logo
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `italic bold ${7 * k}px Georgia, serif`
      g.fillText('Vaseline', W / 2, H * 0.25)
      g.font = `bold ${3.2 * k}px Arial, sans-serif`
      g.fillText('LIP THERAPY', W / 2, H * 0.48)
      g.fillStyle = '#fff6ea'
      g.font = `bold ${2.6 * k}px Arial, sans-serif`
      g.fillText('COCOA BUTTER', W / 2, H * 0.77)
    })
    const lid = canvasTex(8, 8, 8, (g, W, H) => {
      g.fillStyle = V.colors.lid
      g.fillRect(0, 0, W, H)
    })
    return {
      body: new MeshStandardMaterial({ map: label, roughness: 0.45 }),
      lid: new MeshStandardMaterial({ map: lid, roughness: 0.45 }),
    }
  }, [])
  return (
    <group>
      <mesh geometry={s.body} material={mat.body} castShadow receiveShadow />
      <mesh geometry={s.lid} material={mat.lid} castShadow receiveShadow />
    </group>
  )
}

// ---- the hair tie
const HT = HAIRTIE
let TIE: BufferGeometry | null = null
const tieShape = () => {
  if (TIE) return TIE
  const pts: Vector3[] = []
  const n = 48
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = HT.R + HT.wave.out * Math.sin(HT.wave.n * a + 0.7) + 0.8 * Math.sin(2 * a)
    const y = HT.r + HT.wave.up * (0.5 + 0.5 * Math.sin(3 * a + 1.3))
    pts.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
  }
  TIE = new TubeGeometry(new CatmullRomCurve3(pts, true, 'centripetal'), 120, HT.r, 10, true)
  return TIE
}
export function HairTieModel() {
  const mat = useMemo(() => new MeshStandardMaterial({ color: HT.color, roughness: 0.9 }), [])
  return <mesh geometry={tieShape()} material={mat} castShadow receiveShadow />
}

// ---- the watch
const W = WATCH
const X = new Vector3(1, 0, 0)
const curve2 = (pts: [number, number][]) => new CatmullRomCurve3(pts.map(([z, y]) => new Vector3(0, y, z)), false, 'centripetal')
let WATCH_SHAPES: { case: BufferGeometry; glass: BufferGeometry; crown: BufferGeometry; button: BufferGeometry; long: BufferGeometry; short: BufferGeometry; pin: BufferGeometry; hull: Float32Array } | null = null
const watchShapes = () => {
  if (WATCH_SHAPES) return WATCH_SHAPES
  const C = W.case
  const glassW = C.w - 2 * W.screen.inset
  const glassH = C.h - 2 * W.screen.inset
  const glass = slab(roundedRect(glassW, glassH, C.r - W.screen.inset), 1.6, 0.6, C.t - 0.8)
  // its uv 0..1 over the glass
  const pos = glass.attributes.position
  const uv = glass.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + glassW / 2) / glassW, (glassH / 2 - pos.getZ(i)) / glassH)
  const strap = (pts: [number, number][]) => ribbon(curve2(pts).getSpacedPoints(60), () => X, W.band.w, W.band.t, W.band.pitch)
  const hull: number[] = []
  for (const [z, y] of [...W.long, ...W.short]) hull.push(-W.band.w / 2, y - 1, z, W.band.w / 2, y - 1, z, -W.band.w / 2, y + 1, z, W.band.w / 2, y + 1, z)
  for (const x of [-C.w / 2, C.w / 2]) for (const z of [-C.h / 2, C.h / 2]) hull.push(x, 0, z, x, C.t, z)
  const [pz, py] = W.short[W.short.length - 1]
  WATCH_SHAPES = {
    case: slab(roundedRect(C.w, C.h, C.r), C.t - 0.8, 3, 0),
    glass,
    crown: new CylinderGeometry(W.crown.r, W.crown.r, W.crown.len, 18).rotateZ(Math.PI / 2).translate(C.w / 2 + W.crown.len / 2 - 0.5, C.t / 2, -5),
    button: new CylinderGeometry(1.4, 1.4, 1.6, 10).scale(1, 1, 4).rotateZ(Math.PI / 2).translate(C.w / 2 + 0.3, C.t / 2, 7),
    long: strap(W.long),
    short: strap(W.short),
    // the steel pin near the short strap's end, standing out of it
    pin: new CylinderGeometry(1.1, 1.1, 3, 10).translate(0, 0, 0).rotateX(Math.atan2(pz - W.short[W.short.length - 2][0], py - W.short[W.short.length - 2][1]) - Math.PI / 2).translate(0, py - 1.5, pz + 2),
    hull: new Float32Array(hull),
  }
  return WATCH_SHAPES
}
export function WatchModel() {
  const s = watchShapes()
  const mat = useMemo(() => {
    // the long strap's pin holes, one each W.band.pitch along (its texture repeats one pitch); the short one plain
    const holes = canvasTex(W.band.w, W.band.pitch, 12, (g, Wd, H) => {
      g.fillStyle = W.colors.band
      g.fillRect(0, 0, Wd, H)
      g.fillStyle = W.colors.hole
      g.beginPath()
      g.arc(Wd / 2, H / 2, (W.band.hole / 2) * 12, 0, Math.PI * 2)
      g.fill()
    })
    holes.wrapS = holes.wrapT = RepeatWrapping
    const screen = canvasTex(W.case.w, W.case.h, 8, (g, Wd, H) => {
      g.fillStyle = W.colors.glass
      g.fillRect(0, 0, Wd, H)
      const r = g.createLinearGradient(0, 0, Wd, H)
      r.addColorStop(0.2, 'rgba(255,255,255,0)')
      r.addColorStop(0.35, 'rgba(255,255,255,0.07)')
      r.addColorStop(0.5, 'rgba(255,255,255,0)')
      g.fillStyle = r
      g.fillRect(0, 0, Wd, H)
    })
    return {
      case: new MeshStandardMaterial({ color: W.colors.case, roughness: 0.4 }),
      glass: new MeshStandardMaterial({ map: screen, roughness: 0.15 }),
      long: new MeshStandardMaterial({ map: holes, roughness: 0.7 }),
      short: new MeshStandardMaterial({ color: W.colors.band, roughness: 0.7 }),
      steel: new MeshStandardMaterial({ color: '#d4d3cf', roughness: 0.35 }),
    }
  }, [])
  return (
    <group>
      <mesh geometry={s.case} material={mat.case} castShadow receiveShadow />
      <mesh geometry={s.glass} material={mat.glass} receiveShadow />
      <mesh geometry={s.crown} material={mat.case} castShadow />
      <mesh geometry={s.button} material={mat.case} />
      <mesh geometry={s.long} material={mat.long} castShadow receiveShadow />
      <mesh geometry={s.short} material={mat.short} castShadow receiveShadow />
      <mesh geometry={s.pin} material={mat.steel} />
    </group>
  )
}

// ---- the lanyard
const Y = LANYARD
const UP = new Vector3(0, 1, 0)
/** a key lying flat, its bow round the origin (the hole there), its blade along +x */
function keyShape(len: number, w: number) {
  const bow = w / 2
  const half = 3.6
  const root = bow * 0.8
  const tip = len - bow
  const s = new Shape()
  const a0 = Math.asin(half / bow)
  s.moveTo(Math.cos(a0) * bow, half)
  s.lineTo(tip - 3, half)
  s.lineTo(tip, 0.5)
  s.lineTo(tip, -1.5)
  // the cuts along its lower edge
  const cuts = 6
  for (let i = 0; i < cuts; i++) {
    const x = tip - 4 - ((tip - root - 6) * (i + 0.5)) / cuts
    s.lineTo(x + 2, -half)
    s.lineTo(x, -half + 1.6 + (i % 3) * 0.5)
  }
  s.lineTo(Math.cos(a0) * bow, -half)
  for (let k = 1; k < 24; k++) {
    const a = -a0 - ((2 * Math.PI - 2 * a0) * k) / 24
    s.lineTo(Math.cos(a) * bow, Math.sin(a) * bow)
  }
  s.closePath()
  s.holes.push(new Path().absarc(-bow * 0.45, 0, 2.6, 0, Math.PI * 2, true))
  return s
}
type Place = { x: number; z: number; yaw: number }
/** where everything lies: the strap's line, the clip, the ring, keys and badge; all shifted so the footprint's
 *  middle is at the origin */
function lanyardLayout() {
  const mid = new CatmullRomCurve3(Y.path.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal')
  const n = 140
  const C = mid.getSpacedPoints(n)
  const T = C.map((_, i) => C[Math.min(n, i + 1)].clone().sub(C[Math.max(0, i - 1)]).normalize())
  const side = T.map((t) => new Vector3(-t.z, 0, t.x))
  const o = (Y.w + Y.gap) / 2
  const total = mid.getLength()
  const taper = 45 // (the last of it: the two strands come together, one over the other, into the clip)
  const off = (i: number) => {
    const left = total * (1 - i / n)
    if (left > taper) return o
    const k = left / taper
    return o * (k * k * (3 - 2 * k))
  }
  const lift = (i: number) => {
    const left = total * (1 - i / n)
    return left > taper ? 0 : (Y.t + 0.2) * (1 - left / taper)
  }
  const y0 = Y.t / 2
  const A = C.map((p, i) => p.clone().addScaledVector(side[i], off(i)).setY(y0))
  const B = C.map((p, i) => p.clone().addScaledVector(side[i], -off(i)).setY(y0 + lift(i)))
  // the fold at the neck end: half a turn round behind the start
  const fold: Vector3[] = []
  const back = T[0].clone().negate()
  for (let k = 1; k < 12; k++) {
    const a = (k / 12) * Math.PI
    fold.push(C[0].clone().addScaledVector(side[0], -o * Math.cos(a)).addScaledVector(back, o * Math.sin(a)).setY(y0))
  }
  const line = [...B.slice().reverse(), ...fold, ...A]
  // past the clip, along the way it was going
  const end = C[n]
  const d = T[n]
  const at = (k: number, s = 0) => end.clone().addScaledVector(d, k).addScaledVector(side[n], s)
  const yaw = Math.atan2(-d.z, d.x) // (a thing laid along +x turned to lie along d)
  const ring = at(Y.clip.len + Y.ring.R + 6)
  const badge = at(Y.clip.len + 2 * Y.ring.R + 6 + Y.badge.h / 2 - Y.badge.slot.from - 4, 24)
  const keys: Place[] = Y.keys.map((k) => {
    const a = yaw + k.turn
    const dir = new Vector3(Math.cos(a), 0, -Math.sin(a))
    const p = ring.clone().addScaledVector(dir, Y.ring.R)
    return { x: p.x, z: p.z, yaw: a }
  })
  // the footprint's middle
  const xs: number[] = []
  const zs: number[] = []
  for (const p of [...A, ...B, ...fold]) xs.push(p.x), zs.push(p.z)
  const r = Math.hypot(Y.badge.w, Y.badge.h) / 2
  xs.push(badge.x - r, badge.x + r)
  zs.push(badge.z - r, badge.z + r)
  for (const k of keys) {
    const len = Math.max(...Y.keys.map((q) => q.len))
    xs.push(k.x + Math.cos(k.yaw) * len)
    zs.push(k.z - Math.sin(k.yaw) * len)
  }
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const shift = new Vector3(-cx, 0, -cz)
  const size = { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) }
  // its colliders: the strands in a few straight stretches
  const segs: { p: Vector3; yaw: number; len: number }[] = []
  const m = 10
  for (let k = 0; k < m; k++) {
    const a = C[Math.round((k * n) / m)]
    const b = C[Math.round(((k + 1) * n) / m)]
    segs.push({ p: a.clone().add(b).multiplyScalar(0.5).add(shift), yaw: Math.atan2(-(b.z - a.z), b.x - a.x), len: a.distanceTo(b) })
  }
  return {
    line: line.map((p) => p.add(shift)),
    clip: { p: at(Y.clip.len / 2).add(shift), yaw },
    ring: ring.add(shift),
    keys: keys.map((k) => ({ ...k, x: k.x + shift.x, z: k.z + shift.z })),
    badge: { p: badge.add(shift), yaw },
    segs,
    size,
  }
}
let LANYARD_SHAPES: { strap: BufferGeometry; clip: BufferGeometry; hook: BufferGeometry; ring: BufferGeometry; keys: BufferGeometry[]; badge: BufferGeometry; layout: ReturnType<typeof lanyardLayout> } | null = null
const lanyardShapes = () => {
  if (LANYARD_SHAPES) return LANYARD_SHAPES
  const layout = lanyardLayout()
  const strap = ribbon(layout.line, (t) => new Vector3().crossVectors(t, UP), Y.w, Y.t, 110)
  const card = roundedRect(Y.badge.w, Y.badge.h, Y.badge.r)
  // the slot at its top (the shape's +y: toward the clip once laid)
  const sl = Y.badge.slot
  const slot = new Path()
  const yy = Y.badge.h / 2 - sl.from - sl.h / 2
  roundedRect(sl.w, sl.h, sl.h / 2).getPoints(8).forEach((p, i) => (i ? slot.lineTo(p.x, p.y + yy) : slot.moveTo(p.x, p.y + yy)))
  card.holes.push(slot)
  // (the card's shape: its top along +y; laid face up that's toward -z, turned so its top faces the clip)
  const badge = slab(card, Y.badge.t, 0.8, 0).rotateY(Math.PI / 2)
  LANYARD_SHAPES = {
    strap,
    clip: slab(roundedRect(Y.clip.len, Y.clip.w, 3), Y.clip.t, 1, 0),
    hook: new TorusGeometry(6, 1.3, 8, 20).rotateX(Math.PI / 2).translate(Y.clip.len / 2 + 5, 1.4, 0),
    ring: new TorusGeometry(Y.ring.R, Y.ring.r, 8, 32).rotateX(Math.PI / 2).translate(0, Y.ring.r + 0.2, 0),
    keys: Y.keys.map((k) => slab(keyShape(k.len, k.w), 2, 0.5, 0)),
    badge,
    layout,
  }
  return LANYARD_SHAPES
}
/** the strap's repeating print: COOPESA in white, a pale chevron between (one tile, 110 along) */
function lanyardPrint() {
  const t = canvasTex(Y.w, 110, 8, (g, Wd, H) => {
    const k = Wd / Y.w
    g.fillStyle = Y.colors.strap
    g.fillRect(0, 0, Wd, H)
    g.save()
    g.translate(Wd / 2, H * 0.4)
    g.rotate(Math.PI / 2)
    g.fillStyle = Y.colors.print
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `bold ${10 * k}px Arial, sans-serif`
    g.fillText(Y.text, 0, 0)
    g.restore()
    // the chevron
    g.save()
    g.translate(Wd / 2, H * 0.86)
    g.strokeStyle = Y.colors.mark
    g.lineWidth = 2.2 * k
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(-6 * k, -3 * k)
    g.lineTo(0, 4 * k)
    g.lineTo(6 * k, -3 * k)
    g.stroke()
    g.restore()
  })
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}
export function LanyardModel() {
  const s = lanyardShapes()
  const L2 = s.layout
  const mat = useMemo(
    () => ({
      strap: new MeshStandardMaterial({ map: lanyardPrint(), roughness: 0.85 }),
      metal: new MeshStandardMaterial({ color: Y.colors.metal, roughness: 0.35 }),
      brass: new MeshStandardMaterial({ color: Y.colors.brass, roughness: 0.4 }),
      badge: new MeshStandardMaterial({ color: Y.colors.badge, roughness: 0.4, transparent: true, opacity: 0.92 }),
    }),
    [],
  )
  return (
    <group>
      <mesh geometry={s.strap} material={mat.strap} castShadow receiveShadow />
      <group position={[L2.clip.p.x, Y.t * 2 + 0.4, L2.clip.p.z]} rotation={[0, L2.clip.yaw, 0]}>
        <mesh geometry={s.clip} material={mat.metal} castShadow receiveShadow position={[0, -Y.t - 0.4, 0]} />
        <mesh geometry={s.hook} material={mat.metal} castShadow />
      </group>
      <mesh geometry={s.ring} material={mat.metal} position={[L2.ring.x, 0, L2.ring.z]} castShadow />
      {L2.keys.map((k, i) => (
        <group key={i} position={[k.x, 0.3 + i * 2.1, k.z]} rotation={[0, k.yaw, 0]}>
          <mesh geometry={s.keys[i]} material={i ? mat.brass : mat.metal} castShadow receiveShadow position={[(Y.keys[i].w / 2) * 0.45, 0, 0]} />
        </group>
      ))}
      <group position={[L2.badge.p.x, 0, L2.badge.p.z]} rotation={[0, L2.badge.yaw, 0]}>
        <mesh geometry={s.badge} material={mat.badge} castShadow receiveShadow />
      </group>
    </group>
  )
}
/** the lanyard's footprint (w along x, d along z) */
export const lanyardSize = () => lanyardShapes().layout.size

// ---- live: each on the desk, to pick up, turn, put back
type LiveProps = { homeAt: () => Matrix4 | null; spawn: [number, number, number] }
function usePerchFor(key: string, label: string, homeAt: LiveProps['homeAt'], lift: number) {
  return usePerch({ key, label, perchAt: homeAt, approach: new Vector3(0, 1, 0), snap: 0, away: 120, lift })
}
const body = { colliders: false as const, restitution: 0.05, linearDamping: 0.5, angularDamping: 1 }

export function LiveLotion({ homeAt, spawn }: LiveProps) {
  const perch = usePerchFor('lotion', 'Return lotion', homeAt, LOTION_H + 40)
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} {...body} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <LotionModel />
        </group>
        <CylinderCollider args={[L.body.h / 2, L.body.r]} position={[0, L.body.h / 2, 0]} mass={L.mass - 0.02} friction={0.8} collisionGroups={ITEM} />
        <CylinderCollider args={[(LOTION_H - L.body.h) / 2, L.head.r]} position={[0, (LOTION_H + L.body.h) / 2, 0]} mass={0.02} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

export function LiveVaseline({ homeAt, spawn }: LiveProps) {
  const perch = usePerchFor('vaseline', 'Return Vaseline', homeAt, V.body + V.lid + 40)
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} {...body} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <VaselineModel />
        </group>
        <CylinderCollider args={[(V.body + V.lid) / 2, V.r]} position={[0, (V.body + V.lid) / 2, 0]} mass={V.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

export function LiveHairTie({ homeAt, spawn }: LiveProps) {
  const perch = usePerchFor('hairtie', 'Return hair tie', homeAt, 50)
  const h = 2 * HT.r + HT.wave.up
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} {...body} sound="soft" hold={perch.hold}>
        <group {...perch.hover.bind}>
          <HairTieModel />
        </group>
        <CylinderCollider args={[h / 2, HT.R + HT.r]} position={[0, h / 2, 0]} mass={HT.mass} friction={1} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

export function LiveWatch({ homeAt, spawn }: LiveProps) {
  const perch = usePerchFor('watch', 'Return watch', homeAt, 100)
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} {...body} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <WatchModel />
        </group>
        <ConvexHullCollider args={[watchShapes().hull]} mass={W.mass} friction={0.9} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

export function LiveLanyard({ homeAt, spawn }: LiveProps) {
  const perch = usePerchFor('lanyard', 'Return lanyard', homeAt, 50)
  const L2 = lanyardShapes().layout
  const each = (Y.mass * 0.5) / L2.segs.length
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} {...body} sound="soft" hold={perch.hold}>
        <group {...perch.hover.bind}>
          <LanyardModel />
        </group>
        {L2.segs.map((s, i) => (
          <CuboidCollider key={i} args={[s.len / 2 + 2, Y.t + 0.5, Y.w + Y.gap / 2]} position={[s.p.x, Y.t + 0.5, s.p.z]} rotation={[0, s.yaw, 0]} mass={each} friction={1} collisionGroups={ITEM} />
        ))}
        <CuboidCollider args={[Y.badge.h / 2, Y.badge.t / 2, Y.badge.w / 2]} position={[L2.badge.p.x, Y.badge.t / 2, L2.badge.p.z]} rotation={[0, L2.badge.yaw, 0]} mass={Y.mass * 0.25} friction={0.8} collisionGroups={ITEM} />
        <CylinderCollider args={[2, Y.ring.R + 10]} position={[L2.ring.x, 2, L2.ring.z]} mass={Y.mass * 0.25} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

