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
import { LiveMonitor, MonitorModel } from './Monitor'
import { CHIN, DEPTH, HEIGHT, MONITOR, STAND_LEN, checkMonitor } from './spec'

/**
 * The portable monitor on its own (gallery first): on a patch of maple desk, to pick up, turn, put back and switch
 * off and on; its verification sheet (&check) beside her photo.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const HOME = new Matrix4().makeRotationY(0.25)

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
        <LiveMonitor homeAt={homeAt} spawn={[0, 60, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-260, 300, 620]
const TARGET: [number, number, number] = [0, 100, 0]

export function MonitorStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={120} maxDistance={3000} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the monitor alone, for the sheet */
function One() {
  return (
    <>
      <ToyLights extent={300} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <MonitorModel />
    </>
  )
}

export function MonitorCheck() {
  const results = checkMonitor()
  const c = new Vector3(0, HEIGHT / 2, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'her photo (left of the laptop, at night)', src: '/reference/room-desk-night.jpg' },
        { kind: 'ortho', label: 'front: the screen', from: new Vector3(0, HEIGHT / 2, 1000), at: c, zoom: 1.3 },
        { kind: 'hero', label: 'as in the photo, from her chair (drag)', position: [180, 330, 520], target: [0, 100, 0], fov: 32 },
        { kind: 'ortho', label: 'left side: the lean and the kickstand', from: new Vector3(-1000, HEIGHT / 2, 0), at: c, zoom: 1.6 },
        { kind: 'hero', label: 'from behind', position: [300, 260, -450], target: [0, 90, 0], fov: 32 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `panel    ${MONITOR.w} × ${MONITOR.h} × ${MONITOR.t}, screen ${MONITOR.screen.w} × ${MONITOR.screen.h}, chin ${CHIN.toFixed(1)}
lean     ${((MONITOR.lean * 180) / Math.PI).toFixed(0)}° back; kickstand ${MONITOR.stand.w} wide × ${STAND_LEN.toFixed(0)}, hinged ${MONITOR.stand.at} up
stands   ${MONITOR.w} wide × ${DEPTH.toFixed(0)} deep × ${HEIGHT.toFixed(0)} tall, ${MONITOR.mass} kg

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
