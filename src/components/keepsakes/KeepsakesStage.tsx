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
import { CardModel, CocoaBoxModel, FrameModel, LiveCocoaBox, LiveDaughterCard, LiveFrame, LiveMickeyCard } from './Keepsakes'
import { KEEPSAKES, checkKeepsakes, frameOuter } from './spec'

/**
 * Her cards and keepsakes on their own (gallery first), stood together as on her desk: the daughter card in front
 * at the left, the Mickey card behind it to the right, the gold frame at the right, the cocoa box in front of it;
 * each to pick up, turn and put back. Their verification sheet (&check) beside her photo.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
// as in her photo (x right, z toward her chair)
const SPOTS: Record<string, [number, number, number, number]> = {
  daughter: [-110, 0, 20, 0.05],
  mickey: [-10, 0, -45, -0.1],
  frame: [130, 0, -40, -0.15],
  cocoa: [60, 0, 40, -0.1],
}
const at = (k: string) => {
  const [x, y, z, r] = SPOTS[k]
  return new Matrix4().makeRotationY(r).setPosition(x, y, z)
}
const HOMES = Object.fromEntries(Object.keys(SPOTS).map((k) => [k, at(k)]))

function Scene() {
  const spot = useRef<Group>(null)
  const home = (k: string) => () => {
    const s = spot.current
    if (!s) return null
    s.updateWorldMatrix(true, false)
    return s.matrixWorld.clone().multiply(HOMES[k])
  }
  const spawn = (k: string, lift: number): [number, number, number] => [SPOTS[k][0], lift, SPOTS[k][2]]
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
        <LiveDaughterCard homeAt={home('daughter')} spawn={spawn('daughter', 5)} />
        <LiveMickeyCard homeAt={home('mickey')} spawn={spawn('mickey', 5)} />
        <LiveFrame homeAt={home('frame')} spawn={spawn('frame', 5)} />
        <LiveCocoaBox homeAt={home('cocoa')} spawn={spawn('cocoa', 5)} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-40, 260, 560]
const TARGET: [number, number, number] = [10, 80, 0]

export function KeepsakesStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the four alone, set out as on the desk, for the sheet */
function All() {
  const place = (k: string) => {
    const [x, y, z, r] = SPOTS[k]
    return { position: [x, y, z] as [number, number, number], rotation: [0, r, 0] as [number, number, number] }
  }
  return (
    <>
      <ToyLights extent={300} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1400, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <group {...place('daughter')}>
        <CardModel which="daughter" />
      </group>
      <group {...place('mickey')}>
        <CardModel which="mickey" />
      </group>
      <group {...place('frame')}>
        <FrameModel />
      </group>
      <group {...place('cocoa')}>
        <CocoaBoxModel />
      </group>
    </>
  )
}

export function KeepsakesCheck() {
  const results = checkKeepsakes()
  const K = KEEPSAKES
  const o = frameOuter()
  const c = new Vector3(10, 90, 0)
  return (
    <CheckSheet
      scene={() => <All />}
      views={[
        { kind: 'image', label: 'her photo (the middle, at the back of the desk)', src: '/reference/room-desk-wall.jpg' },
        { kind: 'hero', label: 'from her chair (drag)', position: [-40, 260, 560], target: [10, 80, 0], fov: 32 },
        { kind: 'ortho', label: 'front', from: new Vector3(10, 90, 1000), at: c, zoom: 1.6 },
        { kind: 'hero', label: 'the cocoa box’s window, close', position: [90, 110, 240], target: [60, 50, 40], fov: 30 },
        { kind: 'ortho', label: 'top: the tents, the frame’s easel', from: new Vector3(10, 1000, 0), at: new Vector3(10, 0, 0), up: new Vector3(0, 0, -1), zoom: 1.6 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `cards    ${K.card.w.toFixed(0)} × ${K.card.h.toFixed(0)} (5 × 7 in), ${K.card.t} stock, standing ${K.card.open}° open
frame    ${o.w.toFixed(0)} × ${o.h.toFixed(0)} outside, ${K.frame.depth} deep, a 5 × 7 print in a ${K.frame.mat} mat; leaning ${K.frame.lean}° on its easel
cocoa    ${K.box.w} × ${K.box.d} × ${K.box.h}, a ${K.window.w} × ${K.window.h} window; the ball ${K.bomb.d} across
(her photo; real card, frame and carton sizes)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
