import { useMemo } from 'react'
import { CircleGeometry, CylinderGeometry, DoubleSide, LatheGeometry, TorusGeometry, Vector2 } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from './paint'

/**
 * A jar of strawberry jam (./spec [J]), in real millimetres: a round glass jar full of it (deep red, the
 * seeds and bits of fruit in it showing at the glass, a highlight down it), a kraft label round its front
 * written by hand, a red gingham cloth over its lid, its edge pinked, tied round with twine.
 *
 * Its frame: standing on y = 0, its label toward +z.
 */
export const JAM = { r: 34, h: 82, neck: 29, lid: 12, cloth: 54 } // [J] a 340 g jar
const { r: R, h: H, neck: NR, lid: LH, cloth: CR } = JAM

const jamTex = paint(512, 256, (g) => {
  const r = rng(17)
  const W = 512
  const Hp = 256
  const grd = g.createLinearGradient(0, 0, W, 0)
  grd.addColorStop(0, '#8e1426')
  grd.addColorStop(0.5, '#b31f33')
  grd.addColorStop(1, '#8e1426')
  g.fillStyle = grd
  g.fillRect(0, 0, W, Hp)
  // bits of fruit and seeds, pressed to the glass
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${90 + r() * 40},${8 + r() * 10},${20 + r() * 14},${0.4 + r() * 0.4})`
    g.beginPath()
    g.ellipse(r() * W, r() * Hp, 4 + r() * 12, 3 + r() * 8, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(250,${200 + r() * 40},${120 + r() * 40},${0.5 + r() * 0.4})`
    g.fillRect(r() * W, r() * Hp, 1.6, 2.2)
  }
  // the label: kraft paper round its front, written on by hand, a little strawberry drawn
  const lx = W * 0.36
  const lw = W * 0.28
  const ly = Hp * 0.28
  const lh = Hp * 0.46
  g.fillStyle = '#d9b98c'
  g.fillRect(lx, ly, lw, lh)
  g.strokeStyle = 'rgba(120,80,40,0.5)'
  g.lineWidth = 2
  g.setLineDash([5, 4])
  g.strokeRect(lx + 6, ly + 6, lw - 12, lh - 12)
  g.setLineDash([])
  g.fillStyle = '#5a3420'
  g.textAlign = 'center'
  g.font = "bold 26px Gaegu, 'Comic Sans MS', cursive"
  g.fillText('Strawberry', lx + lw / 2, ly + lh * 0.42)
  g.font = "22px Gaegu, 'Comic Sans MS', cursive"
  g.fillText('jam', lx + lw / 2, ly + lh * 0.66)
  g.fillStyle = '#d23a3f'
  g.beginPath()
  g.moveTo(lx + lw / 2 - 7, ly + lh * 0.76)
  g.quadraticCurveTo(lx + lw / 2, ly + lh * 0.98, lx + lw / 2 + 7, ly + lh * 0.76)
  g.closePath()
  g.fill()
  g.fillStyle = '#5c9a3e'
  g.fillRect(lx + lw / 2 - 5, ly + lh * 0.74, 10, 3)
})
const JAR = bruno({ map: jamTex ?? undefined, color: '#ffffff', shade: '#6a3048', sheen: 0.55 })
const GLASS = bruno({ color: '#e9eef0', shade: '#a9b4bf', transparent: true, opacity: 0.45, sheen: 0.6 })
const ginghamTex = paint(128, 128, (g) => {
  g.fillStyle = '#fbf3ea'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(214,52,60,0.6)'
  g.fillRect(0, 0, 32, 128)
  g.fillRect(64, 0, 32, 128)
  g.fillRect(0, 0, 128, 32)
  g.fillRect(0, 64, 128, 32)
})
if (ginghamTex) ginghamTex.repeat.set(2.4, 2.4)
const CLOTH = bruno({ map: ginghamTex ?? undefined, color: '#ffffff', shade: '#a5869c', side: DoubleSide })
const TWINE = bruno({ color: '#c9a777', shade: '#8a7270' })

let made: ReturnType<typeof build> | null = null
function build() {
  // the jar: rounded at its foot, straight up its side, in at its shoulder to the neck
  const prof: Vector2[] = []
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2)
    prof.push(new Vector2(R - 5 + Math.sin(a) * 5, 5 - Math.cos(a) * 5))
  }
  prof.push(new Vector2(R, H * 0.8))
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2)
    prof.push(new Vector2(NR + (R - NR) * Math.cos(a), H * 0.8 + (H * 0.12) * Math.sin(a)))
  }
  prof.push(new Vector2(NR, H))
  const body = new LatheGeometry(prof, 48)
  // (its uvs round it: the label to the front)
  const uv = body.attributes.uv
  const p = body.attributes.position
  for (let i = 0; i < uv.count; i++) {
    const a = Math.atan2(p.getX(i), p.getZ(i))
    uv.setXY(i, 0.5 + a / (Math.PI * 2), p.getY(i) / H)
  }
  // the cloth over its lid: flat on top, falling over the edge in soft folds, its pinked hem
  const cloth = new CircleGeometry(CR, 96, 0, Math.PI * 2)
  {
    const cp = cloth.attributes.position
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i)
      const y = cp.getY(i)
      const rr = Math.hypot(x, y)
      const a = Math.atan2(y, x)
      const over = Math.max(0, rr - (NR + 2))
      const fold = 1 + 0.12 * Math.sin(a * 7) * Math.min(1, over / 10)
      const pinked = rr > CR - 1 ? 1 - 0.05 * (Math.round((a * 96) / (Math.PI * 2)) % 2) : 1
      const k = (fold * pinked * (NR + 2 + over * 0.55)) / Math.max(1e-6, rr)
      cp.setXYZ(i, x * (rr > NR + 2 ? k : 1), y * (rr > NR + 2 ? k : 1), -over * 0.85)
    }
    cloth.rotateX(-Math.PI / 2)
    cloth.computeVertexNormals()
  }
  return { body, lid: new CylinderGeometry(NR + 2, NR + 2, LH, 40), cloth, twine: new TorusGeometry(NR + 2.6, 1.3, 6, 48), end: new CylinderGeometry(1.1, 1.1, 24, 5) }
}

export function Jam() {
  const g = useMemo(() => (made ??= build()), [])
  return (
    <group>
      <mesh geometry={g.body} material={JAR} castShadow receiveShadow />
      <mesh geometry={g.body} material={GLASS} scale={[1.02, 1, 1.02]} />
      <mesh geometry={g.lid} material={CLOTH} position={[0, H + LH / 2, 0]} />
      <mesh geometry={g.cloth} material={CLOTH} position={[0, H + LH + 0.5, 0]} castShadow />
      <mesh geometry={g.twine} material={TWINE} position={[0, H + LH - 6, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {/* its ends, hanging from the knot */}
      <mesh geometry={g.end} material={TWINE} position={[6, H + LH - 17, NR + 4]} rotation={[0.15, 0, 0.35]} />
      <mesh geometry={g.end} material={TWINE} position={[-5, H + LH - 18, NR + 4]} rotation={[0.15, 0, -0.25]} />
    </group>
  )
}
export const JAM_BOX = { half: [R, (H + LH) / 2, R] as [number, number, number], at: [0, (H + LH) / 2, 0] as [number, number, number] }
