import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { PCFShadowMap, Quaternion, Vector3, type Group } from 'three'
import { ToyControls } from '../stage/ToyControls'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { Stylize } from '../../lib/stylize'
import { World } from '../../lib/physics/World'
import { createMapleMaterial } from '../../lib/mapleMaterial'
import { Lamp } from '../room/Lamp'
import { LiveWumpus, WumpusModel } from './Wumpus'
import { ClawClip } from '../clip/ClawClip'
import { CLIP, checkClip } from '../clip/spec'
import { WUMPUS, checkWumpus, perch } from './spec'

/**
 * The Wumpus on its own (gallery first): on its perch in the lamp's arm, over a patch of maple desk
 * to drop it on, and its verification sheet (&check): the photo beside fixed views of the model and
 * of the perch, the spec and its check.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const PERCH = perch()

function Scene() {
  const lamp = useRef<Group>(null)
  const perchAt = () => {
    const l = lamp.current
    if (!l) return null
    l.updateWorldMatrix(true, false)
    return l.matrixWorld.clone().multiply(PERCH)
  }
  return (
    <>
      <ToyLights extent={500} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -26, 0]}>
        <circleGeometry args={[2400, 64]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <RoundedBox args={[1100, 25, 700]} radius={8} smoothness={3} position={[150, -12.5, 0]} material={maple} receiveShadow />
      <World floorY={-26}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[550, 12.5, 350]} position={[150, -12.5, 0]} friction={0.9} />
        </RigidBody>
        <group ref={lamp}>
          <Lamp />
          <ClawClip />
        </group>
        <LiveWumpus perchAt={perchAt} spawn={[200, 60, 100]} />
      </World>
    </>
  )
}

/** just the model, for the sheet's fixed views */
function ModelScene() {
  return (
    <>
      <ToyLights extent={120} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -HEAD_B, 0]}>
        <circleGeometry args={[600, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <WumpusModel />
    </>
  )
}
const HEAD_B = WUMPUS.head.h / 2

/** the lamp with the model on its perch, still (the sheet's views don't run physics) */
function PerchScene() {
  const p = new Vector3()
  const q = new Quaternion()
  PERCH.decompose(p, q, new Vector3())
  return (
    <>
      <ToyLights extent={500} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -26, 0]}>
        <circleGeometry args={[2400, 64]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <RoundedBox args={[1100, 25, 700]} radius={8} smoothness={3} position={[150, -12.5, 0]} material={maple} receiveShadow />
      <Lamp solid={false} />
      <ClawClip solid={false} />
      <group position={p} quaternion={q}>
        <WumpusModel />
      </group>
    </>
  )
}

const HERO: [number, number, number] = [1250, 720, 900]
const TARGET: [number, number, number] = [120, 270, 60]

export function WumpusStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 5, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={10} />
      <ToyControls target={TARGET} minDistance={120} maxDistance={3000} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

export function WumpusCheck() {
  const results = [...checkWumpus(), ...checkClip().map((r) => ({ ...r, what: `clip: ${r.what}` }))]
  const W = WUMPUS
  const o = new Vector3(0, 4, 0)
  const at = new Vector3().setFromMatrixPosition(PERCH)
  return (
    <CheckSheet
      scene={() => <Scene />}
      views={[
        { kind: 'image', label: 'reference: in its bag (face on)', src: '/reference/wumpus.webp' },
        { kind: 'ortho', label: 'front', from: new Vector3(0, 4, 1000), at: o, zoom: 3.7, scene: () => <ModelScene /> },
        { kind: 'ortho', label: 'side (right)', from: new Vector3(1000, 4, 0), at: o, zoom: 3.7, scene: () => <ModelScene /> },
        { kind: 'image', label: 'reference: on the claw clip', src: '/reference/claw-clip.png' },
        { kind: 'ortho', label: 'perch, side on (+X, like the photo)', from: at.clone().add(new Vector3(2000, 0, 0)), at: at.clone().add(new Vector3(0, 10, 30)), zoom: 1.6, scene: () => <PerchScene /> },
        { kind: 'hero', label: 'angled (drag)', position: [95, 60, 130], target: [0, 2, 0], fov: 30, scene: () => <ModelScene /> },
        { kind: 'ortho', label: 'top', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 3.7, scene: () => <ModelScene /> },
        { kind: 'hero', label: 'on its perch (drag)', position: [520, 560, 330], target: [40, 430, 20], fov: 32, scene: () => <PerchScene /> },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `overall  ${W.size.w} × ${W.size.h} × ${W.size.d} (store)
head     ${W.head.w} × ${W.head.h} × ${W.head.d}, n ${W.head.n} (${W.head.nBottom} under)
muzzle   ${W.muzzle.w} × ${W.muzzle.h}, ${W.muzzle.out} proud, ${-W.muzzle.y} low
eyes     ⌀${W.eye.d}, ${W.eye.apart} apart, ${W.eye.y} up
nostrils ${W.nostril.w} × ${W.nostril.h}, ${W.nostril.apart} apart
ears     ${W.ear.h} tall, ${W.ear.out} out
perch    on the clip, back to the pole, ${at.y.toFixed(0)} up
clip     ${CLIP.length} × ${CLIP.depth}, on the pole at ${CLIP.y - CLIP.length / 2}–${CLIP.y + CLIP.length / 2}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
