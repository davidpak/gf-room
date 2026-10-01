import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, useBeforePhysicsStep } from '@react-three/rapier'
import { Euler, Quaternion, Vector3 } from 'three'
import { Glider, type LimeRig } from '../lime/Glider'
import { Scooter } from '../lime/Scooter'
import { AXLE, WHEEL } from '../lime/spec'
import { AX, WHEELS } from '../lime/scooterSpec'
import { liveBody, LiveProp, propObstacles } from './Physical'
import { inIsland, SET } from './set'
import { groundAt, held, type CarState, type Obstacle } from './Car'
import { getRide, hopOff, hopOn, useRide } from './ride'
import { getLook, useLook as useLookNow } from './look'
import { onReset } from './reset'
import { stepTime } from '../../lib/physics/World'
import { motor, park, unlock } from '../../lib/sound/lime'
import { Static } from '../../lib/render/Static'

/**
 * Lime's rentals on the Quad (../lime): Gliders and scooters parked on the walks, on their kickstands, loose things the car
 * can knock over (a prompt stands each back up). At the benches' toy scale, 0.24.
 *
 * And ridden: click one and you're on it (its unlock chime; the car's left where it is, its keys now the Lime's,
 * the camera on the Lime). W A S D rides it (space brakes; held back it creeps backward), its bars turning, its
 * wheels rolling, leaning into the turns; it bumps off the trees, the car and the halls as the car does, and
 * shoves the loose things. E or Esc and it's parked where it stands (the chime falling, the kickstand down).
 * R puts it back where it was.
 */
const K = 0.24
const PAVING = 25
/** a Glider's body as a box (its frame: the rear axle on the ground at the origin, forward +x) */
const BOX = { x0: -250, x1: 1370, y1: 760, w: 300 }
/** a scooter's: its deck and frame low down, its stem up at the front */
const SC = { x0: -215, x1: 1190, y1: 600, w: 150, stem: { x: 900, y: 860, h: 260, w: 120 } }
/** their handlebars, solid too (a knocked-over one lies on its grips, not through them): where the bar runs
 *  across, how high, how far each way (../lime/spec BAR, STEM.clamp: ~580 across at 978; ./scooterSpec BARS:
 *  ~465 across at 1113) */
const GLIDER_BAR = { x: 840, y: 978, half: 300 }
const SCOOTER_BAR = { x: 840, y: 1113, half: 245 }

/** how each rides (toy mm, mm/s): its wheelbase, the radius of the wheel that's turned for its roll, where it's
 *  felt for bumping (circles along it from the rear axle, and their radius), how fast */
type Kind = 'glider' | 'scooter'
const RIDE: Record<Kind, { base: number; wheel: number; along: number[]; r: number; max: number }> = {
  glider: { base: (AXLE.front[0] - AXLE.rear[0]) * K, wheel: (WHEEL.od / 2) * K, along: [-100, 560, 1220].map((x) => x * K), r: 40, max: 1500 },
  scooter: { base: (AX.front[0] - AX.rear[0]) * K, wheel: (WHEELS.rear.od / 2) * K, along: [-100, 490, 1080].map((x) => x * K), r: 32, max: 1300 },
}
const ACCEL = 1300
const BRAKE = 2800
const BACK = 300 // (held back, stopped: it creeps backward, walked)
const STEER = 0.5
/** how far into a loose thing it presses before it's stopped (it shoves it first) */
const SOFT = 30
/** the car, for bumping into: three circles down its length (as it bumps into things itself) */
const CAR_ALONG = [-184, 0, 184]
const CAR_R = 110

const _q = new Quaternion()
const _e = new Euler(0, 0, 0, 'YZX')
const _f = new Vector3()

export function QuadLime({ car, obstacles }: { car: { current: CarState }; obstacles: Obstacle[] }) {
  // getting off: E or Esc; R (everything back) too
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!getRide() || getLook() || (e.code !== 'KeyE' && e.code !== 'Escape')) return
      e.preventDefault()
      hopOff()
    }
    window.addEventListener('keydown', key)
    const off = onReset(() => hopOff())
    return () => {
      window.removeEventListener('keydown', key)
      off()
    }
  }, [])
  return (
    <>
      {SET.lime.gliders.map((g, i) => (
        <Lime key={`g${i}`} kind="glider" id={`glider${i}`} at={g} car={car} obstacles={obstacles} />
      ))}
      {SET.lime.scooters.map((g, i) => (
        <Lime key={`s${i}`} kind="scooter" id={`scooter${i}`} at={g} car={car} obstacles={obstacles} />
      ))}
    </>
  )
}

function Lime({ kind, id, at, car, obstacles }: { kind: Kind; id: string; at: { x: number; z: number; rot: number }; car: { current: CarState }; obstacles: Obstacle[] }) {
  const riding = useRide()?.id === id
  const spec = RIDE[kind]
  // where it's taken each step while ridden (./Physical LiveProp drive), and its moving parts
  const drive = useRef<{ p: Vector3; q: Quaternion } | null>(null)
  const pose = useMemo(() => ({ p: new Vector3(), q: new Quaternion() }), [])
  const rig: LimeRig = useRef({ steer: 0, spin: 0, stand: 1 })
  const m = useRef({ steer: 0, lean: 0, pitch: 0, on: false })

  // on: from where it stands now (stood up, if it was lying down), its kickstand coming up
  const mount = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (riding || getLook()) return
    const b = liveBody(id)
    if (!b) return
    const t = b.translation()
    const r = b.rotation()
    _f.set(1, 0, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w))
    hopOn({ id, x: t.x, y: t.y, z: t.z, heading: Math.atan2(_f.x, _f.z), v: 0 })
  }

  // riding it: each physics step (so it moves as evenly as the physics does)
  useBeforePhysicsStep(() => {
    const r = getRide()
    const st = m.current
    const g = rig.current
    if (!r || r.id !== id) {
      if (st.on) {
        // let go: parked where it is, upright, its kickstand down
        st.on = false
        drive.current = null
        g.steer = 0
        g.stand = 1
        motor(0)
        park()
      }
      return
    }
    if (!st.on) {
      st.on = true
      st.steer = st.lean = st.pitch = 0
      unlock()
    }
    const dt = stepTime()
    // the push, the brakes, the coasting
    const up = held('up')
    const down = held('down')
    let a = 0
    if (up) a = r.v < 0 ? BRAKE : ACCEL * (1 - Math.max(0, r.v) / spec.max)
    else if (down) a = r.v > 0 ? -BRAKE : -ACCEL * 0.5 * (1 - Math.max(0, -r.v) / BACK)
    r.v += a * dt
    r.v *= 1 - (up || down ? 0.2 : 1.1) * dt
    if (held('brake')) r.v *= 1 - 6 * dt
    if (Math.abs(r.v) < 4 && !up && !down) r.v = 0
    // the bars: gentler the faster it goes; it turns about its back wheel
    const want = ((held('left') ? 1 : 0) - (held('right') ? 1 : 0)) * STEER * (1 - Math.min(0.6, (Math.abs(r.v) / spec.max) * 0.6))
    st.steer += (want - st.steer) * Math.min(1, dt * 9)
    const yaw = (r.v / spec.base) * Math.tan(st.steer)
    r.heading += yaw * dt
    const fx = Math.sin(r.heading)
    const fz = Math.cos(r.heading)
    let nx = r.x + fx * r.v * dt
    let nz = r.z + fz * r.v * dt
    // bumping: circles down its length pushed clear of the trees, the halls, the car, the loose things
    const c = car.current
    const cs = Math.sin(c.heading)
    const cc = Math.cos(c.heading)
    const loose = propObstacles(id)
    let hit = false
    for (let pass = 0; pass < 2; pass++)
      for (const along of spec.along) {
        const px0 = nx + fx * along
        const pz0 = nz + fz * along
        let px = 0
        let pz = 0
        const push = (dx: number, dz: number, min: number) => {
          const d = Math.hypot(dx, dz)
          if (d >= min || d < 1e-6) return
          const k = (min - d) / d
          if ((min - d) ** 2 > px * px + pz * pz) [px, pz] = [dx * k, dz * k]
          hit = true
        }
        for (const o of obstacles) {
          if (o.kind === 'circle') push(px0 - o.x, pz0 - o.z, o.r + spec.r)
          else push(px0 - Math.max(o.x - o.w / 2, Math.min(px0, o.x + o.w / 2)), pz0 - Math.max(o.z - o.d / 2, Math.min(pz0, o.z + o.d / 2)), spec.r)
        }
        for (const o of loose) if (o.kind === 'circle') push(px0 - o.x, pz0 - o.z, Math.max(spec.r * 0.6, o.r + spec.r - SOFT))
        for (const al of CAR_ALONG) push(px0 - (c.x + cs * al), pz0 - (c.z + cc * al), CAR_R + spec.r)
        nx += px
        nz += pz
      }
    // the island's edge: it stops there
    const tip = spec.along[spec.along.length - 1]
    if (!inIsland(nx + fx * tip, nz + fz * tip, 20) || !inIsland(nx + fx * spec.along[0], nz + fz * spec.along[0], 20)) {
      nx = r.x
      nz = r.z
      hit = true
    }
    if (hit) r.v *= 1 - Math.min(1, 6 * dt)
    r.x = nx
    r.z = nz
    // on the ground under its wheels (up onto the bricks, down off them), nose up or down with it
    const back = groundAt(r.x, r.z)
    const front = groundAt(r.x + fx * spec.base, r.z + fz * spec.base)
    r.y = back
    st.pitch += (Math.atan2(front - back, spec.base) - st.pitch) * Math.min(1, dt * 20)
    // leaning into the turn (more the faster and tighter), the wheels rolling, the bars turned
    st.lean += (Math.max(-0.32, Math.min(0.32, -yaw * r.v * 0.00035)) - st.lean) * Math.min(1, dt * 6)
    g.spin += (r.v * dt) / spec.wheel
    g.steer = st.steer
    g.stand = Math.max(0, g.stand - dt * 4) // (the kickstand swinging up)
    // its pose (the model's forward is +x): turned to its heading, nosed up, leant
    pose.p.set(r.x, r.y, r.z)
    pose.q.setFromEuler(_e.set(st.lean, r.heading - Math.PI / 2, st.pitch, 'YZX'))
    drive.current = pose
  })
  // the motor's whine, with the speed
  useFrame(() => {
    const r = getRide()
    if (r && r.id === id) motor(Math.abs(r.v) / spec.max)
  })

  const pointer = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = riding ? '' : 'pointer'
  }
  const press = (e: ThreeEvent<PointerEvent>) => void (riding && e.stopPropagation()) // (ridden, it's not to be picked up)
  const label = kind === 'glider' ? 'Stand the Glider up' : 'Stand the scooter up'
  return (
    <LiveProp
      id={id}
      label={label}
      at={{ x: at.x, y: PAVING, z: at.z, rot: at.rot }}
      car={car}
      lift={0}
      feelAlong={kind === 'glider' ? [0, 0.5 * (BOX.x1 + BOX.x0) * K, BOX.x1 * K * 0.9] : [0, 0.5 * (SC.x1 + SC.x0) * K, SC.x1 * K * 0.9]}
      feelR={kind === 'glider' ? (BOX.w / 2) * K : (SC.w / 2) * K}
      drive={drive}
    >
      <group scale={K} onClick={mount} onPointerDown={press} onPointerOver={pointer} onPointerOut={() => (document.body.style.cursor = '')}>
        <Static>{kind === 'glider' ? <Glider rig={riding ? rig : undefined} live={riding} /> : <Scooter detail={2} rig={riding ? rig : undefined} live={riding} />}</Static>
      </group>
      {kind === 'glider' ? (
        <>
          <CuboidCollider args={[((BOX.x1 - BOX.x0) / 2) * K, (BOX.y1 / 2) * K, (BOX.w / 2) * K]} position={[((BOX.x1 + BOX.x0) / 2) * K, (BOX.y1 / 2) * K, 0]} mass={1.2} friction={0.8} />
          <CuboidCollider args={[40 * K, ((GLIDER_BAR.y - BOX.y1) / 2 + 30) * K, 40 * K]} position={[GLIDER_BAR.x * K, ((GLIDER_BAR.y + BOX.y1) / 2) * K, 0]} mass={0.1} friction={0.8} />
          <CuboidCollider args={[40 * K, 30 * K, GLIDER_BAR.half * K]} position={[GLIDER_BAR.x * K, GLIDER_BAR.y * K, 0]} mass={0.15} friction={0.8} />
        </>
      ) : (
        <>
          <CuboidCollider args={[((SC.x1 - SC.x0) / 2) * K, (SC.y1 / 2) * K, (SC.w / 2) * K]} position={[((SC.x1 + SC.x0) / 2) * K, (SC.y1 / 2) * K, 0]} mass={0.8} friction={0.8} />
          <CuboidCollider args={[50 * K, SC.stem.h * K, (SC.stem.w / 2) * K]} position={[SC.stem.x * K, SC.stem.y * K, 0]} mass={0.2} friction={0.8} />
          <CuboidCollider args={[40 * K, 30 * K, SCOOTER_BAR.half * K]} position={[SCOOTER_BAR.x * K, SCOOTER_BAR.y * K, 0]} mass={0.1} friction={0.8} />
        </>
      )}
    </LiveProp>
  )
}

/** while one's ridden: what it is and how to ride it (in the page, under the Quad) */
export function RideHint() {
  const r = useRide()
  const looking = !!useLookNow()
  const on = !!r && !looking
  return (
    <div className={'quad-near' + (on ? ' on' : '')}>
      {r && (
        <>
          on the {r.id.startsWith('glider') ? 'Glider' : 'scooter'} · <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to ride · <kbd>space</kbd> to brake · <kbd>E</kbd> to hop off
        </>
      )}
    </div>
  )
}
