import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ToyControls } from '../stage/ToyControls'
import { Matrix4, PCFShadowMap, Quaternion, Vector3, type Group } from 'three'
import { H_MAX, H_MIN, IN, useDeskMotor } from '../../lib/motor'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { Stylize } from '../../lib/stylize'
import { Desk } from './Desk'
import { World } from '../../lib/physics/World'
import { DESK, STACK } from './spec'
import { Lamp } from '../room/Lamp'
import { SeatedDoll, SEATED } from '../doll/SeatedDoll'
import { LiveCharger, type ChargerSetup, type ChargerState } from '../charger/ChargerPhysics'
import { CHARGER, LAMP_BACK, cablePoints, lampOutlets } from '../charger/spec'
import { LAMP } from '../lamp/spec'
import { PLUGS, WallOutlet, cordRoute, plugBack } from '../power/PowerCord'
import { LiveCord, type CordSetup, type Socket } from '../power/LiveCord'
import { power } from '../../lib/power'
import { LiveWumpus } from '../wumpus/Wumpus'
import { perch } from '../wumpus/spec'
import { ClawClip } from '../clip/ClawClip'

// Rina's lamp on the back-right corner, and David (crocheted) sitting against its base
const LAMP_AT: [number, number, number] = [DESK.top.w / 2 - 125, 0, -DESK.top.d / 2 + 125]
const LAMP_YAW = -0.6 // turned to face into the desk
const DOLL_YAW = -1.3 // on the desk side of the lamp, facing the room
const DOLL_R = 110 - SEATED.backZ - 4 // his back against the rim of the lamp's base

/**
 * The wall outlet behind the desk (floating: there is no wall on this page), at outlet height, on
 * the right where the lamp and the desk's motor are. The lamp plugs into the top socket, the desk
 * into the bottom one.
 */
const OUTLET_AT: [number, number, number] = [450, 300, -DESK.top.d / 2 - 80]
const LAMP_OUTLETS = lampOutlets()
const LAMP_M = new Matrix4().makeRotationY(LAMP_YAW).setPosition(...LAMP_AT) // lamp frame -> desktop frame
const PERCH = perch() // Rina's Wumpus, tucked in the lamp's arm (lamp frame)
const CORD_R = PLUGS[2].cord
const MOTOR_X = DESK.legX - DESK.outer.w / 2 - DESK.motor.r - 2 // as Desk draws the motor
const MOTOR_Y = STACK.bracketBottom - DESK.motor.len - (DESK.topUnder + DESK.top.t) // its bottom, below the desktop
/**
 * The cords are just long enough: plugged in with the desk right up, with a little to spare, so they
 * hang from the desk to the wall (a deeper sag when it's down) rather than coil on the floor. The
 * desk's hangs round behind the right foot (x, z), not over it.
 */
const LAMP_CORD = 1100
const DESK_CORD = 950
const DESK_PLAN: [number, number][] = [[340, -305]]
/**
 * The charger's cable on the desk: out of its top, over its face toward the lamp's left (away from
 * the back corner), across the base and off it, then a loose loop round the far side of David out
 * toward the middle of the desk. (x, z) steps in the lamp's frame, left being -x.
 */
const CHARGER_LOOP: [number, number][] = [[-14, 10], [-85, 10], [-165, 100], [-185, 220], [-145, 340], [-65, 400], [15, 420]]
const LAMP_EDGE = Math.sqrt(LAMP.base.r ** 2 - (LAMP.base.ring + 1.5) ** 2) // port to the base's edge, going left

function DeskWithMotor() {
  const motor = useDeskMotor()
  const lamp = useRef<Group>(null)
  const top = useRef<Group>(null) // the desktop's frame (rides up and down)
  const lampSocket = useRef<Group>(null)
  const deskSocket = useRef<Group>(null)
  const [charger, setCharger] = useState<ChargerState>({ folded: false, plugged: true, pose: 1 })

  // Rina's charger lives in the lamp's back outlet; it plugs into any of the three
  const setup = useMemo<ChargerSetup>(() => {
    const lampWorld = () => {
      const l = lamp.current!
      l.updateWorldMatrix(true, false)
      return l.matrixWorld
    }
    return {
      outlets: () => (lamp.current ? LAMP_OUTLETS.map((m) => ({ frame: lampWorld().clone().multiply(m), flip: false })) : []),
      home: () => {
        const m = lampWorld()
        return { p: new Vector3(-190, CHARGER.body.h / 2, -40).applyMatrix4(m), q: new Quaternion().setFromRotationMatrix(m) }
      },
      cable: (S) => {
        const m = lampWorld()
        const ex = new Vector3().setFromMatrixColumn(m, 0).normalize()
        const ez = new Vector3().setFromMatrixColumn(m, 2).normalize()
        const floor = new Vector3().setFromMatrixPosition(m).y
        return cablePoints(S, 1, { ex, ez, floor, edge: LAMP_EDGE, loop: CHARGER_LOOP })
      },
      start: LAMP_BACK,
      startLabel: 'Plug back in',
      moving: () => motor.velocity !== 0,
    }
  }, [motor])

  /** the Wumpus's perch in the world (it rides the lamp up and down) */
  const perchAt = () => {
    const l = lamp.current
    if (!l) return null
    l.updateWorldMatrix(true, false)
    return l.matrixWorld.clone().multiply(PERCH)
  }

  /** points in the desktop's frame, to the world */
  const onTop = (pts: [number, number, number][]) => {
    const t = top.current
    if (!t) return []
    t.updateWorldMatrix(true, false)
    return pts.map((p) => new Vector3(...p).applyMatrix4(t.matrixWorld))
  }
  // the lamp's cord: out of the back of its base, across the desk and over its back edge
  const lampCord = useMemo(() => {
    const out = (d: number, y: number) => new Vector3(0, y, -d).applyMatrix4(LAMP_M)
    const a = out(LAMP.base.r + 3, 3.5) // (just outside the base: the cord leaves its side)
    const b = out(LAMP.base.r + 11, CORD_R + 0.5)
    const c = out(LAMP.base.r + 21, CORD_R)
    const back = -DESK.top.d / 2
    const x = c.x + 6
    // over the back edge round the desktop collider's square corner (its visible edge is rounded, but
    // the collider's corner sticks out past that), wide enough that even one straight 30 mm link across
    // the whole bend clears it: laid tighter, the links dig into the corner and spring out when let go
    const Rc = 10
    const arc = [90, 45, 0].map((deg) => [x, Rc * Math.sin((deg * Math.PI) / 180), back - Rc * Math.cos((deg * Math.PI) / 180)] as [number, number, number])
    return (): Vector3[] =>
      onTop([
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
        [c.x, c.y, c.z],
        [x, CORD_R + 1.5, back + 6],
        ...arc,
        [x, -45, back - Rc - 0.5],
      ])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // the desk's cord: out of the bottom of the motor under the top, straight down
  const deskCord = useMemo(() => {
    const x = MOTOR_X
    const y = MOTOR_Y
    return (): Vector3[] =>
      onTop([
        [x, y + 2, DESK.beam.z],
        [x, y - 10, DESK.beam.z],
        [x, y - 30, DESK.beam.z],
      ])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // the two cords: real, unpluggable; the lamp and the desk only work while they're in the wall
  const cords = useMemo(() => {
    // (none while the outlet isn't there: mounting, unmounting)
    const sockets = (): Socket[] =>
      [lampSocket, deskSocket].flatMap((r, i) => {
        if (!r.current) return []
        r.current.updateWorldMatrix(true, false)
        return [{ id: i ? 'bottom' : 'top', frame: r.current.matrixWorld.clone() }]
      })
    const backward = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI) // (the lamp's cord leaves along its -Z)
    const down = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, -1, 0))
    const moving = () => motor.velocity !== 0
    const lampCordSetup: CordSetup = {
      id: 'lamp',
      anchor: () => {
        const l = lamp.current!
        l.updateWorldMatrix(true, false)
        return { p: new Vector3(0, 3.5, -(LAMP.base.r + 3)).applyMatrix4(l.matrixWorld), q: new Quaternion().setFromRotationMatrix(l.matrixWorld).multiply(backward) }
      },
      run: (socket, depth) => cordRoute({ from: lampCord(), socket, side: 1, back: plugBack(2), r: PLUGS[2].cord, depth }),
      sockets,
      start: 0,
      length: LAMP_CORD,
      prongs: 2,
      onPower: (on) => power.set('lamp', on),
      moving,
    }
    const deskCordSetup: CordSetup = {
      id: 'desk',
      anchor: () => {
        const t = top.current!
        t.updateWorldMatrix(true, false)
        return { p: new Vector3(MOTOR_X, MOTOR_Y + 2, DESK.beam.z).applyMatrix4(t.matrixWorld), q: down }
      },
      run: (socket, depth) => cordRoute({ from: deskCord(), socket, side: -1, back: plugBack(3), r: PLUGS[3].cord, depth, plan: DESK_PLAN }),
      sockets,
      start: 1,
      length: DESK_CORD,
      prongs: 3,
      onPower: (on) => power.set('desk', on),
      moving,
    }
    return { lamp: lampCordSetup, desk: deskCordSetup }
  }, [motor]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Desk motor={motor}>
        <group ref={top} />
        <group ref={lamp} position={LAMP_AT} rotation={[0, LAMP_YAW, 0]}>
          <Lamp />
          <ClawClip />
        </group>
        <group position={[LAMP_AT[0] + Math.sin(DOLL_YAW) * DOLL_R, 0, LAMP_AT[2] + Math.cos(DOLL_YAW) * DOLL_R]} rotation={[0, DOLL_YAW, 0]}>
          <SeatedDoll />
        </group>
      </Desk>
      <LiveCharger state={charger} set={(p) => setCharger((s) => ({ ...s, ...p }))} setup={setup} />
      <LiveWumpus perchAt={perchAt} spawn={[LAMP_AT[0], 1000, LAMP_AT[2] + 150]} />
      <WallOutlet position={OUTLET_AT} top={lampSocket} bottom={deskSocket} />
      <LiveCord setup={cords.lamp} />
      {/* under the desk it keeps inside the right foot, then round behind it to the wall */}
      <LiveCord setup={cords.desk} />
    </>
  )
}

function Scene() {
  return (
    <>
      {/* small biases (the depth one is a share of the shadow camera's 6 m depth: 0.00008 is 0.5 mm): thin
          cables (4 mm) lying on the desk keep their shadows */}
      <ToyLights extent={950} mapSize={4096} normalBias={0.5} bias={-0.00008} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2600, 96]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <World timeStep={1 / 120}>
        <Suspense fallback={null}>
          <DeskWithMotor />
        </Suspense>
      </World>
    </>
  )
}

const HERO: [number, number, number] = [-1500, 1350, 2150]
const TARGET: [number, number, number] = [0, 600, 0]

/** Full-screen interactive desk. World units: mm. */
export function DeskStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: HERO, fov: 32, near: 10, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={40} />
      <ToyControls target={TARGET} minDistance={300} maxDistance={5000} maxPolarAngle={Math.PI / 2.05} enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

export function DeskCheck() {
  const c = new Vector3(0, 600, 0)
  return (
    <CheckSheet
      scene={() => <Scene />}
      views={[
        { kind: 'image', label: 'reference: product', src: '/reference/desk-product.webp' },
        { kind: 'hero', label: 'hero (drag)', position: HERO, target: TARGET, fov: 32 },
        { kind: 'image', label: 'reference: dimensions', src: '/reference/desk-dimensions.webp' },
        { kind: 'ortho', label: `front · ${(H_MIN / IN).toFixed(1)}" to ${(H_MAX / IN).toFixed(1)}"`, from: new Vector3(0, 600, 4000), at: c, zoom: 0.34 },
        { kind: 'ortho', label: 'right side', from: new Vector3(4000, 600, 0), at: c, zoom: 0.34 },
        {
          kind: 'text',
          label: 'spec (mm)',
          text: `top        ${DESK.top.w.toFixed(0)} × ${DESK.top.d.toFixed(0)} × ${DESK.top.t}
legs       ${(2 * DESK.legX).toFixed(0)} apart (centres)
outer tube ${DESK.outer.w} × ${DESK.outer.d} × ${DESK.outer.len}
inner tube ${DESK.inner.w} × ${DESK.inner.d} × ${DESK.inner.len}
overlap at max  ${(STACK.innerTop - (STACK.outerBottom + (H_MAX - H_MIN))).toFixed(0)}
inner showing at min  ${(STACK.outerBottom - STACK.footTop).toFixed(0)}
foot       ${DESK.foot.length} × ${DESK.foot.width} × ${DESK.foot.height}`,
        },
      ]}
    />
  )
}
