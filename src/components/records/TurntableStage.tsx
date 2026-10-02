import { useEffect, useState, useSyncExternalStore } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { PCFSoftShadowMap, Vector3 } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { loggedIn, login, onAuth } from '../../lib/spotify/auth'
import { usePlayer } from '../../lib/spotify/player'
import { CheckSheet } from '../check/CheckSheet'
import { ToyControls } from '../stage/ToyControls'
import { DEMO, pressSaved } from './crate'
import { getDeck, setDeck, useDeck } from './deck'
import { EW, checkEastwood } from './victrola'
import { Eastwood } from './Eastwood'
import { Light } from './Light'
import { lift, needle } from './play'
import { Jacket, useArt } from './Record'
import { Turntable } from './Turntable'
import { type Pressing } from './vinyl'

/**
 * The record player on its own (gallery first): the Victrola Eastwood, full size, in the Quad's evening light, her
 * records leaning in a row beside it (her saved albums on Spotify when she's logged in). Click a record to put it on.
 * &check: the sheet (the manual's drawing and Victrola's photos beside it, and the checks).
 */
function Sleeve({ p, x, z }: { p: Pressing; x: number; z: number }) {
  const art = useArt(p)
  const d = useDeck()
  if (!art) return null
  const playing = d.on?.p.uri === p.uri
  const put = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (getDeck().arm.down) setDeck({ arm: { ...getDeck().arm, down: false } })
    lift()
    needle.runout = false
    setDeck({ on: { p, disc: 0, face: 0 }, arm: { a: getDeck().arm.a, down: false }, lid: true })
  }
  return (
    <group position={[x, 0, z]} rotation={[-0.16, 0.3, 0]} onClick={put} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      <group position={[0, playing ? 30 : 0, 0]}>
        <Jacket p={p} art={art} />
      </group>
    </group>
  )
}

function Scene({ records }: { records: Pressing[] }) {
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get, __deck: { getDeck, setDeck, needle } })
  return (
    <>
      <Light extent={900} />
      <Turntable />
      {records.map((p, i) => (
        <Sleeve key={p.uri} p={p} x={560 + (i % 2) * 40} z={-330 + i * 120} />
      ))}
    </>
  )
}

function Status() {
  const isIn = useSyncExternalStore(onAuth, loggedIn)
  const p = usePlayer()
  const d = useDeck()
  const box: React.CSSProperties = { position: 'fixed', left: '50%', bottom: 84, transform: 'translateX(-50%)', font: "700 18px 'Gaegu', 'Nunito', cursive", color: '#fff4e6', zIndex: 20, textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }
  if (!isIn)
    return (
      <button onClick={login} style={{ ...box, background: '#2b2538', border: '2px solid #fff4e6', borderRadius: 999, padding: '6px 18px', cursor: 'pointer', textShadow: 'none' }}>
        ♪ her own records, with sound (log in with Spotify)
      </button>
    )
  if (p.error) return <div style={box}>{p.error}</div>
  if (d.on && p.track && !p.paused) return <div style={box}>♪ {p.track.name} · {p.track.artists.map((a) => a.name).join(', ')}</div>
  return null
}

export function TurntableStage() {
  const isIn = useSyncExternalStore(onAuth, loggedIn)
  const [records, setRecords] = useState<Pressing[]>(DEMO)
  useEffect(() => {
    if (isIn) pressSaved(6).then((r) => r.length && setRecords(r), console.error)
  }, [isIn])
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 5, far: 20000, position: [60, 640, 900] }}>
        <Scene records={records} />
        <ToyControls target={[40, 60, 0]} minDistance={150} maxDistance={4000} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      <Status />
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
