import { useRef } from 'react'
import { Canvas } from '../../lib/render/Canvas'
import { RoundedBox } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Matrix4, PCFShadowMap, Vector3, type Group } from 'three'
import { ToyControls } from '../stage/ToyControls'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { Stylize } from '../../lib/stylize'
import { World } from '../../lib/physics/World'
import { createMapleMaterial } from '../../lib/mapleMaterial'
import { LAPTOP_BOTTOM, LaptopModel, LiveLaptop } from './Laptop'
import { LAPTOP, checkLaptop } from './spec'

/**
 * Rina's MacBook on its own (gallery first): on a patch of maple desk, to open and shut, pick up and
 * put back, and its verification sheet (&check).
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const HOME = new Matrix4().makeRotationY(0.15).setPosition(0, LAPTOP_BOTTOM, 0)

function Scene() {
  const spot = useRef<Group>(null)
  const homeAt = () => {
    const s = spot.current
    if (!s) return null
    s.updateWorldMatrix(true, false)
    return s.matrixWorld.clone().multiply(HOME)
  }
  return (
    <>
      <ToyLights extent={500} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -26, 0]}>
        <circleGeometry args={[2400, 64]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <RoundedBox args={[1200, 25, 800]} radius={8} smoothness={3} position={[0, -12.5, 0]} material={maple} receiveShadow />
      <group ref={spot} />
      <World floorY={-26} timeStep={1 / 120}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[600, 12.5, 400]} position={[0, -12.5, 0]} friction={0.9} />
        </RigidBody>
        <LiveLaptop homeAt={homeAt} spawn={[0, 200, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [60, 380, 560]
const TARGET: [number, number, number] = [0, 60, 0]

export function LaptopStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={10} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={3000} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

const OPEN = { current: LAPTOP.lid.open }
const SHUT = { current: 0 }
function One({ shut = false }: { shut?: boolean }) {
  return (
    <>
      <ToyLights extent={260} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -LAPTOP_BOTTOM, 0]}>
        <circleGeometry args={[1200, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <LaptopModel angle={shut ? SHUT : OPEN} />
    </>
  )
}

export function LaptopCheck() {
  const results = checkLaptop()
  const l = LAPTOP
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'hero', label: 'open (drag)', position: [120, 300, 420], target: [0, 60, 0], fov: 32 },
        { kind: 'hero', label: 'the case, from behind', position: [-150, 260, -430], target: [0, 70, -60], fov: 32 },
        { kind: 'ortho', label: 'the keyboard, from above', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 2.2, scene: () => <One /> },
        { kind: 'hero', label: 'shut', position: [260, 200, 300], target: [0, 0, 0], fov: 32, scene: () => <One shut /> },
        { kind: 'ortho', label: 'side (open)', from: new Vector3(1000, 0, 0), at: new Vector3(0, 60, -40), zoom: 1.6 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `MacBook Pro 13" (M1 2020 / M2 2022), Space Gray, in a heart case
base     ${l.base.w} × ${l.base.d} × ${l.base.t}, lid ${l.lid.t} (+ the case's ${l.case.t})
display  ${l.display.w} × ${l.display.h} (${l.display.px.join(' × ')})
keys     ${l.keys.pitch} pitch, ${l.keys.cap} caps; trackpad ${l.trackpad.w} × ${l.trackpad.d}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
