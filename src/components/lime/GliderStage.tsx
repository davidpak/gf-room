import { useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { LOOK, bruno } from '../quad/bruno'
import { Glider } from './Glider'
import { Scooter } from './Scooter'

/**
 * Lime's rentals on their own (gallery first): the LimeGlider (./Glider), the Gen4 scooter (./Scooter). The
 * LimeGlider, full size, in the Quad's evening light, parked on its kickstand on a
 * patch of brick. &steer=0.4 turns its bars, &stand=0 folds its kickstand up, &cam=x,y,z&at=x,y,z to look closely.
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
const BRICK = bruno({ color: '#c86a4c', shade: '#7a4a5a' })
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
const num = (k: string) => (q?.get(k) ? (q.get(k)!.split(',').map(Number) as [number, number, number]) : null)
const CAM = num('cam')
const AT = num('at')
const STEER = Number(q?.get('steer') ?? 0)
const STAND = Number(q?.get('stand') ?? 1)

function Scene({ which }: { which: 'glider' | 'scooter' }) {
  const background = useMemo(sky, [])
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get }) // (for screenshots from the console)
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight
        color={LOOK.light}
        intensity={LOOK.intensity}
        position={LOOK.sun.clone().multiplyScalar(3000)}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-1600}
        shadow-camera-right={1600}
        shadow-camera-top={1600}
        shadow-camera-bottom={-1600}
        shadow-camera-near={100}
        shadow-camera-far={8000}
        shadow-bias={-0.0004}
        shadow-normalBias={2}
      />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <circleGeometry args={[2600, 64]} />
      </mesh>
      <mesh material={BRICK} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2400, 1200]} />
      </mesh>
      {which === 'glider' ? (
        <group position={[-560, 0, 0]}>
          <Glider steer={STEER} stand={STAND} />
        </group>
      ) : (
        <group position={[-520, 0, 0]}>
          <Scooter steer={STEER} />
        </group>
      )}
    </>
  )
}

export function GliderStage() {
  return <LimeStage which="glider" />
}
export function ScooterStage() {
  return <LimeStage which="scooter" />
}
function LimeStage({ which }: { which: 'glider' | 'scooter' }) {
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 30000, position: CAM ?? [600, 1400, 3600] }}>
      <Scene which={which} />
      <OrbitControls makeDefault target={AT ?? [0, 450, 0]} enableDamping minDistance={200} maxDistance={8000} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  )
}
