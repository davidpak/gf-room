/**
 * A Lime's sounds, synthesized (no audio files, nothing of Lime's own):
 *
 *   unlock()      the ride starting: a bright chime climbing four notes, the motor whirring awake under it
 *   park()        the ride ending: the chime falling back down, then the kickstand's click
 *   motor(speed)  while it's ridden: a soft electric whine, rising with speed (0..1); 0 for quiet
 *
 * Once nothing's sounding the audio is put to sleep (woken by the next sound): left running it works through
 * silence for as long as the page is open (the guitar's did, and cost frames).
 */
let ctx: AudioContext | null = null
let out: GainNode | null = null
let whine: { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null
let sleep: ReturnType<typeof setTimeout> | null = null
let humming = false

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    out = ctx.createGain()
    out.gain.value = 0.5
    out.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  if (sleep) clearTimeout(sleep)
  sleep = null
  return ctx
}
/** asleep once all's quiet (`after` seconds from now, when the last sound's died away) */
function rest(after: number) {
  if (sleep) clearTimeout(sleep)
  sleep = setTimeout(() => {
    sleep = null
    if (ctx && ctx.state === 'running' && !humming) void ctx.suspend()
  }, after * 1000 + 300)
}

/** one chime note: a sine and its octave, struck and dying away */
function bell(c: AudioContext, hz: number, at: number, loud: number) {
  const g = c.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(loud, at + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
  g.connect(out!)
  for (const [mul, level] of [
    [1, 1],
    [2, 0.28],
    [3.01, 0.08],
  ] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = hz * mul
    const lg = c.createGain()
    lg.gain.value = level
    o.connect(lg).connect(g)
    o.start(at)
    o.stop(at + 0.5)
  }
}

/** the motor waking (up) or winding down (not up): a filtered buzz sliding in pitch */
function whir(c: AudioContext, at: number, up: boolean) {
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(up ? 70 : 170, at)
  o.frequency.exponentialRampToValueAtTime(up ? 170 : 60, at + 0.55)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(up ? 300 : 1100, at)
  f.frequency.exponentialRampToValueAtTime(up ? 1100 : 250, at + 0.55)
  const g = c.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(0.05, at + 0.08)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6)
  o.connect(f).connect(g).connect(out!)
  o.start(at)
  o.stop(at + 0.65)
}

// (E major, bright: E5 G♯5 B5 E6)
const CHIME = [659.3, 830.6, 987.8, 1318.5]

export function unlock() {
  const c = audio()
  const t = c.currentTime + 0.02
  whir(c, t, true)
  CHIME.forEach((hz, i) => bell(c, hz, t + 0.12 + i * 0.085, 0.16))
  rest(1.2)
}

export function park() {
  const c = audio()
  const t = c.currentTime + 0.02
  ;[...CHIME].reverse().slice(1).forEach((hz, i) => bell(c, hz, t + i * 0.1, 0.14))
  whir(c, t, false)
  // the kickstand: a short knock, a filtered burst of noise
  const at = t + 0.42
  const n = Math.floor(c.sampleRate * 0.04)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 1800
  f.Q.value = 1.4
  const g = c.createGain()
  g.gain.value = 0.5
  src.connect(f).connect(g).connect(out!)
  src.start(at)
  rest(1)
}

/** the whine while it's ridden: speed 0..1 (0 fades it out, and lets the audio sleep) */
let lastSpeed = -1
export function motor(speed: number) {
  const on = speed > 0.02
  if (!on && !whine) return
  // (told every frame, changed only when it's moved enough to hear: each change is a scheduled event)
  if (on && whine && Math.abs(speed - lastSpeed) < 0.03) return
  lastSpeed = on ? speed : -1
  const c = audio()
  if (!whine) {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    const osc2 = c.createOscillator()
    osc2.type = 'triangle'
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 2
    const gain = c.createGain()
    gain.gain.value = 0
    osc.connect(filter)
    osc2.connect(filter)
    filter.connect(gain).connect(out!)
    osc.start()
    osc2.start()
    whine = { osc, osc2, filter, gain }
  }
  const t = c.currentTime
  const s = Math.min(1, speed)
  whine.osc.frequency.setTargetAtTime(110 + 380 * s, t, 0.05)
  whine.osc2.frequency.setTargetAtTime(220 + 760 * s, t, 0.05)
  whine.filter.frequency.setTargetAtTime(400 + 1600 * s, t, 0.05)
  whine.gain.gain.setTargetAtTime(on ? 0.012 + 0.03 * s : 0, t, 0.08)
  humming = on
  if (!on) {
    // (faded out: stopped and let go, the audio to sleep)
    const w = whine
    whine = null
    w.osc.stop(t + 0.5)
    w.osc2.stop(t + 0.5)
    rest(0.6)
  }
}
