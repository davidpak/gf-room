import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from 'three'
import { bruno } from './bruno'
import { YOSHINO, growTree, rng, type Branch, type Species } from './grow'

/**
 * A Yoshino cherry on the Quad, in full bloom, grown from its seed (./grow: every seed its own tree,
 * crooked limbs, elbows, sag, a canopy shaped by its branches). Drawn here:
 *
 *   wood     every branch a smooth tube along its path, tapering, knobbly; the trunk's foot flares
 *            into roots. The bark dark brown-grey, lighter where it faces up, banded across like
 *            cherry bark, moss green along the tops of the big limbs (the photos)
 *   blossom  Bruno's foliage (folio-2025 Foliage.js) in each cloud: small cards, each a clump of five-
 *            petal blossoms cut out by its texture, scattered through a squashed ball, denser at the
 *            middle, their normals out of the ball (and a little out of the whole canopy), so a cloud
 *            shades as one soft ball and its edges stay crunchy with petals; they sway in the wind
 */
export function CherryTree({ seed = 1, species = YOSHINO, position = [0, 0, 0] as [number, number, number], rotation = 0 }: { seed?: number; species?: Species; position?: [number, number, number]; rotation?: number }) {
  const { wood, blossom } = useMemo(() => buildTree(seed, species), [seed, species])
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={wood} material={BARK} castShadow receiveShadow />
      <mesh geometry={blossom} material={BLOSSOM} castShadow receiveShadow />
    </group>
  )
}

// ---- the bark
const BARK_DARK = new Color('#4d3b3c')
const BARK_LIGHT = new Color('#8c7670')
const MOSS = new Color('#6f7a45')
const BARK = bruno({ vertexColors: true })

/** a branch as a smooth, tapering, knobbly tube. Its rings ride frames carried along the path (they
 *  never flip or twist, however it bends); its faces look out */
function tube(b: Branch, rand: () => number, pos: number[], nor: number[], col: number[], idx: number[]) {
  const curve = new CatmullRomCurve3(b.pts, false, 'centripetal')
  const len = curve.getLength()
  const SEG = Math.max(4, Math.round(len / (b.depth === 0 ? 30 : 40)))
  const RAD = b.r0 > 50 ? 14 : b.r0 > 18 ? 10 : b.r0 > 7 ? 7 : 5
  const base = pos.length / 3
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28]
  const c = new Color()
  let N = new Vector3()
  let prevT = new Vector3()
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const p = curve.getPointAt(t)
    const T = curve.getTangentAt(t).normalize()
    if (i === 0) {
      N = new Vector3().crossVectors(T, Math.abs(T.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize()
    } else {
      // carried: turned only as much as the path turns
      const axis = new Vector3().crossVectors(prevT, T)
      const sin = axis.length()
      if (sin > 1e-6) N.applyAxisAngle(axis.divideScalar(sin), Math.asin(Math.min(1, sin)))
      N.sub(T.clone().multiplyScalar(N.dot(T))).normalize()
    }
    prevT = T
    const B = new Vector3().crossVectors(T, N)
    const r = b.r0 + (b.r1 - b.r0) * Math.pow(t, 0.8)
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2
      let k = 1 + 0.08 * Math.sin(a * 3 + ph[0] + t * 9) + 0.05 * Math.sin(a * 5 + ph[1] - t * 13) + 0.05 * Math.sin(t * len * 0.03 + ph[2])
      // the roots: buttresses flaring at the trunk's foot
      if (b.depth === 0) k += 0.6 * Math.pow(Math.max(0, 1 - t / 0.25), 2.2) * Math.pow(Math.max(0, Math.cos(a * 2.5 + ph[0])), 2)
      const n = new Vector3().addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize()
      pos.push(p.x + n.x * r * k, p.y + n.y * r * k, p.z + n.z * r * k)
      nor.push(n.x, n.y, n.z)
      // lighter facing up, banded across, moss along the tops of the big limbs, darker at the foot
      const band = Math.sin(t * len * 0.16 + a * 0.3 + ph[1]) > 0.8 ? -0.2 : 0
      c.copy(BARK_DARK).lerp(BARK_LIGHT, Math.min(1, Math.max(0, n.y * 0.5 + 0.2 + band - (p.y < 60 ? 0.1 : 0))))
      const moss = b.r0 > 16 && b.depth > 0 ? Math.max(0, n.y - 0.35) * 1.6 * (0.5 + 0.5 * Math.sin(t * 7 + ph[2])) : 0
      if (moss > 0) c.lerp(MOSS, Math.min(0.85, moss))
      col.push(c.r, c.g, c.b)
    }
  }
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < RAD; j++) {
      const a = base + i * (RAD + 1) + j
      const b2 = a + RAD + 1
      idx.push(a, a + 1, b2, b2, a + 1, b2 + 1) // (wound so the faces look out)
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

function buildTree(seed: number, species: Species) {
  const tree = growTree(seed, species)
  const rand = rng(seed * 7 + 3)
  const wp: number[] = []
  const wn: number[] = []
  const wc: number[] = []
  const wi: number[] = []
  for (const b of tree.branches) tube(b, rand, wp, wn, wc, wi)
  const wood = new BufferGeometry()
  wood.setAttribute('position', new Float32BufferAttribute(wp, 3))
  wood.setAttribute('normal', new Float32BufferAttribute(wn, 3))
  wood.setAttribute('color', new Float32BufferAttribute(wc, 3))
  wood.setIndex(wi)
  // the blossom: a ball of cards in every cloud; the canopy's middle for the shading
  const mid = new Vector3()
  for (const c of tree.clouds) mid.add(c.at)
  mid.divideScalar(Math.max(1, tree.clouds.length))
  const cp: number[] = []
  const cn: number[] = []
  const cu: number[] = []
  const cc: number[] = []
  const ci: number[] = []
  for (const c of tree.clouds) cluster(c.at, c.r, Math.round(c.r * 0.34), mid, rand, cp, cn, cu, cc, ci)
  const blossom = new BufferGeometry()
  blossom.setAttribute('position', new Float32BufferAttribute(cp, 3))
  blossom.setAttribute('normal', new Float32BufferAttribute(cn, 3))
  blossom.setAttribute('uv', new BufferAttribute(new Float32Array(cu), 2))
  blossom.setAttribute('color', new Float32BufferAttribute(cc, 3))
  blossom.setIndex(ci)
  return { wood, blossom }
}
