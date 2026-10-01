import { useMemo } from 'react'
import { CylinderGeometry, DoubleSide, Euler, LatheGeometry, Matrix4, Quaternion, Shape, ShapeGeometry, Vector2, Vector3 } from 'three'
import { bruno } from '../quad/bruno'
import { loft, type Ring } from './loft'
import { paint, rng } from './paint'

/**
 * A punnet of strawberries (../spec [P]), in real millimetres: a moulded pulp punnet (pale green, ribbed, a
 * rolled rim), heaped with strawberries (each its own shape, glossy red, its seeds in little dimples, its green
 * star of a calyx and stalk). Eaten ones (`eaten`, by index) are gone.
 *
 * Its frame: standing on y = 0, its middle at the origin.
 */
export const PUNNET = { top: 92, foot: 76, h: 46, wall: 2.5 } // [P] a 250 g punnet
const { top: TOP, foot: FOOT, h: PH } = PUNNET

const pulpTex = paint(128, 128, (g) => {
  const r = rng(9)
  g.fillStyle = '#b9d49a'
  g.fillRect(0, 0, 128, 128)
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = 'rgba(120,150,96,0.35)'
    g.fillRect(x, 0, 3, 128)
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '150,180,120' : '220,235,200'},0.5)`
    g.fillRect(r() * 128, r() * 128, 1.5, 1.5)
  }
})
const PULP = bruno({ map: pulpTex ?? undefined, color: '#ffffff', shade: '#7c967c', side: DoubleSide })
const seedTex = paint(128, 128, (g) => {
  const r = rng(23)
  g.fillStyle = '#d9233a'
  g.fillRect(0, 0, 128, 128)
  for (let row = 0; row < 10; row++)
    for (let col = 0; col < 12; col++) {
      const x = col * 10.7 + (row % 2) * 5.3 + (r() - 0.5) * 2
      const y = row * 12.8 + (r() - 0.5) * 2
      g.fillStyle = 'rgba(150,10,30,0.6)'
      g.beginPath()
      g.ellipse(x, y, 2.6, 3.2, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#f6d36b'
      g.beginPath()
      g.ellipse(x, y, 1, 1.4, 0, 0, Math.PI * 2)
      g.fill()
    }
  // (paler at its shoulders, under the calyx)
  const gr = g.createLinearGradient(0, 0, 0, 128)
  gr.addColorStop(0.75, 'rgba(255,200,180,0)')
  gr.addColorStop(1, 'rgba(255,220,200,0.55)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
})
export const BERRY = bruno({ map: seedTex ?? undefined, color: '#ffffff', shade: '#8a2f4f', sheen: 0.5 })
export const LEAF = bruno({ color: '#5aa043', shade: '#3c6a50', side: DoubleSide })

/** a strawberry: its shoulders full, drawn to a blunt point; standing on its point, its calyx up (y) */
export function berryGeo(len: number, w: number) {
  const prof: Vector2[] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    // (from its tip up to its shoulders, then in under the calyx)
    const rr = w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.62 + 0.02)), 0.75) * (t > 0.88 ? 1 - (t - 0.88) * 4 : 1)
    prof.push(new Vector2(Math.max(0.3, rr), t * len))
  }
  return new LatheGeometry(prof, 20)
}
/** its calyx: a star of sepals, flat, curling out and down at their tips */
export function calyxGeo(w: number) {
  const s = new Shape()
  const n = 7
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2
    const rr = i % 2 ? w * 0.25 : w * 1.05
    const pt = new Vector2(Math.cos(a) * rr, Math.sin(a) * rr)
    if (i === 0) s.moveTo(pt.x, pt.y)
    else s.lineTo(pt.x, pt.y)
  }
  const g = new ShapeGeometry(s)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const rr = Math.hypot(p.getX(i), p.getY(i))
    p.setZ(i, -Math.pow(rr / w, 2) * w * 0.35)
  }
  g.rotateX(-Math.PI / 2)
  g.computeVertexNormals()
  return g
}

let made: ReturnType<typeof build> | null = null
function build() {
  const r = rng(51)
  // the punnet: a tapered square with rounded corners, a rolled rim, its floor
  const rect = (a: number, rad: number) => {
    const pts: Vector3[] = []
    for (const [cx, cz, a0] of [
      [1, 1, 0],
      [-1, 1, Math.PI / 2],
      [-1, -1, Math.PI],
      [1, -1, (3 * Math.PI) / 2],
    ] as [number, number, number][])
      for (let k = 0; k <= 4; k++) {
        const t = a0 + (k / 4) * (Math.PI / 2)
        pts.push(new Vector3(cx * (a - rad) + Math.cos(t) * rad, 0, cz * (a - rad) + Math.sin(t) * rad))
      }
    return pts
  }
  const ring = (a: number, y: number): Ring => ({ p: rect(a, 10).map((v) => v.setY(y)) })
  const shell = loft([ring(FOOT / 2, 0), ring(TOP / 2, PH - 3), ring(TOP / 2 + 2, PH), ring(TOP / 2 - 2, PH + 0.5), ring(TOP / 2 - 4, PH - 4), ring(FOOT / 2 - 3, 3)])
  shell.computeVertexNormals()
  const uv = shell.attributes.uv
  const sp = shell.attributes.position
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (sp.getX(i) + sp.getZ(i)) / 60, sp.getY(i) / 60)
  const floor = new ShapeGeometry(new Shape(rect(FOOT / 2 - 3, 8).map((v) => new Vector2(v.x, v.z))))
  floor.rotateX(Math.PI / 2)
  // the strawberries heaped in it: a layer on its floor, more on them, a few on top
  const berries: { m: Matrix4; len: number; w: number }[] = []
  const place = (x: number, y: number, z: number, tip: number, len: number) => {
    const w = len * (0.38 + r() * 0.08)
    const q = new Quaternion().setFromEuler(new Euler((r() - 0.5) * 0.6 + tip, r() * 6, (r() - 0.5) * 0.6 + tip * (r() - 0.5)))
    berries.push({ m: new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1)), len, w })
  }
  for (let i = 0; i < 4; i++) place(((i % 2) - 0.5) * 38, 10, (Math.floor(i / 2) - 0.5) * 38, 1.5, 36 + r() * 6)
  for (let i = 0; i < 4; i++) place(((i % 2) - 0.5) * 30 + 4, 32, (Math.floor(i / 2) - 0.5) * 30 - 3, 1.1, 34 + r() * 6)
  place(-6, 50, 4, 0.7, 38)
  place(14, 48, -10, 1.8, 34)
  return { shell, floor, berries, geos: berries.map((b) => ({ body: berryGeo(b.len, b.w), calyx: calyxGeo(b.w) })) }
}
const STALK = new CylinderGeometry(0.9, 1.2, 9, 5)

export function Strawberries({ eaten }: { eaten?: Set<number> }) {
  const g = useMemo(() => (made ??= build()), [])
  return (
    <group>
      <mesh geometry={g.shell} material={PULP} castShadow receiveShadow />
      <mesh geometry={g.floor} material={PULP} position={[0, 3, 0]} />
      {g.berries.map((b, i) =>
        eaten?.has(i) ? null : (
          <group key={i} matrix={b.m} matrixAutoUpdate={false} userData={{ berry: i }}>
            {/* (centred: its middle where it's placed) */}
            <group position={[0, -b.len / 2, 0]}>
              <mesh geometry={g.geos[i].body} material={BERRY} castShadow />
              <mesh geometry={g.geos[i].calyx} material={LEAF} position={[0, b.len * 0.97, 0]} />
              <mesh geometry={STALK} material={LEAF} position={[0, b.len + 4, 0]} rotation={[0.3, 0, 0.2]} />
            </group>
          </group>
        ),
      )}
    </group>
  )
}
export const berryCount = () => (made ??= build()).berries.length
/** the strawberry nearest a point (its frame) not eaten yet, or -1 */
export function nearestBerry(p: Vector3, eaten?: Set<number>) {
  const b = (made ??= build())
  let best = -1
  let bd = Infinity
  const c = new Vector3()
  b.berries.forEach((x, i) => {
    if (eaten?.has(i)) return
    const d = c.setFromMatrixPosition(x.m).distanceTo(p)
    if (d < bd) [bd, best] = [d, i]
  })
  return best
}
export const PUNNET_BOX = { half: [TOP / 2, PH / 2 + 8, TOP / 2] as [number, number, number], at: [0, PH / 2 + 8, 0] as [number, number, number] }
