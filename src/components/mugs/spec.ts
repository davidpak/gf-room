/**
 * Rina's two cups on the desk, millimetres.
 *
 *   the tree mug   a tall white ceramic mug, a little flared, hand-painted in dark green: a Christmas tree with a star
 *                  on top on its front, a band of swirls round under the rim and another round the foot, a few little
 *                  stars about. A big C handle on its left as you face the tree
 *   the tumbler    a 20 oz double-walled stainless tumbler, powder-coated copper / rose gold, its lip bare steel,
 *                  straight sided and narrowing to its base, no lid
 *
 * Sources
 *   [P]  her photos: room-desk-poster.jpg (the mug, front left, its handle side on: the painting read off a zoom; the
 *        handle reaches out about half the mug's width and runs from just under the rim to a third up),
 *        room-desk-night.jpg and room-desk-window-bed-night.png (the tumbler, right: copper, a dark steel mouth)
 *   [E]  real products: a tall 16 oz ceramic mug (about 85 across, 120 tall, walls 4 to 5, 0.35 to 0.4 kg); a 20 oz
 *        tumbler (88 at the mouth, 70 at the base, 170 tall, 0.34 kg empty)
 *
 * Each one's frame: its footprint's middle at x 0, z 0, its bottom on y 0, its front toward +z (the mug's tree; the
 * mug's handle off to -x). Profiles are (r, y), round the y axis.
 */
export const TREE_MUG = {
  h: 120, // [E] tall
  rBase: 39.5, // [P][E] narrower at the foot...
  rRim: 42.5, // [E] ...flaring a little to the rim: 85 across
  wall: 4.5, // [E] the ceramic's thickness (the lip is half round over it)
  floor: 9, // [E] the inside floor's height
  foot: { recess: 2, ring: 4.5, round: 2.5 }, // [E] the glazed underside lifted 2 inside a foot ring 4.5 wide
  // [P] the handle: a C off the left side, from just under the rim to a third up, reaching out half the mug's width;
  // its ends sink `sink` into the wall (never through to the inside)
  handle: { top: 98, bottom: 40, reach: 37, r: 5.5, wide: 1.35, sink: 2.5 },
  cocoa: { y: 88, tilt: 0.6 }, // a little cocoa left in it (its surface stays level as the mug moves, up to `tilt` rad)
  // [P] the painting: the tree on the front (its trunk's foot to its star), the swirl bands
  tree: { y0: 22, y1: 90, w: 58 },
  bands: { top: 104, bottom: 13, curl: 4.2 },
  mass: { body: 0.36, handle: 0.04 }, // [E] kg
  colors: { glaze: '#f3eee4', paint: '#2e5a3e', cocoa: '#4a2a1f' },
}

export const TUMBLER = {
  h: 170, // [E] a 20 oz tumbler
  rTop: 44, // [E] 88 at the mouth
  rBase: 35, // [E] 70 at the base
  wall: 3.5, // [E] the double wall's rim, outer skin to inner
  floor: 16, // [E] the inside floor (the vacuum gap under it too)
  lip: 1.75,
  foot: { round: 4, recess: 1.5 },
  band: 5, // [P][E] the bare steel round the lip, above the copper
  mass: 0.34, // [E] kg, empty
  colors: { copper: '#b8785e', steel: '#cbc8c5', inside: '#99928f' },
}

const M = TREE_MUG
const T = TUMBLER
/** the mug's outside radius at height y */
export const mugR = (y: number) => M.rBase + ((M.rRim - M.rBase) * y) / M.h
/** the tumbler's outside radius at height y */
export const tumblerR = (y: number) => T.rBase + ((T.rTop - T.rBase) * y) / T.h

type P = [number, number]
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as P
  })

/** the mug's profile, outside (the axis under the foot, round the foot, up the side, over half the lip) and inside
 *  (the other half of the lip, down the inside wall, across the floor to the axis) */
export function mugProfile() {
  const F = M.foot
  const L = M.wall / 2
  const R0 = M.rBase
  const outer: P[] = [
    [0, F.recess],
    [R0 - F.ring - 1.5, F.recess],
    [R0 - F.ring, 0],
    ...arc(R0 - F.round, F.round, F.round, -Math.PI / 2, 0, 5),
  ]
  for (let k = 1; k <= 12; k++) {
    const y = F.round + ((M.h - L - F.round) * k) / 12
    outer.push([mugR(y), y])
  }
  outer.push(...arc(M.rRim - L, M.h - L, L, 0, Math.PI / 2, 6).slice(1))
  const inner: P[] = arc(M.rRim - L, M.h - L, L, Math.PI / 2, Math.PI, 6)
  const fil = 6 // the floor's fillet
  for (let k = 1; k <= 10; k++) {
    const y = M.h - L - ((M.h - L - (M.floor + fil)) * k) / 10
    inner.push([mugR(y) - M.wall, y])
  }
  const rf = mugR(M.floor + fil) - M.wall - fil
  inner.push(...arc(rf, M.floor + fil, fil, 0, -Math.PI / 2, 6).slice(1), [0, M.floor])
  return { outer, inner }
}

/** the handle's middle line (x, y), off the -x side, from its top end to its bottom end */
export function handleLine(): P[] {
  const H = M.handle
  const d = (y: number, out: number) => [-(mugR(y) + out), y] as P
  const span = H.top - H.bottom
  return [
    d(H.top, -H.sink),
    d(H.top + 3, H.reach * 0.38),
    d(H.top - 3, H.reach * 0.82),
    d(H.top - span * 0.3, H.reach),
    d(H.bottom + span * 0.3, H.reach * 0.93),
    d(H.bottom + span * 0.08, H.reach * 0.58),
    d(H.bottom, -H.sink),
  ]
}

/** the tumbler's profile, outside (its underside, the rounded foot, the side, half the lip) and inside */
export function tumblerProfile() {
  const F = T.foot
  const L = T.lip
  const outer: P[] = [[0, F.recess], [T.rBase - F.round - 3, F.recess], [T.rBase - F.round - 1, 0], ...arc(T.rBase - F.round, F.round, F.round, -Math.PI / 2, 0, 5).slice(1)]
  for (let k = 1; k <= 10; k++) {
    const y = F.round + ((T.h - L - F.round) * k) / 10
    outer.push([tumblerR(y), y])
  }
  outer.push(...arc(T.rTop - L, T.h - L, L, 0, Math.PI / 2, 5).slice(1))
  const inner: P[] = arc(T.rTop - L, T.h - L, L, Math.PI / 2, Math.PI, 5)
  const fil = 8
  for (let k = 1; k <= 8; k++) {
    const y = T.h - L - ((T.h - L - (T.floor + fil)) * k) / 8
    inner.push([tumblerR(y) - T.wall, y])
  }
  const rf = tumblerR(T.floor + fil) - T.wall - fil
  inner.push(...arc(rf, T.floor + fil, fil, 0, -Math.PI / 2, 6).slice(1), [0, T.floor])
  return { outer, inner }
}

/** the volume inside a profile up to its brim, ml (a solid of revolution, summed in slices) */
function holds(inner: P[], top: number) {
  const pts = inner.filter(([, y]) => y <= top).sort((a, b) => a[1] - b[1])
  let v = 0
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1]
    const [r1, y1] = pts[i]
    v += (Math.PI * (y1 - y0) * (r0 * r0 + r0 * r1 + r1 * r1)) / 3
  }
  return v / 1000
}

export type Check = { what: string; value: string; ok: boolean }
export function checkMugs(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const H = M.handle
  c('the mug: a tall mug’s size [E]', `${2 * M.rRim} across × ${M.h} tall`, Math.abs(2 * M.rRim - 85) <= 3 && Math.abs(M.h - 120) <= 5)
  c('flared a little to the rim [P]', `${2 * M.rBase} at the foot, ${2 * M.rRim} at the rim`, M.rRim > M.rBase && M.rRim - M.rBase < 6)
  const mp = mugProfile()
  const ml = holds(mp.inner, M.h - M.wall / 2)
  c('it holds about 16 oz (473 ml) [E]', `${ml.toFixed(0)} ml`, ml > 420 && ml < 560)
  c('real ceramic walls, a hollow inside', `walls ${M.wall}, the floor ${M.floor - M.foot.recess} over the underside`, M.wall >= 4 && M.wall <= 6 && M.floor - M.foot.recess >= 5)
  // the handle's ends: their middles inside the wall, the tube's round reaching neither the inside nor out the far side
  const ends = [H.top, H.bottom].every((y) => H.sink + 1.2 < M.wall && H.sink > 0)
  c('the handle grows out of the wall, not through it', `ends ${H.sink} into a ${M.wall} wall`, ends)
  const reach = H.reach + H.r
  c('the handle reaches out about half the mug’s width [P]', `${reach.toFixed(0)} of ${2 * M.rRim}`, reach / (2 * M.rRim) > 0.4 && reach / (2 * M.rRim) < 0.65)
  c('from just under the rim to a third up [P]', `${H.bottom} to ${H.top} of ${M.h}`, H.top < M.h - 12 && H.top > M.h * 0.72 && H.bottom > M.h * 0.25 && H.bottom < M.h * 0.42)
  // it stands: the handle's weight pulls its middle toward -x; still well over the foot ring
  const hx = -(mugR((H.top + H.bottom) / 2) + H.reach * 0.6)
  const cx = (hx * M.mass.handle) / (M.mass.body + M.mass.handle)
  c('it stands: its middle over its foot', `x ${cx.toFixed(1)} of ±${M.rBase - M.foot.ring}`, Math.abs(cx) < M.rBase - M.foot.ring - 10)
  c('the cocoa a sip down, clear of the brim even tipped', `at ${M.cocoa.y}, ${M.h - M.cocoa.y} under the rim`, M.cocoa.y > M.floor + 20 && M.h - M.cocoa.y > Math.tan(M.cocoa.tilt) * (mugR(M.cocoa.y) - M.wall) * 0.6)
  c('the tree fits the front between the bands [P]', `${M.tree.y0}–${M.tree.y1}, bands at ${M.bands.bottom} and ${M.bands.top}`, M.tree.y0 > M.bands.bottom + 6 && M.tree.y1 < M.bands.top - 8)
  // the tumbler
  c('the tumbler: a 20 oz tumbler’s size [E]', `${2 * T.rTop} at the mouth, ${2 * T.rBase} at the base, ${T.h} tall`, 2 * T.rTop === 88 && 2 * T.rBase === 70 && T.h === 170)
  const tl = holds(tumblerProfile().inner, T.h - T.lip)
  c('it holds about 20 oz (591 ml) [E]', `${tl.toFixed(0)} ml`, tl > 540 && tl < 680)
  c('straight sided, a gentle taper [P]', `${((Math.atan((T.rTop - T.rBase) / T.h) * 180) / Math.PI).toFixed(1)}° off upright`, T.rTop > T.rBase && (T.rTop - T.rBase) / T.h < 0.08)
  c('the steel lip a thin band over the copper [P][E]', `${T.band} of ${T.h}`, T.band >= 3 && T.band <= 8)
  return out
}
