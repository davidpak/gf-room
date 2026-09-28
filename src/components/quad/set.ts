/**
 * The Quad's north-west quarter (toy scale, mm; +X east, +Z south, toward the camera), traced from
 * the overhead photo at 8 mm a pixel: the lawn cut by a V of diagonal walks into three triangles of
 * grass, the west walk and the cross walk round it, the wide middle walk down its east side. Along
 * its north edge the row of cherries, the walk under them, and past that, benches and lamp posts
 * facing the walk on the strip of grass before the building. Everything else on the Quad grows from
 * these.
 */
export type Walk = { a: [number, number]; b: [number, number]; w: number }

export const SET = {
  island: { x0: -4700, x1: 5000, z0: -3700, z1: 2450, corner: 300, t: 160 },
  // (wide first: where two walks cross, the earlier one's bricks lie on top)
  walks: [
    { a: [4200, -3700], b: [4200, 2450], w: 960 }, // the middle walk, down the Quad's length
    { a: [-4700, 1920], b: [5000, 1920], w: 640 }, // the cross walk
    { a: [-4700, -2000], b: [4200, -2000], w: 420 }, // the walk under the cherries
    { a: [-4240, -2000], b: [-4240, 1920], w: 320 }, // the west walk
    { a: [-1040, 1760], b: [-4240, -2000], w: 340 }, // the V: its point on the cross walk,
    { a: [-1040, 1760], b: [2900, -2000], w: 340 }, //   its arms up to the cherries
  ] as Walk[],
  trees: [
    { x: -3840, z: -1400, model: 2, rot: 0.3, scale: 0.85 },
    { x: -2640, z: -1460, model: 0, rot: 2.1, scale: 1 },
    { x: -1200, z: -1430, model: 1, rot: 4.0, scale: 1 },
    { x: 240, z: -1470, model: 3, rot: 1.2, scale: 1 },
    { x: 1680, z: -1420, model: 0, rot: 5.1, scale: 1.05 },
    { x: 3120, z: -1450, model: 2, rot: 2.7, scale: 0.95 },
  ],
  // along the walk's north side, evenly: a bench (each on its own pad of brick off the walk), a
  // lamp, a bench, a lamp…
  lamps: [
    { x: -2600, z: -2330 },
    { x: -1200, z: -2330 },
    { x: 200, z: -2330 },
    { x: 1600, z: -2330 },
  ],
  benches: [-3300, -1900, -500, 900, 2300].map((x) => ({ x, z: -2385, rot: 0 })),
  // the grounds crew's lawn signs ("don't climb on the trees"), out on the grass before the cherries, turned
  // a little toward the camera
  signs: [
    { x: -2980, z: -980, rot: 0.3 },
    { x: 1850, z: -540, rot: 0.3 }, // (across the walk from the clothesline, out of the photos' way)
  ],
  // their photos from the Quad (./Photos): the bench photo on an easel by the bench it was taken on; the cherry
  // shoot pegged on clotheslines between the trunks they stood under (the piggybacks with the hall's
  // gable behind on one, the rest on the other)
  photos: {
    bench: 1,
    easel: { x: -1480, z: -2430, rot: 0.25 }, // (the bench photo's, just past that bench's east end)
    lines: [
      { trees: [1, 2] as [number, number], h: 330, names: ['IMG_8165', 'IMG_8166', 'IMG_8167', 'IMG_8168', 'IMG_8169'] },
      { trees: [3, 4] as [number, number], h: 330, names: ['IMG_1199', 'IMG_8170', 'IMG_8171'] },
    ],
  },
  // the photo shoot on the lawn between the middle cherries (between the clotheslines; ./ShootSet): the
  // camera looking in under the trees at where two people would stand, a softbox and a C-stand's spot
  // either side aimed there too, apple boxes by the camera, the laptop on the lying one
  shoot: {
    camera: { x: -480, z: -760, rot: 0 },
    softbox: { x: -900, z: -1050, rot: -0.77 },
    cstand: { x: -60, z: -1000, rot: 0.72 },
    boxes: [
      { x: -250, z: -640, rot: 0.25, onEnd: false },
      { x: -720, z: -620, rot: -0.3, onEnd: true },
    ],
    laptop: { x: -250, z: -640, rot: 0.1 },
  },
  // the cookie stand (./CookieStand): a canopy over a table in the corner of the big lawn east of the V, facing out front
  cookies: { x: 3230, z: 1120, rot: -0.12, sign: { x: 2280, z: 1250, rot: 0.2 } }, // (in the lawn's corner by the walks; its sign out on the lawn, its arrow toward it)
  // the building along the north edge (cut off where the island ends), its wing stepping out; the
  // dark hedge before the wing; bushes at the building's foot
  building: {
    h: 1200,
    blocks: [
      { x0: -4640, x1: 2960, z0: -3670, z1: -3450 },
      { x0: 1360, x1: 2960, z0: -3670, z1: -3040 },
    ],
  },
  hedges: [{ x0: 1440, x1: 3300, z: -2880, h: 360, d: 260 }],
  bushes: [
    { x: -4250, z: -3260, r: 260 },
    { x: -2100, z: -3280, r: 200 },
    { x: -350, z: -3270, r: 230 },
    { x: 3420, z: -3330, r: 240 },
  ],
  start: { x: -3300, z: 1920, heading: Math.PI / 2 }, // on the cross walk, heading east
  petals: { fallen: 3600, falling: 160 },
}

/** whether (x, z) is on the island, `inset` in from its edge (its corners are rounded) */
export function inIsland(x: number, z: number, inset = 0) {
  const { x0, x1, z0, z1, corner } = SET.island
  const r = Math.max(0, corner - inset)
  const cx = Math.min(Math.max(x, x0 + inset + r), x1 - inset - r)
  const cz = Math.min(Math.max(z, z0 + inset + r), z1 - inset - r)
  return x > x0 + inset && x < x1 - inset && z > z0 + inset && z < z1 - inset && Math.hypot(x - cx, z - cz) <= r
}

/** how far (x, z) is from a walk's middle line, and how far along it (0..1) */
export function walkDist(wk: Walk, x: number, z: number) {
  const [ax, az] = wk.a
  const dx = wk.b[0] - ax
  const dz = wk.b[1] - az
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - ax - dx * t, z - az - dz * t)
}

// ---- the paving as one shape: the walks and the benches' pads, run together with rounded corners
// where they meet (a smooth union of their distance fields), cut to the island
export type Pad = { x: number; z: number; w: number; d: number }
/** each bench's pad: a rectangle of brick off the walk's edge, under the bench */
export const PADS: Pad[] = SET.benches.map((b) => ({ x: b.x, z: -2340, w: 560, d: 340 }))
const FILLET = 300 // (how round the corners where walks meet: mm)
const PAD_FILLET = 60

/** the signed distance from a walk's edge (negative on it) */
export const walkSdf = (wk: Walk, x: number, z: number) => walkDist(wk, x, z) - wk.w / 2
/** the signed distance from a pad's edge */
export function padSdf(p: Pad, x: number, z: number) {
  const dx = Math.abs(x - p.x) - p.w / 2
  const dz = Math.abs(z - p.z) - p.d / 2
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0)
}
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
function islandSdf(x: number, z: number, inset: number) {
  const { x0, x1, z0, z1, corner } = SET.island
  const r = Math.max(1, corner - inset)
  const dx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - inset - r)
  const dz = Math.abs(z - (z0 + z1) / 2) - ((z1 - z0) / 2 - inset - r)
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - r
}
/** the signed distance from the paving's edge (negative on it) */
export function paveSdf(x: number, z: number) {
  let d = Infinity
  for (const wk of SET.walks) d = smin(d, walkSdf(wk, x, z), FILLET)
  for (const p of PADS) d = smin(d, padSdf(p, x, z), PAD_FILLET)
  return Math.max(d, islandSdf(x, z, 30))
}
/** which shape a paved spot's bricks follow: the first walk it's on (so the main walks run straight
 *  through a crossing), else a pad, else (in a rounded corner) whichever it's nearest. Walks are
 *  0…, pads after them */
export function paveOwner(x: number, z: number) {
  const W = SET.walks.length
  let best = -1
  let bd = Infinity
  for (let k = 0; k < W; k++) {
    const d = walkSdf(SET.walks[k], x, z)
    if (d < 0) return k
    if (d < bd) [bd, best] = [d, k]
  }
  for (let k = 0; k < PADS.length; k++) {
    const d = padSdf(PADS[k], x, z)
    if (d < 0) return W + k
    if (d < bd) [bd, best] = [d, W + k]
  }
  return best
}
/** whether (x, z) is on the paving (`pad` past its edge) */
export const onWalk = (x: number, z: number, pad = 0) => paveSdf(x, z) < pad

/** where tufts and petals keep off: the trunks' feet, the lamps' bases (x, z, r) */
export const keepClear: [number, number, number][] = [...SET.trees.map((t) => [t.x, t.z, 130] as [number, number, number]), ...SET.lamps.map((l) => [l.x, l.z, 60] as [number, number, number])]
