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
import { LiveTreeMug, LiveTumbler, TreeMugModel, TumblerModel } from './Mugs'
import { TREE_MUG, TUMBLER, checkMugs } from './spec'

/**
 * Her tree mug and copper tumbler on their own (gallery first): on a patch of maple desk, to pick up, turn and put
 * back; their verification sheet (&check) beside her photos.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const MUG_AT: [number, number, number] = [-70, 0, 0]
const TUMBLER_AT: [number, number, number] = [75, 0, -10]
const MUG_HOME = new Matrix4().makeRotationY(0.5)
const TUMBLER_HOME = new Matrix4()

function Scene() {
  const mugSpot = useRef<Group>(null)
  const tumblerSpot = useRef<Group>(null)
  const at = (spot: { current: Group | null }, home: Matrix4) => () => {
    const s = spot.current
    if (!s) return null
    s.updateWorldMatrix(true, false)
    return s.matrixWorld.clone().multiply(home)
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
      <group ref={mugSpot} position={MUG_AT} />
      <group ref={tumblerSpot} position={TUMBLER_AT} />
      <World floorY={-26} timeStep={1 / 120}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[600, 12.5, 400]} position={[0, -12.5, 0]} friction={0.9} />
        </RigidBody>
        <LiveTreeMug homeAt={at(mugSpot, MUG_HOME)} spawn={[MUG_AT[0], 160, MUG_AT[2]]} />
        <LiveTumbler homeAt={at(tumblerSpot, TUMBLER_HOME)} spawn={[TUMBLER_AT[0], 200, TUMBLER_AT[2]]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-60, 260, 420]
const TARGET: [number, number, number] = [0, 70, 0]

export function MugsStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the two alone, for the sheet: the mug at -x (its tree to the front), the tumbler at +x */
function Both() {
  return (
    <>
      <ToyLights extent={250} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <group position={[-65, 0, 0]}>
        <TreeMugModel />
      </group>
      <group position={[70, 0, 0]}>
        <TumblerModel />
      </group>
    </>
  )
}

export function MugsCheck() {
  const results = checkMugs()
  const c = new Vector3(0, 80, 0)
  return (
    <CheckSheet
      scene={() => <Both />}
      views={[
        { kind: 'image', label: 'her photo: the tree mug, bottom left', src: '/reference/room-desk-poster.jpg' },
        { kind: 'image', label: 'her photo: the copper tumbler, right', src: '/reference/room-desk-night.jpg' },
        { kind: 'hero', label: 'from above and in front, as in her photo (drag)', position: [-160, 330, 520], target: [0, 70, 0], fov: 32 },
        { kind: 'ortho', label: 'front: the tree', from: new Vector3(0, 80, 1000), at: c, zoom: 2.2 },
        { kind: 'ortho', label: 'top: the cocoa, the tumbler’s mouth', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 2.2 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `mug      ${2 * TREE_MUG.rBase} at the foot to ${2 * TREE_MUG.rRim} at the rim × ${TREE_MUG.h}; walls ${TREE_MUG.wall}; handle out ${TREE_MUG.handle.reach + TREE_MUG.handle.r}, ${TREE_MUG.handle.bottom}–${TREE_MUG.handle.top} up
tumbler  ${2 * TUMBLER.rBase} at the base to ${2 * TUMBLER.rTop} at the mouth × ${TUMBLER.h}; steel band ${TUMBLER.band}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
