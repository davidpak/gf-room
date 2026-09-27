import { Canvas } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { ToyControls } from '../stage/ToyControls'
import { PCFShadowMap, Vector3 } from 'three'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { Stylize } from '../../lib/stylize'
import { World } from '../../lib/physics/World'
import { createMapleMaterial } from '../../lib/mapleMaterial'
import { Lamp } from '../room/Lamp'
import { LAMP, checkSpec } from './spec'

/**
 * The lamp on its own, on a patch of maple desk, and its verification sheet (&check): fixed front,
 * side and top views and a base close-up, beside the reference photos and the spec with its check.
 * One screenshot of the sheet per change.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)

function Scene({ still = false }: { still?: boolean }) {
  return (
    <>
      <ToyLights extent={500} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -26, 0]}>
        <circleGeometry args={[2400, 64]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      {/* a slab of the desk's maple top */}
      <RoundedBox args={[1500, 25, 700]} radius={8} smoothness={3} position={[-250, -12.5, 0]} material={maple} receiveShadow />
      {still ? (
        <Lamp solid={false} />
      ) : (
        <World>
          <Lamp />
        </World>
      )}
    </>
  )
}

const HERO: [number, number, number] = [-900, 700, 1100]
const TARGET: [number, number, number] = [0, 300, 60]

export function LampStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 5, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={12} />
      <ToyControls target={TARGET} minDistance={150} maxDistance={4000} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

export function LampCheck() {
  const c = new Vector3(0, 300, 60)
  const results = checkSpec()
  const L = LAMP
  return (
    <CheckSheet
      scene={() => <Scene still />}
      views={[
        { kind: 'image', label: 'reference: the arm and cap', src: '/reference/lamp-arm.webp' },
        { kind: 'ortho', label: 'side (+X): the S, the tilt', from: new Vector3(3000, 300, 60), at: c, zoom: 0.44 },
        { kind: 'ortho', label: 'front (+Z)', from: new Vector3(0, 300, 3000), at: c, zoom: 0.44 },
        { kind: 'image', label: 'reference: pole, finial, base', src: '/reference/room-desk-wall.jpg' },
        { kind: 'ortho', label: 'top: outlets, rocker, adapter', from: new Vector3(0, 3000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 1.15 },
        { kind: 'hero', label: 'angled (drag)', position: HERO, target: [0, 300, 60], fov: 32 },
        { kind: 'image', label: 'reference: one outlet', src: '/reference/lamp-outlet.png' },
        { kind: 'hero', label: 'base close-up (drag)', position: [180, 190, 260], target: [0, 20, 0], fov: 30 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `base     ⌀${2 * L.base.r}, top tier ${L.base.top} high to r ${L.base.topR}
pole     ⌀${2 * L.pole.r}, finial from ${L.pole.top}, spike top ${L.pole.top + L.finial.h}
arm      ⌀${2 * L.arm.r}, from ${L.arm.collarY}, beside the pole at ${L.arm.offset}, hook top ${L.arm.peakY}
shade    ⌀${2 * L.shade.rTop} → ⌀${2 * L.shade.rBottom} × ${L.shade.h}, ${L.shade.reach} out, tipped ${((L.shade.tilt * 180) / Math.PI).toFixed(0)}°
outlet   ${L.outlet.w} × ${L.outlet.h}, slots ${L.outlet.slot.neutral} / ${L.outlet.slot.hot} × ${L.outlet.slot.w}, ${L.outlet.slot.apart} apart
rocker   ${L.rocker.w} × ${L.rocker.d} (east-west)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
