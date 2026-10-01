import { useRef } from 'react'
import { Canvas } from '../../lib/render/Canvas'
import { OrbitControls } from '@react-three/drei'
import { PCFShadowMap, Vector3 } from 'three'
import { CheckSheet } from '../check/CheckSheet'
import { DUSK, Effects, StageLights } from '../stage/StageLights'
import { Doll, type DollRig } from './Doll'
import { useToyIdle } from './useToyIdle'
import { DOLL } from './spec'

/** Standing around like a crochet toy (./useToyIdle). */
function IdleDoll() {
  const rig = useRef<DollRig | null>(null)
  useToyIdle(rig)
  return <Doll rig={rig} />
}

function Scene({ idle = true }: { idle?: boolean }) {
  return (
    <>
      <StageLights extent={320} mapSize={2048} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 96]} />
        <meshStandardMaterial color={DUSK.floor} roughness={1} />
      </mesh>
      {idle ? <IdleDoll /> : <Doll />}
    </>
  )
}

const HERO: [number, number, number] = [260, 300, 820]
const TARGET: [number, number, number] = [0, 175, 0]

/** Full-screen crochet doll. World units: mm. */
export function DollStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 30, near: 5, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={6} />
      <OrbitControls makeDefault target={TARGET} enablePan={false} minDistance={180} maxDistance={2500} maxPolarAngle={Math.PI / 2.05} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

export function DollCheck() {
  const c = new Vector3(0, DOLL.height / 2, 0)
  return (
    <CheckSheet
      scene={() => <Scene idle={false} />}
      views={[
        { kind: 'image', label: 'reference: front', src: '/reference/doll-front.png' },
        { kind: 'ortho', label: 'front', from: new Vector3(0, DOLL.height / 2, 3000), at: c, zoom: 0.92 },
        { kind: 'hero', label: 'hero (drag)', position: HERO, target: TARGET, fov: 30 },
        { kind: 'image', label: 'reference: back', src: '/reference/doll-back.png' },
        { kind: 'ortho', label: 'back', from: new Vector3(0, DOLL.height / 2, -3000), at: c, zoom: 0.92 },
        { kind: 'ortho', label: 'side (left)', from: new Vector3(3000, DOLL.height / 2, 0), at: c, zoom: 0.92 },
      ]}
    />
  )
}
