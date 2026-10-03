/**
 * Rina's alarm clock: a cream plastic wedge, a mains LED clock of the plain kind, millimetres.
 *
 * Sources
 *   [P]  her photo (public/reference/alarm-clock.png): seen from its left side, its front to the right. A loaf of
 *        cream plastic, tall and round at the back, the top sloping a little down toward the front, then the front
 *        cut back in a wedge, the display on the wedge (red digits); a grey stadium-shaped panel along the top with
 *        four buttons in a row (back to front: a dark pill, two small light rounds, a bigger light round), the
 *        top shell sitting over a slightly smaller base (the seam round the lower side). Measured against the Ice
 *        Breakers puck in front of it (70 across, a little nearer): about 2.3 puck widths long, its back a half of
 *        its length tall
 *   [E]  estimates where the photo can't say: its width (never seen face on), the wedge's angle, the corners, the
 *        display's size (the usual 0.9" LED of such clocks), the weight
 *
 * Its frame: the middle of its footprint at x 0, z 0, its bottom on y 0, its front (the display) toward +z. The
 * side profile (z, y) goes round: the back's foot, the front's foot, the wedge's toe, up the wedge to where the top
 * begins, back along the top to the round back.
 */
export const CLOCK = {
  len: 165, // [P] back to front
  w: 108, // [E] across
  h: 88, // [P] at the back
  top: { z: 30, y: 70 }, // [P] where the top ends and the wedge begins
  toe: { y: 15 }, // [P] the little upright lip at the front's foot, below the wedge
  round: { back: 30, top: 14, toe: 5, foot: 4 }, // [P][E] corners: the round back, the wedge's brow, its toe, the feet
  edge: 7, // [E] the long edges down each side, rounded
  panel: { len: 64, w: 32, t: 2.4, proud: 1 }, // [P] the grey stadium on the top's straight stretch
  buttons: { d: [10, 8, 8, 13], at: [-21, -8, 4, 19], h: 2.6, travel: 1.4 }, // [P] along the panel, back to front
  seam: { y: 9, inset: 1.2 }, // [P] the base below the shell, a hair smaller all round (below the toe: square corners)
  lens: { w: 84, h: 44, t: 2.2, proud: 0.8, r: 5 }, // [E] the smoked window on the wedge
  digits: { h: 22, w: 12, gap: 4, colon: 8, stroke: 2.6 }, // [E] 0.9" seven-segment digits
  mass: 0.3, // [E] kg
  colors: { body: '#efe6cc', panel: '#8d8b9b', pill: '#5a586a', button: '#efeadf', lens: '#1c0e12', lit: '#ff3322', unlit: '#3a1719' },
}

const C = CLOCK
/** the profile's corners (z, y) and their radii, round from the back's foot */
export function profile() {
  const z0 = -C.len / 2
  const z1 = C.len / 2
  return {
    points: [
      [z0, 0],
      [z1, 0],
      [z1, C.toe.y],
      [C.top.z, C.top.y],
      [z0, C.h],
    ] as [number, number][],
    radii: [C.round.foot, C.round.foot, C.round.toe, C.round.top, C.round.back],
  }
}

/** a straight stretch of the profile, between two corners, less what their rounding takes off each end:
 *  where along it (0..len), its direction, its outward normal, and the tilt (about x) that turns +y to that normal */
export function stretch(a: number, b: number) {
  const { points, radii } = profile()
  const [az, ay] = points[a]
  const [bz, by] = points[b]
  const L = Math.hypot(bz - az, by - ay)
  const dz = (bz - az) / L
  const dy = (by - ay) / L
  // (the rounding takes min(r, half of each side) off each end, as roundedPolygon does)
  const cut = (i: number, other: number) => Math.min(radii[i], L / 2, other / 2)
  const side = (i: number, j: number) => Math.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1])
  const n = points.length
  const ka = cut(a, side(a, (a - 1 + n) % n))
  const kb = cut(b, side(b, (b + 1) % n))
  // outward: the profile runs round counter-clockwise in (z, y), so outward is the direction turned clockwise
  const nz = dy
  const ny = -dz
  return {
    from: [az + dz * ka, ay + dy * ka] as [number, number],
    to: [bz - dz * kb, by - dy * kb] as [number, number],
    len: L - ka - kb,
    dir: [dz, dy] as [number, number],
    normal: [nz, ny] as [number, number],
    tilt: Math.atan2(nz, ny),
  }
}
/** the top's straight stretch and the wedge's */
export const TOP = () => stretch(3, 4)
export const WEDGE = () => stretch(2, 3)

export type Check = { what: string; value: string; ok: boolean }
export function checkClock(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const T = TOP()
  const W = WEDGE()
  c('about 2.3 pucks long, its back over half its length tall [P]', `${C.len} × ${C.h} (${(C.len / 70).toFixed(2)} pucks)`, Math.abs(C.len / 70 - 2.3) < 0.15 && C.h / C.len > 0.5 && C.h / C.len < 0.6)
  c('the seam low round the side, under the wedge’s toe [P]', `y ${C.seam.y}, the toe ${C.toe.y}`, C.seam.y < C.toe.y - 3 && C.seam.y > 4)
  c('the top slopes a little down to the front [P]', `${((Math.atan2(C.h - C.top.y, C.top.z + C.len / 2) * 180) / Math.PI).toFixed(1)}°`, C.top.y < C.h && C.h - C.top.y < 25)
  const lean = 90 - (W.tilt * 180) / Math.PI
  c('the display leans back, facing up and out [P][E]', `${lean.toFixed(0)}° back from upright`, W.tilt > 0.5 && W.tilt < 1.1)
  c('the panel fits the top’s straight stretch', `${C.panel.len} on ${T.len.toFixed(1)}`, C.panel.len <= T.len - 4)
  c('the panel inside the edges', `${C.panel.w} on ${C.w - 2 * C.edge}`, C.panel.w < C.w - 2 * C.edge - 10)
  const B = C.buttons
  // (a stadium: a round button on its middle line is in it while it's clear of the rounded ends)
  const inPanel = B.at.every((z, i) => Math.abs(z) + B.d[i] / 2 <= C.panel.len / 2 - 3 && B.d[i] < C.panel.w - 6)
  c('the four buttons in the panel', inPanel ? 'inside' : 'over its edge', inPanel)
  let apart = true
  for (let i = 1; i < B.at.length; i++) if (B.at[i] - B.at[i - 1] < (B.d[i] + B.d[i - 1]) / 2 + 3) apart = false
  c('the buttons a finger’s gap apart', apart ? '3 mm or more' : 'touching', apart)
  c('the lens fits the wedge', `${C.lens.h} on ${W.len.toFixed(1)}, ${C.lens.w} on ${C.w - 2 * C.edge}`, C.lens.h <= W.len - 6 && C.lens.w <= C.w - 2 * C.edge - 6)
  const D = C.digits
  const row = 4 * D.w + 3 * D.gap + D.colon
  c('four digits and the colon fit the lens', `${row} of ${C.lens.w}, ${D.h} of ${C.lens.h}`, row <= C.lens.w - 10 && D.h <= C.lens.h - 12)
  // it stands: its middle (a solid of that profile) over its footprint
  const { points } = profile()
  let A = 0
  let cz = 0
  for (let i = 0; i < points.length; i++) {
    const [z1, y1] = points[i]
    const [z2, y2] = points[(i + 1) % points.length]
    const k = z1 * y2 - z2 * y1
    A += k
    cz += (z1 + z2) * k
  }
  cz /= 3 * A
  c('it stands: its weight over its foot', `centre at z ${cz.toFixed(1)} of ±${C.len / 2}`, Math.abs(cz) < C.len / 2 - 20)
  return out
}
