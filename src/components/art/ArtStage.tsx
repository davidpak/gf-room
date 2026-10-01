import { useMemo, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { LOOK, bruno } from '../quad/bruno'
import { BrushJar, Easel, Palette, Stool, Tube } from './Easel'
import { Throw, throwTop } from './Throw'
import { Crane, Hoop, Pencil, PencilTin, Sketchbook, Succulent, WaterCup, Watercolors } from './Supplies'
import { THROW } from './spec'
import { PaintBox } from './PaintBox'
import { PAINTS } from './spec'
import './art.css'

/**
 * The art corner on its own (gallery first): the easel with its canvas (paint on it: pick a paint and a brush
 * below, press and drag on the canvas), the stool with the palette on it, the jar of brushes; in front of it
 * the art blanket (./Throw) and what's out on it (./Supplies): the sketchbook (click its pages to turn them),
 * the pencils, the watercolours and their cup, paint tubes, the embroidery hoop, paper cranes, a succulent. Full size, in the Quad's evening light. &cam=x,y,z&at=x,y,z to look closely.
 */
function sky() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  LOOK.sky.forEach((col, i) => grad.addColorStop(i / (LOOK.sky.length - 1), col))
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 256)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const LAWN = bruno({ color: '#7fae57' })
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
const num = (k: string) => (q?.get(k) ? (q.get(k)!.split(',').map(Number) as [number, number, number]) : null)
const CAM = num('cam')
const AT = num('at')

/** a thing set down on the throw at (x, z), turned by rot */
function On({ x, z, rot = 0, children }: { x: number; z: number; rot?: number; children: ReactNode }) {
  return (
    <group position={[x, throwTop(x, z), z]} rotation={[0, rot, 0]}>
      {children}
    </group>
  )
}

function Scene() {
  const background = useMemo(sky, [])
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get }) // (for screenshots from the console)
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight color={LOOK.light} intensity={LOOK.intensity} position={LOOK.sun.clone().multiplyScalar(3000)} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-1400} shadow-camera-right={1400} shadow-camera-top={1400} shadow-camera-bottom={-1400} shadow-camera-near={100} shadow-camera-far={8000} shadow-bias={-0.0004} shadow-normalBias={2} />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2400, 64]} />
      </mesh>
      {/* the easel at the throw's far end, facing out over it; the stool by it, the palette on it; the brushes */}
      <group position={[0, 0, -THROW.l / 2 - 260]}>
        <Easel paintable />
        <group position={[560, 0, 120]} rotation={[0, -0.5, 0]}>
          <Stool />
          <group position={[0, 452, 0]} rotation={[0, 0.4, 0]}>
            <Palette />
          </group>
        </group>
        <group position={[-460, 0, 140]}>
          <BrushJar />
        </group>
      </group>
      {/* the throw, and what's out on it */}
      <Throw />
      <On x={-250} z={160} rot={0.12}>
        <Sketchbook />
      </On>
      <On x={300} z={300} rot={-0.35}>
        <PencilTin />
      </On>
      <On x={140} z={500} rot={0.5}>
        <Pencil i={0} />
      </On>
      <On x={360} z={540} rot={-0.9}>
        <Pencil i={6} len={130} />
      </On>
      <On x={230} z={-260} rot={0.25}>
        <Watercolors />
      </On>
      <On x={460} z={-420}>
        <WaterCup />
      </On>
      {[5, 9, 2].map((i, k) => (
        <On key={i} x={-60 + k * 60} z={-420 + k * 30} rot={0.4 + k * 0.7}>
          <Tube color={PAINTS[i].hex} />
        </On>
      ))}
      <On x={-360} z={-330} rot={0.3}>
        <Hoop />
      </On>
      <On x={-70} z={590} rot={0.4}>
        <Crane color="#f6c1cf" />
      </On>
      <On x={130} z={650} rot={2.2}>
        <Crane color="#a6dbb0" />
      </On>
      <On x={470} z={60} rot={-1.2}>
        <Crane color="#b9a0e2" />
      </On>
      <On x={-480} z={560}>
        <Succulent />
      </On>
    </>
  )
}

export function ArtStage() {
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 30000, position: CAM ?? [1300, 1700, 2400] }}>
        <Scene />
        <OrbitControls makeDefault target={AT ?? [0, 300, -200]} enableDamping minDistance={200} maxDistance={8000} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      <PaintBox />
    </>
  )
}
