import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import { LEAD_IN, sizeOf, type Pressing, type Side } from './vinyl'

/**
 * What's printed and pressed: a side of a record (its grooves, the songs as bands with the wide-cut gaps between,
 * the smooth run-out, the paper label in a colour taken from the cover, printed with the album and that side's
 * songs), the jacket's back (the songs by side), and a cover drawn for the albums that come without one.
 */
const FONT = "'Gaegu', 'Nunito', cursive"
const SERIF = "Georgia, 'Times New Roman', serif"

export function loadCover(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const im = new Image()
    im.crossOrigin = 'anonymous' // (Spotify's covers say anyone may: they can be drawn and textured)
    im.onload = () => resolve(im)
    im.onerror = () => resolve(null)
    im.src = url
  })
}

export type Inks = { label: string; ink: string; spine: string }
/** the label's colour: the cover's most colourful common colour; its ink black or cream, whichever reads */
export function inksOf(im: HTMLImageElement | HTMLCanvasElement | null): Inks {
  if (!im) return { label: '#f2d7c9', ink: '#2b2538', spine: '#2b2538' }
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(im, 0, 0, 16, 16)
  const d = g.getImageData(0, 0, 16, 16).data
  let best = { s: -1, r: 0, g: 0, b: 0 }
  let ar = 0
  let ag = 0
  let ab = 0
  for (let i = 0; i < d.length; i += 4) {
    const [r, gg, b] = [d[i], d[i + 1], d[i + 2]]
    ar += r
    ag += gg
    ab += b
    const mx = Math.max(r, gg, b)
    const mn = Math.min(r, gg, b)
    const sat = mx ? (mx - mn) / mx : 0
    const score = sat * (0.4 + mx / 255) // (colourful, and not too dark)
    if (score > best.s) best = { s: score, r, g: gg, b }
  }
  const n = d.length / 4
  const hex = (r: number, g2: number, b: number) => '#' + [r, g2, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  // (a grey cover: its average, lightened, for a quiet label)
  const pick = best.s > 0.25 ? best : { r: ar / n + (255 - ar / n) * 0.35, g: ag / n + (255 - ag / n) * 0.35, b: ab / n + (255 - ab / n) * 0.35 }
  const lum = 0.2126 * pick.r + 0.7152 * pick.g + 0.0722 * pick.b
  return { label: hex(pick.r, pick.g, pick.b), ink: lum > 140 ? '#1d1a24' : '#fbf3e6', spine: hex(ar / n, ag / n, ab / n) }
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** wrap text to a width; at most `max` lines (the last one cut with …) */
function lines(g: CanvasRenderingContext2D, text: string, w: number, max: number) {
  const words = text.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const word of words) {
    const t = cur ? cur + ' ' + word : word
    if (g.measureText(t).width <= w || !cur) cur = t
    else {
      out.push(cur)
      cur = word
    }
  }
  if (cur) out.push(cur)
  if (out.length > max) {
    out.length = max
    let last = out[max - 1]
    while (last && g.measureText(last + '…').width > w) last = last.slice(0, -1)
    out[max - 1] = last + '…'
  }
  return out
}

/**
 * One face of a disc (its alpha: 255 where it's grooved, less where it's smooth), square, the disc filling it (uv 0..1 across its diameter). The grooves are worked out a pixel
 * at a time from a profile in radius (0.05 mm a step): fine rings of slightly different black where there's music,
 * louder and quieter stretches, smooth wide bands for the gaps, the smooth run-out, a lighter raised edge.
 */
export function drawSide(p: Pressing, side: Side, inks: Inks, size = 2048): Texture {
  const S = sizeOf(p)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const px = size / (2 * S.r) // px per mm
  // the profile: lightness by radius
  const STEP = 0.05
  const N = Math.ceil(S.r / STEP) + 1
  const prof = new Float32Array(N)
  const cut = new Uint8Array(N) // (grooved here: the sheen (./Record) is only on grooves; carried in the alpha)
  const grooved = (r: number) => side.bands.some((b) => r <= b.r0 && r >= b.r1)
  for (let i = 0; i < N; i++) {
    const r = i * STEP
    let v: number
    if (r > S.r - 1.2) v = 0.16 + 0.05 * Math.sin(((r - (S.r - 1.2)) / 1.2) * Math.PI) // (the edge's bead)
    else if (r > side.bands[0]?.r0 + LEAD_IN || !side.bands.length) v = 0.1 // (smooth: outside the lead-in, or a blank side)
    else if (grooved(r)) {
      const ring = hash(Math.floor(r / 0.15)) // (each fine ring a touch different)
      const loud = hash(Math.floor(r / 1.7) + 999) // (stretches of louder, wider-swinging groove)
      v = 0.05 + ring * 0.03 + loud * 0.025
      cut[i] = 1
    } else if (r > side.end) v = 0.135 // (between songs, or the lead-in: wide, smooth, it catches the light)
    else v = 0.095 // (the run-out)
    prof[i] = v
  }
  const img = g.createImageData(size, size)
  const d = img.data
  const h = size / 2
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - h, y + 0.5 - h) / px
      const k = Math.min(N - 1, Math.round(r / STEP))
      const v = prof[k] * 255
      const o = (y * size + x) * 4
      d[o] = v
      d[o + 1] = v
      d[o + 2] = v * 1.04
      d[o + 3] = cut[k] ? 255 : 150
    }
  g.putImageData(img, 0, 0)
  // the run-out's lock groove and the matrix number scratched in it
  g.strokeStyle = 'rgba(255,255,255,0.12)'
  g.lineWidth = Math.max(1, 0.15 * px)
  const lock = (S.label + 3) * px
  g.beginPath()
  g.arc(h, h, lock, 0, Math.PI * 2)
  g.stroke()
  g.save()
  g.translate(h, h)
  g.fillStyle = 'rgba(255,255,255,0.16)'
  g.font = `${2.4 * px}px ${SERIF}`
  g.textAlign = 'center'
  const matrix = `RINA-${p.uri.slice(-5).toUpperCase()}-${side.letter}1`
  ;[...matrix].forEach((ch, i) => {
    g.save()
    g.rotate(Math.PI * 0.6 + (i - matrix.length / 2) * 0.045)
    g.fillText(ch, 0, (S.label + 6.5) * px)
    g.restore()
  })
  g.restore()
  // the label
  const lr = S.label * px
  g.fillStyle = inks.label
  g.beginPath()
  g.arc(h, h, lr, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.18)'
  g.lineWidth = 0.4 * px
  g.beginPath()
  g.arc(h, h, lr - 2.2 * px, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = inks.ink
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const u = lr / 50 // (px per mm of a 50 mm label: laid out for the 12", scaled to the 7")
  g.font = `700 ${7.5 * u * 0.5}px ${FONT}`
  lines(g, p.artist.toUpperCase(), 62 * u * 0.5, 1).forEach((l) => g.fillText(l, h, h - 30 * u * 0.5))
  g.font = `700 ${9 * u * 0.5}px ${FONT}`
  lines(g, p.title, 70 * u * 0.5, 2).forEach((l, i, a) => g.fillText(l, h, h - (17 - i * 9 + (a.length - 1) * 4.5) * u * 0.5))
  // the side's big letter, and the speed
  g.font = `700 ${14 * u * 0.5}px ${FONT}`
  g.fillText(side.letter, h - 34 * u * 0.5, h + 2 * u * 0.5)
  g.font = `700 ${5.5 * u * 0.5}px ${FONT}`
  g.fillText(p.size === 'lp' ? '33⅓' : '45', h + 34 * u * 0.5, h - 1 * u * 0.5)
  g.fillText('RPM', h + 34 * u * 0.5, h + 5 * u * 0.5)
  // the side's songs
  g.font = `400 ${4.6 * u * 0.5}px ${FONT}`
  const songs = side.bands.length ? side.bands : []
  const shown = songs.slice(0, 7)
  shown.forEach((b, i) => {
    const t = `${i + 1}. ${b.name}`
    const l = lines(g, t, 66 * u * 0.5, 1)[0]
    g.fillText(`${l}  ${mmss(b.ms)}`, h, h + (16 + i * 5.6) * u * 0.5)
  })
  if (songs.length > shown.length) g.fillText(`+ ${songs.length - shown.length} more`, h, h + (16 + shown.length * 5.6) * u * 0.5)
  // the hole
  g.fillStyle = '#000'
  g.beginPath()
  g.arc(h, h, S.hole * px, 0, Math.PI * 2)
  g.fill()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** the jacket's back: the album, its songs by side with their times, on the label's colour */
export function drawBack(p: Pressing, inks: Inks, size = 1024): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#f6efe3'
  g.fillRect(0, 0, size, size)
  g.fillStyle = inks.label
  g.fillRect(0, 0, size, size * 0.2)
  g.fillStyle = inks.ink
  g.textBaseline = 'middle'
  g.font = `700 ${size * 0.06}px ${FONT}`
  g.fillText(lines(g, p.title, size * 0.88, 1)[0], size * 0.06, size * 0.08)
  g.font = `400 ${size * 0.04}px ${FONT}`
  g.fillText(lines(g, `${p.artist}${p.year ? ' · ' + p.year.slice(0, 4) : ''}`, size * 0.88, 1)[0], size * 0.06, size * 0.15)
  g.fillStyle = '#2b2538'
  const cols = p.sides.filter((s) => s.bands.length)
  const colW = size * 0.88 / Math.min(2, cols.length || 1)
  const rows = Math.max(...cols.map((s) => s.bands.length + 2), 1)
  const fs = Math.min(size * 0.034, (size * 0.72) / (Math.ceil(cols.length / 2) * rows) / 1.25)
  cols.forEach((s, k) => {
    const x = size * 0.06 + (k % 2) * colW
    let y = size * 0.27 + Math.floor(k / 2) * rows * fs * 1.25
    g.font = `700 ${fs * 1.1}px ${FONT}`
    g.fillText(`SIDE ${s.letter}`, x, y)
    y += fs * 1.4
    g.font = `400 ${fs}px ${FONT}`
    s.bands.forEach((b, i) => {
      g.fillText(lines(g, `${i + 1}. ${b.name}`, colW - fs * 4.5, 1)[0], x, y)
      g.textAlign = 'right'
      g.fillText(mmss(b.ms), x + colW - fs, y)
      g.textAlign = 'left'
      y += fs * 1.25
    })
  })
  g.font = `400 ${size * 0.022}px ${FONT}`
  g.fillStyle = 'rgba(43,37,56,0.6)'
  g.fillText(`${p.size === 'lp' ? `${p.sides.length / 2 > 1 ? `${p.sides.length / 2} × ` : ''}12" LP · 33⅓ RPM` : '7" single · 45 RPM'} · pressed for Rina`, size * 0.06, size * 0.95)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** a cover for an album that hasn't one (or before it's loaded): its colours from its name, its title on it */
export function drawCover(title: string, artist: string, size = 640) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  let s = 0
  for (const ch of title + artist) s = (s * 31 + ch.charCodeAt(0)) >>> 0
  const hue = s % 360
  const grad = g.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, `hsl(${hue}, 60%, 72%)`)
  grad.addColorStop(1, `hsl(${(hue + 50) % 360}, 55%, 52%)`)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  g.fillStyle = `hsla(${(hue + 180) % 360}, 70%, 85%, 0.55)`
  g.beginPath()
  g.arc(size * 0.68, size * 0.4, size * 0.24, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fff8ef'
  g.font = `700 ${size * 0.1}px ${FONT}`
  g.textBaseline = 'alphabetic'
  lines(g, title, size * 0.84, 2).forEach((l, i) => g.fillText(l, size * 0.08, size * (0.8 + i * 0.1) - (title.length > 16 ? size * 0.1 : 0)))
  g.font = `400 ${size * 0.06}px ${FONT}`
  g.fillText(artist, size * 0.08, size * 0.92)
  return c
}
