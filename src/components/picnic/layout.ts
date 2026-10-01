import { BOOKS } from './spec'

/**
 * Where things are on the blanket (real mm, its frame: x across its 60", z along its 80", its middle at
 * the origin; its near end -z): the basket by the near left corner, two books stacked to the right, the
 * little one open face up toward the far left (the far right corner's the one turned back). The books'
 * heads are toward -z, so they read from +z. Where what's taken out of the basket comes to lie, in front
 * of it.
 */
export const LAYOUT = {
  y: 6, // (the blanket's top, roughly)
  basket: { x: -360, z: -500, rot: 0.25 },
  stack: [
    { k: 1, x: 380, z: 330, y: 0, rot: -0.5 },
    { k: 0, x: 372, z: 322, y: BOOKS[1].t, rot: -0.3 },
  ],
  open: { x: -260, z: 430, rot: 0.18 },
  /** where what's lifted out of the basket lands (by ./Picnic's CONTENTS): x, z, which way it lies */
  landing: [
    [-450, -250, 0.5],
    [-270, -215, -0.35],
    [-110, -330, 1.3],
    [-580, -130, 2.2],
    [-380, -110, -0.2],
    [-240, -60, 0.4],
    [-120, -170, 0.25],
  ] as [number, number, number][],
}
