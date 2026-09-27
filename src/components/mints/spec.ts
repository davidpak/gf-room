import { Vector3 } from 'three'

/**
 * Rina's Ice Breakers spearmint mints: the 1.5 oz (42 g) puck and the mints in it, millimetres.
 * References (public/reference/): icebreakers-top.webp and icebreakers-bottom.webp (the maker's
 * product shots, straight down on the lid and the base: used as the printed label and base, and
 * measured), icebreakers-angle.png (a three-quarter view: its thickness); hersheyland.com and the
 * base's print: "Servings: about 53, Serv. size: 1 mint (0.8g)".
 *
 * Measured in the top shot (the puck's 70 is 801 px, 11.44 px/mm): the green label is 689 px across
 * (60.2: a 4.9 white rim round it); the white tabs, part of the rim, flip up out of it: "one" 13.5
 * wide, reaching in to 23.9 from the middle; "many" 10.5 wide, in to 25.3 (a pull tab: the flap it
 * lifts is a slice of the printed lid, hinged across it, as the wintergreen photo shows open).
 * In the angled shot the face is tipped ~22° and the side shows ~0.37 of the thickness: ~15.5.
 *
 *   mint   0.8 g of pressed sorbitol (~1.55 g/cm³) is ~0.5 cm³: a bevelled disc 13 across, 3.9 thick,
 *          so the 53 lie in three layers of up to 19, with a little room over them to rattle
 *   puck   70 across, 16 tall: 2.2 of floor and lid, 0.5 of label over the lid, the cavity 13.3 tall
 *   "one"  under its tab, a slot through the lid and a notch in the top of the wall under it, one
 *          flat mint high (the tab has a skirt down the side over it): tipped, the mints slide out
 *          through it one at a time (two together are too thick)
 *          (wider than a mint, shallower than one): they come out one at a time
 *   "many" under its flap, everything past a chord, out to the wall: several pour at once
 *   base   printed green all over (the nutrition facts, the barcode)
 *
 * Frame: origin at the puck's middle, +Y out of the label, "one" toward +Z, "many" toward -Z.
 */
export const MINTS = {
  puck: { r: 35, h: 16, wall: 1.4, floor: 1.1, lid: 1.1, rim: 4.9, rimT: 1.4, edge: 2.5 }, // rimT: the white rim's thickness at the top
  mint: { d: 13, t: 3.9, bevel: 1, mass: 0.00078 },
  count: 53,
  // the openings through the lid (out to the wall), and the tab / flap over each
  one: { hole: { w: 13.3, z0: 25.2, notch: 5.8 }, tab: { w: 13.5, z0: 23.9 } }, // notch: down the wall under the lid, one flat mint high
  many: { hole: { z0: 17.5 }, tab: { w: 10.5, z0: 25.3 }, flap: { z0: 15 } }, // flap: its hinge, across the puck
  open: (112 * Math.PI) / 180, // how far a tab (or the flap) flips up
  mass: 0.012, // the empty puck (kg)
  // the product shots: size (px), the puck's middle in it, px per mm
  photo: {
    top: { src: '/textures/icebreakers-top.webp', size: 908, cx: 453.5, cy: 453, k: 801 / 70 },
    bottom: { src: '/textures/icebreakers-bottom.webp', size: 908, cx: 453.5, cy: 453.5, k: 797 / 70 },
  },
  color: {
    white: '#f5f4f0',
    inside: '#e4e2dc',
    base: '#3f8a3a', // the base's green round its edge
  },
}
const P = MINTS.puck
/** the label's surface (a hair below the rim's top) */
export const LABEL_Y = P.h / 2 - 0.5
/** the label disc's radius (inside the rim) */
export const LABEL_R = P.r - P.rim
/** the openings stop this far inside the label's edge (the rim covers the sliver) */
export const HOLE_R = LABEL_R - 0.3
/** the cavity: inner radius, and its floor and ceiling (the lid's underside) */
export const CAVITY = { r: P.r - P.wall, y0: -P.h / 2 + P.floor, y1: LABEL_Y - P.lid }
/** the tabs' tops stand a touch proud of the rim */
export const TAB_TOP = P.h / 2 + 0.25

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
  const r = m.d / 2
  const vol = (Math.PI * r * r * m.t - 2 * (2 * Math.PI * (r - m.bevel) * m.bevel * m.bevel * (1 - Math.PI / 4))) / 1000 // cm³, less its rounded edges
  add('a mint weighs 0.8 g (base: 1 mint, 0.8g)', Math.abs(vol * 1.55 - 0.8) < 0.06, `${(vol * 1.55).toFixed(2)} g`)
  add('53 mints (base: about 53)', mintSpots().length === MINTS.count, `${mintSpots().length}`)
  let fit = true
  for (const s of mintSpots()) if (Math.hypot(s.x, s.z) + r > CAVITY.r - 0.2 || s.y + m.t / 2 > CAVITY.y1 || s.y - m.t / 2 < CAVITY.y0 - 0.01) fit = false
  add('they all fit in the cavity', fit, `${(2 * CAVITY.r).toFixed(1)} × ${(CAVITY.y1 - CAVITY.y0).toFixed(1)} inside`)
  add('label 60.2 across (photo)', Math.abs(2 * LABEL_R - 60.2) < 0.5, `${(2 * LABEL_R).toFixed(1)}`)
  add('thickness ~15.5 (angled photo)', Math.abs(P.h - 15.5) < 1, `${P.h} mm`)
  const one = MINTS.one.hole
  add('"one": one flat mint at a time through its notch', one.w > m.d + 0.2 && one.w < 2 * m.d && one.notch > m.t + 0.5 && one.notch < 2 * m.t - 0.5, `${one.w} wide, ${one.notch} high`)
  const many = MINTS.many.hole
  const chord = 2 * Math.sqrt(HOLE_R ** 2 - many.z0 ** 2)
  add('"many": several pour at once, lying flat', chord > 3 * m.d && CAVITY.r - many.z0 > m.d + 1, `${chord.toFixed(0)} across, ${(CAVITY.r - many.z0).toFixed(1)} deep`)
  add('"one" tab covers its slot; the flap covers "many"', MINTS.one.tab.w >= one.w && MINTS.one.tab.z0 < one.z0 - 1 && MINTS.many.flap.z0 < many.z0 - 2, `tab ${MINTS.one.tab.w} over ${one.w}`)
  add('tabs as in the photo (13.5 / 10.5 wide, in to 23.9 / 25.3)', MINTS.one.tab.w === 13.5 && MINTS.many.tab.w === 10.5, `${MINTS.one.tab.z0} / ${MINTS.many.tab.z0}`)
  return results
}
