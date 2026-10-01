/**
 * A Lime's sounds, synthesized (no audio files):
 *
 *   unlock()   the ride starting: its jingle, D (dotted quarter), F, A (eighths), the B below, C (quarters), at
 *              JINGLE_BPM, in a soft chime
 *   park()     the ride ending: a few notes of the chime falling, then the kickstand's click
 *
 * Once nothing's sounding the audio is put to sleep (woken by the next sound): left running it works through
 * silence for as long as the page is open (the guitar's did, and cost frames).
 */
let ctx: AudioContext | null = null
let out: GainNode | null = null
let sleep: ReturnType<typeof setTimeout> | null = null

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
    if (ctx && ctx.state === 'running') void ctx.suspend()
  }, after * 1000 + 300)
}

/** one chime note, held for `len` seconds: a sine with a little of its octave and twelfth, struck softly, ringing
 *  through its length and let go */
function chime(c: AudioContext, hz: number, at: number, len: number, loud: number) {
  const g = c.createGain()
  const end = at + len
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(loud, at + 0.012)
  g.gain.exponentialRampToValueAtTime(loud * 0.45, at + Math.min(0.25, len * 0.6)) // (struck, then settling)
  g.gain.setValueAtTime(loud * 0.45, end - 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.18) // (let go: a short ring after)
  g.connect(out!)
  for (const [mul, level] of [
    [1, 1],
    [2, 0.22],
    [3, 0.06],
  ] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = hz * mul
    const lg = c.createGain()
    lg.gain.value = level
    o.connect(lg).connect(g)
    o.start(at)
    o.stop(end + 0.2)
  }
}

/** how fast the jingle goes (beats a minute) */
export const JINGLE_BPM = 140
// (D5 F5 A5, then down to B4, C5)
const D5 = 587.33
const F5 = 698.46
const A5 = 880
const B4 = 493.88
const C5 = 523.25
/** the jingle: each note and its length in beats (a dotted quarter, two eighths, two quarters) */
const JINGLE: [number, number][] = [
  [D5, 1.5],
  [F5, 0.5],
  [A5, 0.5],
  [B4, 1],
  [C5, 1],
]

export function unlock() {
  const c = audio()
  const beat = 60 / JINGLE_BPM
  let t = c.currentTime + 0.03
  for (const [hz, beats] of JINGLE) {
    const len = beats * beat
    chime(c, hz, t, len * 0.92, 0.15) // (each a hair short of its length, so they don't run together)
    t += len
  }
  rest(t - c.currentTime + 0.3)
}

export function park() {
  const c = audio()
  const t = c.currentTime + 0.03
  const beat = 60 / JINGLE_BPM
  // the jingle's notes falling back down: A, F, D
  ;[A5, F5, D5].forEach((hz, i) => chime(c, hz, t + i * beat * 0.5, beat * 0.45, 0.12))
  // the kickstand: a short knock, a filtered burst of noise
  const at = t + beat * 1.6
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
  rest(at - c.currentTime + 0.2)
}
