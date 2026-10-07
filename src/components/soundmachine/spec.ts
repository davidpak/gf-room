/**
 * Rina's sound machine: a white fan-in-a-drum white-noise machine of the Yogasleep Dohm kind, millimetres.
 *
 * Sources
 *   [E]  the Dohm (Classic / Dual): 5.5" across, 3.5" tall, about 1.4 lb; a white drum, its lower body holding the
 *        fan and the switches, a collar over it with openings round its side (turning it opens or shuts them: the
 *        tone), a low domed cap on top; two rocker switches low on its front (power, and high / low speed)
 *   [P]  where it is in her room (room-desk-wall.jpg, behind the mints near the lamp's base): a white rounded thing,
 *        too far and too small to read more off
 *
 * Its frame: the middle of its footprint at x 0, z 0, its bottom on y 0, its front (the switches) toward +z.
 * Going up: the body (0 to body.h), a hair of seam, the collar (its openings round it), the cap's dome.
 */
const IN = 25.4
export const SOUNDMACHINE = {
  r: 5.5 * IN / 2, // [E] 140 across
  h: 3.5 * IN, // [E] 89 tall
  foot: { r: 6, inset: 4, h: 3 }, // [E] its lower edge rounded, a foot ring set in under it
  body: { h: 40 }, // [E] the lower drum, to the collar
  seam: 1.2, // [E] the gap between the body and the collar it turns on
  collar: { h: 34, wall: 3.5, inset: 0.8 }, // [E] the turning collar, a hair inside the body's line
  vents: { n: 10, w: 20, h: 18, below: 6 }, // [E] its openings round the side: how many, wide, tall, up from its foot
  cap: { rise: 13.7 }, // [E] the low dome over the collar
  switches: { w: 15, h: 10, gap: 8, y: 20, plate: 1.2, rocker: 3.2, tilt: 0.2 }, // [E] two rockers in a plate, front, low
  inside: { r: 60 }, // [E] the dark drum the fan's in, seen through the openings
  spin: { low: 0.1, high: 0.16 }, // rad/s: how fast the collar turns, on (slow: life, not a show)
  noise: { low: 650, high: 1100, gain: 0.06, fadeIn: 1.6, fadeOut: 1.2 }, // the low-pass (Hz), how loud, the fades (s)
  mass: 0.64, // [E] kg
  colors: { body: '#f4f1ea', collar: '#f7f4ee', inside: '#5d5967', plate: '#e3dfd8', rocker: '#fbfaf6' },
}

export type Check = { what: string; value: string; ok: boolean }
export function checkSoundMachine(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const S = SOUNDMACHINE
  c('a Dohm’s size: 5.5" across, 3.5" tall [E]', `${(2 * S.r).toFixed(0)} × ${S.h.toFixed(0)}`, Math.abs(2 * S.r - 140) < 2 && Math.abs(S.h - 89) < 2)
  c('squat: about 1.6 times as wide as it’s tall [E]', `${((2 * S.r) / S.h).toFixed(2)}`, Math.abs((2 * S.r) / S.h - 1.57) < 0.1)
  const stack = S.body.h + S.seam + S.collar.h + S.cap.rise
  c('body, seam, collar and cap make its height', `${stack.toFixed(1)} of ${S.h.toFixed(1)}`, Math.abs(stack - S.h) < 0.5)
  const V = S.vents
  c('the openings within the collar, a band above and below', `${V.below} + ${V.h} of ${S.collar.h}`, V.below >= 4 && S.collar.h - V.below - V.h >= 6)
  const round = 2 * Math.PI * (S.r - S.collar.inset)
  c('the pillars between the openings sturdy', `${(round / V.n - V.w).toFixed(1)} wide`, round / V.n - V.w >= 18)
  c('the fan’s drum inside the collar’s wall', `${S.inside.r} in ${(S.r - S.collar.inset - S.collar.wall).toFixed(1)}`, S.inside.r < S.r - S.collar.inset - S.collar.wall - 1)
  const W = S.switches
  c('the switches on the body, clear of the foot and the seam', `${W.y - W.h / 2 - W.plate}–${W.y + W.h / 2 + W.plate} of ${S.foot.r}–${S.body.h}`, W.y - W.h / 2 - W.plate > S.foot.r + 2 && W.y + W.h / 2 + W.plate < S.body.h - 3)
  const half = W.gap / 2 + W.w + W.plate
  c('both switches on the front’s flat-ish part', `${half} out of ${S.r.toFixed(0)}`, half < S.r * 0.35)
  c('the collar turns slowly (under two turns a minute)', `${((S.spin.high * 60) / (2 * Math.PI)).toFixed(2)} turns a minute at most`, S.spin.high * 60 < 4 * Math.PI)
  c('quiet: the noise well under full scale', `gain ${S.noise.gain}`, S.noise.gain <= 0.1)
  return out
}
