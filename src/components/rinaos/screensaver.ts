/**
 * RinaOS's screensaver, drawn on a 2D canvas (the same picture on the laptop's screen from across
 * the room, and in RinaOS itself after it's been left a while). Her room, quietly:
 *
 *   the sky     an evening wash, plum to rose, with soft glows drifting through it in her case's
 *               colours (mint, cream, pink)
 *   the lights  a string of fairy lights swagged across the top, like the ones round her window,
 *               each bulb twinkling on its own
 *   the time    large and light, the date under it
 *   a note      one of the notes from her wall at a time, in a handwritten hand, fading in and out
 *   motes       a few tiny hearts and sparkles rising slowly
 *
 * Everything is a function of the time `t` (s): no state, so any canvas can draw any moment.
 */
const NOTES = ['good morning, sleeping beauty', 'you rock!', 'thank you for being you', 'hey you! you are super awesome'] // (off the notes on her wall)
const HAND = "'Gaegu', 'Nunito', cursive"
const THIN = "'SF Pro Display', 'Segoe UI Variable Display', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

/** a repeatable random per index */
const rnd = (i: number, k = 1) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function drawScreensaver(g: CanvasRenderingContext2D, W: number, H: number, t: number, now = new Date()) {
  const u = H / 800 // (drawn for 1280 × 800, scaled)
  // the sky
  const sky = g.createLinearGradient(0, 0, W * 0.25, H)
  sky.addColorStop(0, '#2b2045')
  sky.addColorStop(0.55, '#5b3a66')
  sky.addColorStop(1, '#b77590')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  const glows: [string, number, number, number, number][] = [
    ['rgba(169,226,211,0.30)', 0.2, 0.75, 0.45, 0.07],
    ['rgba(253,235,203,0.26)', 0.8, 0.35, 0.4, 0.05],
    ['rgba(246,178,190,0.34)', 0.55, 0.9, 0.5, 0.06],
  ]
  glows.forEach(([c, x, y, r, s], i) => {
    const cx = (x + Math.sin(t * s + i * 2) * 0.12) * W
    const cy = (y + Math.cos(t * s * 0.8 + i) * 0.08) * H
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r * W)
    rg.addColorStop(0, c)
    rg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = rg
    g.fillRect(0, 0, W, H)
  })

  // motes: tiny hearts and sparkles rising
  for (let i = 0; i < 16; i++) {
    const speed = 8 + rnd(i, 2) * 10
    const y = H + 20 - (((t * speed * u + rnd(i, 3) * H * 1.2) % (H + 40)))
    const x = rnd(i, 4) * W + Math.sin(t * 0.5 + i) * 14 * u
    const a = 0.16 + 0.18 * rnd(i, 5)
    g.globalAlpha = a * Math.min(1, (H - y) / (H * 0.25), y / (H * 0.3))
    g.fillStyle = i % 3 ? '#ffe9f1' : '#fff3d6'
    if (i % 4 === 0) heart(g, x, y, (5 + rnd(i, 6) * 4) * u)
    else sparkle(g, x, y, (2 + rnd(i, 7) * 2.5) * u)
  }
  g.globalAlpha = 1

  // the fairy lights: two swags across the top
  const pts: [number, number][] = []
  const N = 34
  for (let i = 0; i <= N; i++) {
    const s = i / N
    const half = s < 0.5 ? s * 2 : (s - 0.5) * 2 // (each swag, 0..1)
    const sag = Math.sin(half * Math.PI) * 58 * u
    pts.push([-20 * u + s * (W + 40 * u), 34 * u + sag + Math.sin(t * 0.6) * 2 * u])
  }
  g.strokeStyle = 'rgba(30,22,40,0.55)'
  g.lineWidth = 1.4 * u
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.stroke()
  pts.forEach(([x, y], i) => {
    if (i === 0 || i === N) return
    const tw = 0.55 + 0.45 * Math.sin(t * (1.1 + rnd(i, 8) * 1.6) + rnd(i, 9) * 6.28)
    const r = 16 * u * (0.7 + tw * 0.5)
    const glow = g.createRadialGradient(x, y + 5 * u, 0, x, y + 5 * u, r)
    glow.addColorStop(0, `rgba(255,226,160,${0.55 * tw})`)
    glow.addColorStop(1, 'rgba(255,200,120,0)')
    g.fillStyle = glow
    g.fillRect(x - r, y + 5 * u - r, r * 2, r * 2)
    g.fillStyle = `rgba(255,${236 + 14 * tw},${196 + 40 * tw},${0.75 + 0.25 * tw})`
    g.beginPath()
    g.ellipse(x, y + 5 * u, 2.6 * u, 3.6 * u, 0, 0, Math.PI * 2)
    g.fill()
  })

  // the time, the date
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.fillStyle = 'rgba(255,255,255,0.94)'
  g.font = `200 ${170 * u}px ${THIN}`
  g.shadowColor = 'rgba(40,10,50,0.35)'
  g.shadowBlur = 24 * u
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')
  g.fillText(time, W / 2, H * 0.52)
  g.shadowBlur = 0
  g.font = `500 ${26 * u}px ${THIN}`
  g.fillStyle = 'rgba(255,255,255,0.8)'
  g.fillText(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), W / 2, H * 0.52 + 50 * u)

  // a note from her wall, one at a time
  const CYCLE = 9
  const k = Math.floor(t / CYCLE) % NOTES.length
  const p = (t % CYCLE) / CYCLE
  const a = Math.min(1, p / 0.12, (1 - p) / 0.12)
  g.globalAlpha = Math.max(0, a) * 0.9
  g.fillStyle = '#ffe3ec'
  g.font = `700 ${34 * u}px ${HAND}`
  g.fillText(NOTES[k], W / 2, H * 0.52 + 120 * u + (1 - a) * 6 * u)
  g.globalAlpha = 1
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath()
  g.moveTo(x, y + s * 0.35)
  g.bezierCurveTo(x - s, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45)
  g.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s, y - s * 0.35, x, y + s * 0.35)
  g.fill()
}
function sparkle(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath()
  g.moveTo(x, y - s * 2)
  g.quadraticCurveTo(x, y, x + s * 2, y)
  g.quadraticCurveTo(x, y, x, y + s * 2)
  g.quadraticCurveTo(x, y, x - s * 2, y)
  g.quadraticCurveTo(x, y, x, y - s * 2)
  g.fill()
}

// (a canvas doesn't fetch a web font by itself: ask for the handwriting now, so it's in by the first note)
if (typeof document !== 'undefined') void document.fonts?.load(`700 34px 'Gaegu'`)
