import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CylinderGeometry, LatheGeometry, SphereGeometry, TorusGeometry, Vector2, type Mesh } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from './paint'

/**
 * Lemonade (./spec [L]), in real millimetres: a mason jar pitcher of it (clear glass, a loop handle, a steel
 * band and lid with its spout; cloudy lemonade most of the way up, lemon wheels pressed to the glass, more
 * floating with ice and a sprig of mint), two mason jar mugs of it (each its handle, its lemon wheel on the
 * rim, a striped paper straw), and lemons. A mug's lemonade stands as high as its `level` says (0..1).
 *
 * Their frames: standing on y = 0, their middles at the origin (the handles to +x).
 */
export const PITCHER = { r: 58, h: 206, neck: 46, band: 15 } // [L] Ball's 64 oz pitcher
export const MUG = { r: 40, h: 132, neck: 34 } // [L] a 16 oz mason jar mug
export const LEMON = { l: 72, w: 54 }

// ---- the looks
const GLASS = bruno({ color: '#eef4f6', shade: '#a7b6c4', transparent: true, opacity: 0.32, sheen: 0.8, depthWrite: false })
const LEMONADE = bruno({ color: '#f7e9a6', shade: '#c4a98a', transparent: true, opacity: 0.88 })
const STEEL = bruno({ color: '#b9bec6', shade: '#737b8c', sheen: 0.8 })
const ICE = bruno({ color: '#f4fbff', shade: '#b9cbd8', transparent: true, opacity: 0.6, sheen: 0.8 })
const MINT = bruno({ color: '#5fae5a', shade: '#3c6e58' })
const sliceTex = paint(128, 128, (g) => {
  g.fillStyle = '#f2d23a'
  g.beginPath()
  g.arc(64, 64, 63, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fbf6e0'
  g.beginPath()
  g.arc(64, 64, 56, 0, Math.PI * 2)
  g.fill()
  // its segments, juicy, between white membranes
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * Math.PI * 2 + 0.04
    const a1 = ((i + 1) / 9) * Math.PI * 2 - 0.04
    g.fillStyle = i % 2 ? '#f7e27a' : '#f5dc6a'
    g.beginPath()
    g.moveTo(64 + Math.cos((a0 + a1) / 2) * 6, 64 + Math.sin((a0 + a1) / 2) * 6)
    g.arc(64, 64, 51, a0, a1)
    g.closePath()
    g.fill()
  }
  g.fillStyle = '#fbf6e0'
  g.beginPath()
  g.arc(64, 64, 6, 0, Math.PI * 2)
  g.fill()
})
const SLICE = bruno({ map: sliceTex ?? undefined, color: '#ffffff', shade: '#b9a27e' })
const RIND = bruno({ color: '#f2cf34', shade: '#a48e5e' })
const lemonTex = paint(128, 64, (g) => {
  const r = rng(6)
  g.fillStyle = '#f5d43c'
  g.fillRect(0, 0, 128, 64)
  for (let i = 0; i < 700; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(220,170,30,0.35)' : 'rgba(255,240,140,0.45)'
    g.beginPath()
    g.arc(r() * 128, r() * 64, 0.8 + r() * 0.8, 0, Math.PI * 2)
    g.fill()
  }
})
const PEEL = bruno({ map: lemonTex ?? undefined, color: '#ffffff', shade: '#a99266', sheen: 0.4 })
const strawTex = paint(64, 64, (g) => {
  g.fillStyle = '#fff8f6'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#f08aa3'
  for (let i = -64; i < 64; i += 16) {
    g.beginPath()
    g.moveTo(i, 64)
    g.lineTo(i + 8, 64)
    g.lineTo(i + 72, 0)
    g.lineTo(i + 64, 0)
    g.closePath()
    g.fill()
  }
})
if (strawTex) strawTex.repeat.set(1, 6)
const STRAW = bruno({ map: strawTex ?? undefined, color: '#ffffff', shade: '#b79aa8' })

/** a mason jar's profile: its rounded foot, straight up, in at the shoulder to its neck and thread */
function jarProfile(r: number, h: number, neck: number) {
  const p: Vector2[] = [new Vector2(0, 0)]
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2)
    p.push(new Vector2(r - 8 + Math.sin(a) * 8, 8 - Math.cos(a) * 8))
  }
  p.push(new Vector2(r, h * 0.78))
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2)
    p.push(new Vector2(neck + (r - neck) * Math.cos(a), h * 0.78 + h * 0.13 * Math.sin(a)))
  }
  p.push(new Vector2(neck, h))
  return p
}
let made: ReturnType<typeof build> | null = null
function build() {
  const pitcher = new LatheGeometry(jarProfile(PITCHER.r, PITCHER.h, PITCHER.neck), 56)
  // (the lemonade in it: up to three quarters, its surface flat)
  const lq = jarProfile(PITCHER.r - 3, PITCHER.h, PITCHER.r - 3).slice(0, 7)
  lq.push(new Vector2(PITCHER.r - 3, PITCHER.h * 0.74), new Vector2(0, PITCHER.h * 0.74))
  const pitcherIn = new LatheGeometry(lq, 48)
  const mug = new LatheGeometry(jarProfile(MUG.r, MUG.h, MUG.neck), 48)
  const lemon = new SphereGeometry(1, 28, 20)
  {
    // a lemon: an egg drawn out long, fuller in its middle, a little nub at each end
    const p = lemon.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const ax = Math.abs(x)
      const nub = ax > 0.8 ? Math.pow((ax - 0.8) / 0.2, 2) * 7 : 0
      const k = 1 - 0.18 * Math.pow(ax, 3)
      p.setXYZ(i, Math.sign(x) * (ax * (LEMON.l / 2 - 6) + nub), p.getY(i) * (LEMON.w / 2) * k, p.getZ(i) * (LEMON.w / 2) * k)
    }
    lemon.computeVertexNormals()
  }
  return {
    pitcher,
    pitcherIn,
    mug,
    lemon,
    band: new CylinderGeometry(PITCHER.neck + 2, PITCHER.neck + 2, PITCHER.band, 40, 1, true),
    lid: new CylinderGeometry(PITCHER.neck + 1, PITCHER.neck + 1, 3, 40),
    spout: new CylinderGeometry(9, 12, 10, 16, 1, true),
    handle: new TorusGeometry(42, 7, 10, 24, Math.PI * 1.15),
    mugHandle: new TorusGeometry(30, 6, 10, 20, Math.PI * 1.1),
    slice: new CylinderGeometry(26, 26, 4, 32),
    smallSlice: new CylinderGeometry(22, 22, 4, 32),
    liquid: new CylinderGeometry(MUG.r - 3, MUG.r - 4, 1, 40),
    straw: new CylinderGeometry(3.2, 3.2, 200, 10, 1, true),
    leaf: new SphereGeometry(1, 10, 6),
  }
}

export function Pitcher() {
  const g = useMemo(() => (made ??= build()), [])
  const { r: R, h: H, neck: N, band: B } = PITCHER
  return (
    <group>
      {/* the lemonade, and what's in it: wheels pressed to the glass, more floating with ice and mint */}
      <mesh geometry={g.pitcherIn} material={LEMONADE} />
      {[0.4, 1.9, 3.6, 5.1].map((a, i) => (
        <mesh key={i} geometry={g.slice} material={[RIND, SLICE, SLICE]} position={[Math.cos(a) * (R - 6), 50 + i * 28, Math.sin(a) * (R - 6)]} rotation={[0, -a, Math.PI / 2 + 0.2 * (i % 2 ? 1 : -1)]} />
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={g.slice} material={[RIND, SLICE, SLICE]} position={[-18 + i * 20, H * 0.74 - 1, -10 + i * 12]} rotation={[0.25 * (i - 1), 0, 0.3]} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <RoundedBox key={i} args={[24, 22, 24]} radius={4} smoothness={2} material={ICE} position={[Math.cos(i * 1.7) * 30, H * 0.74 + 2, Math.sin(i * 1.7) * 30]} rotation={[i * 0.5, i, i * 0.3]} />
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={g.leaf} material={MINT} position={[22 + i * 6, H * 0.74 + 6 + i * 3, 16 - i * 8]} rotation={[0.4, i * 1.2, 0.3]} scale={[12, 2, 7]} />
      ))}
      {/* the glass, its handle; the steel band and lid, its spout */}
      <mesh geometry={g.pitcher} material={GLASS} />
      <mesh geometry={g.handle} material={GLASS} position={[R + 14, H * 0.5, 0]} rotation={[0, 0, -Math.PI * 0.57]} />
      <mesh geometry={g.band} material={STEEL} position={[0, H + B / 2 - 3, 0]} castShadow />
      <mesh geometry={g.lid} material={STEEL} position={[0, H + B - 2, 0]} />
      <mesh geometry={g.spout} material={STEEL} position={[-N + 6, H + B + 2, 0]} rotation={[0, 0, 0.5]} />
    </group>
  )
}

export function Mug({ level }: { level: { current: number } }) {
  const g = useMemo(() => (made ??= build()), [])
  const liquid = useRef<Mesh>(null)
  useFrame(() => {
    const m = liquid.current
    if (!m) return
    const h = Math.max(0.01, level.current) * (MUG.h * 0.72)
    m.scale.y = h
    m.position.y = 5 + h / 2
    m.visible = level.current > 0.01
  })
  const { r: R, h: H } = MUG
  return (
    <group>
      <mesh ref={liquid} geometry={g.liquid} material={LEMONADE} />
      <mesh geometry={g.mug} material={GLASS} />
      <mesh geometry={g.mugHandle} material={GLASS} position={[R + 10, H * 0.48, 0]} rotation={[0, 0, -Math.PI * 0.55]} />
      {/* its lemon wheel, slit and sat on the rim; its straw */}
      <mesh geometry={g.smallSlice} material={[RIND, SLICE, SLICE]} position={[-R + 4, H - 4, 8]} rotation={[Math.PI / 2, 0, 0.2]} castShadow />
      <mesh geometry={g.straw} material={STRAW} position={[10, H * 0.62, -8]} rotation={[0.18, 0, -0.22]} castShadow />
    </group>
  )
}

export function Lemon() {
  const g = useMemo(() => (made ??= build()), [])
  return <mesh geometry={g.lemon} material={PEEL} position={[0, LEMON.w / 2, 0]} castShadow receiveShadow />
}
