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
import { JewelryStandModel, LiveJewelryStand, LiveMirror, MirrorModel } from './Vanity'
import { MIRROR, STAND, checkMirror, checkStand } from './spec'

/**
 * Her jewellery stand and LED mirror on their own (gallery first): side by side on a patch of maple desk, as they
 * stand left back on hers; to pick up, turn, put back, and the mirror clicked on and off. The sheet (&check) beside
 * her photo.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const STAND_HOME = new Matrix4().makeRotationY(0.15).setPosition(-140, 0, -20)
const MIRROR_HOME = new Matrix4().makeRotationY(-0.12).setPosition(120, 0, 0)

function Scene() {
  const spot = useRef<Group>(null)
  const at = (m: Matrix4) => () => {
    const s = spot.current
    if (!s) return null
    s.updateWorldMatrix(true, false)
    return s.matrixWorld.clone().multiply(m)
  }
  return (
    <>
      <ToyLights extent={450} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -26, 0]}>
        <circleGeometry args={[2400, 64]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <RoundedBox args={[900, 25, 600]} radius={8} smoothness={3} position={[0, -12.5, 0]} material={maple} receiveShadow />
      <group ref={spot} />
      <World floorY={-26} timeStep={1 / 120}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[450, 12.5, 300]} position={[0, -12.5, 0]} friction={0.9} />
        </RigidBody>
        <LiveJewelryStand homeAt={at(STAND_HOME)} spawn={[-140, 120, -20]} />
        <LiveMirror homeAt={at(MIRROR_HOME)} spawn={[120, 120, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [60, 300, 620]
const TARGET: [number, number, number] = [0, 120, 0]

export function VanityStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={100} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the two alone, for the sheet */
function Both() {
  return (
    <>
      <ToyLights extent={300} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <group position={[-120, 0, 0]}>
        <JewelryStandModel />
      </group>
      <group position={[125, 0, 0]}>
        <MirrorModel />
      </group>
    </>
  )
}

export function VanityCheck() {
  const results = [...checkStand(), ...checkMirror()]
  const c = new Vector3(0, 140, 0)
  return (
    <CheckSheet
      scene={() => <Both />}
      views={[
        { kind: 'image', label: 'her photo (left back: the stand and the mirror)', src: '/reference/room-desk-wall.jpg' },
        { kind: 'hero', label: 'from her chair (drag)', position: [80, 330, 560], target: [0, 130, 0], fov: 32 },
        { kind: 'ortho', label: 'front', from: new Vector3(0, 140, 1000), at: c, zoom: 1.35 },
        { kind: 'ortho', label: 'right side', from: new Vector3(1000, 140, 0), at: c, zoom: 1.35 },
        { kind: 'hero', label: 'the chains, close', position: [-150, 180, 200], target: [-140, 150, 0], fov: 30 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `stand    ${STAND.panel.w} × ${STAND.base.d} × ${STAND.base.h + STAND.panel.h} tall, ${STAND.necklaces.length} chains on ${STAND.pegs.at.length} pegs, ${STAND.earrings.length} earrings
mirror   head ${MIRROR.head.w} × ${MIRROR.head.h} × ${MIRROR.head.t}, leaning ${MIRROR.tilt}°, foot ${MIRROR.base.w} × ${MIRROR.base.d}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
