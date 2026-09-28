import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, LatheGeometry, RepeatWrapping, SRGBColorSpace, Vector2, Vector3, type Group, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Holdable } from '../../lib/physics/Holdable'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { bruno } from './bruno'
import { addCookie, useCookieCount } from './cookies'
import { clickSpot, frameAround, getLook, type Spot } from './look'
import { onReset } from './reset'
import type { CarState, Obstacle } from './Car'
import { SET } from './set'

/**
 * The cookie stand on the lawn (Bruno Simon's "accept cookie", a nod to Cookie Clicker): a pop-up
 * canopy in pink and cream stripes over a folding table with a gingham cloth, a little retro toaster
 * oven on it glowing warm, a cooling rack, and a chalkboard menu of four cookies out front, like Bruno's
 * project boards. The count of every cookie handed out on a wooden plank on the canopy's peak
 * (./cookies: this browser's, or everyone's once a shared counter's set up).
 *
 *   the oven     click it (or take the prompt as you drive up): its window glows up, the door drops,
 *                and out hops a warm cookie of the kind picked on the menu, a toy on the grass like
 *                everything else (they go after a while)
 *   the stand    click the canopy (its roof, legs, table, the plank) and the camera glides in to take it
 *                all in, count and all (./look); there, ← → pick a cookie on the menu (or click its
 *                row), Enter or the oven bakes it, Esc goes back
 *   the sign     out on the corner of the lawn, big: FREE COOKIES (./Physical: a loose thing)
 *
 * In REAL millimetres, at the toy scale K: a 3 × 3 m pop-up canopy (legs 2.1 m, peak 2.9 m), a 6 ft
 * folding table (1830 × 760, 740 high), a countertop oven (460 × 280 × 360, drawn half as big again).
 * The cookies are toys: far bigger than real, like Bruno's. The stand faces +z at its spot (./set).
 */
const K = 0.16
const TABLE = { w: 1830, d: 760, h: 740 }
const CANOPY = { half: 1500, eave: 2100, peak: 2900, over: 60 }
const OVEN = { w: 460, h: 280, d: 360, x: -420 } // (on the table, left of middle)
const OVEN_TOY = 1.5 // (drawn half as big again: it's the star, it has to read from the car)
const COOKIE = { r: 30, t: 12 } // (toy mm, not real: chunky)
const MENU = { w: 760, len: 1120, lean: 0.24, at: [1180, 0, 820] as [number, number, number], rot: -0.3 }

// ---- the cookies there are, and which one's picked
export const KINDS = [
  { name: 'chocolate chip', dough: '#d99d5b', bits: ['#4a2d24'], n: 7, bit: 'chunk' },
  { name: 'm&m', dough: '#e4b77f', bits: ['#e0403a', '#2f7fd6', '#f4c430', '#3aa655', '#f08a24', '#6b3f2a'], n: 9, bit: 'candy' },
  { name: 'double chocolate', dough: '#5b3527', bits: ['#f6efe3'], n: 7, bit: 'chunk' },
  { name: 'snickerdoodle', dough: '#ecce9f', bits: ['#a8683d'], n: 16, bit: 'dust' },
] as const
let choice = 0
const csubs = new Set<() => void>()
const choose = (i: number) => {
  choice = (i + KINDS.length) % KINDS.length
  csubs.forEach((f) => f())
}
const useChoice = () => useSyncExternalStore((f) => (csubs.add(f), () => void csubs.delete(f)), () => choice)

// ---- materials
const FRAME = bruno({ color: '#d7d9df', shade: '#9794ad', sheen: 0.3 })
const WOOD = bruno({ color: '#c99a68', shade: '#927796' })
const HINGE = bruno({ color: '#9a9ca6', shade: '#6d6a86', sheen: 0.4 })
const MINT = bruno({ color: '#a9dcc8', shade: '#7f8fb8', sheen: 0.35 })
const CREAM = bruno({ color: '#fbf1e2', shade: '#b5a6c6' })
const CHROME = bruno({ color: '#e4e6ec', shade: '#a19eb8', sheen: 0.5 })
const DARK = bruno({ color: '#2c2830' })
const LAMP = bruno({ color: '#ff6a5c', emissive: '#ff4a3c', emissiveIntensity: 0.8, warm: 0 })
const RBOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.2)
const TUBE = new CylinderGeometry(1, 1, 1, 10)
const mats = new Map<string, Material>()
const matOf = (c: string) => mats.get(c) ?? (mats.set(c, bruno({ color: c, shade: '#8f7a9c' })), mats.get(c)!)

/** a rounded box, real mm */
function Block({ size, at, m, rot }: { size: [number, number, number]; at: [number, number, number]; m: Material; rot?: [number, number, number] }) {
  return <mesh geometry={RBOX} material={m} position={at} rotation={rot} scale={size} castShadow receiveShadow />
}

// ---- painted: the canopy's stripes (and its scalloped valance), the gingham, the chalkboards, the plank
const PINK = '#f5b3c6'
const CREAMY = '#fdf2e4'
function stripes(scallop: boolean) {
  const W = 512
  const H = scallop ? 96 : 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? CREAMY : PINK
    g.fillRect((i * W) / 8, 0, W / 8, H)
  }
  const map = new CanvasTexture(c)
  map.colorSpace = SRGBColorSpace
  if (!scallop) return { map, alpha: null }
  // the valance's scalloped hem: cut round under each stripe (its alpha: kept where white)
  const a = document.createElement('canvas')
  a.width = W
  a.height = H
  const ga = a.getContext('2d')!
  ga.fillStyle = '#000'
  ga.fillRect(0, 0, W, H)
  ga.fillStyle = '#fff'
  ga.fillRect(0, 0, W, H * 0.55)
  for (let i = 0; i < 8; i++) {
    ga.beginPath()
    ga.arc(((i + 0.5) * W) / 8, H * 0.55, W / 16, 0, Math.PI)
    ga.fill()
  }
  g.fillStyle = 'rgba(120,60,80,0.18)'
  g.fillRect(0, H * 0.08, W, 3)
  return { map, alpha: new CanvasTexture(a) }
}
function gingham() {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  g.fillStyle = '#fff8f4'
  g.fillRect(0, 0, N, N)
  g.fillStyle = 'rgba(236,120,150,0.45)'
  for (let i = 0; i < 8; i += 2) {
    g.fillRect((i * N) / 8, 0, N / 8, N)
    g.fillRect(0, (i * N) / 8, N, N / 8)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}
const HAND = "'Gaegu', 'Nunito', cursive"
/** a chalkboard's face: the green-black slate and its chalk dust; `draw` writes on it */
function slate(W: number, H: number, draw: (g: CanvasRenderingContext2D) => void, canvas?: HTMLCanvasElement) {
  const c = canvas ?? document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  let s = 5
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  // the slate: deep green-black, the pale clouds where it's been wiped, fine dust
  g.fillStyle = '#28332f'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 14; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = 60 + rand() * 140
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, 'rgba(220,230,220,0.07)')
    gr.addColorStop(1, 'rgba(220,230,220,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < W * H * 0.006; i++) {
    g.fillStyle = `rgba(255,255,255,${rand() * 0.06})`
    g.fillRect(rand() * W, rand() * H, 1.5, 1.5)
  }
  // a chalk border round it, a little star in each corner
  g.strokeStyle = 'rgba(251,247,239,0.7)'
  g.lineWidth = 4
  g.setLineDash([22, 9])
  g.strokeRect(22, 22, W - 44, H - 44)
  g.setLineDash([])
  for (const [x, y] of [
    [22, 22],
    [W - 22, 22],
    [22, H - 22],
    [W - 22, H - 22],
  ])
    star(g, x, y, 11)
  g.textBaseline = 'middle'
  draw(g)
  // the chalk's grain: little gaps knocked out of everything written
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < W * H * 0.02; i++) {
    g.fillStyle = `rgba(0,0,0,${rand() * 0.35})`
    g.fillRect(rand() * W, rand() * H, 1.5, 1.5)
  }
  g.globalCompositeOperation = 'destination-over'
  g.fillStyle = '#28332f'
  g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = 'source-over'
  return c
}
/** a little chalk star (four points) */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, colour = '#fbf7ef') {
  g.fillStyle = colour
  g.beginPath()
  g.moveTo(x, y - r)
  g.quadraticCurveTo(x, y, x + r, y)
  g.quadraticCurveTo(x, y, x, y + r)
  g.quadraticCurveTo(x, y, x - r, y)
  g.quadraticCurveTo(x, y, x, y - r)
  g.fill()
}
/** written in chalk: the strokes a touch soft at their edges */
function chalk(g: CanvasRenderingContext2D, text: string, x: number, y: number, colour = '#fbf7ef') {
  g.fillStyle = colour
  g.globalAlpha = 0.35
  g.fillText(text, x + 1.5, y + 1)
  g.globalAlpha = 0.95
  g.fillText(text, x, y)
  g.globalAlpha = 1
}
/** a cookie drawn in chalk: its round, its chips */
function chalkCookie(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.strokeStyle = '#f2c38f'
  g.lineWidth = 6
  g.beginPath()
  g.arc(x, y, r, 0.2, Math.PI * 2 - 0.1)
  g.stroke()
  g.fillStyle = '#fbf7ef'
  for (const [u, v] of [
    [-0.4, -0.3],
    [0.35, -0.4],
    [0.1, 0.1],
    [-0.35, 0.35],
    [0.45, 0.3],
  ]) {
    g.beginPath()
    g.arc(x + u * r, y + v * r, r * 0.11, 0, Math.PI * 2)
    g.fill()
  }
}
/** the sign out on the lawn: FREE cookies, fresh from the oven, this way */
function freeCookies() {
  const c = slate(512, 720, (g) => {
    g.textAlign = 'center'
    g.font = `700 132px ${HAND}`
    chalk(g, 'FREE', 256, 128)
    g.font = `700 112px ${HAND}`
    chalk(g, 'cookies', 256, 246, '#f7b9c9')
    // a swash under it
    g.strokeStyle = '#f7b9c9'
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(108, 314)
    g.bezierCurveTo(200, 336, 320, 300, 408, 318)
    g.stroke()
    chalkCookie(g, 256, 430, 64)
    star(g, 150, 400, 12, '#f7d68a')
    star(g, 372, 470, 9, '#f7d68a')
    star(g, 356, 382, 6)
    g.font = `700 54px ${HAND}`
    chalk(g, 'fresh from', 256, 566)
    chalk(g, 'the oven', 226, 630)
    // an arrow, this way
    g.strokeStyle = '#fbf7ef'
    g.lineWidth = 6
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(340, 632)
    g.lineTo(420, 632)
    g.moveTo(398, 612)
    g.lineTo(422, 632)
    g.lineTo(398, 652)
    g.stroke()
  })
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
/** the menu: the four cookies, the picked one marked, and how to use it (after Bruno's board) */
const MENU_ROWS = { top: 200, step: 104 }
function drawMenu(c: HTMLCanvasElement, sel: number) {
  slate(512, 760, (g) => {
    g.fillStyle = '#fbf7ef'
    g.textAlign = 'center'
    g.font = `700 64px ${HAND}`
    g.fillText('cookies', 256, 84)
    g.strokeStyle = '#f7b9c9'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(150, 124)
    g.quadraticCurveTo(256, 136, 362, 122)
    g.stroke()
    KINDS.forEach((k, i) => {
      const y = MENU_ROWS.top + i * MENU_ROWS.step
      const on = i === sel
      // a little cookie drawn beside its name, in its own colours
      g.fillStyle = k.dough
      g.beginPath()
      g.arc(96, y, 30, 0, Math.PI * 2)
      g.fill()
      for (let j = 0; j < 5; j++) {
        g.fillStyle = k.bits[j % k.bits.length]
        g.beginPath()
        g.arc(96 + Math.cos(j * 2.4) * 16, y + Math.sin(j * 2.4) * 14, k.bit === 'dust' ? 3 : 6, 0, Math.PI * 2)
        g.fill()
      }
      g.textAlign = 'left'
      g.font = `700 ${on ? 50 : 44}px ${HAND}`
      g.fillStyle = on ? '#f7b9c9' : '#fbf7ef'
      g.fillText(k.name, 146, y + 2)
      if (on) {
        g.fillText('→', 18, y + 2)
        g.strokeStyle = '#f7b9c9'
        g.lineWidth = 3
        g.beginPath()
        g.moveTo(146, y + 30)
        g.lineTo(146 + g.measureText(k.name).width, y + 28)
        g.stroke()
      }
    })
    // how to: like Bruno's NEXT → PREV ← … EXIT esc, with the keys boxed
    const key = (label: string, x: number, y: number, w = 58) => {
      g.strokeStyle = '#fbf7ef'
      g.lineWidth = 3
      g.strokeRect(x, y - 22, w, 44)
      g.textAlign = 'center'
      g.font = `700 32px ${HAND}`
      g.fillStyle = '#fbf7ef'
      g.fillText(label, x + w / 2, y + 1)
    }
    g.textAlign = 'left'
    g.font = `700 40px ${HAND}`
    g.fillStyle = '#fbf7ef'
    const rows: [string, string, number?][] = [
      ['pick', '← →', 90],
      ['bake', 'enter'],
      ['back', 'esc'],
    ]
    rows.forEach(([word, k, w], i) => {
      const y = 628 + i * 52
      g.textAlign = 'left'
      g.font = `700 40px ${HAND}`
      g.fillStyle = '#fbf7ef'
      g.fillText(word, 70, y)
      key(k, 230, y, w ?? 96)
    })
  }, c)
}
/** the plank: the count in white on the wood, commas and all */
function drawPlank(c: HTMLCanvasElement, n: number) {
  const g = c.getContext('2d')!
  const W = c.width
  const H = c.height
  g.fillStyle = '#b98a5c'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(90,55,35,${0.06 + ((i * 37) % 10) / 100})`
    g.lineWidth = 2
    g.beginPath()
    const y = (i * H) / 40 + Math.sin(i) * 3
    g.moveTo(0, y)
    g.bezierCurveTo(W * 0.3, y + 6, W * 0.6, y - 6, W, y + 2)
    g.stroke()
  }
  g.fillStyle = 'rgba(70,40,25,0.35)'
  g.fillRect(0, H / 2 - 2, W, 4)
  g.fillStyle = '#fffaf2'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `700 ${Math.round(H * 0.82)}px ${HAND}`
  g.shadowColor = 'rgba(60,30,20,0.4)'
  g.shadowOffsetY = 4
  g.fillText(n.toLocaleString('en-US'), W / 2, H / 2 + 8)
  g.shadowColor = 'transparent'
}

// ---- an A-frame chalkboard (real mm): two boards hinged at the top, their feet apart, a face on each
export function AFrame({ w, len, lean, face, onFaceClick }: { w: number; len: number; lean: number; face: Material; onFaceClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const H = len * Math.cos(lean)
  const stile = 76 // (the side posts, running down into its legs)
  const top = 90 // (the top rail)
  const foot = 150 // (how far the legs stand below the bottom rail)
  const bottom = 80 // (the bottom rail)
  const panel = { w: w - 2 * stile, h: len - top - foot - bottom }
  const chainAt = len * 0.62 // (the chains that hold its boards apart, this far down)
  return (
    <group>
      {[1, -1].map((s) => (
        // (front: its foot out toward +z; back: turned round, its foot out toward −z)
        <group key={s} position={[0, H, 0]} rotation={[-s * lean, s > 0 ? 0 : Math.PI, 0]}>
          {[-1, 1].map((x) => (
            <Block key={x} size={[stile, len, 48]} at={[(x * (w - stile)) / 2, -len / 2, 0]} m={WOOD} />
          ))}
          <Block size={[w - 2 * stile + 8, top, 44]} at={[0, -top / 2, 0]} m={WOOD} />
          <Block size={[w - 2 * stile + 8, bottom, 44]} at={[0, -len + foot + bottom / 2, 0]} m={WOOD} />
          {/* the slate set in between, a little back from the frame's face */}
          <Block size={[panel.w + 10, panel.h + 10, 14]} at={[0, -top - panel.h / 2, 4]} m={DARK} />
          <mesh material={face} position={[0, -top - panel.h / 2, 12]} onClick={onFaceClick}>
            <planeGeometry args={[panel.w, panel.h]} />
          </mesh>
          {/* its hinges along the top */}
          {[-1, 1].map((x) => (
            <Block key={x} size={[70, 30, 58]} at={[x * (w / 2 - 150), -12, 0]} m={HINGE} />
          ))}
        </group>
      ))}
      {[-1, 1].map((x) => (
        <mesh key={x} geometry={TUBE} material={HINGE} position={[x * (w / 2 - 20), H - chainAt * Math.cos(lean), 0]} rotation={[Math.PI / 2, 0, 0]} scale={[7, 2 * chainAt * Math.sin(lean), 7]} />
      ))}
    </group>
  )
}

// ---- the canopy's roof: a pyramid of four striped panels (stripes running up to the peak)
function roofGeometry() {
  const h = CANOPY.half + CANOPY.over
  const e = CANOPY.eave
  const corners: [number, number][] = [
    [-h, h],
    [h, h],
    [h, -h],
    [-h, -h],
  ]
  const pos: number[] = []
  const uv: number[] = []
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    pos.push(ax, e, az, bx, e, bz, 0, CANOPY.peak, 0)
    uv.push(0, 0, 1, 0, 0.5, 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.computeVertexNormals()
  return g
}

// ---- a cookie of a kind: round, its rim rounded, its bits pressed into its top
const COOKIE_GEO = (() => {
  const { r, t } = COOKIE
  const pts: Vector2[] = [new Vector2(0, -t / 2)]
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI
    pts.push(new Vector2(r - t / 2 + (Math.cos(a) * t) / 2, (Math.sin(a) * t) / 2))
  }
  pts.push(new Vector2(0, t / 2))
  return new LatheGeometry(pts, 24)
})()
const CANDY = new CylinderGeometry(5.5, 5.5, 3, 12)
function Cookie({ kind }: { kind: number }) {
  const k = KINDS[kind]
  const bits = useMemo(
    () =>
      Array.from({ length: k.n }, (_, i) => {
        // spread over its top (a sunflower's spiral), each a little turned
        const r = Math.sqrt((i + 0.5) / k.n) * COOKIE.r * 0.78
        const a = i * 2.399
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, turn: i * 1.7, colour: k.bits[i % k.bits.length] }
      }),
    [k],
  )
  return (
    <group>
      <mesh geometry={COOKIE_GEO} material={matOf(k.dough)} castShadow receiveShadow />
      {bits.map((b, i) =>
        k.bit === 'candy' ? (
          <mesh key={i} geometry={CANDY} material={matOf(b.colour)} position={[b.x, COOKIE.t / 2 + 0.6, b.z]} rotation={[0.15, b.turn, 0.1]} />
        ) : (
          <mesh key={i} geometry={RBOX} material={matOf(b.colour)} position={[b.x, COOKIE.t / 2 - (k.bit === 'dust' ? 0.3 : 0), b.z]} rotation={[0.3 * i, b.turn, 0.2]} scale={k.bit === 'dust' ? [3, 1.4, 3] : [7, 6, 6]} />
        ),
      )}
    </group>
  )
}

// ---- the oven: retro, mint, its door dropping open; `baking` 0..1 through a bake
function Oven({ baking, onClick }: { baking: { current: number }; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const door = useRef<Group>(null)
  const glow = useMemo(() => bruno({ color: '#ffb35c', emissive: '#ff9a3c', emissiveIntensity: 0.6, warm: 0 }), []) // (its own: it glows up as it bakes)
  useFrame(() => {
    const b = baking.current
    // (it glows up, then the door drops open at the middle of the bake and shuts again)
    glow.emissiveIntensity = 0.6 + Math.sin(Math.min(1, b / 0.55) * Math.PI) * 1.1 + (b > 0 ? 0.3 : 0)
    const open = b < 0.5 ? 0 : b < 0.62 ? (b - 0.5) / 0.12 : b < 0.85 ? 1 : Math.max(0, 1 - (b - 0.85) / 0.15)
    if (door.current) door.current.rotation.x = open * 1.25
  })
  const { w, h, d } = OVEN
  return (
    <group onClick={onClick} onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))} onPointerOut={() => (document.body.style.cursor = '')}>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={TUBE} material={DARK} position={[(sx * w) / 2.6, 10, (sz * d) / 2.6]} scale={[14, 20, 14]} />),
      )}
      <Block size={[w, h, d]} at={[0, 20 + h / 2, 0]} m={MINT} />
      {/* the inside, dark and warm, seen with the door down */}
      <Block size={[w - 150, h - 70, 20]} at={[-40, 20 + h / 2, d / 2 - 8]} m={glow} />
      {/* the controls: a cream panel, two dials, the red lamp */}
      <Block size={[100, h - 40, 16]} at={[w / 2 - 60, 20 + h / 2, d / 2 + 4]} m={CREAM} />
      {[0, 1].map((i) => (
        <mesh key={i} geometry={TUBE} material={CHROME} position={[w / 2 - 60, 20 + h * 0.66 - i * 90, d / 2 + 16]} rotation={[Math.PI / 2, 0, 0]} scale={[26, 16, 26]} />
      ))}
      <mesh geometry={TUBE} material={LAMP} position={[w / 2 - 60, 20 + h * 0.18, d / 2 + 14]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 6, 8]} />
      {/* the door, hinged along its bottom: cream frame, the glowing window, the handle */}
      <group ref={door} position={[-40, 32, d / 2 + 8]}>
        <Block size={[w - 150, h - 40, 18]} at={[0, (h - 40) / 2, 0]} m={CREAM} />
        <Block size={[w - 210, h - 110, 8]} at={[0, (h - 40) / 2 - 6, 8]} m={glow} />
        <Block size={[w - 200, 16, 20]} at={[0, h - 60, 26]} m={CHROME} />
      </group>
    </group>
  )
}

// ---- the stand
export function CookieStand({ car }: { car: { current: CarState } }) {
  const at = SET.cookies
  const count = useCookieCount()
  const sel = useChoice()
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null
    const roof = stripes(false)
    const val = stripes(true)
    const plankCanvas = document.createElement('canvas')
    plankCanvas.width = 1024
    plankCanvas.height = 256
    const plank = new CanvasTexture(plankCanvas)
    plank.colorSpace = SRGBColorSpace
    plank.anisotropy = 8
    const menuCanvas = document.createElement('canvas')
    const menu = new CanvasTexture(menuCanvas)
    menu.colorSpace = SRGBColorSpace
    menu.anisotropy = 8
    const cloth = gingham()
    cloth.repeat.set(4, 2)
    return {
      roof: bruno({ map: roof.map, side: DoubleSide, shade: '#b89ac4' }),
      valance: bruno({ map: val.map, alphaMap: val.alpha!, alphaTest: 0.5, side: DoubleSide, shade: '#b89ac4' }),
      plankCanvas,
      plank,
      plankMat: bruno({ map: plank, shade: '#a58aa6' }),
      menuCanvas,
      menu,
      // (the menu lit a little from within, so it reads in the canopy's shade)
      menuMat: bruno({ map: menu, emissiveMap: menu, emissive: '#ffffff', emissiveIntensity: 0.35, shade: '#6f7699' }),
      cloth: bruno({ map: cloth, shade: '#b8a2c8' }),
    }
  }, [])
  // the count onto the plank, the menu onto its board (the font first)
  useEffect(() => {
    if (!tex) return
    document.fonts.load(`700 180px 'Gaegu'`).finally(() => {
      drawPlank(tex.plankCanvas, count)
      tex.plank.needsUpdate = true
    })
  }, [tex, count])
  useEffect(() => {
    if (!tex) return
    document.fonts.load(`700 64px 'Gaegu'`).finally(() => {
      drawMenu(tex.menuCanvas, sel)
      tex.menu.needsUpdate = true
    })
  }, [tex, sel])
  const roof = useMemo(roofGeometry, [])

  // ---- baking: a bake takes ~1.6 s; the cookie hops out when the door's down
  const baking = useRef(0)
  const [cookies, setCookies] = useState<{ id: number; kind: number; p: [number, number, number]; v: [number, number, number]; w: [number, number, number]; born: number }[]>([])
  const next = useRef(1)
  const bake = () => {
    if (baking.current > 0) return
    baking.current = 0.0001
  }
  const place = useMemo(() => {
    const c = Math.cos(at.rot)
    const s = Math.sin(at.rot)
    return (x: number, y: number, z: number) => new Vector3(at.x + (x * c + z * s) * K, y * K, at.z + (-x * s + z * c) * K)
  }, [at])
  useFrame((_, dt) => {
    if (baking.current <= 0) return
    const before = baking.current
    baking.current += dt / 1.6
    if (before < 0.6 && baking.current >= 0.6) {
      // out it pops: from the oven's mouth, forward and up, spinning
      const mouth = place(OVEN.x - 40 * OVEN_TOY, TABLE.h + (40 + OVEN.h / 2) * OVEN_TOY, -40 + (OVEN.d / 2 + 60) * OVEN_TOY)
      const fwd = new Vector3(Math.sin(at.rot), 0, Math.cos(at.rot))
      const id = next.current++
      const kind = choice
      setCookies((list) => [
        ...list.slice(-35),
        {
          id,
          kind,
          p: [mouth.x, mouth.y, mouth.z],
          v: [fwd.x * 340 + (Math.random() - 0.5) * 140, 420, fwd.z * 340 + (Math.random() - 0.5) * 140],
          w: [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8],
          born: performance.now(),
        },
      ])
      addCookie()
    }
    if (baking.current >= 1) baking.current = 0
  })
  // cookies go after two minutes (a toy, not litter), and all at once on a hard reset
  useEffect(() => {
    const t = setInterval(() => setCookies((list) => list.filter((c) => performance.now() - c.born < 120000)), 5000)
    const off = onReset(() => {
      setCookies([])
      baking.current = 0
    })
    return () => {
      clearInterval(t)
      off()
    }
  }, [])

  // ---- looking at the stand: the whole of it, the plank and all, from out front
  const spot = useMemo<Spot>(() => {
    const c = Math.cos(at.rot)
    const s = Math.sin(at.rot)
    // (a little toward the menu out front, low enough that it's all in, the plank still on top)
    const centre = place(420, 1500, 520)
    const out = new Vector3(0.22, 0.26, 1).normalize()
    const dir = new Vector3(out.x * c + out.z * s, out.y, -out.x * s + out.z * c)
    return {
      key: 'cookies',
      items: [],
      frame: (pos, look, aspect) => frameAround(pos, look, aspect, centre, 640, 760, dir),
      hint: '← → pick a cookie · enter or the oven to bake',
      keys: (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') choose(choice + 1)
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') choose(choice - 1)
        else if (e.key === 'Enter' || e.key === ' ') bake()
        else return false
        return true
      },
    }
  }, [at, place])
  const zoom = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    clickSpot(spot)
  }
  const bakeClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    bake()
  }
  // a row of the menu, clicked: that cookie (and in to the stand, if not already)
  const menuClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (getLook()?.spot.key !== 'cookies') clickSpot(spot)
    const y = (1 - (e.uv?.y ?? 0.5)) * 760
    const row = Math.round((y - MENU_ROWS.top) / MENU_ROWS.step)
    if (row >= 0 && row < KINDS.length) choose(row)
  }

  // the prompt: drive up and it offers a cookie
  const prompt: PromptItem = useMemo(
    () => ({
      key: 'cookie',
      label: `Bake a cookie`,
      icon: 'cookie',
      at: (o) => o.copy(place(OVEN.x, TABLE.h + OVEN.h * OVEN_TOY + 260, 0)),
      when: () => {
        const c = car.current
        return baking.current === 0 && !getLook() && Math.hypot(c.x - at.x, c.z - at.z) < 1100
      },
      run: bake,
    }),
    [car, at, place],
  )

  const { half, eave, peak } = CANOPY
  if (!tex) return null
  const pointer = (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))
  const unpointer = () => (document.body.style.cursor = '')
  return (
    <>
      <group position={[at.x, 0, at.z]} rotation={[0, at.rot, 0]}>
        <group scale={K}>
          {/* the canopy and the table: a click on any of it and the camera goes in to the stand */}
          <group onClick={zoom} onPointerOver={pointer} onPointerOut={unpointer}>
            {/* four legs, the rails round the top, the striped roof, its scalloped valance */}
            {[-1, 1].map((sx) =>
              [-1, 1].map((sz) => (
                <group key={`${sx}${sz}`}>
                  <mesh geometry={RBOX} material={FRAME} position={[sx * half, eave / 2, sz * half]} scale={[40, eave, 40]} castShadow />
                  <mesh geometry={RBOX} material={FRAME} position={[sx * half, 30, sz * half]} scale={[120, 20, 120]} castShadow />
                </group>
              )),
            )}
            {[-1, 1].map((s) => (
              <group key={s}>
                <mesh geometry={RBOX} material={FRAME} position={[0, eave - 30, s * half]} scale={[half * 2, 36, 30]} />
                <mesh geometry={RBOX} material={FRAME} position={[s * half, eave - 30, 0]} scale={[30, 36, half * 2]} />
              </group>
            ))}
            <mesh geometry={roof} material={tex.roof} castShadow receiveShadow />
            {[0, 1, 2, 3].map((i) => {
              const a = (i * Math.PI) / 2
              const h = half + CANOPY.over
              return (
                <mesh key={i} material={tex.valance} position={[Math.sin(a) * h, eave - 130, Math.cos(a) * h]} rotation={[0, a, 0]}>
                  <planeGeometry args={[h * 2, 260]} />
                </mesh>
              )
            })}
            {/* the count: a plank on a post up from the peak, facing out front */}
            <mesh geometry={RBOX} material={FRAME} position={[0, peak + 170, 0]} scale={[40, 340, 40]} />
            <group position={[0, peak + 440, 30]}>
              <Block size={[1500, 400, 60]} at={[0, 0, 0]} m={WOOD} />
              <mesh material={tex.plankMat} position={[0, 0, 31]}>
                <planeGeometry args={[1440, 360]} />
              </mesh>
              {[-1, 1].map((s) => (
                <mesh key={s} geometry={TUBE} material={DARK} position={[s * 640, 120, 34]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 16]} />
              ))}
            </group>
            {/* the table: top, legs, the gingham cloth over it hanging down the front and sides */}
            <Block size={[TABLE.w, 40, TABLE.d]} at={[0, TABLE.h - 20, 0]} m={CREAM} />
            {[-1, 1].map((s) => (
              <mesh key={s} geometry={RBOX} material={FRAME} position={[s * (TABLE.w / 2 - 120), TABLE.h / 2, 0]} scale={[30, TABLE.h, TABLE.d - 120]} />
            ))}
            <Block size={[TABLE.w + 40, 16, TABLE.d + 40]} at={[0, TABLE.h + 6, 0]} m={tex.cloth} />
            <Block size={[TABLE.w + 40, 360, 10]} at={[0, TABLE.h - 170, TABLE.d / 2 + 22]} m={tex.cloth} />
            {[-1, 1].map((s) => (
              <Block key={s} size={[10, 360, TABLE.d + 40]} at={[s * (TABLE.w / 2 + 22), TABLE.h - 170, 0]} m={tex.cloth} />
            ))}
            {/* the cooling rack */}
            <group position={[330, TABLE.h + 14, 20]}>
              <Block size={[420, 12, 300]} at={[0, 40, 0]} m={CHROME} />
              {[-1, 1].map((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={TUBE} material={CHROME} position={[sx * 190, 18, sz * 130]} scale={[6, 36, 6]} />))}
            </group>
          </group>
          {/* the oven: a click on it bakes, whether or not you're looking at the stand */}
          <group position={[OVEN.x, TABLE.h + 14, -40]} scale={OVEN_TOY}>
            <Oven baking={baking} onClick={bakeClick} />
          </group>
          {/* the menu: an A-frame chalkboard out front to the right; click a row to pick it */}
          <group position={MENU.at} rotation={[0, MENU.rot, 0]} onPointerOver={pointer} onPointerOut={unpointer}>
            <AFrame w={MENU.w} len={MENU.len} lean={MENU.lean} face={tex.menuMat} onFaceClick={menuClick} />
          </group>
        </group>
        {/* the cookies on the rack (just for looks: the oven's are the ones to take), three kinds */}
        {[
          [-90, -60, 0],
          [70, -50, 1],
          [-10, 70, 3],
        ].map(([x, z, kind], i) => (
          <group key={i} position={[(330 + x) * K, (TABLE.h + 14 + 48) * K + COOKIE.t / 2, (20 + z) * K]} rotation={[0, i, 0]}>
            <Cookie kind={kind} />
          </group>
        ))}
        {/* what's solid: the legs, the table, the oven, the menu */}
        <RigidBody type="fixed" colliders={false}>
          {[-1, 1].map((sx) => [-1, 1].map((sz) => <CylinderCollider key={`${sx}${sz}`} args={[(eave / 2) * K, 30 * K]} position={[sx * half * K, (eave / 2) * K, sz * half * K]} />))}
          <CuboidCollider args={[(TABLE.w / 2 + 20) * K, (TABLE.h / 2) * K, (TABLE.d / 2 + 20) * K]} position={[0, (TABLE.h / 2) * K, 0]} />
          <CuboidCollider args={[(OVEN.w / 2) * OVEN_TOY * K, (OVEN.h / 2 + 20) * OVEN_TOY * K, (OVEN.d / 2) * OVEN_TOY * K]} position={[OVEN.x * K, (TABLE.h + 14 + (OVEN.h / 2 + 20) * OVEN_TOY) * K, -40 * K]} />
          <CuboidCollider args={[(MENU.w / 2) * K, (MENU.len / 2) * K, 200 * K]} position={[MENU.at[0] * K, (MENU.len / 2) * K, MENU.at[2] * K]} rotation={[0, MENU.rot, 0]} />
        </RigidBody>
      </group>
      {/* the cookies out of the oven: toys */}
      {cookies.map((c) => (
        <Holdable key={c.id} position={c.p} linearVelocity={c.v} angularVelocity={c.w} colliders={false} linearDamping={0.3} angularDamping={0.6} sound="none">
          <Cookie kind={c.kind} />
          <CylinderCollider args={[COOKIE.t / 2, COOKIE.r]} mass={0.05} friction={0.9} restitution={0.2} />
        </Holdable>
      ))}
      <Prompts items={[prompt]} far={9000} />
    </>
  )
}

/** what the car bumps into at the stand: the four legs, the table, the menu */
export function cookieStandObstacles(): Obstacle[] {
  const at = SET.cookies
  const c = Math.cos(at.rot)
  const s = Math.sin(at.rot)
  const pt = (x: number, z: number) => ({ x: at.x + (x * c + z * s) * K, z: at.z + (-x * s + z * c) * K })
  const h = CANOPY.half
  return [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ kind: 'circle' as const, ...pt(sx * h, sz * h), r: 12 }))),
    ...[-1, 0, 1].map((u) => ({ kind: 'circle' as const, ...pt(u * TABLE.w * 0.33, 0), r: (TABLE.d / 2) * K + 10 })),
    { kind: 'circle' as const, ...pt(MENU.at[0], MENU.at[2]), r: (MENU.w / 2) * K },
  ]
}

// ---- the big sign out on the corner of the lawn: a loose thing (./Physical)
const SIGN_K = 0.24 // (half as big again as the stand's: it has to be seen from across the lawn)
const SIGN = { w: 900, len: 1320, lean: 0.22 }
let signFace: Material | null = null
export function cookieSignProp(): { id: string; label: string; at: { x: number; y: number; z: number; rot: number }; lift: number; feelAlong: number[]; feelR: number; node: ReactNode; colliders: ReactNode } {
  if (!signFace && typeof document !== 'undefined') {
    const t = freeCookies()
    signFace = bruno({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.2, shade: '#6f7699' })
    document.fonts.load(`700 118px 'Gaegu'`).finally(() => {
      const fresh = freeCookies()
      const m = signFace as unknown as { map: CanvasTexture; emissiveMap: CanvasTexture; needsUpdate: boolean }
      m.map = fresh
      m.emissiveMap = fresh
      m.needsUpdate = true
    })
  }
  const s = SET.cookies.sign
  const H = SIGN.len * Math.cos(SIGN.lean)
  const foot = SIGN.len * Math.sin(SIGN.lean)
  return {
    id: 'cookiesign',
    label: 'Stand the sign back up',
    at: { x: s.x, y: 4, z: s.z, rot: s.rot },
    lift: (H + 200) * SIGN_K,
    feelAlong: [-0.3 * SIGN.w * SIGN_K, 0.3 * SIGN.w * SIGN_K],
    feelR: 40,
    node: <group scale={SIGN_K}>{signFace && <AFrame w={SIGN.w} len={SIGN.len} lean={SIGN.lean} face={signFace} />}</group>,
    colliders: (
      <>
        <CuboidCollider args={[(SIGN.w / 2) * SIGN_K, 10 * SIGN_K, foot * SIGN_K]} position={[0, 10 * SIGN_K, 0]} mass={1} friction={0.8} />
        <CuboidCollider args={[(SIGN.w / 2) * SIGN_K, (H / 2) * SIGN_K, (foot / 2) * SIGN_K]} position={[0, (H / 2) * SIGN_K, 0]} mass={0.8} friction={0.8} />
      </>
    ),
  }
}
