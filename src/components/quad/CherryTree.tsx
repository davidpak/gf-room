import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from 'three'
import { bruno } from './bruno'

/**
 * A Yoshino cherry on the Quad, in full bloom (the reference photos): a short, thick, dark trunk
 * flaring into roots, forking low into five limbs that arch up and out, each forking again; over it
 * a canopy far wider than it is tall, a cloud of blossom.
 *
 *   trunk    tubes along curved limbs, tapering, knobbly (bumps round and along), the bark dark plum-
 *            brown, lighter where it faces up, banded across like cherry bark
 *   canopy   Bruno's foliage (folio-2025 Foliage.js): clusters of small cards, each a clump of five-
 *            petal blossoms cut out by its texture, scattered through a squashed ball, denser at the
 *            middle; their normals point out of the cluster (blended with out of the whole canopy),
 *            so each cluster shades as one soft ball, lit pale on top, rose-violet underneath, and the
 *            edges stay crunchy with petals. The wind sways them
 *
 * `seed` makes each tree its own; `scale` its size. Toy scale, mm: about 1500 across, 1050 tall.
 */
export function CherryTree({ seed = 1, scale = 1, position = [0, 0, 0] as [number, number, number], rotation = 0 }: { seed?: number; scale?: number; position?: [number, number, number]; rotation?: number }) {
  const { trunk, canopy } = useMemo(() => buildTree(seed), [seed])
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh geometry={trunk} material={BARK} castShadow receiveShadow />
      <mesh geometry={canopy} material={BLOSSOM} castShadow receiveShadow />
    </group>
  )
}

// ---- a repeatable random
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- the bark
const BARK_DARK = new Color('#6b4a4e')
const BARK_LIGHT = new Color('#a88580')
const BARK = bruno({ vertexColors: true, flatShading: false })

type Limb = { pts: Vector3[]; r0: number; r1: number; roots?: boolean }

/** a tapering, knobbly tube along a limb, bark-coloured by vertex */
function tube(l: Limb, rand: () => number, pos: number[], nor: number[], col: number[], idx: number[]) {
  const curve = new CatmullRomCurve3(l.pts, false, 'centripetal')
  const SEG = Math.max(6, Math.round(curve.getLength() / 45))
  const RAD = l.r0 > 40 ? 11 : 8
  const frames = curve.computeFrenetFrames(SEG, false)
  const base = pos.length / 3
  const bumps = [rand() * 6.28, rand() * 6.28, rand() * 6.28]
  const c = new Color()
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const p = curve.getPointAt(t)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    let r = l.r0 + (l.r1 - l.r0) * Math.pow(t, 0.75)
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2
      // knobbly: bumps round and along; the roots flare out in buttresses at the foot
      let k = 1 + 0.09 * Math.sin(a * 3 + bumps[0] + t * 7) + 0.06 * Math.sin(a * 5 + bumps[1] - t * 11) + 0.05 * Math.sin(t * 19 + bumps[2])
      if (l.roots) k += 0.55 * Math.pow(Math.max(0, 1 - t / 0.22), 2) * Math.pow(Math.max(0, Math.cos(a * 2.5 + bumps[0])), 2)
      const rr = r * k
      const n = new Vector3().addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize()
      pos.push(p.x + n.x * rr, p.y + n.y * rr, p.z + n.z * rr)
      nor.push(n.x, n.y, n.z)
      // lighter where it faces up; banded across (cherry bark's lenticels); darker low down
      const up = Math.max(0, n.y) * 0.55
      const band = Math.sin((p.y + p.x * 0.3) * 0.22 + a * 0.2) > 0.82 ? -0.18 : 0
      c.copy(BARK_DARK).lerp(BARK_LIGHT, Math.min(1, Math.max(0, up + band + 0.1 + (1 - Math.min(1, p.y / 300)) * -0.1)))
      col.push(c.r, c.g, c.b)
    }
  }
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < RAD; j++) {
      const a = base + i * (RAD + 1) + j
      const b = a + RAD + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1) // (wound so the faces look out: along × around is outward)
    }
}

/** a knot of bark: a lumpy, squashed ball (where the limbs fork, closing the trunk's top) */
function knot(c: Vector3, r: number, rand: () => number, pos: number[], nor: number[], col: number[], idx: number[]) {
  const W = 12
  const H = 8
  const base = pos.length / 3
  const ph = rand() * 6.28
  const k = new Color()
  for (let i = 0; i <= H; i++) {
    const v = i / H
    const th = v * Math.PI
    for (let j = 0; j <= W; j++) {
      const a = (j / W) * Math.PI * 2
      const n = new Vector3(Math.sin(th) * Math.cos(a), Math.cos(th), Math.sin(th) * Math.sin(a))
      const rr = r * (1 + 0.08 * Math.sin(a * 3 + ph) * Math.sin(th))
      pos.push(c.x + n.x * rr, c.y + n.y * rr * 0.7, c.z + n.z * rr)
      nor.push(n.x, n.y, n.z)
      k.copy(BARK_DARK).lerp(BARK_LIGHT, Math.max(0, n.y) * 0.55 + 0.1)
      col.push(k.r, k.g, k.b)
    }
  }
  for (let i = 0; i < H; i++)
    for (let j = 0; j < W; j++) {
      const a = base + i * (W + 1) + j
      const b = a + W + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1) // (outward, like the tubes)
    }
}

// ---- the blossom
/** a card's picture: a loose clump of five-petal cherry blossoms (colour), and its cut-out (alpha) */
function blossomTextures() {
  const N = 256
  const col = document.createElement('canvas')
  const cut = document.createElement('canvas')
  col.width = col.height = cut.width = cut.height = N
  const g = col.getContext('2d')!
  const a = cut.getContext('2d')!
  a.fillStyle = '#000'
  a.fillRect(0, 0, N, N)
  g.fillStyle = '#fbe9ee'
  g.fillRect(0, 0, N, N)
  const rand = rng(7)
  const flowers: [number, number, number, number][] = []
  for (let i = 0; i < 9; i++) {
    const r = 26 + rand() * 18
    const d = rand() ** 0.8 * (N / 2 - r - 6)
    const th = rand() * Math.PI * 2
    flowers.push([N / 2 + Math.cos(th) * d, N / 2 + Math.sin(th) * d, r, rand() * Math.PI])
  }
  const petal = (ctx: CanvasRenderingContext2D, r: number) => {
    // a cherry petal: round, a little notch at its tip
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-r * 0.55, -r * 0.25, -r * 0.62, -r * 0.95, -r * 0.14, -r)
    ctx.lineTo(0, -r * 0.84)
    ctx.lineTo(r * 0.14, -r)
    ctx.bezierCurveTo(r * 0.62, -r * 0.95, r * 0.55, -r * 0.25, 0, 0)
    ctx.fill()
  }
  for (const [x, y, r, rot] of flowers) {
    for (const [ctx, fill] of [
      [a, '#fff'],
      [g, ''],
    ] as const) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      for (let p = 0; p < 5; p++) {
        ctx.rotate((Math.PI * 2) / 5)
        if (fill) ctx.fillStyle = fill
        else {
          const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
          gr.addColorStop(0, '#f3a3bd')
          gr.addColorStop(0.35, '#fde2ea')
          gr.addColorStop(1, '#fff7f9')
          ctx.fillStyle = gr
        }
        petal(ctx, r)
      }
      if (!fill) {
        // the heart: a deeper pink eye, stamens
        ctx.fillStyle = '#d9607f'
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f7d27a'
        for (let s = 0; s < 7; s++) {
          const sa = s * 0.9
          ctx.beginPath()
          ctx.arc(Math.cos(sa) * r * 0.26, Math.sin(sa) * r * 0.26, r * 0.045, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    }
  }
  const map = new CanvasTexture(col)
  map.colorSpace = SRGBColorSpace
  const alphaMap = new CanvasTexture(cut)
  return { map, alphaMap }
}
const TEX = typeof document !== 'undefined' ? blossomTextures() : null
const BLOSSOM = bruno({
  map: TEX?.map,
  alphaMap: TEX?.alphaMap,
  alphaTest: 0.5,
  vertexColors: true,
  side: DoubleSide,
  shade: '#cf86b8', // (light through petals: rosier than the world's shadow)
  sway: 16,
  swayFrom: 250,
})
BLOSSOM.defines = { ...BLOSSOM.defines, NO_FLIP: '' } // (cards seen from behind shade as their cluster, not inside out)
const PINKS = ['#fff6f8', '#fde6ec', '#fbd3df', '#f7c0d1', '#fde6ec']

/** one cluster: `n` cards scattered through a squashed ball of radius R at c */
function cluster(c: Vector3, R: number, n: number, canopyMid: Vector3, rand: () => number, pos: number[], nor: number[], uv: number[], col: number[], idx: number[]) {
  const size = R * 0.52
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ]
  const q = new Quaternion()
  const m = new Matrix4()
  const v = new Vector3()
  const out = new Vector3()
  const tint = new Color()
  for (let i = 0; i < n; i++) {
    // where: through the ball, denser in the middle (Bruno's 1 - rand³), squashed flatter
    const dir = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()
    const d = (1 - Math.pow(rand(), 3)) * R
    const p = c.clone().addScaledVector(dir, d)
    p.y = c.y + (p.y - c.y) * 0.68
    // how: turned every which way, a little toward facing out
    q.setFromAxisAngle(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * Math.PI * 2)
    m.compose(p, q, new Vector3(size * (0.8 + rand() * 0.5), size * (0.8 + rand() * 0.5), 1))
    // shaded as its cluster (out of the ball), a little as the whole canopy
    out.copy(p).sub(c).normalize().multiplyScalar(0.8).add(v.copy(p).sub(canopyMid).normalize().multiplyScalar(0.35)).normalize()
    // pinker low down and inside, whiter on top
    tint.set(PINKS[Math.floor(rand() * PINKS.length)])
    if (out.y < -0.2) tint.lerp(new Color('#f4b3c8'), 0.45)
    const base = pos.length / 3
    corners.forEach(([x, y], k) => {
      v.set(x, y, 0).applyMatrix4(m)
      pos.push(v.x, v.y, v.z)
      nor.push(out.x, out.y, out.z)
      uv.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 1)
      col.push(tint.r, tint.g, tint.b)
    })
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
}

function buildTree(seed: number) {
  const rand = rng(seed)
  // the skeleton: the trunk, five limbs forking off it low, each forking again
  const lean = new Vector3(rand() - 0.5, 0, rand() - 0.5).multiplyScalar(40)
  const fork = new Vector3(lean.x, 270, lean.z)
  const limbs: Limb[] = [{ pts: [new Vector3(0, -20, 0), new Vector3(lean.x * 0.3, 120, lean.z * 0.3), fork], r0: 96, r1: 72, roots: true }]
  const ends: { p: Vector3; r: number }[] = []
  const LIMBS = 5
  const a0 = rand() * Math.PI * 2
  for (let i = 0; i < LIMBS; i++) {
    const a = a0 + (i / LIMBS) * Math.PI * 2 + (rand() - 0.5) * 0.5
    const out = new Vector3(Math.cos(a), 0, Math.sin(a))
    const reach = 520 + rand() * 180
    const lift = 330 + rand() * 120
    // up out of the fork, arching outward, levelling off (the umbrella)
    const pts = [
      fork.clone().addScaledVector(out, -8).setY(fork.y - 70), // (from inside the trunk: no seam where they leave it)
      fork.clone().addScaledVector(out, reach * 0.22).setY(fork.y + lift * 0.45),
      fork.clone().addScaledVector(out, reach * 0.58).setY(fork.y + lift * 0.85),
      fork.clone().addScaledVector(out, reach).setY(fork.y + lift),
    ]
    limbs.push({ pts, r0: 50, r1: 18 })
    ends.push({ p: pts[3].clone(), r: 250 })
    // two forks off it, further out and up
    for (const side of [-1, 1]) {
      const from = new CatmullRomCurve3(pts).getPointAt(0.45 + rand() * 0.2)
      const b = a + side * (0.45 + rand() * 0.35)
      const o2 = new Vector3(Math.cos(b), 0, Math.sin(b))
      const r2 = 240 + rand() * 160
      const end = from.clone().addScaledVector(o2, r2).setY(from.y + 90 + rand() * 120)
      limbs.push({ pts: [from, from.clone().addScaledVector(o2, r2 * 0.5).setY(from.y + 70 + rand() * 60), end], r0: 22, r1: 7 })
      ends.push({ p: end, r: 190 + rand() * 50 })
    }
  }
  // the trunk and limbs
  const tp: number[] = []
  const tn: number[] = []
  const tc: number[] = []
  const ti: number[] = []
  for (const l of limbs) tube(l, rand, tp, tn, tc, ti)
  knot(fork, 80, rand, tp, tn, tc, ti)
  const trunk = new BufferGeometry()
  trunk.setAttribute('position', new Float32BufferAttribute(tp, 3))
  trunk.setAttribute('normal', new Float32BufferAttribute(tn, 3))
  trunk.setAttribute('color', new Float32BufferAttribute(tc, 3))
  trunk.setIndex(ti)
  // the canopy: a cluster at every branch end, a few more filling the crown
  const mid = new Vector3(lean.x, fork.y + 380, lean.z)
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2
    const r = 150 + rand() * 250
    ends.push({ p: new Vector3(mid.x + Math.cos(a) * r, mid.y + 60 + rand() * 120, mid.z + Math.sin(a) * r), r: 240 })
  }
  const cp: number[] = []
  const cn: number[] = []
  const cu: number[] = []
  const cc: number[] = []
  const ci: number[] = []
  for (const e of ends) cluster(e.p.clone().add(new Vector3(0, 40, 0)), e.r, Math.round(e.r * 0.42), mid, rand, cp, cn, cu, cc, ci)
  const canopy = new BufferGeometry()
  canopy.setAttribute('position', new Float32BufferAttribute(cp, 3))
  canopy.setAttribute('normal', new Float32BufferAttribute(cn, 3))
  canopy.setAttribute('uv', new BufferAttribute(new Float32Array(cu), 2))
  canopy.setAttribute('color', new Float32BufferAttribute(cc, 3))
  canopy.setIndex(ci)
  return { trunk, canopy }
}
