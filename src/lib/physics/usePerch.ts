import { useRef } from 'react'
import { useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { Flight, planRoute } from './route'
import { useItemHover, type PromptItem } from '../../components/prompt/Prompts'

/**
 * A loose thing that has a home spot on something else (the Wumpus on its claw clip, the clips on the
 * lamp's pole), for a <Holdable>:
 *
 *   at home      held fast there (fixed), riding along as its home moves (the lamp on the rising desk:
 *                kinematic while it moves, fixed again once it's still)
 *   picked up    it's loose (dynamic) for the hand
 *   let go near  within `snap` of home: it goes back in by itself (0: never; a thing that just sits
 *                on the desk stays where it's put)
 *   put back     a fix-it prompt (`label`), once it's at rest somewhere else (further than `away`, or
 *                tipped over): it flies home round
 *                what's in the way (planRoute + Flight) and backs in along `approach`, its own axis
 *   no home      `perchAt` null (what it sits on has been taken away): if it was there, it drops
 *
 * Spread `hold` into the Holdable's hold, `hover.bind` on a group round its meshes, and give
 * `prompt` to <Prompts>. `onLand` / `onFly` for its own touches (a squish, a clip snapping shut).
 */
export type Pose = { p: Vector3; q: Quaternion }
export const poseOf = (b: RapierRigidBody): Pose => {
  const t = b.translation()
  const r = b.rotation()
  return { p: new Vector3(t.x, t.y, t.z), q: new Quaternion(r.x, r.y, r.z, r.w) }
}
const _s = new Vector3()

export function usePerch(o: {
  key: string
  label: string
  perchAt: () => Matrix4 | null
  /** its own axis it backs in along (pointing away from home) */
  approach: Vector3
  distance?: number
  snap?: number
  /** the prompt waits till it's further than this from home (mm), or not the right way up */
  away?: number
  /** the prompt floats this far over it */
  lift?: number
  onLand?: () => void
  onFly?: () => void
}) {
  const { world, rapier } = useRapier()
  const opts = useRef(o)
  opts.current = o
  const body = useRef<RapierRigidBody>(null)
  const st = useRef({ first: true, perched: false, held: false, still: 0 })
  const fly = useRef<{ fl: Flight; pose: Pose } | null>(null)
  const hover = useItemHover()

  const home = (): Pose | null => {
    const m = opts.current.perchAt()
    if (!m) return null
    const p = new Vector3()
    const q = new Quaternion()
    m.decompose(p, q, _s)
    return { p, q }
  }

  const flyHome = () => {
    const b = body.current
    const h = home()
    if (!b || !h || fly.current) return
    const from = poseOf(b)
    const out = opts.current.approach.clone().applyQuaternion(h.q)
    const approach = h.p.clone().addScaledVector(out, opts.current.distance ?? 60).add(new Vector3(0, 12, 0))
    const curve = planRoute(world, rapier, from.p, h.p, { approach, clearance: 50, radius: 30 })
    fly.current = { fl: new Flight(curve, from.q, h.q, { speed: 280, min: 0.7, max: 2.4, turn: [0.05, 0.75] }), pose: from }
    st.current.perched = false
    b.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
    opts.current.onFly?.()
  }

  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b) return
    const s = st.current
    const h = home()
    if (!h) {
      // what it sits on has gone: if it was there, it drops (and it can't fly home for now)
      if (s.perched || fly.current) {
        s.perched = false
        fly.current = null
        b.setBodyType(rapier.RigidBodyType.Dynamic, true)
        b.wakeUp()
      }
      return
    }
    if (s.first) {
      // it starts at home
      s.first = false
      s.perched = true
      b.setBodyType(rapier.RigidBodyType.Fixed, true)
      b.setTranslation(h.p, true)
      b.setRotation(h.q, true)
      return
    }
    const f = fly.current
    if (f) {
      const done = f.fl.step(world.timestep)
      f.fl.pose(f.pose.p, f.pose.q)
      b.setNextKinematicTranslation(f.pose.p)
      b.setNextKinematicRotation(f.pose.q)
      if (done) {
        fly.current = null
        s.perched = true
        s.still = 0
        opts.current.onLand?.()
      }
      return
    }
    if (s.perched) {
      const now = poseOf(b)
      if (now.p.distanceToSquared(h.p) > 1e-4 || Math.abs(now.q.dot(h.q)) < 1 - 1e-7) {
        // (rapier keeps f32s: a still home reads back a hair off)
        if (b.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) b.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
        b.setNextKinematicTranslation(h.p)
        b.setNextKinematicRotation(h.q)
        s.still = 0
      } else if (b.bodyType() === rapier.RigidBodyType.KinematicPositionBased && ++s.still > 8) {
        b.setBodyType(rapier.RigidBodyType.Fixed, true)
      }
    }
  })

  const hold = {
    onGrab: (b: RapierRigidBody) => {
      fly.current = null
      st.current.perched = false
      st.current.held = true
      if (!b.isDynamic()) b.setBodyType(rapier.RigidBodyType.Dynamic, true)
    },
    onRelease: (b: RapierRigidBody) => {
      st.current.held = false
      const h = home()
      const snap = opts.current.snap ?? 80
      if (h && snap > 0 && poseOf(b).p.distanceTo(h.p) < snap) flyHome()
    },
  }

  const _up = new Vector3()
  const prompt: PromptItem = {
    key: o.key,
    label: o.label,
    icon: 'home',
    at: (out) => {
      const b = body.current
      return b ? out.copy(b.translation() as Vector3).add(_up.set(0, opts.current.lift ?? 48, 0)) : out
    },
    when: () => {
      const b = body.current
      const s = st.current
      const h = home()
      if (!b || s.perched || s.held || fly.current || !h) return false
      const v = b.linvel()
      if (Math.hypot(v.x, v.y, v.z) > 20) return false
      const away = opts.current.away ?? 0
      if (away <= 0) return true
      const now = poseOf(b)
      const upright = _s.set(0, 1, 0).applyQuaternion(now.q).dot(_up.set(0, 1, 0).applyQuaternion(h.q)) > 0.9
      return now.p.distanceTo(h.p) > away || !upright
    },
    run: flyHome,
    hover: hover.hovered,
  }

  return { body, st, fly, flyHome, home, hold, prompt, hover, world, rapier }
}
