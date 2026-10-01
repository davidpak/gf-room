import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, ExtrudeGeometry, Path, Shape, ShapeGeometry, Vector2, type Material } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from './paint'

/**
 * A sandwich half (../spec [S]), lying flat, in real millimetres: two slices off a sandwich loaf (square,
 * with the loaf's domed top, the crust round them), cut corner to corner, and between them a frilly
 * lettuce leaf, tomato (its slices cut through with the bread: half-rounds at the cut, seeds and all), a
 * slice of cheese with its corner drooping over the crust, and ham folded on. The cut side shows the
 * crumb, not crust. `half` 0 is the half with the domed top, 1 the square one.
 *
 * Its frame: lying flat, the cut along x through the origin, the half reaching toward -z, the layers
 * stacked up +y (T thick).
 */
const SLICE = { w: 110, side: 90, dome: 26, r: 10, t: 12 } // (a sandwich loaf's slice: 110 wide, its dome up to 116)
const LAYER = { lettuce: 1.5, tomato: 4, cheese: 2, ham: 3 }
export const SANDWICH_T = SLICE.t * 2 + LAYER.lettuce + LAYER.tomato + LAYER.cheese + LAYER.ham + 1

/** the slice's outline, round from its bottom left (x right, y up) */
function slice(): Vector2[] {
  const { w, side, dome, r } = SLICE
  const p: Vector2[] = []
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 5; i++) {
      const a = a0 + ((a1 - a0) * i) / 5
      p.push(new Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
    }
  }
  arc(r, r, Math.PI, 1.5 * Math.PI)
  arc(w - r, r, 1.5 * Math.PI, 2 * Math.PI)
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    // its top: the loaf's dome, a little proud of its sides at the shoulders
    p.push(new Vector2(w * (1 - t) + 4.5 * Math.sin(Math.PI * t) * (1 - 2 * t), side + dome * Math.pow(Math.sin(Math.PI * t), 0.7)))
  }
  return p
}
/** a polygon clipped to one side of the line a→b (left of it), and which of its edges lie on the line */
function clip(poly: Vector2[], a: Vector2, b: Vector2) {
  const d = b.clone().sub(a)
  const side = (p: Vector2) => d.x * (p.y - a.y) - d.y * (p.x - a.x)
  const out: Vector2[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const sp = side(p)
    const sq = side(q)
    if (sp >= 0) out.push(p.clone())
    if (sp * sq < 0) out.push(p.clone().lerp(q, sp / (sp - sq)))
  }
  return out
}
/** the half, turned so its cut lies along x through the origin and the rest of it toward +y */
function half(which: 0 | 1) {
  const a = new Vector2(0, 0)
  const b = new Vector2(SLICE.w, SLICE.side)
  const poly = which === 0 ? clip(slice(), a, b) : clip(slice(), b, a)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const ang = Math.atan2(b.y - a.y, b.x - a.x) + (which === 0 ? 0 : Math.PI)
  const pts = poly.map((p) => p.clone().sub(mid).rotateAround(new Vector2(), -ang))
  // (which edges are the cut: both ends on y = 0)
  const cut = pts.map((p, i) => Math.abs(p.y) < 0.5 && Math.abs(pts[(i + 1) % pts.length].y) < 0.5)
  return { pts, cut }
}
/** the outline pushed out by `o`, with a ripple of `ripple` along it, `step` mm apart */
function frill(pts: Vector2[], o: number, ripple: number, step: number, seed: number) {
  const r = rng(seed)
  const phase = r() * 6
  const out: Vector2[] = []
  let run = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const len = p.distanceTo(q)
    const n = new Vector2(q.y - p.y, p.x - q.x).normalize() // (out: the outline runs anticlockwise)
    for (let s = 0; s < len; s += step) {
      const k = run + s
      const at = p.clone().lerp(q, s / len)
      out.push(at.addScaledVector(n, o + ripple * Math.sin(k * 0.32 + phase) + ripple * 0.4 * Math.sin(k * 0.71)))
    }
    run += len
  }
  return out
}
const ccw = (pts: Vector2[]) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a > 0 ? pts : pts.slice().reverse()
}

// ---- its looks
const M = {
  crust: bruno({ color: '#c98a4b', shade: '#8a6a86' }),
  crumbSide: bruno({ color: '#f6e6c6', shade: '#e0c3ad' }), // (the cut: crumb stays warm in its own shade)
  lettuce: bruno({ color: '#94cf6f', shade: '#5d8a78', side: DoubleSide }),
  lettuceDeep: bruno({ color: '#6fb25a', shade: '#4f7b70', side: DoubleSide }),
  tomatoSkin: bruno({ color: '#e04a3f', shade: '#9a4b70' }),
  cheese: bruno({ color: '#f7c94b', shade: '#b39184' }),
  ham: bruno({ color: '#f09ba3', shade: '#a77894' }),
  hamRim: bruno({ color: '#fbd9d4', shade: '#b09cae' }),
}
/** a slice's face: crumb, its pores, the crust a thin brown rim round the edges that aren't the cut */
function faceTex(pts: Vector2[], cut: boolean[], seed: number) {
  const r = rng(seed)
  const minX = Math.min(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const S = 4 // (px a mm)
  const W = 160 * S
  const H = 90 * S
  const t = paint(W, H, (g) => {
    g.fillStyle = '#f7e9cc'
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '205,170,120' : '255,250,235'},${0.25 + r() * 0.35})`
      g.beginPath()
      g.ellipse(r() * W, r() * H, 0.6 * S + r() * S, 0.4 * S + r() * 0.8 * S, r() * 3, 0, Math.PI * 2)
      g.fill()
    }
    // the crust's rim on the face
    g.strokeStyle = '#c4874a'
    g.lineWidth = 3.2 * S
    g.lineCap = 'round'
    for (let i = 0; i < pts.length; i++) {
      if (cut[i]) continue
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      g.beginPath()
      g.moveTo((p.x - minX) * S, H - (p.y - minY) * S)
      g.lineTo((q.x - minX) * S, H - (q.y - minY) * S)
      g.stroke()
    }
  })
  if (t) {
    t.repeat.set(1 / 160, 1 / 90)
    t.offset.set(-minX / 160, -minY / 90)
  }
  return t
}
/** the bread: its two faces, the crust round it, the crumb showing at the cut */
function bread(pts: Vector2[], cut: boolean[]) {
  const shape = new Shape(ccw(pts))
  const top = new ShapeGeometry(shape)
  top.translate(0, 0, SLICE.t)
  // (the underside: the same face, wound the other way so it faces down)
  const bottom = new ShapeGeometry(shape)
  const ix = bottom.index!.array as unknown as number[]
  for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]
  bottom.computeVertexNormals()
  const crust: number[] = []
  const crumb: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const quad = [p.x, p.y, 0, q.x, q.y, 0, q.x, q.y, SLICE.t, p.x, p.y, 0, q.x, q.y, SLICE.t, p.x, p.y, SLICE.t]
    ;(cut[i] ? crumb : crust).push(...quad)
  }
  const strip = (v: number[]) => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
    g.computeVertexNormals()
    return g
  }
  return { top, bottom, crust: strip(crust), crumb: strip(crumb) }
}
/** a ruffled leaf (or a folded slice): an outline lifted and dropped along its edge */
function ruffled(outline: Vector2[], amp: number, freq: number, seed: number) {
  const g = new ShapeGeometry(new Shape(ccw(outline)))
  const r = rng(seed)
  const ph = r() * 6
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    p.setZ(i, amp * Math.sin(x * freq + ph) * Math.sin(y * freq * 1.3 + ph * 0.7) + amp * 0.5 * Math.sin((x + y) * freq * 2.1))
  }
  g.computeVertexNormals()
  return g
}

const made: { [k: number]: ReturnType<typeof build> } = {}
function build(which: 0 | 1) {
  const { pts, cut } = half(which)
  const b = bread(pts, cut)
  const face = faceTex(pts, cut, 31 + which)
  const faceMat = bruno({ map: face ?? undefined, color: '#ffffff', shade: '#b3a0b8' })
  // lettuce: a frill beyond the bread all round (bigger at the cut, where it's pushed out)
  const leaf = ruffled(frill(pts, 4, 2.6, 2, 7 + which), 1.8, 0.18, 3)
  const leaf2 = ruffled(frill(pts, 1.5, 2, 2.5, 19 + which), 1.4, 0.21, 9)
  // tomato: two slices, cut through with the bread at the cut (half-rounds), seeds in their pulp
  const tomatoes = [-34, 30].map((x, i) => {
    const s = new Shape()
    const R = 25 + i * 2
    s.moveTo(x - R, 0)
    s.absarc(x, 0, R, Math.PI, 0, true)
    s.lineTo(x - R, 0)
    const pulp = new Shape()
    pulp.moveTo(x - R + 3, 0.2)
    pulp.absarc(x, 0.2, R - 3, Math.PI, 0, true)
    pulp.lineTo(x - R + 3, 0.2)
    const seeds = [0.35, 0.65].map((f) => {
      const a = Math.PI * f
      const c = new Path()
      c.absellipse(x + Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 5.5, 3.5, 0, Math.PI * 2, false, a)
      return c
    })
    return { skin: new ExtrudeGeometry(s, { depth: LAYER.tomato, bevelEnabled: false }), pulp: new ShapeGeometry(pulp), seeds: seeds.map((c) => new ShapeGeometry(new Shape(c.getPoints(16)))) }
  })
  // cheese: a square slice, cut with the rest, one corner hanging past the crust and drooping over it
  const cheeseOutline = (() => {
    const sq = [new Vector2(-4, -4), new Vector2(116, -4), new Vector2(116, 96), new Vector2(-4, 96)]
    const a = new Vector2(0, 0)
    const b = new Vector2(SLICE.w, SLICE.side)
    const poly = which === 0 ? clip(sq, a, b) : clip(sq, b, a)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + (which === 0 ? 0 : Math.PI)
    return poly.map((p) => p.clone().sub(mid).rotateAround(new Vector2(), -ang).add(new Vector2(6, 3)))
  })()
  const cheese = new ExtrudeGeometry(new Shape(ccw(frill(cheeseOutline, 0, 0, 3, 5))), { depth: LAYER.cheese, bevelEnabled: false })
  {
    // its overhang droops: down as far as it reaches past the bread
    const p = cheese.attributes.position
    const inside = new Shape(ccw(pts)).getPoints()
    const dist = (x: number, y: number) => {
      let best = 1e9
      for (let i = 0; i < inside.length; i++) {
        const a = inside[i]
        const b = inside[(i + 1) % inside.length]
        const ab = b.clone().sub(a)
        const t = Math.max(0, Math.min(1, ((x - a.x) * ab.x + (y - a.y) * ab.y) / ab.lengthSq()))
        best = Math.min(best, Math.hypot(x - a.x - ab.x * t, y - a.y - ab.y * t))
      }
      return best
    }
    const isIn = (x: number, y: number) => {
      let c = false
      for (let i = 0, j = inside.length - 1; i < inside.length; j = i++) {
        const a = inside[i]
        const b = inside[j]
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
      }
      return c
    }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      if (!isIn(x, y)) p.setZ(i, p.getZ(i) - Math.min(9, dist(x, y) ** 1.4 * 0.9))
    }
    cheese.computeVertexNormals()
  }
  // ham: folded on, a little past the bread here and there, a paler rim of fat
  const ham = ruffled(frill(pts, 2, 3, 2.2, 13 + which), 1.4, 0.12, 21)
  const hamRim = ruffled(frill(pts, 3.2, 3, 2.2, 13 + which), 1.4, 0.12, 21)
  return { b, faceMat, leaf, leaf2, tomatoes, cheese, ham, hamRim }
}
const TOMATO_PULP = bruno({ color: '#f07a62', shade: '#a35c78' })
const TOMATO_SEED = bruno({ color: '#f7d36a', shade: '#a99080' })

export function Sandwich({ half: which = 0 }: { half?: 0 | 1 }) {
  const s = useMemo(() => (made[which] ??= build(which)), [which])
  const z = (k: number) => k
  const L = LAYER
  const t = SLICE.t
  const at = { lettuce: t + 0.6, tomato: t + L.lettuce, cheese: t + L.lettuce + L.tomato, ham: t + L.lettuce + L.tomato + L.cheese }
  const top = t + L.lettuce + L.tomato + L.cheese + L.ham + 1
  const breadMesh = (zz: number) => (
    <group position={[0, 0, z(zz)]}>
      <mesh geometry={s.b.top} material={s.faceMat} castShadow receiveShadow />
      <mesh geometry={s.b.bottom} material={s.faceMat} />
      <mesh geometry={s.b.crust} material={M.crust as Material} castShadow />
      <mesh geometry={s.b.crumb} material={M.crumbSide as Material} />
    </group>
  )
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {breadMesh(0)}
      <mesh geometry={s.leaf} material={M.lettuce} position={[0, 0, at.lettuce]} />
      <mesh geometry={s.leaf2} material={M.lettuceDeep} position={[0, 0, at.lettuce + 0.8]} />
      {s.tomatoes.map((tm, i) => (
        <group key={i} position={[0, 0, at.tomato]}>
          <mesh geometry={tm.skin} material={M.tomatoSkin} />
          <mesh geometry={tm.pulp} material={TOMATO_PULP} position={[0, 0, LAYER.tomato + 0.05]} />
          {tm.seeds.map((g, k) => (
            <mesh key={k} geometry={g} material={TOMATO_SEED} position={[0, 0, LAYER.tomato + 0.1]} />
          ))}
        </group>
      ))}
      <mesh geometry={s.cheese} material={M.cheese} position={[0, 0, at.cheese]} castShadow />
      <mesh geometry={s.hamRim} material={M.hamRim} position={[0, 0, at.ham]} />
      <mesh geometry={s.ham} material={M.ham} position={[0, 0, at.ham + 0.4]} />
      {breadMesh(top)}
    </group>
  )
}
