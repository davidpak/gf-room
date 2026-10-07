import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import './poster.css'
import { CanvasTexture, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { POSTER } from './spec'
import { LETTERS } from './letters'
import type { Note } from './messages'

/**
 * The "Rina" poster (./spec), painted into its own texture: the poster board, her name as she drew it (./letters,
 * traced off her poster), and her friends' notes (./messages) written in round it.
 *
 *   their hands    each friend's note in a hand of its own (one of eight handwritings) and a pen of its own; the
 *                  writing shrinks till every note fits round her name (to 50 and more), as the real one's did
 *   new notes      write themselves in, a letter at a time, the first time she sees them (this browser keeps which
 *                  she has)
 *   today's note   one friend's note a day comes off the poster onto a sticky note over its corner, big enough to
 *                  read from her chair: a different friend every day, round them all; a new one goes first
 *   reading        click the poster (or the sticky): the notes come up as cards, today's first; ← → (or a click on
 *                  either side) to go through them, Esc to put them away
 *
 * The sheet curls a little off the wall at its corners. Frame: ./spec (its middle, its face toward +z).
 */
const P = POSTER
const W = 2400 // the texture's pixels across
const H = Math.round((W * P.h) / P.w)
const PX = W / P.w // a mm, in pixels
// mm: handwriting sizes tried, biggest first; its lines; a column; between notes; a column's margin
const NOTE = { sizes: [7, 6.4, 5.8, 5.2, 4.7, 4.2, 3.8, 3.4], line: 1.2, col: 88, gap: 5, pad: 3 }
const PENS = ['#2b2a33', '#25447a', '#3b2f5e', '#4a4a54', '#5a2f3c', '#1f4f4a']
/** the friends' hands: a handwriting each (k: its size against the others', so they read alike) */
export const HANDS = [
  { font: '600 {}px "Caveat"', k: 1.12 },
  { font: '700 {}px "Gaegu"', k: 1.05 },
  { font: '{}px "Indie Flower"', k: 0.9 },
  { font: '{}px "Patrick Hand"', k: 0.95 },
  { font: '{}px "Shadows Into Light Two"', k: 0.92 },
  { font: '{}px "Kalam"', k: 0.85 },
  { font: '{}px "Nanum Pen Script"', k: 1.3 },
  { font: '{}px "Gochi Hand"', k: 0.92 },
]
const who = (n: Note) => n.name.toLowerCase() || n.id
export const handOf = (n: Note) => HANDS[hash(who(n)) % HANDS.length]
export const fontOf = (n: Note, px: number) => handOf(n).font.replace('{}', String(px * handOf(n).k))
export const penOf = (n: Note) => PENS[hash(who(n)) % PENS.length]
const SPEED = 45 // letters a second, writing in
const WRITE_IN = 3 // new notes written in at most (the rest of a big lot are just there)

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
/** a little random that's the same every time for the same seed */
const rng = (seed: number) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909)) >>> 0) / 4294967296

// ---- the board and the letters (drawn once, kept)
function drawBoard(colors: HTMLImageElement | null): HTMLCanvasElement {
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
  if (colors) drawLetters(g, colors)
  return c
}

/** her "Rina" (./letters: traced off her poster), fitted to the letters' box, drawn as she did it:
 *
 *   her marker   round her shapes, as wide as hers, under the colouring (which covers its inner half)
 *   her pencil   coloured in by hand, not filled: a light first layer of her colours, then thousands of strokes on
 *                her slant, each in the colour where it lands (her gradient, ./letters' colours), a little lighter or
 *                darker, a little curved, pressed harder or softer, layered so the colours meet in strokes, not a
 *                blend; the paper's tooth left showing as specks (pencil skips over its pits)
 */
function drawLetters(g: CanvasRenderingContext2D, colors: HTMLImageElement) {
  const L = P.letters
  const bx = L.x0 * W
  const by = L.y0 * H
  const bw = (L.x1 - L.x0) * W
  const bh = (L.y1 - L.y0) * H
  // (her letters' own bounds into the box, as big as they go)
  const [x0, y0, x1, y1] = LETTERS.box
  const k = Math.min(bw / (x1 - x0), bh / (y1 - y0))
  g.save()
  g.translate(bx + (bw - (x1 - x0) * k) / 2 - x0 * k, by + (bh - (y1 - y0) * k) / 2 - y0 * k)
  g.scale(k, k)
  const fill = new Path2D(LETTERS.fill)
  // her marker
  g.save()
  g.lineJoin = g.lineCap = 'round'
  g.strokeStyle = P.colors.ink
  g.lineWidth = LETTERS.ink * 2
  g.stroke(fill)
  g.restore()
  // her colours, to sample (each stroke takes the colour where it lands)
  const cw = colors.naturalWidth
  const ch = colors.naturalHeight
  const pc = document.createElement('canvas')
  pc.width = cw
  pc.height = ch
  const pg = pc.getContext('2d')!
  pg.drawImage(colors, 0, 0)
  const pix = pg.getImageData(0, 0, cw, ch).data
  const sx = cw / LETTERS.w
  const sy = ch / LETTERS.h
  const colourAt = (x: number, y: number) => {
    const i = (Math.min(ch - 1, Math.max(0, (y * sy) | 0)) * cw + Math.min(cw - 1, Math.max(0, (x * sx) | 0))) * 4
    return [pix[i], pix[i + 1], pix[i + 2]]
  }
  g.save()
  g.clip(fill)
  // (the paper first, over the marker's inner half: the pencil's see-through, and would show it as a dark band)
  g.fillStyle = P.colors.paper
  g.fill(fill)
  // the first light layer: her colours, thin, the paper still showing
  g.globalAlpha = 0.45
  g.imageSmoothingQuality = 'high'
  g.drawImage(colors, 0, 0, LETTERS.w, LETTERS.h)
  g.globalAlpha = 1
  // then the pencil, a layer at a time, each firmer than the last, its slant a touch different (a hand shifts)
  g.lineCap = 'round'
  const r = rng(11)
  const SLANT = -1.0 // radians: her strokes run up to the right
  // (a stroke starts inside the letter it colours, so it takes that letter's colour: tested where it lands on the canvas)
  const m = g.getTransform()
  const inside = (x: number, y: number) => g.isPointInPath(fill, m.a * x + m.e, m.d * y + m.f)
  for (const [n, press, turn] of [
    [14000, 0.26, 0],
    [14000, 0.34, 0.1],
    [9000, 0.42, -0.08],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0)
      const y = y0 + r() * (y1 - y0)
      if (!inside(x, y)) continue
      // her colour here, or now and then a neighbour's (where colours meet they overlap in strokes)
      const off = r() < 0.2 ? (r() - 0.5) * 70 : 0
      const c = colourAt(x, inside(x, y + off) ? y + off : y)
      const shade = 0.88 + r() * 0.2
      const a = SLANT + turn + (r() - 0.5) * 0.25
      const len = 26 + r() * 46
      const dx = Math.cos(a) * len
      const dy = Math.sin(a) * len
      const bend = (r() - 0.5) * len * 0.15
      g.strokeStyle = `rgba(${(c[0] * shade) | 0},${(c[1] * shade) | 0},${(c[2] * shade) | 0},${press * (0.6 + r() * 0.6)})`
      g.lineWidth = 1.6 + r() * 2.2
      g.beginPath()
      g.moveTo(x - dx / 2, y - dy / 2)
      g.quadraticCurveTo(x - (dy / len) * bend, y + (dx / len) * bend, x + dx / 2, y + dy / 2)
      g.stroke()
    }
  }
  // the paper's tooth: specks the pencil skipped
  g.fillStyle = P.colors.paper
  for (let i = 0; i < 9000; i++) {
    g.globalAlpha = 0.15 + r() * 0.35
    g.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1 + r() * 1.6, 1 + r() * 1.6)
  }
  g.restore()
  g.restore()
}

// ---- the notes: where each goes, and drawing them
type Placed = { note: Note; x: number; y: number; w: number; h: number; lines: string[]; pen: string; tilt: number; size: number }
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
/** the notes laid out in the bands round the letters, column by column, in order, at `mm` handwriting */
function layoutAt(g: CanvasRenderingContext2D, notes: Note[], mm: number): Placed[] {
  const F = mm * PX
  const lh = F * NOTE.line
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
        g.font = fontOf(note, F)
        const lines = wrap(g, note.text, cw - 2 * NOTE.pad * PX)
        const h = (lines.length + (note.name ? 1 : 0)) * lh
        if (y + h > y1 * H - NOTE.pad * PX) break
        const r = rng(hash(note.id))
        out.push({ note, x, y, w: cw - 2 * NOTE.pad * PX, h, lines, pen: penOf(note), tilt: (r() - 0.5) * 0.02, size: F })
        y += h + NOTE.gap * PX * (mm / 6)
        n++
      }
    }
  }
  return out
}
/** the biggest handwriting they all fit at (what doesn't fit even at the smallest is left off, and said) */
function layout(g: CanvasRenderingContext2D, notes: Note[]): Placed[] {
  let out: Placed[] = []
  for (const mm of NOTE.sizes) {
    out = layoutAt(g, notes, mm)
    if (out.length === notes.length) return out
  }
  console.info(`poster: ${notes.length - out.length} notes didn't fit`)
  return out
}
/** the notes, written: `shown` letters of each (for writing them in) */
function drawNotes(g: CanvasRenderingContext2D, placed: Placed[], shown: (i: number) => number) {
  g.textBaseline = 'top'
  placed.forEach((p, i) => {
    let left = shown(i)
    if (left <= 0) return
    const lh = p.size * NOTE.line
    g.save()
    g.translate(p.x, p.y)
    g.rotate(p.tilt)
    g.fillStyle = p.pen
    g.font = fontOf(p.note, p.size)
    p.lines.forEach((line, k) => {
      if (left <= 0) return
      g.fillText(line.slice(0, left), 0, k * lh)
      left -= line.length + 1
    })
    if (p.note.name && left > 0) {
      g.font = fontOf(p.note, p.size * 0.9)
      g.textAlign = 'right'
      g.fillText(`—${p.note.name}`.slice(0, left + 1), p.w, p.lines.length * lh)
    }
    g.restore()
  })
}
const length = (p: Placed) => p.lines.reduce((a, l) => a + l.length + 1, 0) + (p.note.name ? p.note.name.length + 1 : 0)

// ---- today's note: one a day, round them all; a new one first
const FIRST = 'poster.first' // when each was first seen (this browser)
function firstSeen(notes: Note[]) {
  let m: Record<string, number> = {}
  try {
    m = JSON.parse(localStorage.getItem(FIRST) ?? '{}')
  } catch {
    /* (none) */
  }
  let changed = false
  for (const n of notes) if (!m[n.id]) (m[n.id] = Date.now()), (changed = true)
  if (changed)
    try {
      localStorage.setItem(FIRST, JSON.stringify(m))
    } catch {
      /* (no storage) */
    }
  return m
}
/** today's note: the newest, if it came in the last day (and isn't just the first lot she ever saw); else the next
 *  in turn, a day each */
export function todays(notes: Note[]): number {
  if (!notes.length) return -1
  const m = firstSeen(notes)
  const times = notes.map((n) => m[n.id])
  const newest = Math.max(...times)
  const fresh = times.filter((t) => t === newest).length
  if (Date.now() - newest < 86_400_000 && fresh < notes.length) return times.indexOf(newest)
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000)
  return day % notes.length
}

/** how far the poster stands off the wall at (x, y) on it: its corners curl */
function surface(x: number, y: number) {
  const u = Math.min(1, Math.abs(x) / (P.w / 2))
  const v = Math.min(1, Math.abs(y) / (P.h / 2))
  return P.curl * Math.pow(u, 3) * Math.pow(v, 3) + 0.4 * Math.pow(Math.max(u, v), 4)
}

// ---- the sticky note
const STICKY = { size: 102, pad: 8, curl: 4 } // mm: a 4" square note, its margin, how far its bottom curls off
/** where it's stuck: over the poster's lower right corner, a little crooked */
const STICKY_AT = { x: P.w / 2 - 50, y: -P.h / 2 + 58, rot: -0.07 }
const STICKY_COLORS = ['#fff19a', '#ffc6d9', '#bfe6ff', '#c9f2b8', '#ffd3a1']
const SP = 6 // its texture's pixels a mm
/** today's note on its sticky: as big as it fits */
function drawSticky(g: CanvasRenderingContext2D, note: Note) {
  const S = STICKY.size * SP
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = STICKY_COLORS[hash(note.id) % STICKY_COLORS.length]
  g.fillRect(0, 0, S, S)
  // the glue strip a shade darker along the top; a soft shadow where it lifts at the bottom
  g.fillStyle = 'rgba(0,0,0,0.04)'
  g.fillRect(0, 0, S, S * 0.16)
  const grad = g.createLinearGradient(0, S * 0.85, 0, S)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.07)')
  g.fillStyle = grad
  g.fillRect(0, S * 0.85, S, S * 0.15)
  const pad = STICKY.pad * SP
  const head = 7 * SP
  g.fillStyle = 'rgba(80,40,60,0.55)'
  g.font = `600 ${head * 0.8}px "Caveat"`
  g.textBaseline = 'top'
  g.textAlign = 'left'
  g.fillText('today’s note ♡', pad, pad * 0.7)
  for (let size = 13 * SP; size > 4 * SP; size -= 0.5 * SP) {
    g.font = fontOf(note, size)
    const lines = wrap(g, note.text, S - 2 * pad)
    const lh = size * 1.12
    const h = lines.length * lh + (note.name ? lh : 0)
    if (h > S - 2 * pad - head) continue
    g.fillStyle = penOf(note)
    let y = pad + head + (S - 2 * pad - head - h) / 2
    for (const l of lines) g.fillText(l, pad, y), (y += lh)
    if (note.name) {
      g.font = fontOf(note, size * 0.9)
      g.textAlign = 'right'
      g.fillText(`—${note.name}`, S - pad, y)
      g.textAlign = 'left'
    }
    return
  }
}

const SEEN = 'poster.seen'
const seenIds = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(SEEN) ?? '[]'))
  } catch {
    return new Set<string>()
  }
}

/** every hand's font, to be in before writing (else the first notes are in the fallback hand) */
const FONTS = HANDS.map((h) => h.font.replace('{}', '40'))

/** the poster, its face toward +z; `notes` written in round the letters, today's on a sticky over its corner */
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
    for (let i = 0; i < pos.count; i++) pos.setZ(i, surface(pos.getX(i), pos.getY(i)))
    g.computeVertexNormals()
    return g
  }, [])
  // the board and her letters once her colours and every hand's font are in
  const [board, setBoard] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    let live = true
    const colors = new Image()
    colors.src = LETTERS.colors
    Promise.all([colors.decode(), ...FONTS.map((f) => document.fonts.load(f))])
      .then(() => live && setBoard(drawBoard(colors)))
      .catch(() => live && setBoard(drawBoard(colors.complete ? colors : null)))
    return () => void (live = false)
  }, [])
  const placed = useMemo(() => (board ? layout(tex.g, notes) : []), [board, notes, tex])
  // writing in: the notes she hasn't seen, one after another
  const write = useRef({ t: 0, fresh: [] as number[], done: true })
  useEffect(() => {
    const seen = seenIds()
    // (her first look: they're all there already; after that, what's new writes itself in, the newest few of it)
    const fresh = seen.size ? placed.map((p, i) => (seen.has(p.note.id) ? -1 : i)).filter((i) => i >= 0).slice(-WRITE_IN) : []
    const unseen = placed.filter((p) => !seen.has(p.note.id)).map((p) => p.note.id)
    write.current = { t: 0, fresh, done: fresh.length === 0 }
    paint(write.current.done ? Infinity : 0)
    if (unseen.length)
      try {
        localStorage.setItem(SEEN, JSON.stringify([...seen, ...unseen]))
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

  // today's note, on its sticky: its texture, a square of paper whose bottom lifts off the poster
  const today = useMemo(() => todays(notes), [notes])
  const sticky = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = STICKY.size * SP
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    const g = new PlaneGeometry(STICKY.size, STICKY.size, 8, 10)
    const pos = g.attributes.position
    const cr = Math.cos(STICKY_AT.rot)
    const sn = Math.sin(STICKY_AT.rot)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const v = y / STICKY.size + 0.5 // (1 at its glued top, 0 at its free bottom)
      // (on the poster where it lies, a hair off it, then its bottom lifting)
      const px = STICKY_AT.x + x * cr - y * sn
      const py = STICKY_AT.y + x * sn + y * cr
      pos.setZ(i, surface(px, py) + 0.8 + STICKY.curl * (1 - v) * (1 - v))
    }
    g.computeVertexNormals()
    return { c, g: c.getContext('2d')!, t, geo: g, mat: new MeshStandardMaterial({ map: t, roughness: 0.9 }) }
  }, [])
  useEffect(() => {
    if (!board || today < 0) return
    drawSticky(sticky.g, notes[today])
    sticky.t.needsUpdate = true
  }, [board, today, notes, sticky])

  // a click: the notes as cards (the one clicked first, or today's)
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!notes.length) return
    e.stopPropagation()
    const uv = e.uv
    const x = (uv?.x ?? 0) * W
    const y = (1 - (uv?.y ?? 0)) * H
    const hit = placed.find((p) => x >= p.x - 6 && x <= p.x + p.w + 6 && y >= p.y - 6 && y <= p.y + p.h + 6)
    cards.open(notes, hit ? notes.indexOf(hit.note) : Math.max(0, today))
  }
  const openToday = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    cards.open(notes, today)
  }
  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow onClick={click} />
      {today >= 0 && (
        <mesh geometry={sticky.geo} material={sticky.mat} position={[STICKY_AT.x, STICKY_AT.y, 0]} rotation={[0, 0, STICKY_AT.rot]} castShadow receiveShadow onClick={openToday} />
      )}
    </group>
  )
}

/** the notes up close: which, and which one's showing */
const cards = (() => {
  let state: { notes: Note[]; i: number } | null = null
  const subs = new Set<() => void>()
  const set = (s: typeof state) => {
    state = s
    subs.forEach((f) => f())
  }
  return {
    get: () => state,
    open: (notes: Note[], i: number) => set({ notes, i: Math.max(0, i) }),
    step: (d: number) => state && set({ ...state, i: (state.i + d + state.notes.length) % state.notes.length }),
    close: () => set(null),
    subscribe: (f: () => void) => (subs.add(f), () => void subs.delete(f)),
  }
})()

/** the notes as cards over the page, each in its friend's hand, big enough to read: ← → (or a click on either side
 *  of the card) through them, Esc or a click off it to put them away (on the page, outside the canvas) */
export function PosterCard() {
  const st = useSyncExternalStore(cards.subscribe, cards.get)
  useEffect(() => {
    if (!st) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cards.close()
      else if (e.key === 'ArrowRight') cards.step(1)
      else if (e.key === 'ArrowLeft') cards.step(-1)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [st])
  if (!st) return null
  const n = st.notes[st.i]
  const font = fontOf(n, 30)
  return (
    <div className="poster-card" onClick={() => cards.close()}>
      <div
        key={n.id}
        style={{ font, color: penOf(n), transform: `rotate(${((hash(n.id) % 5) - 2) * 0.6}deg)` }}
        onClick={(e) => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          cards.step(e.clientX < r.left + r.width / 2 ? -1 : 1)
        }}
      >
        <p>{n.text}</p>
        {n.name && <p className="poster-card-name">—{n.name}</p>}
        {st.notes.length > 1 && (
          <p className="poster-card-count">
            {st.i + 1} of {st.notes.length}
          </p>
        )}
      </div>
    </div>
  )
}
