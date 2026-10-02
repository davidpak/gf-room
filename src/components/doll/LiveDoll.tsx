import { useEffect, useRef, type RefObject } from 'react'
import { Euler, Quaternion, Vector3, type Group, type Matrix4 } from 'three'
import { CapsuleCollider, CuboidCollider, RigidBody, useBeforePhysicsStep, useSphericalJoint, type RapierRigidBody } from '@react-three/rapier'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { stepTime } from '../../lib/physics/World'
import { Prompts } from '../prompt/Prompts'
import { SEAT, SeatedDoll } from './SeatedDoll'
import { DOLL } from './spec'
import type { DollRig } from './Doll'

/**
 * David, crocheted, sitting on the desk as a real thing: pick him up and carry him (left-drag), turn him
 * (right-drag), set him down anywhere; "Return David" sits him back in his spot.
 *
 * His arms and legs are things of their own: each a light body pinned at its shoulder or hip (a ball joint)
 * and drawn back to its seated pose by a spring, so they swing and dangle when he's carried, flop when he's
 * dropped, and settle back as he sits. They bump into each other and into everything else; the legs into his
 * body too (the arms hang against his sides, so not them). His body and head are the one body you carry.
 *
 * Shapes, in SeatedDoll's frame (his bottom on y 0, facing +z), mm, from ./spec: the body and head from just
 * above the legs (the beanie 92 across) and a seat behind the hips, so he sits, not tips over; the legs 18
 * thick, the arms 10, each as it's drawn (the arm is modelled hanging out by DOLL.arm.spread) and cut just
 * short enough that seated, nothing reaches into the desk: in the seated pose every limb lies on it, clear
 * of the others (4.5 between the legs, 6 from leg to hand). A plush: about 150 g, most of it in the body.
 * (Tried on its own in Rapier first: perched, every limb holds within 3°; dropped 15 cm, he lands sitting.)
 */
const R = DOLL.rig
const A = DOLL.arm
const BODY = { half: [44, 93, 40] as const, at: [0, 131, -8] as const, mass: 0.08 }
const SEATBOX = { half: [40, 19, 23.5] as const, at: [0, 19.5, -24.5] as const, mass: 0.01 } // (behind the legs' ends)
const LEG = { r: 18, len: R.hipY - 14, mass: 0.02 }
const ARM = { r: 10, len: -A.sleeve[0][1] + A.hand.len + 2, mass: 0.01 }
const SPRING = { k: 900, damp: 16 } // 1/s² and 1/s: firm enough to hold the pose, still swings when he's moved
const ITEM = groups(GROUP.item, 0xffff)

const X = new Vector3(1, 0, 0)
const rotX = (a: number) => new Quaternion().setFromAxisAngle(X, a)
const rotZ = (a: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), a)

// where each joins the body (body frame) and its seated turn relative to the body (about x only: the legs' splay
// and the arms' hang in are the collider's and the drawing's own, so the joint's frame stays square to the body)
const waist = new Vector3(0, R.waistY + SEAT.hipH - R.hipY - SEAT.drop, 0)
const LIMBS = ([1, -1] as const).flatMap((side) => [
  {
    key: (side > 0 ? 'legL' : 'legR') as 'legL' | 'legR' | 'armL' | 'armR',
    at: new Vector3(side * DOLL.legs.x, SEAT.hipH, 0),
    rest: rotX(SEAT.legX),
    out: rotZ(side * SEAT.splay),
    model: new Quaternion(),
    shape: LEG,
    // (the drawing's turn = the body's turn back off, then this)
    under: new Quaternion(),
  },
  {
    key: (side > 0 ? 'armL' : 'armR') as 'legL' | 'legR' | 'armL' | 'armR',
    at: waist.clone().add(new Vector3(side * A.shoulder[0], A.shoulder[1] - R.waistY, 0).applyQuaternion(rotX(-SEAT.lean))),
    rest: rotX(SEAT.armX - SEAT.lean),
    out: rotZ(-side * SEAT.armIn),
    model: rotZ(side * A.spread), // (modelled hanging out this much)
    shape: ARM,
    under: rotX(-SEAT.lean), // (the arms hang off the torso, which leans back)
  },
]).map((L) => {
  // its shape as drawn, and cut short enough that seated its lowest point is 0.5 above the desk
  const turn = L.out.clone().multiply(L.model)
  const d = new Vector3(0, -1, 0).applyQuaternion(turn).applyQuaternion(L.rest)
  const r = L.shape.r
  const low = (len: number) => Math.min(L.at.y + d.y * r, L.at.y + d.y * (len - r)) - r
  const len = low(L.shape.len) < 0.5 && d.y < 0 ? r + (0.5 + r - L.at.y) / d.y : L.shape.len
  return { ...L, turn, len }
})

const _q = new Quaternion()
const _g = new Quaternion()
const _p = new Vector3()
const _e = new Vector3()

/** one limb: its body, its ball joint at the body (touching it only if it's a leg), its collider as drawn */
function Limb({ torso, limb, out }: { torso: RefObject<RapierRigidBody | null>; limb: (typeof LIMBS)[number]; out: { body: RefObject<RapierRigidBody | null>; draw: RefObject<Group | null> } }) {
  const joint = useSphericalJoint(torso as RefObject<RapierRigidBody>, out.body as RefObject<RapierRigidBody>, [
    [limb.at.x, limb.at.y, limb.at.z],
    [0, 0, 0],
  ])
  useEffect(() => joint.current?.setContactsEnabled(limb.key.startsWith('leg')))
  const half = limb.len / 2 - limb.shape.r
  const c = new Vector3(0, -limb.len / 2, 0).applyQuaternion(limb.turn)
  return (
    <RigidBody ref={out.body} colliders={false} position={[0, -2000, 0]} linearDamping={0.6} angularDamping={0.8} ccd>
      <group ref={out.draw} />
      <CapsuleCollider args={[half, limb.shape.r]} position={[c.x, c.y, c.z]} rotation={new Euler().setFromQuaternion(limb.turn)} mass={limb.shape.mass} friction={1} restitution={0} collisionGroups={ITEM} />
    </RigidBody>
  )
}

export function LiveDoll({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const perch = usePerch({
    key: 'doll',
    label: 'Return David',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0, // (he stays where he's put)
    away: 150,
    lift: 60,
  })
  const torsoDraw = useRef<Group>(null)
  const limbs = {
    legL: { body: useRef<RapierRigidBody>(null), draw: useRef<Group>(null) },
    legR: { body: useRef<RapierRigidBody>(null), draw: useRef<Group>(null) },
    armL: { body: useRef<RapierRigidBody>(null), draw: useRef<Group>(null) },
    armR: { body: useRef<RapierRigidBody>(null), draw: useRef<Group>(null) },
  }

  // each step: every limb's spin eased toward its seated turn on the body; one that's come away from its
  // joint (he was put somewhere in one go: his start, a fly home) is put straight back where it belongs
  useBeforePhysicsStep(() => {
    const t = perch.body.current
    if (!t) return
    const dt = stepTime()
    const tq = t.rotation()
    const tp = t.translation()
    const tw = t.angvel()
    const tv = t.linvel()
    const q = _q.set(tq.x, tq.y, tq.z, tq.w)
    const fade = Math.exp(-SPRING.damp * dt)
    for (const L of LIMBS) {
      const b = limbs[L.key].body.current
      if (!b) continue
      const anchor = _p.copy(L.at).applyQuaternion(q).add(tp as Vector3)
      const goal = _g.copy(q).multiply(L.rest)
      const bp = b.translation()
      if (anchor.distanceToSquared(bp as Vector3) > 25 * 25) {
        b.setTranslation(anchor, true)
        b.setRotation(goal, true)
        b.setLinvel(tv, true)
        b.setAngvel(tw, true)
        continue
      }
      const lq = b.rotation()
      // the turn from where it is to where it would sit, as an axis × angle
      const err = goal.multiply(_q.set(lq.x, lq.y, lq.z, lq.w).invert())
      if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w)
      const s = Math.sqrt(1 - Math.min(1, err.w * err.w))
      const angle = 2 * Math.acos(Math.min(1, err.w))
      if (s > 1e-6) _e.set(err.x / s, err.y / s, err.z / s).multiplyScalar(angle)
      else _e.set(0, 0, 0)
      q.set(tq.x, tq.y, tq.z, tq.w) // (q was the scratch for the limb's turn)
      const lw = b.angvel()
      const w = {
        x: tw.x + (lw.x - tw.x) * fade + _e.x * SPRING.k * dt,
        y: tw.y + (lw.y - tw.y) * fade + _e.y * SPRING.k * dt,
        z: tw.z + (lw.z - tw.z) * fade + _e.z * SPRING.k * dt,
      }
      b.setAngvel(w, angle > 0.002 || Math.hypot(lw.x - tw.x, lw.y - tw.y, lw.z - tw.z) > 0.01)
    }
  })

  // the drawing: each limb turned as its body is, relative to his (both as drawn: blended between steps)
  const tq = new Quaternion()
  const lq = new Quaternion()
  const drive = (r: DollRig) => {
    const t = torsoDraw.current
    if (!t) return
    t.getWorldQuaternion(tq).invert()
    for (const L of LIMBS) {
      const d = limbs[L.key].draw.current
      if (!d || !limbs[L.key].body.current) continue
      d.getWorldQuaternion(lq)
      // the body's turn back off (and the torso's lean, for the arms), then the limb's own, then its splay
      r[L.key].quaternion.copy(L.under).invert().multiply(tq).multiply(lq).multiply(L.out)
    }
  }

  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.8} angularDamping={1.5} hold={perch.hold}>
        <group ref={torsoDraw} {...perch.hover.bind}>
          <SeatedDoll limbs={drive} />
        </group>
        <CuboidCollider args={[...BODY.half]} position={[...BODY.at]} mass={BODY.mass} friction={1} collisionGroups={ITEM} />
        <CuboidCollider args={[...SEATBOX.half]} position={[...SEATBOX.at]} mass={SEATBOX.mass} friction={1} collisionGroups={ITEM} />
      </Holdable>
      {LIMBS.map((L) => (
        <Limb key={L.key} torso={perch.body} limb={L} out={limbs[L.key]} />
      ))}
      <Prompts items={[perch.prompt]} />
    </>
  )
}
