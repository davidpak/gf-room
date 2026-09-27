import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, RoundCuboidCollider, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { Flight, GLIDE, Path, planRoute, smoother } from '../../lib/physics/route'
import { stepAlpha } from '../../lib/physics/World'
import { Box3, CatmullRomCurve3, Group, Matrix4, Quaternion, Vector3 } from 'three'
import { grabbable, isHolding } from '../../lib/physics/Hand'
import { GROUP, Tube, createRope, groups, type Joint, type Rope } from '../../lib/physics/rope'
import { CHARGER, SEAT, STAND, cablePoints, portLayout, prongLayout, standOutlet } from './spec'
import { Charger, UsbCPlug, wovenMaterial } from './Charger'
import { Prompts, type PromptItem } from '../prompt/Prompts'

/**
 * The charger as a real object (Rapier): carry it, tip it, drop it off the desk. Its cable is a rope
 * of short links (lib/physics/rope) with a real plug body at each end:
 *
 *   near plug   locked into the port by a fixed joint. Grab it (or click it) and it comes out; let
 *               it go near the port, lined up, and it slides back in
 *   far plug    free at the other end
 *   outlet      let the charger go over an outlet, prongs out, and it seats itself (it then stays put
 *               until you pick it up again, riding along if the outlet moves: the lamp on the desk)
 *   prompts     out of place and left alone a moment, a fix-it prompt offers to put it right (../prompt):
 *               the charger back into its outlet (when it lives in one), the cable back into the
 *               charger, the cable's far end back where it lay
 *
 * `setup` says where it lives: the outlets it can plug into, where it goes back to, how its cable is
 * laid to start with, and whether it starts plugged in (the charger page's stand by default).
 *
 * The buttons drive the same moves: `state` is what the page asks for, `actual` what the physics
 * has done; physics events update both so they never fight.
 */
export type ChargerState = { folded: boolean; plugged: boolean; pose: 0 | 1 }

const B = CHARGER.body
const PORT = portLayout()
const PL = prongLayout()
const LINKS = 36 // ~25 mm links: stiff enough to read as a woven cable, few enough to stay calm
const R = CHARGER.cable.r
const LINK_HALF = CHARGER.cable.length / LINKS / 2
/** one link of the cable in its own frame (a capsule along Y): what the hand turns when you grab the cable */
const LINK_BOX = new Box3(new Vector3(-R, -LINK_HALF - R, -R), new Vector3(R, LINK_HALF + R, R))
const SLEEVE = 0.3 + CHARGER.plug.mold[2] / 2 // plug body centre: the middle of the sleeve, from the port face
const HALF = { x: CHARGER.plug.mold[2] / 2, y: CHARGER.plug.mold[1] / 2, z: CHARGER.plug.mold[0] / 2 }
const DEVICE = groups(GROUP.device, 0xffff)
const Yax = new Vector3(0, 1, 0)
const _q = new Quaternion()
const _v = new Vector3()

export type Pose = { p: Vector3; q: Quaternion }
/** An outlet: its frame in the world (as ./spec's outlet frames), and whether the charger may stand in it turned half round */
export type Outlet = { frame: Matrix4; flip: boolean }
export type ChargerSetup = {
  /** where it can plug in (read every frame: they may move) */
  outlets: () => Outlet[]
  /** standing on the desk: where it goes back to */
  home: () => Pose
  /** the cable's rest layout from its start S (the end of the plug in the port), for where the charger starts */
  cable: (S: Vector3) => Vector3[]
  /** start plugged into this outlet (then it lives there: its prompt puts it back) */
  start?: number
  /** that prompt's words (`Plug into the lamp`) */
  startLabel?: string
  /** something it rests on is moving (the desk): don't put it to sleep meanwhile */
  moving?: () => boolean
}
/** the charger page: on the desk slab, the stand's one outlet */
export const STAND_SETUP: ChargerSetup = {
  outlets: () => [{ frame: standOutlet(), flip: true }],
  home: () => ({ p: new Vector3(0, B.h / 2, 0), q: new Quaternion() }),
  cable: (S) => cablePoints(S, 0),
}
/** a scripted move of a kinematic body; `end` runs the frame after it lands (so it is really there) */
type Anim = { body: RapierRigidBody; from: Pose; to: () => Pose; t: number; dur: number; lift: number; end: () => void; landed?: boolean }

const poseOf = (b: RapierRigidBody): Pose => {
  const t = b.translation()
  const r = b.rotation()
  return { p: new Vector3(t.x, t.y, t.z), q: new Quaternion(r.x, r.y, r.z, r.w) }
}

/** Where the near plug sits when it's in the port, for the charger where it is now. */
const inPort = (charger: RapierRigidBody): Pose => {
  const c = poseOf(charger)
  return { p: new Vector3(PORT.at.x + SLEEVE, PORT.at.y, 0).applyQuaternion(c.q).add(c.p), q: c.q }
}

/**
 * Putting it back (the fix-it prompts), never through anything:
 *   plug back in,  the charger (or the cable's plug) flies home along a route round things
 *   reconnect      (lib/physics/route); the cable trails behind it like a snake, over exactly where
 *                  it lay and then exactly where its end flew. Both are clear, so it can't clip, and
 *                  it keeps its length. Landed, it's physics again and settles where it falls
 *   tidy           the cable reels into its plug along its own length (like a tape measure) and
 *                  feeds back out along its resting layout; the loose plug shrinks away as it arrives
 *                  and pops out again at the end. A cable caught through something comes back out the
 *                  way it went in
 */
type Trail = { way: Path; clen: number; arc: number[]; T: number } // way: where it lay (loose end first), then where its head flew; arc: the head's distance flown, at even times
type Reel = { lay: Path; rest: Path; root: Vector3; dir: Vector3; T1: number; T2: number }
type Restore = {
  t: number
  mode: 'home' | 'plug' | 'tidy'
  flight: Flight | null // the charger (home) or the cable's plug (plug)
  pose: Pose // where the flier is now
  landing: boolean // arrived: physics again on the next step
  trail: Trail | null
  reel: Reel | null
  dist: number[] // each joint's distance from the cable's charger end
  far0: { q: Quaternion; axis: Vector3; off: Vector3 } // the far plug at the start: its angle, the cable's last stretch, its offset from the end
  nearRel: Pose | null // plug back in: the plug in the port, relative to the charger
}
/** what a cable must never be inside (not other cables, plugs, the charger) */
const SOLID = groups(0xffff, 0xffff & ~GROUP.rope & ~GROUP.plug & ~GROUP.device)
const _w = new Vector3()
const _c = new Vector3()
const _q3 = new Quaternion()
const _q4 = new Quaternion()

const FLIP = new Matrix4().makeRotationY(Math.PI)
const _m = new Matrix4()
const _s = new Vector3()
/** The charger seated in an outlet: as the spec's seat, or turned half round about the slots (it's unpolarised). */
const seatPose = (o: Outlet, flip: boolean): Pose => {
  _m.copy(o.frame)
  if (flip) _m.multiply(FLIP)
  _m.multiply(SEAT)
  const pose = { p: new Vector3(), q: new Quaternion() }
  _m.decompose(pose.p, pose.q, _s)
  return pose
}
/** turned half round fits how it's held better (its logo faces the other way), if the outlet allows it */
const wantsFlip = (o: Outlet, charger: RapierRigidBody) =>
  o.flip && new Vector3(0, 0, 1).applyQuaternion(poseOf(charger).q).dot(_s.setFromMatrixColumn(o.frame, 2)) < 0

export function LiveCharger({ state, set, setup = STAND_SETUP }: { state: ChargerState; set: (s: Partial<ChargerState>) => void; setup?: ChargerSetup }) {
  const { world, rapier } = useRapier()
  const charger = useRef<RapierRigidBody>(null)
  const nearMesh = useRef<Group>(null!)
  const farMesh = useRef<Group>(null!)
  const sys = useRef<{ rope: Rope; near: RapierRigidBody; far: RapierRigidBody; joint: Joint | null } | null>(null)
  const actual = useRef({ plugged: state.plugged, seated: false })
  const anims = useRef<{ plug: Anim | null; charger: Anim | null; far: Anim | null }>({ plug: null, charger: null, far: null })
  const restore = useRef<Restore | null>(null) // putting it back (a fix-it prompt)
  const nearTip = useRef(new Vector3()) // the cable's end, in the near plug's frame
  const farTip = useRef(new Vector3()) // and in the far plug's
  const J = useMemo(() => Array.from({ length: LINKS + 1 }, () => new Vector3()), []) // the joints, while it's put back
  const drawState = useRef({ farScale: 1, visibleFrom: 0 }) // reeling: the far plug's size, the first joint drawn
  const through = useRef(false) // the cable is caught inside something solid
  const blades = useRef<(RapierCollider | null)[]>([])
  const bladesLoose = useRef(false) // just pulled out of an outlet: the blades pass through the base till they're clear
  const throughTick = useRef(0)
  // the plugs' poses before the last physics step (drawn blended between steps, like the cable)
  const plugPrev = useMemo(() => [0, 1].map(() => ({ p: new Vector3(), q: new Quaternion(), ok: false })), [])
  useBeforePhysicsStep(() => {
    const s = sys.current
    if (!s) return
    s.rope.snapshot()
    ;[s.near, s.far].forEach((b, i) => {
      const t = b.translation()
      const r = b.rotation()
      plugPrev[i].p.set(t.x, t.y, t.z)
      plugPrev[i].q.set(r.x, r.y, r.z, r.w)
      plugPrev[i].ok = true
    })
  })
  const farHome = useRef<{ p: Vector3; q: Quaternion } | null>(null) // where the far plug lay, in the home frame (it rides the desk)
  const tube = useMemo(() => new Tube(LINKS + 1, 3, 10), [])
  const pts = useRef<Vector3[]>([])
  const uLen = useMemo(() => ({ value: CHARGER.cable.length }), [])
  const woven = useMemo(() => wovenMaterial(uLen), [uLen])
  const chargerHeld = useRef(false)
  const chargerArmed = useRef(false) // the outlet magnet works once it has been lifted well clear
  const calm = useRef(0)
  const nearHeld = useRef(false)
  const nearArmed = useRef(false) // the magnet works once the plug has been pulled well clear
  const stateRef = useRef(state)
  stateRef.current = state
  const setupRef = useRef(setup)
  setupRef.current = setup
  const placed = useRef(false) // put where the setup says, on the first frame
  const seatAt = useRef<{ i: number; flip: boolean } | null>(null) // the outlet it's in (or going into)
  const still = useRef(0)

  /** a fixed joint that keeps two bodies exactly as they are now, meeting at world point p */
  const lockHere = (b1: RapierRigidBody, b2: RapierRigidBody, p: Vector3) => {
    const local = (b: RapierRigidBody) => {
      const o = poseOf(b)
      const l = p.clone().sub(o.p).applyQuaternion(o.q.invert())
      return { x: l.x, y: l.y, z: l.z }
    }
    const frame = (b: RapierRigidBody) => {
      const q = poseOf(b).q.invert()
      return { x: q.x, y: q.y, z: q.z, w: q.w }
    }
    return world.createImpulseJoint(rapier.JointData.fixed(local(b1), frame(b1), local(b2), frame(b2)), b1, b2, true)
  }

  /** a plug in (or going into) the port must not collide with the charger it's in; a loose one does */
  const plugGroups = (b: RapierRigidBody, intoDevice: boolean) => {
    const g = groups(GROUP.plug, 0xffff & ~GROUP.rope & (intoDevice ? ~GROUP.device : 0xffff))
    for (let i = 0; i < b.numColliders(); i++) b.collider(i).setCollisionGroups(g)
  }

  const makePlug = (pose: Pose) => {
    const b = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(pose.p.x, pose.p.y, pose.p.z)
        .setRotation({ x: pose.q.x, y: pose.q.y, z: pose.q.z, w: pose.q.w })
        .setLinearDamping(0.6)
        .setAngularDamping(1.5)
        .setSoftCcdPrediction(12), // soft CCD: no tunnelling at speed, and not sticky at rest like full CCD
    )
    const g = groups(GROUP.plug, 0xffff & ~GROUP.rope)
    const k = 0.8
    world.createCollider(rapier.ColliderDesc.roundCuboid(HALF.x - k, HALF.y - k, HALF.z - k, k).setMass(0.004).setFriction(0.8).setCollisionGroups(g).setContactSkin(0.6), b)
    const sh = CHARGER.plug.shell
    world.createCollider(
      rapier.ColliderDesc.cuboid(sh[2] / 2, sh[1] / 2, sh[0] / 2)
        .setTranslation(-SLEEVE + 0.3 - sh[2] / 2, 0, 0)
        .setMass(0.0006)
        .setFriction(0.5)
        .setCollisionGroups(g),
      b,
    )
    return b
  }

  /** the cable at rest for the charger at `cp`: its joints (links + 1 points), each link's pose,
   *  and both plugs' (the near one in the port) */
  const restLayout = (cp: Pose) => {
    const curve = new CatmullRomCurve3(setupRef.current.cable(PORT.moldEnd.clone().applyQuaternion(cp.q).add(cp.p)), false, 'centripetal')
    const P = Array.from({ length: LINKS + 1 }, (_, i) => curve.getPointAt(i / LINKS))
    const links = P.slice(0, -1).map((a, i) => ({
      p: a.clone().add(P[i + 1]).multiplyScalar(0.5),
      q: new Quaternion().setFromUnitVectors(Yax, P[i + 1].clone().sub(a).normalize()),
    }))
    const t = curve.getTangent(1).setY(0).normalize()
    const far = { p: P[LINKS].clone().addScaledVector(t, HALF.x), q: new Quaternion().setFromAxisAngle(Yax, Math.atan2(t.z, -t.x)) } // (the layout ends at the plug's height)
    const near = { p: new Vector3(PORT.at.x + SLEEVE, PORT.at.y, 0).applyQuaternion(cp.q).add(cp.p), q: cp.q.clone() }
    return { P, links, near, far }
  }

  const build = (c: RapierRigidBody) => {
    const L = restLayout(poseOf(c))
    const P = L.P
    const rope = createRope(world, rapier, P, { radius: R, mass: 0.002, bend: 14, bendDamping: 0.35, memory: 0.75, linearDamping: 2.5, angularDamping: 20 })
    const near = makePlug(L.near)
    const far = makePlug(L.far)
    rope.ends(near, far) // the plugs are part of the one chain
    for (const [ref, b, p] of [
      [nearTip, near, P[0]],
      [farTip, far, P[LINKS]],
    ] as const) {
      const o = poseOf(b)
      ref.current.copy(p).sub(o.p).applyQuaternion(o.q.invert())
    }
    let joint: Joint | null = null
    if (actual.current.plugged) {
      plugGroups(near, true)
      joint = lockHere(c, near, inPort(c).p)
      joint.setContactsEnabled(false)
    }
    sys.current = { rope, near, far, joint }
    {
      const h = setupRef.current.home()
      const inv = h.q.clone().invert()
      const fp = poseOf(far)
      farHome.current = { p: fp.p.sub(h.p).applyQuaternion(inv), q: inv.multiply(fp.q) }
    }
    if (import.meta.env.DEV) Object.assign(window, { __charger: { sys, charger, actual, world, rapier } }) // for inspecting from the console
  }

  const teardown = () => {
    const s = sys.current
    if (!s) return
    if (s.joint && world.getImpulseJoint(s.joint.handle)) world.removeImpulseJoint(s.joint, false)
    s.rope.remove()
    for (const b of [s.near, s.far]) if (world.getRigidBody(b.handle)) world.removeRigidBody(b)
    sys.current = null
  }
  useEffect(() => teardown, [world]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- moves
  const kinematic = (b: RapierRigidBody) => b.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
  const dynamic = (b: RapierRigidBody) => {
    // hand it back to physics at rest: a scripted move leaves its speed on the body
    b.setLinvel({ x: 0, y: 0, z: 0 }, false)
    b.setAngvel({ x: 0, y: 0, z: 0 }, false)
    b.setBodyType(rapier.RigidBodyType.Dynamic, true)
  }

  const unplug = (push: boolean) => {
    const s = sys.current
    const c = charger.current
    if (!s || !c || !actual.current.plugged) return
    anims.current.plug = null
    if (s.joint) world.removeImpulseJoint(s.joint, true)
    s.joint = null
    if (s.near.bodyType() !== rapier.RigidBodyType.Dynamic) dynamic(s.near)
    if (push) {
      const out = _v.set(1, 0, 0).applyQuaternion(poseOf(c).q).multiplyScalar(s.near.mass() * 320)
      s.near.applyImpulse({ x: out.x, y: out.y + s.near.mass() * 60, z: out.z }, true)
    }
    actual.current.plugged = false
    const near = s.near
    setTimeout(() => {
      if (!actual.current.plugged && !anims.current.plug && world.getRigidBody(near.handle)) plugGroups(near, false)
    }, 350)
    if (stateRef.current.plugged) set({ plugged: false })
  }

  /** the loose near plug is close enough to its port to find it (a gentle magnet, 30 mm) */
  const nearPort = () => {
    const s = sys.current
    const c = charger.current
    return !!s && !!c && poseOf(s.near).p.distanceTo(inPort(c).p) < 30
  }

  const plugIn = () => {
    const s = sys.current
    const c = charger.current
    if (!s || !c || actual.current.plugged || anims.current.plug) return
    plugGroups(s.near, true)
    kinematic(s.near)
    const from = poseOf(s.near)
    anims.current.plug = {
      body: s.near,
      from,
      to: () => inPort(c),
      t: 0,
      dur: Math.min(1.1, Math.max(0.28, from.p.distanceTo(inPort(c).p) / 500)), // (a snap nearby; a glide from across the desk)
      lift: 0,
      end: () => {
        dynamic(s.near)
        s.joint = lockHere(c, s.near, inPort(c).p)
        s.joint.setContactsEnabled(false)
        actual.current.plugged = true
        if (!stateRef.current.plugged) set({ plugged: true })
      },
    }
  }

  /** the nearest outlet's seat for the charger as it's held now, and how far (across) it is from it */
  const nearestSeat = (b: RapierRigidBody) => {
    const at = poseOf(b).p
    let best: { i: number; flip: boolean; pose: Pose; d: number } | null = null
    setupRef.current.outlets().forEach((o, i) => {
      const flip = wantsFlip(o, b)
      const pose = seatPose(o, flip)
      const d = Math.hypot(at.x - pose.p.x, at.z - pose.p.z)
      if (!best || d < best.d) best = { i, flip, pose, d }
    })
    return best as { i: number; flip: boolean; pose: Pose; d: number } | null
  }
  /** where it stands in its outlet now (the outlet may have moved) */
  const seatTarget = () => {
    const a = seatAt.current!
    return seatPose(setupRef.current.outlets()[a.i], a.flip)
  }

  /** into the nearest outlet (or outlet `i`, the right way round) */
  const seat = (i?: number) => {
    const c = charger.current
    if (!c || actual.current.seated) return
    const n = nearestSeat(c)
    if (!n) return
    seatAt.current = i === undefined ? { i: n.i, flip: n.flip } : { i, flip: false }
    kinematic(c)
    const from = poseOf(c)
    anims.current.charger = {
      body: c,
      from,
      to: seatTarget,
      t: 0,
      dur: Math.min(1.5, Math.max(0.8, from.p.distanceTo(seatTarget().p) / 450)),
      lift: 60,
      end: () => {
        // seated: fixed, not kinematic (a kinematic body keeps waking what hangs off it, so the cable would never rest)
        c.setLinvel({ x: 0, y: 0, z: 0 }, false)
        c.setAngvel({ x: 0, y: 0, z: 0 }, false)
        c.setBodyType(rapier.RigidBodyType.Fixed, true)
        actual.current.seated = true
        if (stateRef.current.pose !== 1) set({ pose: 1, folded: false })
      },
    }
  }

  const toDesk = () => {
    const c = charger.current
    if (!c) return
    kinematic(c)
    actual.current.seated = false
    anims.current.charger = {
      body: c,
      from: poseOf(c),
      to: () => {
        const h = setupRef.current.home()
        return { p: h.p.clone().add(_v.set(0, 0.5, 0)), q: h.q }
      },
      t: 0,
      dur: 0.8,
      lift: 60,
      end: () => dynamic(c),
    }
  }

  // the page asked for something the physics hasn't done yet
  useEffect(() => {
    if (!sys.current) return
    if (state.plugged && !actual.current.plugged) plugIn()
    if (!state.plugged && actual.current.plugged) unplug(true)
  }, [state.plugged]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!charger.current || !placed.current) return
    if (state.pose === 1 && !actual.current.seated) seat()
    if (state.pose === 0 && actual.current.seated) toDesk()
  }, [state.pose]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- grabbing
  /** wake the whole cable set (a sleeping neighbour would hold a grabbed link like a nail) */
  const wakeAll = () => {
    const s = sys.current
    if (s) for (const b of [...s.rope.links, s.near, s.far]) b.wakeUp()
    charger.current?.wakeUp()
  }
  /** prongs out, carried over an outlet and not far above it (a magnet: the seat move turns it upright) */
  const overOutlet = (b: RapierRigidBody) => {
    if (stateRef.current.folded) return false
    const n = nearestSeat(b)
    if (!n) return false
    const dy = poseOf(b).p.y - n.pose.p.y
    return n.d < 35 && dy < 90 && dy > -40
  }
  /** well out of every outlet's reach (across, or high above): only then does the magnet work again,
   *  so lifting it out of an outlet doesn't pull it straight back in */
  /** plugged in, the blades sit down inside the base's solid: pulled out, they pass through it until
   *  they're clear (lifted out of the slots, or moved off the outlet), or they'd wedge */
  const loosenBlades = (loose: boolean) => {
    bladesLoose.current = loose
    for (const b of blades.current) b?.setCollisionGroups(loose ? groups(GROUP.device, 0) : DEVICE)
  }
  const bladesClear = (b: RapierRigidBody) => {
    const n = nearestSeat(b)
    return !n || n.d > 42 || poseOf(b).p.y - n.pose.p.y > 22
  }
  const clearOfOutlets = (b: RapierRigidBody) => {
    const n = nearestSeat(b)
    return !n || n.d > 42 || poseOf(b).p.y - n.pose.p.y > 120 // (the lamp's seats are 88 apart: halfway is 44)
  }

  const chargerGrab = grabbable({
    body: () => (restore.current ? null : charger.current),
    lift: 40,
    keep: () => !anims.current.charger && !actual.current.seated,
    onGrab: (b) => {
      wakeAll()
      chargerHeld.current = true
      chargerArmed.current = clearOfOutlets(b)
      anims.current.charger = null
      if (!b.isDynamic()) dynamic(b)
      if (actual.current.seated) {
        actual.current.seated = false
        loosenBlades(true)
        set({ pose: 0 })
      }
    },
    onRelease: (b) => {
      chargerHeld.current = false
      if (chargerArmed.current && !actual.current.seated && !anims.current.charger && overOutlet(b)) seat()
    },
  })
  const nearGrab = grabbable({
    body: () => (restore.current ? null : sys.current?.near),
    lift: 25,
    mark: 16,
    pull: 0.05,
    grip: 0.03,
    keep: () => !anims.current.plug && !actual.current.plugged,
    onGrab: () => {
      wakeAll()
      nearHeld.current = true
      nearArmed.current = !actual.current.plugged && !nearPort()
      unplug(false)
    },
    onRelease: () => {
      nearHeld.current = false
      if (nearArmed.current && nearPort()) plugIn()
    },
  })
  /**
   * How far along the cable something can be carried from the charger (world point, reach): the
   * cable's plugged end. Seated, the charger is held fast, so a little short of the full reach (the
   * cable bends round the lamp and the desk on the way); loose, a little past it, so a tug drags the
   * charger along but never hard. Unplugged, the cable's free at both ends: no leash.
   */
  const tether = (along: number) => {
    const s = sys.current
    const c = charger.current
    if (!s || !c || !actual.current.plugged) return null
    const p = poseOf(c)
    const from = PORT.moldEnd.clone().applyQuaternion(p.q).add(p.p)
    return { from, length: along * (c.isDynamic() ? 1.1 : 0.96) }
  }
  const farGrab = grabbable({
    body: () => (restore.current ? null : sys.current?.far),
    lift: 25,
    pull: 0.05,
    mark: 16,
    grip: 0.03,
    onGrab: () => wakeAll(),
    leash: () => tether(CHARGER.cable.length + 2 * HALF.x),
  })
  const heldLink = useRef(0) // which link of the cable is held
  const cableGrab = grabbable({
    lift: 25,
    free: true, // loose: it hangs and bends from where you grab it
    box: LINK_BOX, // the one link you hold, not the whole cable
    mark: 14,
    pull: 0.12, // a link hauls the rest of the cable
    grip: 0.01, // (its neighbours weigh 2 g: a heavy one among them would stretch the chain)
    onGrab: () => wakeAll(),
    leash: () => {
      const s = sys.current
      if (!s) return null
      const i = heldLink.current
      let along = s.rope.lengths[i] / 2 + 2 * R
      for (let k = 0; k < i; k++) along += s.rope.lengths[k]
      return tether(along)
    },
    body: (point) => {
      const s = sys.current
      if (!s || restore.current) return null
      let best = s.rope.links[0]
      let d = Infinity
      for (const l of s.rope.links) {
        const t = l.translation()
        const e = (t.x - point.x) ** 2 + (t.y - point.y) ** 2 + (t.z - point.z) ** 2
        if (e < d) {
          d = e
          best = l
        }
      }
      heldLink.current = s.rope.links.indexOf(best)
      return best
    },
  })

  useFrame((_, dt) => {
    const c = charger.current
    if (!c) return
    if (!placed.current) {
      placed.current = true
      const st = setupRef.current
      if (st.start !== undefined) {
        // plugged in from the start: straight into its outlet, fixed there
        seatAt.current = { i: st.start, flip: false }
        const t = seatTarget()
        c.setTranslation(t.p, false)
        c.setRotation(t.q, false)
        c.setBodyType(rapier.RigidBodyType.Fixed, true)
        actual.current.seated = true
        if (stateRef.current.pose !== 1 || stateRef.current.folded) set({ pose: 1, folded: false })
      } else {
        const h = st.home()
        c.setTranslation(h.p, false)
        c.setRotation(h.q, false)
      }
    }
    if (!sys.current) {
      // (re)lay the cable once the charger stands on the desk where the layout expects it
      const a = anims.current.charger
      if (a) {
        a.t = Math.min(a.dur, a.t + Math.min(dt, 1 / 30))
        const e = a.t / a.dur
        const k = e * e * (3 - 2 * e)
        const to = a.to()
        a.body.setNextKinematicTranslation(a.from.p.clone().lerp(to.p, k).add(_v.set(0, Math.sin(Math.PI * k) * a.lift, 0)))
        a.body.setNextKinematicRotation(a.from.q.clone().slerp(to.q, k))
        if (a.t >= a.dur) {
          anims.current.charger = null
          a.end()
        }
        return
      }
      build(c)
    }
    const s = sys.current!
    // scripted moves (snap into the port, into the outlet, back to the desk)
    for (const key of ['plug', 'charger', 'far'] as const) {
      const a = anims.current[key]
      if (!a) continue
      if (a.landed) {
        anims.current[key] = null
        a.end()
        continue
      }
      a.t = Math.min(a.dur, a.t + Math.min(dt, 1 / 30))
      const e = a.t / a.dur
      const k = e * e * (3 - 2 * e)
      const to = a.to()
      // from below, up first and then across (up past the desk's edge, not through it); from above, across then down
      const up = a.from.p.y < to.p.y - 20
      const ky = up ? Math.min(1, k * 1.8) : Math.max(0, k * 1.8 - 0.8)
      const kx = up ? Math.max(0, k * 1.8 - 0.8) : Math.min(1, k * 1.8)
      const gap = Math.abs(to.p.y - a.from.p.y) > 20 || a.from.p.distanceTo(to.p) > 60 // (a short snap, like the plug into its port, goes straight)
      const p = gap
        ? new Vector3(a.from.p.x + (to.p.x - a.from.p.x) * kx, a.from.p.y + (to.p.y - a.from.p.y) * ky + Math.sin(Math.PI * k) * a.lift, a.from.p.z + (to.p.z - a.from.p.z) * kx)
        : a.from.p.clone().lerp(to.p, k).add(_v.set(0, Math.sin(Math.PI * k) * a.lift, 0))
      const q = a.from.q.clone().slerp(to.q, k)
      a.body.setNextKinematicTranslation(p)
      a.body.setNextKinematicRotation(q)
      if (a.t >= a.dur) a.landed = true
    }
    // seated: it rides along with its outlet (the lamp on the rising desk). Moving it's kinematic;
    // once the outlet has stopped it's fixed again, so the cable hanging off it can rest
    if (actual.current.seated && !anims.current.charger && seatAt.current) {
      const t = seatTarget()
      const now = poseOf(c)
      if (now.p.distanceToSquared(t.p) > 1e-4 || Math.abs(now.q.dot(t.q)) < 1 - 1e-9) {
        if (c.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) kinematic(c)
        c.setNextKinematicTranslation(t.p)
        c.setNextKinematicRotation(t.q)
        still.current = 0
      } else if (c.bodyType() === rapier.RigidBodyType.KinematicPositionBased && ++still.current > 8) {
        c.setBodyType(rapier.RigidBodyType.Fixed, true)
      }
    }
    // safety nets: nothing on the cable moves faster than a flick (3 m/s); if it ever blows up anyway
    // (forced through something solid), lay it out again, plugged in
    let wild = false
    for (const b of [...s.rope.links, s.near, s.far]) {
      const v = b.linvel()
      const sp = Math.hypot(v.x, v.y, v.z)
      if (!Number.isFinite(sp) || Math.abs(b.translation().y) > 4000) wild = true
      else if (sp > 3000) b.setLinvel({ x: (v.x / sp) * 3000, y: (v.y / sp) * 3000, z: (v.z / sp) * 3000 }, true)
      const w = b.angvel()
      const ws = Math.hypot(w.x, w.y, w.z)
      if (ws > 60) b.setAngvel({ x: (w.x / ws) * 60, y: (w.y / ws) * 60, z: (w.z / ws) * 60 }, true)
    }
    if (wild) {
      anims.current.plug = null
      teardown()
      restore.current = null
      actual.current.plugged = true
      if (!stateRef.current.plugged) set({ plugged: true })
      if (setupRef.current.start !== undefined) {
        // where it lives is an outlet: straight back into it (the cable is re-laid next frame)
        anims.current.charger = null
        seatAt.current = { i: setupRef.current.start, flip: false }
        const t = seatTarget()
        c.setTranslation(t.p, false)
        c.setRotation(t.q, false)
        c.setBodyType(rapier.RigidBodyType.Fixed, true)
        actual.current.seated = true
      } else toDesk()
      return
    }
    // caught inside something solid (a stretched cable forced through the desk)? Tidy can free it
    if (!restore.current && ++throughTick.current % 20 === 0) {
      let inside = false
      for (const l of s.rope.links) {
        const pr = world.projectPoint(l.translation(), true, undefined, SOLID)
        if (pr?.isInside) {
          inside = true
          break
        }
      }
      through.current = inside
    }
    // once the cable has come to rest (nothing held, nothing moving), let it sleep: it goes perfectly
    // still instead of shimmering; anything that touches it wakes it
    // (the links rock a little on their contacts forever otherwise: they can spin about their own axis)
    let fastest = 0
    for (const b of [...s.rope.links, s.near, s.far, c]) {
      const v = b.linvel()
      fastest = Math.max(fastest, Math.hypot(v.x, v.y, v.z))
    }
    calm.current = !isHolding() && !anims.current.plug && !anims.current.charger && !restore.current && !setupRef.current.moving?.() && fastest < 40 ? calm.current + 1 : 0
    // (again every so often while it stays calm: a touch from a resting neighbour can wake it)
    if (calm.current >= 20 && calm.current % 20 === 0) for (const b of [...s.rope.links, s.near, s.far, c]) if (b.isDynamic() && !b.isSleeping()) b.sleep()
    // blades clear of the outlet they came out of: solid again
    if (bladesLoose.current && bladesClear(c)) loosenBlades(false)
    // held over the outlet, the charger finds it
    if (chargerHeld.current && !actual.current.seated && !anims.current.charger) {
      chargerArmed.current ||= clearOfOutlets(c)
      if (chargerArmed.current && overOutlet(c)) seat()
    }
    // held near the port, the plug finds it
    if (nearHeld.current && !actual.current.plugged && !anims.current.plug) {
      if (!nearPort()) nearArmed.current ||= poseOf(s.near).p.distanceTo(inPort(c).p) > 45
      else if (nearArmed.current) plugIn()
    }
    // fell off the world: back on the desk
    if (c.translation().y < setupRef.current.home().p.y - 1500) toDesk()
    // draw: the cable over its links, the plugs where their bodies are
    const alpha = Math.min(1, stepAlpha())
    tube.update(s.rope.points(pts.current, alpha), R)
    tube.visibleFrom(drawState.current.visibleFrom)
    farMesh.current.scale.setScalar(Math.max(1e-3, drawState.current.farScale))
    farMesh.current.visible = drawState.current.farScale > 0.01
    ;[
      [nearMesh.current, s.near],
      [farMesh.current, s.far],
    ].forEach(([mesh, body], i) => {
      const m = mesh as Group
      const b = body as RapierRigidBody
      const t = b.translation()
      const r = b.rotation()
      m.position.set(t.x, t.y, t.z)
      m.quaternion.set(r.x, r.y, r.z, r.w)
      const pv = plugPrev[i]
      if (pv.ok && alpha < 1) {
        m.position.lerpVectors(pv.p, m.position, Math.max(0, alpha))
        _q.copy(m.quaternion)
        m.quaternion.copy(pv.q).slerp(_q, Math.max(0, alpha))
      }
    })
  })

  // ---- putting it back
  const jointDist = () => {
    const s = sys.current!
    const d = [0]
    for (let i = 0; i < LINKS; i++) d.push(d[i] + s.rope.lengths[i])
    return d
  }
  /** the far plug at the start (it rides the cable's end, turning as the end turns) */
  const farStart = (pts: Vector3[]) => {
    const fp = poseOf(sys.current!.far)
    return { q: fp.q, axis: pts[LINKS].clone().sub(pts[LINKS - 1]).normalize(), off: fp.p.sub(pts[LINKS]) }
  }
  /** the links along the joints (moved, not pushed), the far plug on the end */
  const placeCable = (R: Restore, joints: Vector3[]) => {
    const s = sys.current!
    for (let i = 0; i < LINKS; i++) {
      _w.copy(joints[i + 1]).sub(joints[i])
      const len = _w.length()
      if (len < 1e-6) continue
      _c.copy(joints[i]).add(joints[i + 1]).multiplyScalar(0.5)
      s.rope.links[i].setNextKinematicTranslation(_c)
      s.rope.links[i].setNextKinematicRotation(_q3.setFromUnitVectors(Yax, _w.divideScalar(len)))
    }
    _w.copy(joints[LINKS]).sub(joints[LINKS - 1]).normalize()
    _q4.setFromUnitVectors(R.far0.axis, _w)
    s.far.setNextKinematicTranslation(_c.copy(R.far0.off).applyQuaternion(_q4).add(joints[LINKS]))
    s.far.setNextKinematicRotation(_q3.copy(_q4).multiply(R.far0.q))
  }
  /** the snake: each joint its own distance behind the head, along the way */
  const trailJoints = (R: Restore, tr: Trail, t: number) => {
    const k = Math.min(1, Math.max(0, t / tr.T)) * (tr.arc.length - 1)
    const i = Math.min(tr.arc.length - 2, Math.floor(k))
    const head = tr.clen + tr.arc[i] + (tr.arc[i + 1] - tr.arc[i]) * (k - i)
    for (let j = 0; j <= LINKS; j++) tr.way.at(head - R.dist[j], J[j])
    return J
  }
  /** a trail behind a flight whose head (the cable's charger end) is at head(pose) */
  const makeTrail = (fl: Flight, head: (p: Vector3, q: Quaternion, out: Vector3) => Vector3): Trail => {
    const lay = sys.current!.rope.points([]).map((p) => p.clone())
    const n = 160
    const flown: Vector3[] = []
    const p = new Vector3()
    const q = new Quaternion()
    for (let k = 0; k <= n; k++) {
      fl.poseAt((fl.T * k) / n, p, q)
      flown.push(head(p, q, new Vector3()))
    }
    const arc = [0]
    for (let k = 1; k <= n; k++) arc.push(arc[k - 1] + flown[k].distanceTo(flown[k - 1]))
    const back = lay.slice().reverse()
    return { way: new Path([...back, ...flown]), clen: new Path(back).length, arc, T: fl.T }
  }
  /** reeling: in along where it lay, then out along where it rests; the rest waits inside the plug */
  const reelJoints = (R: Restore, rl: Reel, t: number) => {
    const L = R.dist[LINKS]
    const inward = t < rl.T1
    const shift = inward ? L * GLIDE(t / rl.T1) : L * (1 - GLIDE((t - rl.T1) / rl.T2))
    const path = inward ? rl.lay : rl.rest
    let first = LINKS
    for (let j = 0; j <= LINKS; j++) {
      const a = R.dist[j] - shift
      if (a >= 0) {
        path.at(a, J[j])
        first = Math.min(first, j)
      } else J[j].copy(rl.root).addScaledVector(rl.dir, a) // inside the plug, out of sight
    }
    drawState.current.visibleFrom = Math.max(0, first - 1)
    drawState.current.farScale = smoother((L - shift) / 40)
    return J
  }
  /** arrived: all physics again */
  const land = (R: Restore) => {
    const s = sys.current!
    const c = charger.current!
    if (R.trail || R.reel) for (const b of [...s.rope.links, s.far]) dynamic(b)
    drawState.current = { farScale: 1, visibleFrom: 0 }
    if (R.mode === 'home') {
      c.setLinvel({ x: 0, y: 0, z: 0 }, false)
      c.setAngvel({ x: 0, y: 0, z: 0 }, false)
      c.setBodyType(rapier.RigidBodyType.Fixed, true) // fixed in its outlet (so the cable can rest)
      actual.current.seated = true
      if (stateRef.current.pose !== 1 || stateRef.current.folded) set({ pose: 1, folded: false })
      if (R.nearRel) dynamic(s.near)
    }
    if (R.mode === 'plug') {
      dynamic(s.near)
      s.joint = lockHere(c, s.near, inPort(c).p)
      s.joint.setContactsEnabled(false)
      actual.current.plugged = true
      if (!stateRef.current.plugged) set({ plugged: true })
    }
    if (R.trail || R.reel) s.rope.attach() // one chain again, where it landed
    through.current = false
    wakeAll()
  }

  // every physics step (even timing, whatever the frame rate)
  useBeforePhysicsStep((w) => {
    const R = restore.current
    const s = sys.current
    const c = charger.current
    if (!R || !s || !c) return
    R.t += w.timestep
    if (R.landing) {
      land(R)
      restore.current = null
      return
    }
    if (R.flight) {
      const done = R.flight.step(w.timestep)
      R.flight.pose(R.pose.p, R.pose.q)
      if (R.mode === 'home') {
        c.setNextKinematicTranslation(R.pose.p)
        c.setNextKinematicRotation(R.pose.q)
        if (R.nearRel) {
          s.near.setNextKinematicTranslation(_c.copy(R.nearRel.p).applyQuaternion(R.pose.q).add(R.pose.p))
          s.near.setNextKinematicRotation(_q3.copy(R.pose.q).multiply(R.nearRel.q))
        }
      } else {
        s.near.setNextKinematicTranslation(R.pose.p)
        s.near.setNextKinematicRotation(R.pose.q)
      }
      if (R.trail) placeCable(R, trailJoints(R, R.trail, R.flight.t))
      if (done) R.landing = true
    } else if (R.reel) {
      placeCable(R, reelJoints(R, R.reel, R.t))
      if (R.t >= R.reel.T1 + R.reel.T2) R.landing = true
    }
  })

  const begin = (mode: Restore['mode'], fl: Flight | null, at: Pose): Restore => {
    const pts = sys.current!.rope.points([]).map((p) => p.clone())
    return { t: 0, mode, flight: fl, pose: { p: at.p.clone(), q: at.q.clone() }, landing: false, trail: null, reel: null, dist: jointDist(), far0: farStart(pts), nearRel: null }
  }
  /** Plug back in: the charger flies home into its outlet round what's in the way, its cable (if
   *  plugged into it) trailing behind */
  const flyHome = () => {
    const c = charger.current
    const s = sys.current
    const st = setupRef.current
    if (!c || !s || st.start === undefined || restore.current) return
    anims.current.charger = null
    seatAt.current = { i: st.start, flip: false }
    const to = seatTarget()
    const from = poseOf(c)
    // (wide: the cable trails the charger's top, which swings out as it turns)
    const curve = planRoute(world, rapier, from.p, to.p, { approach: to.p.clone().add(new Vector3(0, 80, 0)), clearance: 80, radius: 60 })
    const fl = new Flight(curve, from.q, to.q, { speed: 250, min: 1.4, max: 3.8, turn: [0.05, 0.8] })
    const R = begin('home', fl, from)
    if (actual.current.plugged) {
      R.trail = makeTrail(fl, (p, q, out) => out.copy(PORT.moldEnd).applyQuaternion(q).add(p))
      const np = poseOf(s.near)
      const inv = from.q.clone().invert()
      R.nearRel = { p: np.p.sub(from.p).applyQuaternion(inv), q: inv.multiply(np.q) }
      s.rope.detach()
      for (const b of [s.near, ...s.rope.links, s.far]) kinematic(b)
    }
    kinematic(c)
    actual.current.seated = false
    if (stateRef.current.folded) set({ folded: false })
    restore.current = R
    wakeAll()
  }
  /** Reconnect: the plug flies into the port round what's in the way, lined up for the last bit,
   *  the cable trailing behind */
  const flyPlugIn = () => {
    const s = sys.current
    const c = charger.current
    if (!s || !c || actual.current.plugged || restore.current) return
    anims.current.plug = null
    const from = poseOf(s.near)
    const to = inPort(c)
    const out = new Vector3(1, 0, 0).applyQuaternion(to.q) // the port faces out along the charger's +X
    const curve = planRoute(world, rapier, from.p, to.p, { approach: to.p.clone().addScaledVector(out, 45), clearance: 45, radius: 12 })
    const fl = new Flight(curve, from.q, to.q, { speed: 230, min: 1.2, max: 2.8, turn: [0.05, 0.75] })
    const R = begin('plug', fl, from)
    R.trail = makeTrail(fl, (p, q, o) => o.copy(nearTip.current).applyQuaternion(q).add(p))
    plugGroups(s.near, true)
    s.rope.detach()
    for (const b of [s.near, ...s.rope.links, s.far]) kinematic(b)
    restore.current = R
    wakeAll()
  }
  /** Tidy cable: reeled into its plug, fed back out along its resting layout */
  const reelTidy = () => {
    const c = charger.current
    const s = sys.current
    if (!c || !s || restore.current || !actual.current.plugged) return
    const cp = poseOf(c)
    const lay = s.rope.points([]).map((p) => p.clone())
    const R = begin('tidy', null, cp)
    const len = R.dist[LINKS]
    R.reel = {
      lay: new Path(lay),
      rest: new Path(restLayout(cp).P),
      root: lay[0].clone(),
      dir: new Vector3(1, 0, 0).applyQuaternion(cp.q), // the way the cable leaves the plug
      T1: Math.min(1.3, Math.max(0.9, len / 800)),
      T2: Math.min(1.6, Math.max(1.1, len / 650)),
    }
    s.rope.detach()
    for (const b of [...s.rope.links, s.far]) kinematic(b)
    restore.current = R
    wakeAll()
  }

  /** the charger is where it lives (in its outlet, or on the desk at home): the rest layout fits */
  const atHome = () => {
    const c = charger.current
    if (!c || anims.current.charger) return false
    if (setupRef.current.start !== undefined) return actual.current.seated
    const h = setupRef.current.home()
    const p = poseOf(c)
    return p.p.distanceTo(h.p) < 25 && Math.abs(p.q.dot(h.q)) > 0.995
  }

  // ---- fix-it prompts, most important first
  const where = (b: RapierRigidBody | undefined, up: number, out: Vector3) => {
    const t = b?.translation()
    return t ? out.set(t.x, t.y + up, t.z) : out
  }
  /** where the far plug lay, in the world now */
  const farRest = (): Pose | null => {
    const f = farHome.current
    if (!f) return null
    const h = setupRef.current.home()
    return { p: f.p.clone().applyQuaternion(h.q).add(h.p), q: h.q.clone().multiply(f.q) }
  }
  const idle = () => !anims.current.plug && !anims.current.charger && !anims.current.far && !restore.current
  const prompts: PromptItem[] = [
    {
      key: 'seat',
      label: setup.startLabel ?? 'Plug back in',
      icon: 'plug',
      at: (out) => where(charger.current ?? undefined, 75, out),
      when: () => setupRef.current.start !== undefined && !actual.current.seated && idle() && !chargerHeld.current,
      run: flyHome,
    },
    {
      key: 'port',
      label: 'Reconnect',
      icon: 'port',
      at: (out) => where(sys.current?.near, 38, out),
      when: () => !!sys.current && !actual.current.plugged && idle() && !nearHeld.current,
      run: flyPlugIn,
    },
    {
      key: 'tidy',
      label: 'Tidy cable',
      icon: 'tidy',
      at: (out) => where(sys.current?.far, 38, out),
      when: () => {
        const s = sys.current
        const rest = farRest()
        if (!s || !rest || !actual.current.plugged || !idle()) return false
        if (!atHome()) return false // (the charger first: the rest layout is for where it lives)
        return through.current || poseOf(s.far).p.distanceTo(rest.p) > 150
      },
      run: reelTidy,
    },
  ]

  const clickNear = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (actual.current.plugged) unplug(true)
    else plugIn()
  }

  const bladeHalf: [number, number, number] = [CHARGER.prong.out / 2, CHARGER.prong.w / 2, CHARGER.prong.t / 2]
  return (
    <>
      <RigidBody ref={charger} colliders={false} position={[0, B.h / 2, 0]} friction={0.8} restitution={0} linearDamping={1} angularDamping={1.5}>
        <RoundCuboidCollider args={[B.w / 2 - B.edge, B.h / 2 - B.edge, B.t / 2 - B.edge, B.edge]} mass={0.165} collisionGroups={DEVICE} />
        {/* the blades, when they stand out */}
        {!state.folded &&
          PL.zs.map((z, i) => (
            <CuboidCollider
              key={z}
              ref={(r) => {
                blades.current[i] = r
              }}
              args={bladeHalf}
              position={[PL.edge - CHARGER.prong.out / 2, B.h / 2 - CHARGER.prong.down, z]}
              mass={0.002}
              collisionGroups={DEVICE}
            />
          ))}
        <group {...chargerGrab}>
          <Charger folded={state.folded} onToggleFold={() => !actual.current.seated && set({ folded: !state.folded })} />
        </group>
      </RigidBody>
      <mesh geometry={tube.geometry} material={woven} castShadow receiveShadow {...cableGrab} />
      <group ref={nearMesh} {...nearGrab}>
        <group position={[-SLEEVE, 0, 0]}>
          <UsbCPlug onClick={clickNear} />
        </group>
      </group>
      <group ref={farMesh} {...farGrab}>
        <group position={[-SLEEVE, 0, 0]}>
          <UsbCPlug />
        </group>
      </group>
      <Prompts items={prompts} />
    </>
  )
}

/** The desk slab and the outlet stand, solid. */
export function ChargerColliders() {
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[410, 12.5, 320]} position={[-15, -12.5, 150]} friction={0.9} />
        <CylinderCollider args={[STAND.top / 2, STAND.r]} position={[STAND.at[0], STAND.top / 2, STAND.at[1]]} friction={0.8} />
      </RigidBody>
    </>
  )
}
