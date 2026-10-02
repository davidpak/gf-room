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
import { VinylWarm } from './Record'
import { getDeck, setDeck } from './deck'
import { Eastwood } from './Eastwood'
import { Light } from './Light'
import { LABEL } from './library'
import { askDig, RecordsOverlay } from './Overlay'
import { needle } from './play'
import { playOn } from './putOn'
import { useFillCrates, useShelf } from './shelf'
import { Turntable } from './Turntable'
import { EW, checkEastwood } from './victrola'

/**
 * The record player on its own (gallery first): the Victrola Eastwood, full size, in the Quad's evening light, the
 * crate beside it (her saved albums once she's logged in with Spotify, or what she dug for). Click the crate to go
 * through it (./browse: A / D, Enter), click a record out of its jacket: it goes on and plays.
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
        <VinylWarm />
        <group position={[520, 0, 60]} rotation={[0, -0.45, 0]}>
          <TheCrate />
        </group>
      </World>
      <LookCamera />
    </>
  )
}

function TheCrate() {
  const sh = useShelf()
  return <Crate id={sh.showing} label={sh.showing === 'dig' ? LABEL.dig : LABEL.saved} note={sh.showing === 'dig' ? sh.dug : ''} onPlay={(p, disc) => playOn(p, disc)} />
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
      <button onClick={() => askDig()} style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 20, font: "700 18px 'Gaegu', cursive", background: '#2b2538', color: '#fff4e6', border: '2px solid #fff4e6', borderRadius: 999, padding: '5px 16px', cursor: 'pointer' }}>
        ⛏ dig for records
      </button>
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
