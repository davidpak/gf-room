import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PCFShadowMap, Vector3 } from 'three'
import { useDeskMotor } from '../../lib/motor'
import { CheckSheet } from '../check/CheckSheet'
import { Effects, StageLights } from '../stage/StageLights'
import { Keypad } from './Keypad'
import { FACE, KP } from './spec'

function KeypadAlone() {
  const motor = useDeskMotor()
  return <Keypad motor={motor} />
}

function Scene() {
  return (
    <>
      <StageLights extent={180} />
      <Suspense fallback={null}>
        <KeypadAlone />
      </Suspense>
    </>
  )
}

/** Full-screen interactive stage for the keypad alone. World units: mm. */
export function KeypadStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: [-70, -20, 240], fov: 30, near: 1, far: 5000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={8} />
      <OrbitControls makeDefault target={[0, FACE.center.y, FACE.center.z]} enablePan={false} minDistance={90} maxDistance={700} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

const faceCenter = new Vector3(0, FACE.center.y, FACE.center.z)
const faceNormal = new Vector3(0, Math.sin(FACE.angle), Math.cos(FACE.angle))
const faceUp = new Vector3(0, Math.cos(FACE.angle), -Math.sin(FACE.angle))

export function KeypadCheck() {
  return (
    <CheckSheet
      scene={() => <Scene />}
      views={[
        { kind: 'image', label: 'reference', src: '/reference/keypad.png' },
        { kind: 'hero', label: 'hero (drag)', position: [-70, -20, 240], target: faceCenter.toArray() },
        { kind: 'ortho', label: 'face-on (along face normal)', from: faceCenter.clone().addScaledVector(faceNormal, 500), at: faceCenter, up: faceUp, zoom: 2.3 },
        { kind: 'ortho', label: 'front', from: new Vector3(0, -14, 500), at: new Vector3(0, -14, 0), zoom: 2.3 },
        { kind: 'ortho', label: 'right side (profile)', from: new Vector3(500, -14, -15), at: new Vector3(0, -14, -15), zoom: 5 },
        {
          kind: 'text',
          label: 'spec (mm)',
          text: `housing   ${KP.width} × ${KP.depth} × ${KP.height}
face      chamfer ${KP.faceTopInset} back × ${KP.faceDrop} down, tilted ${((FACE.angle * 180) / Math.PI).toFixed(1)}°
screen    ${KP.screen.w} × ${KP.screen.h}
presets   ${KP.presets.size} sq at x=${KP.presets.xs.join(', ')}
arrows    r=${KP.arrows.circumradius} at x=${KP.arrows.up}, ${KP.arrows.down}`,
        },
      ]}
    />
  )
}
