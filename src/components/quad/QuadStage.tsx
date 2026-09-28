import { useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, Fog, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { LOOK, shared } from './bruno'
import { CherryTree } from './CherryTree'
import { Grass, Island, Petals, Walk } from './Ground'
import { Bench, LampPost } from './Furniture'
import { SET } from './set'

/**
 * The Quad, built up piece by piece (Bruno Simon's folio-2025 is the template). The first set piece
 * (./set): an island of lawn, a stretch of brick walk, a cherry in bloom, a bench under it and a lamp
 * post, in a warm spring evening. Drag to look round it, scroll to come closer.
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

function Clock() {
  useFrame(({ clock }) => void (shared.time.value = clock.elapsedTime))
  return null
}

function Scene() {
  const background = useMemo(sky, [])
  const fog = useMemo(() => new Fog(LOOK.fog, 5500, 14000), [])
  const sun = LOOK.sun.clone().multiplyScalar(3200)
  return (
    <>
      <primitive attach="background" object={background} />
      <primitive attach="fog" object={fog} />
      <Clock />
      <directionalLight
        position={sun.toArray()}
        color={LOOK.light}
        intensity={LOOK.intensity}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-1800}
        shadow-camera-right={1800}
        shadow-camera-top={1800}
        shadow-camera-bottom={-1800}
        shadow-camera-near={200}
        shadow-camera-far={7000}
        shadow-bias={-0.0004}
        shadow-normalBias={1.2}
      />
      <Island />
      <Grass />
      <Walk />
      <Petals />
      <CherryTree seed={3} position={[SET.tree[0], 0, SET.tree[1]]} rotation={0.4} />
      <Bench position={[SET.bench.x, 0, SET.bench.z]} rotation={-0.12} />
      <LampPost position={[SET.lamp.x, 0, SET.lamp.z]} />
    </>
  )
}

export function QuadStage() {
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 20, far: 30000, position: [2100, 1650, 2900] }}>
      <Scene />
      <OrbitControls target={[0, 320, 0]} enableDamping dampingFactor={0.07} minDistance={600} maxDistance={9000} maxPolarAngle={1.42} />
    </Canvas>
  )
}
