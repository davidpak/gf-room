import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { MeshoptSimplifier } from 'meshoptimizer'

/**
 * Sculpting with distance fields: a shape is a function giving, for any point, how far it is from the shape's
 * surface (negative inside). Shapes are built from rounded primitives (boxes, capsules, cones, slabs cut from a
 * drawn outline) put together with unions that fillet where they meet (`smooth`) and cuts that round their
 * edges (`carve`), then turned into a mesh by surface nets (`mesh`): a vertex in each grid cell the surface
 * passes through, pulled onto the surface, its normal the field's gradient, so it's smooth everywhere and
 * moulded where parts meet, the way cast and injection-moulded things are.
 *
 * Units are whatever the caller's are (millimetres here).
 */
export type Sdf = (x: number, y: number, z: number) => number
type V3 = [number, number, number]

// ---- combining
/** the union, filleted where they meet (radius k) */
export const smin = (a: number, b: number, k: number) => {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k)
export const union =
  (k: number, ...fs: Sdf[]): Sdf =>
  (x, y, z) => {
    let d = fs[0](x, y, z)
    for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k)
    return d
  }
/** a with b cut out of it, the cut's edges rounded (k) */
export const carve =
  (a: Sdf, b: Sdf, k = 0): Sdf =>
  (x, y, z) =>
    smax(a(x, y, z), -b(x, y, z), k)
export const intersect =
  (a: Sdf, b: Sdf, k = 0): Sdf =>
  (x, y, z) =>
    smax(a(x, y, z), b(x, y, z), k)
/** a shell of the shape, `t` thick */
export const shell =
  (a: Sdf, t: number): Sdf =>
  (x, y, z) =>
    Math.abs(a(x, y, z)) - t / 2
/** grown (or shrunk) by r */
export const grow =
  (a: Sdf, r: number): Sdf =>
  (x, y, z) =>
    a(x, y, z) - r
/** mirrored across z = 0 (one side made, both had) */
export const mirrorZ =
  (a: Sdf, z0 = 0): Sdf =>
  (x, y, z) =>
    a(x, y, z0 + Math.abs(z - z0))

// ---- primitives
export const sphere =
  ([cx, cy, cz]: V3, r: number): Sdf =>
  (x, y, z) =>
    Math.hypot(x - cx, y - cy, z - cz) - r
/** a box (half sizes h), its edges rounded r, at c, turned `yaw` about y and `roll` about z */
export function box([cx, cy, cz]: V3, [hx, hy, hz]: V3, r = 0, roll = 0, yaw = 0): Sdf {
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  const cyw = Math.cos(yaw)
  const syw = Math.sin(yaw)
  return (x, y, z) => {
    let px = x - cx
    let py = y - cy
    let pz = z - cz
    // (undo the yaw, then the roll)
    const qx = px * cyw - pz * syw
    pz = px * syw + pz * cyw
    px = qx
    const rx = px * cr + py * sr
    py = -px * sr + py * cr
    px = rx
    const dx = Math.abs(px) - hx + r
    const dy = Math.abs(py) - hy + r
    const dz = Math.abs(pz) - hz + r
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - r
  }
}
/** a capsule from a to b */
export function capsule(a: V3, b: V3, r: number): Sdf {
  const [ax, ay, az] = a
  const bx = b[0] - ax
  const by = b[1] - ay
  const bz = b[2] - az
  const l2 = bx * bx + by * by + bz * bz
  return (x, y, z) => {
    const px = x - ax
    const py = y - ay
    const pz = z - az
    const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / l2))
    return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - r
  }
}
/** a cone with round ends: radius ra at a, rb at b */
export function cone(a: V3, b: V3, ra: number, rb: number): Sdf {
  const ba: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2]
  const rr = ra - rb
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  return (x, y, z) => {
    const pa0 = x - a[0]
    const pa1 = y - a[1]
    const pa2 = z - a[2]
    const yy = pa0 * ba[0] + pa1 * ba[1] + pa2 * ba[2]
    const zz = yy - l2
    const xx0 = pa0 * l2 - ba[0] * yy
    const xx1 = pa1 * l2 - ba[1] * yy
    const xx2 = pa2 * l2 - ba[2] * yy
    const x2 = xx0 * xx0 + xx1 * xx1 + xx2 * xx2
    const y2 = yy * yy * l2
    const z2 = zz * zz * l2
    const k = Math.sign(rr) * rr * rr * x2
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra
  }
}
/** a cylinder from a to b, radius r, its rims rounded rr */
export function cylinder(a: V3, b: V3, r: number, rr = 0): Sdf {
  const ba: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const l = Math.hypot(...ba)
  const u: V3 = [ba[0] / l, ba[1] / l, ba[2] / l]
  const m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  return (x, y, z) => {
    const px = x - m[0]
    const py = y - m[1]
    const pz = z - m[2]
    const t = px * u[0] + py * u[1] + pz * u[2]
    const rad = Math.hypot(px - u[0] * t, py - u[1] * t, pz - u[2] * t)
    const dx = rad - r + rr
    const dy = Math.abs(t) - l / 2 + rr
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rr
  }
}
/** a bar along a → b (in the xy plane), its section `w` across (in the plane) by `d` deep (z), rounded r */
export function bar(a: V3, b: V3, w: number, d: number, r: number): Sdf {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  const roll = Math.atan2(dy, dx)
  return box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [len / 2, w / 2, d / 2], r, roll)
}
/** the distance to a 2D polygon (negative inside) */
function polygon2(pts: [number, number][], px: number, py: number) {
  let d = Infinity
  let s = 1
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
    const [ax, ay] = pts[j]
    const [bx, by] = pts[i]
    const ex = bx - ax
    const ey = by - ay
    const wx = px - ax
    const wy = py - ay
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)))
    d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t))
    const c1 = py >= ay
    const c2 = py < by
    const c3 = ex * wy > ey * wx
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s
  }
  return s * d
}
/** a slab: a drawn outline (in x, y) given depth (z, centred on z0), its edges rounded r, its outline's corners
 *  rounded by `corner` */
export function slab(pts: [number, number][], depth: number, r: number, z0 = 0, corner = 0): Sdf {
  return (x, y, z) => {
    const d2 = polygon2(pts, x, y) - corner
    const wx = d2 + r
    const wy = Math.abs(z - z0) - depth / 2 + r
    return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - r
  }
}
/** a torus round the z axis at c (radius R, tube r): a tyre */
export const torusZ =
  ([cx, cy, cz]: V3, R: number, r: number): Sdf =>
  (x, y, z) =>
    Math.hypot(Math.hypot(x - cx, y - cy) - R, z - cz) - r
/** the gradient (the outward normal), by differences */
export function normal(f: Sdf, x: number, y: number, z: number, out: Vector3, e = 0.5) {
  // (four samples, at a tetrahedron's corners)
  const a = f(x + e, y - e, z - e)
  const b = f(x - e, y - e, z + e)
  const c = f(x - e, y + e, z - e)
  const d = f(x + e, y + e, z + e)
  out.set(a - b - c + d, -a - b + c + d, -a + b - c + d)
  const l = out.length()
  return l > 1e-9 ? out.multiplyScalar(1 / l) : out.set(0, 1, 0)
}

/**
 * The shape as a mesh: surface nets over the box min..max in cubes `cell` big. Each vertex is pulled onto the
 * surface along the gradient; normals are the gradient. `uv` (optional) gives each vertex its texture
 * coordinates from its position and normal (for painting markings on).
 */
let DETAIL = 1
let TOLERANCE = 0
let simplifierReady = false
/** (the simplifier's wasm, compiled once: `coarse` with a tolerance waits for it) */
export const whenSimplifier = MeshoptSimplifier.ready.then(() => void (simplifierReady = true))
/** meshes made inside fn come out k times coarser (a thing seen small: fewer triangles, quicker to make); fine
 *  parts (cells of 2.5 mm or less) keep theirs, so thin things don't break up. `tolerance` (mm): each then
 *  simplified as far as it can go without its surface moving more than that (flat and gently curved stretches
 *  lose most of their triangles, edges and fillets keep theirs) */
export function coarse<T>(k: number, fn: () => T, tolerance = 0): T {
  const was = [DETAIL, TOLERANCE]
  DETAIL = k
  TOLERANCE = tolerance
  try {
    return fn()
  } finally {
    ;[DETAIL, TOLERANCE] = was
  }
}
export function mesh(f: Sdf, min: V3, max: V3, cell: number, uv?: (p: Vector3, n: Vector3) => [number, number]) {
  cell *= DETAIL === 1 || cell <= 2.5 ? 1 : cell <= 3 ? Math.min(1.5, DETAIL) : DETAIL
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1
  const val = new Float32Array(nx * ny * nz)
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k)
  // (in blocks: a block the surface can't reach (its middle further from the surface than its corners are from
  // its middle) is filled with its middle's value; only blocks near the surface are sampled finely)
  const B = 4
  const reach = ((B * cell * Math.sqrt(3)) / 2) * 1.6
  for (let bk = 0; bk < nz; bk += B)
    for (let bj = 0; bj < ny; bj += B)
      for (let bi = 0; bi < nx; bi += B) {
        const i1 = Math.min(nx, bi + B)
        const j1 = Math.min(ny, bj + B)
        const k1 = Math.min(nz, bk + B)
        const dc = f(min[0] + ((bi + i1 - 1) / 2) * cell, min[1] + ((bj + j1 - 1) / 2) * cell, min[2] + ((bk + k1 - 1) / 2) * cell)
        const far = Math.abs(dc) > reach
        for (let k = bk; k < k1; k++)
          for (let j = bj; j < j1; j++)
            for (let i = bi; i < i1; i++) val[at(i, j, k)] = far ? dc : f(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell)
      }
  // a vertex in each cell the surface passes through: the average of where it crosses the cell's edges
  const cx = nx - 1
  const cy = ny - 1
  const cz = nz - 1
  const vid = new Int32Array(cx * cy * cz).fill(-1)
  const pos: number[] = []
  const nor: number[] = []
  const uvs: number[] = []
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  const corner = new Float32Array(8)
  const p = new Vector3()
  const n = new Vector3()
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        let mask = 0
        for (let c = 0; c < 8; c++) {
          const v = val[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]
          corner[c] = v
          if (v < 0) mask |= 1 << c
        }
        if (mask === 0 || mask === 255) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let m = 0
        for (const [a, b] of EDGES) {
          const va = corner[a]
          const vb = corner[b]
          if (va < 0 === vb < 0) continue
          const t = va / (va - vb)
          sx += (a & 1) + ((b & 1) - (a & 1)) * t
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t
          m++
        }
        p.set(min[0] + (i + sx / m) * cell, min[1] + (j + sy / m) * cell, min[2] + (k + sz / m) * cell)
        // (pulled onto the surface: a step along the gradient)
        normal(f, p.x, p.y, p.z, n, cell * 0.25)
        p.addScaledVector(n, -f(p.x, p.y, p.z))
        normal(f, p.x, p.y, p.z, n, cell * 0.25)
        vid[i + cx * (j + cy * k)] = pos.length / 3
        pos.push(p.x, p.y, p.z)
        nor.push(n.x, n.y, n.z)
        if (uv) uvs.push(...uv(p, n))
      }
  // a quad for each grid edge the surface crosses, joining the four cells round it
  const idx: number[] = []
  const cellAt = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= cx || j >= cy || k >= cz ? -1 : vid[i + cx * (j + cy * k)])
  const dirs: V3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = val[at(i, j, k)]
        for (let a = 0; a < 3; a++) {
          const [ex, ey, ez] = dirs[a]
          const i1 = i + ex
          const j1 = j + ey
          const k1 = k + ez
          if (i1 >= nx || j1 >= ny || k1 >= nz) continue
          const v1 = val[at(i1, j1, k1)]
          if (v0 < 0 === v1 < 0) continue
          const [bx, by, bz] = dirs[(a + 1) % 3]
          const [qx, qy, qz] = dirs[(a + 2) % 3]
          const c00 = cellAt(i - bx - qx, j - by - qy, k - bz - qz)
          const c10 = cellAt(i - qx, j - qy, k - qz)
          const c11 = cellAt(i, j, k)
          const c01 = cellAt(i - bx, j - by, k - bz)
          if (c00 < 0 || c10 < 0 || c11 < 0 || c01 < 0) continue
          // (facing out: from inside toward outside along the edge)
          if (v0 < 0) idx.push(c00, c10, c11, c00, c11, c01)
          else idx.push(c00, c11, c10, c00, c01, c11)
        }
      }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  if (uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  if (TOLERANCE > 0 && simplifierReady && idx.length > 600) {
    // (the vertices stay as they are, normals and all: only which of them the triangles join changes)
    const [less] = MeshoptSimplifier.simplify(Uint32Array.from(idx), new Float32Array(pos), 3, 0, TOLERANCE, ['ErrorAbsolute'])
    if (less.length >= 3 && less.length < idx.length) {
      g.setIndex(new BufferAttribute(less, 1))
      return g
    }
  }
  g.setIndex(idx)
  return g
}
