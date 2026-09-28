import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from 'three'
import { bruno } from './bruno'

/**
 * A cherry in full bloom, stylised (toy, not botany): a chunky trunk, leaning a little, a few short
 * thick limbs up into a big, full dome of blossom made of large overlapping puffs. Four variants
 * (`model`): each its own lean, height and puffs. Drawn here:
 *
 *   wood     tapering, knobbly tubes, their ends closed over; the trunk's foot flares a little into
 *            roots. Bark near black-brown, a touch lighter facing up, banded across like cherry bark
 *   blossom  Bruno's foliage (folio-2025 Foliage.js) in each puff: clouds of small cards, each a clump
 *            of five-petal blossoms cut out by its texture, scattered through a squashed ball, their
 *            normals out of the ball (and a little out of the whole canopy), so a cloud shades as one
 *            soft ball and its edges stay crunchy with petals; pale, near white, lavender in shade
 */
export function CherryTree({ model = 0, position = [0, 0, 0] as [number, number, number], rotation = 0, scale = 1 }: { model?: number; position?: [number, number, number]; rotation?: number; scale?: number }) {
  const { wood, blossom } = useMemo(() => buildTree(model), [model])
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh geometry={wood} material={BARK} castShadow receiveShadow />
      <mesh geometry={blossom} material={BLOSSOM} castShadow receiveShadow />
    </group>
  )
}

function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// ---- the bark
const BARK_DARK = new Color('#3b2e2e')
const BARK_LIGHT = new Color('#6b5953')
const MOSS = new Color('#66703f')
const BARK = bruno({ vertexColors: true })
BARK.defines = { ...BARK.defines, SEE_THROUGH: '' }

type Wood = { pts: Vector3[]; r0: number; r1: number; kind: 'trunk' | 'limb' | 'branch' | 'twig' }

/** a length of wood: a tapering, knobbly tube along its path (its rings ride frames carried along
 *  it, so they never twist), its end closed over (the trunk's in a rounded crown), faces looking out */
function tube(w: Wood, rand: () => number, pos: number[], nor: number[], col: number[], idx: number[]) {
  // (low tension: straight runs between the points, the elbows kept sharp)
  const curve = new CatmullRomCurve3(w.pts, false, 'catmullrom', w.kind === 'trunk' ? 0.5 : 0.12)
  const len = curve.getLength()
  const SEG = Math.max(3, Math.round(len / (w.kind === 'trunk' ? 26 : w.kind === 'twig' ? 45 : 34)))
  const RAD = w.r0 > 60 ? 16 : w.r0 > 30 ? 12 : w.r0 > 10 ? 8 : 5
  const base = pos.length / 3
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28]
  const c = new Color()
  let N = new Vector3()
  let prevT = new Vector3()
  const tint = (n: Vector3, p: Vector3, t: number, a: number) => {
    // a touch lighter facing up; banded across; moss on top of the big limbs
    const band = Math.sin(t * len * 0.14 + a * 0.3 + ph[1]) > 0.78 ? -0.18 : 0
    c.copy(BARK_DARK).lerp(BARK_LIGHT, Math.min(1, Math.max(0, n.y * 0.45 + 0.18 + band)))
    const moss = (w.kind === 'limb' || w.kind === 'trunk') && p.y > 150 ? Math.max(0, n.y - 0.3) * 1.5 * (0.45 + 0.55 * Math.sin(t * 6 + ph[2])) : 0
    if (moss > 0) c.lerp(MOSS, Math.min(0.8, moss))
    col.push(c.r, c.g, c.b)
  }
  let lastP = new Vector3()
  let lastT = new Vector3()
  let lastR = w.r1
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const p = curve.getPointAt(t)
    const T = curve.getTangentAt(t).normalize()
    if (i === 0) N = new Vector3().crossVectors(T, Math.abs(T.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize()
    else {
      const axis = new Vector3().crossVectors(prevT, T)
      const sin = axis.length()
      if (sin > 1e-6) N.applyAxisAngle(axis.divideScalar(sin), Math.asin(Math.min(1, sin)))
      N.sub(T.clone().multiplyScalar(N.dot(T))).normalize()
    }
    prevT = T
    const B = new Vector3().crossVectors(T, N)
    const r = w.r0 + (w.r1 - w.r0) * Math.pow(t, w.kind === 'trunk' ? 1 : 0.85)
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2
      let k = 1 + 0.07 * Math.sin(a * 3 + ph[0] + t * 8) + 0.045 * Math.sin(a * 5 + ph[1] - t * 12) + 0.04 * Math.sin(t * len * 0.035 + ph[2])
      // the foot: a gentle flare into roots, mostly under the ground's edge
      if (w.kind === 'trunk') k += 0.32 * Math.pow(Math.max(0, 1 - p.y / 110), 2) * (0.55 + 0.45 * Math.cos(a * 3 + ph[0]))
      const n = new Vector3().addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize()
      pos.push(p.x + n.x * r * k, p.y + n.y * r * k, p.z + n.z * r * k)
      nor.push(n.x, n.y, n.z)
      tint(n, p, t, a)
    }
    lastP = p
    lastT = T
    lastR = r
  }
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < RAD; j++) {
      const a = base + i * (RAD + 1) + j
      const b2 = a + RAD + 1
      idx.push(a, a + 1, b2, b2, a + 1, b2 + 1) // (wound so the faces look out)
    }
  // closed over: a crown (a few shrinking rings) for the trunk, a small cone for the rest
  const last = base + SEG * (RAD + 1)
  const rings = w.kind === 'trunk' ? 4 : 1
  let prev = last
  const B0 = new Vector3().crossVectors(lastT, N)
  for (let q = 1; q <= rings; q++) {
    const e = q / rings
    const ang = (e * Math.PI) / 2
    const rr = lastR * Math.cos(ang) * (q === rings ? 0 : 1)
    const up = lastR * (w.kind === 'trunk' ? 0.55 : 0.5) * Math.sin(ang)
    const start = pos.length / 3
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2
      const n = new Vector3().addScaledVector(N, Math.cos(a)).addScaledVector(B0, Math.sin(a))
      const p = lastP.clone().addScaledVector(n, rr).addScaledVector(lastT, up)
      const nn = n.clone().multiplyScalar(Math.cos(ang)).addScaledVector(lastT, Math.sin(ang)).normalize()
      pos.push(p.x, p.y, p.z)
      nor.push(nn.x, nn.y, nn.z)
      tint(nn, p, 1, a)
    }
    for (let j = 0; j < RAD; j++) idx.push(prev + j, prev + j + 1, start + j, start + j, prev + j + 1, start + j + 1)
    prev = start
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
          gr.addColorStop(0, '#f1b3c7')
          gr.addColorStop(0.3, '#fcecf1')
          gr.addColorStop(1, '#fffafb')
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
  shade: '#c7a4d8', // (pale blossom in shade goes lavender, as in the photos)
  sway: 16,
  swayFrom: 250,
})
BLOSSOM.defines = { ...BLOSSOM.defines, NO_FLIP: '', SEE_THROUGH: '' } // (cards seen from behind shade as their cluster, not inside out)
const PINKS = ['#ffffff', '#fff5f8', '#fdeaf0', '#fbdfe8', '#fff0f4']

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
    if (out.y < -0.2) tint.lerp(new Color('#f3c6d6'), 0.4)
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

/** the four variants: trunk height and lean, the dome's width and height, how its puffs sit */
const VARIANTS = [
  { h: 420, lean: 0.1, w: 1, tall: 1, seed: 11 },
  { h: 380, lean: 0.22, w: 1.1, tall: 0.92, seed: 23 },
  { h: 340, lean: 0.06, w: 1.18, tall: 0.85, seed: 37 },
  { h: 470, lean: 0.14, w: 0.9, tall: 1.12, seed: 51 },
]

function buildTree(model: number) {
  const V = VARIANTS[model % VARIANTS.length]
  const rand = rng(V.seed)
  const la = rand() * Math.PI * 2
  const lean = new Vector3(Math.cos(la), 0, Math.sin(la)).multiplyScalar(Math.tan(V.lean))
  const top = new Vector3(lean.x * V.h, V.h, lean.z * V.h)
  // the trunk, and three or four short thick limbs up into the dome
  const woods: Wood[] = [{ pts: [new Vector3(0, -40, 0), new Vector3(lean.x * V.h * 0.45, V.h * 0.5, lean.z * V.h * 0.45), top], r0: 100, r1: 80, kind: 'trunk' }]
  const limbs = 3 + Math.round(rand())
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rand() * 0.8
    const out = new Vector3(Math.cos(a), 0, Math.sin(a))
    const from = top.clone().add(new Vector3(0, -70, 0))
    const reach = (230 + rand() * 120) * V.w
    woods.push({
      pts: [from, from.clone().addScaledVector(out, reach * 0.35).add(new Vector3(0, 160, 0)), from.clone().addScaledVector(out, reach).add(new Vector3(0, 250 + rand() * 90, 0))],
      r0: 54,
      r1: 20,
      kind: 'limb',
    })
  }
  // the dome: a big puff in the middle, a ring round it, a few on top
  const mid = top.clone().add(new Vector3(0, 360 * V.tall, 0))
  const clouds: { at: Vector3; r: number }[] = [{ at: mid.clone(), r: 360 * V.w }]
  const ring = 6 + Math.round(rand() * 2)
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rand() * 0.5
    const r = (400 + rand() * 90) * V.w
    clouds.push({ at: mid.clone().add(new Vector3(Math.cos(a) * r, (rand() - 0.6) * 110 * V.tall, Math.sin(a) * r)), r: (240 + rand() * 70) * V.w })
  }
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2
    const r = rand() * 220 * V.w
    clouds.push({ at: mid.clone().add(new Vector3(Math.cos(a) * r, (170 + rand() * 60) * V.tall, Math.sin(a) * r)), r: (220 + rand() * 50) * V.w })
  }
  const wp: number[] = []
  const wn: number[] = []
  const wc: number[] = []
  const wi: number[] = []
  for (const w of woods) tube(w, rand, wp, wn, wc, wi)
  const wood = new BufferGeometry()
  wood.setAttribute('position', new Float32BufferAttribute(wp, 3))
  wood.setAttribute('normal', new Float32BufferAttribute(wn, 3))
  wood.setAttribute('color', new Float32BufferAttribute(wc, 3))
  wood.setIndex(wi)
  const cp: number[] = []
  const cn: number[] = []
  const cu: number[] = []
  const cc: number[] = []
  const ci: number[] = []
  for (const c of clouds) cluster(c.at, c.r, Math.round(c.r * 0.6), mid, rand, cp, cn, cu, cc, ci)
  const blossom = new BufferGeometry()
  blossom.setAttribute('position', new Float32BufferAttribute(cp, 3))
  blossom.setAttribute('normal', new Float32BufferAttribute(cn, 3))
  blossom.setAttribute('uv', new BufferAttribute(new Float32Array(cu), 2))
  blossom.setAttribute('color', new Float32BufferAttribute(cc, 3))
  blossom.setIndex(ci)
  return { wood, blossom }
}
