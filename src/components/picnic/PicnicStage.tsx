import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Canvas } from '../../lib/render/Canvas'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, Matrix4, PCFSoftShadowMap, Quaternion, SRGBColorSpace, Vector3, type Group } from 'three'
import { LOOK, bruno } from '../quad/bruno'
import { Basket, CLEAR, CONTENTS, contentAt } from './Picnic'
import { Blanket } from './Blanket'
import { ClosedBook, OpenBook } from './Books'
import { Flights, type Flight } from './Flight'
import { FoodModel } from './food'
import { Board } from './Board'
import { FruitBowl } from './FruitBowl'
import { Lemon, Mug, Pitcher } from './Lemonade'
import { Butterflies, Flowers } from './Flowers'
import { LAYOUT } from './layout'
import { Sub } from './Sub'
import { Grapes } from './Grapes'
import { Baguette } from './Baguette'
import { Duck, newPose, type DuckKind, type DuckPose } from '../ducks/Duck'
import { Sparrow } from '../ducks/Sparrows'

/**
 * The picnic on its own (gallery first), full size, in the Quad's evening light: the gingham blanket, the
 * basket (click it to swing its handles down; click what's in it to lift it out onto the blanket), two books stacked,
 * and The Little Prince open (click its right page to turn it, its left to turn back).
 * &cam=x,y,z&at=x,y,z to look closely; &view=open starts with the basket's handles down.
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
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
const num = (k: string) => (q?.get(k) ? (q.get(k)!.split(',').map(Number) as [number, number, number]) : null)
const CAM = num('cam')
const AT = num('at')
const OPEN = q?.get('view') === 'open'
const SHOW = q?.get('show')
const up = new Vector3(0, 1, 0)

/** &show=food: the food on its own, in a row, to look at closely */
function Food() {
  return (
    <>
      <group position={[-300, 0, 0]} rotation={[0, -0.5, 0]}>
        <Sub v={0} />
      </group>
      <group position={[-100, 0, 40]} rotation={[0, 2.6, 0]}>
        <Sub v={1} />
      </group>
      <group position={[60, 0, -60]}>
        <Grapes k={0} />
      </group>
      <group position={[60, 0, 80]}>
        <Grapes k={1} />
      </group>
      <group position={[0, 0, 250]} rotation={[0, 0.2, 0]}>
        <Baguette />
      </group>
      <group position={[0, 0, -250]} rotation={[0, -0.1, 0]}>
        <Baguette lo={-120} hi={150} />
      </group>
      <group position={[300, 0, -200]}>
        <Baguette lo={-210} hi={-165} />
      </group>
    </>
  )
}

/** &show=ducks: the drake, the hen, a duckling; standing, pecking, quacking, walking, flapping */
function ShowDuck({ kind, at, set }: { kind: DuckKind; at: [number, number, number]; set: (p: DuckPose, t: number) => void }) {
  const pose = useRef(newPose())
  useFrame(({ clock }) => set(pose.current, clock.elapsedTime))
  return (
    <group position={at} rotation={[0, 0.5, 0]}>
      <Duck kind={kind} pose={pose} />
    </group>
  )
}
function DuckShow() {
  return (
    <>
      <ShowDuck kind="drake" at={[-500, 0, 0]} set={(p) => (p.peck = 1)} />
      <ShowDuck kind="hen" at={[0, 0, 0]} set={(p) => (p.quack = 1)} />
      <ShowDuck kind="duckling" at={[350, 0, 100]} set={(p) => (p.flap = 1)} />
      <ShowDuck kind="drake" at={[-500, 0, 600]} set={(p, t) => ((p.peck = 0.5 - 0.5 * Math.cos(t * 3)), (p.look = 0))} />
      <ShowDuck kind="hen" at={[0, 0, 600]} set={(p, t) => ((p.walk = t * 9), (p.stride = 1), (p.quack = Math.max(0, Math.sin(t * 4))))} />
      <group position={[650, 0, 300]} rotation={[0, 0.8, 0]}>
        <Sparrow cock pose={{ current: { flap: 0, peck: 0, hop: 0, look: 0, flying: false } }} />
      </group>
      <group position={[650, 0, 480]} rotation={[0, 0.3, 0]}>
        <Sparrow cock={false} pose={{ current: { flap: 0, peck: 0.7, hop: 0, look: 0, flying: false } }} />
      </group>
      <ShowDuck kind="duckling" at={[350, 0, 600]} set={(p, t) => ((p.walk = t * 12), (p.stride = 1), (p.flap = 0.5 + 0.5 * Math.sin(t)))} />
    </>
  )
}

/** the spread on the blanket: the board, the fruit, the lemonade, the flowers (and their butterflies) */
const FLOWERS_AT = new Vector3(LAYOUT.flowers.x, LAYOUT.y, LAYOUT.flowers.z)
function Spread() {
  const [eaten, setEaten] = useState<Record<string, Set<number>>>({})
  const eat = (key: string) => (i: number) => setEaten((all) => ({ ...all, [key]: new Set([...(all[key] ?? []), i]) }))
  const levels = useMemo(() => [{ current: 0.8 }, { current: 0.45 }], [])
  const at = (p: { x: number; z: number; rot: number }) => ({ position: [p.x, LAYOUT.y, p.z] as [number, number, number], rotation: [0, p.rot, 0] as [number, number, number] })
  return (
    <>
      <group {...at(LAYOUT.board)}>
        <Board eaten={eaten.board} onEat={eat('board')} />
      </group>
      <group {...at(LAYOUT.bowl)}>
        <FruitBowl eaten={eaten.bowl} onEat={eat('bowl')} />
      </group>
      <group {...at(LAYOUT.pitcher)}>
        <Pitcher />
      </group>
      {LAYOUT.mugs.map((m, i) => (
        <group key={i} {...at(m)} onClick={(e) => (e.stopPropagation(), (levels[i].current = Math.max(0, levels[i].current - 0.25)))}>
          <Mug level={levels[i]} />
        </group>
      ))}
      {LAYOUT.lemons.map((m, i) => (
        <group key={i} {...at(m)}>
          <Lemon />
        </group>
      ))}
      <group {...at(LAYOUT.flowers)}>
        <Flowers />
      </group>
      <Butterflies at={() => FLOWERS_AT} scale={1} />
    </>
  )
}

function Scene() {
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get }) // (for screenshots from the console)
  const background = useMemo(sky, [])
  const [lidUp, setLidUp] = useState(OPEN)
  const [present, setPresent] = useState(() => CONTENTS.map(() => true))
  const [flights, setFlights] = useState<Flight[]>([])
  const [lying, setLying] = useState<Flight[]>([])
  const open = useRef(OPEN ? 1 : 0)
  const basket = useRef<Group>(null)
  const next = useRef(1)
  useFrame((_, dt) => {
    open.current += ((lidUp ? 1 : 0) - open.current) * Math.min(1, dt * 6)
  })
  const take = (k: number) => {
    const g = basket.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    const from = g.matrixWorld.clone().multiply(contentAt(k))
    const [x, z, r] = LAYOUT.landing[k]
    const to = new Matrix4().compose(new Vector3(x, LAYOUT.y + 2, z), new Quaternion().setFromAxisAngle(up, r), new Vector3(1, 1, 1))
    setPresent((p) => p.map((v, i) => (i === k ? false : v)))
    const clear = g.localToWorld(new Vector3(0, CLEAR + CONTENTS[k].below, 0)).y
    setFlights((f) => [...f, { id: next.current++, food: CONTENTS[k], from, to, clear }])
  }
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight
        color={LOOK.light}
        intensity={LOOK.intensity}
        position={LOOK.sun.clone().multiplyScalar(3000)}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-1600}
        shadow-camera-right={1600}
        shadow-camera-top={1600}
        shadow-camera-bottom={-1600}
        shadow-camera-near={100}
        shadow-camera-far={8000}
        shadow-bias={-0.0004}
        shadow-normalBias={2}
      />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2600, 64]} />
      </mesh>
      {SHOW === 'food' ? <Food /> : SHOW === 'ducks' ? <DuckShow /> : <Blanket />}
      {!SHOW && <group ref={basket} position={[LAYOUT.basket.x, LAYOUT.y, LAYOUT.basket.z]} rotation={[0, LAYOUT.basket.rot, 0]}>
        <Basket open={open} present={present} onClick={(e) => (e.stopPropagation(), setLidUp((o) => !o))} onTake={(k) => take(k)} />
      </group>}
      <Flights flights={flights} onLand={(f) => (setFlights((all) => all.filter((x) => x.id !== f.id)), setLying((l) => [...l, f]))} />
      {lying.map((f) => (
        <group key={f.id} matrix={f.to} matrixAutoUpdate={false}>
          <FoodModel f={f.food} />
        </group>
      ))}
      {!SHOW && LAYOUT.stack.map((b) => (
        <group key={b.k} position={[b.x, LAYOUT.y + b.y, b.z]} rotation={[0, b.rot, 0]}>
          <ClosedBook k={b.k} />
        </group>
      ))}
      {!SHOW && <Spread />}
      {!SHOW && (
        <group position={[LAYOUT.open.x, LAYOUT.y, LAYOUT.open.z]} rotation={[0, LAYOUT.open.rot, 0]}>
          <OpenBook />
        </group>
      )}
    </>
  )
}

export function PicnicStage() {
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 30000, position: CAM ?? [1600, 2100, 2900] }}>
      <Scene />
      <OrbitControls makeDefault target={AT ?? [0, 80, 0]} enableDamping minDistance={200} maxDistance={8000} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  )
}
