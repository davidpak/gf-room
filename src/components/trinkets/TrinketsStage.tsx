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
import { HairTieModel, LanyardModel, LiveHairTie, LiveLanyard, LiveLotion, LiveVaseline, LiveWatch, LotionModel, VaselineModel, WatchModel, lanyardSize } from './Trinkets'
import { HAIRTIE, LOTION, LOTION_H, VASELINE, WATCH, checkTrinkets } from './spec'

/**
 * Her little things on their own (gallery first), on a patch of maple desk: the lotion at the back left, the
 * Vaseline, the hair tie, the watch, the lanyard in front; each to pick up, turn and put back, the lotion's pump to
 * press. The sheet (&check) beside her photo.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
type Home = { m: Matrix4; spawn: [number, number, number] }
const home = (x: number, z: number, yaw: number): Home => ({ m: new Matrix4().makeRotationY(yaw).setPosition(x, 0, z), spawn: [x, 60, z] })
const HOMES = {
  lotion: home(-230, -120, 0.3),
  vaseline: home(-130, -110, -0.4),
  hairtie: home(-200, 60, 0),
  watch: home(-50, -90, 0.9),
  lanyard: home(150, 40, 0.2),
}

function Scene() {
  const spot = useRef<Group>(null)
  const at = (h: Home) => () => {
    const s = spot.current
    if (!s) return null
    s.updateWorldMatrix(true, false)
    return s.matrixWorld.clone().multiply(h.m)
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
        <LiveLotion homeAt={at(HOMES.lotion)} spawn={HOMES.lotion.spawn} />
        <LiveVaseline homeAt={at(HOMES.vaseline)} spawn={HOMES.vaseline.spawn} />
        <LiveHairTie homeAt={at(HOMES.hairtie)} spawn={HOMES.hairtie.spawn} />
        <LiveWatch homeAt={at(HOMES.watch)} spawn={HOMES.watch.spawn} />
        <LiveLanyard homeAt={at(HOMES.lanyard)} spawn={HOMES.lanyard.spawn} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-40, 420, 560]
const TARGET: [number, number, number] = [-20, 30, -10]

export function TrinketsStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={60} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** all five laid out, for the sheet */
function All() {
  return (
    <>
      <ToyLights extent={350} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <group position={[-230, 0, -60]}>
        <LotionModel />
      </group>
      <group position={[-150, 0, -60]}>
        <VaselineModel />
      </group>
      <group position={[-150, 0, 40]}>
        <HairTieModel />
      </group>
      <group position={[-60, 0, -40]} rotation={[0, 0.6, 0]}>
        <WatchModel />
      </group>
      <group position={[130, 0, 0]}>
        <LanyardModel />
      </group>
    </>
  )
}

export function TrinketsCheck() {
  const results = checkTrinkets()
  const ly = lanyardSize()
  return (
    <CheckSheet
      scene={() => <All />}
      views={[
        { kind: 'image', label: 'her photo (day: the lanyard, watch, hair tie front right; the lotion far left)', src: '/reference/room-desk-wall.jpg' },
        { kind: 'image', label: 'her photo (night: the lotion by the lamp, the Vaseline and the watch by the pen cup)', src: '/reference/room-desk-night.jpg' },
        { kind: 'hero', label: 'all five (drag)', position: [-40, 380, 480], target: [-30, 20, -10], fov: 34 },
        { kind: 'ortho', label: 'front', from: new Vector3(0, 80, 1000), at: new Vector3(0, 80, 0), zoom: 1.6 },
        { kind: 'hero', label: 'the small ones, close', position: [-150, 140, 200], target: [-130, 20, -30], fov: 34 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `lotion    ${2 * LOTION.body.r} × ${LOTION_H} tall, the pump presses ${LOTION.travel}
Vaseline  ${2 * VASELINE.r} × ${VASELINE.body + VASELINE.lid}
hair tie  ${(2 * (HAIRTIE.R + HAIRTIE.r)).toFixed(0)} across
watch     case ${WATCH.case.h} × ${WATCH.case.w} × ${WATCH.case.t}, band ${WATCH.band.w} wide
lanyard   lies ${ly.w.toFixed(0)} × ${ly.d.toFixed(0)}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
