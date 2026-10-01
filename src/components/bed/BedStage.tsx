import { Canvas } from '../../lib/render/Canvas'
import { ToyControls } from '../stage/ToyControls'
import { PCFShadowMap, Vector3 } from 'three'
import { CheckSheet } from '../check/CheckSheet'
import { DUSK, Effects, StageLights } from '../stage/StageLights'
import { Bed } from './Bed'
import { World } from '../../lib/physics/World'
import { BED, UNIT } from './spec'

function Scene() {
  return (
    <>
      <StageLights extent={1300} mapSize={4096} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3400, 96]} />
        <meshStandardMaterial color={DUSK.floor} roughness={1} />
      </mesh>
      <World>
        <Bed />
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-1500, 1500, 2900]
const TARGET: [number, number, number] = [-200, 300, 0]

/** Full-screen interactive bed. World units: mm. */
export function BedStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 10, far: 30000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={40} />
      <ToyControls target={TARGET} enablePan={false} minDistance={600} maxDistance={7000} maxPolarAngle={Math.PI / 2.05} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

export function BedCheck() {
  const c = new Vector3(0, 330, 0)
  return (
    <CheckSheet
      scene={() => <Scene />}
      views={[
        { kind: 'image', label: 'reference: blanket, pillows', src: '/reference/bed-blanket.webp' },
        { kind: 'hero', label: 'hero (drag)', position: HERO, target: TARGET, fov: 32 },
        { kind: 'ortho', label: 'room side (drawers)', from: new Vector3(0, 330, 5000), at: c, zoom: 0.21 },
        { kind: 'ortho', label: 'foot end', from: new Vector3(-5000, 330, 0), at: c, zoom: 0.21 },
        { kind: 'ortho', label: 'top', from: new Vector3(0, 5000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 0.18 },
        {
          kind: 'text',
          label: 'spec (mm)',
          text: `mattress   ${BED.mattress.len.toFixed(0)} × ${BED.mattress.w.toFixed(0)} × ${BED.mattress.h}  (full)
frame      ${BED.frame.len.toFixed(0)} × ${BED.frame.w.toFixed(0)}, ${BED.tube} tube
deck       ${BED.deck} high, top of mattress ${BED.deck + BED.mattress.h}
unit       ${UNIT.width.toFixed(0)} wide × ${BED.unit.depth} deep
drawers    4 × ${UNIT.drawerW.toFixed(0)} × ${UNIT.drawerH.toFixed(0)}, travel ${BED.drawer.travel}`,
        },
      ]}
    />
  )
}
