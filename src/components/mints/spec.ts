import { Vector3 } from 'three'

/**
 * Rina's Ice Breakers spearmint mints: the 1.5 oz (42 g) puck and the mints in it, millimetres.
 * References: David's photos of the spearmint puck (green faceted label: SUGAR FREE MINTS, with
 * COOLING CRYSTALS, ICE BREAKERS MINTS spearmint, NET WT 1.5 OZ (42 g); white flip tabs "one" at the
 * top and "many" at the bottom) and of the wintergreen ones open (the same pucks: one flap lets out a
 * single mint, the other pours); hersheyland.com: "Servings Per Container about 53", 1 mint each.
 *
 * Sizes, worked out (no maker's dimensions published):
 *   mint    42 g / 53 = 0.8 g; a pressed sorbitol tablet (~1.45 g/cm³) is ~0.55 cm³: a bevelled disc
 *           12.5 across and 4.4 thick (the photos' tablets are ~2.8 times as wide as thick)
 *   puck    53 of those lie in three layers of up to 19 (hex packed, 64 across), with room over
 *           them to rattle: a cavity 66 across and 20 tall, so the puck is 70 across and 23 tall
 *           (retail listings stack 8 pucks in 7.1 in: 0.89 in, 22.6 mm each)
 *   label   a green disc set into a white rim ~3.5 wide
 *   flaps   both openings run out to the rim, where the mints end up when it's tipped. "one": a
 *           small white tab over a notch one mint lying flat just fits through (wider and deeper than
 *           a mint, not two). "many": a wide flap, a
 *           slice of the printed label hinged across the puck, with the same small white tab at its
 *           edge (the wintergreen photo: open, it lifts the print with it), over an opening several
 *           can pour out of at once. Both flip up
 *
 * Frame: origin at the puck's middle, +Y out of the label, "one" toward +Z, "many" toward -Z.
 */
export const MINTS = {
  puck: { r: 35, h: 23, wall: 2, floor: 1.6, lid: 1.4, rim: 3.5, edge: 3 }, // edge: the rounding round its rim
  mint: { d: 12.5, t: 4.4, bevel: 1.1, mass: 0.0008 },
  count: 53,
  // the openings through the lid, out from the middle to the rim, and the tab / flap over each
  one: { hole: { w: 14.5, z0: 17.5 }, tab: { w: 19, z0: 15.5 } }, // a notch
  many: { hole: { z0: 17.5 }, tab: { w: 19, z0: 21 }, flap: { z0: 15 } }, // everything past a chord; flap: its hinge
  open: (112 * Math.PI) / 180, // how far a tab flips up
  mass: 0.012, // the empty puck (kg)
  color: {
    white: '#f4f2ec',
    inside: '#e3e0d8',
    mint: '#f7f7f2',
    speck: ['#2f8f55', '#5dbb7c', '#9ad9ad'],
  },
}
const P = MINTS.puck
/** the label's surface (set a hair below the rim's top) */
export const LABEL_Y = P.h / 2 - 0.6
/** the cavity: inner radius, and its floor and ceiling (the lid's underside) */
export const CAVITY = { r: P.r - P.wall, y0: -P.h / 2 + P.floor, y1: LABEL_Y - P.lid }
/** the label disc's radius (inside the rim) */
export const LABEL_R = P.r - P.rim
/** the openings stop this far inside the label's edge (the rim's lip covers the sliver) */
export const HOLE_R = LABEL_R - 0.4

/** where the mints start, in the puck's frame: three layers of up to 19, hex packed */
export function mintSpots() {
  const m = MINTS.mint
  const spacing = m.d + 0.3
  const ring: [number, number][] = [[0, 0]]
  for (let k = 0; k < 6; k++) ring.push([Math.cos((k * Math.PI) / 3) * spacing, Math.sin((k * Math.PI) / 3) * spacing])
  for (let k = 0; k < 6; k++) ring.push([Math.cos((k * Math.PI) / 3 + Math.PI / 6) * spacing * Math.sqrt(3), Math.sin((k * Math.PI) / 3 + Math.PI / 6) * spacing * Math.sqrt(3)])
  for (let k = 0; k < 6; k++) ring.push([Math.cos((k * Math.PI) / 3) * spacing * 2, Math.sin((k * Math.PI) / 3) * spacing * 2])
  const out: Vector3[] = []
  for (let layer = 0; layer < 3; layer++) {
    const y = CAVITY.y0 + m.t / 2 + 0.05 + layer * (m.t + 0.05)
    const turn = layer * 0.35 // each layer a little turned on the last, like a real pour
    for (const [x, z] of ring) out.push(new Vector3(x * Math.cos(turn) - z * Math.sin(turn), y, x * Math.sin(turn) + z * Math.cos(turn)))
  }
  return out.slice(0, MINTS.count)
}

/** is a point (puck frame) inside the cavity? (a mint's middle: in the tin, not loose) */
export const inCavity = (p: Vector3, slack = 1) => Math.hypot(p.x, p.z) < CAVITY.r + slack && p.y > CAVITY.y0 - slack && p.y < CAVITY.y1 + slack

/** The spec's own check. */
export function checkMints() {
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })
  const m = MINTS.mint
  const vol = (Math.PI * (m.d / 2) ** 2 * m.t - 2 * Math.PI * m.d * m.bevel * m.bevel * 0.2) / 1000 // cm³ (a little off for the bevels)
  add('a mint weighs 42 g / 53', Math.abs(vol * 1.45 - 0.79) < 0.08, `${(vol * 1.45).toFixed(2)} g`)
  add('53 mints', mintSpots().length === MINTS.count, `${mintSpots().length}`)
  const spots = mintSpots()
  let fit = true
  for (const s of spots) if (Math.hypot(s.x, s.z) + m.d / 2 > CAVITY.r - 0.2 || s.y + m.t / 2 > CAVITY.y1 || s.y - m.t / 2 < CAVITY.y0 - 0.01) fit = false
  add('they all fit in the cavity', fit, `${(2 * CAVITY.r).toFixed(0)} × ${(CAVITY.y1 - CAVITY.y0).toFixed(1)} inside`)
  add('puck height (8 in 7.1 in: 22.6)', Math.abs(MINTS.puck.h - 22.6) < 1, `${MINTS.puck.h} mm`)
  const one = MINTS.one.hole
  const oneDeep = HOLE_R - one.z0
  add('"one": a single mint slips out, lying flat', one.w > m.d + 1 && one.w < 2 * m.d && oneDeep > m.d + 0.8 && oneDeep < 2 * m.d, `${one.w} × ${oneDeep.toFixed(1)}`)
  const many = MINTS.many.hole
  const manyChord = 2 * Math.sqrt(HOLE_R ** 2 - many.z0 ** 2)
  add('"many": several pour at once', manyChord > 3 * m.d && HOLE_R - many.z0 > m.d + 0.8, `${manyChord.toFixed(0)} across, ${(HOLE_R - many.z0).toFixed(1)} deep`)
  const flapChord = 2 * Math.sqrt(LABEL_R ** 2 - MINTS.many.flap.z0 ** 2)
  add('"one" tab and "many" flap cover their openings', MINTS.one.tab.w > one.w + 3 && MINTS.one.tab.z0 < one.z0 - 1.5 && MINTS.many.flap.z0 < many.z0 - 2, `flap ${flapChord.toFixed(0)} across`)
  return results
}
