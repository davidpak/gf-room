/**
 * The GameCube setup's sounds, synthesized: a button's click, the lid popping up on its spring, the disc spinning up,
 * the old TV coming on (the thunk, the tube's whine, a crackle) and going off (the zip down to a dot), a boot chime
 * (our own, soft bells), the menu's blips. Asleep when quiet (as ./lime's: a running AudioContext costs frames).
 */
let ctx: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null
let sleep: ReturnType<typeof setTimeout> | null = null

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    out = ctx.createGain()
    out.gain.value = 0.4
    out.connect(ctx.destination)
    const n = Math.floor(ctx.sampleRate * 1.5)
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
/** a burst of noise through a band */
function burst(c: AudioContext, at: number, len: number, hz: number, q: number, loud: number, attack = 0.003) {
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
  src.start(at, Math.random(), len + 0.05)
}
/** a tone, its pitch gliding from hz to hz2 */
function tone(c: AudioContext, at: number, len: number, hz: number, loud: number, type: OscillatorType = 'sine', hz2 = hz, attack = 0.005) {
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(hz, at)
  if (hz2 !== hz) o.frequency.exponentialRampToValueAtTime(hz2, at + len)
  const g = c.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(loud, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  o.connect(g).connect(out!)
  o.start(at)
  o.stop(at + len + 0.05)
}
/** a soft bell: a few partials, decaying */
function bell(c: AudioContext, at: number, hz: number, loud: number, len = 1.2) {
  for (const [k, l] of [
    [1, 1],
    [2.01, 0.35],
    [3.02, 0.12],
  ])
    tone(c, at, len / k, hz * k, loud * l, 'sine', hz * k, 0.004)
}

/** a plastic button pressed */
export function clickSound() {
  const c = audio()
  const t = c.currentTime + 0.005
  burst(c, t, 0.03, 3200, 2, 0.25)
  tone(c, t, 0.02, 1700, 0.05, 'square')
  rest(0.2)
}
/** the lid popping up on its spring (or shut: a snap) */
export function lidSound(open: boolean) {
  const c = audio()
  const t = c.currentTime + 0.005
  if (open) {
    burst(c, t, 0.06, 900, 1.5, 0.35)
    tone(c, t + 0.01, 0.22, 320, 0.08, 'triangle', 170)
  } else {
    burst(c, t, 0.04, 1400, 1.8, 0.4)
    burst(c, t + 0.03, 0.05, 500, 1.2, 0.25)
  }
  rest(0.4)
}
/** the disc spinning up (or down) */
export function spinSound(up = true) {
  const c = audio()
  const t = c.currentTime + 0.01
  const len = up ? 1.6 : 0.9
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(up ? 40 : 160, t)
  o.frequency.exponentialRampToValueAtTime(up ? 160 : 30, t + len)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(up ? 300 : 900, t)
  f.frequency.exponentialRampToValueAtTime(up ? 1100 : 200, t + len)
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.035, t + 0.2)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  o.connect(f).connect(g).connect(out!)
  o.start(t)
  o.stop(t + len + 0.05)
  rest(len)
}
/** the TV coming on: the thunk of the tube, its whine, a crackle of static */
export function tvOnSound() {
  const c = audio()
  const t = c.currentTime + 0.01
  tone(c, t, 0.25, 70, 0.35, 'sine', 45)
  burst(c, t, 0.08, 2400, 0.8, 0.2)
  for (let i = 0; i < 6; i++) burst(c, t + 0.05 + i * 0.04 + Math.random() * 0.03, 0.03, 3000 + Math.random() * 3000, 2, 0.08)
  tone(c, t + 0.05, 0.6, 7800, 0.012, 'sine', 7800, 0.05)
  rest(0.8)
}
/** the TV going off: the picture zipping down to a dot */
export function tvOffSound() {
  const c = audio()
  const t = c.currentTime + 0.01
  tone(c, t, 0.18, 1400, 0.06, 'sine', 90)
  burst(c, t, 0.05, 1800, 1, 0.12)
  rest(0.4)
}
/** the console starting: soft bells rising, a last chord (our own) */
export function bootSound() {
  const c = audio()
  const t = c.currentTime + 0.3
  const n = [659.3, 784, 987.8, 1318.5] // (E5 G5 B5 E6)
  n.forEach((hz, i) => bell(c, t + i * 0.13, hz, 0.11, 0.9))
  for (const hz of [523.3, 659.3, 784, 1046.5]) bell(c, t + 0.75, hz, 0.07, 2.2) // (C major, ringing)
  rest(3.2)
}
/** a menu's blip, and its confirm */
export function blipSound() {
  const c = audio()
  const t = c.currentTime + 0.005
  tone(c, t, 0.06, 1320, 0.06, 'square')
  rest(0.2)
}
export function confirmSound() {
  const c = audio()
  const t = c.currentTime + 0.005
  tone(c, t, 0.08, 880, 0.07, 'square')
  tone(c, t + 0.08, 0.16, 1320, 0.07, 'square')
  rest(0.4)
}
/** a cheer (the results) */
export function cheerSound() {
  const c = audio()
  const t = c.currentTime + 0.01
  for (const [i, hz] of [523.3, 659.3, 784, 1046.5, 1318.5].entries()) tone(c, t + i * 0.08, 0.3, hz, 0.07, 'triangle')
  burst(c, t, 1.2, 2500, 0.5, 0.05, 0.3)
  rest(1.6)
}
