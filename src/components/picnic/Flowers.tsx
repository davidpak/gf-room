import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CatmullRomCurve3, CylinderGeometry, DoubleSide, LatheGeometry, Shape, ShapeGeometry, SphereGeometry, TubeGeometry, Vector2, Vector3, type Group } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from './paint'

/**
 * Wildflowers in a jar (./spec [V]), in real millimetres: a little glass jar of water, and in it, splaying
 * out, daisies, pink cosmos, sprigs of lavender and clouds of baby's breath on their stems, a few leaves. And
 * (./Butterflies) two butterflies about them, now flitting round, now settled on a flower opening and
 * closing their wings.
 *
 * Its frame: standing on y = 0, its middle at the origin.
 */
export const VASE = { r: 33, h: 96 } // [V] a 250 ml jar
const { r: VR, h: VH } = VASE

const GLASS = bruno({ color: '#eef6f8', shade: '#a9b9c6', transparent: true, opacity: 0.3, sheen: 0.8, depthWrite: false })
const WATER = bruno({ color: '#d9eef2', shade: '#9ab4c0', transparent: true, opacity: 0.35, depthWrite: false })
const STEM = bruno({ color: '#6aa24c', shade: '#46705a' })
const M = {
  daisy: bruno({ color: '#fdfbf6', shade: '#c9c2cc', side: DoubleSide }),
  heart: bruno({ color: '#f6c434', shade: '#b0906a' }),
  cosmos: bruno({ color: '#f39bbf', shade: '#b0708f', side: DoubleSide }),
  cosmosPale: bruno({ color: '#fbd0e0', shade: '#bf96aa', side: DoubleSide }),
  lavender: bruno({ color: '#9d84d6', shade: '#6a5a92' }),
  breath: bruno({ color: '#fffdf8', shade: '#cfc8cf' }),
  leaf: bruno({ color: '#78b257', shade: '#4c7a5c', side: DoubleSide }),
}

/** a flower's face: petals round a middle (n of them, so far out, so broad), a little cupped */
function petals(n: number, R: number, broad: number, notch = 0) {
  const s = new Shape()
  const N = n * 16
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const k = Math.abs(Math.cos((a * n) / 2))
    const rr = R * (0.22 + 0.78 * Math.pow(k, broad)) - notch * Math.pow(Math.max(0, k - 0.97) / 0.03, 2)
    const p = new Vector2(Math.cos(a) * rr, Math.sin(a) * rr)
    if (i === 0) s.moveTo(p.x, p.y)
    else s.lineTo(p.x, p.y)
  }
  const g = new ShapeGeometry(s)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setZ(i, (Math.hypot(p.getX(i), p.getY(i)) / R) ** 2 * R * 0.18)
  g.rotateX(-Math.PI / 2)
  g.computeVertexNormals()
  return g
}

type Head = { kind: 'daisy' | 'cosmos' | 'lavender' | 'breath'; tip: Vector3; tilt: Vector3 }
let made: ReturnType<typeof build> | null = null
function build() {
  const r = rng(5)
  const jar = new LatheGeometry(
    [new Vector2(0, 0), new Vector2(VR - 4, 0), new Vector2(VR, 4), new Vector2(VR, VH * 0.8), new Vector2(VR - 4, VH * 0.9), new Vector2(VR - 4, VH)],
    40,
  )
  const water = new CylinderGeometry(VR - 2.5, VR - 2.5, VH * 0.62, 32)
  // the stems, from the jar's bottom out through its mouth to their flowers, splayed
  const heads: Head[] = []
  const stems: TubeGeometry[] = []
  const kinds: Head['kind'][] = ['daisy', 'daisy', 'daisy', 'daisy', 'daisy', 'cosmos', 'cosmos', 'cosmos', 'lavender', 'lavender', 'lavender', 'breath', 'breath', 'breath']
  kinds.forEach((kind, i) => {
    const a = i * 2.39996 + r() * 0.4
    const out = 0.2 + r() * 0.5
    const tall = VH + 45 + r() * 70 + (kind === 'lavender' ? 25 : 0)
    const base = new Vector3(Math.cos(a) * 6, 6, Math.sin(a) * 6)
    const mouth = new Vector3(Math.cos(a) * (VR - 10), VH, Math.sin(a) * (VR - 10))
    const tip = new Vector3(Math.cos(a) * (VR * 0.6 + out * 80), tall, Math.sin(a) * (VR * 0.6 + out * 80))
    const mid = mouth.clone().lerp(tip, 0.5).add(new Vector3(0, 18, 0))
    stems.push(new TubeGeometry(new CatmullRomCurve3([base, mouth, mid, tip]), 16, kind === 'breath' ? 1.3 : 1.8, 5))
    heads.push({ kind, tip, tilt: tip.clone().sub(mid).normalize() })
  })
  // baby's breath: little clouds of white on twiggy sprays
  const breath = new SphereGeometry(1.8, 5, 4)
  const sprays = heads
    .filter((h) => h.kind === 'breath')
    .flatMap((h) => Array.from({ length: 40 }, () => h.tip.clone().add(new Vector3((r() - 0.5) * 30, (r() - 0.3) * 18, (r() - 0.5) * 30))))
  // leaves on a few stems
  const leafShape = new Shape()
  leafShape.moveTo(0, 0)
  leafShape.quadraticCurveTo(10, 14, 0, 46)
  leafShape.quadraticCurveTo(-10, 14, 0, 0)
  const leaf = new ShapeGeometry(leafShape)
  return {
    jar,
    water,
    heads,
    stems,
    breath,
    sprays,
    leaf,
    daisy: petals(14, 20, 0.5),
    cosmos: petals(8, 23, 0.35, 2.5),
    heart: new SphereGeometry(1, 12, 8),
    bud: new SphereGeometry(2.8, 6, 5),
  }
}

export function Flowers() {
  const g = useMemo(() => (made ??= build()), [])
  return (
    <group>
      {g.stems.map((s, i) => (
        <mesh key={i} geometry={s} material={STEM} castShadow />
      ))}
      {g.heads.map((h, i) => {
        // (each flower faces out along its stem)
        const look = h.tip.clone().add(h.tilt)
        if (h.kind === 'lavender')
          return (
            <group key={i} position={h.tip.toArray()}>
              {Array.from({ length: 14 }, (_, k) => (
                <mesh key={k} geometry={g.bud} material={M.lavender} position={[h.tilt.x * k * 4 + Math.sin(k * 2.1) * 2.5, h.tilt.y * k * 4, h.tilt.z * k * 4 + Math.cos(k * 2.1) * 2.5]} scale={[1, 1.3, 1]} />
              ))}
            </group>
          )
        if (h.kind === 'breath') return null
        return (
          <group key={i} position={h.tip.toArray()} ref={(o) => void o?.lookAt(look)}>
            {/* (lookAt turns +z to the stem's way: the face is drawn round +y, so turned down a quarter) */}
            <group rotation={[Math.PI / 2, 0, 0]}>
              <mesh geometry={h.kind === 'daisy' ? g.daisy : g.cosmos} material={h.kind === 'daisy' ? M.daisy : i % 2 ? M.cosmos : M.cosmosPale} castShadow />
              <mesh geometry={g.heart} material={M.heart} position={[0, 2, 0]} scale={h.kind === 'daisy' ? [7, 4, 7] : [5, 3, 5]} />
            </group>
          </group>
        )
      })}
      {g.sprays.map((p, i) => (
        <mesh key={i} geometry={g.breath} material={M.breath} position={p.toArray()} />
      ))}
      {[0, 3, 5].map((k) => {
        const h = g.heads[k]
        return <mesh key={k} geometry={g.leaf} material={M.leaf} position={[h.tip.x * 0.55, VH + 20, h.tip.z * 0.55]} rotation={[0.4, k, -0.6]} />
      })}
      <mesh geometry={g.water} material={WATER} position={[0, VH * 0.31 + 2, 0]} />
      <mesh geometry={g.jar} material={GLASS} />
    </group>
  )
}
/** where its flowers are (its frame): for the butterflies to land on */
export const flowerHeads = () => (made ??= build()).heads.filter((h) => h.kind === 'daisy' || h.kind === 'cosmos').map((h) => h.tip.clone())

// ---- the butterflies
const wingTex = (a: string, b: string, seed: number) =>
  paint(128, 128, (g) => {
    const r = rng(seed)
    const gr = g.createRadialGradient(0, 64, 4, 0, 64, 120)
    gr.addColorStop(0, b)
    gr.addColorStop(0.75, a)
    gr.addColorStop(1, '#3a2a36')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(255,255,255,0.85)'
      g.beginPath()
      g.arc(100 + r() * 20, 20 + r() * 90, 3 + r() * 2, 0, Math.PI * 2)
      g.fill()
    }
  })
const WINGS = [
  bruno({ map: wingTex('#f39a3a', '#ffd38a', 1) ?? undefined, color: '#ffffff', shade: '#a77a6e', side: DoubleSide }),
  bruno({ map: wingTex('#7fb3ee', '#d6ecff', 2) ?? undefined, color: '#ffffff', shade: '#7c8aa8', side: DoubleSide }),
]
const BODY = bruno({ color: '#3a2e30', shade: '#2a2028' })
/** a wing: a forewing and hindwing in one, reaching out along +x */
const WING = (() => {
  const s = new Shape()
  s.moveTo(0, 2)
  s.bezierCurveTo(10, 24, 30, 30, 34, 18)
  s.bezierCurveTo(36, 8, 28, 2, 22, 0)
  s.bezierCurveTo(30, -6, 30, -20, 18, -22)
  s.bezierCurveTo(8, -22, 2, -10, 0, -2)
  s.closePath()
  const g = new ShapeGeometry(s, 12)
  const uv = g.attributes.uv
  const p = g.attributes.position
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 36, (p.getY(i) + 24) / 56)
  g.rotateX(-Math.PI / 2)
  return g
})()
const ABDOMEN = new SphereGeometry(1, 8, 6)

type Fly = { p: Vector3; v: Vector3; to: Vector3; rest: number; flap: number; perch: boolean; timer: number }
/** two butterflies about the flowers; `at()` is where the jar is now (world) and `scale` the scene's */
export function Butterflies({ at, scale }: { at: () => Vector3 | null; scale: number }) {
  const heads = useMemo(flowerHeads, [])
  const flies = useMemo<Fly[]>(() => [0, 1].map((i) => ({ p: new Vector3(i ? 60 : -60, 220, 0), v: new Vector3(), to: new Vector3(), rest: 0, flap: i * 1.3, perch: false, timer: i * 2 })), [])
  const groups = useRef<(Group | null)[]>([])
  const wings = useRef<(Group | null)[]>([])
  useFrame((_, raw) => {
    const dt = Math.max(0, Math.min(0.05, raw))
    const c = at()
    if (!c) return
    flies.forEach((f, i) => {
      f.timer -= dt
      if (f.timer <= 0) {
        // now off somewhere about the flowers, now down on one
        f.perch = !f.perch && Math.random() < 0.55
        const h = heads[Math.floor(Math.random() * heads.length)]
        f.to.copy(h).add(f.perch ? new Vector3(0, 8, 0) : new Vector3((Math.random() - 0.5) * 220, 40 + Math.random() * 120, (Math.random() - 0.5) * 220))
        f.timer = f.perch ? 2.5 + Math.random() * 4 : 1.2 + Math.random() * 2
      }
      // fluttering toward it, wandering, bobbing
      const d = f.to.clone().sub(f.p)
      const near = d.length() < 6
      if (!(f.perch && near)) {
        f.v.addScaledVector(d.normalize(), 600 * dt).multiplyScalar(1 - 2.2 * dt)
        f.v.y += Math.sin(f.flap * 0.5) * 30 * dt * 20
        f.p.addScaledVector(f.v, dt)
      } else f.v.set(0, 0, 0)
      const settled = f.perch && near
      f.flap += dt * (settled ? 2.2 : 26)
      const o = groups.current[i]
      if (o) {
        o.position.set(c.x + f.p.x * scale, c.y + f.p.y * scale, c.z + f.p.z * scale)
        if (f.v.lengthSq() > 1) o.rotation.y = Math.atan2(-f.v.z, f.v.x)
        o.scale.setScalar(scale)
      }
      const w = wings.current
      const open = settled ? 0.5 + 0.5 * Math.sin(f.flap) : Math.sin(f.flap)
      if (w[i * 2]) w[i * 2]!.rotation.x = -0.15 - open * 1.1
      if (w[i * 2 + 1]) w[i * 2 + 1]!.rotation.x = 0.15 + open * 1.1
    })
  })
  return (
    <>
      {flies.map((_, i) => (
        <group key={i} ref={(o) => void (groups.current[i] = o)}>
          {/* (its body along x, its wings either side, beating) */}
          <mesh geometry={ABDOMEN} material={BODY} scale={[11, 2.2, 2.2]} />
          <group ref={(o) => void (wings.current[i * 2] = o)}>
            <mesh geometry={WING} material={WINGS[i]} rotation={[0, -Math.PI / 2, 0]} />
          </group>
          <group ref={(o) => void (wings.current[i * 2 + 1] = o)}>
            <mesh geometry={WING} material={WINGS[i]} rotation={[0, Math.PI / 2, 0]} scale={[1, 1, -1]} />
          </group>
        </group>
      ))}
    </>
  )
}
