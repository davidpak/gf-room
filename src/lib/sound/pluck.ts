/**
 * A plucked steel string, synthesized (no audio files): Karplus–Strong. A burst of noise goes round a
 * delay line one period long, softened a little each time round, so it rings at the string's pitch and
 * dies away the way a string does (the highs first). Then a touch of body: a warm bump low down, the
 * top end rolled off. (The room's knocks and thumps are off, ./thump's SOUND; this is an instrument.)
 *
 *   pluck(string, hz, loud)   a string (0–5) sounds at hz; the same string plucked again stops its last
 *                             note first, as a real one would
 */
let ctx: AudioContext | null = null
let out: AudioNode | null = null
const cache = new Map<number, { buf: AudioBuffer; rate: number }>()
const ringing: ({ src: AudioBufferSourceNode; gain: GainNode } | null)[] = []

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    // the body: a warm bump round 110 Hz (the air in it), one round 220 (its top), the highs rolled off
    const air = ctx.createBiquadFilter()
    air.type = 'peaking'
    air.frequency.value = 110
    air.Q.value = 1.2
    air.gain.value = 5
    const top = ctx.createBiquadFilter()
    top.type = 'peaking'
    top.frequency.value = 220
    top.Q.value = 1
    top.gain.value = 3
    const soft = ctx.createBiquadFilter()
    soft.type = 'lowpass'
    soft.frequency.value = 5200
    const master = ctx.createGain()
    master.gain.value = 0.5
    air.connect(top).connect(soft).connect(master).connect(ctx.destination)
    out = air
  }
  return ctx
}

/** a note's ring, made once: one period of noise, round and round, softened */
function note(hz: number) {
  const key = Math.round(hz * 100)
  const have = cache.get(key)
  if (have) return have
  const c = audio()
  const sr = c.sampleRate
  const exact = sr / hz
  const N = Math.max(2, Math.floor(exact))
  const secs = Math.min(3.2, 1.2 + 260 / hz) // (low strings ring longer)
  const len = Math.floor(sr * secs)
  const buf = c.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  // the pluck: noise, rounded off a bit (a pick on a steel string: bright but not a click)
  let prev = 0
  for (let i = 0; i < N; i++) {
    const n = Math.random() * 2 - 1
    prev = prev * 0.35 + n * 0.65
    d[i] = prev
  }
  // how much it loses each time round, so that it dies away in about `secs`
  const loss = Math.pow(0.001, 1 / (hz * secs))
  for (let i = N; i < len; i++) d[i] = loss * 0.5 * (d[i - N] + d[i - N - 1 < 0 ? 0 : i - N - 1])
  // a whisper of fade at the end, so it never clicks off
  const tail = Math.floor(sr * 0.05)
  for (let i = 0; i < tail; i++) d[len - 1 - i] *= i / tail
  // (the loop is a whole number of samples long; playing it back a hair faster or slower puts it
  // exactly on pitch)
  const made = { buf, rate: N / exact }
  if (cache.size > 90) cache.delete(cache.keys().next().value!)
  cache.set(key, made)
  return made
}

export function pluck(string: number, hz: number, loud = 0.8, delay = 0) {
  const c = audio()
  if (c.state === 'suspended') void c.resume()
  const at = c.currentTime + delay
  // the string's last note stops (quickly, not with a click)
  const last = ringing[string]
  if (last) {
    last.gain.gain.cancelScheduledValues(at)
    last.gain.gain.setTargetAtTime(0, at, 0.015)
    last.src.stop(at + 0.1)
  }
  const { buf, rate } = note(hz)
  const src = c.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = rate
  const gain = c.createGain()
  gain.gain.value = 0.55 * loud
  src.connect(gain).connect(out!)
  src.start(at)
  const me = { src, gain }
  ringing[string] = me
  src.onended = () => {
    if (ringing[string] === me) ringing[string] = null
  }
}
