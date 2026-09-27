import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { FN_Z, KB_W, LAPTOP, keyLayout, rowZ } from './spec'

/**
 * What's drawn on the laptop (./spec): the case's hearts on the lid, the screen (her desktop, a
 * notes page open like in the photos), the Touch Bar, the key legends through the pink cover, the
 * speaker grilles, the "MacBook Pro" chin.
 */
const L = LAPTOP
const C = L.color

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.round(w)
  c.height = Math.round(h)
  return { c, g: c.getContext('2d')! }
}
function texture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** a heart, its middle at (0, 0), `s` across (the classic parametric heart, lobes up: -y) */
function heart(g: CanvasRenderingContext2D, s: number) {
  g.beginPath()
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    const px = (x / 34) * s
    const py = (-(y - 2.5) / 34) * s
    if (i === 0) g.moveTo(px, py)
    else g.lineTo(px, py)
  }
  g.closePath()
}

/** an apple, `s` tall, its middle at (0, 0): the body, the bite on the right, the leaf */
export function apple(into: CanvasRenderingContext2D, s: number, color: string) {
  // (drawn on its own and laid on, so the bite doesn't cut through what's under it)
  const N = Math.ceil(s * 1.3)
  const { c, g } = canvas(N, N)
  g.translate(N / 2, N / 2)
  g.save()
  g.fillStyle = color
  g.beginPath()
  const k = s / 20
  g.moveTo(0, -5 * k)
  g.bezierCurveTo(3 * k, -7.5 * k, 8.5 * k, -6.5 * k, 8.5 * k, -1 * k)
  g.bezierCurveTo(8.5 * k, 4.5 * k, 5.5 * k, 9.5 * k, 3 * k, 9.5 * k)
  g.bezierCurveTo(1.5 * k, 9.5 * k, 1 * k, 8.6 * k, 0, 8.6 * k)
  g.bezierCurveTo(-1 * k, 8.6 * k, -1.5 * k, 9.5 * k, -3 * k, 9.5 * k)
  g.bezierCurveTo(-5.5 * k, 9.5 * k, -8.5 * k, 4.5 * k, -8.5 * k, -1 * k)
  g.bezierCurveTo(-8.5 * k, -6.5 * k, -3 * k, -7.5 * k, 0, -5 * k)
  g.fill()
  // the bite
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.arc(9.6 * k, 0.5 * k, 3.4 * k, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'source-over'
  // the leaf
  g.beginPath()
  g.ellipse(1.8 * k, -8.6 * k, 1.6 * k, 3.2 * k, 0.75, 0, Math.PI * 2)
  g.fill()
  g.restore()
  into.drawImage(c, -N / 2, -N / 2)
}

/** the lid's back, len × w mm (u across the laptop, +x; v from the hinge to the front edge): the
 *  hearts round the logo, as seen from behind the open lid (so drawn mirrored: its right is -x) */
export function heartsTexture() {
  const PX = 4
  const w = L.base.w + 2 * L.case.t
  const h = L.lid.len
  const { c, g } = canvas(w * PX, h * PX)
  g.fillStyle = C.hearts[0]
  g.fillRect(0, 0, c.width, c.height)
  g.save()
  g.translate(c.width / 2, c.height / 2)
  g.scale(-1, 1) // (seen from behind)
  const n = C.hearts.length - 1
  const sn = (1.5 - (n - 1) * 0.19) * h * PX // (the middle one, round the logo, in the lid's middle)
  for (let i = 1; i <= n; i++) {
    const s = (1.5 - (i - 1) * 0.19) * h * PX // (the outer ones run off the lid: mint only in its corners)
    // each bigger one a little toward the lobes, so the rings keep their width round the dip too
    g.save()
    g.translate(0, -0.24 * (s - sn))
    g.fillStyle = C.hearts[i]
    heart(g, s)
    g.fill()
    g.restore()
  }
  apple(g, 30 * PX, '#3a383b')
  g.restore()
  const t = texture(c)
  // the lid's shape coordinates (mm, x from -w/2) onto the picture
  t.repeat.set(1 / w, 1 / h)
  t.offset.set(0.5, 0.5) // (its outline is drawn round its middle)
  return t
}

/** the screen: her desktop, a notes page open (the photos: OneNote, always) */
export function screenTexture() {
  const [W, H] = [1280, 800]
  const { c, g } = canvas(W, H)
  // the wallpaper: a soft pastel wash, blobs of light
  const bg = g.createLinearGradient(0, 0, W * 0.3, H)
  bg.addColorStop(0, '#f7c4d4')
  bg.addColorStop(0.5, '#d5c4f0')
  bg.addColorStop(1, '#a9dcd6')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  for (const [x, y, r, col] of [
    [200, 620, 260, '#ffe3ef'],
    [1100, 180, 300, '#e9f7ff'],
    [900, 700, 220, '#ffeede'],
  ] as const) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, col)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.globalAlpha = 0.6
    g.fillStyle = rg
    g.fillRect(0, 0, W, H)
  }
  g.globalAlpha = 1
  // the menu bar
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillRect(0, 0, W, 26)
  g.save()
  g.translate(22, 13)
  apple(g, 16, '#1d1d1f')
  g.restore()
  g.fillStyle = '#1d1d1f'
  g.font = '600 14px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  g.textBaseline = 'middle'
  g.fillText('OneNote', 44, 13)
  g.font = '400 14px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  let x = 118
  for (const m of ['File', 'Edit', 'View', 'Insert', 'Format', 'Notebooks', 'Window', 'Help']) {
    g.fillText(m, x, 13)
    x += g.measureText(m).width + 22
  }
  g.textAlign = 'right'
  g.fillText('Tue 10:20 PM', W - 16, 13)
  g.textAlign = 'left'
  // the notes window
  const wx = 120
  const wy = 58
  const ww = 1040
  const wh = 600
  g.fillStyle = 'rgba(0,0,0,0.18)'
  round(g, wx + 4, wy + 10, ww, wh, 12)
  g.fill()
  g.fillStyle = '#ffffff'
  round(g, wx, wy, ww, wh, 12)
  g.fill()
  g.save()
  round(g, wx, wy, ww, wh, 12)
  g.clip()
  g.fillStyle = '#7719aa' // OneNote's purple
  g.fillRect(wx, wy, ww, 70)
  for (const [i, col] of ['#ff5f57', '#febc2e', '#28c840'].entries()) {
    g.fillStyle = col
    g.beginPath()
    g.arc(wx + 20 + i * 20, wy + 16, 6, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.font = '500 13px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  let tx = wx + 20
  for (const m of ['Home', 'Insert', 'Draw', 'View']) {
    g.fillText(m, tx, wy + 50)
    tx += 70
  }
  // the sections and pages down the left
  g.fillStyle = '#f3eef8'
  g.fillRect(wx, wy + 70, 230, wh - 70)
  const tabs = ['#d9534f', '#f0ad4e', '#5cb85c', '#5bc0de', '#9b59b6', '#e67ea5']
  g.font = '400 13px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  for (let i = 0; i < 9; i++) {
    g.fillStyle = tabs[i % tabs.length]
    g.fillRect(wx + 14, wy + 92 + i * 30, 5, 18)
    g.fillStyle = i === 4 ? '#7719aa' : '#555'
    g.fillText(['Lecture 21', 'Lecture 22', 'Practice', 'Enzymes', 'Glycolysis', 'TCA cycle', 'Lipids', 'Exam 3', 'To do'][i], wx + 28, wy + 102 + i * 30)
  }
  // the page: a title and handwritten-ish lines
  g.fillStyle = '#1d1d1f'
  g.font = '600 30px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  g.fillText('Glycolysis', wx + 270, wy + 118)
  g.fillStyle = '#888'
  g.font = '400 12px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  g.fillText('Tuesday, December 9, 2025   10:02 PM', wx + 270, wy + 146)
  const ink = ['#1a4fb4', '#1a4fb4', '#c0392b', '#1a4fb4', '#27ae60', '#1a4fb4', '#1a4fb4', '#c0392b', '#1a4fb4', '#1a4fb4']
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = ink[i]
    g.lineWidth = 2.2
    g.beginPath()
    const y0 = wy + 190 + i * 38
    const len = 260 + ((i * 137) % 420)
    const indent = i % 3 === 0 ? 0 : 30
    for (let s = 0; s <= len; s += 4) {
      const yy = y0 + Math.sin(s * 0.21 + i) * 3 + Math.sin(s * 0.05 + i * 2) * 2
      if (s === 0) g.moveTo(wx + 280 + indent + s, yy)
      else g.lineTo(wx + 280 + indent + s, yy)
    }
    g.stroke()
  }
  g.restore()
  // the dock
  const n = 12
  const dw = n * 56 + 20
  g.fillStyle = 'rgba(255,255,255,0.4)'
  round(g, (W - dw) / 2, H - 76, dw, 66, 18)
  g.fill()
  const icons = ['#3d8ef7', '#f5f5f7', '#34c759', '#ff9f0a', '#ff375f', '#7719aa', '#0a84ff', '#1d9bf0', '#ffd60a', '#30d158', '#bf5af2', '#8e8e93']
  icons.forEach((col, i) => {
    g.fillStyle = col
    round(g, (W - dw) / 2 + 14 + i * 56, H - 68, 48, 48, 11)
    g.fill()
  })
  return texture(c)
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

/** the Touch Bar while it's on: dim keys along it (the app's controls, brightness, volume, Siri) */
export function touchBarTexture(w: number, h: number) {
  const PX = 8
  const { c, g } = canvas(w * PX, h * PX)
  g.fillStyle = '#050507'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#3a3a3e'
  const k = h * PX
  const pill = (x: number, pw: number) => {
    round(g, x * PX, k * 0.15, pw * PX, k * 0.7, k * 0.2)
    g.fill()
  }
  let x = 3
  for (const pw of [22, 22, 22, 34, 22]) {
    pill(x, pw)
    x += pw + 2.5
  }
  x = w - 3 - 4 * 13
  for (let i = 0; i < 4; i++) pill(x + i * 13, 11)
  g.fillStyle = '#9a9aa0'
  g.font = `500 ${k * 0.42}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  ;['Aa', '•••', '✎', 'Search', '＋'].forEach((s, i) => g.fillText(s, (3 + i * 24.5 + (i > 3 ? 12 : i === 3 ? 17 : 11)) * PX, k / 2))
  ;['☼', '◐', '◀)', '◉'].forEach((s, i) => g.fillText(s, (x + i * 13 + 5.5) * PX, k / 2))
  return texture(c)
}

/** the legends on the keys, seen through the pink cover: a picture over the whole keyboard (x from
 *  -KB_W/2, z from the Touch Bar row's back edge), clear between */
export const LEGEND_AREA = { x0: -KB_W / 2, z0: FN_Z, w: KB_W, d: rowZ(4) + L.keys.cap - FN_Z }
export function legendsTexture() {
  const PX = 10
  const A = LEGEND_AREA
  const { c, g } = canvas(A.w * PX, A.d * PX)
  g.fillStyle = C.legend
  g.textBaseline = 'middle'
  for (const k of keyLayout()) {
    const cx = (k.x - A.x0) * PX
    const cy = (k.z - A.z0) * PX
    const word = k.label.length > 1 && !'▲▼◀▶'.includes(k.label)
    if (k.label === ' ') continue
    if (word) {
      // words sit in a lower corner (left on the left half, right on the right)
      g.font = `500 ${2.1 * PX}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
      const left = k.x < 0
      g.textAlign = left ? 'left' : 'right'
      g.fillText(k.label, cx + ((left ? -1 : 1) * k.w * PX) / 2 + (left ? 1.4 : -1.4) * PX, cy + (k.d / 2 - 2.6) * PX)
    } else {
      g.textAlign = 'center'
      g.font = `500 ${(k.d < 10 ? 2.4 : 4.4) * PX}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
      g.fillText(k.label, cx, cy)
    }
  }
  return texture(c)
}

/** the speaker grilles: rows of tiny holes, tiled */
export function grilleTexture(w: number, d: number) {
  const PX = 12
  const { c, g } = canvas(w * PX, d * PX)
  g.fillStyle = '#1f1f22'
  const step = 1.1
  for (let y = step / 2; y < d; y += step) {
    for (let x = step / 2 + ((Math.round(y / step) % 2) * step) / 2; x < w; x += step) {
      g.beginPath()
      g.arc(x * PX, y * PX, 0.28 * PX, 0, Math.PI * 2)
      g.fill()
    }
  }
  const t = texture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

/** the inside of the lid round the display: black glass, "MacBook Pro" on the chin (shape coords:
 *  x from -w/2, y from the lid's back edge) */
export function bezelTexture() {
  const PX = 4
  const w = L.base.w
  const h = L.lid.len
  const { c, g } = canvas(w * PX, h * PX)
  g.fillStyle = C.bezel
  g.fillRect(0, 0, c.width, c.height)
  const chin = h - L.display.top - L.display.h
  g.fillStyle = '#6d6d72'
  g.font = `500 ${3.4 * PX}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // (v runs from the back edge: the chin's the canvas's bottom; seen from in front, not mirrored)
  g.fillText('MacBook Pro', c.width / 2, c.height - (chin / 2 + 0.5) * PX)
  // the camera over the display
  g.fillStyle = '#222228'
  g.beginPath()
  g.arc(c.width / 2, (L.display.top / 2) * PX, 1.1 * PX, 0, Math.PI * 2)
  g.fill()
  const t = texture(c)
  t.repeat.set(1 / w, 1 / h)
  t.offset.set(0.5, 0.5) // (its outline is drawn round its middle)
  return t
}
