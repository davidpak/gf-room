import { useMemo } from 'react'
import { BufferAttribute, SphereGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { canvasTexture } from './anchors'
import { BENCH, CASE, CUSHION, RUG } from './spec'

/**
 * What the GameCube's set up on (toy style): the low birch TV bench [B] (its top, its sides, the open shelf under,
 * two more games lying on it), the rug [R] (cream, a lavender border, a row of little diamonds round it), the floor
 * cushions [U] (a formula shape: a puffed square, tufted in the middle). Each its frame's origin on the ground under
 * its middle.
 */
const WOOD = bruno({ color: '#e2c39b', shade: '#8a6a5a' })
const WOOD_EDGE = bruno({ color: '#d4b083', shade: '#7a5a4a' })
const TOP = new RoundedBoxGeometry(BENCH.w, BENCH.top, BENCH.d, 2, 5)
const SIDE = new RoundedBoxGeometry(BENCH.side, BENCH.h - BENCH.top, BENCH.d - 10, 2, 4)
const SHELF = new RoundedBoxGeometry(BENCH.w - 2 * BENCH.side, BENCH.shelf.t, BENCH.d - 30, 2, 3)
const GAME = new RoundedBoxGeometry(CASE.w, CASE.t, CASE.h, 2, 2)

export function Bench() {
  const games = useMemo(
    () =>
      ['#3f7fd9', '#e0503d'].map((col) =>
        bruno({
          map: canvasTexture(135, 190, (g) => {
            g.fillStyle = '#121216'
            g.fillRect(0, 0, 135, 190)
            g.fillStyle = col
            g.fillRect(5, 5, 125, 180)
            g.fillStyle = '#0c0c10'
            g.fillRect(5, 5, 125, 22)
            g.fillStyle = 'rgba(255,255,255,0.85)'
            g.beginPath()
            g.arc(67, 100, 30, 0, Math.PI * 2)
            g.fill()
          }),
        }),
      ),
    [],
  )
  const black = useMemo(() => bruno({ color: '#18171c' }), [])
  return (
    <group>
      <mesh geometry={TOP} material={WOOD} position={[0, BENCH.h - BENCH.top / 2, 0]} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={SIDE} material={WOOD_EDGE} position={[s * (BENCH.w / 2 - BENCH.side / 2), (BENCH.h - BENCH.top) / 2, 0]} castShadow receiveShadow />
      ))}
      <mesh geometry={SHELF} material={WOOD} position={[0, BENCH.shelf.y, 0]} castShadow receiveShadow />
      {/* two more games on the shelf */}
      {games.map((m, i) => (
        <mesh key={i} geometry={GAME} material={[black, black, m, black, black, black]} position={[-210 + i * 14, BENCH.shelf.y + BENCH.shelf.t / 2 + CASE.t / 2 + i * CASE.t, 10 - i * 8]} rotation={[0, 0.1 - i * 0.25, 0]} castShadow />
      ))}
    </group>
  )
}

const RUG_GEO = new RoundedBoxGeometry(RUG.w, RUG.t, RUG.d, 2, 3)
export function Rug() {
  const mats = useMemo(() => {
    const top = canvasTexture(1024, Math.round((1024 * RUG.d) / RUG.w), (g) => {
      const w = g.canvas.width
      const h = g.canvas.height
      g.fillStyle = '#f4e9d6'
      g.fillRect(0, 0, w, h)
      const b = w * 0.045
      g.strokeStyle = '#c9b6e8'
      g.lineWidth = b
      g.strokeRect(b * 0.9, b * 0.9, w - b * 1.8, h - b * 1.8)
      g.strokeStyle = '#f2b8c6'
      g.lineWidth = b * 0.3
      g.strokeRect(b * 2, b * 2, w - b * 4, h - b * 4)
      // a row of little diamonds round it, inside the border
      g.fillStyle = '#c9b6e8'
      const d = b * 0.42
      const step = b * 1.4
      const ring = (x0: number, y0: number, x1: number, y1: number) => {
        const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / step)
        for (let i = 0; i <= n; i++) {
          const x = x0 + ((x1 - x0) * i) / n
          const y = y0 + ((y1 - y0) * i) / n
          g.beginPath()
          g.moveTo(x, y - d)
          g.lineTo(x + d, y)
          g.lineTo(x, y + d)
          g.lineTo(x - d, y)
          g.closePath()
          g.fill()
        }
      }
      const m = b * 3
      ring(m, m, w - m, m)
      ring(m, h - m, w - m, h - m)
      ring(m, m, m, h - m)
      ring(w - m, m, w - m, h - m)
      // its weave
      g.fillStyle = 'rgba(160,130,110,0.05)'
      for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1)
    })
    const edge = bruno({ color: '#e6d6bd', shade: '#9a8a8a' })
    return [edge, edge, bruno({ map: top, shade: '#a99aa8' }), edge, edge, edge]
  }, [])
  return <mesh geometry={RUG_GEO} material={mats} position={[0, RUG.t / 2, 0]} receiveShadow />
}

/** a floor cushion: a sphere pushed out toward a square (a superellipsoid), flattened, dimpled where it's tufted */
const CUSHION_GEO = (() => {
  const g = new SphereGeometry(1, 40, 24)
  const p = g.attributes.position as BufferAttribute
  const half = CUSHION.s / 2
  const t = CUSHION.t / 2
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const sx = Math.sign(x) * Math.pow(Math.abs(x), 0.32) * half
    const sz = Math.sign(z) * Math.pow(Math.abs(z), 0.32) * half
    let sy = Math.sign(y) * Math.pow(Math.abs(y), 0.75) * t
    // (puffed in the middle, thinner at its edges; the tuft's dimple)
    const r = Math.hypot(sx, sz) / half
    sy *= 1 - 0.35 * Math.min(1, r * r)
    if (y > 0) sy -= 14 * Math.exp(-(sx * sx + sz * sz) / (2 * 40 * 40))
    p.setXYZ(i, sx, sy + t, sz)
  }
  g.computeVertexNormals()
  return g
})()
const TUFT = new SphereGeometry(9, 12, 8)
export function Cushion({ color }: { color: string }) {
  const mats = useMemo(() => ({ body: bruno({ color, shade: '#9a8aa8' }), tuft: bruno({ color, shade: '#7a6a88' }) }), [color])
  return (
    <group>
      <mesh geometry={CUSHION_GEO} material={mats.body} castShadow receiveShadow />
      <mesh geometry={TUFT} material={mats.tuft} position={[0, CUSHION.t - 12, 0]} scale={[1, 0.6, 1]} />
    </group>
  )
}
