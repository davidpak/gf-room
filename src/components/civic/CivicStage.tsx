import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { LOOK, bruno } from '../quad/bruno'
import { Civic } from './Civic'

/**
 * David's Civic on its own (gallery first): on a round of lawn in the Quad's evening light, to turn
 * round and look at, and to open (click a door or the trunk).
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

function Scene() {
  const background = useMemo(sky, [])
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight
        color={LOOK.light}
        intensity={LOOK.intensity}
        position={LOOK.sun.clone().multiplyScalar(2000)}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-600}
        shadow-camera-right={600}
        shadow-camera-top={600}
        shadow-camera-bottom={-600}
        shadow-camera-near={100}
        shadow-camera-far={5000}
        shadow-bias={-0.0004}
        shadow-normalBias={1}
      />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 64]} />
      </mesh>
      <Civic />
    </>
  )
}

/** ?view=rear: start behind it (the trunk, the plate) */
const REAR = typeof location !== 'undefined' && new URLSearchParams(location.search).get('view') === 'rear'

export function CivicStage() {
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 20000, position: REAR ? [-260, 330, -760] : [620, 420, 780] }}>
      <Scene />
      <OrbitControls target={[0, 80, 0]} enableDamping minDistance={250} maxDistance={3000} maxPolarAngle={Math.PI / 2 - 0.08} />
    </Canvas>
  )
}
