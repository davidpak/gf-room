import { H_MIN, IN } from '../../lib/motor'

/**
 * FEZIBO 47.2 × 23.6 standing desk, millimetres, from public/reference/desk-dimensions.webp
 * and desk-product.webp.
 *
 * World frame: X = along the desk (left to right as you sit), Y = up, Z = toward you.
 * Origin = floor, centre of the desk footprint. All heights below are at the LOWEST
 * position; the "lift" group rises by (motor height - H_MIN).
 *
 * Legs are INVERTED (like the photos): the wide outer tube hangs from the frame and
 * moves with the top; the narrow inner tube stands on the foot and stays put. At the
 * lowest height only a short band of inner tube shows above the foot.
 *
 * Top: `corner` is the plan corner radius, `edge` the rounded bevel all round the slab. The
 * bevel is sized to read from across the room (a thin line of light along the edge), so it is
 * big for real furniture on purpose. It must stay under half the thickness (t > 2 * edge).
 */
const TOP_T = 25

export const DESK = {
  top: { w: 47.2 * IN, d: 23.6 * IN, t: TOP_T, corner: 30, edge: 8 },
  topUnder: H_MIN - TOP_T, // underside of the top at the lowest height
  legX: (31.6 * IN) / 2, // leg centre, ± along X

  foot: { length: 580, width: 68, height: 32, flat: 400, endHeight: 16, lift: 8 }, // lift = pad height
  pad: { r: 16, h: 8, inset: 45 },

  bracket: { w: 50, h: 28, len: 520 }, // side rails under the top, along Z
  beam: { h: 30, d: 40, z: -30 }, // crossbar between the legs
  outer: { w: 70, d: 58, len: 590 }, // moves with the top
  collar: { w: 74, d: 62, h: 12 }, // lip at the bottom of the outer tube
  inner: { w: 60, d: 48, len: 615 }, // fixed to the foot
  motor: { r: 24, len: 120 },

  hook: { tube: 3.5, x: 505, z: 200 }, // x: about halfway from leg to top edge, as in the photo
  keypad: { x: 250 },
}

/** Heights derived from the stack, at the lowest position. */
export const STACK = (() => {
  const bracketBottom = DESK.topUnder - DESK.bracket.h
  const outerTop = bracketBottom
  const outerBottom = outerTop - DESK.outer.len
  const footTop = DESK.foot.lift + DESK.foot.height
  const innerTop = footTop + DESK.inner.len
  return { bracketBottom, outerTop, outerBottom, footTop, innerTop }
})()
