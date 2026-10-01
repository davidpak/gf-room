import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, Matrix4, Quaternion, Shape, ShapeGeometry, SphereGeometry, Vector2, Vector3, type Group, type Texture } from 'three'
import { bruno } from '../quad/bruno'
import { BASKET } from './spec'
import { Sandwich } from './Sandwich'
import { paint, rng } from './paint'

/**
 * The picnic basket (./spec [W]), in real millimetres, the toy look: woven woodchip (wide flat weavers over
 * and under narrow stakes, a doubled band round its rim), open-topped, two flat wooden handles riveted on in
 * brass each side that swing up and lean in to meet over its middle; a tan gingham liner inside, folded down
 * over its rim and tied with ribbon bows each side; four sandwich halves (./Sandwich) packed flat in it.
 * `open` 0..1 swings its handles down and out against its rim, out of the way of whatever's lifted out.
 * (The blanket: ./Blanket; the books: ./Books)
 *
 * Its frame: its foot on y = 0, across x, deep z, its middle at the origin.
 */
const { l: BL, d: BD, h: BH, taper, wall, rim, handle: HD, overhang, bow } = BASKET
const OPEN_TILT = 1.15 // (how far out a handle swings before it rests on the rim)

// ---- its looks
/** woodchip: honey weavers, a little grain in them, passing over and under the darker stakes (120 mm a repeat) */
const chipTex = paint(256, 256, (g) => {
  const r = rng(61)
  g.fillStyle = '#7a5130'
  g.fillRect(0, 0, 256, 256)
  const row = 32
  const stake = 64
  for (let y = 0; y < 256; y += row) {
    const tone = 0.92 + r() * 0.14
    const gr = g.createLinearGradient(0, y, 0, y + row - 4)
    gr.addColorStop(0, `rgb(${240 * tone},${196 * tone},${138 * tone})`)
    gr.addColorStop(0.5, `rgb(${226 * tone},${176 * tone},${114 * tone})`)
    gr.addColorStop(1, `rgb(${184 * tone},${134 * tone},${80 * tone})`)
    g.fillStyle = gr
    g.fillRect(0, y + 2, 256, row - 4)
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(110,64,30,${0.08 + r() * 0.1})`
      g.fillRect(0, y + 4 + r() * (row - 8), 256, 1)
    }
    // the stakes, showing between the weavers on alternate rows
    for (let x = (y / row) % 2 ? stake / 2 : 0; x < 256; x += stake) {
      const sg = g.createLinearGradient(x, 0, x + 22, 0)
      sg.addColorStop(0, '#b07a45')
      sg.addColorStop(0.5, '#cf9a5e')
      sg.addColorStop(1, '#9c6a3a')
      g.fillStyle = sg
      g.fillRect(x, y, 22, row)
      g.fillStyle = 'rgba(40,20,8,0.25)'
      g.fillRect(x - 2, y + 2, 2, row - 4)
      g.fillRect(x + 22, y + 2, 2, row - 4)
    }
  }
})
const chips = new Map<string, ReturnType<typeof bruno>>()
/** woodchip on a surface whose uvs run 0..1 over u × v mm */
function chip(u: number, v: number) {
  const key = `${Math.round(u)}x${Math.round(v)}`
  if (!chips.has(key)) {
    const t = chipTex?.clone() as Texture | undefined
    if (t) {
      t.needsUpdate = true
      t.repeat.set(u / 120, v / 120)
    }
    chips.set(key, bruno({ map: t, color: '#ffffff', shade: '#92778f' }))
  }
  return chips.get(key)!
}
/** tan gingham (64 mm a repeat), for the liner and its ties */
const tanTex = paint(128, 128, (g) => {
  g.fillStyle = '#fbf5ec'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(196,160,118,0.55)'
  g.fillRect(0, 0, 32, 128)
  g.fillRect(64, 0, 32, 128)
  g.fillRect(0, 0, 128, 32)
  g.fillRect(0, 64, 128, 32)
  for (let i = 0; i < 128; i += 3) {
    g.fillStyle = 'rgba(120,90,60,0.05)'
    g.fillRect(i, 0, 1, 128)
  }
})
const LINER = bruno({ map: tanTex ?? undefined, color: '#ffffff', shade: '#a99ab4', side: DoubleSide })
const WOOD = bruno({ color: '#b97a45', shade: '#7c5c74', side: DoubleSide })
const BRASS = bruno({ color: '#e2c071', shade: '#9a8072', sheen: 0.45 })
const TUBE = new CylinderGeometry(1, 1, 1, 14)
const BALL = new SphereGeometry(1, 12, 8)

// ---- its shapes
/** a rounded rectangle's outline (half-sizes a × b, corner r), anticlockwise from +x */
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
/** a profile swept round an outline: at each point (s along it) the profile's k-th point [out, y]; uvs in
 *  mm / period (along it, and up it) */
function sweep(outline: [number, number][], profile: (s: number, k: number, x: number, z: number) => [number, number], n: number, period: number) {
  const N = outline.length
  const normals = outline.map((_, i) => {
    const a = outline[(i - 1 + N) % N]
    const b = outline[(i + 1) % N]
    const t = new Vector2(b[0] - a[0], b[1] - a[1]).normalize()
    return new Vector2(t.y, -t.x)
  })
  const pos: number[] = []
  const uv: number[] = []
  let run = 0
  for (let i = 0; i <= N; i++) {
    const [x, z] = outline[i % N]
    if (i > 0) run += Math.hypot(x - outline[i - 1][0], z - outline[i - 1][1])
    const nrm = normals[i % N]
    for (let k = 0; k < n; k++) {
      const [out, y] = profile(run, k, x, z)
      pos.push(x + nrm.x * out, y, z + nrm.y * out)
      uv.push(run / period, y / period)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < N; i++)
    for (let k = 0; k < n - 1; k++) {
      const a = i * n + k
      const b = (i + 1) * n + k
      idx.push(a, a + 1, b, a + 1, b + 1, b) // (facing out)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
/** a flat ribbon along a path of points, `w` wide, lying across `side` */
function ribbon(pts: Vector3[], w: number, side: Vector3) {
  const pos: number[] = []
  const uv: number[] = []
  let run = 0
  pts.forEach((p, i) => {
    if (i) run += p.distanceTo(pts[i - 1])
    pos.push(p.x - (side.x * w) / 2, p.y - (side.y * w) / 2, p.z - (side.z * w) / 2, p.x + (side.x * w) / 2, p.y + (side.y * w) / 2, p.z + (side.z * w) / 2)
    uv.push(run / 64, 0, run / 64, w / 64)
  })
  const idx: number[] = []
  for (let i = 0; i < pts.length - 1; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** where its sandwiches lie, packed flat: two each side, their cut along the wall, their point in toward
 *  the middle (x, z of the cut's middle, which way they reach, which half) */
export const SANDWICH_AT: [number, number, number, number, 0 | 1][] = [
  [-76, 0, -96, Math.PI + 0.04, 0],
  [76, 0, -96, Math.PI - 0.03, 1],
  [-76, 0, 96, 0.03, 1],
  [76, 0, 96, -0.04, 0],
]
const FLOOR = wall + 3 // (the liner's floor)
/** sandwich k's place in the basket's frame (real mm): for lifting it out */
export function sandwichInBasket(k: number) {
  const [x, , z, r] = SANDWICH_AT[k]
  return new Matrix4().compose(new Vector3(x, FLOOR, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r), new Vector3(1, 1, 1))
}
/** how high a thing lifted out of it has to go to clear its rim (real mm, its frame) */
export const CLEAR = BH + 70

export function Basket({ open, present = [true, true, true, true], onSandwich, onClick }: { open: { current: number }; present?: boolean[]; onSandwich?: (k: number, e: ThreeEvent<MouseEvent>) => void; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const geo = useMemo(() => {
    const top = roundRect(BL / 2, BD / 2, 26)
    const perim = 2 * (BL + BD)
    // its walls, from its foot (drawn in by the taper) up to its rim
    const walls = sweep(top, (_, k) => (k === 0 ? [-taper * 0.9, 0] : [0, BH - rim]), 2, 120)
    // the rim's doubled band, round and over
    const band = sweep(top, (_, k) => {
      const a = (k / 6) * Math.PI
      return [Math.sin(a) * 5 - 2, BH - rim / 2 - Math.cos(a) * (rim / 2)]
    }, 7, 120)
    // inside it, the liner down its walls to the floor (and its floor)
    const linerIn = sweep(roundRect(BL / 2 - wall, BD / 2 - wall, 22), (_, k) => (k === 0 ? [-taper * 0.9, FLOOR] : [0, BH - 2]), 2, 64)
    const floor = new ShapeGeometry(new Shape(roundRect(BL / 2 - wall - taper, BD / 2 - wall - taper, 20).map(([x, z]) => new Vector2(x, z))))
    floor.rotateX(-Math.PI / 2)
    const fu = floor.attributes.uv
    const fp = floor.attributes.position
    for (let i = 0; i < fu.count; i++) fu.setXY(i, fp.getX(i) / 64, fp.getZ(i) / 64)
    // and folded over the rim, falling outside (shorter where the handles come through), its hem waved
    const notch = (x: number, z: number) => {
      if (Math.abs(z) < BD / 2 - 30) return 1
      const d = Math.abs(Math.abs(x) - HD.x)
      return Math.min(1, Math.max(0, (d - 14) / 26))
    }
    const fold = sweep(top, (s, k, x, z) => {
      const drop = overhang * (0.88 + 0.12 * Math.sin((s / perim) * Math.PI * 14)) * (0.25 + 0.75 * notch(x, z))
      const prof: [number, number][] = [
        [-wall - 2, BH - 8],
        [-wall / 2, BH + 3],
        [1, BH + 6],
        [6, BH - 2],
        [8 + drop * 0.08, BH - drop * 0.6],
        [10 + drop * 0.15, BH - drop],
      ]
      return prof[k]
    }, 6, 64)
    // the ties: each long side, a bow just in from each handle: its two loops, its two tails hanging
    const ties: BufferGeometry[] = []
    const knots: Vector3[] = []
    for (const sz of [-1, 1])
      for (const sx of [-1, 1]) {
        const at = new Vector3(sx * bow, BH - overhang * 0.5, sz * (BD / 2 + 12))
        knots.push(at)
        for (const lr of [-1, 1]) {
          const loop = Array.from({ length: 13 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2
            return at.clone().add(new Vector3(lr * (14 - 13 * Math.cos(a)), 9 * Math.sin(a) + 3, sz * 2 * Math.sin(a)))
          })
          ties.push(ribbon(new CatmullRomCurve3(loop).getPoints(24), 9, new Vector3(0, 0, 1)))
          const tail = Array.from({ length: 9 }, (_, i) => {
            const t = i / 8
            return at.clone().add(new Vector3(lr * (4 + t * 16 + Math.sin(t * 5) * 3), -t * (70 + lr * 10), sz * (2 + t * 4)))
          })
          ties.push(ribbon(new CatmullRomCurve3(tail).getPoints(20), 9, new Vector3(1, 0, 0)))
        }
      }
    // a handle: a flat strap, its ends riveted on each long side, up its legs and over in a round top
    const r = BD / 2 + 6
    const legs = HD.rise - r * 0.6
    const pts: Vector3[] = []
    for (let i = 0; i <= 10; i++) pts.push(new Vector3(0, (legs * i) / 10, -r))
    for (let i = 1; i < 16; i++) {
      const a = (i / 16) * Math.PI
      pts.push(new Vector3(0, legs + Math.sin(a) * r * 0.6, -Math.cos(a) * r))
    }
    for (let i = 10; i >= 0; i--) pts.push(new Vector3(0, (legs * i) / 10, r))
    const strap = ribbon(pts, HD.w, new Vector3(1, 0, 0))
    return { walls, band, linerIn, floor, fold, ties, knots, strap }
  }, [])
  // the handles: swung up, leaning in to meet over the middle; or swung down and out onto the rim
  const handles = useRef<(Group | null)[]>([])
  useFrame(() => {
    const o = open.current
    handles.current.forEach((g, i) => {
      if (!g) return
      const sx = i ? 1 : -1
      g.rotation.z = sx * HD.lean + (-sx * OPEN_TILT - sx * HD.lean) * o
    })
  })
  return (
    <group onClick={onClick}>
      {/* its body, woven; its rim's band; its foot */}
      <mesh geometry={geo.walls} material={chip(120, 120)} castShadow receiveShadow />
      <mesh geometry={geo.band} material={chip(120, 120)} castShadow />
      <mesh material={chip(BL, BD)} position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BL - taper * 2, BD - taper * 2]} />
      </mesh>
      {/* the liner: inside it, its floor, folded over the rim; its ties */}
      <mesh geometry={geo.linerIn} material={LINER} receiveShadow />
      <mesh geometry={geo.floor} material={LINER} position={[0, FLOOR, 0]} receiveShadow />
      <mesh geometry={geo.fold} material={LINER} castShadow receiveShadow />
      {geo.ties.map((g, i) => (
        <mesh key={i} geometry={g} material={LINER} castShadow />
      ))}
      {geo.knots.map((p, i) => (
        <mesh key={i} geometry={BALL} material={LINER} position={[p.x, p.y + 3, p.z + Math.sign(p.z)]} scale={[6, 6, 4]} />
      ))}
      {/* its handles, riveted on both long sides at ±x */}
      {[-1, 1].map((sx, i) => (
        <group key={sx} position={[sx * HD.x, BH - 40, 0]}>
          <group ref={(g) => void (handles.current[i] = g)}>
            <mesh geometry={geo.strap} material={WOOD} castShadow />
          </group>
          {[-1, 1].map((sz) => (
            <mesh key={sz} geometry={TUBE} material={BRASS} position={[0, 0, sz * (BD / 2 + 9)]} rotation={[Math.PI / 2, 0, 0]} scale={[7, 4, 7]} />
          ))}
        </group>
      ))}
      {/* the sandwiches in it */}
      {SANDWICH_AT.map(([x, , z, rot, h], k) =>
        present[k] ? (
          <group
            key={k}
            position={[x, FLOOR, z]}
            rotation={[0, rot, 0]}
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
