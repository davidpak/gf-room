import { CuboidCollider, CylinderCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import { useMemo, useRef, type ReactNode } from 'react'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { Prompts } from '../prompt/Prompts'
import { Bench, BENCH } from './Furniture'
import { Sign, SIGN } from './Sign'
import type { CarState, Obstacle } from './Car'
import { PADS, SET } from './set'

/**
 * The Quad's physical side, in the shared toy world (lib/physics/World): what the benches rest on and
 * knock against, the car as a body that shoves them, and the loose things themselves (the benches,
 * the lawn signs), things like any other in the room: picked up, carried and turned with the hand, and
 * put back by a fix-it prompt.
 *
 *   ground      the lawn (the island's top), the walks and pads a brick's height above it; off the
 *               island's edge nothing (a bench pushed off falls, and comes back where it started)
 *   solid       the trunks, the lamp posts, the building, the hedge and the bushes
 *   the car     a body the car's own driving moves (kinematic): it pushes what it drives into
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
      {SET.bushes.map((b, i) => (
        <CylinderCollider key={`s${i}`} args={[b.r * 0.6, b.r * 0.8]} position={[b.x, b.r * 0.6, b.z]} />
      ))}
    </RigidBody>
  )
}

/** the car as a body: its driving moves it (kinematic), so it shoves whatever it drives into. Its
 *  shape the body and the cabin on it, as drawn (a bench shoved up onto it rests on the roof, not in it) */
export function CarBody({ state, size }: { state: { current: CarState }; size: { l: number; w: number; h: number } }) {
  const body = useRef<RapierRigidBody>(null)
  const q = useMemo(() => new Quaternion(), [])
  const e = useMemo(() => new Euler(), [])
  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b) return
    const s = state.current
    b.setNextKinematicTranslation({ x: s.x, y: 0, z: s.z })
    b.setNextKinematicRotation(q.setFromEuler(e.set(0, s.heading, 0)))
  })
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[state.current.x, 0, state.current.z]}>
      <CuboidCollider args={[size.w / 2, size.h / 2 - 3, size.l / 2]} position={[0, size.h / 2 + 8, 0]} friction={0.4} />
      <CuboidCollider args={[size.w * 0.43, 46, size.l * 0.25]} position={[0, size.h + 40, -30]} friction={0.4} />
    </RigidBody>
  )
}

/** where the loose things are now, for the car to feel (./Car movers): circles down each one's
 *  length. The car shoves a thing that gives; one that can't (pinned against a trunk) stops it, rather
 *  than the car driving through it */
type Feel = { body: { current: RapierRigidBody | null }; along: number[]; r: number }
const feel = new Map<string, Feel>()
const _p = new Vector3()
const _q = new Quaternion()
export function propObstacles(): Obstacle[] {
  const out: Obstacle[] = []
  for (const f of feel.values()) {
    const b = f.body.current
    if (!b) continue
    const t = b.translation()
    const q = b.rotation()
    _q.set(q.x, q.y, q.z, q.w)
    for (const along of f.along) {
      _p.set(along, 0, 0).applyQuaternion(_q)
      out.push({ kind: 'circle', x: t.x + _p.x, z: t.z + _p.z, r: f.r })
    }
  }
  return out
}

/** a loose thing of the Quad's: resting at home (held fast there till something moves it), a toy for
 *  the hand and the car, a prompt to put it back */
function LiveProp({ id, label, at, car, lift, feelAlong, feelR, children }: { id: string; label: string; at: { x: number; y: number; z: number; rot: number }; car: { current: CarState }; lift: number; feelAlong: number[]; feelR: number; children: ReactNode }) {
  const home = useMemo(() => new Matrix4().compose(new Vector3(at.x, at.y, at.z), new Quaternion().setFromEuler(new Euler(0, at.rot, 0)), new Vector3(1, 1, 1)), [at])
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
  feel.set(id, { body: perch.body, along: feelAlong, r: feelR })
  if (import.meta.env.DEV) ((window as unknown as { __props: Record<string, unknown> }).__props ??= {})[id] = perch // (for trying it from the console)
  // the car coming at it: it's let go (loose) so the car can shove it
  useBeforePhysicsStep(() => {
    const body = perch.body.current
    const s = perch.st.current
    if (!body || !s.perched) return
    const c = car.current
    if (Math.hypot(c.x - at.x, c.z - at.z) > 520) return
    s.perched = false
    body.setBodyType(perch.rapier.RigidBodyType.Dynamic, true)
    body.wakeUp()
  })
  return (
    <>
      <Holdable ccd bodyRef={perch.body} position={[at.x, at.y, at.z]} rotation={[0, at.rot, 0]} colliders={false} linearDamping={0.4} angularDamping={0.8} hold={{ ...perch.hold, lift: 60 }} sound="none">
        <group {...perch.hover.bind}>{children}</group>
      </Holdable>
      <Prompts items={[perch.prompt]} far={9000} />
    </>
  )
}

/** the benches on their pads; the lawn signs */
export function LiveProps({ car }: { car: { current: CarState } }) {
  return (
    <>
      {SET.benches.map((b, i) => (
        <LiveProp key={`bench${i}`} id={`bench${i}`} label="Put the bench back" at={{ x: b.x, y: PAVING, z: b.z, rot: b.rot }} car={car} lift={330} feelAlong={[-150, 0, 150]} feelR={105}>
          <Bench />
          {/* its seat and legs a block, its back a slab raked back */}
          <CuboidCollider args={[BENCH.L / 2, BENCH.seat / 2, 62]} position={[0, BENCH.seat / 2, 0]} mass={6} friction={0.7} />
          <CuboidCollider args={[BENCH.L / 2, 75, 9]} position={[0, BENCH.seat + 70, -62]} rotation={[-0.16, 0, 0]} mass={2} friction={0.7} />
        </LiveProp>
      ))}
      {SET.signs.map((s, i) => (
        <LiveProp key={`sign${i}`} id={`sign${i}`} label="Stand the sign back up" at={{ x: s.x, y: LAWN, z: s.z, rot: s.rot }} car={car} lift={SIGN.low + SIGN.h + 60} feelAlong={[-70, 70]} feelR={40}>
          <Sign />
          {/* the board, and the stake's legs below it */}
          <CuboidCollider args={[SIGN.w / 2, SIGN.h / 2, SIGN.t / 2 + 2]} position={[0, SIGN.low + SIGN.h / 2, 0]} mass={0.6} friction={0.6} />
          <CuboidCollider args={[SIGN.apart / 2 + 4, SIGN.low / 2, 6]} position={[0, SIGN.low / 2, -SIGN.t / 2 - SIGN.stake]} mass={0.3} friction={0.8} />
        </LiveProp>
      ))}
    </>
  )
}
