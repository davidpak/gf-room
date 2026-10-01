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
import { LiveMints, PuckModel } from './Mints'
import { MINTS, checkMints } from './spec'

/**
 * The Ice Breakers on their own (gallery first): the puck on a patch of maple desk, to pick up, open,
 * pour out and tidy, and its verification sheet (&check): the puck from fixed angles, the spec and
 * its check.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const HOME = new Matrix4().makeRotationY(-0.35).setPosition(0, MINTS.puck.h / 2, 0) // on the slab, turned a little

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
      <ToyLights extent={300} />
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
        <LiveMints homeAt={homeAt} spawn={[0, 40, 0]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [150, 190, 230]
const TARGET: [number, number, number] = [0, 5, 0]

export function MintsStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={6} />
      <ToyControls target={TARGET} minDistance={60} maxDistance={2000} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the puck alone, shut, for the sheet */
const SHUT = { current: { one: { open: false, v: 0 }, many: { open: false, v: 0 } } }
const OPEN = { current: { one: { open: true, v: 1 }, many: { open: true, v: 1 } } }
function One({ open = false }: { open?: boolean }) {
  return (
    <>
      <ToyLights extent={120} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -MINTS.puck.h / 2, 0]}>
        <circleGeometry args={[600, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <PuckModel doors={open ? OPEN : SHUT} />
    </>
  )
}

export function MintsCheck() {
  const results = checkMints()
  const m = MINTS
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'ortho', label: 'top ("one" up, like the photo)', from: new Vector3(0, 1000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, 1), zoom: 5 },
        { kind: 'hero', label: 'angled (drag)', position: [80, 70, 90], target: [0, 0, 0], fov: 32 },
        { kind: 'hero', label: 'tabs open', position: [60, 80, -80], target: [0, 4, 0], fov: 32, scene: () => <One open /> },
        { kind: 'ortho', label: 'side', from: new Vector3(1000, 0, 0), at: new Vector3(0, 0, 0), zoom: 5 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `puck     ⌀${2 * m.puck.r} × ${m.puck.h}, rim ${m.puck.rim}
mints    ${m.count} × ⌀${m.mint.d} × ${m.mint.t}, ${m.mint.mass * 1000} g each
"one"    a notch ${m.one.hole.w} wide, from ${m.one.hole.z0} out to the rim
"many"   everything past ${m.many.hole.z0}, under a flap hinged at ${m.many.flap.z0}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
