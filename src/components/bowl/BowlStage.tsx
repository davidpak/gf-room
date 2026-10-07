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
import { BowlModel, LiveBowl } from './Bowl'
import { BOWL, checkBowl } from './spec'

/**
 * Her bowl and chopsticks on their own (gallery first): on a patch of maple desk, to pick up, turn and put back;
 * the verification sheet (&check) beside her photo.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const HOME = new Matrix4()

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
        <LiveBowl homeAt={homeAt} spawn={[0, 120, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-40, 300, 330]
const TARGET: [number, number, number] = [0, 30, 0]

export function BowlStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the bowl alone, for the sheet */
function One({ sticks = true }: { sticks?: boolean }) {
  return (
    <>
      <ToyLights extent={200} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <BowlModel sticks={sticks} />
    </>
  )
}

export function BowlCheck() {
  const results = checkBowl()
  const c = new Vector3(0, BOWL.h / 2, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'her photo: the bowl, front right', src: '/reference/room-desk-night.jpg' },
        { kind: 'hero', label: 'from above and in front, as in her photo (drag)', position: [60, 300, 260], target: [0, 30, 0], fov: 32 },
        { kind: 'ortho', label: 'side: the belly, the foot, the lattice', from: new Vector3(0, BOWL.h / 2, 1000), at: c, zoom: 3 },
        { kind: 'ortho', label: 'top: the pinwheels inside', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 3, scene: () => <One sticks={false} /> },
        { kind: 'hero', label: 'from below: the foot ring', position: [0, -160, 200], target: [0, 20, 0], fov: 32 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `bowl        ${2 * BOWL.r} across × ${BOWL.h}; walls ${BOWL.wall}; foot ring ${2 * BOWL.foot.rOut} across
chopsticks  ${BOWL.chop.len} long, ${2 * BOWL.chop.butt} square to ${2 * BOWL.chop.tip}, across the rim

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
