import { Canvas } from '../../lib/render/Canvas'
import { ToyControls } from '../stage/ToyControls'
import { PCFShadowMap } from 'three'
import { DUSK, Effects, StageLights } from '../stage/StageLights'
import { Closet } from './Closet'
import { World } from '../../lib/physics/World'
import { CLOSET } from './spec'

/** Full-screen interactive closet. A little floor in front so the mirrors have something to show. */
export function ClosetStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: [-1700, 1500, 3900], fov: 38, near: 10, far: 30000 }} gl={{ antialias: false }}>
      <StageLights extent={1600} mapSize={4096} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3600, 96]} />
        <meshStandardMaterial color={DUSK.floor} roughness={1} />
      </mesh>
      <World>
        <Closet />
      </World>
      <Effects aoRadius={40} />
      <ToyControls target={[0, CLOSET.opening.h / 2, 0]} enablePan={false} minDistance={600} maxDistance={7000} maxPolarAngle={Math.PI / 2.05} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}
