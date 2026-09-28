import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CurvePath, CylinderGeometry, DodecahedronGeometry, DoubleSide, LineCurve3, Matrix4, OctahedronGeometry, QuadraticBezierCurve3, Quaternion, RepeatWrapping, RingGeometry, SphereGeometry, SRGBColorSpace, TubeGeometry, Vector3, Euler, type Group, type Material, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Holdable } from '../../lib/physics/Holdable'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { bruno } from './bruno'
import { addCookie, useCookieCount } from './cookies'
import { clickSpot, frameAround, getLook, type Spot } from './look'
import { onReset } from './reset'
import { LiveProp, setPrompt } from './Physical'
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
const OVEN = { w: 411, h: 241, d: 330, x: -400 } // (Hamilton Beach's 4-slice, 31146J: 16.2 × 9.5 × 13 in; on the table, left of middle)
const OVEN_TOY = 1.7 // (drawn bigger: it's the star, and a cookie has to be seen baking in it)
const BAKE_S = 2.2 // (a bake, start to cookie out)
const COOKIE = { r: 30, t: 12 } // (toy mm, not real: chunky)
const MENU = { w: 760, len: 1120, lean: 0.24, at: [980, 0, 1150] as [number, number, number], rot: -0.22 } // (under the canopy, in front of the table's right end, turned in toward the middle)

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
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __cookies: { choose } }) // (for trying them from the console)

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
const MENU_ROWS = { top: 172, step: 84 }
const MENU_H = 674 // (512 wide: the slate's 608 × 800)
function drawMenu(c: HTMLCanvasElement, sel: number) {
  slate(512, MENU_H, (g) => {
    g.textAlign = 'center'
    g.font = `700 60px ${HAND}`
    chalk(g, 'cookies', 256, 72)
    g.strokeStyle = '#f7b9c9'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(160, 108)
    g.quadraticCurveTo(256, 120, 352, 106)
    g.stroke()
    KINDS.forEach((k, i) => {
      const y = MENU_ROWS.top + i * MENU_ROWS.step
      const on = i === sel
      // a little cookie drawn beside its name, in its own colours
      g.fillStyle = k.dough
      g.beginPath()
      g.arc(92, y, 26, 0, Math.PI * 2)
      g.fill()
      for (let j = 0; j < 5; j++) {
        g.fillStyle = k.bits[j % k.bits.length]
        g.beginPath()
        g.arc(92 + Math.cos(j * 2.4) * 14, y + Math.sin(j * 2.4) * 12, k.bit === 'dust' ? 3 : 5, 0, Math.PI * 2)
        g.fill()
      }
      g.textAlign = 'left'
      g.font = `700 ${on ? 46 : 40}px ${HAND}`
      chalk(g, k.name, 134, y + 2, on ? '#f7b9c9' : '#fbf7ef')
      if (on) {
        chalk(g, '→', 36, y + 2, '#f7b9c9')
        g.strokeStyle = '#f7b9c9'
        g.lineWidth = 3
        g.beginPath()
        g.moveTo(134, y + 28)
        g.lineTo(134 + g.measureText(k.name).width, y + 26)
        g.stroke()
      }
    })
    // how to: like Bruno's NEXT → PREV ← … EXIT esc, with the keys boxed
    const key = (label: string, x: number, y: number, w: number) => {
      g.strokeStyle = '#fbf7ef'
      g.lineWidth = 3
      g.strokeRect(x, y - 19, w, 38)
      g.textAlign = 'center'
      g.font = `700 28px ${HAND}`
      chalk(g, label, x + w / 2, y + 1)
    }
    const rows: [string, string, number][] = [
      ['pick', '← →', 86],
      ['bake', 'enter', 92],
      ['back', 'esc', 70],
    ]
    rows.forEach(([word, k, w], i) => {
      const y = 516 + i * 46
      g.textAlign = 'left'
      g.font = `700 36px ${HAND}`
      chalk(g, word, 96, y)
      key(k, 250, y, w)
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

// ---- a cookie of a kind, with some care: never quite round (its edge wobbles), domed, golden at its rim
// and darker under it, the tops of some crinkled and cracked; and what's in it pressed into it (chunks of
// chocolate, a melted puddle or two, M&Ms like little lentils, some on their edge, cinnamon sugar). Its
// body and its bits are each one mesh, painted in vertex colours, so a pile of them stays cheap.
const LOOKS = [
  { dome: 3.4, crinkle: 0, top: '#f3c583', rim: '#dc9852', under: '#b4733c', crack: '#c98d52', raw: '#f6ddb0' },
  { dome: 3, crinkle: 0, top: '#f6d39e', rim: '#e2a662', under: '#bd8147', crack: '#d39d62', raw: '#f8e2bb' },
  { dome: 4, crinkle: 1, top: '#5c3527', rim: '#472719', under: '#301912', crack: '#2a150f', raw: '#7c4c3b' },
  { dome: 4.6, crinkle: 1, top: '#f2d8a8', rim: '#dca867', under: '#b77e45', crack: '#fbecd0', raw: '#fbeccf' },
]
function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const cookieGeos: { body: BufferGeometry; bits: BufferGeometry; bodyM: BufferGeometry; bitsM: BufferGeometry }[] = []
function cookieGeo(kind: number) {
  if (cookieGeos[kind]) return cookieGeos[kind]
  const { r, t } = COOKIE
  const L = LOOKS[kind]
  const k = KINDS[kind]
  const rand = rng(17 + kind * 101)
  const rc = r - t / 2 // (where its top turns down into its rim)
  const ph = [rand() * 6, rand() * 6, rand() * 6]
  const wob = (a: number) => 1 + 0.045 * Math.sin(3 * a + ph[0]) + 0.025 * Math.sin(5 * a + ph[1]) + 0.014 * Math.sin(11 * a + ph[2])
  const dome = (rho: number) => L.dome * Math.max(0, 1 - rho * rho)
  // the cracks across a crinkled top: where two cells of a scatter of points meet
  const seeds = Array.from({ length: 9 }, () => {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * rc * 0.85
    return [Math.cos(a) * d, Math.sin(a) * d]
  })
  const crackAt = (x: number, z: number) => {
    let d1 = 1e9
    let d2 = 1e9
    for (const [sx, sz] of seeds) {
      const d = Math.hypot(x - sx, z - sz)
      if (d < d1) (d2 = d1), (d1 = d)
      else if (d < d2) d2 = d
    }
    return 1 - Math.min(1, (d2 - d1) / 2.2)
  }
  const bump = (x: number, z: number) => 0.35 * Math.sin(x * 0.37 + ph[0]) * Math.sin(z * 0.31 + ph[1]) + 0.2 * Math.sin(x * 0.9 + z * 0.7)
  // its section, from the middle of its top, out, round its rim, and in under it
  const prof: { px: number; py: number; zone: 0 | 1 | 2; rho: number }[] = []
  const NT = 16
  const NR = 10
  for (let a = 0; a <= NT; a++) prof.push({ px: (rc * a) / NT, py: t / 2, zone: 0, rho: a / NT })
  for (let b = 1; b < NR; b++) {
    const ang = Math.PI / 2 - (Math.PI * b) / NR
    prof.push({ px: rc + (Math.cos(ang) * t) / 2 + (ang < 0 ? 0.6 : 0), py: (Math.sin(ang) * t) / 2, zone: 1, rho: 1 })
  }
  for (let a = 3; a >= 0; a--) prof.push({ px: (rc * a) / 3, py: -t / 2, zone: 2, rho: a / 3 })
  const NS = 72
  // the same cookie as a ball of dough (a morph target: the oven's spreads from this into the cookie)
  const P = prof.length
  const ball = (u: number, a: number) => {
    const th = Math.min(1, u) * Math.PI
    const lump = 1 + 0.05 * Math.sin(3 * a + ph[1]) * Math.sin(2 * th + 0.5) + 0.03 * Math.sin(7 * a + 2 * th)
    const R = 17 * Math.sin(th) * lump
    return new Vector3(Math.cos(a) * R, Math.max(-t / 2, -t / 2 + 11 + 14 * Math.cos(th) * lump), Math.sin(a) * R)
  }
  const ballPos: number[] = []
  const pos: number[] = []
  const col: number[] = []
  const c = new Color()
  const cTop = new Color(L.top)
  const cRim = new Color(L.rim)
  const cUnder = new Color(L.under)
  const cCrack = new Color(L.crack)
  const cinnamon = new Color('#9a5a30')
  for (let pi = 0; pi < P; pi++)
    for (let j = 0; j < NS; j++) {
      const p = prof[pi]
      const a = (j / NS) * Math.PI * 2
      const R = p.px * wob(a)
      const x = Math.cos(a) * R
      const z = Math.sin(a) * R
      let y = p.py
      if (p.zone === 0) {
        y += dome(p.rho) + bump(x, z) * (1 - p.rho * 0.5)
        c.copy(cTop).lerp(cRim, Math.max(0, (p.rho - 0.55) / 0.45) ** 1.5)
        if (L.crinkle && p.rho < 0.95) {
          const cr = crackAt(x, z) ** 2
          y -= cr * 1.4
          c.lerp(cCrack, cr * 0.8)
        }
      } else if (p.zone === 1) {
        c.copy(cRim).lerp(cUnder, Math.max(0, -p.py / (t / 2)))
      } else c.copy(cUnder)
      // a baked, freckled look; cinnamon sugar on a snickerdoodle
      const v = 0.94 + rand() * 0.1
      c.multiplyScalar(v)
      if (kind === 3 && p.zone !== 2 && rand() < 0.16) c.lerp(cinnamon, 0.55)
      pos.push(x, y, z)
      const bp = ball(pi / (P - 1), a)
      ballPos.push(bp.x, bp.y, bp.z)
      col.push(c.r, c.g, c.b)
    }
  const idx: number[] = []
  for (let p = 0; p < prof.length - 1; p++)
    for (let j = 0; j < NS; j++) {
      const a = p * NS + j
      const b = p * NS + ((j + 1) % NS)
      idx.push(a, b, a + NS, b, b + NS, a + NS)
    }
  const body = new BufferGeometry()
  body.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  body.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  body.setIndex(idx)
  body.computeVertexNormals()
  const bodyM = body.clone()
  {
    const bn = new BufferGeometry()
    bn.setAttribute('position', new BufferAttribute(new Float32Array(ballPos), 3))
    bn.setIndex(idx)
    bn.computeVertexNormals()
    bodyM.morphAttributes.position = [bn.attributes.position]
    bodyM.morphAttributes.normal = [bn.attributes.normal]
  }
  const ballBits: number[] = []

  // what's in it, pressed into its top
  const topY = (x: number, z: number) => t / 2 + dome(Math.min(1, Math.hypot(x, z) / rc))
  const parts: BufferGeometry[] = []
  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const put = (g: BufferGeometry, colour: string, at: [number, number, number], size: [number, number, number], rot: [number, number, number]) => {
    const n = g.index ? g.toNonIndexed() : g.clone()
    n.deleteAttribute('uv')
    m.compose(new Vector3(...at), q.setFromEuler(e.set(...rot)), new Vector3(...size))
    n.applyMatrix4(m)
    // (on the ball of dough: the same bit, moved to the same spot on it, not stretched)
    const rho = Math.hypot(at[0], at[2]) / rc
    const bp = ball((Math.min(rho, 1.1) * NT) / (P - 1), Math.atan2(at[2], at[0]))
    const dx = bp.x - at[0]
    const dy = bp.y - topY(at[0], at[2])
    const dz = bp.z - at[2]
    const src = n.attributes.position.array
    for (let i = 0; i < src.length; i += 3) ballBits.push(src[i] + dx, src[i + 1] + dy, src[i + 2] + dz)
    const cc = new Color(colour)
    const cols = new Float32Array(n.attributes.position.count * 3)
    for (let i = 0; i < cols.length; i += 3) {
      const v = 0.92 + rand() * 0.12
      cols[i] = cc.r * v
      cols[i + 1] = cc.g * v
      cols[i + 2] = cc.b * v
    }
    n.setAttribute('color', new BufferAttribute(cols, 3))
    parts.push(n)
  }
  const spot = (i: number, n: number, reach: number) => {
    const rr = Math.sqrt((i + 0.4 + rand() * 0.3) / n) * rc * reach
    const a = i * 2.399 + rand() * 0.5
    return [Math.cos(a) * rr, Math.sin(a) * rr]
  }
  if (k.bit === 'chunk') {
    const CHUNK = new DodecahedronGeometry(1, 0)
    for (let i = 0; i < k.n + 2; i++) {
      const [x, z] = i < k.n ? spot(i, k.n, 0.92) : (() => {
        const a = rand() * 6.28
        return [Math.cos(a) * rc * 1.02, Math.sin(a) * rc * 1.02] // (one or two out on its rim)
      })()
      const colour = k.bits[0] === '#4a2d24' ? (rand() < 0.3 ? '#5c3a2a' : '#3b2219') : rand() < 0.25 ? '#e9dcc4' : '#f6efe3'
      const sz = 3.6 + rand() * 1.6
      put(CHUNK, colour, [x, topY(x, z) - 0.7, z], [sz, sz * (0.6 + rand() * 0.2), sz * (0.8 + rand() * 0.3)], [rand() * 3, rand() * 3, rand() * 3])
    }
    // a melted puddle or two
    const PUDDLE = new SphereGeometry(1, 14, 6)
    for (let i = 0; i < 2; i++) {
      const [x, z] = spot(i * 3 + 1, 7, 0.7)
      put(PUDDLE, kind === 0 ? '#4a2b1f' : '#efe4cf', [x + 3, topY(x, z) - 0.1, z - 2], [5 + rand() * 2, 0.9, 4 + rand() * 2], [0, rand() * 3, 0])
    }
  } else if (k.bit === 'candy') {
    const LENTIL = new SphereGeometry(1, 16, 8)
    for (let i = 0; i < k.n; i++) {
      const [x, z] = spot(i, k.n, 0.95)
      const edge = i % 4 === 1 // (some pushed in on their edge)
      put(LENTIL, k.bits[i % k.bits.length], [x, topY(x, z) + (edge ? 1.2 : 0.4), z], [5.4, 2.5, 5.4], [edge ? 1.2 : (rand() - 0.5) * 0.5, rand() * 3, edge ? 0.3 : (rand() - 0.5) * 0.5])
    }
  } else {
    // cinnamon sugar: specks of cinnamon, glints of sugar
    const SPECK = new OctahedronGeometry(1, 0)
    for (let i = 0; i < 46; i++) {
      const [x, z] = spot(i, 46, 1.0)
      const sugar = i % 4 === 0
      put(SPECK, sugar ? '#fff4e2' : i % 3 ? '#a8683d' : '#7e4a2a', [x, topY(x, z) + 0.05, z], sugar ? [0.9, 0.5, 0.9] : [1.3, 0.35, 1.1], [0, rand() * 3, 0])
    }
  }
  const bits = mergeGeometries(parts)!
  bits.computeVertexNormals()
  const bitsM = bits.clone()
  bitsM.morphAttributes.position = [new BufferAttribute(new Float32Array(ballBits), 3)]
  bitsM.morphAttributes.normal = [bits.attributes.normal.clone()]
  return (cookieGeos[kind] = { body, bits, bodyM, bitsM })
}
const CRUMB = bruno({ vertexColors: true, shade: '#8f7a9c' })
const CANDY_SHELL = bruno({ vertexColors: true, shade: '#7d6f9e', sheen: 0.35 })
function Cookie({ kind }: { kind: number }) {
  const g = cookieGeo(kind)
  return (
    <group>
      <mesh geometry={g.body} material={CRUMB} castShadow receiveShadow />
      <mesh geometry={g.bits} material={KINDS[kind].bit === 'candy' ? CANDY_SHELL : CRUMB} castShadow />
    </group>
  )
}

// ---- the oven: after Hamilton Beach's 4-slice toaster oven (31146J), in the stand's colours: its wrap
// (top and sides, vents down them), a frame round its front, the door on the left (a glass window, a
// steel handle across its top, a steel strip along its bottom), three knobs down the right and the red
// lamp; inside (lit when it's on) the elements top and bottom, a wire rack, a pan. A bake: a ball of
// dough on the pan, the elements glowing; it spreads and goes golden; the door drops, the cookie slides
// out onto it and hops off (the parent throws the real one then, from where this one was)
const rbs = new Map<string, RoundedBoxGeometry>()
const rb = (w: number, h: number, d: number, r: number) => {
  const key = [w, h, d, r].join()
  if (!rbs.has(key)) rbs.set(key, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)))
  return rbs.get(key)!
}
function Box({ s, at, m, r = 4, rot }: { s: [number, number, number]; at: [number, number, number]; m: Material; r?: number; rot?: [number, number, number] }) {
  return <mesh geometry={rb(...s, r)} material={m} position={at} rotation={rot} castShadow receiveShadow />
}
const GLASS = bruno({ color: '#4c3e52', transparent: true, opacity: 0.3, depthWrite: false })
const PAN = bruno({ color: '#cfccd6', shade: '#8e89a6', sheen: 0.3 })
const CAVITY = new BoxGeometry(1, 1, 1)
const DIAL = new RingGeometry(23, 25.5, 32, 1, -2.4, 4.8)
/** where things go inside: the cavity, the door, the pan (oven mm, its front +z, its feet at 0) */
const OV = (() => {
  const { w, h, d } = OVEN
  const y0 = 16 // (on its feet)
  const wall = 14
  const panel = 92 // (the controls, down its right)
  const cav = { x0: -w / 2 + wall, x1: w / 2 - panel, y0: y0 + wall, y1: y0 + h - wall, z0: -d / 2 + wall, z1: d / 2 - 6 }
  const door = { x: (cav.x0 + cav.x1) / 2 + 2, w: cav.x1 - cav.x0 - 4, y: y0 + 22, h: h - 50 }
  const pan = { y: cav.y0 + 62, z: -10 }
  return { y0, wall, panel, cav, door, pan }
})()
function Oven({ baking, kind, cookie, onClick }: { baking: { current: number }; kind: number; cookie: RefObject<Group | null>; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const door = useRef<Group>(null)
  const dough = useRef<Mesh>(null)
  const chips = useRef<Mesh>(null)
  const geo = cookieGeo(kind)
  // its own materials: they glow as it bakes
  const mat = useMemo(
    () => ({
      inside: bruno({ color: '#8f8298', side: BackSide, emissive: '#ffb56a', emissiveIntensity: 0.12, warm: 0 }),
      element: bruno({ color: '#6d5560', emissive: '#ff5a24', emissiveIntensity: 0, warm: 0 }),
      lamp: bruno({ color: '#c8453c', emissive: '#ff4a3c', emissiveIntensity: 0.2, warm: 0 }),
      dough: bruno({ vertexColors: true, shade: '#8f7a9c', emissive: '#ffffff', emissiveIntensity: 0 }),
    }),
    [],
  )
  useEffect(() => void mat.dough.emissive.set(LOOKS[kind].raw), [mat, kind])
  const ease = (x: number) => {
    const t = Math.min(1, Math.max(0, x))
    return t * t * (3 - 2 * t)
  }
  useFrame(() => {
    const b = baking.current
    const on = b > 0 ? ease(b / 0.06) * (1 - ease((b - 0.7) / 0.2)) : 0
    mat.element.emissiveIntensity = on * (1.3 + Math.sin(b * 60) * 0.08)
    mat.inside.emissiveIntensity = 0.12 + on * 0.75
    mat.lamp.emissiveIntensity = 0.2 + on * 1.4
    const open = ease((b - 0.62) / 0.08) * (1 - ease((b - 0.84) / 0.16))
    if (door.current) door.current.rotation.x = open * 1.45
    // the cookie: a ball of dough that spreads and bakes, then out onto the door, and it's thrown
    const c = cookie.current
    if (!c) return
    c.visible = b > 0 && b < 0.76
    if (!c.visible) return
    const pop = ease(b / 0.06)
    const k = ease((b - 0.06) / 0.56)
    const spread = 1 - (1 - k) * (1 - k) // (fast at first, as it melts)
    c.scale.setScalar(Math.max(0.001, pop) / (K * OVEN_TOY))
    for (const m of [dough.current, chips.current]) {
      if (!m) continue
      if (!m.morphTargetInfluences) m.updateMorphTargets()
      if (m.morphTargetInfluences) m.morphTargetInfluences[0] = 1 - spread
    }
    mat.dough.emissiveIntensity = 0.42 * (1 - k)
    const out = ease((b - 0.7) / 0.06)
    c.position.set(OV.door.x, OV.pan.y + 8 + Math.sin(out * Math.PI) * 30 + out * 10, OV.pan.z + out * (OVEN.d / 2 - OV.pan.z + 120)) // (out clear of the oven, over its door)
  })
  const { w, h, d } = OVEN
  const { y0, wall, panel, cav } = OV
  const cw = cav.x1 - cav.x0
  const ch = cav.y1 - cav.y0
  const cd = cav.z1 - cav.z0
  const cx = (cav.x0 + cav.x1) / 2
  const cy = (cav.y0 + cav.y1) / 2
  const cz = (cav.z0 + cav.z1) / 2
  const px = w / 2 - panel / 2 // (the controls' middle)
  return (
    <group onClick={onClick} onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))} onPointerOut={() => (document.body.style.cursor = '')}>
      {/* its feet */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <mesh key={sx * 3 + sz} geometry={TUBE} material={DARK} position={[sx * (w / 2 - 40), y0 / 2, sz * (d / 2 - 40)]} scale={[11, y0, 11]} />),
      )}
      {/* the wrap: top and sides, the floor, the back; the controls' block down the right */}
      <Box s={[w, wall + 10, d]} at={[0, y0 + h - (wall + 10) / 2, 0]} m={MINT} r={16} />
      <Box s={[wall + 10, h, d]} at={[-w / 2 + (wall + 10) / 2, y0 + h / 2, 0]} m={MINT} r={16} />
      <Box s={[panel + 10, h, d]} at={[w / 2 - (panel + 10) / 2, y0 + h / 2, 0]} m={MINT} r={16} />
      <Box s={[w - 8, wall, d - 8]} at={[0, y0 + wall / 2, 0]} m={MINT} r={4} />
      <Box s={[w - 8, h - 8, wall]} at={[0, y0 + h / 2, -d / 2 + wall / 2]} m={MINT} r={4} />
      {/* the vents down each side */}
      {[-1, 1].map((sx) =>
        [0, 1, 2].map((col) =>
          [0, 1, 2, 3, 4].map((row) => (
            <mesh key={sx * 100 + col * 10 + row} geometry={RBOX} material={DARK} position={[sx * (w / 2 + 0.5), y0 + h * 0.3 + row * 26, -d / 2 + 50 + col * 42]} scale={[3, 7, 28]} />
          )),
        ),
      )}
      {/* inside: its walls (lit when it's on), the elements top and bottom, the rack, the pan */}
      <mesh geometry={CAVITY} material={mat.inside} position={[cx, cy, cz]} scale={[cw, ch, cd]} />
      {[cav.y1 - 16, cav.y0 + 14].map((y) =>
        [-1, 1].map((sz) => <mesh key={y * 3 + sz} geometry={TUBE} material={mat.element} position={[cx, y, cz + sz * cd * 0.25]} rotation={[0, 0, Math.PI / 2]} scale={[5, cw - 10, 5]} />),
      )}
      {[-2, -1, 0, 1, 2].map((i) => (
        <mesh key={i} geometry={TUBE} material={CHROME} position={[cx, OV.pan.y - 8, cz + i * (cd / 5.5)]} rotation={[0, 0, Math.PI / 2]} scale={[2.2, cw - 6, 2.2]} />
      ))}
      <Box s={[cw * 0.82, 7, cd * 0.7]} at={[cx, OV.pan.y - 2, OV.pan.z]} m={PAN} r={3} />
      {/* the frame round its front */}
      <Box s={[w, 24, 12]} at={[0, y0 + h - 12, d / 2]} m={MINT} r={5} />
      <Box s={[w, 22, 12]} at={[0, y0 + 11, d / 2]} m={MINT} r={5} />
      <Box s={[wall + 6, h, 12]} at={[-w / 2 + (wall + 6) / 2, y0 + h / 2, d / 2]} m={MINT} r={5} />
      <Box s={[panel + 4, h, 14]} at={[px - 2, y0 + h / 2, d / 2 + 1]} m={MINT} r={8} />
      {/* its three knobs (temperature, function, timer), each in its printed dial, and the lamp */}
      {[0.8, 0.53, 0.26].map((f, i) => (
        <group key={i} position={[px, y0 + h * f, d / 2 + 8]}>
          <mesh geometry={DIAL} material={matOf('#c98f9c')} position={[0, 0, 0.5]} rotation={[0, 0, i * 0.4]} />
          <mesh geometry={TUBE} material={DARK} position={[0, 0, 9]} rotation={[Math.PI / 2, 0, 0]} scale={[19, 18, 19]} castShadow />
          <Box s={[9, 30, 10]} at={[0, 0, 19]} m={CHROME} r={4} rot={[0, 0, 0.5 - i * 0.6]} />
        </group>
      ))}
      <mesh geometry={TUBE} material={mat.lamp} position={[px, y0 + 22, d / 2 + 9]} rotation={[Math.PI / 2, 0, 0]} scale={[6, 4, 6]} />
      {/* the door, hinged along its bottom: its frame, the window, the steel strip, the handle */}
      <group ref={door} position={[OV.door.x, OV.door.y, d / 2 + 4]}>
        {(() => {
          const { w: dw, h: dh } = OV.door
          const strip = dh * 0.17
          return (
            <>
              <Box s={[dw, 10, 10]} at={[0, dh - 5, 0]} m={CREAM} r={3} />
              <Box s={[10, dh, 10]} at={[-dw / 2 + 5, dh / 2, 0]} m={CREAM} r={3} />
              <Box s={[10, dh, 10]} at={[dw / 2 - 5, dh / 2, 0]} m={CREAM} r={3} />
              <Box s={[dw, strip, 10]} at={[0, strip / 2, 1]} m={CHROME} r={3} />
              <Box s={[62, 5, 2]} at={[0, strip / 2, 6.5]} m={DARK} r={1} />
              <mesh material={GLASS} position={[0, strip + (dh - strip - 10) / 2, 0]}>
                <planeGeometry args={[dw - 20, dh - strip - 10]} />
              </mesh>
              {[-1, 1].map((sx) => (
                <Box key={sx} s={[12, 14, 22]} at={[sx * dw * 0.4, dh - 26, 11]} m={DARK} r={3} />
              ))}
              <Box s={[dw * 0.9, 22, 14]} at={[0, dh - 26, 26]} m={CHROME} r={7} />
            </>
          )
        })()}
      </group>
      {/* the cookie baking */}
      <group ref={cookie} visible={false}>
        <mesh ref={dough} geometry={geo.bodyM} material={mat.dough} castShadow />
        <mesh ref={chips} geometry={geo.bitsM} material={KINDS[kind].bit === 'candy' ? CANDY_SHELL : CRUMB} castShadow />
      </group>
    </group>
  )
}

// ---- the table: a 6 ft fold-in-half (Lifetime's, say): a white blow-moulded top, 50 thick and rounded,
// on black steel legs, a pair at each end that run straight down and then splay out to their feet, a bar
// across each pair up top and one down low, a brace from each end in to the middle under the top
const STEEL = bruno({ color: '#3a3542', shade: '#221e2b', sheen: 0.35 })
const PLASTIC = bruno({ color: '#f5f3ef', shade: '#b3a9c2' })
const TOP_T = 50
const LEG = { inset: 150, top: 140, foot: 285, knee: 440, ankle: 130, r: 15 } // (z at its top and at its foot; the heights where it bends)
const UNDER = TABLE.h - TOP_T // (the underside of the top)
/** a tube through `pts`, its corners bent round */
function bentTube(pts: Vector3[], r: number, bend: number) {
  const path = new CurvePath<Vector3>()
  let from = pts[0]
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const into = p.clone().sub(pts[i - 1]).normalize()
    const out = pts[i + 1].clone().sub(p).normalize()
    const a = p.clone().addScaledVector(into, -bend)
    const b = p.clone().addScaledVector(out, bend)
    path.add(new LineCurve3(from, a))
    path.add(new QuadraticBezierCurve3(a, p, b))
    from = b
  }
  path.add(new LineCurve3(from, pts[pts.length - 1]))
  return new TubeGeometry(path, 40, r, 8)
}
const LEG_GEO = [1, -1].map((sz) =>
  bentTube(
    [new Vector3(0, UNDER - 8, sz * LEG.top), new Vector3(0, LEG.knee, sz * LEG.top), new Vector3(0, LEG.ankle, sz * LEG.foot), new Vector3(0, 30, sz * LEG.foot)],
    LEG.r,
    70,
  ),
)
const _q = new Quaternion()
const _up = new Vector3(0, 1, 0)
/** a straight steel bar from a to b */
function Rod({ a, b, r = 10, m = STEEL }: { a: [number, number, number]; b: [number, number, number]; r?: number; m?: Material }) {
  const A = new Vector3(...a)
  const d = new Vector3(...b).sub(A)
  _q.setFromUnitVectors(_up, d.clone().normalize())
  return <mesh geometry={TUBE} material={m} position={A.addScaledVector(d, 0.5)} quaternion={_q.clone()} scale={[r, d.length(), r]} castShadow />
}
const TOP_GEO = new RoundedBoxGeometry(TABLE.w, TOP_T, TABLE.d, 4, 22)
function FoldingTable() {
  const lx = TABLE.w / 2 - LEG.inset
  const lowZ = LEG.top + ((LEG.knee - 180) / (LEG.knee - LEG.ankle)) * (LEG.foot - LEG.top) // (where the legs are at the low bar)
  return (
    <group>
      <mesh geometry={TOP_GEO} material={PLASTIC} position={[0, TABLE.h - TOP_T / 2, 0]} castShadow receiveShadow />
      {/* the frame under the top: a rail down each long side, the bar each pair of legs swings on */}
      {[-1, 1].map((sz) => (
        <Rod key={sz} a={[-TABLE.w / 2 + 60, UNDER - 12, sz * (TABLE.d / 2 - 40)]} b={[TABLE.w / 2 - 60, UNDER - 12, sz * (TABLE.d / 2 - 40)]} r={12} />
      ))}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * lx, 0, 0]}>
          <Rod a={[0, UNDER - 12, -(TABLE.d / 2 - 40)]} b={[0, UNDER - 12, TABLE.d / 2 - 40]} r={12} />
          {LEG_GEO.map((g, i) => (
            <mesh key={i} geometry={g} material={STEEL} castShadow />
          ))}
          {/* the bars across the pair: up top by the knees, down low */}
          <Rod a={[0, LEG.knee + 30, -LEG.top]} b={[0, LEG.knee + 30, LEG.top]} />
          <Rod a={[0, 180, -lowZ]} b={[0, 180, lowZ]} />
          {/* their feet: black caps */}
          {[-1, 1].map((sz) => (
            <mesh key={sz} geometry={TUBE} material={DARK} position={[0, 18, sz * LEG.foot]} scale={[LEG.r + 4, 36, LEG.r + 4]} />
          ))}
        </group>
      ))}
      {/* the braces, each end's upper bar in to the middle, and the latch where the top folds */}
      {[-1, 1].map((sx) => (
        <Rod key={sx} a={[sx * lx, LEG.knee + 30, 0]} b={[sx * 190, UNDER - 14, 0]} r={9} />
      ))}
      <mesh geometry={RBOX} material={STEEL} position={[0, UNDER - 20, 0]} scale={[90, 26, 60]} />
    </group>
  )
}

// ---- the cloth: gingham laid over the top and falling down all round, fitted to the table (a formula,
// not a simulation): flat on top, rolled over the rounded edge, hanging straight with a soft ripple along
// its hem, and at each corner the extra cloth falls in a flared fold that hangs lower, like a real one
const CLOTH = { drop: 250, lift: 3, r: 25, flare: 0.06, fold: 70, ripple: 9, check: 380 }
function clothGeometry() {
  const a = TABLE.w / 2 - 20 // (where the top starts to round over)
  const b = TABLE.d / 2 - 20
  const L = CLOTH.drop + 20
  const R = CLOTH.r
  const arc = (Math.PI * R) / 2
  const top = TABLE.h + CLOTH.lift - 0.5
  // where the cloth's rows and columns fall: wide apart across the top, close over the edge and down
  const axis = (h: number) => {
    const p: number[] = []
    for (let x = 0; x < h - 90; x += 90) p.push(x)
    for (let x = h - 90; x < h + L; x += 10) p.push(x)
    p.push(h + L)
    return [...p.slice(1).reverse().map((x) => -x), ...p]
  }
  const xs = axis(a)
  const zs = axis(b)
  const sstep = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }
  // over the edge and down: how far out, how far down, t along the cloth past the edge
  const drape = (t: number): [number, number] => {
    if (t < arc) return [R * Math.sin(t / R), R * (1 - Math.cos(t / R))]
    const s = t - arc
    return [R + s * CLOTH.flare, R + s * Math.sqrt(1 - CLOTH.flare * CLOTH.flare)]
  }
  const pos: number[] = []
  const uv: number[] = []
  for (const z of zs)
    for (const x of xs) {
      uv.push(x / CLOTH.check + 0.5, z / CLOTH.check + 0.5)
      const ex = Math.abs(x) - a
      const ez = Math.abs(z) - b
      const sx = Math.sign(x) || 1
      const sz = Math.sign(z) || 1
      if (ex <= 0 && ez <= 0) {
        pos.push(x, top, z)
        continue
      }
      if (ex > 0 && ez > 0) {
        // a corner: the cloth falls round the corner in a cone, its extra flaring out in a fold
        const th = Math.atan2(ez, ex)
        const t = Math.hypot(ex, ez)
        const [o, d] = drape(t)
        const fold = CLOTH.fold * Math.sin(2 * th) ** 2 * sstep(arc, L * 1.3, t)
        const out = o + fold
        pos.push(sx * (a + out * Math.cos(th)), top - d, sz * (b + out * Math.sin(th)))
        continue
      }
      // a side: straight down, a soft ripple along the hem (none by the corners, where the folds are)
      const along = ex > 0 ? z : x
      const t = ex > 0 ? ex : ez
      const [o, d] = drape(t)
      const edge = (ex > 0 ? b : a) - Math.abs(along)
      const s = Math.max(0, t - arc) / L
      const out = o + CLOTH.ripple * s * s * Math.sin(along / 42 + (ex > 0 ? 1.3 : 0.4) * sx * sz) * sstep(0, 220, edge)
      if (ex > 0) pos.push(sx * (a + out), top - d, z)
      else pos.push(x, top - d, sz * (b + out))
    }
  const nx = xs.length
  const idx: number[] = []
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const p = j * nx + i
      idx.push(p, p + nx, p + 1, p + 1, p + nx, p + nx + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
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
      cloth: bruno({ map: cloth, shade: '#b8a2c8', side: DoubleSide }),
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
  const clothGeo = useMemo(clothGeometry, [])

  // ---- baking: a bake takes ~1.6 s; the cookie hops out when the door's down
  const baking = useRef(0)
  const [bakeKind, setBakeKind] = useState(0)
  const inOven = useRef<Group>(null)
  const [cookies, setCookies] = useState<{ id: number; kind: number; p: [number, number, number]; v: [number, number, number]; w: [number, number, number]; born: number }[]>([])
  const next = useRef(1)
  const bake = () => {
    if (baking.current > 0) return
    setBakeKind(choice)
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
    baking.current += dt / BAKE_S
    if (before < 0.76 && baking.current >= 0.76) {
      // out it pops: from the oven's mouth, forward and up, spinning
      const mouth = new Vector3()
      if (inOven.current) inOven.current.getWorldPosition(mouth)
      else mouth.copy(place(OVEN.x, TABLE.h + OVEN.h * OVEN_TOY, OVEN.d * OVEN_TOY))
      const fwd = new Vector3(Math.sin(at.rot), 0, Math.cos(at.rot))
      const id = next.current++
      const kind = bakeKind
      setCookies((list) => [
        ...list.slice(-35),
        {
          id,
          kind,
          p: [mouth.x, mouth.y, mouth.z],
          v: [fwd.x * 300 + (Math.random() - 0.5) * 120, 400, fwd.z * 300 + (Math.random() - 0.5) * 120],
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
    // (the menu in front on the right and all, low enough that it's all in, the plank still on top)
    const centre = place(160, 1560, 420)
    const out = new Vector3(0.22, 0.26, 1).normalize()
    const dir = new Vector3(out.x * c + out.z * s, out.y, -out.x * s + out.z * c)
    return {
      key: 'cookies',
      items: [],
      frame: (pos, look, aspect) => frameAround(pos, look, aspect, centre, 560, 680, dir),
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
    const y = (1 - (e.uv?.y ?? 0.5)) * MENU_H
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

  // everything back where it goes, when things have gone haywire
  const putBack = useMemo(() => setPrompt('cookiestand', 'Reset Cookie Stand', (o) => o.copy(place(0, CANOPY.peak + 1150, 0))), [place])

  const { half, eave, peak } = CANOPY
  if (!tex) return null
  const pointer = (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))
  const unpointer = () => (document.body.style.cursor = '')
  const G = 4 // (the lawn's top)
  /** a piece's home: at (x, y, z) real mm in the stand's frame, turned `rot` more */
  const home = (x: number, y: number, z: number, rot = 0) => {
    const p = place(x, y, z)
    return { x: p.x, y: p.y + G, z: p.z, rot: at.rot + rot }
  }
  const S = K * OVEN_TOY
  const MH = MENU.len * Math.cos(MENU.lean)
  const MF = MENU.len * Math.sin(MENU.lean)
  const lx = TABLE.w / 2 - LEG.inset
  return (
    <>
      {/* the canopy: four legs, the rails round the top, the striped roof, its scalloped valance, the count
          on its peak; a click and the camera goes in to the stand */}
      <LiveProp id="cookiecanopy" label="" set="cookiestand" at={home(0, 0, 0)} car={car} lift={0} feelPts={[-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * half * K, sz * half * K] as [number, number]))} feelR={14}>
        <group scale={K} onClick={zoom} onPointerOver={pointer} onPointerOut={unpointer}>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <group key={sx * 3 + sz}>
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
        </group>
        {/* its legs (weighted at their feet), its roof */}
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <group key={sx * 3 + sz}>
              <CylinderCollider args={[(eave / 2) * K, 30 * K]} position={[sx * half * K, (eave / 2) * K, sz * half * K]} mass={0.3} friction={0.8} />
              <CuboidCollider args={[60 * K, 10 * K, 60 * K]} position={[sx * half * K, 30 * K, sz * half * K]} mass={1} friction={0.9} />
            </group>
          )),
        )}
        <CuboidCollider args={[(half + CANOPY.over) * K, 30 * K, (half + CANOPY.over) * K]} position={[0, (eave + 20) * K, 0]} mass={1.2} friction={0.6} />
      </LiveProp>

      {/* the table and its cloth */}
      <LiveProp id="cookietable" label="" set="cookiestand" at={home(0, 0, 0)} car={car} lift={0} feelPts={[-1, 0, 1].map((u) => [u * TABLE.w * 0.33 * K, 0] as [number, number])} feelR={(TABLE.d / 2) * K}>
        <group scale={K} onClick={zoom} onPointerOver={pointer} onPointerOut={unpointer}>
          <FoldingTable />
          <mesh geometry={clothGeo} material={tex.cloth} castShadow receiveShadow />
        </group>
        <CuboidCollider args={[(TABLE.w / 2 + 10) * K, (TOP_T / 2) * K, (TABLE.d / 2 + 10) * K]} position={[0, (TABLE.h - TOP_T / 2) * K, 0]} mass={2} friction={0.8} />
        {[-1, 1].map((sx) => (
          <CuboidCollider key={sx} args={[14 * K, (UNDER / 2) * K, LEG.foot * K]} position={[sx * lx * K, (UNDER / 2) * K, 0]} mass={0.6} friction={0.9} />
        ))}
      </LiveProp>

      {/* the oven: a click on it bakes, whether or not you're looking at the stand */}
      <LiveProp id="cookieoven" label="" set="cookiestand" at={home(OVEN.x, TABLE.h + 4, -40)} car={car} lift={0} feelPts={[[0, 0]]} feelR={(OVEN.w / 2) * S}>
        <group scale={S}>
          <Oven baking={baking} kind={bakeKind} cookie={inOven} onClick={bakeClick} />
        </group>
        <CuboidCollider args={[(OVEN.w / 2) * S, ((OVEN.h + OV.y0) / 2) * S, (OVEN.d / 2) * S]} position={[0, ((OVEN.h + OV.y0) / 2) * S, 0]} mass={0.8} friction={0.8} />
      </LiveProp>

      {/* the cooling rack, the cookie that's picked on the menu on it (for looks: the oven's are the ones to take) */}
      <LiveProp id="cookierack" label="" set="cookiestand" at={home(330, TABLE.h + 4, 20)} car={car} lift={0} feelPts={[[0, 0]]} feelR={24}>
        <group scale={K}>
          <Block size={[420, 12, 300]} at={[0, 40, 0]} m={CHROME} />
          {[-1, 1].map((sx) => [-1, 1].map((sz) => <mesh key={sx * 3 + sz} geometry={TUBE} material={CHROME} position={[sx * 190, 17, sz * 130]} scale={[6, 34, 6]} />))}
        </group>
        <group position={[0, 46 * K + COOKIE.t / 2, 0]} rotation={[0, 0.4, 0]}>
          <Cookie kind={sel} />
        </group>
        <CuboidCollider args={[210 * K, 23 * K, 150 * K]} position={[0, 23 * K, 0]} mass={0.2} friction={0.8} />
        <CylinderCollider args={[COOKIE.t / 2, COOKIE.r]} position={[0, 46 * K + COOKIE.t / 2, 0]} mass={0.05} friction={0.9} />
      </LiveProp>

      {/* the menu: an A-frame chalkboard under the canopy, in front on the right; click a row to pick it */}
      <LiveProp id="cookiemenu" label="" set="cookiestand" at={home(MENU.at[0], 0, MENU.at[2], MENU.rot)} car={car} lift={0} feelPts={[[-0.3 * MENU.w * K, 0], [0.3 * MENU.w * K, 0]]} feelR={30}>
        <group scale={K} onPointerOver={pointer} onPointerOut={unpointer}>
          <AFrame w={MENU.w} len={MENU.len} lean={MENU.lean} face={tex.menuMat} onFaceClick={menuClick} />
        </group>
        <CuboidCollider args={[(MENU.w / 2) * K, 10 * K, MF * K]} position={[0, 10 * K, 0]} mass={0.6} friction={0.8} />
        <CuboidCollider args={[(MENU.w / 2) * K, (MH / 2) * K, (MF / 2) * K]} position={[0, (MH / 2) * K, 0]} mass={0.5} friction={0.8} />
      </LiveProp>

      {/* the cookies out of the oven: toys */}
      {cookies.map((c) => (
        <Holdable key={c.id} position={c.p} linearVelocity={c.v} angularVelocity={c.w} colliders={false} linearDamping={0.3} angularDamping={0.6} sound="none">
          <Cookie kind={c.kind} />
          <CylinderCollider args={[COOKIE.t / 2 + 1.5, COOKIE.r]} position={[0, 1.5, 0]} mass={0.05} friction={0.9} restitution={0.2} />
        </Holdable>
      ))}
      <Prompts items={[prompt, putBack]} far={9000} />
    </>
  )
}

// ---- the big sign out on the corner of the lawn: a loose thing (./Physical)
const SIGN_K = 0.24 // (half as big again as the stand's: it has to be seen from across the lawn)
const SIGN = { w: 900, len: 1320, lean: 0.22 }
let signFace: Material | null = null
export function cookieSignProp(): { id: string; label: string; at: { x: number; y: number; z: number; rot: number }; lift: number; feelAlong: number[]; feelR: number; set: string; node: ReactNode; colliders: ReactNode } {
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
    set: 'cookiestand', // (put back with the rest of the stand)
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
