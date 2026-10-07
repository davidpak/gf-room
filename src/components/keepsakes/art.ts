import { CanvasTexture, SRGBColorSpace } from 'three'
import { KEEPSAKES } from './spec'

/**
 * The keepsakes' printed faces, painted (./spec, her photo): the daughter card's painting (a bicycle by a white pillar,
 * its basket heaped with pink flowers) and its script; the Mickey card's sepia drawing on kraft; the stand-in photo
 * in the frame (two sisters, a soft illustration, warm); the cocoa box's print, its window cut clear.
 *
 * Every painter draws in mm (y down) on a canvas PX a mm; a face is painted again once its fonts are in.
 */
const K = KEEPSAKES
const COL = K.colors
const PX = 5
type G = CanvasRenderingContext2D

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** a w × h mm face painted by `draw` (in mm); again when `fonts` load */
function face(w: number, h: number, draw: (g: G) => void, fonts: string[] = []) {
  const c = document.createElement('canvas')
  c.width = Math.round(w * PX)
  c.height = Math.round(h * PX)
  const g = c.getContext('2d')!
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  const paint = () => {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.width, c.height)
    g.setTransform(PX, 0, 0, PX, 0, 0)
    draw(g)
    t.needsUpdate = true
  }
  paint()
  if (fonts.length && document.fonts) void Promise.all(fonts.map((f) => document.fonts.load(f))).then(paint).catch(() => {})
  return t
}
const SCRIPT = '600 10px "Caveat"'
const BOLD = '700 10px "Nunito"'

function blob(g: G, x: number, y: number, r: number, color: string, alpha = 1) {
  g.globalAlpha = alpha
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
}
function ellipse(g: G, x: number, y: number, rx: number, ry: number, rot: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  g.fill()
}

// ---- the daughter card
/** a blossom: five soft petals round a darker eye */
function blossom(g: G, x: number, y: number, r: number, petal: string, eye: string, turn: number) {
  for (let k = 0; k < 5; k++) {
    const a = turn + (k * Math.PI * 2) / 5
    ellipse(g, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.42, a, petal)
  }
  blob(g, x, y, r * 0.22, eye)
}
function daughterFront(g: G) {
  const W = K.card.w
  const H = K.card.h
  const rand = rng(7)
  // the sky, pale, a little warm toward the horizon
  const sky = g.createLinearGradient(0, 0, 0, H * 0.6)
  sky.addColorStop(0, '#dfe7ea')
  sky.addColorStop(1, '#f3efe6')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  // the garden behind: deep greens in soft heaps, darker low
  for (let k = 0; k < 70; k++) {
    const x = rand() * W
    const y = 80 + rand() * 100
    blob(g, x, y, 8 + rand() * 14, rand() < 0.5 ? '#2f5a35' : rand() < 0.5 ? '#3f7444' : '#264a2d', 0.85)
  }
  // dark leaves hanging in at the top right, as in the painting
  for (let k = 0; k < 26; k++) blob(g, 88 + rand() * 45, rand() * 30, 4 + rand() * 7, rand() < 0.5 ? '#1f3b25' : '#2c4f31', 0.95)
  // the path, a warm grey at the foot
  const path = g.createLinearGradient(0, 160, 0, H)
  path.addColorStop(0, '#9a9a86')
  path.addColorStop(1, '#7b7a69')
  g.fillStyle = path
  g.fillRect(0, 163, W, H - 163)
  // the white pillar at the right: its shaft, a capital, a soft shade down its left
  g.fillStyle = '#f7f5f0'
  g.fillRect(98, 30, 20, 140)
  g.fillRect(93, 22, 30, 9)
  g.fillRect(95, 166, 26, 6)
  g.fillStyle = '#d8d6d0'
  g.fillRect(98, 31, 4, 135)
  // the bicycle, facing left: the wheels (tyres, rims, spokes), the blue frame, the saddle, the handlebars
  const front = [30, 148] as const
  const rear = [92, 148] as const
  for (const [x, y] of [front, rear]) {
    g.strokeStyle = '#2b2b33'
    g.lineWidth = 2.6
    g.beginPath()
    g.arc(x, y, 21, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = '#6f7d9a'
    g.lineWidth = 0.9
    g.beginPath()
    g.arc(x, y, 19, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = 0.3
    g.strokeStyle = '#c9ccd4'
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * 19, y + Math.sin(a) * 19)
      g.stroke()
    }
  }
  g.strokeStyle = '#3e5fa6'
  g.lineWidth = 2.4
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const crank = [62, 150] as const
  const seat = [74, 108] as const
  const head = [40, 108] as const
  g.beginPath()
  g.moveTo(...rear)
  g.lineTo(...crank)
  g.lineTo(...seat)
  g.lineTo(...rear)
  g.moveTo(...crank)
  g.lineTo(...head)
  g.lineTo(...front)
  g.moveTo(45, 124)
  g.lineTo(seat[0] - 2, seat[1] + 8)
  g.moveTo(...head)
  g.lineTo(42, 98)
  g.stroke()
  g.strokeStyle = '#d7dbe2'
  g.lineWidth = 1.6
  g.beginPath()
  g.moveTo(32, 95)
  g.quadraticCurveTo(44, 92, 52, 98)
  g.stroke()
  ellipse(g, 76, 104, 7, 2.6, 0.05, '#4a2f22')
  blob(g, ...crank, 3, '#30323b')
  // the basket over the front wheel: wicker, woven
  g.fillStyle = '#9a6a3c'
  g.beginPath()
  g.moveTo(14, 100)
  g.lineTo(46, 100)
  g.lineTo(42, 122)
  g.lineTo(18, 122)
  g.closePath()
  g.fill()
  g.strokeStyle = '#6d4625'
  g.lineWidth = 0.6
  for (let y = 103; y < 122; y += 3.2) {
    g.beginPath()
    g.moveTo(14 + (y - 100) * 0.18, y)
    g.lineTo(46 - (y - 100) * 0.18, y)
    g.stroke()
  }
  for (let x = 17; x < 45; x += 3.4) {
    g.beginPath()
    g.moveTo(x, 100)
    g.lineTo(x + (30 - x) * 0.12, 122)
    g.stroke()
  }
  // the flowers heaped in it and spilling over: leaves first, then the blossoms, pinks and magentas
  for (let k = 0; k < 40; k++) {
    const a = rand() * Math.PI * 2
    ellipse(g, 30 + Math.cos(a) * rand() * 30, 80 + Math.sin(a) * rand() * 22, 3.5, 1.6, a, rand() < 0.5 ? '#3d7a3c' : '#2e6131')
  }
  const pinks = ['#e2416f', '#ee6a8f', '#d32a5c', '#f28fab', '#c71f55']
  for (let k = 0; k < 90; k++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand())
    const x = 30 + Math.cos(a) * d * 30
    const y = 78 + Math.sin(a) * d * 20 - (1 - d) * 6
    blossom(g, x, y, 3 + rand() * 2.4, pinks[Math.floor(rand() * pinks.length)], '#8f1440', rand() * 6)
  }
  // a few trailing down the basket's side
  for (let k = 0; k < 8; k++) blossom(g, 12 + rand() * 8, 100 + k * 3.6, 2.6, pinks[k % pinks.length], '#8f1440', k)
  // the words, top left, a red-brown script
  g.fillStyle = '#8b2f27'
  g.font = '600 14px "Caveat", "Segoe Script", cursive'
  g.fillText('My Daughter', 8, 20)
  g.fillText('is Amazing...', 18, 35)
}
function cardInside(g: G, sprig: boolean) {
  g.fillStyle = COL.cardInside
  g.fillRect(0, 0, K.card.w, K.card.h)
  if (!sprig) return
  // a little pink sprig low in the corner, as such cards have
  const rand = rng(3)
  for (let k = 0; k < 7; k++) blossom(g, 96 + rand() * 20, 150 + rand() * 18, 2.4, ['#ee6a8f', '#f28fab', '#e2416f'][k % 3], '#8f1440', k)
}
function daughterBack(g: G) {
  g.fillStyle = COL.cardInside
  g.fillRect(0, 0, K.card.w, K.card.h)
  g.fillStyle = '#b9a99a'
  g.font = '600 4px "Nunito", sans-serif'
  g.textAlign = 'center'
  g.fillText('printed on recycled paper', K.card.w / 2, K.card.h - 14)
  g.textAlign = 'left'
}

// ---- the Mickey card
function mickeyFront(g: G) {
  const W = K.card.w
  const H = K.card.h
  const kraft = g.createLinearGradient(0, 0, W, H)
  kraft.addColorStop(0, '#d2a874')
  kraft.addColorStop(1, '#bf9160')
  g.fillStyle = kraft
  g.fillRect(0, 0, W, H)
  // the stock's fibres: faint and few
  const rand = rng(11)
  for (let k = 0; k < 120; k++) {
    g.strokeStyle = rand() < 0.5 ? 'rgba(120,80,40,0.18)' : 'rgba(250,225,190,0.25)'
    g.lineWidth = 0.25
    const x = rand() * W
    const y = rand() * H
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 2 + rand() * 3, y + (rand() - 0.5) * 1.5)
    g.stroke()
  }
  // Mickey in sepia, turned a little to the right, mid-stride: the ears, the head, the face, the body, the shorts
  const ink = COL.sepia
  const tan = '#e8c48f'
  const dark = '#3d2414'
  blob(g, 40, 42, 15, dark)
  blob(g, 86, 36, 15, dark)
  blob(g, 62, 66, 25, dark)
  // the face: a pale mask in two lobes over the eyes and round the muzzle, pushed right
  g.fillStyle = tan
  g.beginPath()
  g.ellipse(64, 72, 19, 16, 0, 0, Math.PI * 2)
  g.ellipse(58, 60, 7, 10, -0.2, 0, Math.PI * 2)
  g.ellipse(72, 59, 7, 10, 0.2, 0, Math.PI * 2)
  g.fill()
  ellipse(g, 78, 75, 10, 7, 0.1, tan)
  // eyes (tall ovals, a pie cut of light), the nose, the smile, a cheek
  for (const x of [60, 71]) {
    ellipse(g, x, 61, 2.4, 5.2, 0, dark)
    ellipse(g, x + 0.6, 62.5, 0.8, 1.8, 0, tan)
  }
  ellipse(g, 84, 70, 4.6, 3.2, 0.1, dark)
  g.strokeStyle = dark
  g.lineWidth = 1.3
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(66, 78)
  g.quadraticCurveTo(76, 88, 88, 76)
  g.stroke()
  ellipse(g, 76, 83, 5, 2.6, 0.1, '#a3452f')
  // the body: the dark torso, the shorts (two pale buttons), the arms with their gloves, the legs, the shoes
  blob(g, 58, 112, 17, dark)
  g.fillStyle = ink
  g.beginPath()
  g.ellipse(58, 124, 19, 12, 0, 0, Math.PI * 2)
  g.fill()
  ellipse(g, 52, 121, 2, 3, 0, tan)
  ellipse(g, 64, 121, 2, 3, 0, tan)
  g.strokeStyle = dark
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(44, 106)
  g.quadraticCurveTo(28, 116, 26, 128)
  g.moveTo(72, 104)
  g.quadraticCurveTo(88, 98, 96, 88)
  g.moveTo(50, 134)
  g.quadraticCurveTo(44, 148, 38, 158)
  g.moveTo(66, 134)
  g.quadraticCurveTo(74, 148, 84, 156)
  g.stroke()
  for (const [x, y] of [[26, 131], [97, 85]]) {
    blob(g, x, y, 6, '#f4e6cc')
    g.strokeStyle = ink
    g.lineWidth = 0.6
    g.beginPath()
    g.arc(x, y, 6, 0, Math.PI * 2)
    g.stroke()
  }
  ellipse(g, 34, 161, 10, 5, -0.1, '#5a3218')
  ellipse(g, 89, 159, 10, 5, 0.15, '#5a3218')
  // the tail, a thin curl behind
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(40, 126)
  g.bezierCurveTo(20, 132, 22, 150, 10, 148)
  g.stroke()
}

// ---- the frame's photo: two sisters, a soft illustration
function framePhoto(g: G) {
  const F = K.frame
  const W = F.photo.w
  const H = F.photo.h
  const m = F.mat
  g.fillStyle = COL.mat
  g.fillRect(0, 0, W, H)
  g.save()
  g.beginPath()
  g.rect(m, m, W - 2 * m, H - 2 * m)
  g.clip()
  g.translate(m, m)
  const w = W - 2 * m
  const h = H - 2 * m
  // a warm studio backdrop, darker at the edges
  const bg = g.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, h * 0.75)
  bg.addColorStop(0, '#6b4a45')
  bg.addColorStop(1, '#2e2128')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  // the seat they're on: a soft dark-teal block low down
  g.fillStyle = '#2f4a4c'
  g.beginPath()
  g.roundRect(14, 98, w - 22, 44, 6)
  g.fill()
  const skin = '#f0c6a6'
  const hair = '#24171a'
  const dress = '#f6efe6'
  /** a girl seated: her hair falling behind, her face, a white dress, her arms, her legs down in front */
  const girl = (x: number, y: number, s: number, lean: number) => {
    g.save()
    g.translate(x, y)
    g.scale(s, s)
    g.rotate(lean)
    // hair, long, behind
    g.fillStyle = hair
    g.beginPath()
    g.ellipse(0, -2, 11, 13, 0, Math.PI, Math.PI * 2)
    g.lineTo(12, 22)
    g.quadraticCurveTo(0, 28, -12, 22)
    g.closePath()
    g.fill()
    // the legs, down over the seat's edge
    g.fillStyle = skin
    g.beginPath()
    g.roundRect(-7, 40, 5.5, 34, 2.5)
    g.roundRect(1.5, 40, 5.5, 34, 2.5)
    g.fill()
    ellipse(g, -4.5, 75, 3.6, 1.8, 0, '#e9e1d6')
    ellipse(g, 4.5, 75, 3.6, 1.8, 0, '#e9e1d6')
    // the dress: a fitted top flaring to the knee
    g.fillStyle = dress
    g.beginPath()
    g.moveTo(-8, 12)
    g.lineTo(8, 12)
    g.quadraticCurveTo(10, 26, 15, 46)
    g.lineTo(-15, 46)
    g.quadraticCurveTo(-10, 26, -8, 12)
    g.fill()
    // the arms, resting at her sides
    g.strokeStyle = skin
    g.lineWidth = 3.2
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(-8, 14)
    g.quadraticCurveTo(-12, 28, -9, 40)
    g.moveTo(8, 14)
    g.quadraticCurveTo(12, 28, 9, 40)
    g.stroke()
    // the neck and the face, the fringe, a blush, a smile
    g.fillStyle = skin
    g.fillRect(-2.2, 6, 4.4, 7)
    ellipse(g, 0, 0, 8, 9.5, 0, skin)
    g.fillStyle = hair
    g.beginPath()
    g.ellipse(0, -4, 9, 7, 0, Math.PI * 1.02, Math.PI * 1.98)
    g.fill()
    blob(g, -4.4, 3.4, 1.8, '#e79a8c', 0.6)
    blob(g, 4.4, 3.4, 1.8, '#e79a8c', 0.6)
    blob(g, -3, 0.5, 0.8, hair)
    blob(g, 3, 0.5, 0.8, hair)
    g.strokeStyle = '#9b4b45'
    g.lineWidth = 0.7
    g.beginPath()
    g.arc(0, 3.5, 2.2, 0.3, Math.PI - 0.3)
    g.stroke()
    g.restore()
  }
  girl(36, 52, 1, 0.05)
  girl(70, 64, 1.04, -0.04)
  // a warm wash over it all, as a print in lamplight
  g.globalAlpha = 0.12
  g.fillStyle = '#ffb46a'
  g.fillRect(0, 0, w, h)
  g.globalAlpha = 1
  g.restore()
}

// ---- the cocoa box
function flake(g: G, x: number, y: number, r: number) {
  g.strokeStyle = '#ffffff'
  g.lineWidth = r * 0.22
  g.lineCap = 'round'
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3
    g.beginPath()
    g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r)
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    g.stroke()
  }
}
function tealGround(g: G, w: number, h: number, seed: number) {
  const grad = g.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, COL.teal)
  grad.addColorStop(1, '#7ad3d1')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  const rand = rng(seed)
  for (let k = 0; k < Math.round((w * h) / 260); k++) {
    g.globalAlpha = 0.55 + rand() * 0.45
    flake(g, rand() * w, rand() * h, 1.6 + rand() * 2.2)
  }
  g.globalAlpha = 1
}
/** a red mug of cocoa, its steam, marshmallows peeking over */
function mug(g: G, x: number, y: number, s: number) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  ellipse(g, 0, 0, 22, 11, 0, '#ffffff')
  g.fillStyle = COL.red
  g.beginPath()
  g.roundRect(-11, -4, 18, 12, [1, 1, 5, 5])
  g.fill()
  g.strokeStyle = COL.red
  g.lineWidth = 2.2
  g.beginPath()
  g.arc(8, 2, 3.6, -Math.PI / 2, Math.PI / 2)
  g.stroke()
  ellipse(g, -2, -4, 9, 1.8, 0, '#7a3b21')
  for (const [mx, my] of [[-6, -5], [-1, -6], [3, -5]]) {
    g.fillStyle = '#fff6ec'
    g.fillRect(mx - 1.5, my - 1.5, 3, 3)
  }
  g.strokeStyle = '#ffffff'
  g.lineWidth = 0.9
  for (const sx of [-5, 1]) {
    g.beginPath()
    g.moveTo(sx, -8)
    g.bezierCurveTo(sx - 2, -10, sx + 2, -12, sx, -14)
    g.stroke()
  }
  g.restore()
}
/** the red banner across, its ends notched, its words in white */
function banner(g: G, x: number, y: number, w: number, h: number, small: string, big: string) {
  g.fillStyle = '#b81f2f'
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x - 4 : x + w + 4
    g.beginPath()
    g.moveTo(side < 0 ? x : x + w, y + 2)
    g.lineTo(ex, y + 2)
    g.lineTo(ex + side * -2, y + h / 2 + 1)
    g.lineTo(ex, y + h)
    g.lineTo(side < 0 ? x : x + w, y + h)
    g.fill()
  }
  g.fillStyle = COL.red
  g.fillRect(x, y, w, h)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.font = '700 3.4px "Nunito", sans-serif'
  g.fillText(small, x + w / 2, y + h * 0.38)
  g.font = '800 6.4px "Nunito", sans-serif'
  g.fillText(big, x + w / 2, y + h * 0.88)
  g.textAlign = 'left'
}
function boxFront(g: G) {
  const B = K.box
  const Wn = K.window
  tealGround(g, B.w, B.h, 5)
  mug(g, B.w / 2, 13, 0.95)
  banner(g, 9, 23.5, B.w - 18, 10.5, 'HOT COCOA', 'POLAR BEAR')
  // the white band of small print at the foot
  g.fillStyle = '#ffffff'
  g.fillRect(0, B.h - 18, B.w, 18)
  g.fillStyle = '#2f8f95'
  g.textAlign = 'center'
  g.font = '700 2.9px "Nunito", sans-serif'
  g.fillText('White and Milk Chocolate Confection', B.w / 2, B.h - 11)
  g.fillText('with Milk Chocolate Drops & Marshmallows', B.w / 2, B.h - 6.5)
  g.textAlign = 'left'
  // the window: a white edge round it, then cut clear (the material cuts the clear away)
  const x = (B.w - Wn.w) / 2
  const y = B.h - Wn.y - Wn.h
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.roundRect(x - 1.4, y - 1.4, Wn.w + 2.8, Wn.h + 2.8, Wn.r + 1.4)
  g.fill()
  g.save()
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.roundRect(x, y, Wn.w, Wn.h, Wn.r)
  g.fill()
  g.restore()
}
/** a polar bear's face, round and white */
function bear(g: G, x: number, y: number, r: number) {
  blob(g, x - r * 0.72, y - r * 0.7, r * 0.32, '#ffffff')
  blob(g, x + r * 0.72, y - r * 0.7, r * 0.32, '#ffffff')
  blob(g, x - r * 0.72, y - r * 0.7, r * 0.15, '#f2b9c0')
  blob(g, x + r * 0.72, y - r * 0.7, r * 0.15, '#f2b9c0')
  blob(g, x, y, r, '#ffffff')
  blob(g, x - r * 0.36, y - r * 0.1, r * 0.1, '#20343a')
  blob(g, x + r * 0.36, y - r * 0.1, r * 0.1, '#20343a')
  ellipse(g, x, y + r * 0.3, r * 0.34, r * 0.24, 0, '#f3ece2')
  ellipse(g, x, y + r * 0.22, r * 0.14, r * 0.1, 0, '#20343a')
  blob(g, x - r * 0.6, y + r * 0.25, r * 0.13, '#f4a7b2', 0.7)
  blob(g, x + r * 0.6, y + r * 0.25, r * 0.13, '#f4a7b2', 0.7)
}
function boxSide(g: G, seed: number, withBear: boolean) {
  const B = K.box
  tealGround(g, B.d, B.h, seed)
  if (withBear) {
    bear(g, B.d / 2, 52, 17)
    banner(g, 10, 80, B.d - 20, 10.5, 'HOT COCOA', 'POLAR BEAR')
  } else mug(g, B.d / 2, 40, 1.15)
  g.fillStyle = '#ffffff'
  g.fillRect(0, B.h - 18, B.d, 18)
}
function boxBack(g: G) {
  const B = K.box
  tealGround(g, B.w, B.h, 9)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.roundRect(8, 26, B.w - 16, 56, 5)
  g.fill()
  g.fillStyle = '#b81f2f'
  g.font = '800 5px "Nunito", sans-serif'
  g.textAlign = 'center'
  g.fillText('How to enjoy', B.w / 2, 36)
  g.fillStyle = '#2f8f95'
  g.font = '700 3.6px "Nunito", sans-serif'
  ;['1. Pop the bear in a mug', '2. Pour over hot milk', '3. Watch it melt, then stir!'].forEach((s, i) => g.fillText(s, B.w / 2, 49 + i * 10))
  g.textAlign = 'left'
  bear(g, B.w / 2, 100, 7)
}
function boxTop(g: G) {
  const B = K.box
  tealGround(g, B.w, B.d, 13)
  bear(g, B.w / 2, B.d / 2, 14)
}
function boxBottom(g: G) {
  g.fillStyle = '#e4ddcf'
  g.fillRect(0, 0, K.box.w, K.box.d)
}

const FONTS = [SCRIPT, BOLD, '800 10px "Nunito"']
export const art = {
  daughterFront: () => face(K.card.w, K.card.h, daughterFront, FONTS),
  daughterInside: () => face(K.card.w, K.card.h, (g) => cardInside(g, true)),
  daughterInsideLeft: () => face(K.card.w, K.card.h, (g) => cardInside(g, false)),
  daughterBack: () => face(K.card.w, K.card.h, daughterBack, FONTS),
  mickeyFront: () => face(K.card.w, K.card.h, mickeyFront),
  photo: () => face(K.frame.photo.w, K.frame.photo.h, framePhoto),
  box: () => ({
    // BoxGeometry's order: +x, -x, +y, -y, +z, -z
    right: face(K.box.d, K.box.h, (g) => boxSide(g, 2, true), FONTS),
    left: face(K.box.d, K.box.h, (g) => boxSide(g, 3, false), FONTS),
    top: face(K.box.w, K.box.d, boxTop),
    bottom: face(K.box.w, K.box.d, boxBottom),
    front: face(K.box.w, K.box.h, boxFront, FONTS),
    back: face(K.box.w, K.box.h, boxBack, FONTS),
  }),
}
