import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { LOOK, bruno } from '../quad/bruno'
import { BrushJar, Easel, Palette, Stool, Tube } from './Easel'
import { PaintBox } from './PaintBox'
import { PAINTS } from './spec'
import './art.css'

/**
 * The art corner on its own (gallery first): the easel with its canvas (paint on it: pick a paint and a brush
 * below, press and drag on the canvas), the stool with the palette on it, the jar of brushes, tubes on the
 * grass. Full size, in the Quad's evening light. &cam=x,y,z&at=x,y,z to look closely.
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
      <Easel paintable />
      <group position={[520, 0, 260]} rotation={[0, -0.5, 0]}>
        <Stool />
        <group position={[0, 452, 0]} rotation={[0, 0.4, 0]}>
          <Palette />
        </group>
      </group>
      <group position={[-470, 0, 240]}>
        <BrushJar />
      </group>
      {[5, 9, 2].map((i, k) => (
        <group key={i} position={[-300 + k * 70, 0, 380 + k * 30]} rotation={[0, 0.4 + k * 0.7, 0]}>
          <Tube color={PAINTS[i].hex} />
        </group>
      ))}
    </>
  )
}

export function ArtStage() {
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 30000, position: CAM ?? [700, 1300, 2600] }}>
        <Scene />
        <OrbitControls makeDefault target={AT ?? [0, 900, 0]} enableDamping minDistance={200} maxDistance={8000} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      <PaintBox />
    </>
  )
}
