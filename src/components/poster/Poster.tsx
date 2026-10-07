import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, LatheGeometry, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SphereGeometry, SRGBColorSpace, Vector2, Vector3, type PerspectiveCamera } from 'three'
import { worldInput } from '../../lib/inputLock'
import { POSTER } from './spec'
import { LETTERS } from './letters'
import type { Note } from './messages'
import { Motes } from './Motes'

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
 *   paper          each slip is its own bit of paper over the board (./spec slips): glued at its top, its bottom edge
 *                  standing a hair off; now and then a draft along the board stirs them, one after another; the one
 *                  pointed at lifts toward you. Small and slow: alive as the Quad's petals are, nothing laid over it
 *   pinned         each slip held up by a pin of its own through its top (./spec pins): a push pin, a map pin or a
 *                  thumb tack, in one of her letters' colours
 *   glow           the board a touch brighter than the wall, a faint light on the wall round it (./spec glow)
 *   the air        a few dust motes drifting in front of it, now and then catching the light (./Motes)
 *   reading        click a slip (or the sticky): the camera glides in square to it, as to a photo on the Quad; ← →
 *                  the next one along; Esc (or a click off it) glides back
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
const PIN_TOP = P.pins.top * PX // (each slip's top, clear for its pin)
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
/** a note as typed: its words, then its name (unless they signed it themselves, at its end) */
const bare = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '')
/** whether it wants their name put under it */
const signs = (n: Note) => !!n.name && !bare(n.text).endsWith(bare(n.name))
const typed = (n: Note) => (n.name && !bare(n.text).endsWith(bare(n.name)) ? `${n.text} —${n.name.replace(/ /g, ' ')}` : n.text)
/** the notes on slips round the board at `mm` type: each in turn to whichever column it fits in that's left the
 *  emptiest (so a few long notes or many short ones spread evenly, along the top, down the sides, along the bottom);
 *  null if they don't all fit */
function layoutAt(g: CanvasRenderingContext2D, notes: Note[], mm: number): Placed[] | null {
  const F = mm * PX
  const lh = F * TYPE.line
  const pad = TYPE.pad * F
  const gap = TYPE.gap * F
  g.font = typeFont(F)
  const rooms = room()
  const used = rooms.map(() => 0)
  const out: Placed[] = []
  // (a note's lines at a width: the columns come in a few widths, so each note's wrapped a few times, not each time)
  const wrapped = new Map<string, string[]>()
  for (const note of notes) {
    let best = -1
    let bestFill = Infinity
    let bestLines: string[] = []
    let bestH = 0
    rooms.forEach((space, ri) => {
      const key = `${note.id}|${Math.round(space.w)}`
      let lines = wrapped.get(key)
      if (!lines) wrapped.set(key, (lines = wrap(g, typed(note), space.w - 2 * pad)))
      const h = lines.length * lh + 2 * pad - (lh - F) + PIN_TOP // (no line gap under the last; room for its pin)
      if (used[ri] + h > space.h) return
      const fill = (used[ri] + h) / space.h
      if (fill < bestFill - 1e-6) (best = ri), (bestFill = fill), (bestLines = lines), (bestH = h)
    })
    if (best < 0) return null
    const space = rooms[best]
    const w = Math.max(...bestLines.map((l) => g.measureText(l).width)) + 2 * pad
    const r = rng(hash(note.id))
    out.push({ note, x: space.x + (r() * (space.w - w)) / 3, y: space.y + used[best], w, h: bestH, lines: bestLines, size: F, tilt: (r() - 0.5) * 0.012, room: best })
    used[best] += bestH + gap
  }
  return out
}
/** the biggest type they all fit at (to TYPE.max); what doesn't fit even at the smallest is left off, and said */
function layout(g: CanvasRenderingContext2D, notes: Note[]): Placed[] {
  for (let mm = TYPE.max; mm >= TYPE.min; mm -= TYPE.step) {
    const out = layoutAt(g, notes, mm)
    if (out) return out
  }
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
/** where the slips are glued down: a hair of shadow under each, on the board (the slips are over it, ./slips) */
function drawShadows(g: CanvasRenderingContext2D, placed: Placed[]) {
  g.fillStyle = 'rgba(80,60,40,0.12)'
  for (const p of placed) {
    g.save()
    g.translate(p.x, p.y)
    g.rotate(p.tilt)
    g.fillRect(1.5, 2.5, p.w, p.h)
    g.restore()
  }
}
/** the slips' own sheet: each slip packed onto it, finer than the board (looked at up close, sharp): a row at a time,
 *  `k` sheet pixels to the board's */
const SHEET = { w: 4096, max: 4096, pad: 6 }
type Atlas = { k: number; h: number; at: { x: number; y: number }[] }
function atlasOf(placed: Placed[]): Atlas {
  const pack = (k: number) => {
    const at: { x: number; y: number }[] = []
    let x = SHEET.pad
    let y = SHEET.pad
    let row = 0
    for (const p of placed) {
      const w = Math.ceil(p.w * k)
      const h = Math.ceil(p.h * k)
      if (x + w + SHEET.pad > SHEET.w) (x = SHEET.pad), (y += row + SHEET.pad), (row = 0)
      at.push({ x, y })
      x += w + SHEET.pad
      row = Math.max(row, h)
    }
    return { k, h: y + row + SHEET.pad, at }
  }
  // (as fine as fits: up to 3 times the board's)
  for (let k = 3; k > 1; k -= 0.25) {
    const a = pack(k)
    if (a.h <= SHEET.max) return a
  }
  return pack(1)
}
/** the slips, and their notes typed, each on its place on the slips' sheet: `shown` letters of each (for typing them
 *  in); `fresh`: names to highlight */
function drawNotes(g: CanvasRenderingContext2D, placed: Placed[], atlas: Atlas, shown: (i: number) => number, fresh: Set<string>) {
  g.textBaseline = 'top'
  g.textAlign = 'left'
  placed.forEach((p, i) => {
    const left0 = shown(i)
    if (left0 <= 0) return
    const pad = TYPE.pad * p.size
    const lh = p.size * TYPE.line
    g.save()
    g.setTransform(atlas.k, 0, 0, atlas.k, atlas.at[i].x, atlas.at[i].y)
    // the slip: printer paper
    g.fillStyle = P.colors.slip
    g.fillRect(0, 0, p.w, p.h)
    g.font = typeFont(p.size)
    // her friend's name, highlighted while it's new (under the type, as a highlighter goes)
    const last = p.lines[p.lines.length - 1]
    const sig = last.lastIndexOf('—')
    if (fresh.has(p.note.id) && sig >= 0 && left0 === Infinity) {
      const x = pad + g.measureText(last.slice(0, sig)).width
      g.fillStyle = 'rgba(255,230,60,0.6)'
      g.fillRect(x - p.size * 0.15, PIN_TOP + pad + (p.lines.length - 1) * lh - p.size * 0.12, g.measureText(last.slice(sig)).width + p.size * 0.3, p.size * 1.2)
    }
    g.fillStyle = P.colors.type
    let left = left0
    p.lines.forEach((line, k) => {
      if (left <= 0) return
      g.fillText(line.slice(0, left), pad, PIN_TOP + pad + k * lh)
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
  for (let size = 13 * SP; size >= 7 * SP; size -= 0.5 * SP) {
    g.font = fontOf(note, size)
    const lines = wrap(g, note.text, S - 2 * pad)
    const lh = size * 1.12
    const h = lines.length * lh + (signs(note) ? lh : 0)
    if (h > S - 2 * pad - head) continue
    g.fillStyle = penOf(note)
    let y = pad + head + (S - 2 * pad - head - h) / 2
    for (const l of lines) g.fillText(l, pad, y), (y += lh)
    if (signs(note)) {
      g.font = fontOf(note, size * 0.9)
      g.textAlign = 'right'
      g.fillText(`—${note.name}`, S - pad, y)
      g.textAlign = 'left'
    }
    return
  }
  // (too long for the sticky at a size she can read from her chair: its opening, to "…"; clicked, the whole note)
  const size = 7 * SP
  g.font = fontOf(note, size)
  const lh = size * 1.12
  const fit = Math.floor((S - 2 * pad - head - lh) / lh)
  const words = note.text.split(' ')
  let lines: string[] = []
  for (let k = words.length - 1; k > 0; k--) {
    lines = wrap(g, words.slice(0, k).join(' ') + '…', S - 2 * pad)
    if (lines.length <= fit) break
  }
  g.fillStyle = penOf(note)
  let y = pad + head
  for (const l of lines) g.fillText(l, pad, y), (y += lh)
  if (signs(note)) {
    g.font = fontOf(note, size * 0.9)
    g.textAlign = 'right'
    g.fillText(`—${note.name}`, S - pad, S - pad - lh)
    g.textAlign = 'left'
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

// ---- the slips as paper: one mesh, a little grid per slip, bent as paper bends (./spec slips)
const SL = P.slips
const MAX_SLIPS = 160
const GRID = [3, 6] // a slip's quads across, down
/** the slips' paper over the board: each slip's grid laid where it's drawn (texture pixels to the poster's mm),
 *  showing its part of the slips' texture; per vertex how far down its slip (0 at its glued top), which slip, how
 *  tall (for its bend's slope) */
function slipsGeometry(placed: Placed[], atlas: Atlas) {
  const [nx, ny] = GRID
  const per = (nx + 1) * (ny + 1)
  const n = Math.min(placed.length, MAX_SLIPS)
  const pos = new Float32Array(n * per * 3)
  const uv = new Float32Array(n * per * 2)
  const down = new Float32Array(n * per)
  const which = new Float32Array(n * per)
  const tall = new Float32Array(n * per)
  const index: number[] = []
  for (let i = 0; i < n; i++) {
    const p = placed[i]
    const c = Math.cos(p.tilt)
    const sn = Math.sin(p.tilt)
    for (let b = 0; b <= ny; b++)
      for (let a = 0; a <= nx; a++) {
        const k = i * per + b * (nx + 1) + a
        const px = p.x + (a / nx) * p.w * c - (b / ny) * p.h * sn
        const py = p.y + (a / nx) * p.w * sn + (b / ny) * p.h * c
        const x = px / PX - P.w / 2
        const y = P.h / 2 - py / PX
        pos.set([x, y, surface(x, y) + 0.12], k * 3)
        uv.set([(atlas.at[i].x + (a / nx) * p.w * atlas.k) / SHEET.w, 1 - (atlas.at[i].y + (b / ny) * p.h * atlas.k) / atlas.h], k * 2)
        down[k] = b / ny
        which[k] = i
        tall[k] = p.h / PX
      }
    for (let b = 0; b < ny; b++)
      for (let a = 0; a < nx; a++) {
        const k = i * per + b * (nx + 1) + a
        index.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2)
      }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(n * per * 3).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setAttribute('aDown', new BufferAttribute(down, 1))
  g.setAttribute('aSlip', new BufferAttribute(which, 1))
  g.setAttribute('aTall', new BufferAttribute(tall, 1))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}
/** the slips' paper material: the slips' texture, bent in the vertex shader. Its free bottom edge stands `edge` off
 *  the board, curving up from the glued top (as v²): resting curl, its own little sway, the draft passing, and
 *  lifted when pointed at (all of it raised a little then too) */
function slipsMaterial(map: CanvasTexture) {
  const u = {
    uTime: { value: 0 },
    uLift: { value: new Float32Array(MAX_SLIPS) },
    uFront: { value: 1e5 },
  }
  const m = new MeshStandardMaterial({ map, roughness: 0.95, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: P.glow.board })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aDown;
        attribute float aSlip;
        attribute float aTall;
        uniform float uTime;
        uniform float uLift[${MAX_SLIPS}];
        uniform float uFront;
        float slipEdge() {
          float k = fract(aSlip * 0.618034);
          float sway = ${SL.sway.toFixed(3)} * pow(0.5 + 0.5 * sin(uTime * (0.35 + 0.3 * k) + aSlip * 2.4), 3.0);
          float d = (position.x - uFront) / ${SL.breeze.width.toFixed(1)};
          float breeze = ${SL.breeze.lift.toFixed(3)} * exp(-d * d);
          return ${SL.curl.toFixed(3)} + sway + breeze + uLift[int(aSlip)] * ${SL.lifted.toFixed(3)};
        }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        objectNormal = normalize(vec3(0.0, 2.0 * aDown * slipEdge() / aTall, 1.0));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.z += aDown * aDown * slipEdge();`,
      )
  }
  m.customProgramCacheKey = () => 'poster-slips'
  return { m, u }
}

// ---- the pins: each slip's own, through its top
const PINS = P.pins
const pinKind = (p: Placed) => hash(p.note.id + '|pin') % 3 // 0 push pin, 1 map pin, 2 thumb tack
/** the pins, a mesh a kind (each pin its own colour, a little crooked as pushed in by hand) */
function Pins({ placed }: { placed: Placed[] }) {
  const parts = useMemo(() => {
    const lathe = (pts: [number, number][]) => new LatheGeometry(pts.map(([r, z]) => new Vector2(r, z)), 28).rotateX(Math.PI / 2)
    const M = PINS.map
    return {
      push: lathe(PINS.push),
      tack: lathe(PINS.tack),
      ball: new SphereGeometry(M.ball, 20, 14).translate(0, 0, M.out),
      shaft: new CylinderGeometry(M.shaft, M.shaft, M.out, 8).rotateX(Math.PI / 2).translate(0, 0, M.out / 2),
      plastic: new MeshStandardMaterial({ roughness: 0.45 }),
      steel: new MeshStandardMaterial({ color: PINS.steel, roughness: 0.35, metalness: 0.5 }),
    }
  }, [])
  const refs = { push: useRef<InstancedMesh>(null), tack: useRef<InstancedMesh>(null), ball: useRef<InstancedMesh>(null), shaft: useRef<InstancedMesh>(null) }
  const counts = useMemo(() => [0, 1, 2].map((k) => placed.filter((p) => pinKind(p) === k).length), [placed])
  useEffect(() => {
    const o = new Object3D()
    const c = new Color()
    const n = { push: 0, tack: 0, ball: 0, shaft: 0 }
    const put = (key: keyof typeof n, color?: string) => {
      const m = refs[key].current
      if (!m) return
      m.setMatrixAt(n[key], o.matrix)
      if (color) m.setColorAt(n[key], c.set(color))
      n[key]++
    }
    for (const p of placed) {
      const r = rng(hash(p.note.id + '|pinned'))
      // its middle: across the slip's top, a little off the middle, PINS.at down (the slip's own frame, turned)
      const u = p.w * (0.5 + (r() - 0.5) * 0.12)
      const v = PINS.at * PX
      const px = p.x + u * Math.cos(p.tilt) - v * Math.sin(p.tilt)
      const py = p.y + u * Math.sin(p.tilt) + v * Math.cos(p.tilt)
      const x = px / PX - P.w / 2
      const y = P.h / 2 - py / PX
      o.position.set(x, y, surface(x, y) + 0.14)
      const kind = pinKind(p)
      // (pushed in by hand: a touch off square; a map pin more so)
      const lean = kind === 1 ? 0.18 : 0.05
      o.rotation.set((r() - 0.5) * lean, (r() - 0.5) * lean, r() * Math.PI * 2)
      o.updateMatrix()
      const color = PINS.colors[Math.floor(r() * PINS.colors.length)]
      if (kind === 0) put('push', color)
      else if (kind === 2) put('tack', color)
      else put('ball', color), put('shaft')
    }
    for (const m of Object.values(refs)) {
      if (!m.current) continue
      m.current.instanceMatrix.needsUpdate = true
      if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true
      m.current.computeBoundingSphere()
    }
  }, [placed]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {counts[0] > 0 && <instancedMesh key={`push${counts[0]}`} ref={refs.push} args={[parts.push, parts.plastic, counts[0]]} castShadow />}
      {counts[2] > 0 && <instancedMesh key={`tack${counts[2]}`} ref={refs.tack} args={[parts.tack, parts.plastic, counts[2]]} castShadow />}
      {counts[1] > 0 && <instancedMesh key={`ball${counts[1]}`} ref={refs.ball} args={[parts.ball, parts.plastic, counts[1]]} castShadow />}
      {counts[1] > 0 && <instancedMesh key={`shaft${counts[1]}`} ref={refs.shaft} args={[parts.shaft, parts.steel, counts[1]]} castShadow />}
    </group>
  )
}

// ---- the glow: a soft light on the wall round the board (the board itself a little brighter: its emissive)
const GLOW = P.glow
function glowTexture() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const ix = (S * GLOW.reach) / (P.w + 2 * GLOW.reach)
  const iy = (S * GLOW.reach) / (P.h + 2 * GLOW.reach)
  g.shadowColor = '#fff'
  g.shadowBlur = Math.min(ix, iy) * 0.8
  g.fillStyle = '#fff'
  for (let k = 0; k < 2; k++) g.fillRect(ix, iy, S - 2 * ix, S - 2 * iy)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// ---- looking at a note up close: which (its slip's index; -1 today's sticky), or none
const focus = (() => {
  let i: number | null = null
  let count = 0
  const subs = new Set<() => void>()
  const set = (v: number | null) => {
    i = v
    subs.forEach((f) => f())
  }
  return {
    get: () => i,
    count: () => count,
    setCount: (n: number) => (count = n),
    set,
    step: (d: number) => i !== null && i >= 0 && count > 1 && set((i + d + count) % count),
    subscribe: (f: () => void) => (subs.add(f), () => void subs.delete(f)),
  }
})()
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
type Controls = { enabled: boolean; target?: Vector3; getTarget?: (out: Vector3) => Vector3; setLookAt?: (px: number, py: number, pz: number, tx: number, ty: number, tz: number, smooth: boolean) => void }
const _t = new Vector3()

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
  const mat = useMemo(() => new MeshStandardMaterial({ map: tex.t, roughness: 0.95, emissive: 0xffffff, emissiveMap: tex.t, emissiveIntensity: GLOW.board }), [tex])
  const glow = useMemo(() => new MeshBasicMaterial({ map: glowTexture(), color: GLOW.color, transparent: true, opacity: GLOW.wall, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  const paper = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = SHEET.w
    c.height = 16
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return { c, g: c.getContext('2d')!, t, ...slipsMaterial(t) }
  }, [])
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
  const atlas = useMemo(() => atlasOf(placed), [placed])
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
    drawShadows(tex.g, placed)
    tex.t.needsUpdate = true
    if (paper.c.height !== atlas.h) {
      // (a new size: a new texture on the GPU)
      paper.c.height = atlas.h
      paper.t.dispose()
    }
    paper.g.setTransform(1, 0, 0, 1, 0, 0)
    paper.g.fillStyle = P.colors.slip
    paper.g.fillRect(0, 0, SHEET.w, atlas.h)
    const w = write.current
    let budget = t * SPEED
    const shown = new Map<number, number>()
    for (const i of w.fresh) {
      const n = Math.min(length(placed[i]), Math.max(0, budget))
      shown.set(i, n)
      budget -= length(placed[i])
    }
    drawNotes(paper.g, placed, atlas, (i) => (shown.has(i) ? shown.get(i)! : Infinity), fresh)
    paper.t.needsUpdate = true
  }
  // the slips' paper: where they are; the draft along the board now and then; the one pointed at lifting
  const slipsGeo = useMemo(() => slipsGeometry(placed, atlas), [placed, atlas])
  useEffect(() => () => slipsGeo.dispose(), [slipsGeo])
  const [hover, setHover] = useState(-1)
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const u = paper.u
    u.uTime.value = t
    // (the draft: from the left, across the board and off it, then quiet till the next)
    const k = (t % SL.breeze.every) / SL.breeze.cross
    u.uFront.value = k < 1 ? -P.w / 2 - 2 * SL.breeze.width + k * (P.w + 4 * SL.breeze.width) : 1e5
    const a = 1 - Math.exp(-Math.min(dt, 0.05) * SL.ease)
    const lift = u.uLift.value
    for (let i = 0; i < Math.min(placed.length, MAX_SLIPS); i++) lift[i] += ((i === hover ? 1 : 0) - lift[i]) * a
  })
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
    return { c, g: c.getContext('2d')!, t, geo: g, mat: new MeshStandardMaterial({ map: t, roughness: 0.9, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: GLOW.board }) }
  }, [])
  useEffect(() => {
    if (!board || today < 0) return
    drawSticky(sticky.g, notes[today])
    sticky.t.needsUpdate = true
  }, [board, today, notes, sticky])

  // looking at a note: the camera glides in square to it (from wherever it was), and back to there after
  const groupRef = useRef<Group>(null)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const looking = useSyncExternalStore(focus.subscribe, focus.get)
  useEffect(() => void focus.setCount(placed.length), [placed])
  const glide = useRef<{ from: { p: Vector3; t: Vector3 }; to: { p: Vector3; t: Vector3 }; k: number; back: boolean } | null>(null)
  const saved = useRef<{ p: Vector3; t: Vector3 } | null>(null)
  useEffect(() => {
    const g = groupRef.current
    if (!controls || !g) return
    const now = { p: camera.position.clone(), t: controls.target ? controls.target.clone() : controls.getTarget!(new Vector3()) }
    if (looking === null) {
      if (saved.current) glide.current = { from: now, to: saved.current, k: 0, back: true }
      saved.current = null
      return
    }
    // the note: its middle and size on the poster (mm), the sticky's or a slip's
    let r: { x: number; y: number; w: number; h: number } | null = null
    if (looking < 0) r = { x: STICKY_AT.x, y: STICKY_AT.y, w: STICKY.size, h: STICKY.size }
    else {
      const p = placed[looking]
      if (p) {
        const cx = p.x + Math.cos(p.tilt) * (p.w / 2) - Math.sin(p.tilt) * (p.h / 2)
        const cy = p.y + Math.sin(p.tilt) * (p.w / 2) + Math.cos(p.tilt) * (p.h / 2)
        r = { x: cx / PX - P.w / 2, y: P.h / 2 - cy / PX, w: p.w / PX, h: p.h / PX }
      }
    }
    if (!r) return
    if (!saved.current) {
      saved.current = now
      controls.enabled = false
      worldInput.locked = true
    }
    g.updateWorldMatrix(true, false)
    const c = new Vector3(r.x, r.y, surface(r.x, r.y)).applyMatrix4(g.matrixWorld)
    const n = new Vector3(0, 0, 1).transformDirection(g.matrixWorld)
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    // (it and a little round it filling the view; never nearer than a hand's length)
    const w = Math.max(r.w * P.focus.room, 170)
    const h = Math.max(r.h * P.focus.room, 110)
    const d = Math.max(h / 2 / tan, w / 2 / (tan * camera.aspect))
    glide.current = { from: now, to: { p: c.clone().addScaledVector(n, d), t: c }, k: 0, back: false }
  }, [looking]) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const w = glide.current
    if (!w || !controls) return
    w.k = Math.min(1, w.k + Math.min(dt, 1 / 30) / P.focus.glide)
    const k = easeInOut(w.k)
    camera.position.lerpVectors(w.from.p, w.to.p, k)
    const t = _t.lerpVectors(w.from.t, w.to.t, k)
    if (controls.target) {
      controls.target.copy(t)
      camera.lookAt(t)
    } else {
      const p = camera.position
      controls.setLookAt?.(p.x, p.y, p.z, t.x, t.y, t.z, false)
    }
    if (w.k >= 1) {
      glide.current = null
      if (w.back) {
        controls.enabled = true
        worldInput.locked = false
      }
    }
  })
  // its keys while looking: ← → the next one along, Esc back
  useEffect(() => {
    if (looking === null) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') focus.set(null)
      else if (e.key === 'ArrowRight') focus.step(1)
      else if (e.key === 'ArrowLeft') focus.step(-1)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [looking])
  useEffect(() => () => focus.set(null), [])

  /** the slip at a pointer on the poster (on the board or a slip: both in the texture's pixels; it's a little crooked) */
  const _p = useMemo(() => new Vector3(), [])
  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const g = groupRef.current
    if (!g) return -1
    const q = g.worldToLocal(_p.copy(e.point))
    const x = (q.x + P.w / 2) * PX
    const y = (P.h / 2 - q.y) * PX
    return placed.findIndex((p) => {
      const dx = x - p.x
      const dy = y - p.y
      const u = dx * Math.cos(p.tilt) + dy * Math.sin(p.tilt)
      const v = -dx * Math.sin(p.tilt) + dy * Math.cos(p.tilt)
      return u >= -4 && u <= p.w + 4 && v >= -4 && v <= p.h + 4
    })
  }
  const point = (e: ThreeEvent<PointerEvent>) => {
    const i = at(e)
    if (i !== hover) setHover(i)
    document.body.style.cursor = i >= 0 ? 'pointer' : ''
  }
  const away = () => {
    setHover(-1)
    document.body.style.cursor = ''
  }
  // a click: in to that note (or, looking, off the notes: back)
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!notes.length) return
    e.stopPropagation()
    const i = at(e)
    if (i >= 0) focus.set(i)
    else if (looking !== null) focus.set(null)
  }
  const openToday = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    focus.set(-1)
  }
  return (
    <group ref={groupRef} onPointerMissed={() => looking !== null && focus.set(null)}>
      {/* the soft light on the wall round it */}
      <mesh material={glow} position={[0, 0, -0.5]} scale={[P.w + 2 * GLOW.reach, P.h + 2 * GLOW.reach, 1]} renderOrder={-1}>
        <planeGeometry />
      </mesh>
      <group onClick={click} onPointerMove={point} onPointerOut={away}>
        <mesh geometry={geo} material={mat} receiveShadow />
        {placed.length > 0 && <mesh geometry={slipsGeo} material={paper.m} receiveShadow />}
      </group>
      <Pins placed={placed} />
      <Motes />
      {today >= 0 && (
        <mesh geometry={sticky.geo} material={sticky.mat} position={[STICKY_AT.x, STICKY_AT.y, 0]} rotation={[0, 0, STICKY_AT.rot]} castShadow receiveShadow onClick={openToday} />
      )}
    </group>
  )
}

