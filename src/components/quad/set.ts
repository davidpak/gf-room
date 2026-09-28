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
  lamps: [
    { x: -2900, z: -2380 },
    { x: -380, z: -2380 },
    { x: 2280, z: -2380 },
  ],
  benches: [
    { x: -1640, z: -2370, rot: 0 },
    { x: -1100, z: -2370, rot: 0 },
    { x: 1000, z: -2370, rot: 0 },
    { x: 1540, z: -2370, rot: 0 },
  ],
  // the building along the north edge (cut off where the island ends), its wing stepping out; the
  // dark hedge before the wing; bushes at the building's foot
  building: {
    h: 1200,
    blocks: [
      { x0: -4700, x1: 2960, z0: -3700, z1: -3450 },
      { x0: 1360, x1: 2960, z0: -3700, z1: -3040 },
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
/** whether (x, z) is on a walk (the first `upTo` of them; `pad` past its edge) */
export const onWalk = (x: number, z: number, pad = 0, upTo = SET.walks.length) => SET.walks.slice(0, upTo).some((wk) => walkDist(wk, x, z) < wk.w / 2 + pad)

/** where tufts and petals keep off: the trunks' feet, the lamps' bases (x, z, r) */
export const keepClear: [number, number, number][] = [...SET.trees.map((t) => [t.x, t.z, 130] as [number, number, number]), ...SET.lamps.map((l) => [l.x, l.z, 60] as [number, number, number])]
