/**
 * Soft impact sounds, synthesized (no audio files). Loudness and pitch follow impact strength,
 * the way Bruno's portfolio scales collision sounds by force.
 *   'soft'  fabric / pillows: a muffled low thump
 *   'hard'  wood / plastic: a short brighter knock
 */
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let last = 0

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return ctx
}

export function thump(strength: number, kind: 'soft' | 'hard' = 'soft') {
  const s = Math.min(1, Math.max(0, strength))
  if (s < 0.05) return
  const c = audio()
  if (c.state === 'suspended') void c.resume()
  const now = c.currentTime
  if (now - last < 0.04) return // don't machine-gun on jittery contacts
  last = now
  const src = c.createBufferSource()
  src.buffer = noise
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = kind === 'soft' ? 180 + 260 * s : 900 + 1800 * s
  lp.Q.value = kind === 'soft' ? 0.7 : 2.5
  const g = c.createGain()
  const peak = (kind === 'soft' ? 0.35 : 0.2) * s
  const len = kind === 'soft' ? 0.18 : 0.08
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(peak, now + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, now + len)
  src.connect(lp).connect(g).connect(c.destination)
  src.start(now)
  src.stop(now + len + 0.02)
}

/** a soft round pop (a fix-it prompt pressed): a quick sine chirp up, then a little overtone */
export function blip() {
  const c = audio()
  if (c.state === 'suspended') void c.resume()
  const now = c.currentTime
  for (const [f0, f1, peak, at] of [
    [520, 980, 0.11, 0],
    [1040, 1560, 0.035, 0.05],
  ] as const) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(f0, now + at)
    o.frequency.exponentialRampToValueAtTime(f1, now + at + 0.09)
    g.gain.setValueAtTime(0.0001, now + at)
    g.gain.exponentialRampToValueAtTime(peak, now + at + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.22)
    o.connect(g).connect(c.destination)
    o.start(now + at)
    o.stop(now + at + 0.25)
  }
}
