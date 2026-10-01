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
import { LiveTissues, TissueBox } from './Tissues'
import { TISSUES, checkTissues } from './spec'

/**
 * The Kleenex on its own (gallery first): the cube on a patch of maple desk, to pick up, turn, put
 * back and pull tissues from, and its verification sheet (&check).
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const B = TISSUES.box
const HOME = new Matrix4().makeRotationY(-0.3).setPosition(0, B.h / 2, 0)

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
        <LiveTissues homeAt={homeAt} spawn={[0, 200, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [260, 330, 420]
const TARGET: [number, number, number] = [0, 80, 0]

export function TissuesStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the box alone, for the sheet */
function One() {
  return (
    <>
      <ToyLights extent={200} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -B.h / 2, 0]}>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <TissueBox />
    </>
  )
}

export function TissuesCheck() {
  const results = checkTissues()
  const t = TISSUES
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'hero', label: 'angled (drag)', position: [230, 200, 300], target: [0, 20, 0], fov: 32 },
        { kind: 'ortho', label: 'top', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 2.4 },
        { kind: 'ortho', label: 'front (the tag side)', from: new Vector3(0, 0, 1000), at: new Vector3(0, 20, 0), zoom: 2 },
        { kind: 'ortho', label: 'side', from: new Vector3(1000, 0, 0), at: new Vector3(0, 20, 0), zoom: 2 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `box      ${t.box.w.toFixed(1)} × ${t.box.d.toFixed(1)} × ${t.box.h.toFixed(1)} (4 1/2 × 4 3/8 × 5 in), ${t.mass * 1000} g
opening  ${2 * t.hole.a} × ${2 * t.hole.b} oval, in a ${2 * t.oval.a} × ${2 * t.oval.b} printed one
tissue   stands ${t.pop.h} up, ${t.pop.w} across, pinched to ${t.pop.pinch} (a ${t.sheet.size.toFixed(0)} sheet)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
