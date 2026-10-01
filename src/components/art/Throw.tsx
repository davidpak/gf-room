import { useLayoutEffect, useMemo, useRef } from 'react'
import { BackSide, BufferAttribute, BufferGeometry, CylinderGeometry, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from '../picnic/paint'
import { THROW } from './spec'

/**
 * The art blanket (./spec [B], a 50 × 60" cotton throw), laid on the grass: a formula fitted to it, no cloth
 * simulation. Woven in stripes along its length (cream, sage, thin terracotta pinstripes), a knotted fringe at
 * each end lying out on the grass; it swells a little over the lawn, its edges not quite straight. Its frame:
 * x across, z along, y up, its middle at the origin.
 */
const { w: W, l: L, t: T, fringe: FRINGE } = THROW
const clothTex = (() => {
  const S = 0.6
  const PW = Math.round(W * S)
  const PH = Math.round(L * S)
  return paint(PW, PH, (g) => {
    const r = rng(7)
    g.fillStyle = '#f6efe1'
    g.fillRect(0, 0, PW, PH)
    // the stripes along it (x across): a repeat, mirrored about the middle so both edges match
    const bands: [number, string][] = [
      [70, '#f6efe1'],
      [46, '#a9c3a0'],
      [10, '#f6efe1'],
      [6, '#c9765a'],
      [10, '#f6efe1'],
      [6, '#c9765a'],
      [10, '#f6efe1'],
      [46, '#a9c3a0'],
    ]
    let x = 0
    for (let k = 0; x < W; k++) {
      const [bw, col] = bands[k % bands.length]
      if (col !== '#f6efe1') {
        g.fillStyle = col
        g.fillRect(x * S, 0, bw * S, PH)
      }
      x += bw
    }
    // the weave: fine threads both ways, a little uneven
    for (let px = 0; px < PW; px += 2) {
      g.fillStyle = `rgba(90,70,60,${0.025 + r() * 0.035})`
      g.fillRect(px, 0, 1, PH)
    }
    for (let py = 0; py < PH; py += 2) {
      g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`
      g.fillRect(0, py, PW, 1)
    }
    // its hemmed ends (where the fringe comes out)
    g.fillStyle = 'rgba(160,120,95,0.35)'
    g.fillRect(0, 0, PW, 5)
    g.fillRect(0, PH - 5, PW, 5)
  })
})()
const CLOTH = bruno({ map: clothTex ?? undefined, color: '#ffffff', shade: '#a49aae' })
const BACK = bruno({ color: '#efe6d4', shade: '#a49aae', side: BackSide })
const EDGE = bruno({ color: '#e9dfcb', shade: '#a49aae' })
const TASSEL = bruno({ color: '#f1e8d6', shade: '#a49aae' })

/** how it lies: a gentle swell over the lawn (never down into it), and its edges' wander */
const height = (x: number, z: number) => T + 4 + 2.2 * Math.sin(x * 0.0041 + 0.6) * Math.cos(z * 0.0033 - 0.4) + 1.6 * Math.sin((x + z) * 0.0061)
const wander = (s: number, k: number) => 5 * Math.sin(s * 0.009 + k) + 3 * Math.sin(s * 0.023 + k * 2)

function throwGeometry() {
  const nx = 40
  const nz = 48
  const pos: number[] = []
  const uv: number[] = []
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const u = i / nx
      const v = j / nz
      let x = (u - 0.5) * W
      let z = (v - 0.5) * L
      // (the edges not quite straight)
      if (i === 0 || i === nx) x += wander(z, i ? 1 : 3)
      if (j === 0 || j === nz) z += wander(x, j ? 2 : 4) * 0.6
      pos.push(x, height(x, z), z)
      uv.push(u, 1 - v)
    }
  const idx: number[] = []
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2)
    }
  const cloth = new BufferGeometry()
  cloth.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  cloth.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  cloth.setIndex(idx)
  cloth.computeVertexNormals()
  // its edge: a strip round it, the cloth's thickness, down to the grass
  const loop: number[] = []
  for (let i = 0; i <= nx; i++) loop.push(i)
  for (let j = 1; j <= nz; j++) loop.push(j * (nx + 1) + nx)
  for (let i = nx - 1; i >= 0; i--) loop.push(nz * (nx + 1) + i)
  for (let j = nz - 1; j > 0; j--) loop.push(j * (nx + 1))
  const ep: number[] = []
  for (const v of loop) ep.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], pos[v * 3], 0, pos[v * 3 + 2])
  const ei: number[] = []
  for (let k = 0; k < loop.length; k++) {
    const a = k * 2
    const b = ((k + 1) % loop.length) * 2
    ei.push(a, a + 1, b, b, a + 1, b + 1)
  }
  const edge = new BufferGeometry()
  edge.setAttribute('position', new BufferAttribute(new Float32Array(ep), 3))
  edge.setIndex(ei)
  edge.computeVertexNormals()
  return { cloth, edge }
}

/** the fringe: a tassel every 22 mm along each end, lying out on the grass, each a little askew */
const STRAND = new CylinderGeometry(1, 0.7, 1, 6)
const STEP = 22
function Fringe() {
  const ref = useRef<InstancedMesh>(null)
  const n = 2 * (Math.floor(W / STEP) - 1)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const r = rng(19)
    const M = new Matrix4()
    const q = new Quaternion()
    let k = 0
    for (const end of [-1, 1])
      for (let i = 1; i < Math.floor(W / STEP); i++) {
        const x = -W / 2 + i * STEP
        const z0 = end * (L / 2 + wander(x, end > 0 ? 2 : 4) * 0.6)
        const len = FRINGE * (0.85 + r() * 0.3)
        const yaw = (r() - 0.5) * 0.5
        const dir = new Vector3(Math.sin(yaw), -0.04, end * Math.cos(yaw)).normalize()
        q.setFromUnitVectors(new Vector3(0, 1, 0), dir)
        const mid = new Vector3(x, 1.6, z0).addScaledVector(dir, len / 2)
        M.compose(mid, q, new Vector3(2.4, len, 2.4))
        m.setMatrixAt(k++, M)
      }
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [])
  return <instancedMesh ref={ref} args={[STRAND, TASSEL, n]} castShadow receiveShadow />
}

export function Throw() {
  const geo = useMemo(throwGeometry, [])
  return (
    <group>
      <mesh geometry={geo.cloth} material={CLOTH} receiveShadow />
      <mesh geometry={geo.cloth} material={BACK} />
      <mesh geometry={geo.edge} material={EDGE} />
      <Fringe />
    </group>
  )
}
/** how high its top is at (x, z), for setting things on it */
export const throwTop = (x: number, z: number) => height(x, z)
