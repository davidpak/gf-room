import { useMemo } from 'react'
import { BackSide, BufferAttribute, BufferGeometry, ClampToEdgeWrapping, DoubleSide, FrontSide, Vector3 } from 'three'
import { bruno } from '../quad/bruno'
import { BLANKET } from './spec'
import { LAYOUT } from './layout'
import { paint, rng } from './paint'

/**
 * The picnic blanket (../spec [B], 60 × 80"), laid on the grass, a formula fitted to it (no cloth
 * simulation): woven red and white gingham bound round with a red binding, its stitching, a little sewn
 * label in a corner; a cream fleece back (showing where its far corner's turned back over itself). It
 * swells a little over the lawn, its edge isn't quite straight, and it creases where the basket's weight
 * pulls at it. Its frame: x across, z along (its near end -z), y up, its middle at the origin.
 */
const { w: W, l: L, t: T, check: CHECK } = BLANKET
const BIND = 26 // (the binding round its edge)
/** the cloth, painted whole (not tiled): checks, binding, stitches, its label */
const clothTex = (() => {
  const S = 0.68 // (px a mm)
  const PW = Math.round(W * S)
  const PH = Math.round(L * S)
  const t = paint(PW, PH, (g) => {
    const r = rng(41)
    g.fillStyle = '#fbf4ea'
    g.fillRect(0, 0, PW, PH)
    // the red threads, both ways: half the checks red one way, half the other, the crossings deep
    const c = CHECK * S
    g.fillStyle = 'rgba(206,64,62,0.52)'
    for (let x = 0; x < PW; x += c * 2) g.fillRect(x, 0, c, PH)
    for (let y = 0; y < PH; y += c * 2) g.fillRect(0, y, PW, c)
    // the weave: fine threads, slightly uneven
    for (let x = 0; x < PW; x += 2) {
      g.fillStyle = `rgba(110,30,30,${0.03 + r() * 0.04})`
      g.fillRect(x, 0, 1, PH)
    }
    for (let y = 0; y < PH; y += 2) {
      g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`
      g.fillRect(0, y, PW, 1)
    }
    // the binding round it, and its stitching just inside
    const b = BIND * S
    g.fillStyle = '#c63f3c'
    g.fillRect(0, 0, PW, b)
    g.fillRect(0, PH - b, PW, b)
    g.fillRect(0, 0, b, PH)
    g.fillRect(PW - b, 0, b, PH)
    g.strokeStyle = 'rgba(120,24,24,0.35)'
    g.lineWidth = 1
    g.strokeRect(b, b, PW - 2 * b, PH - 2 * b)
    g.strokeStyle = 'rgba(255,240,226,0.85)'
    g.setLineDash([5, 4])
    g.lineWidth = 1.3
    const st = b * 0.5
    g.strokeRect(st, st, PW - 2 * st, PH - 2 * st)
    g.setLineDash([])
    // a little label sewn on, near the near-left corner: a heart
    const lx = b + 28 * S
    const ly = PH - b - 70 * S
    g.fillStyle = '#fbf1df'
    g.fillRect(lx, ly, 46 * S, 30 * S)
    g.strokeStyle = 'rgba(150,40,40,0.5)'
    g.setLineDash([2, 2])
    g.strokeRect(lx + 2, ly + 2, 46 * S - 4, 30 * S - 4)
    g.setLineDash([])
    g.fillStyle = '#c63f3c'
    const hx = lx + 23 * S
    const hy = ly + 16 * S
    const k = 4.2 * S
    g.beginPath()
    g.moveTo(hx, hy + k)
    g.bezierCurveTo(hx - 2.4 * k, hy - 0.6 * k, hx - 0.9 * k, hy - 2.2 * k, hx, hy - 0.8 * k)
    g.bezierCurveTo(hx + 0.9 * k, hy - 2.2 * k, hx + 2.4 * k, hy - 0.6 * k, hx, hy + k)
    g.fill()
  })
  if (t) t.wrapS = t.wrapT = ClampToEdgeWrapping
  return t
})()
const CLOTH = bruno({ map: clothTex ?? undefined, color: '#ffffff', shade: '#a989b2', side: FrontSide })
const FLEECE = bruno({ color: '#f1e6d4', shade: '#ab9cb8', side: BackSide })
const EDGE = bruno({ color: '#c63f3c', shade: '#8f5a7e', side: DoubleSide })

/** creases: where the basket sits it pulls the cloth into ridges running off it, and one long soft one */
const CREASES: { a: [number, number]; b: [number, number]; h: number; w: number }[] = [
  { a: [LAYOUT.basket.x + 150, LAYOUT.basket.z + 90], b: [LAYOUT.basket.x + 360, LAYOUT.basket.z + 330], h: 6, w: 16 },
  { a: [LAYOUT.basket.x - 150, LAYOUT.basket.z + 110], b: [LAYOUT.basket.x - 290, LAYOUT.basket.z + 420], h: 5, w: 14 },
  { a: [LAYOUT.basket.x + 170, LAYOUT.basket.z - 60], b: [LAYOUT.basket.x + 420, LAYOUT.basket.z - 120], h: 4, w: 13 },
  { a: [-380, 120], b: [260, 640], h: 4, w: 30 },
]
/** where things stand on it: x, z, how far round */
const FLAT: [number, number, number][] = [
  [LAYOUT.basket.x, LAYOUT.basket.z, 190],
  [LAYOUT.stack[0].x, LAYOUT.stack[0].z, 110],
  [LAYOUT.open.x, LAYOUT.open.z, 180],
]
function height(x: number, z: number) {
  let y = T / 2 + 3 + 3 * Math.sin(x * 0.0045 + 0.7) * Math.sin(z * 0.0032 + 1.9) + 1.4 * Math.sin(x * 0.011 + z * 0.007)
  // pressed flat where things stand on it (the basket, the books): down to just under them
  let flat = 1
  for (const [fx, fz, r] of FLAT) flat = Math.min(flat, Math.max(0, (Math.hypot(x - fx, z - fz) - r) / 160))
  y = LAYOUT.y - 1 + (y - (LAYOUT.y - 1)) * flat
  for (const c of CREASES) {
    const ax = c.a[0]
    const az = c.a[1]
    const dx = c.b[0] - ax
    const dz = c.b[1] - az
    const len2 = dx * dx + dz * dz
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t)
    y += 1.5 * c.h * Math.exp(-(d * d) / (2 * c.w * c.w)) * Math.sin(Math.PI * t)
  }
  // its edges lift a little here and there, as a laid cloth's do
  const e = Math.min(W / 2 - Math.abs(x), L / 2 - Math.abs(z))
  y += Math.max(0, 1 - e / 50) * (2.5 + 2.5 * Math.sin(x * 0.02 + z * 0.017))
  return y
}

export function blanketGeometry() {
  const nx = 72
  const nz = 96
  // the far right corner turned back over itself
  const fa = new Vector3(W / 2 - 300, 0, L / 2)
  const fb = new Vector3(W / 2, 0, L / 2 - 360)
  const along = fb.clone().sub(fa).normalize()
  const n = new Vector3(along.z, 0, -along.x)
  if (n.dot(new Vector3(W / 2, 0, L / 2).sub(fa)) < 0) n.negate()
  const R = 7
  const pos: number[] = []
  const uv: number[] = []
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      let x = -W / 2 + (W * i) / nx
      let z = -L / 2 + (L * j) / nz
      uv.push((x + W / 2) / W, (z + L / 2) / L)
      // its edge not quite straight
      if (i === 0 || i === nx) x += 4 * Math.sin(z * 0.013 + i)
      if (j === 0 || j === nz) z += 4 * Math.sin(x * 0.011 + j)
      const y = height(x, z)
      const p = new Vector3(x, 0, z)
      const d = p.clone().sub(fa).dot(n)
      if (d > 0) {
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
        pos.push(q.x, height(q.x, q.z) + h, q.z)
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
  // its edge: a strip round it, the binding's thickness, down to the grass
  const loop: number[] = []
  for (let i = 0; i <= nx; i++) loop.push(i)
  for (let j = 1; j <= nz; j++) loop.push(j * (nx + 1) + nx)
  for (let i = nx - 1; i >= 0; i--) loop.push(nz * (nx + 1) + i)
  for (let j = nz - 1; j > 0; j--) loop.push(j * (nx + 1))
  const ep: number[] = []
  for (const v of loop) {
    const x = pos[v * 3]
    const y = pos[v * 3 + 1]
    const z = pos[v * 3 + 2]
    ep.push(x, y, z, x, y - T - 1.5, z)
  }
  const ei: number[] = []
  const m = loop.length
  for (let k = 0; k < m; k++) {
    const a = k * 2
    const b = ((k + 1) % m) * 2
    ei.push(a, a + 1, b, b, a + 1, b + 1)
  }
  const edge = new BufferGeometry()
  edge.setAttribute('position', new BufferAttribute(new Float32Array(ep), 3))
  edge.setIndex(ei)
  edge.computeVertexNormals()
  return { cloth: g, edge }
}

export function Blanket() {
  const geo = useMemo(blanketGeometry, [])
  return (
    <group>
      <mesh geometry={geo.cloth} material={CLOTH} receiveShadow />
      <mesh geometry={geo.cloth} material={FLEECE} />
      <mesh geometry={geo.edge} material={EDGE} />
    </group>
  )
}
