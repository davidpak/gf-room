import { Waiting } from '../../lib/ready'
import { Suspense } from 'react'
import { Canvas } from '../../lib/render/Canvas'
import { ToyControls } from '../stage/ToyControls'
import { PCFShadowMap, Vector3 } from 'three'
import { H_MAX, H_MIN, IN } from '../../lib/motor'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { Stylize } from '../../lib/stylize'
import { World } from '../../lib/physics/World'
import { DESK, STACK } from './spec'
import { DeskSetup } from './DeskSetup'

function Scene() {
  return (
    <>
      {/* small biases (the depth one is a share of the shadow camera's 6 m depth: 0.00008 is 0.5 mm): thin
          cables (4 mm) lying on the desk keep their shadows */}
      <ToyLights extent={950} mapSize={4096} normalBias={0.5} bias={-0.00008} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2600, 96]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <World timeStep={1 / 120}>
        <Suspense fallback={<Waiting name="desk-stage" />}>
          <DeskSetup />
        </Suspense>
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-1500, 1350, 2150]
const TARGET: [number, number, number] = [0, 600, 0]

/** Full-screen interactive desk. World units: mm. */
export function DeskStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 10, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={40} />
      <ToyControls target={TARGET} minDistance={300} maxDistance={5000} maxPolarAngle={Math.PI / 2.05} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

export function DeskCheck() {
  const c = new Vector3(0, 600, 0)
  return (
    <CheckSheet
      scene={() => <Scene />}
      views={[
        { kind: 'image', label: 'reference: product', src: '/reference/desk-product.webp' },
        { kind: 'hero', label: 'hero (drag)', position: HERO, target: TARGET, fov: 32 },
        { kind: 'image', label: 'reference: dimensions', src: '/reference/desk-dimensions.webp' },
        { kind: 'ortho', label: `front · ${(H_MIN / IN).toFixed(1)}" to ${(H_MAX / IN).toFixed(1)}"`, from: new Vector3(0, 600, 4000), at: c, zoom: 0.34 },
        { kind: 'ortho', label: 'right side', from: new Vector3(4000, 600, 0), at: c, zoom: 0.34 },
        {
          kind: 'text',
          label: 'spec (mm)',
          text: `top        ${DESK.top.w.toFixed(0)} × ${DESK.top.d.toFixed(0)} × ${DESK.top.t}
legs       ${(2 * DESK.legX).toFixed(0)} apart (centres)
outer tube ${DESK.outer.w} × ${DESK.outer.d} × ${DESK.outer.len}
inner tube ${DESK.inner.w} × ${DESK.inner.d} × ${DESK.inner.len}
overlap at max  ${(STACK.innerTop - (STACK.outerBottom + (H_MAX - H_MIN))).toFixed(0)}
inner showing at min  ${(STACK.outerBottom - STACK.footTop).toFixed(0)}
foot       ${DESK.foot.length} × ${DESK.foot.width} × ${DESK.foot.height}`,
        },
      ]}
    />
  )
}
