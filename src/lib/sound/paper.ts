/**
 * Paper's sounds, synthesized (noise, shaped): a fold creased down (a short crisp swish and the press), a sheet
 * crumpled into a ball (a run of crackles), a plane thrown (a soft whoosh). Asleep when quiet (as ./lime's).
 */
let ctx: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null
let sleep: ReturnType<typeof setTimeout> | null = null

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    out = ctx.createGain()
    out.gain.value = 0.45
    out.connect(ctx.destination)
    const n = Math.floor(ctx.sampleRate * 1.2)
    noise = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
  if (sleep) clearTimeout(sleep)
  sleep = null
  return ctx
}
function rest(after: number) {
  if (sleep) clearTimeout(sleep)
  sleep = setTimeout(() => {
    sleep = null
    if (ctx && ctx.state === 'running') void ctx.suspend()
  }, after * 1000 + 300)
}
/** a burst of noise through a band, its loudness shaped */
function burst(c: AudioContext, at: number, len: number, hz: number, q: number, loud: number, attack = 0.005) {
  const src = c.createBufferSource()
  src.buffer = noise
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = hz
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(loud, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  src.connect(f).connect(g).connect(out!)
  src.start(at, Math.random() * 0.8, len + 0.05)
}

/** a fold: the paper swishing over, then creased down */
export function foldSound() {
  const c = audio()
  const t = c.currentTime + 0.01
  burst(c, t, 0.22, 2600, 0.8, 0.18, 0.06)
  burst(c, t + 0.3, 0.06, 3800, 1.6, 0.35)
  burst(c, t + 0.34, 0.05, 1900, 1.2, 0.2)
  rest(0.7)
}
/** crumpled into a ball */
export function crumpleSound() {
  const c = audio()
  const t = c.currentTime + 0.01
  for (let i = 0; i < 14; i++) burst(c, t + i * 0.035 + Math.random() * 0.02, 0.05 + Math.random() * 0.05, 1500 + Math.random() * 3000, 1.2, 0.18 + Math.random() * 0.2)
  rest(0.9)
}
/** thrown: a soft whoosh, louder the harder */
export function throwSound(strength: number) {
  const c = audio()
  const t = c.currentTime + 0.01
  const src = c.createBufferSource()
  src.buffer = noise
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 0.7
  f.frequency.setValueAtTime(500, t)
  f.frequency.exponentialRampToValueAtTime(1600, t + 0.25)
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.12 + 0.18 * Math.min(1, strength), t + 0.08)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
  src.connect(f).connect(g).connect(out!)
  src.start(t, 0, 0.5)
  rest(0.8)
}
