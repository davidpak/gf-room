import { Canvas } from '../../lib/render/Canvas'
import { PCFShadowMap, Vector3 } from 'three'
import { ToyControls } from '../stage/ToyControls'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { Stylize } from '../../lib/stylize'
import { Poster, PosterCard } from './Poster'
import { useNotes, type Note } from './messages'
import { POSTER, checkPoster } from './spec'

/**
 * The poster on its own (gallery first), on a patch of her wall: her friends' notes from the sheet (./messages).
 * &demo: stand-in notes instead (lorem ipsum: only to see how they lay out; never shown otherwise).
 */
const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')
const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud'.split(' ')
const demoNotes: Note[] = Array.from({ length: 30 }, (_, i) => ({
  id: `demo${i}`,
  name: LOREM[(i * 7) % LOREM.length],
  text: LOREM.slice(0, 12 + ((i * 13) % 18)).join(' '),
}))

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
  const sheet = useNotes()
  return <Wall notes={DEMO ? demoNotes : sheet} />
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
      <PosterCard />
    </>
  )
}

export function PosterCheck() {
  const results = checkPoster()
  return (
    <CheckSheet
      scene={() => <Wall notes={DEMO ? demoNotes : []} />}
      views={[
        { kind: 'image', label: 'her photo (over her desk)', src: '/reference/room-desk-poster.jpg' },
        { kind: 'ortho', label: 'straight on', from: new Vector3(0, 0, 1000), at: new Vector3(0, 0, 0), zoom: 1.25 },
        { kind: 'hero', label: 'from the side, its corners curling (drag)', position: [600, 150, 500], target: [0, 0, 0], fov: 32 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `poster board  ${POSTER.w.toFixed(0)} × ${POSTER.h.toFixed(0)} (22 × 28 in), corners curl up to ${POSTER.curl}
letters       ${((POSTER.letters.x1 - POSTER.letters.x0) * 100).toFixed(0)}% of its width, ${((POSTER.letters.y1 - POSTER.letters.y0) * 100).toFixed(0)}% of its height
notes         ${POSTER.bands.length} places round them, from the Google Form's sheet (&demo: stand-ins)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
