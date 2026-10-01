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
  Matrix4,
  Quaternion,
  Vector2,
  Vector3,
  type Group,
  type Material,
  type Texture,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { BASKET, PLATE } from './spec'
import { Sandwich } from './Sandwich'

/**
 * The picnic basket (./spec [P]), in real millimetres, the toy look (matte, warm, chunky): willow, woven; a
 * wrapped rim, a fixed strip down its middle with a lid hinged each side of it (gingham under them, a plate
 * strapped to each), a hooped handle end to end, leather tabs and brass pegs; red gingham lining; four
 * sandwich halves (./Sandwich) packed flat inside. `open` 0..1 lifts its lids. (The blanket: ./Blanket;
 * the books: ./Books)
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

/** where its sandwiches lie, packed flat: two each side, their cut edge along the wall, their point in
 *  toward the middle (x, z of the cut edge's middle, which way they reach, which half) */
export const SANDWICH_AT: [number, number, number, number, 0 | 1][] = [
  [-80, 0, -102, Math.PI + 0.04, 0],
  [80, 0, -102, Math.PI - 0.03, 1],
  [-80, 0, 102, 0.03, 1],
  [80, 0, 102, -0.04, 0],
]
/** sandwich k's place in the basket's frame (real mm): for lifting it out */
export function sandwichInBasket(k: number) {
  const [x, , z, r] = SANDWICH_AT[k]
  return new Matrix4().compose(new Vector3(x, BASKET.wall + 1, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r), new Vector3(1, 1, 1))
}

export function Basket({ open, present = [true, true, true, true], onSandwich, onClick }: { open: { current: number }; present?: boolean[]; onSandwich?: (k: number, e: ThreeEvent<MouseEvent>) => void; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
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
      {SANDWICH_AT.map(([x, , z, r, h], k) =>
        present[k] ? (
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
            <Sandwich half={h} />
          </group>
        ) : null,
      )}
    </group>
  )
}

