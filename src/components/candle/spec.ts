/**
 * Rina's holiday candle: a candle in a red glass tumbler, a red-and-white striped ribbon tied round its top in a bow,
 * its metal lid set beside it; lit. Millimetres.
 *
 * Sources
 *   [P]  her photos: room-desk-night.jpg (right of the pen cup, zoomed: a straight-sided tumbler of red glass,
 *        glittery, a lighter rectangular label on its front with a thin gold rule round it, the pale cream wax
 *        showing at the top, a striped ribbon (red and white, diagonal stripes, ~16 wide) tied at the top with a
 *        bow, a tail of it running down the side to the foot); room-desk-wide.png (the same, by the monitor).
 *        A little taller than it is wide
 *   [E]  the usual 8-10 oz glass-jar candle: 80 across, 95 tall, glass ~4 thick with a heavy base; its tin lid;
 *        a candle a few evenings burnt (the wax ~17 down); a cotton wick; a small flame ~20 tall; the weights
 *
 * Its frame: the jar's axis at x 0, z 0, its bottom on y 0, its label (front) toward +z. The lid lies beside it, a
 * separate thing.
 */
export const CANDLE = {
  jar: { d: 80, h: 95, wall: 4, base: 9, foot: 4, lip: 1.4 }, // [E] foot: the bottom edge's rounding; lip: the rim's
  wax: { y: 78, dish: 2.5 }, // [E] the wax's top at the wall, dished a little toward the wick (a melt pool)
  wick: { r: 0.8, h: 6, bend: 2 }, // [E] its charred tip curling over
  flame: { h: 20, r: 4.6, lift: 1.2 }, // [E] a teardrop; lift: it starts a hair above the wick's foot
  label: { w: 40, h: 46, y: 40, gold: 1.2 }, // [P] the rectangle on its front, about half the jar's width
  ribbon: { w: 16, y: 84, bowW: 50, bowH: 28, loop: 18, tail: 62, gap: 0.6 }, // [P] the band round the top, the bow on it, the tails down the side
  bowAt: 1.15, // [P] the bow's angle round the jar (radians from the front, toward +x): round to the right, as in her photo, clear of the label
  lid: { d: 86, h: 11, t: 0.6 }, // [E] its tin lid, a skirt over the rim
  light: { intensity: 34, decay: 1, distance: 700, color: '#ffa25a' }, // [E] a candle's worth, by the lamp's (decay 1, ~10% of its spill)
  flicker: { amp: 0.11, sway: 0.06 }, // [E] the light's swing either way, the flame's lean (radians)
  mass: 0.48, // [E] kg: ~240 g of glass, ~240 g of wax
  lidMass: 0.035, // [E] kg
  colors: {
    glass: '#b51d26',
    glassDeep: '#8a1520',
    inside: '#7c1019',
    label: '#d8463c',
    gold: '#e2b45a',
    wax: '#f4e4d2',
    pool: '#e8c9b2',
    wick: '#2a1d18',
    red: '#d4202e',
    white: '#fbf6f0',
    lid: '#b3ab9e',
  },
}

const C = CANDLE

/** the flicker, 1 on average: a soft irregular sum of sines (no repeat you'd notice) */
export function flicker(t: number) {
  const s = Math.sin(t * 7.1) * 0.42 + Math.sin(t * 11.3 + 1.7) * 0.27 + Math.sin(t * 17.9 + 0.4) * 0.18 + Math.sin(t * 2.3 + 2.9) * 0.13
  return 1 + C.flicker.amp * s
}

export type Check = { what: string; value: string; ok: boolean }
export function checkCandle(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const J = C.jar
  const R = J.d / 2
  c('an 8-10 oz jar candle: ~80 across, ~95 tall [E]', `${J.d} × ${J.h}`, Math.abs(J.d - 80) <= 6 && Math.abs(J.h - 95) <= 8)
  c('a little taller than wide, as in her photo [P]', `${(J.h / J.d).toFixed(2)}`, J.h / J.d > 1.05 && J.h / J.d < 1.35)
  c('the wax inside the glass: over the heavy base, below the rim', `the base ${J.base}, the wax ${C.wax.y}, the rim ${J.h}`, C.wax.y - C.wax.dish > J.base + 10 && C.wax.y < J.h - 8)
  const tip = C.wax.y - C.wax.dish + C.flame.lift + C.flame.h
  c('the flame peeks over the rim (seen from the desk) [E]', `its tip at ${tip.toFixed(1)}, the rim ${J.h}`, tip > J.h && tip < J.h + 15)
  c('a small flame: ~20 tall, ~9 across [E]', `${C.flame.h} × ${2 * C.flame.r}`, C.flame.h >= 14 && C.flame.h <= 28 && C.flame.r * 2 < 12)
  const rb = C.ribbon
  c('the ribbon band below the rim, the bow on it', `the band ${rb.y - rb.w / 2}–${rb.y + rb.w / 2}, the rim ${J.h}`, rb.y + rb.w / 2 <= J.h - 2 && rb.bowH / 2 < rb.y)
  c('the tails stop short of the desk', `they reach y ${(rb.y - rb.tail).toFixed(0)}`, rb.y - rb.tail > J.foot + 4)
  // (round the jar in mm from the front: the tails' near edge vs the label's right edge)
  const near = C.bowAt * R - (rb.w * 0.3 + 5 + rb.w / 2)
  c('the bow’s tails clear of the label (the bow round to the right) [P]', `the tails from ${near.toFixed(0)} round, the label to ${C.label.w / 2}`, near > C.label.w / 2 + 2)
  c('the label on its front, inside the glass’s height [P]', `${C.label.w} × ${C.label.h} at y ${C.label.y}`, C.label.y - C.label.h / 2 > J.foot + 4 && C.label.y + C.label.h / 2 < rb.y - rb.w / 2 - 2 && C.label.w < J.d * 0.6)
  c('the lid fits over the rim', `${C.lid.d} over ${J.d}`, C.lid.d > J.d + 2 && C.lid.d < J.d + 10)
  c('the light a candle’s worth, not a lamp’s', `${C.light.intensity} (the lamp’s spill 340), decay ${C.light.decay}`, C.light.intensity < 340 * 0.2)
  c('it stands: a flat foot nearly its full width', `${J.d - 2 * J.foot} of ${J.d}`, J.d - 2 * J.foot > J.d * 0.85)
  return out
}
