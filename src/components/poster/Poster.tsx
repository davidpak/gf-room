import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import './poster.css'
import { CanvasTexture, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { POSTER } from './spec'
import { LETTERS } from './letters'
import type { Note } from './messages'

/**
 * The "Rina" poster (./spec), painted into its own texture, as hers is made: white poster board, her name across it
 * (./letters: her own letters off the photo, drawn clean) in black marker coloured in with her colours, and all
 * round it her friends' notes (./messages), typed, a slip of printer paper each, signed, glued on in columns
 * wherever the letters leave room.
 *
 *   the notes      the type is as big as lets every note on (to 50 and more); each slip as wide as its words
 *   new notes      type themselves in the first time she sees them (this browser keeps which she has); what came
 *                  since her first look has its name highlighted, a few days
 *   today's note   one friend's note a day comes off the poster onto a sticky note over its corner, in a hand, big
 *                  enough to read from her chair: a different friend every day, round them all; a new one goes first
 *   reading        click a slip (or the sticky): the notes come up as slips, that one first; ← → (or a click on
 *                  either side) to go through them, Esc to put them away
 *
 * The sheet curls a little off the wall at its corners. Frame: ./spec (its middle, its face toward +z).
 */
const P = POSTER
const W = 2400 // the texture's pixels across
const H = Math.round((W * P.h) / P.w)
const PX = W / P.w // a mm, in pixels
// mm: type sizes tried (biggest first, down to her poster's); its lines; a slip's margin; between slips
const TYPE = { max: 9, min: 2.6, step: 0.2, line: 1.28, pad: 0.55, gap: 0.8 }
const typeFont = (px: number) => `${px}px Arial, "Helvetica Neue", Helvetica, sans-serif`
/** the friends' hands, for today's sticky (k: its size against the others', so they read alike) */
const HANDS = [
  { font: '600 {}px "Caveat"', k: 1.12 },
  { font: '700 {}px "Gaegu"', k: 1.05 },
  { font: '{}px "Indie Flower"', k: 0.9 },
  { font: '{}px "Patrick Hand"', k: 0.95 },
  { font: '{}px "Shadows Into Light Two"', k: 0.92 },
  { font: '{}px "Kalam"', k: 0.85 },
  { font: '{}px "Nanum Pen Script"', k: 1.3 },
  { font: '{}px "Gochi Hand"', k: 0.92 },
]
const PENS = ['#2b2a33', '#25447a', '#3b2f5e', '#4a4a54', '#5a2f3c', '#1f4f4a']
const who = (n: Note) => n.name.toLowerCase() || n.id
const handOf = (n: Note) => HANDS[hash(who(n)) % HANDS.length]
const fontOf = (n: Note, px: number) => handOf(n).font.replace('{}', String(px * handOf(n).k))
const penOf = (n: Note) => PENS[hash(who(n)) % PENS.length]
const SPEED = 60 // letters a second, typing in
const WRITE_IN = 3 // new notes typed in at most (the rest of a big lot are just there)
const NEW_FOR = 4 * 86_400_000 // how long a new note's name stays highlighted

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
/** a little random that's the same every time for the same seed */
const rng = (seed: number) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909)) >>> 0) / 4294967296

// ---- her letters: where they go on the sheet (texture pixels), and as paths
const LET = (() => {
  const L = P.letters
  const bw = (L.x1 - L.x0) * W
  const bh = (L.y1 - L.y0) * H
  const [x0, y0, x1, y1] = LETTERS.box
  const k = Math.min(bw / (x1 - x0), bh / (y1 - y0))
  return { k, tx: L.x0 * W + (bw - (x1 - x0) * k) / 2 - x0 * k, ty: L.y0 * H + (bh - (y1 - y0) * k) / 2 - y0 * k }
})()
const NAMES = ['R', 'i', 'n', 'a'] as const
const MARKER = (P.marker * PX) / LET.k // her marker, in the letters' frame

// ---- the board and the letters (drawn once, kept)
function drawBoard(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = P.colors.paper
  g.fillRect(0, 0, W, H)
  // the board's grain: faint flecks
  const r = rng(7)
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(120,100,70,0.04)' : 'rgba(255,255,255,0.08)'
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2)
  }
  drawLetters(g)
  return c
}

/** her "Rina", as she made it:
 *
 *   her marker    round each letter, an even line about as wide as hers, gone over a second time a hair off
 *                 (as a hand does), the colouring covering its inner half
 *   her colours   each letter coloured top to bottom through her colours (./spec), crayon-soft: pressed harder in
 *                 places, lighter in others; a fine grain of strokes on her slant, the paper's tooth showing through
 *                 as specks; deeper along the marker, where a hand colouring up to a line presses
 */
function drawLetters(g: CanvasRenderingContext2D) {
  const paths = Object.fromEntries(NAMES.map((n) => [n, new Path2D(LETTERS.parts[n])])) as Record<(typeof NAMES)[number], Path2D>
  const all = new Path2D()
  for (const n of NAMES) all.addPath(paths[n])
  const [x0, y0, x1, y1] = LETTERS.box
  g.save()
  g.setTransform(LET.k, 0, 0, LET.k, LET.tx, LET.ty)
  g.lineJoin = g.lineCap = 'round'
  // her marker (the ink bleeds a touch into the board: a soft edge first)
  g.strokeStyle = P.colors.ink
  g.globalAlpha = 0.25
  g.lineWidth = MARKER * 2 + 3
  g.stroke(all)
  g.globalAlpha = 1
  g.lineWidth = MARKER * 2
  g.stroke(all)
  g.save()
  g.translate(1.2, -0.8)
  g.globalAlpha = 0.7
  g.lineWidth = MARKER * 1.85
  g.stroke(all)
  g.restore()
  g.globalAlpha = 1
  // her colours: each letter through its stops
  for (const n of NAMES) {
    const [bx0, by0, bx1, by1] = LETTERS.boxes[n]
    const { stops, dir } = P.coloring[n]
    const at = (u: number, v: number) => [bx0 + u * (bx1 - bx0), by0 + v * (by1 - by0)] as const
    const grad = g.createLinearGradient(...at(dir[0], dir[1]), ...at(dir[2], dir[3]))
    stops.forEach((s, k) => grad.addColorStop(k / (stops.length - 1), s))
    g.fillStyle = grad
    g.fill(paths[n])
  }
  g.save()
  g.clip(all)
  const r = rng(11)
  // pressed harder here, lighter there: soft patches (a coarse noise, blown up smooth)
  const nc = document.createElement('canvas')
  nc.width = 48
  nc.height = 36
  const ng = nc.getContext('2d')!
  for (let y = 0; y < nc.height; y++)
    for (let x = 0; x < nc.width; x++) {
      const v = r()
      ng.fillStyle = v < 0.5 ? `rgba(255,255,255,${(0.5 - v) * 0.42})` : `rgba(60,20,40,${(v - 0.5) * 0.12})`
      ng.fillRect(x, y, 1, 1)
    }
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(nc, x0, y0, x1 - x0, y1 - y0)
  // the grain: short strokes on her slant, light ones (the paper between them) and darker ones (a firmer stroke)
  const SLANT = -1.05
  for (const [n, color, alpha, width] of [
    [9000, '255,255,255', 0.22, 1.4],
    [9000, '255,255,255', 0.14, 2.2],
    [8000, '50,20,40', 0.07, 1.6],
    [6000, '50,20,40', 0.05, 2.6],
  ] as const) {
    const p = new Path2D()
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0)
      const y = y0 + r() * (y1 - y0)
      const a = SLANT + (r() - 0.5) * 0.3
      const len = 7 + r() * 16
      p.moveTo(x, y)
      p.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
    }
    g.strokeStyle = `rgba(${color},${alpha})`
    g.lineWidth = width
    g.stroke(p)
  }
  // deeper along the marker (inside it: the outer half's under the clip's edge, and the marker over it)
  g.strokeStyle = 'rgba(70,25,35,0.10)'
  g.lineWidth = 16
  g.stroke(all)
  // the paper's tooth: specks the crayon skipped
  g.fillStyle = P.colors.paper
  for (let i = 0; i < 7000; i++) {
    g.globalAlpha = 0.3 + r() * 0.5
    const s = 0.8 + r() * 1.6
    g.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), s, s)
  }
  g.restore()
  g.restore()
}

// ---- the notes: where there's room for them, where each goes, and typing them
/** the board's room for notes, as hers: columns above the letters and below them, and one down the right; each
 *  column's room the full height, less where the letters are in it (found off the letters themselves) */
type Room = { x: number; y: number; w: number; h: number }
let ROOM: Room[] | null = null
const room = (): Room[] => (ROOM ??= (() => {
  const N = P.notes
  const m = N.margin * PX
  const clear = (N.clear + P.marker) * PX
  // the letters as a coarse mask, to find what each column's clear of
  const S = 4 // texture pixels to a mask pixel
  const mc = document.createElement('canvas')
  mc.width = Math.ceil(W / S)
  mc.height = Math.ceil(H / S)
  const mg = mc.getContext('2d', { willReadFrequently: true })!
  mg.setTransform(LET.k / S, 0, 0, LET.k / S, LET.tx / S, LET.ty / S)
  for (const n of NAMES) mg.fill(new Path2D(LETTERS.parts[n]))
  const px = mg.getImageData(0, 0, mc.width, mc.height).data
  const span = (xa: number, xb: number) => {
    let top = Infinity
    let bottom = -Infinity
    for (let y = 0; y < mc.height; y++)
      for (let x = Math.max(0, Math.floor(xa / S)); x < Math.min(mc.width, Math.ceil(xb / S)); x++)
        if (px[(y * mc.width + x) * 4 + 3] > 0) {
          top = Math.min(top, y * S)
          bottom = Math.max(bottom, (y + 1) * S)
        }
    return { top, bottom }
  }
  const out: Room[] = []
  const below: Room[] = []
  // a column down either side of the letters, the whole height (if there's room for one)
  const SIDE = 30 * PX
  const left = LET.tx + LETTERS.box[0] * LET.k - clear
  const right = LET.tx + LETTERS.box[2] * LET.k + clear
  const hasLeft = left - m > SIDE
  const hasRight = W - m - right > SIDE
  // and between them, columns above the letters and below, as near the size as fits
  const x0 = hasLeft ? left + N.gap * PX : m
  const across = (hasRight ? right - N.gap * PX : W - m) - x0
  const cols = Math.max(1, Math.round(across / (N.col * PX)))
  const cw = (across - (cols - 1) * N.gap * PX) / cols
  for (let c = 0; c < cols; c++) {
    const x = x0 + c * (cw + N.gap * PX)
    const { top, bottom } = span(x - clear, x + cw + clear)
    if (top === Infinity) out.push({ x, y: m, w: cw, h: H - 2 * m })
    else {
      if (top - clear - m > 12 * PX) out.push({ x, y: m, w: cw, h: top - clear - m })
      // (along the bottom: short of today's sticky, stuck over the corner)
      const w = Math.min(cw, (P.w / 2 + STICKY_AT.x - STICKY.size / 2 - 4) * PX - N.clear * PX - x)
      if (H - m - bottom - clear > 12 * PX && w > 30 * PX) below.push({ x, y: bottom + clear, w, h: H - m - bottom - clear })
    }
  }
  // (down to today's sticky, stuck over the corner)
  const sticky = H / 2 - (STICKY_AT.y + STICKY.size / 2) * PX - N.clear * PX
  if (hasRight) out.push({ x: right, y: m, w: W - m - right, h: sticky - m })
  // (as you'd read them going round: along the top, down the right, along the bottom, up the left)
  return [...out, ...below, ...(hasLeft ? [{ x: m, y: m, w: left - m, h: H - 2 * m }] : [])]
})())

type Placed = { note: Note; x: number; y: number; w: number; h: number; lines: string[]; size: number; tilt: number; room: number }
/** a note's words wrapped to `width`, its signature kept to its last word ("—Name" never splits) */
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
const typed = (n: Note) => (n.name ? `${n.text} —${n.name.replace(/ /g, ' ')}` : n.text)
/** the notes on slips in the room, in order, at `mm` type, each column filled only to `fill` of it (a slip may start
 *  above that line and run on past it); null if they don't all fit */
function layoutAt(g: CanvasRenderingContext2D, notes: Note[], mm: number, fill = 1): Placed[] | null {
  const F = mm * PX
  const lh = F * TYPE.line
  const pad = TYPE.pad * F
  const gap = TYPE.gap * F
  g.font = typeFont(F)
  const out: Placed[] = []
  let n = 0
  for (const [ri, space] of room().entries()) {
    let y = space.y
    while (n < notes.length) {
      const note = notes[n]
      const lines = wrap(g, typed(note), space.w - 2 * pad)
      const h = lines.length * lh + 2 * pad - (lh - F) // (no line gap under the last)
      if (y + h > space.y + space.h || y > space.y + space.h * fill) break
      const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 2 * pad
      const r = rng(hash(note.id))
      out.push({ note, x: space.x + (r() * (space.w - w)) / 3, y, w, h, lines, size: F, tilt: (r() - 0.5) * 0.012, room: ri })
      y += h + gap
      n++
    }
    if (n === notes.length) return out
  }
  return n === notes.length ? out : null
}
/** the biggest type that lets them reach round the whole board (along the top, down the right, along the bottom,
 *  as hers), every column filled about as far as the others: a few notes don't all crowd the top (the biggest type
 *  that fits at all might only fit them there); what doesn't fit even at the smallest is left off, and said */
function layout(g: CanvasRenderingContext2D, notes: Note[]): Placed[] {
  const want = Math.min(room().length, notes.length) - 1 // columns to reach (one may be skipped)
  let biggest: Placed[] | null = null
  for (let mm = TYPE.max; mm >= TYPE.min; mm -= TYPE.step) {
    const all = layoutAt(g, notes, mm)
    if (!all) continue
    biggest ??= all
    for (let fill = 0.05; fill < 1.01; fill += 0.03) {
      const out = layoutAt(g, notes, mm, fill)
      if (out) {
        if (new Set(out.map((p) => p.room)).size >= want) return out
        break // (the least fill at this size, and it doesn't reach: smaller type)
      }
    }
  }
  if (biggest) return biggest
  // (too many: as many as fit at the smallest)
  for (let k = notes.length - 1; k > 0; k--) {
    const out = layoutAt(g, notes.slice(0, k), TYPE.min)
    if (out) {
      console.info(`poster: ${notes.length - k} notes didn't fit`)
      return out
    }
  }
  return []
}
/** the slips, and their notes typed: `shown` letters of each (for typing them in); `fresh`: names to highlight */
function drawNotes(g: CanvasRenderingContext2D, placed: Placed[], shown: (i: number) => number, fresh: Set<string>) {
  g.textBaseline = 'top'
  g.textAlign = 'left'
  placed.forEach((p, i) => {
    const left0 = shown(i)
    if (left0 <= 0) return
    const pad = TYPE.pad * p.size
    const lh = p.size * TYPE.line
    g.save()
    g.translate(p.x, p.y)
    g.rotate(p.tilt)
    // the slip: printer paper, glued flat (a hair of shadow along its lower right edge)
    g.fillStyle = 'rgba(80,60,40,0.10)'
    g.fillRect(1.5, 2, p.w, p.h)
    g.fillStyle = P.colors.slip
    g.fillRect(0, 0, p.w, p.h)
    g.font = typeFont(p.size)
    // her friend's name, highlighted while it's new (under the type, as a highlighter goes)
    const last = p.lines[p.lines.length - 1]
    const sig = last.lastIndexOf('—')
    if (fresh.has(p.note.id) && sig >= 0 && left0 === Infinity) {
      const x = pad + g.measureText(last.slice(0, sig)).width
      g.fillStyle = 'rgba(255,230,60,0.6)'
      g.fillRect(x - p.size * 0.15, pad + (p.lines.length - 1) * lh - p.size * 0.12, g.measureText(last.slice(sig)).width + p.size * 0.3, p.size * 1.2)
    }
    g.fillStyle = P.colors.type
    let left = left0
    p.lines.forEach((line, k) => {
      if (left <= 0) return
      g.fillText(line.slice(0, left), pad, pad + k * lh)
      left -= line.length + 1
    })
    g.restore()
  })
}
const length = (p: Placed) => p.lines.reduce((a, l) => a + l.length + 1, 0)

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
  // the board and her letters (once every hand's font is in, for today's sticky)
  const [board, setBoard] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    let live = true
    Promise.all(FONTS.map((f) => document.fonts.load(f)))
      .catch(() => {})
      .then(() => live && setBoard(drawBoard()))
    return () => void (live = false)
  }, [])
  const placed = useMemo(() => (board ? layout(tex.g, notes) : []), [board, notes, tex])
  // what came since her first look, a few days: its name highlighted
  const fresh = useMemo(() => {
    const m = firstSeen(notes)
    const first = Math.min(...Object.values(m))
    return new Set(notes.filter((n) => m[n.id] > first + 3_600_000 && Date.now() - m[n.id] < NEW_FOR).map((n) => n.id))
  }, [notes])
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
  }, [placed, fresh]) // eslint-disable-line react-hooks/exhaustive-deps
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
    drawNotes(tex.g, placed, (i) => (shown.has(i) ? shown.get(i)! : Infinity), fresh)
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
    const hit = placed.find((p) => x >= p.x - 4 && x <= p.x + p.w + 4 && y >= p.y - 4 && y <= p.y + p.h + 4)
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

/** the notes up close, over the page: the slip off the poster, typed big enough to read, taped up; ← → (or a click on
 *  either side of it) through them, Esc or a click off it to put them away (on the page, outside the canvas) */
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
  return (
    <div className="poster-card" onClick={() => cards.close()}>
      <div
        key={n.id}
        style={{ transform: `rotate(${((hash(n.id) % 5) - 2) * 0.5}deg)` }}
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
