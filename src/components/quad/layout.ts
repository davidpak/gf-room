/**
 * The Quad at the University of Washington, in cherry blossom season, as a toy diorama (mm): the lawn
 * crossed corner to corner by brick walks with a round plaza where they meet, the Yoshino cherries
 * lining the walks, brick Collegiate Gothic halls round three sides (the Quad's own: Savery, Gowen,
 * Raitt...), and a low hedge along the open south side.
 *
 * Frame: +X east, +Z south (toward where you start), +Y up; the lawn's middle at the origin.
 */
export const QUAD = {
  lawn: { w: 9000, d: 6000 },
  walk: 460, // the brick walks' width
  plaza: 720, // the round plaza's radius
  ring: 800, // the paved ring round the lawn, to the halls
  hall: { d: 1500, h: 1900 },
  tree: { spacing: 1150, offset: 560, trunk: 70 }, // along each walk, either side of it
  start: { x: 0, z: 2900, heading: Math.PI }, // (heading 0 faces +Z; π faces north, up the lawn)
}
const L = QUAD.lawn
/** the diagonal walks, corner to corner: each as a start, an end, its length and direction */
export const WALKS = [
  [-L.w / 2, -L.d / 2, L.w / 2, L.d / 2],
  [L.w / 2, -L.d / 2, -L.w / 2, L.d / 2],
].map(([x0, z0, x1, z1]) => {
  const len = Math.hypot(x1 - x0, z1 - z0)
  return { x0, z0, x1, z1, len, dx: (x1 - x0) / len, dz: (z1 - z0) / len }
})

/** the cherries: along each walk, both sides, clear of the plaza and the corners */
export function treeSpots() {
  const out: { x: number; z: number; s: number; r: number }[] = []
  let k = 0
  for (const w of WALKS) {
    for (let d = QUAD.plaza + 700; d < w.len / 2 - 500; d += QUAD.tree.spacing) {
      for (const along of [w.len / 2 - d, w.len / 2 + d]) {
        for (const side of [-1, 1]) {
          const x = w.x0 + w.dx * along - w.dz * side * QUAD.tree.offset
          const z = w.z0 + w.dz * along + w.dx * side * QUAD.tree.offset
          const rnd = Math.sin(k++ * 91.7) * 0.5 + 0.5
          out.push({ x, z, s: 0.85 + rnd * 0.35, r: rnd * Math.PI * 2 })
        }
      }
    }
  }
  return out
}

/** where the polaroids stand: by the walks, between the trees, turned to face the walk */
export function photoSpots(n: number) {
  const out: { x: number; z: number; yaw: number }[] = []
  const slots: { w: (typeof WALKS)[number]; along: number; side: number }[] = []
  for (const w of WALKS) {
    for (const d of [QUAD.plaza + 1250, QUAD.plaza + 2400]) {
      slots.push({ w, along: w.len / 2 - d, side: 1 }, { w, along: w.len / 2 + d, side: -1 })
    }
  }
  for (let i = 0; i < Math.min(n, slots.length); i++) {
    const { w, along, side } = slots[i]
    const off = QUAD.walk / 2 + 260
    const x = w.x0 + w.dx * along - w.dz * side * off
    const z = w.z0 + w.dz * along + w.dx * side * off
    // facing the walk (and whoever's on it)
    out.push({ x, z, yaw: Math.atan2(w.dz * side, -w.dx * side) })
  }
  return out
}

/** the halls: boxes round the north, east and west, just outside the ring */
export function halls() {
  const { w, d } = QUAD.lawn
  const R = QUAD.ring
  const D = QUAD.hall.d
  return [
    { x: 0, z: -d / 2 - R - D / 2, w: w + 2 * R, d: D }, // north
    { x: -w / 2 - R - D / 2, z: -600, w: D, d: d + R - 1200 }, // west
    { x: w / 2 + R + D / 2, z: -600, w: D, d: d + R - 1200 }, // east
  ]
}

/** how far the car may go (inside the halls, and the hedge to the south) */
export const BOUNDS = { x: L.w / 2 + QUAD.ring - 150, zMin: -L.d / 2 - QUAD.ring + 150, zMax: L.d / 2 + QUAD.ring + 300 }
