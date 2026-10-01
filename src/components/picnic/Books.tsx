import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, FrontSide, BackSide, type Group, type Material, type Texture } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { BOOKS } from './spec'
import { SERIF, paint, rng } from './paint'

/**
 * The books (../spec [K]), in real millimetres, made as books are: two paperbacks, a cover wrapped round a
 * block of pages (its spine rounded, the cover a hair proud of the leaves, the leaves' edges lined), their
 * covers drawn here; and the little hardback lying open face up, its pages bowing up out of the gutter,
 * its cloth boards a rim round them. Click its right-hand page to turn it, its left to turn back: the leaf
 * lifts at the spine, curls over and settles (a formula, not a simulation).
 *
 * A closed book's frame: lying flat on y = 0, its spine toward -x, its head toward -z (so it reads from
 * +z). The open book: its gutter along z at x = 0, its head toward -z.
 */
const COVER = 1.3 // (a paperback's card, thickened a little for the toy look)

// ---- the covers, drawn
function cloth(g: CanvasRenderingContext2D, W: number, H: number, colour: string, seed: number) {
  const r = rng(seed)
  g.fillStyle = colour
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < W * H * 0.004; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.05})`
    g.fillRect(r() * W, r() * H, 2 + r() * 3, 1)
  }
  // softened corners where it's been handled
  for (const [x, y] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, 40)
    gr.addColorStop(0, 'rgba(255,255,255,0.18)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(x - 40, y - 40, 80, 80)
  }
}
function fleuron(g: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
  g.save()
  g.translate(x, y)
  g.rotate(rot)
  g.beginPath()
  g.moveTo(0, 0)
  g.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.8, s * 0.7, s * 0.25, s * 0.5)
  g.moveTo(0, 0)
  g.bezierCurveTo(-s * 0.2, s * 0.9, s * 0.7, s * 0.8, s * 0.5, s * 0.25)
  g.stroke()
  g.beginPath()
  g.arc(s * 0.36, s * 0.36, s * 0.09, 0, Math.PI * 2)
  g.fill()
  g.restore()
}
const S = 4 // (px a mm on the covers)
function front(k: number) {
  const b = BOOKS[k]
  const W = b.w * S
  const H = b.h * S
  return paint(W, H, (g) => {
    cloth(g, W, H, b.cover, 7 + k)
    g.fillStyle = b.ink
    g.strokeStyle = b.ink
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    if (k === 0) {
      // stamped in gold: a double rule, a fleuron in each corner, the title, a little wreath
      g.lineWidth = 4
      g.strokeRect(28, 28, W - 56, H - 56)
      g.lineWidth = 1.6
      g.strokeRect(40, 40, W - 80, H - 80)
      g.lineWidth = 2.4
      ;[
        [52, 52, 0],
        [W - 52, 52, Math.PI / 2],
        [W - 52, H - 52, Math.PI],
        [52, H - 52, -Math.PI / 2],
      ].forEach(([x, y, a]) => fleuron(g, x, y, 34, a))
      g.font = `italic 700 74px ${SERIF}`
      g.fillText('Pride', W / 2, H * 0.27)
      g.font = `italic 46px ${SERIF}`
      g.fillText('&', W / 2, H * 0.335)
      g.font = `italic 700 66px ${SERIF}`
      g.fillText('Prejudice', W / 2, H * 0.41)
      // the wreath: two sprays of leaves round in a ring
      g.lineWidth = 2.4
      const cx = W / 2
      const cy = H * 0.6
      g.beginPath()
      g.arc(cx, cy, 64, Math.PI * 0.62, Math.PI * 2.38)
      g.stroke()
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * 0.68 + (i / 13) * Math.PI * 1.64
        g.save()
        g.translate(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64)
        g.rotate(a + (i < 7 ? 0.6 : -0.6))
        g.beginPath()
        g.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
      g.font = `600 28px ${SERIF}`
      g.fillText('J A N E   A U S T E N', W / 2, H * 0.85)
    } else if (k === 1) {
      // a red jacket: its author small at the head, the title set wide, a green band
      g.font = `500 26px ${SERIF}`
      g.fillText('H A R U K I   M U R A K A M I', W / 2, H * 0.12)
      g.fillRect(W * 0.2, H * 0.16, W * 0.6, 2)
      g.font = `700 70px ${SERIF}`
      g.fillText('NORWEGIAN', W / 2, H * 0.42)
      g.font = `700 104px ${SERIF}`
      g.fillText('WOOD', W / 2, H * 0.55)
      g.fillStyle = '#6fa77a'
      g.fillRect(0, H * 0.64, W, H * 0.05)
      g.fillStyle = b.ink
      g.font = `italic 30px ${SERIF}`
      g.fillText('a novel', W / 2, H * 0.78)
    }
  })
}
function back(k: number) {
  const b = BOOKS[k]
  const W = b.w * S
  const H = b.h * S
  return paint(W, H, (g) => {
    cloth(g, W, H, b.cover, 17 + k)
    g.fillStyle = b.ink
    g.globalAlpha = 0.6
    for (let i = 0; i < 14; i++) g.fillRect(70, H * 0.2 + i * 26, W - 140 - (i % 5 === 4 ? 140 : (i * 37) % 60), 8)
    g.globalAlpha = 1
    g.fillStyle = '#fbf7ef'
    g.fillRect(W - 210, H - 150, 150, 92)
    g.fillStyle = '#2a2328'
    const r = rng(5 + k)
    for (let x = W - 200; x < W - 70; x += 3 + Math.floor(r() * 3)) g.fillRect(x, H - 140, 1 + Math.floor(r() * 3), 62)
  })
}
function spineTex(k: number) {
  const b = BOOKS[k]
  const W = b.h * S
  const H = Math.round(b.t * S)
  return paint(W, H, (g) => {
    cloth(g, W, H, b.cover, 27 + k)
    g.fillStyle = b.ink
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    g.font = `700 ${Math.round(H * 0.42)}px ${SERIF}`
    g.fillText(b.title.toUpperCase(), 40, H / 2)
    g.textAlign = 'right'
    g.font = `${Math.round(H * 0.3)}px ${SERIF}`
    g.fillText(b.author.split(' ').slice(-1)[0].toUpperCase(), W - 70, H / 2)
    g.beginPath()
    g.arc(W - 32, H / 2, H * 0.16, 0, Math.PI * 2)
    g.fill()
  })
}
/** the leaves' edges: fine lines along them, a little uneven */
const leafTex = paint(256, 64, (g) => {
  const r = rng(77)
  g.fillStyle = '#f6eedb'
  g.fillRect(0, 0, 256, 64)
  for (let y = 0; y < 64; y += 1.5) {
    g.fillStyle = `rgba(150,128,96,${0.06 + r() * 0.12})`
    g.fillRect(0, y, 256, 0.7)
  }
})
const LEAVES = bruno({ map: leafTex ?? undefined, color: '#ffffff', shade: '#ada2bc' })
const coverMats = new Map<number, Material[]>()
/** a cover's materials (a box's faces: +x, -x, +y, -y, +z, -z) */
function mats(k: number) {
  if (coverMats.has(k)) return coverMats.get(k)!
  const b = BOOKS[k]
  const plain = bruno({ color: b.cover, shade: '#7e6d92' })
  const art = (t: Texture | null) => bruno({ map: t ?? undefined, color: '#ffffff', shade: '#7e6d92' })
  const m = [plain, art(spineTex(k)), art(front(k)), art(back(k)), plain, plain]
  coverMats.set(k, m)
  return m
}

export function ClosedBook({ k }: { k: number }) {
  const b = BOOKS[k]
  const geo = useMemo(
    () => ({
      block: new RoundedBoxGeometry(b.w - 2.4, b.t - 2 * COVER, b.h - 2, 2, 1.2),
      board: new RoundedBoxGeometry(b.w, COVER, b.h, 2, 0.6),
      spine: new RoundedBoxGeometry(COVER * 2.2, b.t, b.h, 3, Math.min(COVER, b.t / 2 - 0.1)),
    }),
    [b],
  )
  const m = mats(k)
  const plain = m[0]
  return (
    <group>
      <mesh geometry={geo.block} material={LEAVES} position={[1.1, b.t / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geo.board} material={[plain, plain, m[2], plain, plain, plain]} position={[0, b.t - COVER / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geo.board} material={[plain, plain, plain, m[3], plain, plain]} position={[0, COVER / 2, 0]} castShadow />
      <mesh geometry={geo.spine} material={[plain, m[1], plain, plain, plain, plain]} position={[-b.w / 2 + COVER * 1.1, b.t / 2, 0]} castShadow />
    </group>
  )
}

// ---- the open book
const OPEN = { board: 2.5, over: 3, pages: 7 } // (each side's leaves 7 thick: the toy look)
const PAGES = 12
/** a page: illegible lines of text, a chapter's numeral now and then, a little drawing on some, its number */
function pageTex(n: number) {
  const b = BOOKS[2]
  const P = 2.2 // (px a mm)
  const W = Math.round((b.w - OPEN.over) * P)
  const H = Math.round((b.h - 2 * OPEN.over) * P)
  return paint(W, H, (g) => {
    const r = rng(100 + n)
    g.fillStyle = '#fcf6e6'
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(160,130,90,${r() * 0.04})`
      g.fillRect(r() * W, r() * H, 2, 2)
    }
    const left = n % 2 === 0
    const mx = left ? 34 : 26
    const top = 46
    let y = top
    const drawing = n % 4 === 1
    const chapter = n % 5 === 0
    if (chapter) {
      g.fillStyle = '#5a4b5c'
      g.textAlign = 'center'
      g.font = `600 30px ${SERIF}`
      g.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][(n / 5) % 7], W / 2, y + 26)
      y += 70
    }
    if (drawing) {
      // a little drawing: a planet, its one flower, stars round it
      const cx = W / 2
      const cy = y + 70
      g.fillStyle = '#f4d38e'
      g.beginPath()
      g.arc(cx, cy + 22, 46, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#d69b57'
      g.lineWidth = 2
      g.stroke()
      g.strokeStyle = '#6aa36f'
      g.beginPath()
      g.moveTo(cx + 10, cy - 22)
      g.lineTo(cx + 8, cy - 4)
      g.stroke()
      g.fillStyle = '#e07a7a'
      g.beginPath()
      g.arc(cx + 10, cy - 28, 8, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#e9c55e'
      for (let i = 0; i < 6; i++) {
        g.beginPath()
        g.arc(cx - 90 + r() * 180, cy - 50 + r() * 40, 2.5, 0, Math.PI * 2)
        g.fill()
      }
      y += 170
    }
    // the text: lines of words, in paragraphs
    g.fillStyle = 'rgba(70,58,72,0.62)'
    while (y < H - 60) {
      let x = mx + (y === top || r() < 0.18 ? 18 : 0)
      const end = W - mx - (r() < 0.15 ? 60 + r() * 120 : 0)
      while (x < end) {
        const word = 10 + r() * 34
        g.fillRect(x, y, Math.min(word, end - x), 4)
        x += word + 6
      }
      y += 13
    }
    g.fillStyle = '#7a6a7c'
    g.textAlign = 'center'
    g.font = `20px ${SERIF}`
    g.fillText(String(41 + n), W / 2, H - 22)
  })
}
const pageMats = new Map<number, Material>()
const pageMat = (n: number) => {
  if (!pageMats.has(n)) pageMats.set(n, bruno({ map: pageTex(n) ?? undefined, color: '#ffffff', shade: '#b0a6c2', side: FrontSide }))
  return pageMats.get(n)!
}
const pageBack = new Map<number, Material>()
const pageBackMat = (n: number) => {
  if (!pageBack.has(n)) pageBack.set(n, bruno({ map: pageTex(n) ?? undefined, color: '#ffffff', shade: '#b0a6c2', side: BackSide }))
  return pageBack.get(n)!
}

const WP = BOOKS[2].w - OPEN.over // (a page's width: gutter to fore-edge)
const HP = BOOKS[2].h - 2 * OPEN.over
/** how high the leaves stand at x from the gutter: dipping into it, bowing up, settling flat */
const bow = (x: number) => {
  const u = Math.min(1, Math.max(0, x / WP))
  const rise = 1 - Math.pow(1 - Math.min(1, u / 0.24), 2.2)
  return OPEN.board + 0.4 + OPEN.pages * (rise - 0.1 * u ** 4)
}
const NX = 24
const NZ = 6
/** one side's leaves: their top bowing out of the gutter (its page), the edges round them lined */
function leaves(side: 1 | -1) {
  const pos: number[] = []
  const uv: number[] = []
  for (let j = 0; j <= NZ; j++)
    for (let i = 0; i <= NX; i++) {
      const x = (WP * i) / NX
      const z = -HP / 2 + (HP * j) / NZ
      pos.push(side * x, bow(x), z)
      uv.push(side > 0 ? i / NX : 1 - i / NX, 1 - j / NZ)
    }
  const idx: number[] = []
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i
      if (side > 0) idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2)
      else idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1)
    }
  const top = new BufferGeometry()
  top.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  top.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  top.setIndex(idx)
  top.computeVertexNormals()
  // its edges: the fore-edge, the head, the foot (strips down to the board), lined
  const ep: number[] = []
  const eu: number[] = []
  const strip = (pts: [number, number, number][]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, z0] = pts[i]
      const [x1, y1, z1] = pts[i + 1]
      const b = OPEN.board
      ep.push(x0, b, z0, x1, b, z1, x1, y1, z1, x0, b, z0, x1, y1, z1, x0, y0, z0)
      const u0 = i / (pts.length - 1)
      const u1 = (i + 1) / (pts.length - 1)
      eu.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1)
    }
  }
  const along = (z: number) => Array.from({ length: NX + 1 }, (_, i): [number, number, number] => [side * ((WP * i) / NX), bow((WP * i) / NX), z])
  strip(along(-HP / 2))
  strip(along(HP / 2).reverse())
  strip(Array.from({ length: NZ + 1 }, (_, j): [number, number, number] => [side * WP, bow(WP), -HP / 2 + (HP * j) / NZ]))
  const edges = new BufferGeometry()
  edges.setAttribute('position', new BufferAttribute(new Float32Array(ep), 3))
  edges.setAttribute('uv', new BufferAttribute(new Float32Array(eu), 2))
  edges.computeVertexNormals()
  return { top, edges }
}
const LEAVES_DS = bruno({ map: leafTex ?? undefined, color: '#ffffff', shade: '#ada2bc', side: DoubleSide })

export function OpenBook({ active = true }: { active?: boolean }) {
  const b = BOOKS[2]
  const geo = useMemo(() => {
    const board = new RoundedBoxGeometry(b.w, OPEN.board, b.h, 2, 1)
    // the leaf that turns: a strip of the page, from the gutter out, bent as it goes over
    const pos = new BufferAttribute(new Float32Array((NX + 1) * (NZ + 1) * 3), 3)
    const mk = (flip: boolean) => {
      const g = new BufferGeometry()
      g.setAttribute('position', pos)
      const uv: number[] = []
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) uv.push(flip ? 1 - i / NX : i / NX, 1 - j / NZ)
      g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
      const idx: number[] = []
      for (let j = 0; j < NZ; j++)
        for (let i = 0; i < NX; i++) {
          const a = j * (NX + 1) + i
          idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2)
        }
      g.setIndex(idx)
      return g
    }
    return { board, right: leaves(1), left: leaves(-1), front: mk(false), back: mk(true), pos }
  }, [b])
  // which spread's open (its left page 2s, its right 2s + 1), and a leaf turning
  const [spread, setSpread] = useState(0)
  const turning = useRef<{ dir: 1 | -1; t: number } | null>(null)
  const [turn, setTurn] = useState<{ dir: 1 | -1 } | null>(null)
  const sheet = useRef<Group>(null)
  const root = useRef<Group>(null)
  const last = PAGES / 2 - 1
  // (the leaves' slope at each step out from the gutter: how the turning leaf lies at rest)
  const slope = useMemo(() => Array.from({ length: NX }, (_, i) => Math.atan2(bow(((i + 1) * WP) / NX) - bow((i * WP) / NX), WP / NX)), [])
  useFrame((_, dt) => {
    const tr = turning.current
    const g = sheet.current
    if (!tr || !g) return
    tr.t = Math.min(1, tr.t + dt / 0.9)
    const e = tr.t * tr.t * (3 - 2 * tr.t)
    const th = Math.PI * (tr.dir > 0 ? e : 1 - e)
    const lag = 0.85 * Math.sin(th)
    const ds = WP / NX
    const p = geo.pos
    for (let j = 0; j <= NZ; j++) {
      const z = -HP / 2 + (HP * j) / NZ
      let x = 0
      let y = OPEN.board + 0.7
      p.setXYZ(j * (NX + 1), x, y, z)
      for (let i = 0; i < NX; i++) {
        const c = slope[i]
        // its rest shape eased from the right-hand leaves' to the left's, the far edge lagging behind
        const a = c + ((Math.PI - 2 * c) * th) / Math.PI - tr.dir * lag * Math.pow((i + 1) / NX, 1.4)
        x += Math.cos(a) * ds
        y += Math.sin(a) * ds
        p.setXYZ(j * (NX + 1) + i + 1, x, y, z)
      }
    }
    p.needsUpdate = true
    geo.front.computeVertexNormals()
    geo.back.computeVertexNormals()
    if (tr.t >= 1) {
      turning.current = null
      setSpread((s) => s + tr.dir)
      setTurn(null)
    }
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!active) return
    e.stopPropagation()
    if (turning.current || !root.current) return
    const x = root.current.worldToLocal(e.point.clone()).x
    const dir: 1 | -1 = x >= 0 ? 1 : -1
    if ((dir > 0 && spread >= last) || (dir < 0 && spread <= 0)) return
    turning.current = { dir, t: 0 }
    setTurn({ dir })
  }
  // what's showing: while a leaf turns forward, the page under it is the next spread's right; turning back,
  // the previous spread's left; the leaf itself carries the page it was and the one it becomes
  const L = 2 * spread
  const R = 2 * spread + 1
  const leftPage = turn?.dir === -1 ? L - 2 : L
  const rightPage = turn?.dir === 1 ? R + 2 : R
  const leafFront = turn?.dir === 1 ? R : R - 2 // (its right-hand side)
  const leafBack = turn?.dir === 1 ? L + 2 : L // (its left-hand side)
  const boardMat = mats(2)[0]
  return (
    <group ref={root} onClick={click}>
      {/* its cloth boards, flat on the ground either side of the spine; its spine between them */}
      {[1, -1].map((s) => (
        <mesh key={s} geometry={geo.board} material={boardMat} position={[(s * b.w) / 2, OPEN.board / 2, 0]} castShadow receiveShadow />
      ))}
      <mesh material={boardMat} position={[0, OPEN.board * 0.6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[OPEN.board * 1.2, b.h, OPEN.board * 1.2]}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
      </mesh>
      {/* the leaves each side, bowing out of the gutter */}
      <mesh geometry={geo.right.top} material={pageMat(rightPage)} receiveShadow castShadow />
      <mesh geometry={geo.left.top} material={pageMat(leftPage)} receiveShadow castShadow />
      <mesh geometry={geo.right.edges} material={LEAVES_DS} />
      <mesh geometry={geo.left.edges} material={LEAVES_DS} />
      {/* the leaf turning */}
      <group ref={sheet} visible={!!turn}>
        {turn && (
          <>
            <mesh geometry={geo.front} material={pageMat(leafFront)} castShadow />
            <mesh geometry={geo.back} material={pageBackMat(leafBack)} />
          </>
        )}
      </group>
    </group>
  )
}
export const OPEN_BOOK = { w: BOOKS[2].w * 2, h: BOOKS[2].h, t: OPEN.board + OPEN.pages }
