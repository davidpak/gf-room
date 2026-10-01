import { useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace, Vector3, type Group } from 'three'
import { LOOK, bruno } from '../quad/bruno'
import { GuitarModel } from './Guitar'
import { CaseModel } from './Case'
import { leanMatrix, playMatrix } from './pose'

/**
 * The guitar on its own (gallery first), full size, in the Quad's evening light: leaning on a cherry's
 * trunk with its case open on the grass beside it. Hold the left button and
 * sweep across its strings over the soundhole to strum; click the fingerboard to hold a string down at
 * that fret (click again to let go).
 *
 *   ?view=play   held up flat in front of you, as it is when you go in to play it in the Quad
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
const BARK = bruno({ color: '#4d3c47', shade: '#35283f' })
const VIEW = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('view') : null
const PLAY = VIEW === 'play'
/** &cam=x,y,z&at=x,y,z: a camera of your own (for looking closely) */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
const num = (k: string) => (q?.get(k) ? (q.get(k)!.split(',').map(Number) as [number, number, number]) : null)
const CAM = num('cam')
const AT = num('at')
const TRUNK = { x: 0, z: 0, r: 190 }

function Scene() {
  const background = useMemo(sky, [])
  const guitar = useRef<Group>(null)
  const pose = useMemo(() => (PLAY ? playMatrix(new Vector3(0, 700, 400), 1, 0) : leanMatrix(TRUNK, 0, 1, 0.12)), [])
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
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2400, 64]} />
      </mesh>
      {/* a cherry's trunk to lean it on */}
      <mesh material={BARK} position={[TRUNK.x, 900, TRUNK.z]} castShadow receiveShadow>
        <cylinderGeometry args={[TRUNK.r * 0.92, TRUNK.r * 1.08, 1800, 32]} />
      </mesh>
      <group ref={guitar} matrix={pose} matrixAutoUpdate={false}>
        <GuitarModel />
      </group>
      {/* its case, open on the grass */}
      <group position={[-820, 0, 420]} rotation={[0, 0.5, 0]}>
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 540]}>
          <CaseModel />
        </group>
      </group>
    </>
  )
}

export function GuitarStage() {
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 30000, position: CAM ?? (PLAY ? [0, 820, 2600] : [900, 1100, 2600]) }}>
      <Scene />
      <OrbitControls makeDefault target={AT ?? (PLAY ? [0, 700, 400] : [-150, 420, 200])} enableDamping minDistance={300} maxDistance={6000} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  )
}
