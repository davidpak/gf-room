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
import { ClockModel, LiveClock } from './Clock'
import { CLOCK, checkClock } from './spec'

/**
 * The alarm clock on its own (gallery first): on a patch of maple desk, to pick up, turn, put back and press;
 * its verification sheet (&check) beside her photo.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const HOME = new Matrix4().makeRotationY(-0.5)

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
      <ToyLights extent={400} />
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
        <LiveClock homeAt={homeAt} spawn={[0, 200, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-140, 160, 260]
const TARGET: [number, number, number] = [0, 40, 0]

export function ClockStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the clock alone, for the sheet */
function One() {
  return (
    <>
      <ToyLights extent={200} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <ClockModel />
    </>
  )
}

export function ClockCheck() {
  const results = checkClock()
  const c = new Vector3(0, CLOCK.h / 2, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'her photo (its left side, the front to the right)', src: '/reference/alarm-clock.png' },
        { kind: 'ortho', label: 'left side, as in the photo', from: new Vector3(-1000, CLOCK.h / 2, 0), at: c, zoom: 3.4 },
        { kind: 'hero', label: 'as in the photo, a little above (drag)', position: [-230, 120, 40], target: [0, 25, 0], fov: 32 },
        { kind: 'ortho', label: 'front: the display', from: new Vector3(0, 400, 600), at: c, zoom: 3.4 },
        { kind: 'ortho', label: 'top', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 3.4 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `body     ${CLOCK.len} long × ${CLOCK.w} wide × ${CLOCK.h} tall at the back; the wedge from ${CLOCK.top.y} down to ${CLOCK.toe.y}
panel    ${CLOCK.panel.across} side to side × ${CLOCK.panel.along}, buttons ${CLOCK.buttons.d.join(' / ')} in a row across
lens     ${CLOCK.lens.w} × ${CLOCK.lens.h}, digits ${CLOCK.digits.h} tall (0.5")
(from her photo; sized by eye with David: 165 long was far too big, 115 still too big, this is 70% of that)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
