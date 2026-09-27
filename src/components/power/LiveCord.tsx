import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { Box3, Group, Matrix4, Quaternion, Vector3 } from 'three'
import { grabbable, isHolding } from '../../lib/physics/Hand'
import { GROUP, Tube, createRope, groups, type Joint, type Rope } from '../../lib/physics/rope'
import { GLIDE, Path, smoother } from '../../lib/physics/route'
import { stepAlpha } from '../../lib/physics/World'
import { ContactShadow } from '../../lib/render/contactShadow'
import { thump } from '../../lib/sound/thump'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { CORD, PLUGS, PlugHead, layCord, plugBack, type Prongs } from './PowerCord'

/**
 * A power cord as a real thing (the charger cable's ways: lib/physics/rope, the cable physics
 * playbook): one end fixed where it leaves its appliance (riding the desk), a plug on the other.
 *
 *   plugged in    the plug is fixed in its socket and the appliance has power (`onPower`)
 *   grab the plug it comes out (power off); hold it close in front of a free socket and it goes in
 *   the cord      carry any bit of it (on a leash: it's never dragged through anything)
 *   pulled taut   raise the desk too far and the plug pops out of the wall, as it would
 *   plug back in  a fix-it prompt: the cord reels into the appliance along itself and feeds back out
 *                 along its run, the plug riding its end into the socket
 *
 * Sockets are shared between cords (`taken`): a plug only goes into a free one.
 */
export type Pose = { p: Vector3; q: Quaternion }
export type Socket = { id: string; frame: Matrix4 }
export type CordSetup = {
  id: string
  /** where the cord leaves its appliance (world): its +Z is the way the cord comes out */
  anchor: () => Pose
  /** the cord's run to a socket, from the anchor to the plug's back (./PowerCord cordRoute) */
  run: (socket: Matrix4) => Vector3[]
  sockets: () => Socket[]
  /** the socket it starts in */
  start: number
  length: number
  prongs: Prongs
  onPower: (on: boolean) => void
  /** something it's fixed to is moving (the desk): don't put it to sleep meanwhile */
  moving?: () => boolean
}

const LINK = 30 // mm per link
const taken = new Map<string, string>() // socket -> the cord in it
const Z = new Vector3(0, 0, 1)
const Y = new Vector3(0, 1, 0)
const _v = new Vector3()
const _w = new Vector3()
const _q = new Quaternion()
const _q2 = new Quaternion()
const poseOf = (b: RapierRigidBody): Pose => {
  const t = b.translation()
  const r = b.rotation()
  return { p: new Vector3(t.x, t.y, t.z), q: new Quaternion(r.x, r.y, r.z, r.w) }
}
const frameOf = (m: Matrix4): Pose => {
  const p = new Vector3()
  const q = new Quaternion()
  m.decompose(p, q, new Vector3())
  return { p, q }
}
// dist: each joint's distance along the cord by its links' real lengths (not the nominal length: a cord
// laid along a run comes out a touch shorter, and spacing it nominally squashes its end, which springs
// back when it's let go)
type Reel = { t: number; lay: Path; rest: Path; root: Vector3; dir: Vector3; T1: number; T2: number; socket: number; socketId: string; end: Pose; landing: boolean; dist: number[] }
type Snap = { from: Pose; to: Pose; t: number; socket: number; landing: boolean }

export function LiveCord({ setup }: { setup: CordSetup }) {
  const { world, rapier } = useRapier()
  const setupRef = useRef(setup)
  setupRef.current = setup
  const P = PLUGS[setup.prongs]
  const R = P.cord
  const back = plugBack(setup.prongs)
  const N = Math.round(setup.length / LINK)
  const LINK_BOX = useMemo(() => new Box3(new Vector3(-R, -LINK / 2 - R, -R), new Vector3(R, LINK / 2 + R, R)), [R])
  const tube = useMemo(() => new Tube(N + 1, 3, 10), [N])
  const shade = useMemo(() => new ContactShadow(world, rapier, N + 1), [world, rapier, N])
  const pts = useRef<Vector3[]>([])
  const plugMesh = useRef<Group>(null)
  // socket: its index in sockets(); socketId: its name (kept, so letting go never needs the outlet, which may be gone)
  const sys = useRef<{ rope: Rope; anchor: RapierRigidBody; plug: RapierRigidBody; joint: Joint | null; socket: number | null; socketId: string | null } | null>(null)
  const sockBodies = useRef(new Map<string, RapierRigidBody>())
  const reel = useRef<Reel | null>(null)
  const snap = useRef<Snap | null>(null)
  const draw = useRef({ plugScale: 1, visibleFrom: 0 })
  const plugPrev = useRef({ p: new Vector3(), q: new Quaternion(), ok: false })
  const J = useMemo(() => Array.from({ length: N + 1 }, () => new Vector3()), [N])
  const held = useRef(false)
  const armed = useRef(false)
  const heldLink = useRef(0)
  const calm = useRef(0)
  const taut = useRef(0)
  const tick = useRef(0)
  const settled = useRef(0) // s since it was laid (it settles before a taut pull counts)

  const plugGroups = (inSocket: boolean) => {
    const s = sys.current
    if (!s) return
    const g = groups(GROUP.plug, 0xffff & ~GROUP.rope & (inSocket ? ~GROUP.device : 0xffff))
    for (let i = 0; i < s.plug.numColliders(); i++) s.plug.collider(i).setCollisionGroups(g)
  }
  const socketBody = (sk: Socket) => {
    let b = sockBodies.current.get(sk.id)
    const f = frameOf(sk.frame)
    if (!b || !world.getRigidBody(b.handle)) {
      b = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(f.p.x, f.p.y, f.p.z).setRotation({ x: f.q.x, y: f.q.y, z: f.q.z, w: f.q.w }))
      sockBodies.current.set(sk.id, b)
    }
    return b
  }
  /** fixed in socket i where it is now (it's there): power on */
  const lockIn = (i: number) => {
    const s = sys.current!
    const sk = setupRef.current.sockets()[i]
    const sb = socketBody(sk)
    const f = frameOf(sk.frame)
    const inv = f.q.clone().invert()
    const pp = poseOf(s.plug)
    const l = pp.p.clone().sub(f.p).applyQuaternion(inv)
    const pinv = pp.q.clone().invert()
    const j = world.createImpulseJoint(
      rapier.JointData.fixed({ x: l.x, y: l.y, z: l.z }, { x: inv.x, y: inv.y, z: inv.z, w: inv.w }, { x: 0, y: 0, z: 0 }, { x: pinv.x, y: pinv.y, z: pinv.z, w: pinv.w }),
      sb,
      s.plug,
      true,
    )
    j.setContactsEnabled(false)
    s.joint = j
    s.socket = i
    s.socketId = sk.id
    taken.set(sk.id, setupRef.current.id)
    plugGroups(true)
    setupRef.current.onPower(true)
  }
  const unplug = (push: boolean) => {
    const s = sys.current
    if (!s || s.socket === null) return
    const sk = setupRef.current.sockets()[s.socket]
    if (s.joint && world.getImpulseJoint(s.joint.handle)) world.removeImpulseJoint(s.joint, true)
    s.joint = null
    if (s.socketId) taken.delete(s.socketId)
    s.socket = null
    s.socketId = null
    setupRef.current.onPower(false)
    if (push && sk) {
      const out = _v.copy(Z).applyQuaternion(frameOf(sk.frame).q).multiplyScalar(s.plug.mass() * 400)
      s.plug.applyImpulse({ x: out.x, y: out.y, z: out.z }, true)
      thump(0.3, 'hard')
    }
    setTimeout(() => sys.current?.socket === null && plugGroups(false), 300)
  }
  /** the free socket the plug is close in front of, if any */
  const nearSocket = (maxD: number) => {
    const s = sys.current
    if (!s) return -1
    const pp = poseOf(s.plug)
    const face = _w.copy(Z).applyQuaternion(pp.q)
    let best = -1
    let bd = maxD
    setupRef.current.sockets().forEach((sk, i) => {
      const t = taken.get(sk.id)
      if (t && t !== setupRef.current.id) return
      const f = frameOf(sk.frame)
      const d = pp.p.distanceTo(f.p)
      if (d < bd && face.dot(_v.copy(Z).applyQuaternion(f.q)) > 0.5) {
        bd = d
        best = i
      }
    })
    return best
  }
  /** into socket i: a short glide in along its axis, then fixed there */
  const plugIn = (i: number) => {
    const s = sys.current
    if (!s || snap.current || s.socket !== null) return
    const to = frameOf(setupRef.current.sockets()[i].frame)
    s.plug.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
    plugGroups(true)
    snap.current = { from: poseOf(s.plug), to, t: 0, socket: i, landing: false }
  }

  const build = () => {
    const st = setupRef.current
    const socks = st.sockets()
    const sk = socks[st.start]
    if (!sk) return // (the outlet isn't there yet: next frame)
    const run = st.run(sk.frame)
    const lay = layCord(run, st.length, N, 0, R)
    const rope = createRope(world, rapier, lay, { radius: R, mass: 0.003, bend: 8, bendDamping: 0.3, memory: 0.4, linearDamping: 2.5, angularDamping: 20 })
    const a = st.anchor()
    const anchor = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(a.p.x, a.p.y, a.p.z).setRotation({ x: a.q.x, y: a.q.y, z: a.q.z, w: a.q.w }))
    const reached = lay[N].distanceTo(run[run.length - 1]) < 3 && !taken.get(sk.id)
    let pose: Pose
    if (reached) pose = frameOf(sk.frame)
    else {
      const d = lay[N].clone().sub(lay[N - 1]).normalize() // the plug beyond the cord's end
      pose = { p: lay[N].clone().addScaledVector(d, back), q: new Quaternion().setFromUnitVectors(Z, d.negate()) }
    }
    const plug = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(pose.p.x, pose.p.y, pose.p.z)
        .setRotation({ x: pose.q.x, y: pose.q.y, z: pose.q.z, w: pose.q.w })
        .setLinearDamping(0.8)
        .setAngularDamping(2)
        .setSoftCcdPrediction(12),
    )
    const k = 2
    world.createCollider(
      rapier.ColliderDesc.roundCuboid(P.w / 2 - k, P.h / 2 - k, P.d / 2 - k, k)
        .setTranslation(0, 0, P.d / 2)
        .setMass(P.mass)
        .setFriction(0.8)
        .setContactSkin(0.6)
        .setCollisionGroups(groups(GROUP.plug, 0xffff & ~GROUP.rope)),
      plug,
    )
    rope.ends(anchor, plug)
    sys.current = { rope, anchor, plug, joint: null, socket: null, socketId: null }
    settled.current = 0
    if (import.meta.env.DEV) Object.assign(window, { __cords: { ...((window as unknown as { __cords?: object }).__cords ?? {}), [st.id]: { sys, lay, run, reached, world } } }) // for inspecting from the console
    if (reached) lockIn(st.start)
    else st.onPower(false)
  }
  const teardown = () => {
    const s = sys.current
    if (!s) return
    if (s.socketId) taken.delete(s.socketId)
    if (s.joint && world.getImpulseJoint(s.joint.handle)) world.removeImpulseJoint(s.joint, false)
    s.rope.remove()
    for (const b of [s.anchor, s.plug]) if (world.getRigidBody(b.handle)) world.removeRigidBody(b)
    for (const b of sockBodies.current.values()) if (world.getRigidBody(b.handle)) world.removeRigidBody(b)
    sockBodies.current.clear()
    sys.current = null
  }
  useEffect(() => teardown, [world]) // eslint-disable-line react-hooks/exhaustive-deps

  const wakeAll = () => {
    const s = sys.current
    if (s) for (const b of [...s.rope.links, s.plug]) b.wakeUp()
  }

  // ---- plug back in: reeled into the appliance along itself, fed back out along its run into a socket
  const startReel = () => {
    const s = sys.current
    const st = setupRef.current
    if (!s || reel.current || s.socket !== null) return
    const socks = st.sockets()
    let i = st.start
    if (taken.get(socks[i].id)) i = socks.findIndex((sk) => !taken.get(sk.id))
    if (i < 0 || !socks[i]) return
    const lay = s.rope.points([]).map((p) => p.clone())
    const real = s.rope.lengths.reduce((a, l) => a + l, 0) // (the cord as it really is)
    const rest = layCord(st.run(socks[i].frame), real, N, 0, R)
    const a = st.anchor()
    s.rope.detach()
    for (const b of [...s.rope.links, s.plug]) b.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
    plugGroups(true)
    reel.current = {
      t: 0,
      lay: new Path(lay),
      rest: new Path(rest),
      root: lay[0].clone(),
      dir: new Vector3(0, 0, 1).applyQuaternion(a.q),
      T1: Math.min(1.6, Math.max(0.9, st.length / 1300)),
      T2: Math.min(2.4, Math.max(1.3, st.length / 1000)),
      socket: i,
      socketId: socks[i].id,
      dist: s.rope.lengths.reduce((d, l) => (d.push(d[d.length - 1] + l), d), [0]),
      end: frameOf(socks[i].frame),
      landing: false,
    }
    taken.set(socks[i].id, st.id) // (claimed on the way)
    wakeAll()
  }
  // every physics step: the anchor rides its appliance; reeling and snapping in are moved here too
  useBeforePhysicsStep((w) => {
    const s = sys.current
    if (!s) return
    s.rope.snapshot()
    const pt = s.plug.translation()
    const pr = s.plug.rotation()
    plugPrev.current.p.set(pt.x, pt.y, pt.z)
    plugPrev.current.q.set(pr.x, pr.y, pr.z, pr.w)
    plugPrev.current.ok = true
    const a = setupRef.current.anchor()
    s.anchor.setNextKinematicTranslation(a.p)
    s.anchor.setNextKinematicRotation(a.q)
    const dt = w.timestep
    // snapping into a socket
    const sn = snap.current
    if (sn) {
      if (sn.landing) {
        snap.current = null
        s.plug.setLinvel({ x: 0, y: 0, z: 0 }, false)
        s.plug.setAngvel({ x: 0, y: 0, z: 0 }, false)
        s.plug.setBodyType(rapier.RigidBodyType.Dynamic, true)
        lockIn(sn.socket)
        thump(0.25, 'hard')
      } else {
        sn.t = Math.min(1, sn.t + dt / 0.32)
        const k = smoother(sn.t)
        // in front of the socket first, then straight in
        const front = sn.to.p.clone().addScaledVector(_v.copy(Z).applyQuaternion(sn.to.q), 22)
        const p = k < 0.6 ? sn.from.p.clone().lerp(front, smoother(k / 0.6)) : front.lerp(sn.to.p, smoother((k - 0.6) / 0.4))
        s.plug.setNextKinematicTranslation(p)
        s.plug.setNextKinematicRotation(_q.copy(sn.from.q).slerp(sn.to.q, smoother(k / 0.6)))
        if (sn.t >= 1) sn.landing = true
      }
    }
    // reeling
    const rl = reel.current
    if (rl) {
      if (rl.landing) {
        reel.current = null
        for (const b of s.rope.links) {
          b.setLinvel({ x: 0, y: 0, z: 0 }, false)
          b.setAngvel({ x: 0, y: 0, z: 0 }, false)
          b.setBodyType(rapier.RigidBodyType.Dynamic, true)
        }
        s.plug.setLinvel({ x: 0, y: 0, z: 0 }, false)
        s.plug.setAngvel({ x: 0, y: 0, z: 0 }, false)
        s.plug.setBodyType(rapier.RigidBodyType.Dynamic, true)
        draw.current = { plugScale: 1, visibleFrom: 0 }
        s.rope.attach()
        settled.current = 0
        // it ends at the socket's mouth, by its own length: the plug glides the last bit in (nothing's
        // pulled apart, so nothing springs back)
        taken.delete(rl.socketId)
        plugIn(rl.socket)
        return
      }
      rl.t += dt
      const dist = rl.dist
      const L = dist[N]
      const inward = rl.t < rl.T1
      const shift = inward ? L * GLIDE(rl.t / rl.T1) : L * (1 - GLIDE((rl.t - rl.T1) / rl.T2))
      const path = inward ? rl.lay : rl.rest
      let first = N
      for (let j = 0; j <= N; j++) {
        const d = dist[j] - shift
        if (d >= 0) {
          path.at(d, J[j])
          first = Math.min(first, j)
        } else J[j].copy(rl.root).addScaledVector(rl.dir, d) // inside the appliance
      }
      for (let i = 0; i < N; i++) {
        _w.copy(J[i + 1]).sub(J[i])
        const len = _w.length()
        if (len < 1e-6) continue
        s.rope.links[i].setNextKinematicTranslation(_v.copy(J[i]).add(J[i + 1]).multiplyScalar(0.5))
        s.rope.links[i].setNextKinematicRotation(_q.setFromUnitVectors(Y, _w.divideScalar(len)))
      }
      // the plug rides the end (turned to meet its socket as it arrives)
      const zdir = _w.copy(J[N - 1]).sub(J[N]).normalize()
      _q.setFromUnitVectors(Z, zdir)
      const u = inward ? 0 : (rl.t - rl.T1) / rl.T2
      if (u > 0.8) _q.slerp(rl.end.q, smoother((u - 0.8) / 0.2))
      const ppos = _v.copy(J[N]).addScaledVector(_w.copy(Z).applyQuaternion(_q), -back)
      s.plug.setNextKinematicTranslation(ppos)
      s.plug.setNextKinematicRotation(_q)
      draw.current = { plugScale: smoother((L - shift) / 50), visibleFrom: Math.max(0, first - 1) }
      if (rl.t >= rl.T1 + rl.T2) rl.landing = true
    }
  })

  // ---- grabbing
  /** how far along the cord something can be carried from where it leaves the appliance */
  const tether = (along: number) => {
    const s = sys.current
    if (!s) return null
    return { from: setupRef.current.anchor().p, length: along * 0.97 }
  }
  const plugGrab = grabbable({
    body: () => (reel.current ? null : sys.current?.plug),
    lift: 30,
    pull: 0.06,
    grip: 0.04,
    mark: 18,
    keep: () => !snap.current && !reel.current,
    leash: () => tether(setupRef.current.length + back),
    onGrab: () => {
      wakeAll()
      held.current = true
      armed.current = false
      if (sys.current?.socket !== null) unplug(false)
    },
    onRelease: () => {
      held.current = false
      if (armed.current) {
        const i = nearSocket(60)
        if (i >= 0) plugIn(i)
      }
    },
  })
  const cordGrab = grabbable({
    lift: 25,
    free: true,
    box: LINK_BOX,
    mark: 14,
    pull: 0.15,
    grip: 0.01,
    onGrab: () => wakeAll(),
    leash: () => tether((heldLink.current + 0.5) * LINK + 2 * R),
    body: (point) => {
      const s = sys.current
      if (!s || reel.current) return null
      let best = 0
      let d = Infinity
      s.rope.links.forEach((l, i) => {
        const t = l.translation()
        const e = (t.x - point.x) ** 2 + (t.y - point.y) ** 2 + (t.z - point.z) ** 2
        if (e < d) {
          d = e
          best = i
        }
      })
      heldLink.current = best
      return s.rope.links[best]
    },
  })

  useFrame(() => {
    if (!sys.current) build()
    if (!sys.current) return
    const s = sys.current
    // held close in front of a free socket, it goes in (armed once it's been well away from them all)
    if (held.current && s.socket === null && !snap.current) {
      if (nearSocket(90) < 0) armed.current = true
      else if (armed.current) {
        const i = nearSocket(35)
        if (i >= 0) plugIn(i)
      }
    }
    // pulled taut while plugged in (the desk going up): it pops out of the wall
    settled.current += 1 / 60
    if (s.socket !== null && !snap.current && !reel.current && settled.current > 2 && ++tick.current % 5 === 0) {
      const p = s.rope.points(pts.current)
      let worst = 0
      for (let i = 0; i < N; i++) worst = Math.max(worst, p[i].distanceTo(p[i + 1]) / (setupRef.current.length / N))
      taut.current = worst > 1.18 ? taut.current + 1 : 0
      if (taut.current >= 6) {
        taut.current = 0
        unplug(true)
      }
    }
    // safety: nothing faster than a flick; blown up anyway (forced through something) -> laid again
    let wild = false
    let fastest = 0
    for (const b of [...s.rope.links, s.plug]) {
      if (!b.isDynamic()) continue
      const v = b.linvel()
      const sp = Math.hypot(v.x, v.y, v.z)
      if (!Number.isFinite(sp) || Math.abs(b.translation().y) > 5000) wild = true
      else if (sp > 3000) b.setLinvel({ x: (v.x / sp) * 3000, y: (v.y / sp) * 3000, z: (v.z / sp) * 3000 }, true)
      fastest = Math.max(fastest, sp)
    }
    if (wild) {
      teardown()
      return
    }
    // at rest: asleep (no idle shimmer); anything that touches it wakes it
    calm.current = !isHolding() && !snap.current && !reel.current && !setupRef.current.moving?.() && fastest < 30 ? calm.current + 1 : 0
    if (calm.current >= 20 && calm.current % 20 === 0) for (const b of [...s.rope.links, s.plug]) if (b.isDynamic() && !b.isSleeping()) b.sleep()
    // draw: blended between physics steps
    const alpha = Math.min(1, Math.max(0, stepAlpha()))
    tube.update(s.rope.points(pts.current, alpha), R)
    tube.visibleFrom(draw.current.visibleFrom)
    shade.update(pts.current, R, draw.current.visibleFrom)
    const m = plugMesh.current
    if (m) {
      const t = s.plug.translation()
      const r = s.plug.rotation()
      m.position.set(t.x, t.y, t.z)
      m.quaternion.set(r.x, r.y, r.z, r.w)
      const pv = plugPrev.current
      if (pv.ok && alpha < 1) {
        m.position.lerpVectors(pv.p, m.position, alpha)
        _q2.copy(m.quaternion)
        m.quaternion.copy(pv.q).slerp(_q2, alpha)
      }
      m.scale.setScalar(Math.max(1e-3, draw.current.plugScale))
      m.visible = draw.current.plugScale > 0.01
    }
  })

  const prompts: PromptItem[] = [
    {
      key: 'plug',
      label: 'Plug back in',
      icon: 'plug',
      at: (out) => {
        const t = sys.current?.plug.translation()
        return t ? out.set(t.x, t.y + 45, t.z) : out
      },
      when: () => !!sys.current && sys.current.socket === null && !held.current && !snap.current && !reel.current,
      run: startReel,
    },
  ]

  return (
    <>
      <mesh geometry={tube.geometry} material={CORD} castShadow receiveShadow {...cordGrab} />
      <primitive object={shade.mesh} />
      <group ref={plugMesh} {...plugGrab}>
        <PlugHead prongs={setup.prongs} />
      </group>
      <Prompts items={prompts} />
    </>
  )
}
