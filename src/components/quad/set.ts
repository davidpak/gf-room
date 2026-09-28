/**
 * The Quad's first set piece (toy scale, mm; +X east, +Z toward you): an island of lawn with a
 * stretch of brick walk across its front, a cherry tree behind the walk, a bench under it facing the
 * walk, a lamp post beside the bench. Everything else on the Quad grows from these.
 */
export const SET = {
  island: { w: 2800, d: 1900, corner: 700, t: 150 },
  walk: { z: 430, w: 480 }, // its middle line, its width
  tree: [-420, -260] as [number, number],
  bench: { x: 300, z: 70 },
  lamp: { x: 700, z: 90 },
  petals: { fallen: 1300, falling: 70 },
  // where no grass grows: the trunk's foot, the bench's feet, the lamp's base (x, z, r)
  keepClear: [] as [number, number, number][],
}
SET.keepClear.push([SET.tree[0], SET.tree[1], 120], [SET.lamp.x, SET.lamp.z, 60])

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
