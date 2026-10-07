/**
 * Her little things on the desk, millimetres: the lotion, the Vaseline, a hair tie, her watch, her lanyard.
 *
 * Sources
 *   [P]  her photos: public/reference/room-desk-wall.jpg (day: the green pump bottle far left; front right a black
 *        hair tie, her white watch on its white sport band, the navy COOPESA lanyard lying in loops with keys and
 *        a pale blue badge holder with a slot; a round navy fob too, left out: it only crowded the keys) and room-desk-night.jpg (the lotion by the lamp, a
 *        Vaseline Lip Therapy with its blue lid by the pen cup, the watch lying beside it in a loose curl)
 *   [E]  the products' own sizes: a 16 oz pump bottle; a Vaseline Lip Therapy 20 g pot; Apple Watch 41 mm
 *        (41 × 35 × 10.7) on a 41 mm sport band (20 wide); a ¾" (19 mm) lanyard, 36" round; a vertical card holder
 *
 * Each one's frame: the middle of its footprint at x 0, z 0, its bottom on y 0, its front toward +z.
 */
export const LOTION = {
  body: { r: 30, h: 150, shoulder: 14 }, // [E][P] 60 across, its shoulder rounding in to the neck
  label: { h: 52 }, // [P] the white band round its foot (green above)
  collar: { r: 15, h: 14 }, // [E] the pump's screw collar
  stem: { r: 4.5, h: 12 }, // [E] the stem showing above the collar
  head: { r: 12, h: 12, spout: 24, spoutR: 4 }, // [E][P] the white head, its spout toward the front
  travel: 8, // [E] how far the head presses down
  mass: 0.3, // [E] kg, about half full
  colors: { body: '#86c93f', label: '#f2f1ea', pump: '#f6f5f0' },
}
/** the bottle's top (the collar sits on it) */
export const LOTION_TOP = LOTION.body.h
export const LOTION_H = LOTION.body.h + LOTION.collar.h + LOTION.stem.h + LOTION.head.h

export const VASELINE = {
  r: 21, // [E] a 20 g Lip Therapy pot: about 42 across
  body: 22, // [E] the white pot
  lid: 12, // [P][E] the blue screw lid
  mass: 0.035, // [E] kg
  colors: { body: '#f4f3ee', lid: '#2d55b3', logo: '#1f4aa8', band: '#a8693c' },
}

export const HAIRTIE = {
  R: 20, // [P] about 45 across outside, as it lies (by the badge holder, 58 wide)
  r: 2.2, // [E] a fabric elastic, 4.4 thick
  wave: { n: 5, out: 1.6, up: 1.4 }, // [E] how it lies: a little wavy round, a little up and down
  mass: 0.002, // [E] kg
  color: '#1c1b20',
}

export const WATCH = {
  case: { h: 41, w: 35, t: 10.7, r: 9.5 }, // [E] Apple Watch 41 mm: 41 long (along the band) × 35 × 10.7
  screen: { inset: 2.2 }, // [E] the black glass to the case's edge
  crown: { r: 3.4, len: 3 }, // [E] the digital crown on its right side
  band: { w: 20, t: 2.6, pitch: 7, hole: 1.7 }, // [E] the 41 mm sport band, its pin holes along the long strap
  // [P] how it lies: on its back, the straps rising from both ends of the case in a loose open curl. Their middle
  // lines in (z, y), from the case's lug outward
  long: [[-20.5, 4], [-36, 8], [-47, 22], [-46, 40], [-34, 54], [-16, 60], [2, 58]] as [number, number][],
  short: [[20.5, 4], [36, 9], [46, 24], [43, 40], [30, 50]] as [number, number][],
  mass: 0.055, // [E] kg, the watch and its band
  colors: { case: '#eceae5', glass: '#121216', band: '#f1efe8', hole: '#bdbab2' },
}

export const LANYARD = {
  w: 19, // [E] ¾"
  t: 1.2, // [E]
  loop: 914, // [E] 36" round: two strands of 457
  gap: 4, // [E] between the two strands, lying side by side
  // [P] the strands' middle line, lying in a loose C on the desk, from the fold (the neck end) to the clip, in (x, z)
  path: [[-40, -105], [40, -112], [100, -70], [118, 0], [92, 70], [30, 108], [-40, 104], [-92, 70]] as [number, number][],
  clip: { w: 22, len: 16, t: 4 }, // [E] the metal crimp where both ends meet, a swivel hook on it
  ring: { R: 12, r: 1.1 }, // [E] the split ring, the keys on it
  keys: [{ len: 56, w: 22, turn: 1.45 }, { len: 50, w: 20, turn: 2.1 }], // [E] two house keys, fanned to one side of the ring (radians from the way the strap runs)
  badge: { w: 58, h: 92, t: 3, r: 5, slot: { w: 18, h: 5, from: 8 } }, // [P][E] the pale blue holder, its slot at the top
  text: 'COOPESA', // [P] printed along it, white, with a pale blue chevron between
  mass: 0.07, // [E] kg, with its keys and badge
  colors: { strap: '#1f3b7a', print: '#ffffff', mark: '#7cc4ee', metal: '#c9c8c4', brass: '#d0b26a', badge: '#6ea7dc' },
}

export type Check = { what: string; value: string; ok: boolean }
type Out = Check[]
const add = (out: Out) => (what: string, value: string, ok: boolean) => out.push({ what, value, ok })

/** the length of a polyline */
export const polyLength = (pts: [number, number][]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)

export function checkTrinkets(): Check[] {
  const out: Out = []
  const c = add(out)
  const L = LOTION
  c('lotion: a pump bottle about 60 × 190 [P][E]', `${2 * L.body.r} × ${LOTION_H}`, Math.abs(2 * L.body.r - 60) <= 6 && Math.abs(LOTION_H - 190) <= 10)
  c('lotion: the white band low, green over most of it [P]', `${L.label.h} of ${L.body.h}`, L.label.h / L.body.h > 0.25 && L.label.h / L.body.h < 0.45)
  c('lotion: the head presses down without hitting the collar', `${L.travel} of ${L.stem.h}`, L.travel < L.stem.h - 2)
  c('lotion: the spout inside the bottle’s width', `${L.head.r + L.head.spout} of ${L.body.r + 10}`, L.head.r + L.head.spout <= L.body.r + 10)
  const V = VASELINE
  c('Vaseline: a 20 g pot about 42 × 34 [E]', `${2 * V.r} × ${V.body + V.lid}`, Math.abs(2 * V.r - 42) <= 4 && Math.abs(V.body + V.lid - 34) <= 4)
  c('Vaseline: the lid about a third of it, as in the photo [P]', `${(V.lid / (V.body + V.lid)).toFixed(2)}`, V.lid / (V.body + V.lid) > 0.25 && V.lid / (V.body + V.lid) < 0.45)
  const H = HAIRTIE
  const outer = 2 * (H.R + H.r + H.wave.out)
  c('hair tie: about 45 across as it lies [P]', `${outer.toFixed(1)}`, outer > 40 && outer < 52)
  const W = WATCH
  c('watch: Apple Watch 41 mm [E]', `${W.case.h} × ${W.case.w} × ${W.case.t}`, W.case.h === 41 && W.case.w === 35 && W.band.w < W.case.w)
  const longL = polyLength(W.long)
  const shortL = polyLength(W.short)
  c('watch: the straps a sport band’s S/M lengths [E]', `${longL.toFixed(0)} and ${shortL.toFixed(0)}`, longL > 90 && longL < 125 && shortL > 60 && shortL < 90)
  const [ez, ey] = W.long[W.long.length - 1]
  const [sz, sy] = W.short[W.short.length - 1]
  c('watch: the curl open, the straps’ ends apart', `${Math.hypot(ez - sz, ey - sy).toFixed(0)} apart`, Math.hypot(ez - sz, ey - sy) > 15)
  c('watch: the straps start at the case’s lugs', `${W.long[0][0]}, ${W.short[0][0]}`, Math.abs(W.long[0][0]) === W.case.h / 2 && W.short[0][0] === W.case.h / 2)
  const Y = LANYARD
  const strand = polyLength(Y.path)
  c('lanyard: its loop 36" round, two strands [E]', `2 × ${strand.toFixed(0)} = ${(2 * strand).toFixed(0)} of ${Y.loop}`, Math.abs(2 * strand - Y.loop) < 0.12 * Y.loop)
  c('lanyard: ¾" wide [E]', `${Y.w}`, Y.w >= 15 && Y.w <= 22)
  // the C: the ends apart, so the strands don't lie over each other
  const [a0, b0] = Y.path[0]
  const [a1, b1] = Y.path[Y.path.length - 1]
  c('lanyard: a loose C, its ends apart [P]', `${Math.hypot(a0 - a1, b0 - b1).toFixed(0)} apart, the strands ${2 * Y.w + Y.gap} wide`, Math.hypot(a0 - a1, b0 - b1) > 2 * (2 * Y.w + Y.gap))
  c('lanyard: a card holder’s size [E]', `${Y.badge.w} × ${Y.badge.h}`, Y.badge.w > 54 && Y.badge.w < 64 && Y.badge.h > 86 && Y.badge.h < 100)
  return out
}
