/**
 * The Victrola Eastwood (VTA-72, bamboo): the record player in David's photo. mm; the cabinet's frame: x right,
 * y up from its feet, z toward you (the grille's face at +D/2), its middle at x 0, z 0.
 *
 * Sources
 *   [M]    the manual (manualslib 3226351): p.13 specs, 12.7 × 12.3 × 5.2 in (322 × 312 × 131 mm, lid shut), 2 kg;
 *          belt drive, 33/45/78; 2 × 2 W; p.5 the controls left to right: POWER, BT OUT, PLAY/PAUSE, PREV, NEXT,
 *          the display, the earphone jack, the BT/PHONO knob (small), VOLUME (big, its −/+ arc); p.6 the top view
 *          (platter, tonearm, cue lever, the speed and AUTO STOP slides, the 45 adapter's ribbed rest).
 *   [MD]   measured off p.6's top view (the lidded deck 298 × 229 at 0.584 mm a px): the platter's Ø, its middle,
 *          the pivot, the arm at rest, the slides, the adapter.
 *   [P7]   victrola.com's photo VTA-72-BAM_7 (near front on; 322 across its front = 677 px): the knobs (x, Ø), the
 *          buttons' row, the display's window, the sides' thickness, the cabinet's height (≈ 85 under the lid).
 *   [P9]   VTA-72-BAM_9 (from the side), [G] the Gadgeteer's review (May 2021): bamboo-printed sides and back, the
 *          display "HI" on power, "PH" phono, "bt" Bluetooth; the platter silver-grey with slots; no counterweight
 *          (the pivot's a fixed block); AT-3600LA cartridge; the lid clear, hinged at the back on two tabs,
 *          open on the left (a 12" overhangs the platter there by an inch).
 *   [E]    our estimate where nothing says: marked so.
 */
export const EW = {
  w: 322, // [M]
  d: 312, // [M]
  h: 131, // [M] lid shut
  mass: 2.0, // [M]
  cab: 85, // the cabinet under the lid [P7]
  side: 12, // the bamboo sides' thickness [P7: 10.5–14]
  back: 12, // the bamboo back [G] [E]
  feet: 2, // felt pads [E]
  grille: { y0: 9, y1: 70, inset: 1.5 }, // the black mesh front, its plinth under it set back [P7]
  strip: 58, // the control strip, the front of the top, outside the lid [MD][P7]
  deck: { z0: -142, z1: 98 }, // the top behind the strip, under the lid [MD] (229 drawn, the back's lip added)
  platter: { x: -38, z: -14, r: 93.5, h: 14, hub: 47, spindle: 3.5, spindleH: 15 }, // [MD] Ø 187; h, hub [E]
  arm: {
    pivot: { x: 106, z: -82 }, // [MD]
    L: 150, // pivot to stylus [MD] (at rest, 150 from the pivot straight forward)
    rest: 0, // radians from straight forward (+z), toward the platter positive [MD]
    block: { w: 34, d: 52, h: 26 }, // the pivot's housing [P7] [E]
    tube: 3.4, // Ø 6.8 [P7]
    height: 21, // the tube over the deck [E]: clears a record on the platter (14 + 1.8) by 5
    head: { w: 13, l: 26, h: 13, angle: 0.38 }, // headshell + AT-3600LA, turned in [P7]
  },
  cue: { x: 126, z: -47 }, // [MD]
  slides: { x: 126, z: [-21, -3] }, // 33/45/78 and AUTO STOP [MD]
  adapter: { x: 65, z: -91, r: 20.5 }, // the 45 adapter's ribbed rest [MD]
  plate: { x0: -5, x1: 128, z0: -117, z1: -64 }, // the ribbed raised plate round the pivot [MD]
  // the strip's controls, along its middle line (z from the front) [P7][MD]
  controls: {
    z: 138,
    buttons: { xs: [-125, -109, -98, -86, -74], r: [5.5, 4, 4, 4, 4], h: 2.5 },
    display: { x0: -33, x1: 40, wx0: -21, wx1: 21, d: 12 },
    jack: { x: 49, r: 3 },
    knobs: { small: { x: 77, r: 10, h: 14 }, big: { x: 114, r: 13.5, h: 15 } },
  },
  lid: {
    t: 2.5, // [E]
    hinge: { xs: [-110, 110], y: 6, z: -150 }, // [P7][E]: on the back, a little up
    open: (68 * Math.PI) / 180, // [E] from the photos
  },
  badge: { x: 118, y: 18, w: 46 }, // VICTROLA, white, the grille's bottom right [P7]
  colors: { bamboo: '#f1dcb4', bambooShade: '#9a7f9a', black: '#26232b', mesh: '#1d1b22', platter: '#c9cbd2', silver: '#dcdee5', display: '#5fb7ff', label: '#f6efe3' },
}

export const deckY = EW.cab // the top's surface
export const platterTop = deckY + EW.platter.h

/** where the stylus is, for the arm turned by `a` (radians, toward the platter from straight forward) */
export function stylusAt(a: number) {
  const { pivot, L } = EW.arm
  return { x: pivot.x - L * Math.sin(a), z: pivot.z + L * Math.cos(a) }
}
/** the arm's angle for the stylus at radius r from the spindle (the swing toward the platter that reaches it) */
export function angleFor(r: number) {
  const { pivot, L } = EW.arm
  const dx = pivot.x - EW.platter.x
  const dz = pivot.z - EW.platter.z
  const D = Math.hypot(dx, dz)
  // the stylus on the circle of radius L round the pivot, at r from the spindle: the angle at the pivot (law of cosines)
  const c = (L * L + D * D - r * r) / (2 * L * D)
  const at = Math.acos(Math.max(-1, Math.min(1, c)))
  // the direction from the pivot to the spindle, as an arm angle; then turned back by `at` (the far side's the wrong one)
  const toSpindle = Math.atan2(dx, -dz) // (the angle a at which the arm would point at the spindle)
  return toSpindle - at
}
export const radiusAtAngle = (a: number) => {
  const s = stylusAt(a)
  return Math.hypot(s.x - EW.platter.x, s.z - EW.platter.z)
}

export type Check = { what: string; value: string; ok: boolean }
export function checkEastwood(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const P = EW.platter
  const lidTop = deckY + (EW.h - EW.cab)
  c('outside 322 × 312 [M]', `${EW.w} × ${EW.d}`, EW.w === 322 && EW.d === 312)
  c('131 high with the lid shut [M]', `${EW.cab} + lid ${EW.h - EW.cab} = ${lidTop}`, lidTop === 131)
  c('the strip + deck + back fill the depth', `${EW.strip} + ${EW.deck.z1 - EW.deck.z0} + ${EW.back + 2} = ${EW.strip + (EW.deck.z1 - EW.deck.z0) + EW.back + 2}`, EW.strip + (EW.deck.z1 - EW.deck.z0) + EW.back + 2 === EW.d)
  c('platter inside the deck', `x ${P.x - P.r}…${P.x + P.r}, z ${P.z - P.r}…${P.z + P.r}`, P.x - P.r > -EW.w / 2 + EW.side && P.z - P.r > EW.deck.z0 && P.z + P.r < EW.deck.z1)
  const over = -(P.x - 150.8) - EW.w / 2
  c('a 12" overhangs the left side by about an inch [G]', `${over.toFixed(0)} mm`, over > 15 && over < 40)
  const hold = Math.hypot(EW.arm.pivot.x - P.x, EW.arm.pivot.z - P.z)
  c('pivot to spindle about the arm’s length (it swings over the whole record) [MD]', `${hold.toFixed(1)} vs ${EW.arm.L}`, hold < EW.arm.L + 15 && hold > EW.arm.L - 15)
  const aOut = angleFor(146.05)
  const aIn = angleFor(60.3)
  c('the arm reaches the lead-in (r 146) and the run-out (r 60)', `${((aOut * 180) / Math.PI).toFixed(1)}° … ${((aIn * 180) / Math.PI).toFixed(1)}°`, Math.abs(radiusAtAngle(aOut) - 146.05) < 0.01 && Math.abs(radiusAtAngle(aIn) - 60.3) < 0.01 && aIn > aOut && aOut > 0)
  const rest = stylusAt(EW.arm.rest)
  c('at rest, the stylus off the platter', `r ${Math.hypot(rest.x - P.x, rest.z - P.z).toFixed(0)} > ${P.r}`, Math.hypot(rest.x - P.x, rest.z - P.z) > 150.8)
  c('at rest, the stylus inside the deck', `(${rest.x.toFixed(0)}, ${rest.z.toFixed(0)})`, rest.z < EW.deck.z1 && rest.x < EW.w / 2 - EW.side)
  const sweep = [60.3, 100, 146.05].map((r) => stylusAt(angleFor(r))).every((s) => s.z < EW.deck.z1)
  c('the head stays behind the strip as it swings', sweep ? 'yes' : 'no', sweep)
  c('the arm clears a record on the platter', `${EW.arm.height} > ${P.h} + 1.8`, EW.arm.height > P.h + 1.8 + 3)
  const k = EW.controls.knobs
  c('knobs Ø 20 and 27, the big one 1.3× [P7][G]', `${2 * k.small.r} · ${2 * k.big.r} (${(k.big.r / k.small.r).toFixed(2)}×)`, Math.abs(k.big.r / k.small.r - 1.3) < 0.08)
  c('the knobs inside the strip', `${k.big.x + k.big.r} < ${EW.w / 2 - EW.side}`, k.big.x + k.big.r < EW.w / 2 - EW.side - 5)
  const b = EW.controls.buttons.xs
  c('five buttons in a row, left of the display [M]', b.map((x) => x.toFixed(0)).join(', '), b.length === 5 && b.every((x, i) => !i || x > b[i - 1]) && b[4] < EW.controls.display.x0)
  c('display, jack, knobs in order, left to right [M]', `${EW.controls.display.x1} < ${EW.controls.jack.x} < ${k.small.x} < ${k.big.x}`, EW.controls.display.x1 < EW.controls.jack.x && EW.controls.jack.x < k.small.x - k.small.r && k.small.x + k.small.r < k.big.x - k.big.r)
  c('the lid clears the pivot block', `${EW.h - EW.cab} > ${EW.arm.block.h + 6}`, EW.h - EW.cab > EW.arm.block.h + 6)
  return out
}
