import { CanvasTexture, SRGBColorSpace } from 'three'
import { TISSUES } from './spec'

/**
 * The cube's print, drawn (./spec: sampled off the maker's shot): a teal wash from deep green-teal
 * at the top to pale aqua at the bottom, overlapping soft circles all over, gold dots; the dark green
 * logo tag on a side; on the top, the dark oval round the torn-out opening (drawn clear: the top's
 * material cuts it away).
 */
const C = TISSUES.color
const B = TISSUES.box
const PX = 4 // px per mm

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** the wash, the circles and the dots over a w × h mm face; `from` / `to`: how far down the box's
 *  height the face's top and bottom edges are (0 top, 1 bottom: the sides span it, the top is all 0) */
function paint(g: CanvasRenderingContext2D, w: number, h: number, from: number, to: number, seed: number) {
  const rand = rng(seed)
  const grad = g.createLinearGradient(0, 0, 0, h * PX)
  const stops: [number, string][] = [
    [0, C.top],
    [0.3, C.upper],
    [0.55, C.mid],
    [0.78, C.low],
    [1, C.bottom],
  ]
  // the part of the box's wash this face shows
  const at = (t: number) => {
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1]
        const [t1, c1] = stops[i]
        return mix(c0, c1, (t - t0) / (t1 - t0))
      }
    }
    return stops[stops.length - 1][1]
  }
  for (let k = 0; k <= 8; k++) grad.addColorStop(k / 8, at(from + ((to - from) * k) / 8))
  g.fillStyle = grad
  g.fillRect(0, 0, w * PX, h * PX)
  // the soft circles: lighter and darker, overlapping; bigger and paler toward the bottom
  for (let k = 0; k < Math.round((w * h) / 180); k++) {
    const x = rand() * w
    const y = rand() * h
    const t = from + ((to - from) * y) / h
    const r = 9 + rand() * 14 + t * 6
    g.globalAlpha = 0.1 + rand() * 0.14
    g.fillStyle = rand() < 0.62 ? (t > 0.6 ? '#ffffff' : '#35c2bd') : t > 0.6 ? '#8fcbd0' : '#00675d'
    g.beginPath()
    g.arc(x * PX, y * PX, r * PX, 0, Math.PI * 2)
    g.fill()
  }
  // the gold dots
  g.fillStyle = C.gold
  for (let k = 0; k < Math.round((w * h) / 260); k++) {
    g.globalAlpha = 0.75 + rand() * 0.25
    g.beginPath()
    g.arc(rand() * w * PX, rand() * h * PX, (0.55 + rand() * 0.4) * PX, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
}

function mix(a: string, b: string, t: number) {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const x = p(a)
  const y = p(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`
}

/** the logo, white: "Kleenex" in its script, PROFESSIONAL, comfort touch, centred at (cx, cy) mm */
function logo(g: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  g.save()
  g.translate(cx * PX, cy * PX)
  g.scale(scale, scale)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `italic 700 ${9 * PX}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`
  g.fillText('Kleenex', 0, -6 * PX)
  g.fillRect(-13 * PX, -0.6 * PX, 26 * PX, 0.25 * PX)
  g.font = `700 ${2.6 * PX}px "Trebuchet MS", "Helvetica Neue", Arial, sans-serif`
  g.fillText('PROFESSIONAL', 0, 1.8 * PX)
  g.font = `600 ${3.6 * PX}px "Trebuchet MS", "Helvetica Neue", Arial, sans-serif`
  g.fillText('comfort', 0, 6.4 * PX)
  g.fillText('touch', 0, 10.4 * PX)
  g.restore()
}

function texture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** a side, w mm across; with the logo tag hanging off its top edge (right of centre) if `tag` */
export function sideTexture(w: number, seed: number, tag: boolean) {
  const c = document.createElement('canvas')
  c.width = Math.round(w * PX)
  c.height = Math.round(B.h * PX)
  const g = c.getContext('2d')!
  paint(g, w, B.h, 0, 1, seed)
  if (tag) {
    const T = TISSUES.tag
    const x = w - T.w - 8
    g.fillStyle = C.label
    g.beginPath()
    g.moveTo(x * PX, 0)
    g.lineTo((x + T.w) * PX, 0)
    g.lineTo((x + T.w) * PX, (T.h - T.w / 2) * PX)
    g.arc((x + T.w / 2) * PX, (T.h - T.w / 2) * PX, (T.w / 2) * PX, 0, Math.PI)
    g.closePath()
    g.fill()
    logo(g, x + T.w / 2, T.h / 2 - 1, 0.95)
  }
  return texture(c)
}

/** the top: the wash's deepest green, the dark oval, the opening cut clear */
export function topTexture() {
  const c = document.createElement('canvas')
  c.width = Math.round(B.w * PX)
  c.height = Math.round(B.d * PX)
  const g = c.getContext('2d')!
  paint(g, B.w, B.d, 0, 0.12, 11)
  const { oval, hole } = TISSUES
  g.fillStyle = C.label
  g.beginPath()
  g.ellipse((B.w / 2) * PX, (B.d / 2) * PX, oval.a * PX, oval.b * PX, 0, 0, Math.PI * 2)
  g.fill()
  // the torn edge: a white card rim just round the opening (the board's cut face)
  g.fillStyle = '#e9e4d8'
  g.beginPath()
  g.ellipse((B.w / 2) * PX, (B.d / 2) * PX, (hole.a + 0.8) * PX, (hole.b + 0.8) * PX, 0, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.ellipse((B.w / 2) * PX, (B.d / 2) * PX, hole.a * PX, hole.b * PX, 0, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'source-over'
  return texture(c)
}

/** the bottom: plain pale aqua */
export function bottomTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = C.bottom
  g.fillRect(0, 0, 64, 64)
  return texture(c)
}
