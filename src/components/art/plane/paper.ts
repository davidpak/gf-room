import { BufferAttribute, BufferGeometry, DoubleSide, IcosahedronGeometry, Vector3 } from 'three'
import { bruno } from '../../quad/bruno'
import { paint, rng } from '../../picnic/paint'
import { PAPER } from '../spec'
import { now, side, type Facet, type Line, type V2 } from './fold'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A sheet of paper and its folds, drawn (./PaperSheet holds it, folds it, flies it; ./fold does the folding):
 *
 *   FOLDS      the dart's seven: the two top corners in to the middle, the new slanted edges in to the middle again,
 *              in half (the keel turning down), each wing folded down flat over its half (as paper's folded: on its
 *              side, then turned over for the other), and last both opened back out level; each with what must be
 *              done before it
 *   place      where a point of the folded-flat paper is, with the paper bent so far (the keel, the wings)
 *   build      the paper's mesh from its facets (a fold swinging over, if one is)
 *   dashes     a fold's dashed line, lying on the paper's top
 *
 * Units mm; the paper's own frame: x across, y up, -z its nose.
 */
export const { w: W, h: H, keel: KEEL, layer: LAYER } = PAPER
const TOP = H / 2
const T8 = Math.tan(Math.PI / 8)

/** a fold from a to b, the side holding point m the side that moves */
function line(a: V2, b: V2, m: V2): Line {
  const l: Line = { p: a, d: [b[0] - a[0], b[1] - a[1]] }
  return side(l, m) >= 0 ? l : { p: a, d: [a[0] - b[0], a[1] - b[1]] }
}
export type Fold = { id: number; needs: number[]; seg: [V2, V2]; flat?: Line; bend?: 'a' | 'bL' | 'bR' }
export const FOLDS: Fold[] = [
  { id: 1, needs: [], seg: [[0, TOP], [-W / 2, TOP - W / 2]], flat: line([0, TOP], [-W / 2, TOP - W / 2], [-W / 2, TOP]) },
  { id: 2, needs: [], seg: [[0, TOP], [W / 2, TOP - W / 2]], flat: line([0, TOP], [W / 2, TOP - W / 2], [W / 2, TOP]) },
  { id: 3, needs: [1], seg: [[0, TOP], [-W / 2, TOP - W / 2 / T8]], flat: line([0, TOP], [-W / 2, TOP - W / 2 / T8], [-W / 2, 0]) },
  { id: 4, needs: [2], seg: [[0, TOP], [W / 2, TOP - W / 2 / T8]], flat: line([0, TOP], [W / 2, TOP - W / 2 / T8], [W / 2, 0]) },
  { id: 5, needs: [1, 2, 3, 4], seg: [[0, TOP], [0, -TOP]], bend: 'a' },
  { id: 6, needs: [5], seg: [[-KEEL, TOP - KEEL / T8], [-KEEL, -TOP]], bend: 'bL' },
  { id: 7, needs: [5], seg: [[KEEL, TOP - KEEL / T8], [KEEL, -TOP]], bend: 'bR' },
]

const paperMats = new Map<string, ReturnType<typeof bruno>>()
export function paperMat(color: string) {
  if (!paperMats.has(color)) {
    const t = paint(256, 256, (g) => {
      const r = rng(5)
      g.fillStyle = color
      g.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '120,100,110'},${0.04 + r() * 0.05})`
        g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1)
      }
    })
    const m = bruno({ map: t ?? undefined, color: '#ffffff', shade: '#9d93ad', side: DoubleSide })
    // (wins a tie in depth with what it lies on: it lies a hair over the cloth, and far off that's no depth at all)
    m.polygonOffset = true
    m.polygonOffsetFactor = -1
    m.polygonOffsetUnits = -2
    paperMats.set(color, m)
  }
  return paperMats.get(color)!
}
export const LINE = bruno({ color: '#857993', shade: '#5a5068', side: DoubleSide })
export const LINE_ON = bruno({ color: '#e7839f', shade: '#a05470', emissive: '#e7839f', emissiveIntensity: 0.3, side: DoubleSide })

const _v = new Vector3()

/** the bends after the flat folds: a (in half), bL bR (the wings: 0 up with the half, ½ out level, 1 down flat over
 *  the half's outside), each 0..1 */
export type Bend = { a: number; bL: number; bR: number }
/** where a point of the folded-flat paper (x across, y along) on layer `rank` (of `top` layers) is, with the paper
 *  bent so far: in the plane's own frame (x across, y up, -z its nose). Folded in half, each half turns up off the
 *  middle crease (the crease the keel's bottom edge, along y 0), the folds' flaps turning inside the keel and the
 *  sheet itself outermost; then each wing turns about its fold line, on the half's outside: out, and on down flat
 *  over the half (its layers stacked back over in reverse, as paper's are) */
export function place(x: number, y: number, rank: number, bend: Bend | null, out: Vector3, top = 0) {
  const o = 0.6 + rank * LAYER
  if (!bend) return out.set(x, o, -y)
  const s = x < 0 ? -1 : 1
  const d = Math.abs(x)
  const al = (bend.a * Math.PI) / 2 // (each half turned up about the middle)
  const M = 1 + top * LAYER // (how far out the half's outermost layer is, once up)
  // the half: along u from the crease, its top face's normal n (inward once it's up), its layers out along -n
  const ux = s * Math.cos(al)
  const uy = Math.sin(al)
  const nx = -s * Math.sin(al)
  const ny = Math.cos(al)
  if (d <= KEEL) {
    const off = o - M * bend.a
    return out.set(ux * d + nx * off, uy * d + ny * off, -y)
  }
  // the wing: turned by ph about its fold line, which runs along the half's outside at the wing's root
  const ph = Math.PI * (s < 0 ? bend.bL : bend.bR)
  const ex = -nx // (outward)
  const ey = -ny
  const h0 = M * bend.a - 0.4
  const c = Math.cos(ph)
  const sn = Math.sin(ph)
  const r = d - KEEL
  const q = 0.4 - o
  return out.set(ux * KEEL + ex * h0 + (ux * c + ex * sn) * r + (ex * c - ux * sn) * q, uy * KEEL + ey * h0 + (uy * c + ey * sn) * r + (ey * c - uy * sn) * q, -y)
}

/** the folded paper's mesh: each facet a fan, both sides */
export function build(facets: Facet[], bend: Bend | null, moving?: { facets: Facet[]; axis: { p: Vector3; k: Vector3 }; th: number }) {
  const ranks = [...new Set([...facets, ...(moving?.facets ?? [])].map((f) => f.layer))].sort((a, b) => a - b)
  const rank = (l: number) => ranks.indexOf(l)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const add = (f: Facet, rot: boolean) => {
    const pts = now(f)
    const base = pos.length / 3
    pts.forEach(([x, y], i) => {
      place(x, y, rank(f.layer), bend, _v, ranks.length)
      if (rot && moving) {
        // (swinging over: turned about the fold line)
        _v.sub(moving.axis.p).applyAxisAngle(moving.axis.k, moving.th).add(moving.axis.p)
      }
      pos.push(_v.x, _v.y, _v.z)
      const o = f.poly[i]
      uv.push(o[0] / W + 0.5, o[1] / H + 0.5)
    })
    for (let i = 1; i < pts.length - 1; i++) idx.push(base, base + i, base + i + 1)
  }
  facets.forEach((f) => add(f, false))
  moving?.facets.forEach((f) => add(f, true))
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** a dashed line along a segment of the paper, lying on its top (folded in half: on the half's outside) */
export function dashes(seg: [V2, V2], rank: number, bend: Bend | null, wide: number) {
  const up = !!bend && bend.a > 0.5
  const [a, b] = seg
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(1, Math.floor(len / 9))
  const pos: number[] = []
  const idx: number[] = []
  const dx = (b[0] - a[0]) / len
  const dy = (b[1] - a[1]) / len
  for (let i = 0; i < n; i++) {
    const t0 = (i * len) / n
    const t1 = t0 + (len / n) * 0.6
    const base = pos.length / 3
    for (const [t, o] of [
      [t0, -1],
      [t0, 1],
      [t1, 1],
      [t1, -1],
    ] as const) {
      const x = a[0] + dx * t - dy * o * wide
      const y = a[1] + dy * t + dx * o * wide
      place(x, y, up ? -1.5 : rank, bend, _v, rank)
      pos.push(_v.x, _v.y + (up ? 0 : 0.3), _v.z)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
export const dist = ([px, py]: V2, [a, b]: [V2, V2]) => {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)))
  return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t)
}


/** a crumpled ball of it: its corners welded first, so each is pushed in or out once and the faces stay joined
 *  (crumpled, not broken); then unwelded, each face lit flat, a crease at every edge */
export const BALL = 34
export function ballGeometry() {
  const g = mergeVertices(new IcosahedronGeometry(BALL, 2).deleteAttribute('normal').deleteAttribute('uv'))
  const p = g.attributes.position as BufferAttribute
  const r = rng(9)
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + r() * 0.3
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
  }
  const flat = g.toNonIndexed()
  flat.computeVertexNormals()
  return flat
}
