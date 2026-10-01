import { useMemo } from 'react'
import { Color, Shape, ShapeGeometry, Vector2, Vector3 } from 'three'
import { bruno } from '../quad/bruno'
import { loft, orient, type Ring } from './loft'
import { paint, rng } from './paint'

/**
 * A demi-baguette (../spec [F]), in real millimetres: its crust golden, deeper where the oven caught it, pale
 * and floury underneath; five slashes (grignes) along its top, each opened out pale with its ear standing up
 * along one side and caught darker; its ends drawn to blunt points. It tears: `lo` and `hi` are how much of
 * it is left (x, from -l/2 to l/2), and a torn end is ragged, its soft crumb showing.
 *
 * Its frame: lying on y = 0, along x, its middle at the origin.
 */
export const BAGUETTE = { l: 420, w: 64, h: 52 } // [F]
const { l: BL, w: BW, h: BH } = BAGUETTE
const HALF = BL / 2
/** how full it is along its length: blunt points at its ends */
const full = (x: number) => Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / HALF, 3.2)))
/** the slashes: middle (x), its angle to the length, how long, how wide */
const CUTS = [-150, -78, -4, 70, 142].map((x, i) => ({ x, a: 0.36 + (i % 2) * 0.04, len: 92, w: 9.5 }))
/** a torn end's raggedness (mm along it), across its face */
const rag = (z: number, y: number) => 3.2 * Math.sin(z * 0.31 + y * 0.23) + 1.8 * Math.sin(z * 0.93 - y * 0.71) + 1.1 * Math.sin(y * 1.7 + z * 0.2)

/** its section at x round θ (0 at +z, π/2 its crown): [z, y], before the slashes */
function section(x: number, t: number): [number, number] {
  const s = full(x)
  const top = BH * (0.3 + 0.7 * Math.pow(s, 0.7))
  const bot = 9 * (1 - Math.pow(s, 0.5))
  const yc = bot + (top - bot) * 0.38
  const c = Math.cos(t)
  const sn = Math.sin(t)
  const z = (BW / 2) * Math.pow(s, 0.85) * Math.sign(c) * Math.pow(Math.abs(c), 0.8)
  const y = sn >= 0 ? yc + (top - yc) * Math.pow(sn, 0.8) : yc - (yc - bot) * Math.pow(-sn, 0.3)
  return [z, y]
}
/** how a point on its top is cut: how deep into a slash (0..1), how far up an ear (0..1) */
function slashed(x: number, z: number) {
  let open = 0
  let ear = 0
  for (const c of CUTS) {
    const dx = x - c.x
    const a = dx * Math.cos(c.a) + z * Math.sin(c.a)
    const b = -dx * Math.sin(c.a) + z * Math.cos(c.a)
    const u = (2 * a) / c.len
    if (Math.abs(u) >= 1) continue
    const lens = c.w * (1 - u * u)
    if (Math.abs(b) < lens) open = Math.max(open, 1 - (b / lens) ** 2)
    else if (b > 0 && b < lens + 8) ear = Math.max(ear, (1 - (b - lens) / 8) * (1 - u * u))
  }
  return { open, ear }
}

const TORN_PX = 5
const crumbTex = paint(80 * TORN_PX, 64 * TORN_PX, (g) => {
  const r = rng(5)
  const W = 80 * TORN_PX
  const H = 64 * TORN_PX
  g.fillStyle = '#f4e1b8'
  g.fillRect(0, 0, W, H)
  // torn crumb: big open holes, their shadowed far sides, stretched strands between
  for (let i = 0; i < 260; i++) {
    const x = r() * W
    const y = r() * H
    const s = (1 + r() * 3.2) * TORN_PX
    g.fillStyle = `rgba(170,120,70,${0.2 + r() * 0.25})`
    g.beginPath()
    g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = `rgba(255,250,232,${0.5 + r() * 0.3})`
    g.beginPath()
    g.ellipse(x - s * 0.3, y - s * 0.3, s * 0.7, s * 0.45, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
})
const TORN = bruno({ map: crumbTex ?? undefined, color: '#ffffff', shade: '#b8a28e' })
const CRUST = bruno({ vertexColors: true, color: '#ffffff', shade: '#8a6478' })

const cache = new Map<string, ReturnType<typeof build>>()
function build(lo: number, hi: number) {
  const r = rng(77)
  const tornLo = lo > -HALF + 0.5
  const tornHi = hi < HALF - 0.5
  const M = 72
  const steps = Math.max(4, Math.ceil((hi - lo) / 2))
  const rings: Ring[] = []
  const golden = new Color('#cf9550')
  const deep = new Color('#9e5c28')
  const side = new Color('#ddab6c')
  const under = new Color('#e7c493')
  const pale = new Color('#f4dcaa')
  for (let j = 0; j <= steps; j++) {
    const x0 = lo + ((hi - lo) * j) / steps
    const p: Vector3[] = []
    const c: Color[] = []
    for (let i = 0; i < M; i++) {
      const t = -Math.PI / 2 + (i / M) * Math.PI * 2
      let [z, y] = section(x0, t)
      // a torn end ragged across its face
      const x = x0 + (j === 0 && tornLo ? -rag(z, y) : 0) + (j === steps && tornHi ? rag(z, y) : 0)
      const sn = Math.sin(t)
      let col: Color
      if (sn > 0.15) {
        const { open, ear } = slashed(x0, z)
        y += ear * 3.2 - open * 6
        // its crown: golden, darker on the ears and where the oven caught it, the slashes pale inside
        col = golden.clone().lerp(deep, Math.min(1, ear * 0.9 + Math.pow(sn, 6) * 0.25)).lerp(pale, open)
      } else if (sn > -0.35) col = side.clone().lerp(golden, Math.max(0, (sn + 0.35) / 0.5))
      else col = under.clone()
      // (flecked: flour, the oven's stone)
      const f = r()
      col.multiplyScalar(0.93 + r() * 0.1)
      if (f < 0.012 && sn < 0.2) col.lerp(new Color('#f4e2c0'), 0.35)
      p.push(new Vector3(x, Math.max(0, y), z))
      c.push(col)
    }
    rings.push({ p, c })
  }
  const crust = orient(loft(rings), (m) => new Vector3(m.x, 20, 0))
  // the torn ends: the crumb, ragged like the crust round it
  const cap = (x0: number, dir: 1 | -1) => {
    const pts: Vector2[] = []
    for (let i = 0; i < M; i++) {
      const t = -Math.PI / 2 + (i / M) * Math.PI * 2
      const [z, y] = section(x0, t)
      pts.push(new Vector2(z, y))
    }
    const g = new ShapeGeometry(new Shape(pts))
    const ps = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < ps.count; i++) {
      const z = ps.getX(i)
      const y = ps.getY(i)
      ps.setXYZ(i, x0 + dir * rag(z, y), y, z)
      uv.setXY(i, (z + 40) / 80, y / 64)
    }
    return orient(g, (m) => new Vector3(m.x - dir * 20, m.y, m.z))
  }
  const caps = [tornLo ? cap(lo, -1) : null, tornHi ? cap(hi, 1) : null].filter(Boolean) as ShapeGeometry[]
  return { crust, caps }
}
/** the geometry of what's left of it between lo and hi (shared: the same piece, the same shape) */
export function baguetteGeo(lo: number, hi: number) {
  const key = `${lo.toFixed(1)}|${hi.toFixed(1)}`
  if (!cache.has(key)) cache.set(key, build(lo, hi))
  return cache.get(key)!
}

export function Baguette({ lo = -HALF, hi = HALF }: { lo?: number; hi?: number }) {
  const g = useMemo(() => baguetteGeo(lo, hi), [lo, hi])
  return (
    <group>
      <mesh geometry={g.crust} material={CRUST} castShadow receiveShadow />
      {g.caps.map((c, i) => (
        <mesh key={i} geometry={c} material={TORN} />
      ))}
    </group>
  )
}
/** how long the next piece torn off is (the n-th): a mouthful for a duck, never quite the same */
export const pieceLength = (n: number) => 44 + 9 * Math.sin(n * 2.3) + 4 * Math.sin(n * 5.1)
/** its middle height and radius, for a capsule collider */
export const BAGUETTE_R = 26
/** its looks, for pieces of it drawn elsewhere (./Toss) */
export const BREAD = { crust: CRUST, torn: TORN }
