import { BOOKS } from './spec'

/**
 * Where things are on the blanket (real mm, its frame: x across its 60", z along its 80", its middle at
 * the origin; its near end -z): the basket by the near left corner, two books stacked to the right, the
 * little one left open face down by the far left (the far right corner's the one turned back).
 */
export const LAYOUT = {
  y: 6, // (the blanket's top, roughly)
  basket: { x: -360, z: -500, rot: 0.25 },
  stack: [
    { k: 1, x: 380, z: 360, y: 0, rot: Math.PI - 0.5 }, // (turned to read from the near end)
    { k: 0, x: 372, z: 352, y: BOOKS[1].t, rot: Math.PI - 0.32 },
  ],
  open: { k: 2, x: -330, z: 470, rot: 1.05 },
}
