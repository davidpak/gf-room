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
import { LivePenCup, PenCupModel } from './PenCup'
import { PENCUP, checkPenCup } from './spec'

/**
 * The pen cup on its own (gallery first): on a patch of maple desk, to pick up, turn, put back and take a pen up
 * out of; its verification sheet (&check) beside her photo.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const HOME = new Matrix4().makeRotationY(-0.3)

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
        <LivePenCup homeAt={homeAt} spawn={[0, 20, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-120, 230, 330]
const TARGET: [number, number, number] = [0, 75, 0]

export function PenCupStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the cup alone, for the sheet */
function One() {
  return (
    <>
      <ToyLights extent={200} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <PenCupModel />
    </>
  )
}

export function PenCupCheck() {
  const results = checkPenCup()
  const C = PENCUP.cup
  const c = new Vector3(0, 80, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'her photo (by the lamp: the red cup)', src: '/reference/room-desk-night.jpg' },
        { kind: 'ortho', label: 'front', from: new Vector3(0, 80, 1000), at: c, zoom: 2.2 },
        { kind: 'hero', label: 'as in her photo, a little above (drag)', position: [60, 200, 330], target: [0, 70, 0], fov: 32 },
        { kind: 'ortho', label: 'left side', from: new Vector3(-1000, 80, 0), at: c, zoom: 2.2 },
        { kind: 'ortho', label: 'top', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 2.6 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `cup      ${2 * C.rTop} across at the rim (${2 * C.rFoot} at the foot) × ${C.h} tall, ${C.ribs.n} flutes, wall ${C.wall}, floor ${C.floor}
in it    3 gel pens (${PENCUP.pen.len}), 3 highlighters (${PENCUP.highlighter.len}), a pencil (${PENCUP.pencil.len}),
         each leaning from its foot on the floor to rest on the rim; her eyelash curler hung on the front rim
mass     ${PENCUP.mass} kg

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
