import { useThree } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { PCFSoftShadowMap, Vector3 } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { World } from '../../lib/physics/World'
import { CheckSheet } from '../check/CheckSheet'
import { LookCamera } from '../stage/LookCamera'
import { ToyControls } from '../stage/ToyControls'
import { getBrowse, openCrate, takeOut } from './browse'
import { Crate } from './Crate'
import { getDeck, setDeck } from './deck'
import { Eastwood } from './Eastwood'
import { Light } from './Light'
import { LooseRecords, takeLoose } from './Loose'
import { askDig, RecordsOverlay } from './Overlay'
import { needle } from './play'
import { useFillCrates } from './shelf'
import { Turntable } from './Turntable'
import { EW, checkEastwood } from './victrola'

/**
 * The record player on its own (gallery first): the Victrola Eastwood, full size, in the Quad's evening light, three
 * of the crates beside it (On Repeat, Saved, Dig: her own records once she's logged in with Spotify). Click a crate to
 * go through it (./browse: A / D, Enter), click a record out of its jacket and carry it to the turntable.
 * &check: the sheet (the manual's drawing and Victrola's photos beside it, and the checks).
 */
function Scene() {
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get, __deck: { getDeck, setDeck, needle }, __browse: { openCrate, takeOut, getBrowse } })
  return (
    <>
      <Light extent={1100} />
      <World floorY={0} timeStep={1 / 120}>
        <Turntable />
        {/* (the cabinet, for what's dropped on it) */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[EW.w / 2, EW.cab / 2, EW.d / 2]} position={[0, EW.cab / 2, 0]} />
        </RigidBody>
        {(
          [
            ['repeat', 'On Repeat', -0.35],
            ['saved', 'Saved', -0.5],
            ['dig', 'Dig', -0.65],
          ] as const
        ).map(([id, label, rot], i) => (
          <group key={id} position={[470 + i * 330, 0, -40 + i * 160]} rotation={[0, rot, 0]}>
            <Crate id={id} label={label} onTake={takeLoose} onCard={id === 'dig' ? () => askDig() : undefined} empty={id === 'dig' ? 'click to ask for anything' : ''} />
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[190, 100, 140]} position={[0, 100, 0]} />
            </RigidBody>
          </group>
        ))}
        <LooseRecords />
      </World>
      <LookCamera />
    </>
  )
}

export function TurntableStage() {
  useFillCrates()
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 5, far: 20000, position: [300, 900, 1500] }}>
        <Scene />
        <ToyControls target={[300, 60, 0]} minDistance={150} maxDistance={5000} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      <RecordsOverlay />
    </>
  )
}

/** the player alone, lid up, still, for the sheet */
function One() {
  return (
    <>
      <Light extent={400} />
      <Eastwood />
    </>
  )
}
export function TurntableCheck() {
  const results = checkEastwood()
  const mid = new Vector3(0, EW.h / 2, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'ortho', label: 'top (the manual p.6 drawn the same way: grille toward you)', from: new Vector3(0, 3000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 0.62 },
        { kind: 'ortho', label: 'front', from: new Vector3(0, EW.h / 2, 3000), at: mid, zoom: 0.62 },
        { kind: 'ortho', label: 'left side', from: new Vector3(-3000, EW.h / 2, 0), at: mid, zoom: 0.62 },
        { kind: 'hero', label: 'as in Victrola’s photo (drag)', position: [-120, 330, 520], target: [0, 60, 0], fov: 30 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `Victrola Eastwood VTA-72 (bamboo)  ${EW.w} × ${EW.d} × ${EW.h} (lid shut), ${EW.mass} kg
platter Ø ${2 * EW.platter.r} at (${EW.platter.x}, ${EW.platter.z}); arm ${EW.arm.L} from its pivot at (${EW.arm.pivot.x}, ${EW.arm.pivot.z})
knobs Ø ${2 * EW.controls.knobs.small.r} (BT/PHONO), Ø ${2 * EW.controls.knobs.big.r} (VOLUME)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
