import type { Note } from './messages'

/**
 * A friend's note as a slip of paper of its own, the way people bring notes to stick on a poster: typed, signed by
 * hand, on whatever paper they had, stuck on however they stuck it, with a little doodle. Each friend's is theirs
 * every time (it all comes from their name): their paper, their tape or pin, their doodle, their pen and their
 * handwriting for the signature; the colours of the tape, pins and stickers are hers (her letters' colours).
 *
 *   papers     printer paper, a strip of lined notebook paper (its margin, its blue lines under the type), an index
 *              card (a red line under the first), graph paper, a sticky note in one of her colours, kraft paper;
 *              now and then torn off along its bottom instead of cut
 *   stuck on   washi tape across the top (striped or dotted), tape at both top corners, a push pin, a paper clip,
 *              a heart sticker
 *   doodles    a heart, a star, a flower, a smiley, a sparkle, a sun: in their pen, by their signature
 *
 * All in pixels: `F` the type's size. A slip's drawn with its top left at the origin (its tape may stick out above).
 */
export const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
/** a little random that's the same every time for the same seed */
export const rng = (seed: number) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909)) >>> 0) / 4294967296

// shares of the type's size: its lines; a slip's margin; between the type and the signature; the signature's size
export const TYPE = { line: 1.28, pad: 0.6, sigGap: 0.25, sig: 1.45 }
export const typeFont = (px: number) => `${px}px Arial, "Helvetica Neue", Helvetica, sans-serif`
const INK = '#1f1e24'
/** the friends' hands (k: its size against the others', so they read alike) */
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
const PENS = ['#1f3f8a', '#2b2a33', '#5b2f86', '#1d5c55', '#8a2f4a', '#25447a']
const who = (n: Note) => n.name.toLowerCase().trim() || n.id
const handOf = (n: Note) => HANDS[hash(who(n)) % HANDS.length]
export const fontOf = (n: Note, px: number) => handOf(n).font.replace('{}', String(px * handOf(n).k))
export const penOf = (n: Note) => PENS[hash(who(n) + 'pen') % PENS.length]
/** her letters' colours (./spec): the tape, the pins, the stickers */
const HERS = ['#c7a8dc', '#ee93a6', '#f6bd3c', '#ef7a4a', '#4dbcc0', '#8ccb8a']

const PAPERS = ['printer', 'lined', 'index', 'grid', 'sticky', 'kraft'] as const
const STUCK = ['tape', 'corners', 'pin', 'clip', 'heart'] as const
const DOODLES = ['heart', 'star', 'flower', 'smiley', 'sparkle', 'sun'] as const
export type Style = {
  paper: (typeof PAPERS)[number]
  torn: boolean
  stuck: (typeof STUCK)[number]
  doodle: (typeof DOODLES)[number]
  color: string // her colour, for its tape / pin / sticker (and a sticky note's paper)
  stripes: boolean // its tape: striped, or dotted
  pen: string
}
export function styleOf(n: Note): Style {
  const r = rng(hash(who(n) + '|slip'))
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)]
  const paper = pick(PAPERS)
  return {
    paper,
    torn: (paper === 'printer' || paper === 'lined' || paper === 'kraft') && r() < 0.45,
    stuck: pick(STUCK),
    doodle: pick(DOODLES),
    color: pick(HERS),
    stripes: r() < 0.5,
    pen: penOf(n),
  }
}

export type Slip = { note: Note; style: Style; F: number; w: number; h: number; lines: string[]; sig: number; top: number }
/** room at a slip's top for how it's stuck on (shares of the type), so it doesn't cover the first words */
const TOP: Record<Style['stuck'], number> = { tape: 0.55, corners: 0.75, pin: 1.1, clip: 1.0, heart: 0.5 }
/** a note's words wrapped to `width` */
export function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
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
/** a note's slip at type size `F`, at most `maxW` across: its lines, its size (as wide as its words) */
export function slipOf(g: CanvasRenderingContext2D, note: Note, F: number, maxW: number): Slip {
  const pad = TYPE.pad * F
  g.font = typeFont(F)
  const lines = wrap(g, note.text, maxW - 2 * pad)
  let w = Math.max(...lines.map((l) => g.measureText(l).width))
  // the signature: its own line, right, in their hand
  let sig = 0
  if (note.name) {
    g.font = fontOf(note, F * TYPE.sig)
    w = Math.max(w, g.measureText(`—${note.name}`).width + F * 2.2) // (room for the doodle beside it)
    sig = TYPE.sigGap * F + F * TYPE.sig
  }
  const style = styleOf(note)
  const top = TOP[style.stuck] * F
  const h = lines.length * F * TYPE.line - F * (TYPE.line - 1) + sig + 2 * pad + top
  return { note, style, F, w: Math.min(maxW, w + 2 * pad), h, lines, sig, top }
}
/** how much of a slip there is to type in, a letter at a time (its words, then its signature) */
export const lengthOf = (s: Slip) => s.lines.reduce((a, l) => a + l.length + 1, 0) + (s.note.name ? s.note.name.length + 1 : 0)

/** a slip, its top left at the origin: `shown` letters of it typed (Infinity: all, and its doodle); `fresh`: its
 *  name highlighted (new) */
export function drawSlip(g: CanvasRenderingContext2D, s: Slip, shown = Infinity, fresh = false) {
  const { F, w, h, style: st } = s
  const pad = TYPE.pad * F
  const tp = pad + s.top // (the words start below how it's stuck on)
  const lh = F * TYPE.line
  const r = rng(hash(s.note.id + '|draw'))
  g.save()
  g.textBaseline = 'top'
  g.textAlign = 'left'
  // its edge: cut straight, or torn along the bottom
  const edge = new Path2D()
  edge.moveTo(0, 0)
  edge.lineTo(w, 0)
  if (st.torn) {
    edge.lineTo(w, h - F * 0.2)
    for (let x = w; x > 0; x -= F * 0.35) edge.lineTo(Math.max(0, x - F * 0.35), h - F * 0.2 + (r() - 0.3) * F * 0.32)
  } else edge.lineTo(w, h)
  edge.lineTo(0, st.torn ? h - F * 0.15 : h)
  edge.closePath()
  // its shadow on the board (glued flat: a hair of it), then the paper
  g.save()
  g.translate(F * 0.06, F * 0.1)
  g.fillStyle = 'rgba(70,50,30,0.13)'
  g.fill(edge)
  g.restore()
  g.fillStyle = { printer: '#fdfbf6', lined: '#fffef8', index: '#fffefb', grid: '#fdfdfb', sticky: tint(st.color, 0.72), kraft: '#e8d9bd' }[st.paper]
  g.fill(edge)
  g.save()
  g.clip(edge)
  // the paper's own marks
  const rule = Math.max(1, F * 0.05)
  if (st.paper === 'lined' || st.paper === 'index') {
    for (let k = 0; k * lh + tp + F * 1.1 < h; k++) {
      g.fillStyle = st.paper === 'index' && k === 0 ? 'rgba(220,70,80,0.55)' : 'rgba(80,130,210,0.35)'
      g.fillRect(0, tp + k * lh + F * 1.08, w, rule)
    }
    if (st.paper === 'lined') {
      g.fillStyle = 'rgba(225,80,90,0.45)'
      g.fillRect(pad * 0.5, 0, rule, h)
    }
  } else if (st.paper === 'grid') {
    g.fillStyle = 'rgba(90,140,200,0.16)'
    for (let x = F * 0.45; x < w; x += F * 0.9) g.fillRect(x, 0, rule * 0.8, h)
    for (let y = F * 0.45; y < h; y += F * 0.9) g.fillRect(0, y, w, rule * 0.8)
  } else if (st.paper === 'kraft') {
    for (let i = 0; i < (w * h) / (F * F) * 3; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(120,90,50,0.18)' : 'rgba(255,250,235,0.3)'
      g.fillRect(r() * w, r() * h, F * 0.06, F * 0.06)
    }
  } else if (st.paper === 'sticky') {
    g.fillStyle = 'rgba(0,0,0,0.035)' // (its glue strip)
    g.fillRect(0, 0, w, F * 1.1)
  }
  g.restore()
  // the words, typed
  let left = shown
  g.font = typeFont(F)
  g.fillStyle = INK
  s.lines.forEach((line, k) => {
    if (left <= 0) return
    g.fillText(line.slice(0, left), pad, tp + k * lh)
    left -= line.length + 1
  })
  // signed, by hand (highlighted while it's new)
  const sy = tp + s.lines.length * lh - F * (TYPE.line - 1) + TYPE.sigGap * F
  if (s.note.name && left > 0) {
    const name = `—${s.note.name}`.slice(0, left + 1)
    g.font = fontOf(s.note, F * TYPE.sig)
    g.textAlign = 'right'
    const nw = g.measureText(name).width
    if (fresh && shown === Infinity) {
      g.fillStyle = 'rgba(255,228,60,0.65)'
      g.fillRect(w - pad - nw - F * 0.2, sy + F * 0.25, nw + F * 0.4, F * 1.05)
    }
    g.fillStyle = st.pen
    g.fillText(name, w - pad, sy - F * 0.05)
    g.textAlign = 'left'
  }
  // their doodle, by their signature (or after their words)
  if (shown === Infinity) {
    const size = F * 1.15
    const dx = pad + size * 0.6
    const dy = s.note.name ? sy + F * 0.75 : h - pad - size * 0.5
    doodle(g, st.doodle, dx, dy, size, st.pen, r)
  }
  // how it's stuck on
  stick(g, st, w, F, r)
  g.restore()
}

/** a colour mixed toward white by `k` */
function tint(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k))
  return `rgb(${c.join(',')})`
}

function doodle(g: CanvasRenderingContext2D, kind: Style['doodle'], x: number, y: number, s: number, pen: string, r: () => number) {
  g.save()
  g.translate(x, y)
  g.rotate((r() - 0.5) * 0.5)
  g.strokeStyle = pen
  g.fillStyle = pen
  g.lineWidth = Math.max(1, s * 0.08)
  g.lineCap = g.lineJoin = 'round'
  const p = new Path2D()
  const R = s / 2
  if (kind === 'heart') {
    p.moveTo(0, R * 0.8)
    p.bezierCurveTo(-R * 1.3, -R * 0.1, -R * 0.6, -R * 1.1, 0, -R * 0.35)
    p.bezierCurveTo(R * 0.6, -R * 1.1, R * 1.3, -R * 0.1, 0, R * 0.8)
  } else if (kind === 'star') {
    for (let k = 0; k <= 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const rr = k % 2 ? R * 0.42 : R
      if (k) p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      else p.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
  } else if (kind === 'flower') {
    for (let k = 0; k < 5; k++) {
      const a = (k * 2 * Math.PI) / 5
      p.moveTo(Math.cos(a) * R * 0.6 + R * 0.38, Math.sin(a) * R * 0.6)
      p.arc(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, R * 0.38, 0, Math.PI * 2)
    }
    p.moveTo(R * 0.22, 0)
    p.arc(0, 0, R * 0.22, 0, Math.PI * 2)
  } else if (kind === 'smiley') {
    p.arc(0, 0, R, 0, Math.PI * 2)
    p.moveTo(R * 0.5, R * 0.15)
    p.arc(0, R * 0.1, R * 0.5, 0.15, Math.PI - 0.15)
    g.beginPath()
    g.arc(-R * 0.33, -R * 0.28, R * 0.1, 0, Math.PI * 2)
    g.arc(R * 0.33, -R * 0.28, R * 0.1, 0, Math.PI * 2)
    g.fill()
  } else if (kind === 'sparkle') {
    p.moveTo(0, -R)
    p.quadraticCurveTo(R * 0.12, -R * 0.12, R, 0)
    p.quadraticCurveTo(R * 0.12, R * 0.12, 0, R)
    p.quadraticCurveTo(-R * 0.12, R * 0.12, -R, 0)
    p.quadraticCurveTo(-R * 0.12, -R * 0.12, 0, -R)
    p.moveTo(R * 1.15, -R * 0.75)
    p.lineTo(R * 1.15, -R * 0.35)
    p.moveTo(R * 0.95, -R * 0.55)
    p.lineTo(R * 1.35, -R * 0.55)
  } else {
    p.arc(0, 0, R * 0.45, 0, Math.PI * 2)
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      p.moveTo(Math.cos(a) * R * 0.65, Math.sin(a) * R * 0.65)
      p.lineTo(Math.cos(a) * R, Math.sin(a) * R)
    }
  }
  g.stroke(p)
  g.restore()
}

/** how it's stuck on (over its top edge) */
function stick(g: CanvasRenderingContext2D, st: Style, w: number, F: number, r: () => number) {
  if (st.stuck === 'tape' || st.stuck === 'corners') {
    const pieces: [number, number, number, number][] =
      st.stuck === 'tape'
        ? [[w / 2 + (r() - 0.5) * w * 0.2, 0, Math.min(w * 0.42, F * 6), (r() - 0.5) * 0.18]]
        : [
            [F * 0.7, F * 0.3, F * 3.2, -0.72],
            [w - F * 0.7, F * 0.3, F * 3.2, 0.72],
          ]
    for (const [x, y, len, a] of pieces) {
      const th = F * 1.35
      g.save()
      g.translate(x, y)
      g.rotate(a)
      // (its ends torn off: zigzag)
      const p = new Path2D()
      const z = th / 4
      p.moveTo(-len / 2, -th / 2)
      p.lineTo(len / 2, -th / 2)
      for (let k = 1; k <= 4; k++) p.lineTo(len / 2 + (k % 2 ? z * 0.6 : 0), -th / 2 + k * z)
      p.lineTo(-len / 2, th / 2)
      for (let k = 3; k >= 0; k--) p.lineTo(-len / 2 - (k % 2 ? z * 0.6 : 0), -th / 2 + k * z)
      g.fillStyle = 'rgba(60,40,30,0.08)'
      g.save()
      g.translate(F * 0.05, F * 0.08)
      g.fill(p)
      g.restore()
      g.globalAlpha = 0.78
      g.fillStyle = tint(st.color, 0.25)
      g.fill(p)
      g.save()
      g.clip(p)
      g.fillStyle = 'rgba(255,255,255,0.55)'
      if (st.stripes) for (let sx = -len; sx < len; sx += F * 0.7) g.fillRect(sx, -th, F * 0.25, th * 2)
      else for (let sx = -len / 2 + F * 0.4; sx < len / 2; sx += F * 0.75) for (const sy of [-th / 4, th / 4]) g.fillRect(sx + (sy > 0 ? F * 0.37 : 0), sy - F * 0.1, F * 0.2, F * 0.2)
      g.restore()
      g.restore()
    }
  } else if (st.stuck === 'pin') {
    const x = w / 2
    const y = F * 0.55
    const R = F * 0.55
    g.fillStyle = 'rgba(40,30,20,0.25)'
    g.beginPath()
    g.arc(x + R * 0.35, y + R * 0.45, R, 0, Math.PI * 2)
    g.fill()
    const grad = g.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R)
    grad.addColorStop(0, tint(st.color, 0.55))
    grad.addColorStop(1, st.color)
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, R, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.8)'
    g.beginPath()
    g.arc(x - R * 0.35, y - R * 0.35, R * 0.22, 0, Math.PI * 2)
    g.fill()
  } else if (st.stuck === 'clip') {
    const x = F * 1.2
    const cw = F * 0.75
    const ch = F * 2.2
    g.save()
    g.translate(x, -F * 0.8)
    g.strokeStyle = '#8f96a3'
    g.lineWidth = Math.max(1, F * 0.11)
    g.lineCap = 'round'
    const loop = (ww: number, hh: number, ox: number, oy: number) => {
      g.beginPath()
      g.moveTo(ox, oy + hh - ww / 2)
      g.lineTo(ox, oy + ww / 2)
      g.arc(ox + ww / 2, oy + ww / 2, ww / 2, Math.PI, 0)
      g.lineTo(ox + ww, oy + hh - ww / 2)
      g.stroke()
    }
    loop(cw, ch, 0, 0)
    g.beginPath()
    g.arc(cw * 0.6, ch - cw * 0.5, cw * 0.6, 0, Math.PI)
    g.stroke()
    loop(cw * 0.55, ch * 0.7, cw * 0.22, ch * 0.1)
    g.restore()
  } else {
    // a heart sticker, its corner over the slip's
    g.save()
    g.translate(w - F * 0.5, F * 0.3)
    g.rotate(0.3 + (r() - 0.5) * 0.3)
    const R = F * 0.75
    const p = new Path2D()
    p.moveTo(0, R * 0.8)
    p.bezierCurveTo(-R * 1.3, -R * 0.1, -R * 0.6, -R * 1.1, 0, -R * 0.35)
    p.bezierCurveTo(R * 0.6, -R * 1.1, R * 1.3, -R * 0.1, 0, R * 0.8)
    g.fillStyle = 'rgba(40,30,20,0.18)'
    g.save()
    g.translate(F * 0.06, F * 0.1)
    g.fill(p)
    g.restore()
    g.strokeStyle = '#fff'
    g.lineWidth = F * 0.22
    g.lineJoin = 'round'
    g.stroke(p)
    g.fillStyle = st.color
    g.fill(p)
    g.fillStyle = 'rgba(255,255,255,0.45)'
    g.beginPath()
    g.arc(-R * 0.4, -R * 0.25, R * 0.16, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
}
