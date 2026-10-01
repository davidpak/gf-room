import { CanvasTexture, SRGBColorSpace } from 'three'
import { CANVAS } from './spec'

/**
 * The painting on the easel's canvas: a 2D canvas drawn on with a brush, shown on the canvas's face as a texture.
 *
 *   to start    an underpainting someone's just begun: a dusk sky, the lawn, two cherries, their blossom laid in
 *               on the left, the right one only drawn in; enough that it's never blank, little enough to paint over
 *   the brush   bristles, not a pen: each dab a little fan of soft strokes across the way it's going, each bristle
 *               its own shade of the colour, laid thinner as the brush runs dry along the stroke
 *   kept        in this browser (localStorage), saved a moment after each stroke; undo (the last few strokes),
 *               and a fresh canvas (blank, primed white)
 */
const W = 768
const H = Math.round((W * CANVAS.h) / CANVAS.w) // (its shape: 406 × 508)
const KEY = 'rina-room:painting'
const UNDOS = 8
/** a fresh canvas's white (gesso: a touch warm) */
const PRIMED = '#fbf8f2'

export type Brush = { color: string; size: number }
/** brush sizes, in pixels of the painting (it's 768 across) */
export const SIZES = { small: 7, medium: 16, large: 34 }

const rand = (a: number, b: number) => a + Math.random() * (b - a)
function shade(hex: string, k: number) {
  // (a colour a little lighter or darker: k from -1 to 1)
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))))
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`
}

/** the underpainting: dusk over the Quad, two cherries begun */
function underpaint(g: CanvasRenderingContext2D) {
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62)
  sky.addColorStop(0, '#c9b6e6')
  sky.addColorStop(0.55, '#f2c3c8')
  sky.addColorStop(1, '#f9dcc0')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  // the lawn, two greens, roughly laid
  g.fillStyle = '#8fbf6a'
  g.beginPath()
  g.moveTo(0, H * 0.6)
  g.bezierCurveTo(W * 0.3, H * 0.56, W * 0.7, H * 0.63, W, H * 0.58)
  g.lineTo(W, H)
  g.lineTo(0, H)
  g.fill()
  g.fillStyle = 'rgba(95, 158, 110, 0.35)'
  for (let i = 0; i < 40; i++) g.fillRect(rand(0, W), rand(H * 0.66, H), rand(20, 70), rand(3, 7))
  // the left cherry: its trunk, its blossom dabbed in
  g.strokeStyle = '#7b5444'
  g.lineCap = 'round'
  g.lineWidth = 16
  g.beginPath()
  g.moveTo(W * 0.27, H * 0.66)
  g.quadraticCurveTo(W * 0.25, H * 0.5, W * 0.3, H * 0.38)
  g.stroke()
  g.lineWidth = 7
  g.beginPath()
  g.moveTo(W * 0.27, H * 0.5)
  g.quadraticCurveTo(W * 0.18, H * 0.42, W * 0.13, H * 0.36)
  g.moveTo(W * 0.29, H * 0.44)
  g.quadraticCurveTo(W * 0.38, H * 0.36, W * 0.44, H * 0.33)
  g.stroke()
  for (let i = 0; i < 260; i++) {
    const a = rand(0, Math.PI * 2)
    const r = Math.sqrt(Math.random())
    g.fillStyle = ['#f6c1cf', '#f3b0c3', '#fbd9e1', '#e98fab'][i % 4]
    g.globalAlpha = rand(0.5, 0.9)
    g.beginPath()
    g.ellipse(W * 0.28 + Math.cos(a) * r * W * 0.2, H * 0.32 + Math.sin(a) * r * H * 0.12, rand(6, 14), rand(5, 10), rand(0, 3), 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  // the right one only drawn in, in pencil
  g.strokeStyle = 'rgba(60, 50, 70, 0.45)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(W * 0.72, H * 0.64)
  g.quadraticCurveTo(W * 0.74, H * 0.5, W * 0.7, H * 0.4)
  g.moveTo(W * 0.76, H * 0.64)
  g.quadraticCurveTo(W * 0.77, H * 0.5, W * 0.75, H * 0.41)
  g.stroke()
  g.beginPath()
  g.ellipse(W * 0.72, H * 0.32, W * 0.19, H * 0.11, 0, 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  g.ellipse(W * 0.66, H * 0.28, W * 0.09, H * 0.06, 0.3, 0, Math.PI * 2)
  g.stroke()
}

export function makePainting() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4

  const undo: ImageData[] = []
  let last: { x: number; y: number } | null = null
  let brush: Brush = { color: '#2f2a3a', size: SIZES.medium }
  let ink = 1 // (how much paint's left on the brush: it runs dry along a stroke)
  let save: ReturnType<typeof setTimeout> | null = null

  const fresh = () => {
    g.globalAlpha = 1
    underpaint(g)
    texture.needsUpdate = true
  }
  // what was painted before, if anything; else the underpainting
  fresh()
  try {
    const kept = localStorage.getItem(KEY)
    if (kept) {
      const img = new Image()
      img.onload = () => {
        g.drawImage(img, 0, 0, W, H)
        texture.needsUpdate = true
      }
      img.src = kept
    }
  } catch {
    /* (no storage here: it just isn't kept) */
  }
  const keep = () => {
    if (save) clearTimeout(save)
    save = setTimeout(() => {
      try {
        localStorage.setItem(KEY, canvas.toDataURL('image/jpeg', 0.9))
      } catch {
        /* (full, or none here) */
      }
    }, 600)
  }

  /** one dab of the brush at (x, y), going in direction (dx, dy) */
  const dab = (x: number, y: number, dx: number, dy: number) => {
    const r = brush.size * (0.75 + 0.25 * ink)
    const n = Math.max(5, Math.round(brush.size / 1.6))
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len // (across the stroke)
    const py = dx / len
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * 2 // (-1 … 1, across the brush)
      const ox = px * t * r + rand(-0.15, 0.15) * r
      const oy = py * t * r + rand(-0.15, 0.15) * r
      g.globalAlpha = (0.3 + 0.4 * ink) * (1 - 0.3 * Math.abs(t))
      g.fillStyle = shade(brush.color, rand(-0.08, 0.08))
      g.beginPath()
      g.ellipse(x + ox, y + oy, r * rand(0.4, 0.55), r * rand(0.18, 0.26), Math.atan2(dy, dx), 0, Math.PI * 2) // (a streak along the way it goes)
      g.fill()
    }
  }

  return {
    texture,
    /** the brush to paint with next */
    setBrush(b: Partial<Brush>) {
      brush = { ...brush, ...b }
    },
    getBrush: () => brush,
    /** a stroke begins at (u, v) on the canvas's face (0..1, v up) */
    begin(u: number, v: number) {
      undo.push(g.getImageData(0, 0, W, H))
      if (undo.length > UNDOS) undo.shift()
      ink = 1
      last = { x: u * W, y: (1 - v) * H }
      dab(last.x, last.y, 1, 0)
      texture.needsUpdate = true
    },
    /** and carries on to (u, v): dabs laid along the way, close enough to read as one stroke */
    to(u: number, v: number) {
      if (!last) return
      const x = u * W
      const y = (1 - v) * H
      const dx = x - last.x
      const dy = y - last.y
      const d = Math.hypot(dx, dy)
      const step = Math.max(1.2, brush.size * 0.14)
      if (d < step) return
      const n = Math.floor(d / step)
      for (let i = 1; i <= n; i++) {
        dab(last.x + (dx * i) / n, last.y + (dy * i) / n, dx, dy)
        ink = Math.max(0.45, ink - 0.003 * step)
      }
      last = { x, y }
      texture.needsUpdate = true
    },
    end() {
      if (!last) return
      last = null
      g.globalAlpha = 1
      keep()
    },
    undo() {
      const s = undo.pop()
      if (!s) return
      g.putImageData(s, 0, 0)
      texture.needsUpdate = true
      keep()
    },
    /** a fresh canvas: blank, primed white (kept so, till it's painted on) */
    clear() {
      undo.push(g.getImageData(0, 0, W, H))
      if (undo.length > UNDOS) undo.shift()
      g.globalAlpha = 1
      g.fillStyle = PRIMED
      g.fillRect(0, 0, W, H)
      texture.needsUpdate = true
      keep()
    },
  }
}
export type Painting = ReturnType<typeof makePainting>

/** the one painting (the easel's, wherever it's shown) */
let one: Painting | null = null
export const painting = () => (one ??= makePainting())
