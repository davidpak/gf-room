import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Matrix4,
  Path,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  type Material,
  type Mesh,
} from 'three'
import { bruno } from '../quad/bruno'
import { pluck } from '../../lib/sound/pluck'
import { BODY, BRIDGE, DOTS, FRETS, FRET_WIRE, HEAD, JOIN, NECK, NUT, OUTLINE, PICK, PICKGUARD, ROSETTE, SCALE, SOUNDHOLE, STRINGS, depthAt, fretU, neckW, stringX, stringZ } from './spec'

/**
 * The Martin D-28 (./spec), in real millimetres, and playable:
 *
 *   strum   hold the left button and sweep across the strings over the soundhole (between the end of the
 *           board and the bridge): each one it crosses sounds (a quick sweep strums, a slow one picks), and
 *           shakes. Not over the fingerboard: that's for fretting
 *   fret    click on the fingerboard: that string's held down there (a pink fingertip) till it's clicked
 *           again; it sounds that note from then on
 *
 * Its frame: its tail at the origin, the neck up +y, the top's face at z = 0 facing +z (the back at
 * -depth), the treble side +x. Along it, u (./spec) runs from the nut toward the tail: y = END - u.
 */
export const END = JOIN + BODY.length // (the tail, in u)
const Y = (u: number) => END - u
const L = BODY.length

// ---- its materials: the toy look (matte, warm; darks plum, not black)
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  return t
}
let seed = 7
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
/** spruce: pale gold, its grain running the length of it, fine and straight */
const spruceTex = canvasTex(256, 64, (g) => {
  g.fillStyle = '#efcf96'
  g.fillRect(0, 0, 256, 64)
  for (let x = 0; x < 256; x += 2 + rand() * 4) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '176,120,60' : '255,236,200'},${0.08 + rand() * 0.12})`
    g.fillRect(x, 0, 0.8 + rand() * 1.4, 64)
  }
})
spruceTex?.repeat.set(1 / 256, 1 / 64) // (the top's uvs are its millimetres: a pixel a mm)
/** rosewood: dark red-brown, its grain swirling a little */
const roseTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#6e3a2b'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256
    g.strokeStyle = `rgba(${rand() < 0.5 ? '40,16,14' : '150,80,52'},${0.12 + rand() * 0.15})`
    g.lineWidth = 0.6 + rand() * 1.6
    g.beginPath()
    g.moveTo(x, 0)
    g.bezierCurveTo(x + (rand() - 0.5) * 30, 90, x + (rand() - 0.5) * 30, 170, x + (rand() - 0.5) * 20, 256)
    g.stroke()
  }
})
roseTex?.repeat.set(1 / 256, 1 / 256)
/** faux tortoise: amber, mottled dark */
const tortoiseTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#8a4a26'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 90; i++) {
    const r = 2 + rand() * 7
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
    gr.addColorStop(0, `rgba(${rand() < 0.4 ? '200,128,62' : '58,26,16'},0.32)`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.save()
    g.translate(rand() * 128, rand() * 128)
    g.scale(1, 0.5 + rand())
    g.fillStyle = gr
    g.fillRect(-r, -r, r * 2, r * 2)
    g.restore()
  }
})
tortoiseTex?.repeat.set(1 / 128, 1 / 128)
/** the headstock's rosewood plate, the old gold script on it */
const plateTex = canvasTex(256, 512, (g) => {
  g.fillStyle = '#4c2922'
  g.fillRect(0, 0, 256, 512)
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(20,8,8,${0.1 + rand() * 0.15})`
    g.fillRect(rand() * 256, 0, 1 + rand() * 2, 512)
  }
  g.fillStyle = '#e2bd72'
  g.textAlign = 'center'
  g.font = "italic 700 25px Georgia, 'Times New Roman', serif"
  g.fillText('C.F. Martin & Co', 128, 62)
  g.font = "600 15px Georgia, 'Times New Roman', serif"
  g.fillText('EST. 1833', 128, 86)
})
const M = {
  spruce: bruno({ map: spruceTex ?? undefined, color: '#ffffff', shade: '#a98fb3' }),
  rosewood: bruno({ map: roseTex ?? undefined, color: '#ffffff', shade: '#6d5a86' }),
  side: bruno({ color: '#6b3829', shade: '#5b4a78' }),
  mahogany: bruno({ color: '#7a4531', shade: '#5f4a7c' }),
  ebony: bruno({ color: '#2f2629', shade: '#2a2236' }),
  bone: bruno({ color: '#f3ebd9', shade: '#a99cbb' }),
  binding: bruno({ color: '#f6eedd', shade: '#aa9dbd' }),
  nickel: bruno({ color: '#dcdce6', shade: '#8f8aa8', sheen: 0.45 }),
  bronze: bruno({ color: '#d6ad70', shade: '#8d7890', sheen: 0.35 }),
  steel: bruno({ color: '#e7e9f0', shade: '#9a96b0', sheen: 0.45 }),
  pearl: bruno({ color: '#f8f4f0', shade: '#b4a9c6', sheen: 0.3 }),
  tortoise: bruno({ map: tortoiseTex ?? undefined, color: '#ffffff', shade: '#6a5580' }),
  plate: bruno({ map: plateTex ?? undefined, color: '#ffffff', shade: '#5a4a72' }),
  hole: bruno({ color: '#221a1d', shade: '#1c1624', lit: 0.3, side: DoubleSide }),
  rosette: bruno({ color: '#ffffff', shade: '#9d8fb2' }),
  finger: bruno({ color: '#f7a8bf', shade: '#b77f9c', emissive: '#f7a8bf', emissiveIntensity: 0.25 }),
  shake: bruno({ color: '#fff4dc', transparent: true, opacity: 0.45, depthWrite: false, side: DoubleSide, warm: 0 }),
  pick: bruno({ color: '#f59ab4', shade: '#b27a9a', sheen: 0.3 }),
}
const TUBE = new CylinderGeometry(1, 1, 1, 10)
const BALL = new SphereGeometry(1, 16, 10)
const HOLE_WALL = new CylinderGeometry(1, 1, 1, 48, 1, true)

// ---- its shapes, built once
/** the body's outline, round from the top of it (the neck) down the treble side and back up the bass */
function outlineShape(inset = 0) {
  const s = new Shape()
  const pts: [number, number][] = []
  for (const [d, w] of OUTLINE) if (d >= inset && d <= L - inset) pts.push([Math.max(0, w - inset), L - d])
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(-pts[i][0], pts[i][1])
  return s
}
/** a flat face to the body's outline, its uvs its millimetres, set at z by where it is along the body */
function face(shape: Shape, z: (s: number) => number, flip = false) {
  const g = new ShapeGeometry(shape, 48)
  if (flip) g.rotateY(Math.PI) // (facing -z: the back; the outline's symmetric, so mirroring it is fine)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setZ(i, z(L - p.getY(i)))
  g.computeVertexNormals()
  return g
}
/** a band round the body's side, from z = top(s) down to z = bottom(s) */
function band(top: (s: number) => number, bottom: (s: number) => number) {
  const loop: [number, number, number][] = [] // x, y, s
  for (const [d, w] of OUTLINE) loop.push([w, L - d, d])
  for (let i = OUTLINE.length - 2; i > 0; i--) loop.push([-OUTLINE[i][1], L - OUTLINE[i][0], OUTLINE[i][0]])
  const pos: number[] = []
  for (const [x, y, s] of loop) pos.push(x, y, top(s), x, y, bottom(s))
  const idx: number[] = []
  const n = loop.length
  for (let i = 0; i < n; i++) {
    const a = i * 2
    const b = ((i + 1) % n) * 2
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
/** the neck: a low oval under the board, from the nut to the heel, flaring down into the body at the heel */
function neckGeometry() {
  const secs: number[] = []
  for (let u = -NUT.t - 2; u < JOIN - NECK.heel; u += 12) secs.push(u)
  for (let u = JOIN - NECK.heel; u <= JOIN; u += 4) secs.push(u)
  const R = 20
  const pos: number[] = []
  for (const u of secs) {
    const hw = neckW(Math.max(0, u)) / 2
    const k = Math.min(1, Math.max(0, u / fretU(9)))
    let d = NECK.shaft[0] + (NECK.shaft[1] - NECK.shaft[0]) * k
    const h = (u - (JOIN - NECK.heel)) / NECK.heel
    if (h > 0) d += (BODY.depthHeel - 4 - d) * (h * h * (3 - 2 * h))
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI
      pos.push(Math.cos(a) * hw, Y(u), -Math.sin(a) * d)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < secs.length - 1; i++)
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j
      const b = a + R + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
/** the fingerboard: ebony, widening from the nut, into the body past the 20th fret */
function boardGeometry() {
  const s = new Shape()
  const e = NECK.boardEnd
  s.moveTo(-NECK.nut / 2, Y(0))
  s.lineTo(NECK.nut / 2, Y(0))
  s.lineTo(neckW(e) / 2, Y(e))
  s.lineTo(-neckW(e) / 2, Y(e))
  s.closePath()
  return new ExtrudeGeometry(s, { depth: NECK.board, bevelEnabled: false })
}
/** the bridge: ebony, a belly bridge (its back edge dropping in the middle), its wings rounded */
function bridgeGeometry() {
  const { u0, u1, belly, half } = BRIDGE
  const r = (u1 - u0) / 2
  const s = new Shape()
  s.moveTo(-half + r, Y(u0))
  s.lineTo(half - r, Y(u0))
  s.absarc(half - r, Y(u0 + r), r, Math.PI / 2, -Math.PI / 2, true)
  for (let i = 0; i <= 24; i++) {
    const x = half - r - ((2 * (half - r)) * i) / 24
    const b = Math.abs(x) < 44 ? Math.cos((Math.PI * x) / 88) ** 2 : 0
    s.lineTo(x, Y(u1 + (belly - u1) * b))
  }
  s.absarc(-half + r, Y(u0 + r), r, -Math.PI / 2, Math.PI / 2, true)
  return new ExtrudeGeometry(s, { depth: BRIDGE.h - 1.5, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 3, curveSegments: 12 })
}
/** the headstock: a solid plate tapering out toward its top, square-cornered but softened */
const headW = (v: number) => HEAD.nutW + ((HEAD.topW - HEAD.nutW) * v) / HEAD.length
function headShape(inset = 0) {
  const s = new Shape()
  const r = 6
  s.moveTo(-headW(0) / 2 + inset, inset)
  s.lineTo(headW(0) / 2 - inset, inset)
  s.lineTo(headW(HEAD.length) / 2 - inset, HEAD.length - r - inset)
  s.quadraticCurveTo(headW(HEAD.length) / 2 - inset, HEAD.length - inset, headW(HEAD.length) / 2 - r - inset, HEAD.length - inset)
  s.lineTo(-headW(HEAD.length) / 2 + r + inset, HEAD.length - inset)
  s.quadraticCurveTo(-headW(HEAD.length) / 2 + inset, HEAD.length - inset, -headW(HEAD.length) / 2 + inset, HEAD.length - r - inset)
  s.closePath()
  return s
}
/** a lens: the blur a string makes shaking, fattest in its middle (a unit long, a unit wide, along y) */
const LENS = (() => {
  const s = new Shape()
  s.moveTo(0, 0)
  for (let i = 1; i <= 24; i++) s.lineTo(Math.sin((Math.PI * i) / 24) * 0.5, i / 24)
  for (let i = 23; i > 0; i--) s.lineTo(-Math.sin((Math.PI * i) / 24) * 0.5, i / 24)
  return new ShapeGeometry(s)
})()
/** the pick: a 351, rounded off */
const PICK_GEO = (() => {
  const s = new Shape()
  const { w, l } = PICK
  s.moveTo(0, -l / 2)
  s.bezierCurveTo(w * 0.28, -l / 2, w / 2, l * 0.05, w / 2, l * 0.22)
  s.bezierCurveTo(w / 2, l * 0.45, w * 0.2, l / 2, 0, l / 2)
  s.bezierCurveTo(-w * 0.2, l / 2, -w / 2, l * 0.45, -w / 2, l * 0.22)
  s.bezierCurveTo(-w / 2, l * 0.05, -w * 0.28, -l / 2, 0, -l / 2)
  return new ExtrudeGeometry(s, { depth: PICK.t, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.6, bevelSegments: 2 })
})()

/** where its tuner posts are, and the strings' ends: the head's frame, turned back from the nut */
const HEAD_AT = new Vector3(0, Y(-NUT.t), 0)
const HEAD_Q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (-HEAD.back * Math.PI) / 180)
/** string i's post (bass side: E far, A, D near; treble side: G near, B, E far), on the head */
const POST = [
  [-1, 2],
  [-1, 1],
  [-1, 0],
  [1, 0],
  [1, 1],
  [1, 2],
] as const
const postXY = (i: number): [number, number] => {
  const [side, k] = POST[i]
  const v = HEAD.posts[k]
  return [side * (headW(v) / 2 - 13), v]
}
const toModel = (x: number, v: number, z: number) => new Vector3(x, v, z).applyQuaternion(HEAD_Q).add(HEAD_AT)

/** a straight rod from a to b */
function rodMatrix(a: Vector3, b: Vector3, r: number) {
  const d = b.clone().sub(a)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize())
  return new Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, new Vector3(r, d.length(), r))
}
function Rod({ a, b, r, m }: { a: Vector3; b: Vector3; r: number; m: Material }) {
  const mat = useMemo(() => rodMatrix(a, b, r), [a, b, r])
  return <mesh geometry={TUBE} material={m} matrix={mat} matrixAutoUpdate={false} castShadow />
}

/** each string's path: its pin, over the saddle, to the nut, round its post */
const saddleU = (i: number) => BRIDGE.saddle.bass + ((BRIDGE.saddle.treble - BRIDGE.saddle.bass) * i) / 5
const PATHS = STRINGS.set.map((s, i) => {
  const r = 0.35 + s.gauge * 25.4 * 0.55 // (thickened: a real one's a third of a mm to a mm and a half)
  const pin = new Vector3(stringX(i, SCALE) * 1.02, Y(BRIDGE.pins), BRIDGE.h + 1)
  const saddle = new Vector3(stringX(i, SCALE), Y(saddleU(i)), stringZ(SCALE))
  const nut = new Vector3(stringX(i, 0), Y(-NUT.t / 2), NECK.board + STRINGS.overNut)
  const [px, pv] = postXY(i)
  const post = toModel(px, pv, 7)
  return { r, pin, saddle, nut, post, wound: s.wound }
})

/** where you strum: over the soundhole, from the board's end to the bridge */
const STRUM = { u0: NECK.boardEnd, u1: BRIDGE.u0 - 2 }
/** `playable`: it can be played (strummed, fretted); off, it's just a guitar, and a press or a click on it goes on
 *  through (to whatever the guitar's own click or drag does: pick it up, go in to it) */
export function GuitarModel({ playable = true }: { playable?: boolean }) {
  const controls = useThree((st) => st.controls as { enabled: boolean } | null)
  const geo = useMemo(() => {
    const top = outlineShape()
    const holed = outlineShape()
    const hole = new Path()
    hole.absarc(0, Y(SOUNDHOLE.u), SOUNDHOLE.r, 0, Math.PI * 2, true)
    holed.holes.push(hole)
    const bind = outlineShape()
    bind.holes.push(new Path(outlineShape(2.6).getPoints(64).reverse()))
    const guard = new Shape(PICKGUARD.map(([x, u]) => new Vector2(x, Y(u))))
    const head = new ExtrudeGeometry(headShape(), { depth: HEAD.t - 3, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2 })
    head.translate(0, 0, -HEAD.t + 1.5)
    const plate = new ShapeGeometry(headShape(2))
    const pl = plate.attributes.uv
    const pp = plate.attributes.position
    for (let i = 0; i < pl.count; i++) pl.setXY(i, pp.getX(i) / HEAD.topW + 0.5, pp.getY(i) / HEAD.length)
    return {
      top: face(holed, () => 0),
      binding: face(bind, () => 0.35),
      back: face(top, (s) => -depthAt(s), true),
      bindTop: band(() => 0, () => -3.5),
      side: band(() => -3.5, (s) => -depthAt(s) + 3.5),
      bindBack: band((s) => -depthAt(s) + 3.5, (s) => -depthAt(s)),
      guard: new ShapeGeometry(guard),
      neck: neckGeometry(),
      board: boardGeometry(),
      bridge: bridgeGeometry(),
      head,
      plate,
      rosette: new RingGeometry(ROSETTE.inner, ROSETTE.outer, 96, 1),
    }
  }, [])
  // the rosette: style 28's rings of fine black and white lines
  const rosetteTex = useMemo(
    () =>
      canvasTex(512, 512, (g) => {
        const c = 256
        const k = 256 / ROSETTE.outer
        const ring = (r0: number, r1: number, col: string) => {
          g.fillStyle = col
          g.beginPath()
          g.arc(c, c, r1 * k, 0, Math.PI * 2)
          g.arc(c, c, r0 * k, 0, Math.PI * 2, true)
          g.fill()
        }
        ring(ROSETTE.inner, ROSETTE.outer, '#efcf96')
        const lines: [number, number, string][] = [
          [55, 56.2, '#241a1c'],
          [56.2, 56.9, '#f4ecdc'],
          [56.9, 58.1, '#241a1c'],
          [59, 59.6, '#241a1c'],
          [59.6, 60.2, '#f4ecdc'],
          [60.2, 60.8, '#241a1c'],
          [60.8, 61.4, '#f4ecdc'],
          [61.4, 62, '#241a1c'],
          [62.9, 64.1, '#241a1c'],
          [64.1, 64.8, '#f4ecdc'],
          [64.8, 66, '#241a1c'],
        ]
        for (const [a, b, col] of lines) ring(a, b, col)
      }),
    [],
  )
  useEffect(() => {
    if (!rosetteTex) return
    rosetteTex.wrapS = rosetteTex.wrapT = 1001 // (clamp)
    rosetteTex.repeat.set(1, 1)
    const uv = geo.rosette.attributes.uv
    const p = geo.rosette.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (2 * ROSETTE.outer) + 0.5, p.getY(i) / (2 * ROSETTE.outer) + 0.5)
    uv.needsUpdate = true
    M.rosette.map = rosetteTex
    M.rosette.needsUpdate = true
  }, [geo, rosetteTex])

  // ---- playing it
  const [held, setHeld] = useState<number[]>([0, 0, 0, 0, 0, 0])
  const heldRef = useRef(held)
  heldRef.current = held
  const rang = useRef<number[]>([-1e9, -1e9, -1e9, -1e9, -1e9, -1e9])
  const loud = useRef<number[]>([0, 0, 0, 0, 0, 0])
  const sound = (i: number, strength: number, delay = 0) => {
    pluck(i, STRINGS.set[i].hz * Math.pow(2, heldRef.current[i] / 12), strength, delay)
    rang.current[i] = performance.now() + delay * 1000
    loud.current[i] = strength
  }
  const last = useRef<{ x: number; u: number } | null>(null)
  const localOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = e.object.parent!.worldToLocal(e.point.clone()) // (in its frame: the plane itself is stretched)
    return { x: p.x, u: END - p.y }
  }
  const inStrum = (u: number) => u >= STRUM.u0 && u <= STRUM.u1
  const cursor = (u: number, held: boolean) => (document.body.style.cursor = inStrum(u) ? (held ? 'grabbing' : 'grab') : u <= NECK.boardEnd ? 'pointer' : '')
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!playable) return
    e.stopPropagation()
    const now = localOf(e)
    const held = (e.buttons & 1) === 1
    cursor(now.u, held)
    const was = last.current
    last.current = now
    if (!was || !held || !inStrum(now.u) || !inStrum(was.u)) return
    // every string it crossed on the way, in the order it met them
    const crossed: { i: number; d: number }[] = []
    for (let i = 0; i < 6; i++) {
      const u = (was.u + now.u) / 2
      const sx = stringX(i, u)
      if ((was.x - sx) * (now.x - sx) < 0) crossed.push({ i, d: Math.abs(sx - was.x) })
    }
    crossed.sort((a, b) => a.d - b.d)
    const speed = Math.min(1, 0.55 + Math.abs(now.x - was.x) / 60)
    crossed.forEach((c, k) => sound(c.i, speed, k * 0.012))
  }
  // a press on the strings is for playing: not for picking it up, nor for turning the view
  const down = (e: ThreeEvent<PointerEvent>) => {
    if (!playable || e.button !== 0) return
    e.stopPropagation()
    last.current = localOf(e)
    cursor(last.current.u, true)
    if (controls) {
      controls.enabled = false
      const up = () => {
        controls.enabled = true
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointerup', up)
    }
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!playable) return
    e.stopPropagation()
    const { x, u } = localOf(e)
    if (u < 0 || u > NECK.boardEnd) return
    // the string nearest, the fret just past where it was pressed
    let i = 0
    for (let k = 1; k < 6; k++) if (Math.abs(stringX(k, u) - x) < Math.abs(stringX(i, u) - x)) i = k
    let n = 1
    while (n < FRETS && fretU(n) < u) n++
    const next = heldRef.current.slice()
    next[i] = next[i] === n ? 0 : n
    heldRef.current = next
    setHeld(next)
    sound(i, 0.7)
  }

  // ---- the strings shaking: a blur along the part that rings (from the fret it's held at, or the nut)
  const lenses = useRef<(Mesh | null)[]>([])
  useFrame(() => {
    const now = performance.now()
    for (let i = 0; i < 6; i++) {
      const m = lenses.current[i]
      if (!m) continue
      const t = (now - rang.current[i]) / 1000
      const amp = t < 0 ? 0 : loud.current[i] * Math.exp(-t * 2.2) * (0.75 + 0.25 * Math.sin(now * 0.09 + i))
      m.visible = amp > 0.03
      if (!m.visible) continue
      const f = heldRef.current[i]
      const from = f ? fretU(f) : -NUT.t / 2
      const a = new Vector3(stringX(i, from), Y(from), stringZ(from) + 0.3)
      const b = PATHS[i].saddle
      const d = b.clone().sub(a)
      m.position.copy(a)
      m.rotation.set(0, 0, -Math.atan2(d.x, d.y))
      m.scale.set(PATHS[i].r * 2 + amp * 3.2, d.length(), 1)
    }
  })

  const heelU = JOIN - 10
  return (
    <group>
      {/* the body: the spruce top (the soundhole cut in it), its binding, the rosewood back and sides */}
      <mesh geometry={geo.top} material={M.spruce} receiveShadow castShadow />
      <mesh geometry={geo.binding} material={M.binding} />
      <mesh geometry={geo.back} material={M.rosewood} castShadow />
      <mesh geometry={geo.bindTop} material={M.binding} castShadow />
      <mesh geometry={geo.side} material={M.side} castShadow />
      <mesh geometry={geo.bindBack} material={M.binding} />
      {/* the soundhole: dark inside, the rosette round it; the pickguard */}
      <group position={[0, Y(SOUNDHOLE.u), 0]}>
        <mesh material={M.hole} position={[0, 0, -40]}>
          <circleGeometry args={[SOUNDHOLE.r + 2, 48]} />
        </mesh>
        <mesh geometry={HOLE_WALL} material={M.hole} position={[0, 0, -20]} rotation={[Math.PI / 2, 0, 0]} scale={[SOUNDHOLE.r, 40, SOUNDHOLE.r]} />
      </group>
      <mesh geometry={geo.rosette} material={M.rosette} position={[0, Y(SOUNDHOLE.u), 0.3]} />
      <mesh geometry={geo.guard} material={M.tortoise} position={[0, 0, 0.5]} />
      {/* the bridge, its saddle, its pins */}
      <mesh geometry={geo.bridge} material={M.ebony} castShadow />
      <mesh
        geometry={TUBE}
        material={M.bone}
        position={[0, Y((BRIDGE.saddle.bass + BRIDGE.saddle.treble) / 2), BRIDGE.h + 0.5]}
        rotation={[0, 0, Math.PI / 2 - Math.atan2(BRIDGE.saddle.bass - BRIDGE.saddle.treble, 2 * BRIDGE.saddle.half)]}
        scale={[BRIDGE.saddle.t / 2, BRIDGE.saddle.half * 2, 3.5]}
      />
      {PATHS.map((p, i) => (
        <group key={i} position={[p.pin.x, p.pin.y, BRIDGE.h]}>
          <mesh geometry={TUBE} material={M.bone} rotation={[Math.PI / 2, 0, 0]} scale={[2.6, 3, 2.6]} position={[0, 0, 1]} />
          <mesh geometry={BALL} material={M.tortoise} scale={[1.1, 1.1, 0.5]} position={[0, 0, 2.6]} />
        </group>
      ))}
      {/* the neck and its heel; the board, its frets and dots; the nut */}
      <mesh geometry={geo.neck} material={M.mahogany} castShadow />
      <mesh geometry={geo.board} material={M.ebony} castShadow />
      {Array.from({ length: FRETS }, (_, k) => {
        const u = fretU(k + 1)
        return <mesh key={k} geometry={TUBE} material={M.nickel} position={[0, Y(u), NECK.board]} rotation={[0, 0, Math.PI / 2]} scale={[FRET_WIRE.w / 2, neckW(u) - 1, FRET_WIRE.h]} />
      })}
      {DOTS.map((n) => (
        <mesh key={n} material={M.pearl} position={[0, Y((fretU(n - 1) + fretU(n)) / 2), NECK.board + 0.05]}>
          <circleGeometry args={[3, 20]} />
        </mesh>
      ))}
      <mesh geometry={TUBE} material={M.bone} position={[0, Y(-NUT.t / 2), (NECK.board + NUT.h) / 2 - 0.5]} rotation={[0, 0, Math.PI / 2]} scale={[NUT.t / 2, NECK.nut, (NECK.board + NUT.h) / 2 + 1]} />
      {/* its endpin, and the strap button on its heel */}
      <mesh geometry={TUBE} material={M.ebony} position={[0, -5, -BODY.depthTail / 2]} scale={[4, 10, 4]} />
      <mesh geometry={BALL} material={M.bone} position={[0, -10, -BODY.depthTail / 2]} scale={[5, 3, 5]} />
      <mesh geometry={TUBE} material={M.ebony} position={[0, Y(heelU), -BODY.depthHeel + 2]} rotation={[Math.PI / 2, 0, 0]} scale={[4, 8, 4]} />
      <mesh geometry={BALL} material={M.bone} position={[0, Y(heelU), -BODY.depthHeel - 3]} scale={[5, 5, 2.5]} />
      {/* the headstock: turned back from the nut, its rosewood plate and the script, the tuners */}
      <group position={HEAD_AT} quaternion={HEAD_Q}>
        <mesh geometry={geo.head} material={M.mahogany} castShadow />
        <mesh geometry={geo.plate} material={M.plate} position={[0, 0, 0.35]} />
        {POST.map((_, i) => {
          const [x, v] = postXY(i)
          const side = POST[i][0]
          const w = headW(v) / 2
          return (
            <group key={i}>
              <mesh geometry={TUBE} material={M.nickel} position={[x, v, 0.9]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 1.8, 5]} />
              <mesh geometry={TUBE} material={M.nickel} position={[x, v, 6]} rotation={[Math.PI / 2, 0, 0]} scale={[3, 11, 3]} />
              {/* behind: the open gear, its shaft out the side, the butterbean knob */}
              <mesh geometry={TUBE} material={M.nickel} position={[x, v, -HEAD.t - 2]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 3, 8]} />
              <mesh geometry={TUBE} material={M.nickel} position={[side * (w + 6), v, -HEAD.t - 5]} rotation={[0, 0, Math.PI / 2]} scale={[2, 26, 2]} />
              <mesh geometry={BALL} material={M.nickel} position={[side * (w + 21), v, -HEAD.t - 5]} scale={[4.5, 10.5, 7]} castShadow />
            </group>
          )
        })}
      </group>
      {/* the strings: phosphor bronze wound, plain steel; each its pin, the saddle, the nut, its post */}
      {PATHS.map((p, i) => (
        <group key={i}>
          <Rod a={p.pin} b={p.saddle} r={p.r} m={p.wound ? M.bronze : M.steel} />
          <Rod a={p.saddle} b={p.nut} r={p.r} m={p.wound ? M.bronze : M.steel} />
          <Rod a={p.nut} b={p.post} r={p.r} m={p.wound ? M.bronze : M.steel} />
          <mesh ref={(m) => void (lenses.current[i] = m)} geometry={LENS} material={M.shake} visible={false} />
        </group>
      ))}
      {/* the pick, tucked in the strings by the first fret */}
      <mesh geometry={PICK_GEO} material={M.pick} position={[2, Y(22), NECK.board + 2]} rotation={[0.22, -0.1, 0.7]} castShadow />
      {/* fingertips on the strings that are held */}
      {held.map((f, i) =>
        f ? (
          <mesh key={i} geometry={BALL} material={M.finger} position={[stringX(i, fretU(f) - 0.3 * (fretU(f) - fretU(f - 1))), Y(fretU(f) - 0.3 * (fretU(f) - fretU(f - 1))), stringZ(fretU(f)) + 0.5]} scale={[4.2, 4.2, 2.2]} />
        ) : null,
      )}
      {/* where you play it: over the strings, the whole length of them (sweep over the soundhole to strum, click the board to fret) */}
      {playable && (
        <mesh
          position={[0, Y(BRIDGE.u0 / 2), stringZ(SCALE) + 1.5]}
          scale={[STRINGS.saddle + 26, BRIDGE.u0 + NUT.t, 1]}
          onPointerMove={move}
          onPointerDown={down}
          onPointerEnter={(e) => (last.current = localOf(e))}
          onPointerLeave={() => ((last.current = null), (document.body.style.cursor = ''))}
          onClick={click}
        >
          <planeGeometry />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

/** a sturdy set of boxes for its physics (in its frame, real mm): the body, the neck, the head */
export const GUITAR_BOXES: { half: [number, number, number]; at: [number, number, number] }[] = [
  { half: [BODY.lower / 2 - 30, L / 2 - 20, BODY.depthTail / 2 - 4], at: [0, L / 2, -BODY.depthTail / 2] },
  { half: [28, JOIN / 2, 13], at: [0, L + JOIN / 2, -7] },
  { half: [HEAD.topW / 2, HEAD.length * 0.45, 12], at: [0, Y(-NUT.t) + HEAD.length * 0.45 * Math.cos((HEAD.back * Math.PI) / 180), -HEAD.length * 0.45 * Math.sin((HEAD.back * Math.PI) / 180) - 7] },
]
