import { Color, Vector3 } from 'three'
import { LOOK, shared } from './bruno'

/**
 * The Quad's day, round and round (./DayCycle runs it): what the light's like at each hour, and in between, blended.
 * The middle of the day is the look the Quad was made in (./bruno LOOK, kept as it was); the rest around it:
 *
 *   night      a cool blue moon high in the east, deep violet shadows, a navy sky full of stars; the lamps' pools
 *              and the fairy lights in the trees and round the canopies doing the lighting
 *   sunrise    a low sun from the east, peach light, a lilac-to-apricot sky, the lights going out
 *   morning    clearer and paler, rosy-white light
 *   midday     the Quad's own (lilac-pink sky, warm peach light, lavender shade)
 *   golden     the sun low in the west, deep gold, long shadows
 *   sunset     coral light, the sky going plum to tangerine, the lights coming on
 *   dusk       the last violet, the sky deepening, the lights warm
 *
 * Each frame only a few shared numbers change (./bruno shared: every material reads them): cheap.
 */
type Key = {
  h: number
  sky: [string, string, string, string]
  light: string
  intensity: number
  shadow: string // (a tint on every material's own shadow colour)
  bounce: string
  fog: string
  sun: [number, number, number] // (where the light comes from: the sun, or the moon at night)
  lamps: number // (the lamp posts' pools)
  glow: number // (things that glow: bulbs, lamps, lit windows, lights)
  night: number // (0 day … 1 night: the stars, the fairy lights and their pools)
}
const MID = { sky: LOOK.sky as [string, string, string, string], light: '#' + LOOK.light.getHexString(), intensity: LOOK.intensity, shadow: '#ffffff', bounce: '#' + LOOK.bounce.getHexString(), fog: '#' + LOOK.fog.getHexString(), sun: [LOOK.sun.x, LOOK.sun.y, LOOK.sun.z] as [number, number, number], lamps: 1, glow: 1, night: 0 }
const NIGHT = { sky: ['#060920', '#121a42', '#24285a', '#3a3363'] as [string, string, string, string], light: '#94abe8', intensity: 0.5, shadow: '#474b8c', bounce: '#2a2456', fog: '#262a4f', sun: [0.35, 0.82, -0.25] as [number, number, number], lamps: 2.3, glow: 2.6, night: 1 }
const KEYS: Key[] = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT },
  { h: 5.6, sky: ['#2a2d6e', '#7c5fa6', '#e996b0', '#ffc59e'], light: '#ffb3a0', intensity: 0.95, shadow: '#b49ad2', bounce: '#7a4a8a', fog: '#d39cbc', sun: [0.78, 0.42, 0.38], lamps: 1.6, glow: 1.8, night: 0.45 },
  { h: 6.8, sky: ['#4c5aa8', '#a98ac6', '#f6b5c0', '#ffdcb8'], light: '#ffd0b4', intensity: 1.0, shadow: '#cfc4ee', bounce: '#8e5292', fog: '#ebbdcb', sun: [0.7, 0.45, 0.42], lamps: 1.1, glow: 1.1, night: 0 },
  { h: 9, sky: ['#4a56a6', '#a585c8', '#f4b0bf', '#ffd9b4'], light: '#ffe2cc', intensity: 1.15, shadow: '#f4f0ff', bounce: '#94508c', fog: '#ecb6c4', sun: [0.2, 0.75, 0.5], lamps: 1, glow: 1, night: 0 },
  { h: 11.5, ...MID },
  { h: 15.5, ...MID },
  { h: 17.4, sky: ['#36307a', '#b46aa6', '#ff9a8c', '#ffc27a'], light: '#ffc287', intensity: 1.3, shadow: '#f0d4ea', bounce: '#a24e7e', fog: '#f2a296', sun: [-0.74, 0.5, 0.42], lamps: 1.1, glow: 1.1, night: 0 },
  { h: 18.7, sky: ['#221f63', '#7a4598', '#f2708a', '#ffa868'], light: '#ff9a72', intensity: 1.12, shadow: '#d2a2cf', bounce: '#9a4476', fog: '#e08a9e', sun: [-0.8, 0.42, 0.4], lamps: 1.5, glow: 1.6, night: 0.3 },
  { h: 19.8, sky: ['#121540', '#33296c', '#7a4a8e', '#c27688'], light: '#a68ad6', intensity: 0.58, shadow: '#6a5f9e', bounce: '#4a3170', fog: '#5e4a7a', sun: [-0.6, 0.45, 0.2], lamps: 2.0, glow: 2.2, night: 0.75 },
  { h: 21, ...NIGHT },
  { h: 24, ...NIGHT },
]
// (each key's colours as colours, once)
const K = KEYS.map((k) => ({ ...k, skyC: k.sky.map((c) => new Color(c)), lightC: new Color(k.light), shadowC: new Color(k.shadow), bounceC: new Color(k.bounce), fogC: new Color(k.fog), sunV: new Vector3(...k.sun).normalize() }))

/** what the day's like at hour h (0–24): written into `out` (no allocation) */
export type Now = { sky: Color[]; light: Color; intensity: number; shadow: Color; bounce: Color; fog: Color; sun: Vector3; lamps: number; glow: number; night: number }
export const now: Now = { sky: [0, 1, 2, 3].map(() => new Color()), light: new Color(), intensity: 1, shadow: new Color(), bounce: new Color(), fog: new Color(), sun: new Vector3(), lamps: 1, glow: 1, night: 0 }
const smooth = (x: number) => x * x * (3 - 2 * x)
export function dayAt(h: number, out: Now = now) {
  h = ((h % 24) + 24) % 24
  let i = 0
  while (i < K.length - 2 && h >= K[i + 1].h) i++
  const a = K[i]
  const b = K[i + 1]
  const u = smooth(Math.max(0, Math.min(1, (h - a.h) / Math.max(1e-6, b.h - a.h))))
  out.sky.forEach((c, j) => c.copy(a.skyC[j]).lerp(b.skyC[j], u))
  out.light.copy(a.lightC).lerp(b.lightC, u)
  out.intensity = a.intensity + (b.intensity - a.intensity) * u
  out.shadow.copy(a.shadowC).lerp(b.shadowC, u)
  out.bounce.copy(a.bounceC).lerp(b.bounceC, u)
  out.fog.copy(a.fogC).lerp(b.fogC, u)
  out.sun.copy(a.sunV).lerp(b.sunV, u).normalize()
  out.lamps = a.lamps + (b.lamps - a.lamps) * u
  out.glow = a.glow + (b.glow - a.glow) * u
  out.night = a.night + (b.night - a.night) * u
  return out
}

/** the clock: where the day is (hours), how fast it goes (a whole day in `minutes`); `?time=19.5` starts it there,
 *  `?daylen=5` makes a day five minutes; otherwise it starts at the visitor's own time of day */
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const local = new Date()
export const clock = {
  hour: params.has('time') ? Number(params.get('time')) : local.getHours() + local.getMinutes() / 60,
  minutes: params.has('daylen') ? Number(params.get('daylen')) : 24,
}

/** the day as it is now, into the shared look (every bruno material, the sun's direction the car's shadows use) */
export function applyDay(n: Now) {
  LOOK.sun.copy(n.sun)
  LOOK.bounce.copy(n.bounce)
  shared.light.value.copy(n.light).multiplyScalar(n.intensity)
  shared.shadowTint.value.copy(n.shadow)
  shared.lampK.value = n.lamps
  shared.glowK.value = n.glow
}
