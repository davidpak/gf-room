import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, InstancedMesh, Object3D, Shape } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from './bruno'
import { SET, halfWidthAt, inIsland, onWalk } from './set'

/**
 * The ground of the set piece (./set): an island of earth with a grass lip, the grass on it (Bruno's
 * way: thousands of blades, dark at the root, sunlit yellow-green at the tip, their normals straight
 * up so the lawn shades as one, swaying), a stretch of brick walk across it (UW's red brick, laid in
 * basketweave between a border course, each brick its own shade and a hair proud or sunk), and the
 * cherry petals: lying on the grass and the bricks, and a few still falling.
 */
const _o = new Object3D()
const _c = new Color()
function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** the island's outline between depths z0 and z1 (all of it by default), `inset` in from its edge,
 *  as the same rounded rectangle the grass and the bricks keep inside (./set halfWidthAt) */
function islandShape(inset = 0, z0 = -Infinity, z1 = Infinity) {
  const D = SET.island.d / 2 - inset
  const a = Math.max(-D, z0)
  const b = Math.min(D, z1)
  const zs: number[] = []
  for (let i = 0; i <= 48; i++) zs.push(a + ((b - a) * i) / 48)
  const s = new Shape()
  zs.forEach((z, i) => (i ? s.lineTo(halfWidthAt(z, inset), z) : s.moveTo(halfWidthAt(z, inset), z)))
  for (let i = zs.length - 1; i >= 0; i--) s.lineTo(-halfWidthAt(zs[i], inset), zs[i])
  s.closePath()
  return s
}

const EARTH = bruno({ vertexColors: true })
const SOIL = bruno({ color: '#4d7a3f' })
export function Island() {
  const geo = useMemo(() => {
    const T = SET.island.t
    const g = new ExtrudeGeometry(islandShape(18), { depth: T - 36, bevelEnabled: true, bevelThickness: 18, bevelSize: 18, bevelSegments: 3 })
    g.translate(0, 0, 18)
    g.rotateX(Math.PI / 2) // (the outline's y → +z, extruded down)
    // coloured in bands down its side: the grass lip, then earth, darker further down
    const pos = g.attributes.position
    const col: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y > -14) _c.set('#5f9446')
      else if (y > -40) _c.set('#8a5e44')
      else _c.set('#6d4638').lerp(_c.clone().set('#4a2f33'), Math.min(1, (-y - 40) / T))
      col.push(_c.r, _c.g, _c.b)
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    return g
  }, [])
  const top = useMemo(() => {
    const g = new ExtrudeGeometry(islandShape(10), { depth: 2, bevelEnabled: false })
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  return (
    <group>
      <mesh geometry={geo} material={EARTH} position={[0, 0, 0]} castShadow receiveShadow />
      <mesh geometry={top} material={SOIL} position={[0, 4, 0]} receiveShadow />
    </group>
  )
}

// ---- the grass
/** a blade: a tapering strip, bent forward, dark at the root and sunlit at the tip; normals up */
function bladeGeometry() {
  const SEG = 4
  const pos: number[] = []
  const nor: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const root = new Color('#2f5a33')
  const mid = new Color('#6fa047')
  const tip = new Color('#e3e37e')
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const w = 0.5 * (1 - t) ** 0.9
    const z = 0.35 * t * t
    const c = t < 0.5 ? root.clone().lerp(mid, t * 2) : mid.clone().lerp(tip, (t - 0.5) * 2)
    for (const s of [-1, 1]) {
      pos.push(s * w, t, z)
      nor.push(0, 1, 0)
      col.push(c.r, c.g, c.b)
    }
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  return g
}
const GRASS = bruno({ vertexColors: true, side: DoubleSide, sway: 110, swayFrom: 0 })
GRASS.defines = { ...GRASS.defines, NO_FLIP: '' }
const TINTS = ['#ffffff', '#f4ffe0', '#e6f7ff', '#fff3d9', '#eaffea']

export function Grass() {
  const blade = useMemo(bladeGeometry, [])
  const spots = useMemo(() => {
    const rand = rng(11)
    const out: [number, number, number, number, number][] = []
    const { w, d } = SET.island
    for (let i = 0; i < SET.grass.count * 1.6 && out.length < SET.grass.count; i++) {
      const x = (rand() - 0.5) * w
      const z = (rand() - 0.5) * d
      if (!inIsland(x, z, 26) || onWalk(x, z, 14) || SET.keepClear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue
      out.push([x, z, rand() * Math.PI * 2, 32 + rand() * 32, 8 + rand() * 4])
    }
    return out
  }, [])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current!
    const rand = rng(5)
    spots.forEach(([x, z, a, h, w], i) => {
      _o.position.set(x, 4, z)
      _o.rotation.set(0, a, (rand() - 0.5) * 0.25)
      _o.scale.set(w, h, h)
      _o.updateMatrix()
      m.setMatrixAt(i, _o.matrix)
      m.setColorAt(i, _c.set(TINTS[Math.floor(rand() * TINTS.length)]))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [spots])
  return <instancedMesh ref={mesh} args={[blade, GRASS, spots.length]} receiveShadow />
}

// ---- the brick walk
const BRICKS = ['#c8664f', '#b95a47', '#d27a5c', '#a9503f', '#cf8466', '#bd6450', '#d98b6c']
const BRICK = bruno({})
const MORTAR = bruno({ color: '#7d5a55' })
export function Walk() {
  const W = SET.walk
  const brick = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.12), [])
  const bricks = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; a: number }[] = []
    const B = 64 // (a brick 64 × 32: a basketweave square is two)
    const half = W.w / 2
    const inner = half - 34
    // the border course, each side: bricks along the edge
    for (const side of [-1, 1]) for (let x = -SET.island.w / 2; x < SET.island.w / 2; x += B) out.push({ x: x + B / 2, z: W.z + side * (half - 17), w: B - 3, d: 29, a: 0 })
    // the basketweave between: squares of two bricks, turned alternately
    for (let i = Math.floor(-SET.island.w / 2 / B); i * B < SET.island.w / 2; i++) {
      for (let j = 0; j * B < inner * 2 - 4; j++) {
        const x0 = i * B
        const z0 = W.z - inner + j * B
        if (z0 + B > W.z + inner + 2) continue
        const along = (i + j) % 2 === 0
        for (const k of [0, 1]) {
          if (along) out.push({ x: x0 + B / 2, z: z0 + 16 + k * 32, w: B - 3, d: 29, a: 0 })
          else out.push({ x: x0 + 16 + k * 32, z: z0 + B / 2, w: 29, d: B - 3, a: 0 })
        }
      }
    }
    return out.filter((b) => inIsland(b.x, b.z, 30))
  }, [W.w, W.z])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current!
    const rand = rng(21)
    bricks.forEach((b, i) => {
      const h = 20 + rand() * 3
      _o.position.set(b.x, 14 + h / 2 + (rand() - 0.5) * 1.5, b.z)
      _o.rotation.set((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.03)
      _o.scale.set(b.w, h, b.d)
      _o.updateMatrix()
      m.setMatrixAt(i, _o.matrix)
      m.setColorAt(i, _c.set(BRICKS[Math.floor(rand() * BRICKS.length)]))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [bricks])
  const bed = useMemo(() => {
    // the mortar bed under the bricks: the walk's band, cut to the island
    const g = new ExtrudeGeometry(islandShape(24, W.z - W.w / 2 - 4, W.z + W.w / 2 + 4), { depth: 16, bevelEnabled: false })
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  return (
    <group>
      <mesh geometry={bed} material={MORTAR} position={[0, 20, 0]} receiveShadow />
      <instancedMesh ref={mesh} args={[brick, BRICK, bricks.length]} castShadow receiveShadow />
    </group>
  )
}

// ---- the petals
const PETAL = bruno({ color: '#ffffff', vertexColors: false, side: DoubleSide })
PETAL.defines = { ...PETAL.defines, NO_FLIP: '' }
function petalGeometry() {
  const s = new Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(-5, 3, -6, 9, -1.4, 11)
  s.lineTo(0, 9.6)
  s.lineTo(1.4, 11)
  s.bezierCurveTo(6, 9, 5, 3, 0, 0)
  const g = new ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.computeVertexNormals()
  const n = g.attributes.normal
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0)
  return g
}
const PETAL_PINKS = ['#fde3ea', '#f9c6d4', '#fff1f4', '#f4b0c4']
export function Petals() {
  const geo = useMemo(petalGeometry, [])
  const fallen = useRef<InstancedMesh>(null)
  const falling = useRef<InstancedMesh>(null)
  const N = SET.petals.fallen
  useLayoutEffect(() => {
    const m = fallen.current!
    const rand = rng(33)
    const [tx, tz] = SET.tree
    let i = 0
    while (i < N) {
      // mostly under the canopy, thinning out past it; some blown along the walk
      const r = Math.pow(rand(), 0.6) * 1050
      const a = rand() * Math.PI * 2
      const x = tx + Math.cos(a) * r + (rand() < 0.2 ? (rand() - 0.3) * 900 : 0)
      const z = tz + Math.sin(a) * r * 0.85
      if (!inIsland(x, z, 30)) continue
      const y = onWalk(x, z, 0) ? 37.5 : 20 + rand() * 60
      _o.position.set(x, y, z)
      _o.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5)
      _o.scale.setScalar(0.9 + rand() * 0.6)
      _o.updateMatrix()
      m.setMatrixAt(i, _o.matrix)
      m.setColorAt(i, _c.set(PETAL_PINKS[Math.floor(rand() * PETAL_PINKS.length)]))
      i++
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    const f = falling.current!
    for (let k = 0; k < SET.petals.falling; k++) f.setColorAt(k, _c.set(PETAL_PINKS[k % PETAL_PINKS.length]))
    if (f.instanceColor) f.instanceColor.needsUpdate = true
  }, [N])
  const drift = useMemo(() => {
    const rand = rng(44)
    return Array.from({ length: SET.petals.falling }, () => ({ a: rand() * 6.28, r: rand() * 700, speed: 70 + rand() * 60, phase: rand() * 30, spin: 1 + rand() * 2 }))
  }, [])
  useFrame(({ clock }) => {
    const f = falling.current
    if (!f) return
    const t = clock.elapsedTime
    const [tx, tz] = SET.tree
    drift.forEach((p, k) => {
      const H = 900
      const y = H - ((t * p.speed + p.phase * 60) % (H - 30))
      const fall = 1 - y / H
      _o.position.set(tx + Math.cos(p.a) * p.r + Math.sin(t * 0.8 + p.phase) * 50 + fall * 260, y, tz + Math.sin(p.a) * p.r + Math.cos(t * 0.6 + p.phase) * 40 + fall * 120)
      _o.rotation.set(t * p.spin + p.phase, t * p.spin * 0.6, p.phase)
      _o.scale.setScalar(1.2)
      _o.updateMatrix()
      f.setMatrixAt(k, _o.matrix)
    })
    f.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={fallen} args={[geo, PETAL, N]} receiveShadow />
      <instancedMesh ref={falling} args={[geo, PETAL, SET.petals.falling]} castShadow />
    </group>
  )
}
