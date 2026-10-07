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
import { CandleLidModel, CandleModel, LiveCandle, LiveCandleLid } from './Candle'
import { CANDLE, checkCandle } from './spec'

/**
 * The holiday candle on its own (gallery first): lit, on a patch of maple desk, its lid beside it; to pick up, put
 * back, blow out and light again; its verification sheet (&check) beside her photo.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const HOME = new Matrix4().makeRotationY(-0.3)
const LID = new Matrix4().makeTranslation(-95, 0, 25)

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
        <LiveCandle homeAt={at(HOME)} spawn={[0, 150, 0]} />
        <LiveCandleLid homeAt={at(LID)} spawn={[-95, 60, 25]} />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-60, 190, 300]
const TARGET: [number, number, number] = [-20, 55, 0]

export function CandleStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 2, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <ToyControls target={TARGET} minDistance={80} maxDistance={2500} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

/** the candle and its lid alone, for the sheet */
function One() {
  return (
    <>
      <ToyLights extent={200} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <CandleModel />
      <group position={[-95, 0, 25]}>
        <CandleLidModel />
      </group>
    </>
  )
}

export function CandleCheck() {
  const results = checkCandle()
  const J = CANDLE.jar
  const c = new Vector3(0, J.h / 2, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'her photo (night, right of the pen cup)', src: '/reference/room-desk-night.jpg' },
        { kind: 'ortho', label: 'front: the label, the bow front-right', from: new Vector3(0, J.h / 2, 1000), at: c, zoom: 3 },
        { kind: 'hero', label: 'from her chair, a little above (drag)', position: [60, 200, 260], target: [-20, 55, 0], fov: 32 },
        { kind: 'ortho', label: 'right side: the bow and its tails', from: new Vector3(1000, J.h / 2, 0), at: c, zoom: 3 },
        { kind: 'ortho', label: 'top: the wax, the wick, the flame', from: new Vector3(0, 1000, 0), at: new Vector3(-40, 0, 10), up: new Vector3(0, 0, -1), zoom: 2.2 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `jar      ${J.d} across × ${J.h} tall, red glass, ${J.wall} thick, the wax ${J.h - CANDLE.wax.y} down
label    ${CANDLE.label.w} × ${CANDLE.label.h} on its front, a gold rule round it
ribbon   ${CANDLE.ribbon.w} wide, round the top at y ${CANDLE.ribbon.y}; the bow ${CANDLE.ribbon.bowW} across, tails ${CANDLE.ribbon.tail} down
flame    ${CANDLE.flame.h} tall; its light ${CANDLE.light.intensity} (decay ${CANDLE.light.decay}), flickering ±${CANDLE.flicker.amp * 100}%
lid      ${CANDLE.lid.d} across × ${CANDLE.lid.h}, beside it
(her photo; an 8-10 oz jar candle's sizes)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
