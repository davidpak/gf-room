import { CanvasTexture, SRGBColorSpace } from 'three'
import { dolphinCrop, dolphinVideo } from './dolphin'
import { screenOf, type CubeState, type Screen } from './state'

/**
 * What's on the TV (./state's screen), drawn into a canvas the screen's glass shows (its map and its glow): all our
 * own drawing, in the spirit of the thing, not its art.
 *
 *   off      the dark glass, a sheen on it
 *   video    the blue VIDEO 1 screen (the TV on, nothing coming in)
 *   boot     a cube tumbling in and settling, its name spelled out under it, a fade
 *   title    SUPER SMASH BROS. Melee over the round emblem, glowing; PRESS START
 *   vs       VS. MODE: P1 Rina, P2 David, READY TO FIGHT
 *   win      RINA WINS!, confetti
 *   cover    the console's own: the Disc Cover is open
 *   nodisc   the console's menu, no disc in it
 *   live     Dolphin's window, captured (./dolphin): real Melee, whenever the TV and the console are on
 *
 * Over it all the tube's scanlines and its darker corners; the TV coming on (the picture opening out from a line)
 * and going off (down to a line, then a dot).
 */
const W = 512
const H = 384
const PIXEL = "'Press Start 2P', 'Courier New', monospace" // (from Google Fonts, with the page's others)
const SANS = "'Arial Black', 'Arial', sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"

let fontAsked = false
/** the pixel font asked for (a canvas doesn't ask for it by itself) */
function askFont() {
  if (fontAsked || typeof document === 'undefined') return
  fontAsked = true
  void document.fonts.load(`16px 'Press Start 2P'`).catch(() => {})
}

/** the tube's scanlines and dark corners, once */
function tube() {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(0,0,0,0.16)'
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1)
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
  return c
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
function centered(g: CanvasRenderingContext2D, text: string, y: number, font: string, fill: string | CanvasGradient, stroke?: string, lw = 0) {
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if (stroke) {
    g.lineJoin = 'round'
    g.strokeStyle = stroke
    g.lineWidth = lw
    g.strokeText(text, W / 2, y)
  }
  g.fillStyle = fill
  g.fillText(text, W / 2, y)
}
const blink = (t: number) => t % 1 < 0.62

/** a cube seen from a corner (its top, its two sides), size s, turned by a */
function cube(g: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, line = false) {
  g.save()
  g.translate(x, y)
  g.rotate(a)
  const h = s * 0.5
  const top = [
    [0, -s],
    [s * 0.87, -h],
    [0, 0],
    [-s * 0.87, -h],
  ]
  const left = [
    [-s * 0.87, -h],
    [0, 0],
    [0, s],
    [-s * 0.87, h],
  ]
  const right = [
    [s * 0.87, -h],
    [0, 0],
    [0, s],
    [s * 0.87, h],
  ]
  for (const [pts, col] of [
    [top, '#9a8ff0'],
    [left, '#5a4fb4'],
    [right, '#3f3790'],
  ] as const) {
    g.beginPath()
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)))
    g.closePath()
    if (line) {
      g.strokeStyle = '#cfc8ff'
      g.lineWidth = 2
      g.stroke()
    } else {
      g.fillStyle = col
      g.fill()
    }
  }
  g.restore()
}

/** the round emblem: a disc cut in four by a cross set off its middle */
function emblem(g: CanvasRenderingContext2D, x: number, y: number, r: number, glow: number) {
  g.save()
  g.shadowColor = `rgba(120,170,255,${0.5 + 0.4 * glow})`
  g.shadowBlur = 18 + 14 * glow
  const f = g.createLinearGradient(x - r, y - r, x + r, y + r)
  f.addColorStop(0, '#f4f6fb')
  f.addColorStop(1, '#8e95ad')
  g.fillStyle = f
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  g.restore()
  g.save()
  g.beginPath()
  g.arc(x, y, r + 1, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = '#0b1538'
  g.fillRect(x + r * 0.2 - r * 0.08, y - r - 2, r * 0.16, 2 * r + 4)
  g.fillRect(x - r - 2, y + r * 0.22 - r * 0.08, 2 * r + 4, r * 0.16)
  g.restore()
}

function draw(g: CanvasRenderingContext2D, sc: Screen, t: number, c: CubeState) {
  if (sc === 'video') {
    g.fillStyle = '#2b48c4'
    g.fillRect(0, 0, W, H)
    g.font = `20px ${PIXEL}`
    g.textAlign = 'left'
    g.textBaseline = 'top'
    g.fillStyle = '#103010'
    g.fillText('VIDEO 1', 30, 30)
    g.fillStyle = '#7dff86'
    g.fillText('VIDEO 1', 28, 28)
    return
  }
  if (sc === 'boot') {
    const b = t - c.at
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    const bg = g.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H / 2, W * 0.7)
    bg.addColorStop(0, '#231c66')
    bg.addColorStop(1, '#06041a')
    g.globalAlpha = ease(b / 0.6)
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    // the cube rolling in from the left, settling with a bounce
    const r = ease(b / 1.4)
    const x = -60 + (W / 2 + 60) * r
    const bounce = b > 1.4 && b < 2.4 ? Math.abs(Math.sin((b - 1.4) * Math.PI * 2)) * 14 * (2.4 - b) : 0
    cube(g, x, 168 - bounce, 34 + 10 * r, (1 - r) * -Math.PI * 3)
    // its name, a letter at a time
    const word = 'GAMECUBE'
    g.font = `bold 34px ${SANS}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (let i = 0; i < word.length; i++) {
      const a = ease((b - 2.2 - i * 0.09) / 0.25)
      if (a <= 0) continue
      g.globalAlpha = a
      g.fillStyle = '#ebe8ff'
      g.fillText(word[i], W / 2 + (i - (word.length - 1) / 2) * 34, 268 + (1 - a) * 10)
    }
    g.globalAlpha = 1
    const out = ease((b - 4.4) / 0.7)
    if (out > 0) {
      g.fillStyle = `rgba(0,0,0,${out})`
      g.fillRect(0, 0, W, H)
    }
    return
  }
  if (sc === 'title') {
    const s = c.scene === 'boot' ? t - c.at - 5.2 : t - c.at
    const bg = g.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, W * 0.75)
    bg.addColorStop(0, '#1b2f78')
    bg.addColorStop(1, '#02040f')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    emblem(g, W / 2, 140, 88, 0.5 + 0.5 * Math.sin(s * 2.2))
    centered(g, 'SUPER SMASH BROS.', 262, `bold 40px ${SERIF}`, '#ffffff', '#7a0e14', 8)
    const m = g.createLinearGradient(0, 290, 0, 330)
    m.addColorStop(0, '#ffffff')
    m.addColorStop(1, '#8fb0ff')
    centered(g, 'Melee', 312, `italic 900 44px ${SANS}`, m, '#101a40', 7)
    if (blink(s)) centered(g, 'PRESS START', 360, `16px ${PIXEL}`, '#ffffff')
    const fade = 1 - ease(s / 0.8)
    if (fade > 0) {
      g.fillStyle = `rgba(0,0,0,${fade})`
      g.fillRect(0, 0, W, H)
    }
    return
  }
  if (sc === 'vs') {
    const s = t - c.at
    const bg = g.createLinearGradient(0, 0, W, 0)
    bg.addColorStop(0, '#4a0f1c')
    bg.addColorStop(0.5, '#1c1030')
    bg.addColorStop(1, '#0f2350')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.font = `16px ${PIXEL}`
    g.textAlign = 'left'
    g.textBaseline = 'top'
    g.fillStyle = '#ffd34d'
    g.fillText('VS. MODE', 22, 18)
    for (const [i, name, col, edge] of [
      [0, 'RINA', '#e84a5f', '#ff9aa8'],
      [1, 'DAVID', '#3d6fe0', '#9ab8ff'],
    ] as const) {
      const x = 36 + i * 236
      const y = 64 + ease(s / 0.3) * 0
      g.fillStyle = col
      g.strokeStyle = edge
      g.lineWidth = 5
      g.beginPath()
      g.roundRect(x, y, 204, 168, 16)
      g.fill()
      g.stroke()
      g.font = `16px ${PIXEL}`
      g.fillStyle = '#ffffff'
      g.textAlign = 'left'
      g.fillText(`P${i + 1}`, x + 14, y + 12)
      g.font = `bold 38px ${SANS}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(name, x + 102, y + 96)
      g.textBaseline = 'top'
      if (i === 0) {
        // (a heart by her name)
        g.fillStyle = '#ffd0d8'
        g.font = `28px ${SANS}`
        g.fillText('♥', x + 178, y + 8)
      }
    }
    centered(g, 'VS', 148, `italic 900 30px ${SANS}`, '#ffffff', '#000000', 5)
    // READY TO FIGHT, on its slanted bar
    g.save()
    g.translate(W / 2, 286)
    g.transform(1, 0, -0.25, 1, 0, 0)
    const bar = g.createLinearGradient(-240, 0, 240, 0)
    bar.addColorStop(0, '#ff7a1a')
    bar.addColorStop(1, '#ffd23a')
    g.fillStyle = bar
    g.fillRect(-230, -26, 460, 52)
    g.restore()
    centered(g, 'READY TO FIGHT!', 286, `italic 900 30px ${SANS}`, '#ffffff', '#7a2a00', 6)
    if (blink(s)) centered(g, 'PRESS START', 352, `14px ${PIXEL}`, '#ffffff')
    return
  }
  if (sc === 'win') {
    const s = t - c.at
    const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.7)
    bg.addColorStop(0, '#ffc95a')
    bg.addColorStop(1, '#d9447a')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    // confetti
    for (let i = 0; i < 70; i++) {
      const a = (i * 97.13) % 1
      const b = (i * 57.71) % 1
      const x = (a * W + Math.sin(s * 2 + i) * 14 + W) % W
      const y = ((b * H + s * (60 + 50 * a)) % (H + 20)) - 10
      g.save()
      g.translate(x, y)
      g.rotate(s * 3 + i)
      g.fillStyle = ['#ffffff', '#6fd0ff', '#ff5d7a', '#7b74e0', '#36a872', '#ffd23a'][i % 6]
      g.fillRect(-4, -2, 8, 4)
      g.restore()
    }
    const pop = 1 + 0.25 * (1 - ease(s / 0.35))
    g.save()
    g.translate(W / 2, 168)
    g.scale(pop, pop)
    g.translate(-W / 2, -168)
    centered(g, 'RINA WINS!', 168, `900 58px ${SANS}`, '#ffffff', '#d23b6c', 10)
    g.restore()
    centered(g, '♥', 236, `40px ${SANS}`, '#ffffff', '#d23b6c', 6)
    if (blink(s)) centered(g, 'PRESS START', 340, `14px ${PIXEL}`, '#7a2a40')
    return
  }
  if (sc === 'cover') {
    g.fillStyle = '#1d1a52'
    g.fillRect(0, 0, W, H)
    centered(g, 'The Disc Cover is open.', 150, `bold 24px Arial, sans-serif`, '#ffffff')
    centered(g, 'If you want to continue the game,', 200, `20px Arial, sans-serif`, '#d8d6ff')
    centered(g, 'please close the Disc Cover.', 228, `20px Arial, sans-serif`, '#d8d6ff')
    return
  }
  if (sc === 'nodisc') {
    const s = t - c.at
    g.fillStyle = '#2c226f'
    g.fillRect(0, 0, W, H)
    // a floor of lines going off
    g.strokeStyle = 'rgba(190,180,255,0.25)'
    g.lineWidth = 1
    for (let i = -8; i <= 8; i++) {
      g.beginPath()
      g.moveTo(W / 2 + i * 14, 230)
      g.lineTo(W / 2 + i * 70, H)
      g.stroke()
    }
    for (let j = 0; j < 7; j++) {
      const y = 230 + Math.pow(j / 6, 1.8) * (H - 230) + ((s * 12) % 10) * (j / 6)
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(W, y)
      g.stroke()
    }
    cube(g, W / 2, 130, 34, Math.sin(s) * 0.3, true)
    centered(g, 'No Disc', 216, `bold 26px Arial, sans-serif`, '#ffffff')
    centered(g, 'Please insert a Game Disc.', 250, `16px Arial, sans-serif`, '#d8d6ff')
  }
}

/** a frame of Dolphin's window: the game's picture in it (./dolphin finds it inside Dolphin's black bars and under the
 *  window's title bar) filling the bezel's opening edge to edge; a
 *  picture far from 4:3 (widescreen) cropped to it rather than squashed */
function frame(g: CanvasRenderingContext2D, v: HTMLVideoElement) {
  const c = dolphinCrop(v)
  if (!c) return
  let { x, y, w, h } = c
  const aspect = w / h
  const want = W / H
  if (aspect > want * 1.12) {
    const nw = h * want
    x += (w - nw) / 2
    w = nw
  } else if (aspect < want / 1.12) {
    const nh = w / want
    y += (h - nh) / 2
    h = nh
  }
  g.drawImage(v, x, y, w, h, 0, 0, W, H)
}

/** the screen: its canvas, its texture, and \`update\` (each frame: true when it's been drawn again) */
export function makeScreen() {
  askFont()
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const texture = new CanvasTexture(c)
  texture.colorSpace = SRGBColorSpace
  const scan = tube()
  let last = ''
  let lastAt = -1
  /** how often each screen needs drawing again (per second: 0 once) */
  const RATE: Record<Screen, number> = { off: 0, video: 0, boot: 30, title: 12, vs: 4, win: 20, cover: 0, nodisc: 12 }
  function update(st: CubeState) {
    const t = performance.now() / 1000
    const sc = screenOf(st, t)
    const sinceTv = t - st.tvAt
    const warming = (st.tv && sinceTv < 0.4) || (!st.tv && sinceTv < 0.35)
    const v = dolphinVideo()
    const live = !!v && st.tv && st.power
    const key = `${sc}|${st.scene}|${st.at}|${st.tv}|${st.tvAt}|${warming}|${live}`
    const rate = live ? 60 : warming ? 30 : RATE[sc]
    if (key === last && (rate === 0 || t - lastAt < 1 / rate)) return false
    last = key
    lastAt = t
    // the glass, off (or behind the picture going on or off)
    g.fillStyle = '#20272a'
    g.fillRect(0, 0, W, H)
    if (sc === 'off' && !warming) {
      const sheen = g.createLinearGradient(0, 0, W * 0.7, H)
      sheen.addColorStop(0, 'rgba(255,255,255,0.12)')
      sheen.addColorStop(0.45, 'rgba(255,255,255,0.02)')
      sheen.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = sheen
      g.fillRect(0, 0, W, H)
    } else if (st.tv) {
      if (live && v) frame(g, v)
      else draw(g, sc, t, st)
      g.drawImage(scan, 0, 0)
      if (sinceTv < 0.4) {
        // coming on: the picture opening out from a bright line
        const open = ease(sinceTv / 0.4)
        const band = Math.max(2, H * open)
        g.fillStyle = '#000'
        g.fillRect(0, 0, W, (H - band) / 2)
        g.fillRect(0, (H + band) / 2, W, (H - band) / 2)
        g.fillStyle = `rgba(255,255,255,${0.9 * (1 - open)})`
        g.fillRect(0, (H - band) / 2, W, band)
      }
    } else {
      // going off: down to a line, then a dot
      const a = sinceTv / 0.35
      const tall = Math.max(2, H * 0.6 * (1 - ease(a / 0.45)))
      const wide = a < 0.45 ? W : Math.max(3, W * (1 - ease((a - 0.45) / 0.55)))
      g.fillStyle = `rgba(240,245,255,${a < 0.45 ? 0.95 : 0.95 * (1 - ease((a - 0.75) / 0.25))})`
      g.fillRect((W - wide) / 2, (H - tall) / 2, wide, tall)
    }
    texture.needsUpdate = true
    return true
  }
  return { texture, update, canvas: c }
}
