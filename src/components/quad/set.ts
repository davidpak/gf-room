/**
 * A stretch of the Quad (toy scale, mm; +X east, +Z toward the camera): an island of lawn with the
 * brick walk running through it, a row of cherries along its far side and one on the near side
 * (spaced, so you can always see what's going on), lamp posts along the walk, benches facing it.
 * Everything else on the Quad grows from these.
 */
export const SET = {
  island: { w: 7600, d: 4600, corner: 1300, t: 160 },
  walk: { z: 0, w: 720 }, // its middle line, its width
  trees: [
    { x: -2650, z: -1300, model: 0, rot: 0.3 },
    { x: -700, z: -1350, model: 1, rot: 2.1 },
    { x: 1300, z: -1250, model: 2, rot: 4.0 },
    { x: 3000, z: -1300, model: 3, rot: 1.2 },
    { x: 2350, z: 1600, model: 3, rot: 2.6 }, // (one on the near side, off to the right: the view stays open)
  ],
  lamps: [
    { x: -1650, z: -520 },
    { x: 350, z: -520 },
    { x: 2250, z: -520 },
    { x: -300, z: 540 },
  ],
  benches: [
    { x: -650, z: -600, rot: 0 },
    { x: 1300, z: -600, rot: 0 },
    { x: 900, z: 640, rot: Math.PI },
  ],
  start: { x: -3100, z: 0, heading: Math.PI / 2 },
  petals: { fallen: 3200, falling: 150 },
}

/** the island's half width at depth z, `inset` in from its edge (its corners are rounded) */
export function halfWidthAt(z: number, inset = 0) {
  const { w, d, corner } = SET.island
  const W = w / 2 - inset
  const D = d / 2 - inset
  const r = corner - inset
  const dz = Math.abs(z) - (D - r)
  if (dz <= 0) return W
  if (dz >= r) return 0
  return W - r + Math.sqrt(r * r - dz * dz)
}
export const inIsland = (x: number, z: number, inset = 0) => Math.abs(z) < SET.island.d / 2 - inset && Math.abs(x) < halfWidthAt(z, inset)
export const onWalk = (x: number, z: number, pad = 0) => Math.abs(z - SET.walk.z) < SET.walk.w / 2 + pad
/** where tufts and petals keep off: the trunks' feet, the lamps' bases (x, z, r) */
export const keepClear: [number, number, number][] = [...SET.trees.map((t) => [t.x, t.z, 130] as [number, number, number]), ...SET.lamps.map((l) => [l.x, l.z, 60] as [number, number, number])]
