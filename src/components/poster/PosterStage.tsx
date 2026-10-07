import { Canvas } from '../../lib/render/Canvas'
import { PCFShadowMap, Vector3 } from 'three'
import { ToyControls } from '../stage/ToyControls'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { Stylize } from '../../lib/stylize'
import { Poster } from './Poster'
import { useNotes, type Note } from './messages'
import { POSTER, checkPoster } from './spec'

/**
 * The poster on its own (gallery first), on a patch of her wall: her friends' notes from the sheet (./messages;
 * &demo[=n]: stand-ins).
 */

function Wall({ notes }: { notes: Note[] }) {
  return (
    <>
      <ToyLights extent={600} />
      <Stylize />
      <mesh position={[0, 0, -2]} receiveShadow>
        <planeGeometry args={[1600, 1200]} />
        <meshStandardMaterial color="#efe3d0" roughness={1} />
      </mesh>
      <Poster notes={notes} />
    </>
  )
}

function Scene() {
  return <Wall notes={useNotes()} />
}

export function PosterStage() {
  return (
    <>
      <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: [0, 0, 1300], fov: 32, near: 5, far: 20000 }} gl={{ antialias: false }}>
        <color attach="background" args={[TOY.bg]} />
        <Scene />
        <Effects aoRadius={8} />
        <ToyControls target={[0, 0, 0]} minDistance={150} maxDistance={4000} enableDamping dampingFactor={0.06} />
      </Canvas>
    </>
  )
}

export function PosterCheck() {
  const results = checkPoster()
  return (
    <CheckSheet
      scene={() => <Wall notes={[]} />}
      views={[
        { kind: 'image', label: 'her photo (over her desk)', src: '/reference/room-desk-poster.jpg' },
        { kind: 'ortho', label: 'straight on', from: new Vector3(0, 0, 1000), at: new Vector3(0, 0, 0), zoom: 1.25 },
        { kind: 'hero', label: 'from the side, its corners curling (drag)', position: [600, 150, 500], target: [0, 0, 0], fov: 32 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `poster board  ${POSTER.w.toFixed(0)} × ${POSTER.h.toFixed(0)} (about 28 × 25 in), corners curl up to ${POSTER.curl}
letters       ${((POSTER.letters.x1 - POSTER.letters.x0) * 100).toFixed(0)}% of its width, ${((POSTER.letters.y1 - POSTER.letters.y0) * 100).toFixed(0)}% of its height
notes         typed on slips in columns round them, from the Google Form's sheet (&demo=n: stand-ins)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
