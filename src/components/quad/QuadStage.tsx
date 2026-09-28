import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, Fog, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { LOOK, shared } from './bruno'
import { CherryTree } from './CherryTree'
import { Grass, Island, Petals, Walks } from './Ground'
import { LampPost } from './Furniture'
import { Building, Hedges } from './Backdrop'
import { Car, CAR_BODY, type CarState, type Obstacle } from './Car'
import { CarBody, LiveProps, QuadColliders, propObstacles } from './Physical'
import { World } from '../../lib/physics/World'
import { PhotoViewer, Photos, boardObstacles, useViewerOpen } from './Photos'
import './quad.css'
import { SET } from './set'

/**
 * The Quad's north-west quarter (./set), in a warm spring evening (Bruno Simon's folio-2025 is the
 * template): the brick walk through the lawn, cherries along it, lamp posts, benches, petals. Their
 * little car drives it (./Car: WASD / arrows, Space, R), the camera following Bruno's way; trees
 * between the camera and the car open up so it's never lost.
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

/** dev only: the R3F store on window.__r3f() (to step frames from the console) */
function DevStore() {
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) (window as unknown as { __r3f: typeof get }).__r3f = get
  return null
}

function Clock() {
  useFrame(({ clock }) => void (shared.time.value = clock.elapsedTime))
  return null
}

function Scene({ car, paused }: { car: { current: CarState }; paused: boolean }) {
  const background = useMemo(sky, [])
  const fog = useMemo(() => new Fog(LOOK.fog, 7000, 18000), [])
  // what the car bumps into: the trunks, the lamps, the building and the hedges (the benches it shoves: ./Physical)
  const obstacles = useMemo<Obstacle[]>(
    () => [
      ...SET.trees.map((t) => ({ kind: 'circle' as const, x: t.x, z: t.z, r: 110 })),
      ...SET.lamps.map((l) => ({ kind: 'circle' as const, x: l.x, z: l.z, r: 50 })),
      ...SET.building.blocks.map((b) => ({ kind: 'box' as const, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, w: b.x1 - b.x0, d: b.z1 - b.z0 })),
      ...SET.hedges.map((h) => ({ kind: 'box' as const, x: (h.x0 + h.x1) / 2, z: h.z, w: h.x1 - h.x0, d: h.d })),
      ...SET.bushes.map((b) => ({ kind: 'circle' as const, x: b.x, z: b.z, r: b.r * 0.8 })),
      ...boardObstacles(),
    ],
    [],
  )
  return (
    <>
      <primitive attach="background" object={background} />
      <primitive attach="fog" object={fog} />
      <Clock />
      <DevStore />
      {/* the sun: its shadow follows the car (./Car moves it) */}
      <directionalLight
        name="sun"
        color={LOOK.light}
        intensity={LOOK.intensity}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-3200}
        shadow-camera-right={3200}
        shadow-camera-top={3200}
        shadow-camera-bottom={-3200}
        shadow-camera-near={200}
        shadow-camera-far={9000}
        shadow-bias={-0.0004}
        shadow-normalBias={1.5}
      />
      <Island />
      <Grass />
      <Walks />
      <Petals />
      {SET.trees.map((t, i) => (
        <CherryTree key={i} model={t.model} position={[t.x, 0, t.z]} rotation={t.rot} scale={t.scale} />
      ))}
      {SET.lamps.map((l, i) => (
        <LampPost key={i} slot={i} position={[l.x, 0, l.z]} />
      ))}
      {/* the physical side: the benches and signs, toys for the hand and the car (./Physical) */}
      <World floorY={-3000}>
        <QuadColliders />
        <CarBody state={car} size={CAR_BODY} />
        <LiveProps car={car} />
      </World>
      <Photos car={car} />
      <Building />
      <Hedges />
      <Car state={car} obstacles={obstacles} movers={propObstacles} paused={paused} />
    </>
  )
}

export function QuadStage() {
  const car = useRef<CarState>({ x: SET.start.x, z: SET.start.z, heading: SET.start.heading, v: 0 })
  if (import.meta.env.DEV) Object.assign(window, { __quadCar: car }) // (for trying it from the console)
  const viewing = !!useViewerOpen()
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 50, far: 40000, position: [0, 3300, 3900] }}>
        <Scene car={car} paused={viewing} />
      </Canvas>
      <PhotoViewer />
    </>
  )
}
