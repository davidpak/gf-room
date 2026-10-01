import { BOOKS } from './spec'

/**
 * Where things are on the blanket (real mm, its frame: x across its 60", z along its 80", its middle at
 * the origin; its near end -z): the basket by the near left corner, two books stacked to the right, the
 * little one open face up toward the far left (the far right corner's the one turned back). The books'
 * heads are toward -z, so they read from +z. Where sandwiches taken out of the basket come to lie, in
 * front of it.
 */
export const LAYOUT = {
  y: 6, // (the blanket's top, roughly)
  basket: { x: -360, z: -500, rot: 0.25 },
  stack: [
    { k: 1, x: 380, z: 330, y: 0, rot: -0.5 },
    { k: 0, x: 372, z: 322, y: BOOKS[1].t, rot: -0.3 },
  ],
  open: { x: -260, z: 430, rot: 0.18 },
  /** where taken sandwiches land: x, z, which way they lie */
  landing: [
    [-440, -240, 0.5],
    [-250, -210, -0.35],
    [-120, -340, 1.3],
    [-560, -120, 2.2],
  ] as [number, number, number][],
}
