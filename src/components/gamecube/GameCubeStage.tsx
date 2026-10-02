import { useEffect, useMemo, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { LOOK, bruno } from '../quad/bruno'
import { Cable, DiscFlight } from './Cable'
import { Case } from './Case'
import { Controller } from './Controller'
import { Crt } from './Crt'
import { Bench, Cushion, Rug } from './Furniture'
import { GameCube } from './GameCube'
import { CABLES, LAYOUT } from './Setup'
import { BENCH, RUG } from './spec'
import { padButton } from './state'

/**
 * The GameCube setup on its own (gallery first), full size in the Quad's evening light: the CRT on its bench, the
 * console with Melee in it, the two controllers, the case, the cushions, on the rug. Click POWER (the light grey
 * button, back left on top), OPEN (front right) and RESET; the lid to shut it; the disc to take it out to its case
 * (and back); the TV's own power switch; START, A and B on either controller (or Enter, Backspace). &cam=x,y,z&at=x,y,z
 * to look closely.
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

function At({ x, y = RUG.t, z, rot = 0, children }: { x: number; y?: number; z: number; rot?: number; children: ReactNode }) {
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
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
      <Rug />
      <At {...LAYOUT.bench}>
        <Bench />
      </At>
      <At {...LAYOUT.tv} y={RUG.t + BENCH.h}>
        <Crt />
      </At>
      <At {...LAYOUT.cube}>
        <GameCube />
      </At>
      {LAYOUT.pads.map((p, i) => (
        <At key={i} x={p.x} z={p.z} rot={p.rot}>
          <Controller color={p.color} pad={i + 1} />
        </At>
      ))}
      <At {...LAYOUT.case}>
        <Case />
      </At>
      {LAYOUT.cushions.map((c, i) => (
        <At key={i} x={c.x} z={c.z} rot={c.rot}>
          <Cushion color={c.color} />
        </At>
      ))}
      {CABLES.map((c) => (
        <Cable key={c.from} {...c} radius={2.2} ground={RUG.t} />
      ))}
      <DiscFlight />
    </>
  )
}

export function GameCubeStage() {
  // (the keyboard as player one's controller: Enter START, Backspace B)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') padButton('start', 1)
      else if (e.key === 'Backspace') padButton('b', 1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 30000, position: CAM ?? [900, 1300, 2300] }}>
      <Scene />
      <OrbitControls makeDefault target={AT ?? [0, 250, -100]} enableDamping minDistance={150} maxDistance={8000} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  )
}
