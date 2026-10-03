import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import './poster.css'
import { CanvasTexture, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { POSTER } from './spec'
import type { Note } from './messages'

/**
 * The "Rina" poster (./spec), painted into its own texture: the poster board, her name in bubble letters coloured
 * in pencil, and her friends' notes (./messages) written in round them, each in its own pen, signed.
 *
 *   new notes      write themselves in, a letter at a time, the first time she sees them (this browser keeps which
 *                  she has); the rest are there already
 *   click a note   it comes up big, on a card, to read; click again (or Esc) to put it back
 *
 * The sheet curls a little off the wall at its corners. Frame: ./spec (its middle, its face toward +z).
 */
const P = POSTER
const W = 2400 // the texture's pixels across
const H = Math.round((W * P.h) / P.w)
const PX = W / P.w // a mm, in pixels
const NOTE = { font: 6.4, line: 1.22, col: 92, gap: 6, pad: 3 } // mm: the handwriting's size, its lines, a column's width, between notes
const PENS = ['#2b2a33', '#25447a', '#3b2f5e', '#4a4a54', '#5a2f3c']
const SPEED = 45 // letters a second, writing in

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
/** a little random that's the same every time for the same seed */
const rng = (seed: number) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909)) >>> 0) / 4294967296

// ---- the board and the letters (drawn once, kept)
function drawBoard(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = P.colors.paper
  g.fillRect(0, 0, W, H)
  // the card's grain: faint flecks
  const r = rng(7)
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(120,100,70,0.05)' : 'rgba(255,255,255,0.06)'
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2)
  }
  drawLetters(g)
  return c
}

/** "Rina" in bubble letters, fitted to the letters' box: under each, its silhouette in marker a little fatter (twice,
 *  a hair apart, as a hand goes round it), then the letter coloured in pencil over it, so only the outer edge shows
 *  black (the font's letters are made of overlapping strokes: outlined, every overlap showed as a line across) */
function drawLetters(g: CanvasRenderingContext2D) {
  const L = P.letters
  const bx = L.x0 * W
  const by = L.y0 * H
  const bw = (L.x1 - L.x0) * W
  const bh = (L.y1 - L.y0) * H
  const word = 'Rina'
  // the biggest that fits the box (the font's ascent: about 0.72 of its size for the R)
  let size = bh / 0.78
  g.font = `800 ${size}px "Baloo 2", "Nunito", sans-serif`
  const fit = bw / g.measureText(word).width
  if (fit < 1) size *= fit
  g.font = `800 ${size}px "Baloo 2", "Nunito", sans-serif`
  const total = g.measureText(word).width
  let x = bx + (bw - total) / 2
  const base = by + bh * 0.92
  const outline = L.outline * W
  // the marker under all of them first (so no letter's edge draws over its neighbour's colour)
  g.save()
  g.lineJoin = 'round'
  g.strokeStyle = g.fillStyle = P.colors.ink
  let mx = x
  for (const ch of word) {
    g.lineWidth = outline * 2
    g.strokeText(ch, mx, base)
    g.globalAlpha = 0.75
    g.lineWidth = outline * 1.7
    g.strokeText(ch, mx + outline * 0.22, base - outline * 0.16)
    g.globalAlpha = 1
    mx += g.measureText(ch).width
  }
  g.restore()
  for (const ch of word) {
    const adv = g.measureText(ch).width
    const cols = P.colors[ch as 'R' | 'i' | 'n' | 'a']
    // the colouring, on its own canvas, so the pencil strokes stay inside the letter
    const pad = outline * 2
    const cw = Math.ceil(adv + 2 * pad)
    const chh = Math.ceil(bh * 1.25 + 2 * pad)
    const t = document.createElement('canvas')
    t.width = cw
    t.height = chh
    const tg = t.getContext('2d')!
    tg.font = g.font
    tg.textBaseline = 'alphabetic'
    const tx = pad
    const ty = chh - pad - bh * 0.08
    const grad = tg.createLinearGradient(0, ty - bh, 0, ty)
    cols.forEach((col, i) => grad.addColorStop(i / (cols.length - 1), col))
    tg.fillStyle = grad
    tg.fillText(ch, tx, ty)
    // pencil: short strokes on the slant, lighter and darker, only where the letter is
    tg.globalCompositeOperation = 'source-atop'
    const r = rng(hash(ch) + 3)
    for (let i = 0; i < 2600; i++) {
      const sx = r() * cw
      const sy = r() * chh
      const len = 10 + r() * 26
      tg.strokeStyle = r() < 0.55 ? `rgba(255,255,255,${0.08 + r() * 0.14})` : `rgba(60,20,40,${0.04 + r() * 0.08})`
      tg.lineWidth = 1 + r() * 1.6
      tg.beginPath()
      tg.moveTo(sx, sy)
      tg.lineTo(sx + len * 0.8, sy - len * 0.6)
      tg.stroke()
    }
    g.drawImage(t, x - tx, base - ty)
    x += adv
  }
}

// ---- the notes: where each goes, and drawing them
type Placed = { note: Note; x: number; y: number; w: number; h: number; lines: string[]; pen: string; tilt: number }
/** wrap a note's words to a column; its lines */
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width > width && line) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}
/** the notes laid out in the bands round the letters, column by column, in order; what doesn't fit is left off */
function layout(g: CanvasRenderingContext2D, notes: Note[]): Placed[] {
  const F = NOTE.font * PX
  const lh = F * NOTE.line
  g.font = `600 ${F}px "Caveat", "Gaegu", cursive`
  const out: Placed[] = []
  let n = 0
  for (const [x0, y0, x1, y1] of P.bands) {
    const bw = (x1 - x0) * W
    const cols = Math.max(1, Math.floor(bw / (NOTE.col * PX)))
    const cw = bw / cols
    for (let c = 0; c < cols && n < notes.length; c++) {
      let y = y0 * H + NOTE.pad * PX
      const x = x0 * W + c * cw + NOTE.pad * PX
      while (n < notes.length) {
        const note = notes[n]
        const lines = wrap(g, note.text, cw - 2 * NOTE.pad * PX)
        const h = (lines.length + (note.name ? 1 : 0)) * lh
        if (y + h > y1 * H - NOTE.pad * PX) break
        const r = rng(hash(note.id))
        out.push({ note, x, y, w: cw - 2 * NOTE.pad * PX, h, lines, pen: PENS[hash(note.name || note.id) % PENS.length], tilt: (r() - 0.5) * 0.02 })
        y += h + NOTE.gap * PX
        n++
      }
    }
  }
  if (n < notes.length) console.info(`poster: ${notes.length - n} notes didn't fit`)
  return out
}
/** the notes, written: `shown` letters of each (for writing them in) */
function drawNotes(g: CanvasRenderingContext2D, placed: Placed[], shown: (i: number) => number) {
  const F = NOTE.font * PX
  const lh = F * NOTE.line
  g.textBaseline = 'top'
  placed.forEach((p, i) => {
    let left = shown(i)
    if (left <= 0) return
    g.save()
    g.translate(p.x, p.y)
    g.rotate(p.tilt)
    g.fillStyle = p.pen
    g.font = `600 ${F}px "Caveat", "Gaegu", cursive`
    p.lines.forEach((line, k) => {
      if (left <= 0) return
      g.fillText(line.slice(0, left), 0, k * lh)
      left -= line.length + 1
    })
    if (p.note.name && left > 0) {
      g.font = `500 ${F * 0.9}px "Caveat", "Gaegu", cursive`
      g.textAlign = 'right'
      g.fillText(`—${p.note.name}`.slice(0, left + 1), p.w, p.lines.length * lh)
    }
    g.restore()
  })
}
const length = (p: Placed) => p.lines.reduce((a, l) => a + l.length + 1, 0) + (p.note.name ? p.note.name.length + 1 : 0)

const SEEN = 'poster.seen'
const seenIds = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(SEEN) ?? '[]'))
  } catch {
    return new Set<string>()
  }
}

/** the poster, its face toward +z; `notes` written in round the letters */
export function Poster({ notes }: { notes: Note[] }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return { c, g: c.getContext('2d')!, t }
  }, [])
  const mat = useMemo(() => new MeshStandardMaterial({ map: tex.t, roughness: 0.95 }), [tex])
  const geo = useMemo(() => {
    // a card that's lain flat a while: its corners curl off the wall a little
    const g = new PlaneGeometry(P.w, P.h, 24, 18)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const u = Math.abs(pos.getX(i)) / (P.w / 2)
      const v = Math.abs(pos.getY(i)) / (P.h / 2)
      pos.setZ(i, P.curl * Math.pow(u, 3) * Math.pow(v, 3) + 0.4 * Math.pow(Math.max(u, v), 4))
    }
    g.computeVertexNormals()
    return g
  }, [])
  // the board and letters once the fonts are in (drawn at once with what's there, again when they come)
  const [board, setBoard] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    let live = true
    setBoard(drawBoard())
    Promise.all(['800 100px "Baloo 2"', '600 40px "Caveat"', '500 40px "Caveat"'].map((f) => document.fonts.load(f)))
      .then(() => live && setBoard(drawBoard()))
      .catch(() => {})
    return () => void (live = false)
  }, [])
  const placed = useMemo(() => (board ? layout(tex.g, notes) : []), [board, notes, tex])
  // writing in: the notes she hasn't seen, one after another
  const write = useRef({ t: 0, fresh: [] as number[], done: true })
  useEffect(() => {
    const seen = seenIds()
    const fresh = placed.map((p, i) => (seen.has(p.note.id) ? -1 : i)).filter((i) => i >= 0)
    write.current = { t: 0, fresh, done: fresh.length === 0 }
    paint(write.current.done ? Infinity : 0)
    if (fresh.length)
      try {
        localStorage.setItem(SEEN, JSON.stringify([...seen, ...fresh.map((i) => placed[i].note.id)]))
      } catch {
        /* (no storage) */
      }
  }, [placed]) // eslint-disable-line react-hooks/exhaustive-deps
  /** the texture at `t` seconds into writing in */
  const paint = (t: number) => {
    if (!board) return
    tex.g.drawImage(board, 0, 0)
    const w = write.current
    let budget = t * SPEED
    const shown = new Map<number, number>()
    for (const i of w.fresh) {
      const n = Math.min(length(placed[i]), Math.max(0, budget))
      shown.set(i, n)
      budget -= length(placed[i])
    }
    drawNotes(tex.g, placed, (i) => (shown.has(i) ? shown.get(i)! : Infinity))
    tex.t.needsUpdate = true
  }
  const last = useRef(0)
  useFrame((_, dt) => {
    const w = write.current
    if (w.done) return
    w.t += Math.min(dt, 0.1)
    const all = w.fresh.reduce((a, i) => a + length(placed[i]), 0)
    if (w.t * SPEED >= all) w.done = true
    if (w.done || w.t - last.current > 0.05) {
      last.current = w.t
      paint(w.done ? Infinity : w.t)
    }
  })
  // a note, clicked: up close (on the page, over the canvas: <PosterCard />)
  const click = (e: ThreeEvent<MouseEvent>) => {
    const uv = e.uv
    if (!uv) return
    const x = uv.x * W
    const y = (1 - uv.y) * H
    const hit = placed.find((p) => x >= p.x - 6 && x <= p.x + p.w + 6 && y >= p.y - 6 && y <= p.y + p.h + 6)
    if (!hit) return
    e.stopPropagation()
    card.set(hit.note)
  }
  return <mesh geometry={geo} material={mat} receiveShadow onClick={click} />
}

/** the note that's up close, if one is */
const card = (() => {
  let open: Note | null = null
  const subs = new Set<() => void>()
  return {
    get: () => open,
    set(n: Note | null) {
      open = n
      subs.forEach((f) => f())
    },
    subscribe: (f: () => void) => (subs.add(f), () => void subs.delete(f)),
  }
})()

/** the note clicked, on a card over the page, big enough to read (on the page, outside the canvas) */
export function PosterCard() {
  const open = useSyncExternalStore(card.subscribe, card.get)
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && card.set(null)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])
  if (!open) return null
  return (
    <div className="poster-card" onClick={() => card.set(null)}>
      <div>
        <p>{open.text}</p>
        {open.name && <p className="poster-card-name">—{open.name}</p>}
      </div>
    </div>
  )
}
