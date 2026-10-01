/**
 * A Lime's sounds, synthesized (no audio files):
 *
 *   unlock()   the ride starting: its jingle, D (dotted quarter), F, A (eighths), the B below, C (quarters), at
 *              JINGLE_BPM, struck on chimes
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

/** one chime note: struck, and left to ring and die away as a chime bar does (its own length only how soon the
 *  next is struck). A glockenspiel's partials: the note, and above it at 2.76 and 5.4 times (a bar's, not a
 *  string's), each fainter and dying sooner; a touch of its octave, a hair sharp, for shimmer */
function chime(c: AudioContext, hz: number, at: number, loud: number) {
  for (const [mul, level, ring] of [
    [1, 1, 1.1],
    [2.005, 0.18, 0.55],
    [2.76, 0.32, 0.4],
    [5.4, 0.12, 0.16],
  ] as const) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = hz * mul
    const g = c.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(loud * level, at + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, at + ring)
    o.connect(g).connect(out!)
    o.start(at)
    o.stop(at + ring + 0.05)
  }
}

/** how fast the jingle goes (beats a minute) */
export const JINGLE_BPM = 160
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
    chime(c, hz, t, 0.16)
    t += beats * beat
  }
  rest(t - c.currentTime + 1.2)
}

export function park() {
  const c = audio()
  const t = c.currentTime + 0.03
  const beat = 60 / JINGLE_BPM
  // the jingle's notes falling back down: A, F, D
  ;[A5, F5, D5].forEach((hz, i) => chime(c, hz, t + i * beat * 0.5, 0.12))
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
  rest(at - c.currentTime + 1.2)
}
