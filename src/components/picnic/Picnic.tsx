import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Group,
  type Material,
  type Texture,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { BASKET, BLANKET, BOOKS, PLATE, SANDWICH } from './spec'

/**
 * The picnic (./spec), in real millimetres, the toy look (matte, warm, chunky):
 *
 *   Blanket    red and white gingham laid on the grass: a gentle swell to it, one corner turned back
 *   Basket     willow, woven: a wrapped rim, a fixed strip down its middle with a lid hinged each side of
 *              it (gingham under them, a plate strapped to each), a hooped handle end to end, leather tabs;
 *              red gingham lining; four sandwich halves stood up inside. `open` 0..1 lifts its lids
 *   Sandwich   a half, cut corner to corner: bread with its crust, lettuce, tomato, cheese, ham
 *   Book       a paperback (or the little hardback), its cover and spine drawn; `tented` lies open face down
 */
const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  return t
}
let seed = 11
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

// ---- gingham: red over cream, the crossings deeper
const ginghamTex = tex(128, 128, (g) => {
  g.fillStyle = '#fbf3ea'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(214,74,72,0.5)'
  g.fillRect(0, 0, 64, 128)
  g.fillRect(0, 0, 128, 64)
  // a faint weave in it
  for (let i = 0; i < 128; i += 3) {
    g.fillStyle = 'rgba(120,40,40,0.05)'
    g.fillRect(i, 0, 1, 128)
    g.fillRect(0, i, 128, 1)
  }
})
// ---- willow: strands woven over and under the stakes
const weaveTex = tex(128, 128, (g) => {
  g.fillStyle = '#6e4a2a'
  g.fillRect(0, 0, 128, 128)
  const row = 16
  for (let r = 0; r < 128 / row; r++) {
    for (let k = -1; k < 5; k++) {
      const x = k * 32 + (r % 2 ? 16 : 0)
      const gr = g.createLinearGradient(0, r * row, 0, r * row + row - 3)
      const tone = 0.9 + rand() * 0.2
      gr.addColorStop(0, `rgb(${226 * tone},${182 * tone},${118 * tone})`)
      gr.addColorStop(0.5, `rgb(${204 * tone},${156 * tone},${94 * tone})`)
      gr.addColorStop(1, `rgb(${150 * tone},${106 * tone},${60 * tone})`)
      g.fillStyle = gr
      g.beginPath()
      g.roundRect(x + 2, r * row + 1, 28, row - 3, 6)
      g.fill()
    }
  }
})
const weaves = new Map<string, Material>()
/** willow, its strands `period` mm apart on a surface whose uvs run 0..1 over `u` × `v` mm */
function willow(u: number, v: number, period = 26) {
  const key = `${Math.round(u)}x${Math.round(v)}@${period}`
  if (!weaves.has(key)) {
    const t = weaveTex?.clone() as Texture | undefined
    if (t) {
      t.needsUpdate = true
      t.repeat.set(u / (period * 2), v / (period * 2))
    }
    weaves.set(key, bruno({ map: t, color: '#ffffff', shade: '#7d6488' }))
  }
  return weaves.get(key)!
}
const M = {
  gingham: bruno({ map: ginghamTex ?? undefined, color: '#ffffff', shade: '#a989b2', side: DoubleSide }),
  lining: bruno({ map: ginghamTex ?? undefined, color: '#ffffff', shade: '#9b7fa8', side: DoubleSide }),
  leather: bruno({ color: '#7d4a2f', shade: '#5a3f5e' }),
  brass: bruno({ color: '#e0bf73', shade: '#9a8072', sheen: 0.4 }),
  plate: bruno({ color: '#fbf8f2', shade: '#aaa0c0' }),
  plateRim: bruno({ color: '#7fa6cf', shade: '#6a74a0' }),
  crumb: bruno({ color: '#f6e7c8', shade: '#b3a0b8' }),
  crust: bruno({ color: '#cf9152', shade: '#8f6e86' }),
  lettuce: bruno({ color: '#8cc96b', shade: '#5f8a76', side: DoubleSide }),
  tomato: bruno({ color: '#e5564a', shade: '#9c5274' }),
  cheese: bruno({ color: '#f6cf5c', shade: '#b1958c' }),
  ham: bruno({ color: '#f2a3a6', shade: '#a77c97' }),
  pages: bruno({ color: '#f7efdc', shade: '#ada2bc' }),
}
const TUBE = new CylinderGeometry(1, 1, 1, 12)

// ---- the blanket: a grid laid on the grass, swelling a little, one corner turned back over itself
export function blanketGeometry() {
  const { w, l, t } = BLANKET
  const nx = 64
  const nz = 84
  // the fold: a line across its far right corner; beyond it the cloth's turned back over
  const fa = new Vector3(w / 2 - 300, 0, l / 2)
  const fb = new Vector3(w / 2, 0, l / 2 - 360)
  const along = fb.clone().sub(fa).normalize()
  const n = new Vector3(along.z, 0, -along.x) // (toward the corner)
  if (n.dot(new Vector3(w / 2, 0, l / 2).sub(fa)) < 0) n.negate()
  const R = 7 // (how round the fold)
  const pos: number[] = []
  const uv: number[] = []
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = -w / 2 + (w * i) / nx
      const z = -l / 2 + (l * j) / nz
      uv.push((x + w / 2) / (BLANKET.check * 2), (z + l / 2) / (BLANKET.check * 2))
      // its swell: soft, low, as a blanket laid on a lawn
      let y = t / 2 + 3 + 3 * Math.sin(x * 0.0045 + 0.7) * Math.sin(z * 0.0032 + 1.9) + 1.6 * Math.sin(x * 0.011 + z * 0.007)
      // a little bunched along its near end
      y += 5 * Math.max(0, 1 - (z + l / 2) / 160) * (0.5 + 0.5 * Math.sin(x * 0.03))
      const p = new Vector3(x, 0, z)
      const d = p.clone().sub(fa).dot(n)
      if (d > 0) {
        // turned back: rolled over the fold, then lying back on itself, face down
        const q = p.clone().addScaledVector(n, -d)
        const phi = d / R
        let s: number
        let h: number
        if (phi < Math.PI) {
          s = R * Math.sin(phi)
          h = R * (1 - Math.cos(phi))
        } else {
          s = -(d - Math.PI * R)
          h = 2 * R
        }
        q.addScaledVector(n, s)
        pos.push(q.x, y + h, q.z)
      } else pos.push(x, y, z)
    }
  const idx: number[] = []
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
export function Blanket() {
  const geo = useMemo(blanketGeometry, [])
  return <mesh geometry={geo} material={M.gingham} receiveShadow />
}

// ---- the basket
/** a rounded rectangle's outline (half-sizes a × b, corner r), round from +x, with the length along it */
function roundRect(a: number, b: number, r: number, per = 6) {
  const pts: [number, number][] = []
  const corners: [number, number, number][] = [
    [a - r, b - r, 0],
    [-a + r, b - r, Math.PI / 2],
    [-a + r, -b + r, Math.PI],
    [a - r, -b + r, (3 * Math.PI) / 2],
  ]
  for (const [cx, cz, a0] of corners)
    for (let k = 0; k <= per; k++) {
      const t = a0 + (k / per) * (Math.PI / 2)
      pts.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r])
    }
  return pts
}
/** walls round a rounded rectangle from y0 to y1 (half-sizes at the bottom and top), uvs in mm / period */
function walls(bottom: [number, number], top: [number, number], r: number, y0: number, y1: number, outward: boolean) {
  const rings = [roundRect(bottom[0], bottom[1], r), roundRect(top[0], top[1], r)]
  const ys = [y0, y1]
  const N = rings[0].length
  const pos: number[] = []
  const uv: number[] = []
  for (let k = 0; k < 2; k++) {
    let run = 0
    for (let i = 0; i <= N; i++) {
      const [x, z] = rings[k][i % N]
      if (i > 0) {
        const [px, pz] = rings[k][i - 1]
        run += Math.hypot(x - px, z - pz)
      }
      pos.push(x, ys[k], z)
      uv.push(run / 52, ys[k] / 52)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < N; i++) {
    const a = i
    const b = i + N + 1
    if (outward) idx.push(a, a + 1, b, a + 1, b + 1, b)
    else idx.push(a, b, a + 1, a + 1, b, b + 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // (make sure it faces the way it should: out, or in)
  const nrm = g.attributes.normal
  const p0 = new Vector3(pos[0], 0, pos[2])
  const faces = nrm.getX(0) * p0.x + nrm.getZ(0) * p0.z
  if ((faces > 0) !== outward) {
    const ix = g.index!.array as unknown as number[]
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]
    g.index!.needsUpdate = true
    g.computeVertexNormals()
  }
  return g
}
const WEAVE_WALL = (() => {
  const t = weaveTex?.clone() as Texture | undefined
  if (t) t.needsUpdate = true
  return bruno({ map: t, color: '#ffffff', shade: '#7d6488' })
})()

/** a sandwich half, cut corner to corner, stood on its cut edge (its point up, its faces ±z) */
export function Sandwich() {
  const geo = useMemo(() => {
    const L = SANDWICH.side
    const tri = (grow = 0, wavy = 0) => {
      // stood on the cut: the cut runs along the bottom, the right angle at the top
      const half = (L / Math.SQRT2) + grow
      const top = L / Math.SQRT2 + grow
      const s = new Shape()
      s.moveTo(-half, 0)
      if (wavy) {
        for (let i = 0; i <= 12; i++) {
          const t = i / 12
          s.lineTo(-half + t * half + Math.sin(t * Math.PI * 6) * wavy * 0.5, t * top + Math.cos(t * Math.PI * 6) * wavy)
        }
        for (let i = 1; i <= 12; i++) {
          const t = i / 12
          s.lineTo(t * half + Math.sin(t * Math.PI * 6) * wavy * 0.5, top - t * top + Math.cos(t * Math.PI * 6) * wavy)
        }
      } else {
        s.lineTo(0, top)
        s.lineTo(half, 0)
      }
      s.closePath()
      return s
    }
    const bread = new ExtrudeGeometry(tri(-2), { depth: SANDWICH.bread - 4, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 3 })
    const lettuce = new ShapeGeometry(tri(4, 3))
    const layer = (grow: number, t: number) => new ExtrudeGeometry(tri(grow), { depth: t, bevelEnabled: false })
    return { bread, lettuce, tomato: layer(-6, 4), cheese: layer(2, 2), ham: layer(0, 4) }
  }, [])
  const B = SANDWICH.bread
  // the layers, back to front along z
  const z0 = -(B * 2 + SANDWICH.filling) / 2
  return (
    <group>
      <mesh geometry={geo.bread} material={[M.crumb, M.crust]} position={[0, 2, z0 + 2]} castShadow />
      <mesh geometry={geo.lettuce} material={M.lettuce} position={[0, 0, z0 + B + 1]} />
      <mesh geometry={geo.tomato} material={M.tomato} position={[0, 3, z0 + B + 2]} />
      <mesh geometry={geo.cheese} material={M.cheese} position={[0, 0, z0 + B + 6]} />
      <mesh geometry={geo.ham} material={M.ham} position={[0, 1, z0 + B + 8]} />
      <mesh geometry={geo.bread} material={[M.crumb, M.crust]} position={[0, 2, z0 + B + SANDWICH.filling + 2]} castShadow />
    </group>
  )
}
export const SANDWICH_H = SANDWICH.side / Math.SQRT2 // (how tall one stands)

/** where its sandwiches lie, packed flat: two each side, their cut edge along the wall, their point in
 *  toward the middle (x, z of the cut edge's middle, and which way they point) */
export const SANDWICH_AT: [number, number, number, number][] = [
  [-84, 0, -100, Math.PI + 0.04],
  [82, 0, -100, Math.PI - 0.03],
  [-82, 0, 100, 0.03],
  [84, 0, 100, -0.04],
]
const SANDWICH_T = SANDWICH.bread * 2 + SANDWICH.filling

export function Basket({ open, left = SANDWICH.n, onSandwich, onClick }: { open: { current: number }; left?: number; onSandwich?: (k: number, e: ThreeEvent<MouseEvent>) => void; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const { l, d, h, taper, rim, spine, lid, wall, handle } = BASKET
  const body = h - lid // (its rim's height: the lids sit on top)
  const geo = useMemo(() => {
    const top: [number, number] = [l / 2, d / 2]
    const foot: [number, number] = [l / 2 - taper, d / 2 - taper]
    const curve = new CatmullRomCurve3(roundRect(l / 2, d / 2, 34, 8).map(([x, z]) => new Vector3(x, body, z)), true)
    // the handle: a hoop end to end, over the middle strip
    const hoop = new CatmullRomCurve3(
      Array.from({ length: 13 }, (_, i) => {
        const t = i / 12
        const x = -l / 2 + 40 + t * (l - 80)
        const y = h + 6 + Math.sin(Math.PI * t) ** 0.7 * (handle - h - 18)
        return new Vector3(x, y, 0)
      }),
    )
    const floor = new ShapeGeometry(new Shape(roundRect(foot[0], foot[1], 30).map(([x, z]) => new Vector2(x, z))))
    floor.rotateX(Math.PI / 2)
    const lining = new ShapeGeometry(new Shape(roundRect(foot[0] - wall, foot[1] - wall, 24).map(([x, z]) => new Vector2(x, z))))
    lining.rotateX(-Math.PI / 2)
    return {
      outer: walls(foot, top, 34, 0, body, true),
      inner: walls([foot[0] - wall, foot[1] - wall], [top[0] - wall, top[1] - wall], 26, wall, body - 4, false),
      rim: new TubeGeometry(curve, 120, rim / 2, 8, true),
      hoop: new TubeGeometry(hoop, 48, 9, 8, false),
      floor,
      lining,
      lidBox: new RoundedBoxGeometry(l - 6, lid, (d - spine) / 2 - 4, 3, 5),
      spineBox: new RoundedBoxGeometry(l - 4, lid + 4, spine, 3, 6),
      plate: new CylinderGeometry(PLATE.r, PLATE.r * 0.82, PLATE.t, 40),
    }
  }, [l, d, h, taper, rim, spine, lid, wall, handle, body])
  const lidW = (d - spine) / 2 - 4
  const lids = useRef<(Group | null)[]>([])
  useFrame(() => {
    const a = open.current * 1.5 // (up to about upright: hinged on the middle strip, they stop at the handle)
    lids.current.forEach((g, i) => g && (g.rotation.x = (i ? -1 : 1) * a))
  })
  const rimMat = willow(1200, 70, 18)
  const hoopMat = willow(900, 60, 18)
  const lidMat = willow(l, lidW)
  const spineMat = willow(l, spine)
  return (
    <group onClick={onClick}>
      {/* its body: woven walls, its floor; the gingham lining in it */}
      <mesh geometry={geo.outer} material={WEAVE_WALL} castShadow receiveShadow />
      <mesh geometry={geo.floor} material={WEAVE_WALL} position={[0, 1, 0]} />
      <mesh geometry={geo.inner} material={M.lining} />
      <mesh geometry={geo.lining} material={M.lining} position={[0, wall, 0]} receiveShadow />
      <mesh geometry={geo.rim} material={rimMat} castShadow />
      {/* the strip down its middle, the handle's hoop over it */}
      <mesh geometry={geo.spineBox} material={spineMat} position={[0, body + lid / 2 + 2, 0]} castShadow />
      <mesh geometry={geo.hoop} material={hoopMat} castShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={TUBE} material={M.leather} position={[s * (l / 2 - 40), body + lid + 8, 0]} scale={[14, 16, 14]} />
      ))}
      {/* its lids, hinged on the strip: willow on top, gingham under, a plate strapped there */}
      {[-1, 1].map((s, i) => (
        <group key={s} ref={(g) => void (lids.current[i] = g)} position={[0, body + 1, (s * spine) / 2]}>
          <group position={[0, lid / 2, (s * (lidW + 4)) / 2]}>
            <mesh geometry={geo.lidBox} material={lidMat} castShadow receiveShadow />
            <mesh material={M.lining} position={[0, -lid / 2 - 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[l - 20, lidW - 10]} />
            </mesh>
            <mesh geometry={geo.plate} material={M.plate} position={[0, -lid / 2 - PLATE.t / 2 - 1, 0]} rotation={[Math.PI, 0, 0]} />
            <mesh material={M.plateRim} position={[0, -lid / 2 - PLATE.t - 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[PLATE.r * 0.7, PLATE.r * 0.76, 40]} />
            </mesh>
            <mesh material={M.leather} position={[0, -lid / 2 - PLATE.t - 3, 0]} scale={[24, 3, lidW - 16]}>
              <boxGeometry />
            </mesh>
            {/* its closure: a leather tab over the rim, a brass peg */}
            <mesh material={M.leather} position={[l * 0.28, -lid / 2 - 14, (s * lidW) / 2 + s * 3]} scale={[26, 40, 4]}>
              <boxGeometry />
            </mesh>
            <mesh geometry={TUBE} material={M.brass} position={[l * 0.28, -lid / 2 - 26, (s * lidW) / 2 + s * 6]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 4, 5]} />
          </group>
        </group>
      ))}
      {/* the sandwiches inside */}
      {SANDWICH_AT.slice(0, left).map(([x, , z, r], k) => (
        <group
          key={k}
          position={[x, wall + 1, z]}
          rotation={[0, r, 0]}
          onClick={(e) => {
            if (!onSandwich || open.current < 0.5) return
            e.stopPropagation()
            onSandwich(k, e)
          }}
        >
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, SANDWICH_T / 2, 0]}>
            <Sandwich />
          </group>
        </group>
      ))}
    </group>
  )
}

// ---- the books
const covers = new Map<string, { front: Texture | null; back: Texture | null; spine: Texture | null; edge: Texture | null }>()
function bookTex(k: number) {
  const b = BOOKS[k]
  if (covers.has(b.title)) return covers.get(b.title)!
  const W = 258
  const H = Math.round((W * b.h) / b.w)
  const serif = "Georgia, 'Times New Roman', serif"
  const front = tex(W, H, (g) => {
    g.fillStyle = b.cover
    g.fillRect(0, 0, W, H)
    // a cloth's fine grain
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(255,255,255,${rand() * 0.05})`
      g.fillRect(rand() * W, rand() * H, 2, 1)
    }
    g.fillStyle = b.ink
    g.strokeStyle = b.ink
    g.textAlign = 'center'
    if (k === 0) {
      // a stamped binding: a double rule round it, the title, a sprig
      g.lineWidth = 3
      g.strokeRect(14, 14, W - 28, H - 28)
      g.lineWidth = 1.2
      g.strokeRect(22, 22, W - 44, H - 44)
      g.font = `700 30px ${serif}`
      g.fillText('PRIDE', W / 2, H * 0.3)
      g.font = `italic 22px ${serif}`
      g.fillText('and', W / 2, H * 0.36)
      g.font = `700 30px ${serif}`
      g.fillText('PREJUDICE', W / 2, H * 0.43)
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(W / 2, H * 0.52)
      g.quadraticCurveTo(W / 2 + 12, H * 0.6, W / 2, H * 0.68)
      g.stroke()
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.ellipse(W / 2 + (i % 2 ? 10 : -10), H * (0.55 + i * 0.03), 8, 4, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2)
        g.fill()
      }
      g.font = `18px ${serif}`
      g.fillText('JANE AUSTEN', W / 2, H * 0.84)
    } else if (k === 1) {
      // a plain red jacket, the title large
      g.font = `700 34px ${serif}`
      g.fillText('Norwegian', W / 2, H * 0.34)
      g.fillText('Wood', W / 2, H * 0.42)
      g.fillStyle = '#7fae84'
      g.fillRect(W / 2 - 40, H * 0.47, 80, 4)
      g.fillStyle = b.ink
      g.font = `19px ${serif}`
      g.fillText('HARUKI MURAKAMI', W / 2, H * 0.86)
    } else {
      // a sky, a little planet with its flower, a star or two
      for (let i = 0; i < 14; i++) {
        g.fillStyle = 'rgba(255,248,214,0.85)'
        g.beginPath()
        g.arc(rand() * W, rand() * H * 0.55, 1.5 + rand() * 2, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#f2c27b'
      g.beginPath()
      g.arc(W / 2, H * 0.62, 38, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#e07a7a'
      g.beginPath()
      g.arc(W / 2 + 6, H * 0.62 - 50, 7, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#6aa36f'
      g.lineWidth = 2.5
      g.beginPath()
      g.moveTo(W / 2 + 6, H * 0.62 - 44)
      g.lineTo(W / 2 + 4, H * 0.62 - 36)
      g.stroke()
      g.fillStyle = b.ink
      g.font = `italic 700 28px ${serif}`
      g.fillText('The Little', W / 2, H * 0.2)
      g.fillText('Prince', W / 2, H * 0.27)
      g.font = `15px ${serif}`
      g.fillText('ANTOINE DE SAINT-EXUPÉRY', W / 2, H * 0.9)
    }
  })
  const back = tex(W, H, (g) => {
    g.fillStyle = b.cover
    g.fillRect(0, 0, W, H)
    g.fillStyle = b.ink
    g.globalAlpha = 0.5
    for (let i = 0; i < 9; i++) g.fillRect(40, H * 0.2 + i * 18, W - 80 - (i === 8 ? 60 : 0), 6)
    g.globalAlpha = 1
  })
  const S = Math.max(24, Math.round((W * b.t) / b.w))
  const spine = tex(S, H, (g) => {
    g.fillStyle = b.cover
    g.fillRect(0, 0, S, H)
    g.save()
    g.translate(S / 2, H / 2)
    g.rotate(Math.PI / 2)
    g.fillStyle = b.ink
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `700 ${Math.min(16, S * 0.55)}px ${serif}`
    g.fillText(b.title.toUpperCase(), 0, 0)
    g.restore()
  })
  const edge = tex(64, 64, (g) => {
    g.fillStyle = '#f6eedb'
    g.fillRect(0, 0, 64, 64)
    for (let i = 0; i < 64; i += 2) {
      g.fillStyle = `rgba(150,130,100,${0.08 + rand() * 0.1})`
      g.fillRect(0, i, 64, 1)
    }
  })
  const made = { front, back, spine, edge }
  covers.set(b.title, made)
  return made
}
const bookMats = new Map<number, Material[]>()
function bookMaterials(k: number) {
  if (bookMats.has(k)) return bookMats.get(k)!
  const t = bookTex(k)
  const edge = bruno({ map: t.edge ?? undefined, color: '#ffffff', shade: '#a99fb9' })
  // a box's faces: +x (the fore-edge), -x (the spine), +y (the front), -y (the back), +z (the top), -z (the foot)
  const mats = [edge, bruno({ map: t.spine ?? undefined, color: '#ffffff', shade: '#7e6d92' }), bruno({ map: t.front ?? undefined, color: '#ffffff', shade: '#7e6d92' }), bruno({ map: t.back ?? undefined, color: '#ffffff', shade: '#7e6d92' }), edge, edge]
  bookMats.set(k, mats)
  return mats
}
/** a book lying flat (its front up, its spine to -x, its head to +z), resting on y = 0 */
export function Book({ k }: { k: number }) {
  const b = BOOKS[k]
  const geo = useMemo(() => {
    const g = new BoxGeometry(b.w, b.t, b.h)
    // (its spine and its cover's pictures upright: turn the top and bottom faces' uvs to read along z)
    const uv = g.attributes.uv
    for (const f of [2, 3])
      for (let i = 0; i < 4; i++) {
        const vi = f * 4 + i
        const u = uv.getX(vi)
        const v = uv.getY(vi)
        uv.setXY(vi, f === 2 ? u : 1 - u, f === 2 ? 1 - v : v)
      }
    return g
  }, [b])
  return <mesh geometry={geo} material={bookMaterials(k)} position={[0, b.t / 2, 0]} castShadow receiveShadow />
}
/** a book left open face down on the grass, tented over its spine */
export function TentedBook({ k, spread = 0.32 }: { k: number; spread?: number }) {
  const b = BOOKS[k]
  const half = b.t / 2
  const mats = bookMaterials(k)
  // each half: its outside the cover (front or back), its inside pages
  const front = useMemo(() => [mats[0], mats[0], mats[2], M.pages, mats[0], mats[0]], [mats])
  const back = useMemo(() => [mats[0], mats[0], mats[3], M.pages, mats[0], mats[0]], [mats])
  const rise = Math.sin(spread) * b.w
  return (
    <group position={[0, 0, 0]}>
      {[1, -1].map((s) => (
        <group key={s} position={[0, rise + 2, 0]} rotation={[0, 0, -s * spread]}>
          <mesh material={s > 0 ? front : back} position={[(s * b.w) / 2, -half / 2 - 1, 0]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, half, b.h]} />
          </mesh>
        </group>
      ))}
      {/* its spine over the top */}
      <mesh geometry={TUBE} material={mats[1]} position={[0, rise + 2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[half * 0.7, b.h, half * 0.7]} />
    </group>
  )
}
