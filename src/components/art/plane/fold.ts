/**
 * Folding a sheet of paper flat: the sheet as facets (convex polygons in the sheet's own coordinates, mm), each with
 * the affine map that carries it to where it lies now, and its layer. A fold along a line takes everything on one
 * side of it, splits what straddles the line, reflects that side over (the map composed with the reflection) and lays
 * it on top, in reverse order (what was underneath ends up on top, as paper does). Nothing's precomputed: each fold
 * is done to whatever the paper is.
 *
 * Frames: the sheet's own x across, y along it (y up toward the plane's nose); "now" the same plane, folded.
 */
export type V2 = [number, number]
/** x' = a x + c y + e,  y' = b x + d y + f */
export type Affine = [number, number, number, number, number, number]
export type Facet = { poly: V2[]; T: Affine; layer: number }
export type Line = { p: V2; d: V2 } // (a point on it, its direction)

export const ID: Affine = [1, 0, 0, 1, 0, 0]
export const apply = (T: Affine, [x, y]: V2): V2 => [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]]
const compose = (A: Affine, B: Affine): Affine => [
  // A ∘ B (B first)
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
]
const invert = (T: Affine): Affine => {
  const det = T[0] * T[3] - T[1] * T[2]
  const a = T[3] / det
  const b = -T[1] / det
  const c = -T[2] / det
  const d = T[0] / det
  return [a, b, c, d, -(a * T[4] + c * T[5]), -(b * T[4] + d * T[5])]
}
/** the reflection across a line */
function reflection({ p, d }: Line): Affine {
  const l = Math.hypot(d[0], d[1])
  const ux = d[0] / l
  const uy = d[1] / l
  // R = 2 u uᵀ - I, about p
  const a = 2 * ux * ux - 1
  const b = 2 * ux * uy
  const dd = 2 * uy * uy - 1
  return [a, b, b, dd, p[0] - (a * p[0] + b * p[1]), p[1] - (b * p[0] + dd * p[1])]
}
/** which side of the line a point is on (+: the side that moves) */
export const side = ({ p, d }: Line, q: V2) => d[0] * (q[1] - p[1]) - d[1] * (q[0] - p[0])

/** a convex polygon cut by the line: the part on the + side, and the part on the - side */
function cut(poly: V2[], s: (q: V2) => number): [V2[], V2[]] {
  const plus: V2[] = []
  const minus: V2[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const sa = s(a)
    const sb = s(b)
    if (sa >= 0) plus.push(a)
    if (sa <= 0) minus.push(a)
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb)
      const q: V2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      plus.push(q)
      minus.push(q)
    }
  }
  return [plus.length >= 3 ? plus : [], minus.length >= 3 ? minus : []]
}
const area = (poly: V2[]) => {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}

/** a fresh sheet, w across, h along, its middle at the origin */
export const sheet = (w: number, h: number): Facet[] => [
  {
    poly: [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ],
    T: ID,
    layer: 0,
  },
]

/** the facets split along a line (now), nothing moved: so a later bend there (the keel, the wings) has an edge to bend at */
export function crease(facets: Facet[], line: Line): Facet[] {
  const out: Facet[] = []
  for (const f of facets) {
    const back = invert(f.T)
    const [plus, minus] = cut(f.poly.map((q) => apply(f.T, q)), (q) => side(line, q))
    for (const part of [plus, minus]) if (part.length && area(part) > 0.5) out.push({ poly: part.map((q) => apply(back, q)), T: f.T, layer: f.layer })
  }
  return out
}

/** the paper folded along a line (now): what's on its + side turned over onto the other, on top */
export function fold(facets: Facet[], line: Line): { facets: Facet[]; moved: Facet[]; stayed: Facet[] } {
  const R = reflection(line)
  const stayed: Facet[] = []
  const moving: Facet[] = []
  for (const f of facets) {
    const back = invert(f.T)
    const [plus, minus] = cut(f.poly.map((q) => apply(f.T, q)), (q) => side(line, q))
    if (minus.length && area(minus) > 0.5) stayed.push({ poly: minus.map((q) => apply(back, q)), T: f.T, layer: f.layer })
    if (plus.length && area(plus) > 0.5) moving.push({ poly: plus.map((q) => apply(back, q)), T: f.T, layer: f.layer })
  }
  // (the moved layers, reversed, on top of all that stays)
  const top = Math.max(0, ...facets.map((f) => f.layer))
  const moved = moving.map((f) => ({ poly: f.poly, T: compose(R, f.T), layer: top + 1 + (top - f.layer) }))
  return { facets: [...stayed, ...moved], moved: moving, stayed }
}

/** where a facet lies now (its corners) */
export const now = (f: Facet) => f.poly.map((q) => apply(f.T, q))
