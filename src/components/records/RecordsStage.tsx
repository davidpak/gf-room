import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace, Vector3, type Group } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { loggedIn, login, onAuth } from '../../lib/spotify/auth'
import { album, cover, savedAlbums } from '../../lib/spotify/api'
import { CheckSheet } from '../check/CheckSheet'
import { LOOK, bruno } from '../quad/bruno'
import { ToyControls } from '../stage/ToyControls'
import { Disc, Jacket, useArt } from './Record'
import { LP, checkVinyl, press, type Pressing } from './vinyl'

/**
 * Records on their own (gallery first): her saved albums on Spotify pressed into records (logged out: three made-up
 * ones), each jacket standing with its disc lying in front. Click a disc to turn it over (side B), again for the
 * next disc of a double album. &check: the sheet (the standard's numbers, the pressing's checks).
 */
function sky() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  LOOK.sky.forEach((col, i) => grad.addColorStop(i / (LOOK.sky.length - 1), col))
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 256)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const LAWN = bruno({ color: '#7fae57' })
function Light({ extent = 1200 }: { extent?: number }) {
  const background = useMemo(sky, [])
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight color={LOOK.light} intensity={LOOK.intensity} position={LOOK.sun.clone().multiplyScalar(2400)} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent} shadow-camera-near={50} shadow-camera-far={6000} shadow-bias={-0.0004} shadow-normalBias={0.5} />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[4000, 64]} />
      </mesh>
    </>
  )
}

/** made-up albums, for when she's not logged in */
const DEMO: Pressing[] = [
  press({ uri: 'demo:sunday', title: 'Sunday Morning Pancakes', artist: 'The Picnic Ducks', year: '2026', cover: '', tracks: ['Syrup', 'Blueberries', 'Second Helping', 'Orange Juice', 'Nap', 'Dishes (Later)', 'Crumbs', 'Back to Bed', 'Brunch Again'].map((name, i) => ({ name, ms: 150_000 + ((i * 47_000) % 130_000) })) }),
  press({ uri: 'demo:quad', title: 'Cherry Blossom Quad', artist: 'Rina & David', year: '2026', cover: '', tracks: ['Petals', 'The Long Walk', 'Under the Trees', 'Paper Planes', 'Lime Scooter', 'Melee at Midnight', 'Cookies', 'Lamp Posts', 'Goodnight', 'Again Tomorrow', 'Ducks', 'Fin'].map((name, i) => ({ name, ms: 200_000 + ((i * 61_000) % 160_000) })) }),
  press({ uri: 'spotify:track:demo', title: 'Our Song', artist: 'Two of Us', year: '2026', cover: '', tracks: [{ name: 'Our Song', ms: 214_000 }] }),
]

async function pressSaved(n = 6): Promise<Pressing[]> {
  const albums = await savedAlbums(n)
  const full = await Promise.all(albums.map((a) => album(a.id)))
  return full.map((a) =>
    press({
      uri: a.uri,
      title: a.name,
      artist: a.artists.map((x) => x.name).join(', '),
      year: a.release_date,
      cover: cover(a) ?? '',
      tracks: a.tracks!.items.map((t) => ({ name: t.name, ms: t.duration_ms })),
    }),
  )
}

function One({ p, x }: { p: Pressing; x: number }) {
  const art = useArt(p)
  const [face, setFace] = useState(0) // (sides seen: 0 A, 1 B, 2 C…)
  const turn = useRef<Group>(null)
  const want = face % 2 ? Math.PI : 0
  useFrame((_, dt) => {
    const g = turn.current
    if (g) g.rotation.z += (want - g.rotation.z) * Math.min(1, dt * 7)
  })
  if (!art) return null
  const disc = Math.floor(face / 2)
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setFace((f) => (f + 1) % p.sides.length)
  }
  return (
    <group position={[x, 0, 0]}>
      <group position={[0, 0, -60]} rotation={[-0.12, 0, 0]}>
        <Jacket p={p} art={art} />
      </group>
      <group position={[0, 40, 230]} onClick={click} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <group ref={turn}>
          <group position={[0, -LP.t / 2, 0]}>
            <Disc p={p} art={art} disc={disc} />
          </group>
        </group>
      </group>
    </group>
  )
}

function Scene({ records }: { records: Pressing[] }) {
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get })
  const gapX = 380
  return (
    <>
      <Light />
      {records.map((p, i) => (
        <One key={p.uri} p={p} x={(i - (records.length - 1) / 2) * gapX} />
      ))}
    </>
  )
}

export function RecordsStage() {
  const isIn = useSyncExternalStore(onAuth, loggedIn)
  const [records, setRecords] = useState<Pressing[]>(DEMO)
  useEffect(() => {
    if (isIn) pressSaved().then((r) => r.length && setRecords(r), console.error)
  }, [isIn])
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 5, far: 30000, position: [0, 900, 1900] }}>
        <Scene records={records} />
        <ToyControls target={[0, 80, 80]} minDistance={200} maxDistance={6000} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      {!isIn && (
        <button
          onClick={login}
          style={{ position: 'fixed', left: '50%', bottom: 84, transform: 'translateX(-50%)', font: "700 18px 'Gaegu', 'Nunito', cursive", color: '#fff4e6', background: '#2b2538', border: '2px solid #fff4e6', borderRadius: 999, padding: '6px 18px', cursor: 'pointer', zIndex: 20 }}
        >
          ♪ press her own records (log in with Spotify)
        </button>
      )}
    </>
  )
}

function Sample() {
  return (
    <>
      <Light extent={500} />
      <One p={DEMO[1]} x={0} />
    </>
  )
}
export function RecordsCheck() {
  const results = checkVinyl()
  const p = DEMO[1]
  return (
    <CheckSheet
      scene={() => <Sample />}
      views={[
        { kind: 'ortho', label: 'the disc from above (side A)', from: new Vector3(0, 3000, 230), at: new Vector3(0, 0, 230), up: new Vector3(0, 0, -1), zoom: 1.6 },
        { kind: 'ortho', label: 'the jacket, from the front', from: new Vector3(0, 160, 3000), at: new Vector3(0, 160, 0), zoom: 1.4 },
        { kind: 'hero', label: 'a record in the light (drag)', position: [260, 420, 760], target: [0, 60, 120], fov: 30 },
        {
          kind: 'text',
          label: 'the standard (mm) and its check',
          text: `12" LP  Ø ${(2 * LP.r).toFixed(1)}, hole Ø ${(2 * LP.hole).toFixed(2)}, ${LP.t} thick, label Ø ${2 * LP.label}
grooves from Ø ${(2 * LP.start).toFixed(1)} to no less than Ø ${(2 * LP.endMin).toFixed(1)}, 33⅓ rpm
jacket ${LP.sleeve.toFixed(1)} square

the sample, "${p.title}": ${p.sides.map((s) => `side ${s.letter} ${s.bands.length} songs ${(s.ms / 60000).toFixed(1)} min`).join(' · ')}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
