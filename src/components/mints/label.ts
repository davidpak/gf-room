import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * The Ice Breakers spearmint puck's printed parts, drawn: the round label (a green faceted gem
 * background, the mint and leaf, ICE BREAKERS MINTS spearmint, the small print round the edge), the
 * flip tabs' "one" / "many", and the mints' speckles. Toy-simplified from David's photo, same layout.
 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** text round an arc (centre cx, cy; radius r; centred on angle a, reading clockwise when `cw`) */
function arcText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, a: number, cw: boolean) {
  const widths = [...text].map((ch) => g.measureText(ch).width)
  const total = widths.reduce((s, w) => s + w, 0)
  let t = a - ((cw ? 1 : -1) * total) / r / 2
  for (let i = 0; i < text.length; i++) {
    const w = widths[i]
    const mid = t + ((cw ? 1 : -1) * w) / r / 2
    g.save()
    g.translate(cx + Math.cos(mid) * r, cy + Math.sin(mid) * r)
    g.rotate(mid + (cw ? Math.PI / 2 : -Math.PI / 2))
    g.fillText(text[i], -w / 2, 0)
    g.restore()
    t += ((cw ? 1 : -1) * w) / r
  }
}

/** the round label, 1024 across (its edge the label's rim) */
export function labelTexture() {
  const N = 1024
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const R = N / 2
  const rand = rng(7)
  g.save()
  g.beginPath()
  g.arc(R, R, R, 0, Math.PI * 2)
  g.clip()
  // the faceted green gem: triangles fanning from a few centres, in greens, with pale glints
  g.fillStyle = '#1d7a45'
  g.fillRect(0, 0, N, N)
  const greens = ['#146a3b', '#1f8a4e', '#2c9c5c', '#3fae6c', '#0f5a33', '#57bf7e', '#238d52']
  for (let k = 0; k < 150; k++) {
    const cx = R + (rand() - 0.5) * N * 0.9
    const cy = R + (rand() - 0.5) * N * 0.9
    const s = 80 + rand() * 220
    const a = rand() * Math.PI * 2
    g.fillStyle = greens[Math.floor(rand() * greens.length)]
    g.globalAlpha = 0.55 + rand() * 0.45
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s)
    g.lineTo(cx + Math.cos(a + 0.5 + rand()) * s * 0.8, cy + Math.sin(a + 0.5 + rand()) * s * 0.8)
    g.closePath()
    g.fill()
  }
  for (let k = 0; k < 18; k++) {
    const cx = rand() * N
    const cy = rand() * N
    const s = 60 + rand() * 140
    const a = rand() * Math.PI * 2
    g.fillStyle = '#c9f5d6'
    g.globalAlpha = 0.18 + rand() * 0.22
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s)
    g.lineTo(cx + Math.cos(a + 0.35) * s * 0.7, cy + Math.sin(a + 0.35) * s * 0.7)
    g.closePath()
    g.fill()
  }
  g.globalAlpha = 1
  // the mint and its leaves, upper middle
  const mx = 420
  const my = 300
  g.fillStyle = '#f7f7f1'
  g.beginPath()
  g.ellipse(mx, my, 92, 80, -0.25, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#e1e6de'
  g.beginPath()
  g.ellipse(mx + 8, my + 10, 80, 64, -0.25, 0, Math.PI * 2)
  g.fill()
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * 78
    g.fillStyle = ['#2f8f55', '#5dbb7c', '#9ad9ad'][k % 3]
    g.fillRect(mx + Math.cos(a) * d, my + Math.sin(a) * d * 0.85, 3 + rand() * 6, 3 + rand() * 5)
  }
  const leaf = (x: number, y: number, rot: number, s: number, col: string) => {
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, 0)
    g.quadraticCurveTo(s * 0.55, -s * 0.45, s, 0)
    g.quadraticCurveTo(s * 0.55, s * 0.45, 0, 0)
    g.fill()
    g.strokeStyle = 'rgba(20, 70, 30, 0.6)'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(4, 0)
    g.lineTo(s * 0.9, 0)
    g.stroke()
    g.restore()
  }
  leaf(560, 330, -0.9, 150, '#5cbf4f')
  leaf(560, 330, -0.1, 130, '#78d25e')
  // small print, top
  g.fillStyle = '#ffffff'
  g.font = 'bold 38px "Arial Narrow", Arial, sans-serif'
  arcText(g, 'SUGAR FREE MINTS', R, R, R - 150, -2.35, true)
  arcText(g, 'with COOLING CRYSTALS', R, R, R - 150, -0.72, true)
  g.font = 'bold 24px Arial, sans-serif'
  g.fillText('ENLARGED', 250, 400)
  g.fillText('FOR DETAIL', 244, 426)
  // ICE BREAKERS: chunky white letters with a deep green outline, leaning a touch
  const word = (text: string, y: number, size: number, fill: string, line: string, lw: number, skew = -0.12) => {
    g.save()
    g.translate(R, y)
    g.transform(1, 0, skew, 1, 0, 0)
    g.font = `900 ${size}px Impact, "Arial Black", "Helvetica Neue", sans-serif`
    const w = g.measureText(text).width
    const k = Math.min(1, (N * 0.86) / w)
    g.scale(k, 1)
    g.lineJoin = 'round'
    g.lineWidth = lw
    g.strokeStyle = line
    g.strokeText(text, -w / 2, 0)
    g.fillStyle = fill
    g.fillText(text, -w / 2, 0)
    g.restore()
  }
  word('ICE BREAKERS', 590, 168, '#ffffff', '#0b2e1b', 22)
  word('MINTS', 700, 112, '#6fd08a', '#0b2e1b', 16, -0.08)
  g.font = 'bold 86px "Trebuchet MS", Arial, sans-serif'
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.fillText('spearmint', R + 90, 800)
  g.textAlign = 'left'
  // small print round the edges
  g.font = 'bold 30px "Arial Narrow", Arial, sans-serif'
  arcText(g, 'NET WT 1.5 OZ (42 g)', R, R, R - 44, Math.PI * 0.86, false)
  arcText(g, 'NATURAL & ARTIFICIAL FLAVOR', R, R, R - 44, Math.PI * 0.16, false)
  g.restore()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** a tab's word ("one", "many"), dark green on white, for a small decal */
export function tabText(word: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#1f6b3f'
  g.font = 'bold 76px "Trebuchet MS", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(word, 128, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** the mints' speckles (the cooling crystals): green flecks on white, tiled every `tile` mm */
export function speckTexture(tile: number) {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const rand = rng(3)
  g.fillStyle = '#f7f7f2'
  g.fillRect(0, 0, N, N)
  const cols = ['#2f8f55', '#4aa86a', '#6cc58a', '#a3dcb5']
  for (let k = 0; k < 150; k++) {
    g.fillStyle = cols[Math.floor(rand() * cols.length)]
    g.globalAlpha = 0.7 + rand() * 0.3
    const x = rand() * N
    const y = rand() * N
    const w = 3 + rand() * 9
    const h = 2 + rand() * 6
    g.save()
    g.translate(x, y)
    g.rotate(rand() * Math.PI)
    g.fillRect(-w / 2, -h / 2, w, h)
    g.restore()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(1 / tile, 1 / tile) // (the mints' UVs are in mm)
  return t
}
