import { CuboidCollider, CylinderCollider, RigidBody, useBeforePhysicsStep, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { openings, stowed } from '../civic/Civic'
import { TOY } from '../civic/spec'
import { onReset } from './reset'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { Bench, BENCH } from './Furniture'
import { Sign, SIGN } from './Sign'
import { shootProps } from './ShootSet'
import { cookieSignProp } from './CookieStand'
import type { CAR_SHAPE, CarState, Obstacle } from './Car'
import { PADS, SET } from './set'
import { Static } from '../../lib/render/Static'

/**
 * The Quad's physical side, in the shared toy world (lib/physics/World): what the benches rest on and
 * knock against, the car as a body that shoves them, and the loose things themselves (the benches,
 * the lawn signs), things like any other in the room: picked up, carried and turned with the hand, and
 * put back by a fix-it prompt.
 *
 *   ground      the lawn (the island's top), the walks and pads a brick's height above it; off the
 *               island's edge nothing (a bench pushed off falls, and comes back where it started)
 *   solid       the trunks, the lamp posts, the building, the hedge and the bushes
 *   the car     a body the car's own driving moves (kinematic): it pushes what it drives into. Its
 *               trunk's a well: whatever's put in it and settles there rides along with it (held to it, kinematic) till it's picked up again or flown home
 */
const LAWN = 4
const PAVING = 25

export function QuadColliders() {
  const { x0, x1, z0, z1 } = SET.island
  const walks = useMemo(
    () =>
      SET.walks.map((wk) => {
        const [ax, az] = wk.a
        const [bx, bz] = wk.b
        const len = Math.hypot(bx - ax, bz - az)
        return { p: [(ax + bx) / 2, PAVING - 40, (az + bz) / 2] as [number, number, number], r: [0, Math.atan2(-(bz - az), bx - ax), 0] as [number, number, number], h: [len / 2, 40, wk.w / 2] as [number, number, number] }
      }),
    [],
  )
  return (
    <RigidBody type="fixed" colliders={false}>
      {/* the lawn */}
      <CuboidCollider args={[(x1 - x0) / 2, 80, (z1 - z0) / 2]} position={[(x0 + x1) / 2, LAWN - 80, (z0 + z1) / 2]} friction={0.9} />
      {/* the walks and pads */}
      {walks.map((w, i) => (
        <CuboidCollider key={i} args={w.h} position={w.p} rotation={w.r} friction={0.9} />
      ))}
      {PADS.map((p, i) => (
        <CuboidCollider key={`p${i}`} args={[p.w / 2, 40, p.d / 2]} position={[p.x, PAVING - 40, p.z]} friction={0.9} />
      ))}
      {/* the trunks, the lamp posts */}
      {SET.trees.map((t, i) => (
        <CylinderCollider key={`t${i}`} args={[450, 105 * t.scale]} position={[t.x, 450, t.z]} />
      ))}
      {SET.lamps.map((l, i) => (
        <CylinderCollider key={`l${i}`} args={[500, 30]} position={[l.x, 500, l.z]} />
      ))}
      {/* the building, the hedge, the bushes */}
      {SET.building.blocks.map((b, i) => (
        <CuboidCollider key={`b${i}`} args={[(b.x1 - b.x0) / 2, SET.building.h / 2, (b.z1 - b.z0) / 2]} position={[(b.x0 + b.x1) / 2, SET.building.h / 2, (b.z0 + b.z1) / 2]} />
      ))}
      {SET.hedges.map((h, i) => (
        <CuboidCollider key={`h${i}`} args={[(h.x1 - h.x0) / 2, h.h / 2, h.d / 2]} position={[(h.x0 + h.x1) / 2, h.h / 2, h.z]} />
      ))}
      {/* the bench photo's easel */}
      <CuboidCollider args={[95, 135, 70]} position={[SET.photos.easel.x, 135, SET.photos.easel.z]} rotation={[0, SET.photos.easel.rot, 0]} />
      {SET.bushes.map((b, i) => (
        <CylinderCollider key={`s${i}`} args={[b.r * 0.6, b.r * 0.8]} position={[b.x, b.r * 0.6, b.z]} />
      ))}
    </RigidBody>
  )
}

/** the car as a body: its driving moves it (kinematic), so it shoves whatever it drives into. Its
 *  shape the body and the cabin on it, as drawn (a bench shoved up onto it rests on the roof, not in it) */
export function CarBody({ state, shape }: { state: { current: CarState }; shape: typeof CAR_SHAPE }) {
  const body = useRef<RapierRigidBody>(null)
  const q = useMemo(() => new Quaternion(), [])
  const e = useMemo(() => new Euler(), [])
  const lid = useRef<RapierCollider>(null)
  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b) return
    const s = state.current
    b.setNextKinematicTranslation({ x: s.x, y: s.y ?? 0, z: s.z })
    b.setNextKinematicRotation(q.setFromEuler(e.set(0, s.heading, 0)))
    lid.current?.setEnabled(!openings.trunk) // (the lid's there while it's shut)
  })
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[state.current.x, 0, state.current.z]}>
      {shape.parts.map((p, i) => (
        <CuboidCollider key={i} args={p.half} position={p.at} friction={0.6} />
      ))}
      <CuboidCollider ref={lid} args={shape.lid.half} position={shape.lid.at} friction={0.6} />
    </RigidBody>
  )
}

/** where the loose things are now, for the car to feel (./Car movers): circles down each one's
 *  length. The car shoves a thing that gives; one that can't (pinned against a trunk) stops it, rather
 *  than the car driving through it */
type Feel = { body: { current: RapierRigidBody | null }; pts: [number, number][]; r: number }
const feel = new Map<string, Feel>()
/** a loose thing's body, by its id (where it is now: the lemonade pours into a glass wherever it's been put) */
export const liveBody = (id: string) => feel.get(id)?.body.current ?? null
const _p = new Vector3()
const _q = new Quaternion()
export function propObstacles(): Obstacle[] {
  const out: Obstacle[] = []
  const c = carNow.current
  const [ch, sh] = [Math.cos(c?.heading ?? 0), Math.sin(c?.heading ?? 0)]
  for (const [id, f] of feel) {
    const b = f.body.current
    if (!b || stowed.has(id)) continue
    const t = b.translation()
    // (in or on the car itself: not something for it to bump into)
    if (c) {
      const dx = t.x - c.x
      const dz = t.z - c.z
      if (Math.abs(ch * dx - sh * dz) < CAR_HALF.w && Math.abs(sh * dx + ch * dz) < CAR_HALF.l) continue
    }
    const q = b.rotation()
    _q.set(q.x, q.y, q.z, q.w)
    for (const [px, pz] of f.pts) {
      _p.set(px, 0, pz).applyQuaternion(_q)
      out.push({ kind: 'circle', x: t.x + _p.x, z: t.z + _p.z, r: f.r, soft: true })
    }
  }
  return out
}

/** the sets of loose things put back together by one prompt (the cookie stand): each member's own
 *  prompt (is it out of place?) and how to send it home at once */
const sets = new Map<string, Map<string, { out: () => boolean; home: () => void }>>()
/** a set's one prompt: there when anything of it is out of place (knocked over, carried off), and it
 *  puts every piece of it straight back */
export function setPrompt(set: string, label: string, at: (o: Vector3) => Vector3): PromptItem {
  return {
    key: set,
    label,
    icon: 'home',
    at,
    when: () => [...(sets.get(set)?.values() ?? [])].some((m) => m.out()),
    run: () => sets.get(set)?.forEach((m) => m.home()),
  }
}

/** a loose thing of the Quad's: resting at home (held fast there till something moves it), a toy for
 *  the hand and the car, a prompt to put it back (or, one of a `set`, its set's) */
export function LiveProp({ id, label, at, car, lift, feelAlong, feelPts, feelR, set, pose, children }: { id: string; label: string; at: { x: number; y: number; z: number; rot: number; q?: Quaternion }; car: { current: CarState }; lift: number; feelAlong?: number[]; feelPts?: [number, number][]; feelR: number; set?: string; pose?: { current: { p: Vector3; q: Quaternion } | null }; children: ReactNode }) {
  // (home turned about the vertical by `rot`, or any way at all by `q`: the guitar leans)
  const home = useMemo(() => new Matrix4().compose(new Vector3(at.x, at.y, at.z), at.q ?? new Quaternion().setFromEuler(new Euler(0, at.rot, 0)), new Vector3(1, 1, 1)), [at])
  // held up somewhere by its owner (`pose`: the guitar, up to be played): there it goes and stays, and
  // when it's let go it flies home
  const posed = useRef(false)
  const perch = usePerch({
    key: id,
    label,
    perchAt: () => home,
    approach: new Vector3(0, 1, 0),
    distance: 160,
    snap: 0, // (it stays where it's put)
    away: 120,
    lift,
  })
  feel.set(id, { body: perch.body, pts: feelPts ?? (feelAlong ?? [0]).map((a) => [a, 0] as [number, number]), r: feelR })
  if (import.meta.env.DEV) ((window as unknown as { __props: Record<string, unknown> }).__props ??= {})[id] = perch // (for trying it from the console)
  // riding in the trunk: where it sits in the car's frame
  const ride = useRef<{ p: Vector3; q: Quaternion } | null>(null)
  // just put back: it stays put till the car's been away (so a reset with the car right there doesn't
  // knock it straight over again)
  const settle = useRef(false)
  // how near the car comes before it's let go: nearer for a big thing (the canopy's legs are well out
  // from its middle), so the car never meets a piece of it that's still held fast
  const reach = set ? Math.max(0, Math.max(...(feelPts ?? [[0, 0]]).map(([x, z]) => Math.hypot(x, z))) + feelR - 200) : 0
  // a hard reset (R), or its set's prompt: straight home, held there as at the start
  const sendHome = useMemo(
    () => () => {
        const body = perch.body.current
        ride.current = null
        stowed.delete(id)
        perch.fly.current = null
        perch.st.current.perched = true
        settle.current = true
        if (!body) return
        // (put there at once: a move, with continuous collision on, would stop at the first thing in the way.
        // Moved while kinematic, not fixed: a fixed body sleeps, and a sleeping one's mesh isn't moved to
        // match it, so it'd stay drawn where it fell. ./usePerch fixes it there once it's still)
        body.setBodyType(perch.rapier.RigidBodyType.KinematicPositionBased, true)
        perch.st.current.still = 0
        body.setTranslation(new Vector3().setFromMatrixPosition(home), true)
        body.setRotation(new Quaternion().setFromRotationMatrix(home), true)
        body.setNextKinematicTranslation(new Vector3().setFromMatrixPosition(home))
        body.setNextKinematicRotation(new Quaternion().setFromRotationMatrix(home))
        body.wakeUp()
      },
    [id, perch, home],
  )
  useEffect(() => onReset(sendHome), [sendHome])
  useEffect(() => {
    if (!set) return
    if (!sets.has(set)) sets.set(set, new Map())
    const members = sets.get(set)!
    members.set(id, { out: () => perch.prompt.when(), home: sendHome })
    return () => void members.delete(id)
  }, [set, id, perch, sendHome])
  useBeforePhysicsStep(() => {
    const body = perch.body.current
    if (!body) return
    const s = perch.st.current
    const c = car.current
    const want = pose?.current
    if (want) {
      if (!posed.current) {
        posed.current = true
        ride.current = null
        stowed.delete(id)
        perch.fly.current = null
        s.perched = false
        settle.current = false
        body.setBodyType(perch.rapier.RigidBodyType.KinematicPositionBased, true)
      }
      // (glides there, and holds it)
      const t = body.translation()
      const r = body.rotation()
      body.setNextKinematicTranslation(_p.set(t.x, t.y, t.z).lerp(want.p, 0.16))
      body.setNextKinematicRotation(_q.set(r.x, r.y, r.z, r.w).slerp(want.q, 0.16))
      return
    }
    if (posed.current) {
      posed.current = false
      perch.flyHome()
      return
    }
    // the car coming at it: it's let go (loose) so the car can shove it
    if (s.perched) {
      const d = Math.hypot(c.x - at.x, c.z - at.z)
      if (settle.current) {
        if (d > 700 + reach) settle.current = false
        return
      }
      if (d > 520 + reach) return
      s.perched = false
      body.setBodyType(perch.rapier.RigidBodyType.Dynamic, true)
      body.wakeUp()
      return
    }
    carQ.setFromEuler(carE.set(0, c.heading, 0))
    const r = ride.current
    if (r) {
      // picked up, or flown home: it leaves the trunk
      if (s.held || perch.fly.current) {
        ride.current = null
        stowed.delete(id)
        return
      }
      _p.copy(r.p).applyQuaternion(carQ).add(_v.set(c.x, c.y ?? 0, c.z))
      body.setNextKinematicTranslation(_p)
      body.setNextKinematicRotation(_q.copy(carQ).multiply(r.q))
      return
    }
    // settled in or on the car: it rides along from now on (not the stand's pieces: a canopy the car's
    // parked under isn't in its trunk)
    if (set || s.held || perch.fly.current || !body.isDynamic()) return
    const v = body.linvel()
    if (Math.hypot(v.x, v.y, v.z) > 25) return
    const w = CAR_WELL
    const com = body.worldCom()
    _p.set(com.x - c.x, com.y - (c.y ?? 0), com.z - c.z).applyQuaternion(_q.copy(carQ).invert())
    // (in the trunk's well only: not up on the hood or roof, where the car's own moving tips it off, nor
    // resting against its side, pushed there)
    const inWell = Math.abs(_p.x) < w.x + 10 && _p.z > w.z0 - 10 && _p.z < w.z1 + 10 && _p.y > w.floor - 20 && _p.y < CAR_HALF.h + 260
    if (!inWell) return
    const t = body.translation()
    const o = body.rotation()
    const inv = _q.copy(carQ).invert()
    ride.current = {
      p: new Vector3(t.x - c.x, t.y - (c.y ?? 0), t.z - c.z).applyQuaternion(inv),
      q: inv.clone().multiply(new Quaternion(o.x, o.y, o.z, o.w)),
    }
    stowed.set(id, _p.z < w.z1 + 30) // (in the trunk, or up on the roof)
    body.setBodyType(perch.rapier.RigidBodyType.KinematicPositionBased, true)
  })
  return (
    <>
      <Holdable ccd bodyRef={perch.body} position={[at.x, at.y, at.z]} rotation={at.q ? new Euler().setFromQuaternion(at.q).toArray().slice(0, 3) as [number, number, number] : [0, at.rot, 0]} colliders={false} linearDamping={0.4} angularDamping={0.8} hold={{ ...perch.hold, lift: 60 }} sound="none">
        <group {...perch.hover.bind}>{children}</group>
      </Holdable>
      {!set && <Prompts items={[perch.prompt]} far={9000} />}
    </>
  )
}

/** the benches on their pads; the lawn signs */
/** the car, for telling what's in or on it (set by LiveProps) */
const carNow: { current: CarState | null } = { current: null }
const CAR_HALF = { w: 1826 * TOY.k * 0.5 + 10, l: 4630 * TOY.k * 0.5 + 10, h: 1457 * TOY.k }
const carQ = new Quaternion()
const carE = new Euler()
const _v = new Vector3()
/** the trunk's well, in the car's frame (toy mm) */
let CAR_WELL = { x: 0, z0: 0, z1: 0, floor: 0, rim: 0 }
export const setCarWell = (w: typeof CAR_WELL) => void (CAR_WELL = w)

export function LiveProps({ car }: { car: { current: CarState } }) {
  carNow.current = car.current
  return (
    <>
      {SET.benches.map((b, i) => (
        <LiveProp key={`bench${i}`} id={`bench${i}`} label="Put the bench back" at={{ x: b.x, y: PAVING, z: b.z, rot: b.rot }} car={car} lift={330} feelAlong={[-150, 0, 150]} feelR={105}>
          <Static>
            <Bench />
          </Static>
          {/* its seat and legs a block, its back a slab raked back */}
          <CuboidCollider args={[BENCH.L / 2, BENCH.seat / 2, 62]} position={[0, BENCH.seat / 2, 0]} mass={6} friction={0.7} />
          <CuboidCollider args={[BENCH.L / 2, 75, 9]} position={[0, BENCH.seat + 70, -62]} rotation={[-0.16, 0, 0]} mass={2} friction={0.7} />
        </LiveProp>
      ))}
      {/* the photo shoot's kit (./ShootSet) */}
      {[...shootProps(), cookieSignProp()].map((p) => (
        <LiveProp key={p.id} id={p.id} label={p.label} at={p.at} car={car} lift={p.lift} feelAlong={p.feelAlong} feelPts={'feelPts' in p ? p.feelPts : undefined} feelR={p.feelR} set={'set' in p ? (p.set as string) : undefined}>
          {p.id.includes('laptop') ? p.node : <Static>{p.node}</Static>}
          {p.colliders}
        </LiveProp>
      ))}
      {SET.signs.map((s, i) => (
        <LiveProp key={`sign${i}`} id={`sign${i}`} label="Stand the sign back up" at={{ x: s.x, y: LAWN, z: s.z, rot: s.rot }} car={car} lift={SIGN.low + SIGN.h + 60} feelAlong={[-70, 70]} feelR={40}>
          <Static>
            <Sign />
          </Static>
          {/* the board, and the stake's legs below it */}
          <CuboidCollider args={[SIGN.w / 2, SIGN.h / 2, SIGN.t / 2 + 2]} position={[0, SIGN.low + SIGN.h / 2, 0]} mass={0.6} friction={0.6} />
          <CuboidCollider args={[SIGN.apart / 2 + 4, SIGN.low / 2, 6]} position={[0, SIGN.low / 2, -SIGN.t / 2 - SIGN.stake]} mass={0.3} friction={0.8} />
        </LiveProp>
      ))}
    </>
  )
}
