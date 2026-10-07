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
import { LiveSoundMachine, SoundMachineModel } from './SoundMachine'
import { SOUNDMACHINE, checkSoundMachine } from './spec'

/**
 * The sound machine on its own (gallery first): on a patch of maple desk, to pick up, turn, put back and switch
 * on; its verification sheet (&check) beside her photo.
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
        <LiveSoundMachine homeAt={homeAt} spawn={[0, 20, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-110, 190, 330]
const TARGET: [number, number, number] = [0, 40, 0]

export function SoundMachineStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the sound machine alone, for the sheet */
function One() {
  return (
    <>
      <ToyLights extent={200} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <SoundMachineModel />
    </>
  )
}

export function SoundMachineCheck() {
  const results = checkSoundMachine()
  const S = SOUNDMACHINE
  const c = new Vector3(0, S.h / 2, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'her photo (right: behind the mints, by the lamp)', src: '/reference/room-desk-wall.jpg' },
        { kind: 'ortho', label: 'front: the switches', from: new Vector3(0, S.h / 2, 1000), at: c, zoom: 2.4 },
        { kind: 'hero', label: 'from a chair, a little above (drag)', position: [120, 180, 300], target: [0, 35, 0], fov: 32 },
        { kind: 'ortho', label: 'left side', from: new Vector3(-1000, S.h / 2, 0), at: c, zoom: 2.4 },
        { kind: 'ortho', label: 'top', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 2.4 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `drum     ${(2 * S.r).toFixed(0)} across × ${S.h.toFixed(0)} tall (a Yogasleep Dohm: 5.5" × 3.5")
body     ${S.body.h} tall; collar ${S.collar.h}, ${S.vents.n} openings ${S.vents.w} × ${S.vents.h}; dome ${S.cap.rise}
switches two rockers ${S.switches.w} × ${S.switches.h} low on the front
mass     ${S.mass} kg

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
