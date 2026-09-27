import { CanvasTexture, SRGBColorSpace } from 'three'
import { FN_Z, KB_W, LAPTOP, keyLayout, rowZ, touchBar } from './spec'

/**
 * What's drawn on the laptop (./spec), each painted onto the surface it's on (nothing laid over
 * anything: layers a hair apart flicker from afar, where the depth buffer can't tell them apart):
 *
 *   the lid's back     the case's hearts round the logo
 *   the lid's inside   the black glass, "MacBook Pro" on the chin, the case's lip round it; and, lit
 *                      (an emissive picture on the same face), the screen: her desktop, her notes
 *   the deck           Space Gray, the trackpad, the speaker grilles, the Touch Bar's glass; lit, the
 *                      Touch Bar's keys
 *   the keys           the pink cover, the legends through it
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

/** a heart as in the case's print: two round lobes (circles R across, their middles ±0.6R apart
 *  sideways) and straight sides tangent to them down to a softly rounded tip (58° off upright), so
 *  every side's convex: 2.55R tall, 3.2R wide. Drawn `scale` times, about `at` (px, y down: the
 *  lobes up), R in px */
export const HEART = { a: 0.6, side: (58 * Math.PI) / 180, tip: 0.14 }
function heartPoints(R: number) {
  const a = HEART.a * R
  const th = HEART.side
  const n = [Math.cos(th), -Math.sin(th)] // the right side's outward normal (math axes: y up)
  const tipY = -(a * Math.cos(th) + R) / Math.sin(th)
  const dipA = Math.atan2(Math.sqrt(R * R - a * a), -a) // where the lobes meet, on the right lobe
  const pts: [number, number][] = []
  // up the right side from the tip, round the right lobe over its top to the dip
  const t0 = Math.atan2(n[1], n[0])
  for (let k = 0; k <= 40; k++) {
    const t = t0 + ((dipA - t0) * k) / 40
    pts.push([a + R * Math.cos(t), R * Math.sin(t)])
  }
  // the left lobe (mirrored), from the dip over its top and down to its side
  for (let k = 40; k >= 0; k--) {
    const [x, y] = pts[k]
    pts.push([-x, y])
  }
  return { pts, tipY }
}
function heart(g: CanvasRenderingContext2D, R: number, cy: number) {
  const { pts, tipY } = heartPoints(R)
  const r = HEART.tip * R
  g.beginPath()
  // (math y up -> canvas y down, about cy)
  const P = ([x, y]: [number, number]) => [x, cy - y] as const
  g.moveTo(...P(pts[0]))
  for (const p of pts.slice(1)) g.lineTo(...P(p))
  // down the left side to the tip, round it, and back up to the start
  const left = pts[pts.length - 1]
  g.arcTo(...P([0, tipY]), ...P([-left[0], left[1]]), r)
  g.lineTo(...P(pts[0]))
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
 *  hearts round the logo, as seen from behind the open lid (so drawn mirrored: its right is -x).
 *  The photo (macbook-case.jpg): pink in the corners, then whole hearts one inside the next, mint,
 *  cream, then pinks, a pale one round the logo; the mint one reaches the lid's edges, top, bottom
 *  and sides (the heart's drawn a little wider than it's tall, ~1.17×, to fill it). Each is the same
 *  heart smaller, scaled about the point halfway between its lobes' tops and its tip (so the rings
 *  keep much the same width all round, and each sits in the middle top to bottom), on the logo */
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
  const EDGE = 0.6 // (mm of pink left at the edges: the mint one just reaches them)
  const { tipY } = heartPoints(1)
  const R0 = ((h - 2 * EDGE) * PX) / (1 - tipY)
  const sx = ((w - 2 * EDGE) * PX) / (2 * (1 + HEART.a) * R0)
  const mid = (1 + tipY) / 2 // (halfway from the lobes' tops to the tip, per R)
  g.save()
  g.scale(sx, 1)
  for (let i = 1; i <= n; i++) {
    const R = R0 * (1 - (i - 1) * 0.125)
    g.fillStyle = C.hearts[i]
    heart(g, R, mid * R) // (its circles' line sits mid·R off the logo: that point stays put)
    g.fill()
  }
  g.restore()
  apple(g, 30 * PX, '#3a383b')
  g.restore()
  const t = texture(c)
  // the lid's shape coordinates (mm, x from -w/2) onto the picture
  t.repeat.set(1 / w, 1 / h)
  t.offset.set(0.5, 0.5) // (its outline is drawn round its middle)
  return t
}

/** the screen: her desktop, a notes page open (the photos: OneNote, always), 1280 × 800 */
function screenCanvas() {
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
  return c
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

/** the Touch Bar's keys (the app's controls; brightness, dark mode, volume, Siri), each label in the
 *  middle of its key, into a w × h mm box at (x, y) px */
function drawTouchBar(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, PX: number) {
  const k = h * PX
  const keys: { x: number; w: number; label: string }[] = []
  let x = 3
  for (const [label, pw] of [['Aa', 22], ['•••', 22], ['✎', 22], ['Search', 34], ['+', 22]] as const) {
    keys.push({ x, w: pw, label })
    x += pw + 2.5
  }
  const x1 = w - 3 - 4 * 13
  ;['☼', '◐', '◀)', '◉'].forEach((label, i) => keys.push({ x: x1 + i * 13, w: 11, label }))
  g.save()
  g.translate(x0, y0)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const key of keys) {
    g.fillStyle = '#3a3a3e'
    round(g, key.x * PX, k * 0.15, key.w * PX, k * 0.7, k * 0.2)
    g.fill()
    const cx = (key.x + key.w / 2) * PX
    g.fillStyle = '#9a9aa0'
    if (key.label === '+') {
      // drawn, not typed (a glyph's own sidebearings put it off the middle)
      const s = k * 0.34
      const t = k * 0.07
      g.fillRect(cx - s / 2, k / 2 - t / 2, s, t)
      g.fillRect(cx - t / 2, k / 2 - s / 2, t, s)
    } else {
      g.font = `500 ${k * 0.42}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
      g.fillText(key.label, cx, k / 2)
    }
  }
  g.restore()
}

/** the deck, the base's top (SHELL_W × SHELL_D in the laptop's x, z; the slab's outline runs to -z,
 *  so the picture's top is the back): Space Gray, the trackpad, the grilles, the Touch Bar's dark
 *  glass; `lit`: the Touch Bar's keys, for the emissive map */
export function deckTextures() {
  const PX = 6
  const W = L.base.w + 2 * L.case.t
  const D = L.base.d + 2 * L.case.t
  const at = (x: number, z: number) => [(x + W / 2) * PX, (z + D / 2) * PX] as const // (the laptop's x, z to px)
  const map = canvas(W * PX, D * PX)
  const lit = canvas(W * PX, D * PX)
  let g = map.g
  g.fillStyle = C.gray
  g.fillRect(0, 0, map.c.width, map.c.height)
  // the trackpad: a touch lighter, a fine edge round it
  const tp = L.trackpad
  const [tx, ty] = at(-tp.w / 2, L.base.d / 2 - tp.front - tp.d)
  g.fillStyle = C.trackpad
  round(g, tx, ty, tp.w * PX, tp.d * PX, 6 * PX)
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.12)'
  g.lineWidth = 0.35 * PX
  g.stroke()
  // the grilles either side of the keys: rows of tiny holes
  const kbD = rowZ(4) + L.keys.cap - FN_Z
  const gx = KB_W / 2 + (L.base.w - KB_W) / 4
  g.fillStyle = '#3c3c40'
  for (const side of [-1, 1]) {
    const x0 = side * gx - L.speaker.w / 2
    const step = 1.1
    for (let z = step / 2; z < kbD; z += step) {
      for (let x = step / 2 + ((Math.round(z / step) % 2) * step) / 2; x < L.speaker.w; x += step) {
        const [px, py] = at(x0 + x, FN_Z + z)
        g.beginPath()
        g.arc(px, py, 0.3 * PX, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  // the Touch Bar: dark glass here; its keys lit, on the emissive picture
  const bar = touchBar().bar
  const [bx, by] = at(bar.x - bar.w / 2, bar.z - bar.d / 2)
  g.fillStyle = C.touchBar
  round(g, bx, by, bar.w * PX, bar.d * PX, 1.2 * PX)
  g.fill()
  g = lit.g
  g.fillStyle = '#000000'
  g.fillRect(0, 0, lit.c.width, lit.c.height)
  drawTouchBar(g, bx, by, bar.w, bar.d, PX)
  const out = [texture(map.c), texture(lit.c)].map((t) => {
    t.repeat.set(1 / W, 1 / D)
    t.offset.set(0.5, 0.5)
    return t
  })
  return { map: out[0], lit: out[1] }
}

/** the keys: the pink cover, the legends through it, over the whole keyboard (x from -KB_W/2, z
 *  from the Touch Bar row's back edge: the keys' UVs are laid on from above) */
export const KEY_AREA = { x0: -KB_W / 2, z0: FN_Z, w: KB_W, d: rowZ(4) + L.keys.cap - FN_Z }
export function keysTexture() {
  const PX = 10
  const A = KEY_AREA
  const { c, g } = canvas(A.w * PX, A.d * PX)
  g.fillStyle = C.key
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = C.legend
  g.globalAlpha = 0.85
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

/** the inside of the lid (SHELL_W × len; the lid's outline runs to +z, drawn round its middle, so
 *  the picture's top is the front edge: the screen's top, open), seen from in front: the case's lip
 *  round the edge, the black glass, the camera, "MacBook Pro" on the chin; `lit`: the screen in
 *  its place, the rest black */
export function faceTextures() {
  const PX = 4.4
  const W = L.base.w + 2 * L.case.t
  const H = L.lid.len
  const map = canvas(W * PX, H * PX)
  const lit = canvas(W * PX, H * PX)
  let g = map.g
  g.fillStyle = C.rim
  g.fillRect(0, 0, map.c.width, map.c.height)
  g.fillStyle = C.bezel
  round(g, L.case.t * PX, L.case.t * PX, (W - 2 * L.case.t) * PX, (H - 2 * L.case.t) * PX, L.base.corner * PX)
  g.fill()
  const dx = ((W - L.display.w) / 2) * PX
  const dy = L.display.top * PX
  g.fillStyle = '#08080a'
  g.fillRect(dx, dy, L.display.w * PX, L.display.h * PX)
  g.fillStyle = '#222228'
  g.beginPath()
  g.arc(map.c.width / 2, (L.display.top / 2) * PX, 1.1 * PX, 0, Math.PI * 2)
  g.fill()
  const chin = H - L.display.top - L.display.h
  g.fillStyle = '#6d6d72'
  g.font = `500 ${3.4 * PX}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('MacBook Pro', map.c.width / 2, map.c.height - (chin / 2 + 0.5) * PX)
  g = lit.g
  g.fillStyle = '#000000'
  g.fillRect(0, 0, lit.c.width, lit.c.height)
  g.drawImage(screenCanvas(), dx, dy, L.display.w * PX, L.display.h * PX)
  const out = [texture(map.c), texture(lit.c)].map((t) => {
    t.repeat.set(1 / W, 1 / H)
    t.offset.set(0.5, 0.5)
    return t
  })
  return { map: out[0], lit: out[1] }
}
