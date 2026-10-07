import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import './poster.css'
import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { POSTER } from './spec'
import { LETTERS } from './letters'
import type { Note } from './messages'
import { HANDS, drawSlip, fontOf, hash, lengthOf, penOf, rng, slipOf, wrap, type Slip } from './slips'

/**
 * The "Rina" poster (./spec), painted into its own texture, as hers is made: white poster board, her name across it
 * (./letters: her own letters off the photo, drawn clean) in black marker coloured in with her colours, and all
 * round it her friends' notes (./messages), typed, signed, a slip each, stuck on in columns wherever the letters
 * leave room.
 *
 *   the notes      each friend's slip is theirs (./slips): their paper, their tape or pin or sticker in her colours,
 *                  their doodle, their name signed in their hand and pen; the type as big as lets every note on (to
 *                  50 and more); each slip as wide as its words, a little crooked
 *   pointing       a slip under the pointer lifts off the board toward you
 *   new notes      type themselves in the first time she sees them (this browser keeps which she has); what came
 *                  since her first look has its name highlighted, a few days
 *   today's note   one friend's note a day comes off the poster onto a sticky note over its corner, in a hand, big
 *                  enough to read from her chair: a different friend every day, round them all; a new one goes first
 *   reading        click a slip (or the sticky): the notes come up as their slips, big, that one first; ← → (or a click on
 *                  either side) to go through them, Esc to put them away
 *
 * The sheet curls a little off the wall at its corners. Frame: ./spec (its middle, its face toward +z).
 */
const P = POSTER
const W = 2400 // the texture's pixels across
const H = Math.round((W * P.h) / P.w)
const PX = W / P.w // a mm, in pixels
// mm: type sizes tried (biggest first, down to her poster's); between slips (shares of the type: their tape sticks up)
const TYPE = { max: 9, min: 2.6, step: 0.2, gap: 1.1 }
const SPEED = 60 // letters a second, typing in
const WRITE_IN = 3 // new notes typed in at most (the rest of a big lot are just there)
const NEW_FOR = 4 * 86_400_000 // how long a new note's name stays highlighted

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

type Placed = Slip & { x: number; y: number; tilt: number; room: number }
/** the notes on slips in the room, in order, at `mm` type, each column filled only to `fill` of it (a slip may start
 *  above that line and run on past it); null if they don't all fit */
function layoutAt(g: CanvasRenderingContext2D, notes: Note[], mm: number, fill = 1): Placed[] | null {
  const F = mm * PX
  const gap = TYPE.gap * F
  const out: Placed[] = []
  let n = 0
  for (const [ri, space] of room().entries()) {
    let y = space.y + gap / 2
    while (n < notes.length) {
      const note = notes[n]
      const slip = slipOf(g, note, F, space.w)
      if (y + slip.h > space.y + space.h || y > space.y + space.h * fill) break
      const r = rng(hash(note.id))
      out.push({ ...slip, x: space.x + (r() * (space.w - slip.w)) / 2, y, tilt: (r() - 0.5) * 0.04, room: ri })
      y += slip.h + gap
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
/** the slips: `shown` letters of each typed (for typing them in); `fresh`: names to highlight */
function drawNotes(g: CanvasRenderingContext2D, placed: Placed[], shown: (i: number) => number, fresh: Set<string>) {
  placed.forEach((p, i) => {
    const n = shown(i)
    if (n <= 0) return
    g.save()
    g.translate(p.x, p.y)
    g.rotate(p.tilt)
    drawSlip(g, p, n, fresh.has(p.note.id))
    g.restore()
  })
}
/** the slip under (x, y) on the board (texture pixels) */
const slipAt = (placed: Placed[], x: number, y: number) =>
  placed.findIndex((p) => {
    // (into the slip's own frame: it's a little crooked)
    const dx = x - p.x
    const dy = y - p.y
    const u = dx * Math.cos(p.tilt) + dy * Math.sin(p.tilt)
    const v = -dx * Math.sin(p.tilt) + dy * Math.cos(p.tilt)
    return u >= -4 && u <= p.w + 4 && v >= -4 && v <= p.h + 4
  })

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

/** a lifted slip's picture: its pixels to the board's; room round it for its tape (shares of the type) */
const LIFT = { scale: 2, margin: 2.2 }

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
      const n = Math.min(lengthOf(placed[i]), Math.max(0, budget))
      shown.set(i, n)
      budget -= lengthOf(placed[i])
    }
    drawNotes(tex.g, placed, (i) => (shown.has(i) ? shown.get(i)! : Infinity), fresh)
    tex.t.needsUpdate = true
  }
  const last = useRef(0)
  useFrame((_, dt) => {
    const w = write.current
    if (w.done) return
    w.t += Math.min(dt, 0.1)
    const all = w.fresh.reduce((a, i) => a + lengthOf(placed[i]), 0)
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

  // pointing at a slip: it lifts off the board toward you (a copy of it, over it, on its own: it comes up off its
  // place, a little bigger, its shadow under it)
  const [hover, setHover] = useState(-1)
  const lift = useMemo(() => {
    const c = document.createElement('canvas')
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return { c, t, mat: new MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.9 }), k: 0 }
  }, [])
  const liftRef = useRef<Mesh>(null)
  useEffect(() => {
    const p = placed[hover]
    const m = liftRef.current
    if (!p || !m) return
    const M = p.F * LIFT.margin
    lift.c.width = Math.ceil((p.w + 2 * M) * LIFT.scale)
    lift.c.height = Math.ceil((p.h + 2 * M) * LIFT.scale)
    const g = lift.c.getContext('2d')!
    g.setTransform(LIFT.scale, 0, 0, LIFT.scale, M * LIFT.scale, M * LIFT.scale)
    drawSlip(g, p, Infinity, fresh.has(p.note.id))
    lift.t.dispose() // (a new size)
    lift.t.needsUpdate = true
    // where it lies on the board: its middle (it's turned about its top left), mm from the board's middle
    const cx = p.x + Math.cos(p.tilt) * (p.w / 2) - Math.sin(p.tilt) * (p.h / 2)
    const cy = p.y + Math.sin(p.tilt) * (p.w / 2) + Math.cos(p.tilt) * (p.h / 2)
    m.position.set(cx / PX - P.w / 2, P.h / 2 - cy / PX, surface(cx / PX - P.w / 2, P.h / 2 - cy / PX))
    m.rotation.z = -p.tilt
    m.userData.size = [(p.w + 2 * M) / PX, (p.h + 2 * M) / PX]
  }, [hover, placed, fresh, lift])
  useFrame((_, dt) => {
    const m = liftRef.current
    if (!m) return
    const to = hover >= 0 ? 1 : 0
    if (lift.k === to && !m.userData.moved) return
    m.userData.moved = false
    lift.k = Math.abs(to - lift.k) < 0.01 ? to : lift.k + (to - lift.k) * (1 - Math.exp(-Math.min(dt, 0.05) * 14))
    const [sw, sh] = m.userData.size ?? [1, 1]
    const s = 1 + lift.k * 0.06
    m.scale.set(sw * s, sh * s, 1)
    m.position.z = surface(m.position.x, m.position.y) + 0.4 + lift.k * 9
    m.visible = lift.k > 0.001
  })
  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => slipAt(placed, (e.uv?.x ?? 0) * W, (1 - (e.uv?.y ?? 0)) * H)
  const point = (e: ThreeEvent<PointerEvent>) => {
    const i = at(e)
    if (i !== hover) {
      setHover(i)
      if (liftRef.current) liftRef.current.userData.moved = true
    }
    document.body.style.cursor = i >= 0 ? 'pointer' : ''
  }
  const away = () => {
    setHover(-1)
    document.body.style.cursor = ''
  }
  // a click: the notes as their slips, big (the one clicked first, or today's)
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!notes.length) return
    e.stopPropagation()
    const i = at(e)
    cards.open(notes, i >= 0 ? notes.indexOf(placed[i].note) : Math.max(0, today))
  }
  const openToday = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    cards.open(notes, today)
  }
  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow onClick={click} onPointerMove={point} onPointerOut={away} />
      <mesh ref={liftRef} material={lift.mat} visible={false} castShadow onClick={click}>
        <planeGeometry />
      </mesh>
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

/** the notes up close, over the page: each its own slip, big (drawn as on the poster: its paper, its tape, its
 *  doodle, its signature), a little crooked; ← → (or a click on either side of it) through them, Esc or a click off
 *  it to put them away (on the page, outside the canvas) */
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
  const n = st?.notes[st.i]
  const pic = useMemo(() => {
    if (!n) return null
    // (type 22 CSS px, the slip at most 560 across, at the screen's pixels)
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const F = 22 * dpr
    const c = document.createElement('canvas')
    const g = c.getContext('2d')!
    const slip = slipOf(g, n, F, Math.min(560, window.innerWidth - 48) * dpr)
    const M = F * 2.2
    c.width = Math.ceil(slip.w + 2 * M)
    c.height = Math.ceil(slip.h + 2 * M)
    g.translate(M, M)
    drawSlip(g, slip)
    return { src: c.toDataURL(), w: c.width / dpr }
  }, [n])
  if (!st || !n || !pic) return null
  return (
    <div className="poster-card" onClick={() => cards.close()}>
      <div key={n.id}>
        <img
          src={pic.src}
          width={pic.w}
          alt={`${n.text}${n.name ? ` —${n.name}` : ''}`}
          style={{ transform: `rotate(${((hash(n.id) % 5) - 2) * 0.6}deg)` }}
          onClick={(e) => {
            e.stopPropagation()
            const r = e.currentTarget.getBoundingClientRect()
            cards.step(e.clientX < r.left + r.width / 2 ? -1 : 1)
          }}
        />
        {st.notes.length > 1 && (
          <p className="poster-card-count">
            {st.i + 1} of {st.notes.length}
          </p>
        )}
      </div>
    </div>
  )
}
