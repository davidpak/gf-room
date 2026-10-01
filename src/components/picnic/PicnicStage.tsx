import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, Matrix4, PCFSoftShadowMap, Quaternion, SRGBColorSpace, Vector3, type Group } from 'three'
import { LOOK, bruno } from '../quad/bruno'
import { Basket, sandwichInBasket, SANDWICH_AT } from './Picnic'
import { Blanket } from './Blanket'
import { ClosedBook, OpenBook } from './Books'
import { Flights, type Flight } from './Flight'
import { Sandwich } from './Sandwich'
import { LAYOUT } from './layout'

/**
 * The picnic on its own (gallery first), full size, in the Quad's evening light: the gingham blanket, the
 * basket (click it to open its lids; click a sandwich to lift it out onto the blanket), two books stacked,
 * and The Little Prince open (click its right page to turn it, its left to turn back).
 * &cam=x,y,z&at=x,y,z to look closely; &view=open starts with the basket's lids up.
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
const up = new Vector3(0, 1, 0)

function Scene() {
  const background = useMemo(sky, [])
  const [lidUp, setLidUp] = useState(OPEN)
  const [present, setPresent] = useState([true, true, true, true])
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
    const from = g.matrixWorld.clone().multiply(sandwichInBasket(k))
    const [x, z, r] = LAYOUT.landing[k]
    const to = new Matrix4().compose(new Vector3(x, LAYOUT.y + 2, z), new Quaternion().setFromAxisAngle(up, r), new Vector3(1, 1, 1))
    setPresent((p) => p.map((v, i) => (i === k ? false : v)))
    setFlights((f) => [...f, { id: next.current++, half: SANDWICH_AT[k][4], from, to }])
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
      <Blanket />
      <group ref={basket} position={[LAYOUT.basket.x, LAYOUT.y, LAYOUT.basket.z]} rotation={[0, LAYOUT.basket.rot, 0]}>
        <Basket open={open} present={present} onClick={(e) => (e.stopPropagation(), setLidUp((o) => !o))} onSandwich={(k) => take(k)} />
      </group>
      <Flights flights={flights} onLand={(f) => (setFlights((all) => all.filter((x) => x.id !== f.id)), setLying((l) => [...l, f]))} />
      {lying.map((f) => (
        <group key={f.id} matrix={f.to} matrixAutoUpdate={false}>
          <Sandwich half={f.half} />
        </group>
      ))}
      {LAYOUT.stack.map((b) => (
        <group key={b.k} position={[b.x, LAYOUT.y + b.y, b.z]} rotation={[0, b.rot, 0]}>
          <ClosedBook k={b.k} />
        </group>
      ))}
      <group position={[LAYOUT.open.x, LAYOUT.y, LAYOUT.open.z]} rotation={[0, LAYOUT.open.rot, 0]}>
        <OpenBook />
      </group>
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
