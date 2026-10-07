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
 * &demo[=n]: n stand-in notes instead (50 if no n; made-up, only to see how they lay out; never shown otherwise).
 */
const DEMO = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null
const SAYS = [
  'Rina, you are one of the kindest people I know.',
  'You always make everyone around you feel welcome, and I am so lucky to be your friend.',
  'Keep going! You work so hard and it shows in everything you do.',
  'Thank you for always listening to me.',
  'I hope you know how proud we all are of you.',
  'You light up every room you walk into.',
  'Never forget how strong you are.',
  'Remember to take breaks and be gentle with yourself, you deserve it.',
]
const WHO = ['Mia', 'Hannah', 'Jess', 'Olivia', 'Grace', 'Sam', 'Emily', 'Chloe', 'Ava', 'Sophie', 'Nina', 'Kate']
const demoNotes: Note[] = Array.from({ length: DEMO === null ? 0 : Number(DEMO) || 50 }, (_, i) => ({
  id: `demo${i}`,
  name: WHO[i % WHO.length],
  text: [0, 1, 2].slice(0, 1 + ((i * 7) % 3)).map((k) => SAYS[(i * 3 + k * 5) % SAYS.length]).join(' '),
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
  return <Wall notes={DEMO !== null ? demoNotes : sheet} />
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
      scene={() => <Wall notes={DEMO !== null ? demoNotes : []} />}
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
