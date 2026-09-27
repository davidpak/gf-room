import { useEffect, useRef, useState } from 'react'

/**
 * Sound, which is half the feeling: soft rain on the window and a low, warm room tone, made live
 * with Web Audio (no files). Off until you click it (browsers only allow sound after a click).
 *
 *   rain       pink-ish noise through a band-pass (the hiss of rain on glass), slowly swelling
 *   drops      now and then a single soft tick on the window
 *   room tone  a very quiet low hum, so the silence between drops feels like a room
 */
function noiseBuffer(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    // pink-ish noise (Paul Kellet's filter), so it's soft rather than hissy
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12
    }
  }
  return buf
}

function start(ctx: AudioContext) {
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2.5) // fade in

  // rain on glass
  const rain = ctx.createBufferSource()
  rain.buffer = noiseBuffer(ctx, 6)
  rain.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 1400
  band.Q.value = 0.5
  const soft = ctx.createBiquadFilter()
  soft.type = 'lowpass'
  soft.frequency.value = 5200
  const rainGain = ctx.createGain()
  rainGain.gain.value = 0.35
  // a slow swell, like gusts
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.12
  lfo.connect(lfoGain).connect(rainGain.gain)
  rain.connect(band).connect(soft).connect(rainGain).connect(master)
  rain.start()
  lfo.start()

  // room tone
  const hum = ctx.createBufferSource()
  hum.buffer = rain.buffer
  hum.loop = true
  hum.playbackRate.value = 0.5
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 220
  const humGain = ctx.createGain()
  humGain.gain.value = 0.25
  hum.connect(low).connect(humGain).connect(master)
  hum.start()

  // single drops ticking on the window
  const drops = window.setInterval(() => {
    if (Math.random() > 0.55) return
    const t = ctx.currentTime + Math.random() * 0.3
    const src = ctx.createBufferSource()
    src.buffer = rain.buffer
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 2500 + Math.random() * 3500
    f.Q.value = 8
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.35, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.2 - 0.6
    src.connect(f).connect(g).connect(pan).connect(master)
    src.start(t, Math.random() * 5, 0.12)
  }, 140)

  return () => {
    window.clearInterval(drops)
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
    window.setTimeout(() => {
      rain.stop()
      hum.stop()
      lfo.stop()
    }, 700)
  }
}

export function Ambience() {
  const [on, setOn] = useState(false)
  const ctx = useRef<AudioContext | null>(null)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!on) return
    ctx.current ??= new AudioContext()
    void ctx.current.resume()
    stop.current = start(ctx.current)
    return () => {
      stop.current?.()
      stop.current = null
    }
  }, [on])
  return (
    <button
      onClick={() => setOn((o) => !o)}
      aria-pressed={on}
      title={on ? 'sound off' : 'sound on: rain on the window'}
      style={{
        position: 'absolute',
        right: 18,
        bottom: 18,
        padding: '8px 14px',
        borderRadius: 999,
        border: '1px solid rgba(255,230,200,0.25)',
        background: on ? 'rgba(255,214,170,0.9)' : 'rgba(40,32,62,0.55)',
        color: on ? '#3a2a40' : '#f3e6d8',
        font: '600 12px/1 system-ui, sans-serif',
        letterSpacing: 0.3,
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
      }}
    >
      {on ? '♪ rain on' : '♪ sound'}
    </button>
  )
}
