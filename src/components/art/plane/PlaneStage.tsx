import { useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { Canvas } from '../../../lib/render/Canvas'
import { World } from '../../../lib/physics/World'
import { LOOK, bruno } from '../../quad/bruno'
import { Throw } from '../Throw'
import { PAPER_COLORS } from '../spec'
import { PaperSheet } from './PaperSheet'
import '../art.css'

/**
 * Paper airplanes on their own (gallery first): four sheets of Letter stacked on the art blanket, each a thing like
 * any other (./PaperSheet): carry it, turn it, fold it into a dart (hover it for its folds, click one), let go of it
 * moving to throw it. "Put them back" lays all four out fresh.
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
/** the blanket's top, about (the world's floor, so what lands on it lies on it) */
const FLOOR = 9

function Scene({ round }: { round: number }) {
  const background = useMemo(sky, [])
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get }) // (for screenshots from the console)
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight color={LOOK.light} intensity={LOOK.intensity} position={LOOK.sun.clone().multiplyScalar(3000)} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-2000} shadow-camera-right={2000} shadow-camera-top={2000} shadow-camera-bottom={-2000} shadow-camera-near={100} shadow-camera-far={8000} shadow-bias={-0.0004} shadow-normalBias={2} />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[60000, 64]} />
      </mesh>
      <Throw />
      <World floorY={FLOOR}>
        {PAPER_COLORS.map((c, i) => (
          <PaperSheet key={i} reset={round} at={[-60 + i * 4, FLOOR + 2 + i * 3, 60 - i * 3]} rot={Math.sin(i * 2.1) * 0.08} color={c} />
        ))}
      </World>
    </>
  )
}

export function PlaneStage() {
  const [round, setRound] = useState(0)
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 32, near: 10, far: 120000, position: [-60, 1100, 1300] }}>
        <Scene round={round} />
        <OrbitControls makeDefault target={[-60, 0, 60]} enableDamping minDistance={150} maxDistance={20000} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      <div className="paintbox on" style={{ flexDirection: 'row', gap: 12 }}>
        <span>hover a sheet for its folds · click one to fold · left-drag to carry, let go moving to throw</span>
        <button className="paintbox-btn" onClick={() => setRound((r) => r + 1)}>
          put them back
        </button>
      </div>
    </>
  )
}
