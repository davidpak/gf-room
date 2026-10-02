import { useState } from 'react'
import { useThree } from '@react-three/fiber'
import { PCFSoftShadowMap, Vector3 } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { CheckSheet } from '../check/CheckSheet'
import { Light } from '../records/Light'
import { needle } from '../records/play'
import { ToyControls } from '../stage/ToyControls'
import { SpeakerOnStand } from './Speaker'
import { JS120, L100, checkSpeaker } from './spec'

/**
 * The record stand's speakers on their own (gallery first): a pair of JBL L100 Classics on JS-120 stands, mirror
 * images, a speaker's width and a half apart. Click a grille: it comes off and leans against its speaker (again: back
 * on). "play" pumps the cones as a record would. &check: the sheet (JBL's photo beside the same views, the checks).
 * &grille=orange|black|blue: the real colours (the toy's pastel blue otherwise).
 */
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const COLOR = params.get('grille') ? L100.grille.colors[params.get('grille') as 'orange' | 'black' | 'blue'] ?? '#7d9ee0' : '#7d9ee0'

function Scene() {
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get })
  return (
    <>
      <Light extent={900} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 330, 0, 0]}>
          <SpeakerOnStand side={s as -1 | 1} color={COLOR} />
        </group>
      ))}
    </>
  )
}

export function SpeakerStage() {
  const [playing, setPlaying] = useState(false)
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 5, far: 20000, position: [700, 900, 2300] }}>
        <Scene />
        <ToyControls target={[0, 420, 0]} minDistance={200} maxDistance={6000} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      <button
        onClick={() => {
          needle.playing = !playing
          setPlaying(!playing)
        }}
        style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 20, font: "700 18px 'Gaegu', cursive", background: '#2b2538', color: '#fff4e6', border: '2px solid #fff4e6', borderRadius: 999, padding: '5px 16px', cursor: 'pointer' }}
      >
        {playing ? '❚❚ stop' : '▶ play'}
      </button>
    </>
  )
}

/** one, still, grille on, for the sheet */
function One() {
  return (
    <>
      <Light extent={700} />
      <SpeakerOnStand color={L100.grille.colors.black} interactive={false} />
    </>
  )
}
export function SpeakerCheck() {
  const results = checkSpeaker()
  const mid = new Vector3(0, 420, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'JBL’s photo: the three grilles on JS-120s (the black one straight on)', src: '/reference/jbl-l100-classic-trio.jpg' },
        { kind: 'ortho', label: 'front (black foam, as the middle one)', from: new Vector3(0, 420, 3000), at: mid, zoom: 0.45 },
        { kind: 'ortho', label: 'side (7° back on the stand)', from: new Vector3(3000, 420, 0), at: mid, zoom: 0.45 },
        { kind: 'image', label: 'JBL’s JS-120 from the side (the uprights at the back)', src: '/reference/jbl-js120-side.jpg' },
        { kind: 'hero', label: 'as in JBL’s photo (drag)', position: [-700, 650, 1500], target: [0, 400, 0], fov: 30 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `JBL L100 Classic  ${L100.h} × ${L100.w} × ${L100.d}, ${L100.mass} kg; Quadrex ${L100.grille.cols} × ${L100.grille.rows} at ${L100.grille.pitch}
JS-120  ${JS120.w} × ${JS120.h} × ${JS120.d}; the speaker's bottom ${JS120.front} at the front, ${JS120.back} at the back (7°)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
