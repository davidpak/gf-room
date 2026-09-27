import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, CylinderCollider, useBeforePhysicsStep, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { Box3, CatmullRomCurve3, ExtrudeGeometry, InstancedMesh, LatheGeometry, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, Shape, Vector2, Vector3, type Group } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { grabbable } from '../../lib/physics/Hand'
import { GROUP, groups } from '../../lib/physics/rope'
import { Flight, planRoute } from '../../lib/physics/route'
import { poseOf, usePerch, type Pose } from '../../lib/physics/usePerch'
import { thump } from '../../lib/sound/thump'
import { Prompts, useItemHover, withHover, type PromptItem } from '../prompt/Prompts'
import { CAVITY, HOLE_R, LABEL_R, LABEL_Y, MINTS, inCavity, mintSpots } from './spec'
import { labelTexture, speckTexture, tabText } from './label'

/**
 * Rina's Ice Breakers spearmint mints (./spec): the white puck with its green label and two flip
 * tabs, and the 53 mints in it, every one its own little thing.
 *
 *   the puck      carried and turned like everything else (the shared hand). It lives on the desk;
 *                 let go near its spot and it settles back; "Return Ice Breakers" flies it home
 *                 (tabs shut first, so nothing spills on the way)
 *   the tabs      click one to flip it open (or shut): "one" over a slot a single mint slips out of,
 *                 "many" over a wide opening. Tip the puck with one open and the mints pour out,
 *                 really: they're loose inside, rattling against the walls
 *   the mints     each one can be picked up. Spilled ones on the desk: "Tidy mints" flies them back
 *                 in, one after another, in through the "many" opening, each to a free spot inside
 *                 (flying, they touch nothing, so they never knock the others out)
 */
const C = MINTS.color
const P = MINTS.puck
const M = MINTS.mint
const ITEM = groups(GROUP.item, 0xffff)
const LOOSE = groups(GROUP.item, 0) // (touches nothing)
const LID_BOTTOM = LABEL_Y - P.lid
const TAB = { t: 1.4, lift: 1.3 } // a tab's thickness; how far its top stands over the label
const _v = new Vector3()
const _q = new Quaternion()
const _m = new Matrix4()
const ONE = new Vector3(1, 1, 1)

type Door = 'one' | 'many'
type DoorState = { open: boolean; v: number }

/** points round a rounded corner (for the puck's profile) */
function corner(cx: number, cy: number, r: number, a0: number, a1: number, n = 6) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return new Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  })
}
/** an opening in the lid, in the label's shape coordinates (x, and y = the puck's z): out from its
 *  inner edge to just inside the label's edge. "one" a notch, "many" everything past a chord */
function holeShape(d: Door) {
  const s = d === 'one' ? 1 : -1
  const z0 = MINTS[d].hole.z0
  const w = d === 'one' ? MINTS.one.hole.w : 2 * Math.sqrt(HOLE_R ** 2 - z0 ** 2) - 0.01
  const r = 3 // its inner corners, rounded
  const top = Math.sqrt(HOLE_R ** 2 - (w / 2) ** 2) // where its sides meet the edge
  const a = Math.atan2(top, w / 2)
  const p = new Shape()
  // drawn for the +y ("one") side, then mirrored for "many"
  const pts: [number, number][] = []
  pts.push([-w / 2 + r, z0], [w / 2 - r, z0])
  for (let k = 1; k <= 4; k++) {
    const t = (k / 4) * (Math.PI / 2)
    pts.push([w / 2 - r + Math.sin(t) * r, z0 + r - Math.cos(t) * r])
  }
  for (let k = 0; k <= 24; k++) {
    const t = a + ((Math.PI - 2 * a) * k) / 24
    pts.push([Math.cos(t) * HOLE_R, Math.sin(t) * HOLE_R])
  }
  for (let k = 0; k < 4; k++) {
    const t = (k / 4) * (Math.PI / 2)
    pts.push([-w / 2 + r - Math.cos(t) * r, z0 + r - Math.sin(t) * r])
  }
  const flip = pts.map(([x, y]) => [x, s * y] as [number, number])
  if (s < 0) flip.reverse() // (keep its winding)
  p.moveTo(...flip[0])
  for (const q of flip.slice(1)) p.lineTo(...q)
  p.closePath()
  return p
}
/** a white tab (the "one" side's way round: its inner edge along x at the origin, reaching out toward +z) */
function tabGeometry(d: Door) {
  const { w, z0 } = MINTS[d].tab
  const Rt = P.r - 1.2 // its outer edge follows the puck's, just in from it
  const edge = Math.sqrt(Rt * Rt - (w / 2) ** 2) - z0
  const r = 2.5
  const s = new Shape()
  s.moveTo(-w / 2 + r, 0)
  s.lineTo(w / 2 - r, 0)
  s.quadraticCurveTo(w / 2, 0, w / 2, r)
  s.lineTo(w / 2, edge)
  s.absarc(0, -z0, Rt, Math.atan2(edge + z0, w / 2), Math.atan2(edge + z0, -w / 2), false)
  s.lineTo(-w / 2, r)
  s.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0)
  const g = new ExtrudeGeometry(s, { depth: TAB.t - 0.8, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 2, curveSegments: 24 })
  g.rotateX(Math.PI / 2) // (shape y -> the puck's z; its thickness goes down)
  g.translate(0, TAB.lift - 0.4, 0)
  return { g, depth: edge }
}
/** points of a region of the lid (a box in x, z clipped to the disc), top and bottom: a hull */
function lidPiece(x0: number, x1: number, z0: number, z1: number) {
  const R = CAVITY.r + 0.8
  const flat: [number, number][] = []
  const inBox = (x: number, z: number) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ])
    if (Math.hypot(x, z) <= R) flat.push([x, z])
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2
    const x = Math.cos(a) * R
    const z = Math.sin(a) * R
    if (inBox(x, z)) flat.push([x, z])
  }
  // where the box's edges cross the circle
  for (const x of [x0, x1]) if (Math.abs(x) < R) for (const z of [Math.sqrt(R * R - x * x), -Math.sqrt(R * R - x * x)]) if (inBox(x, z)) flat.push([x, z])
  for (const z of [z0, z1]) if (Math.abs(z) < R) for (const x of [Math.sqrt(R * R - z * z), -Math.sqrt(R * R - z * z)]) if (inBox(x, z)) flat.push([x, z])
  return new Float32Array(flat.flatMap(([x, z]) => [x, LID_BOTTOM, z, x, P.h / 2, z]))
}

/** the label's round, in the label's shape coordinates (y = the puck's z): the part on the "one" side
 *  of the "many" flap's hinge (with the "one" opening), or the flap */
function labelPart(part: 'main' | 'flap') {
  const z = MINTS.many.flap.z0
  const a = Math.asin(z / LABEL_R) // where the hinge meets the rim
  const s = new Shape()
  if (part === 'main') {
    s.absarc(0, 0, LABEL_R, -a, Math.PI + a, false) // round the "one" side, chord to chord
    s.closePath()
    s.holes.push(holeShape('one'))
  } else {
    s.absarc(0, 0, LABEL_R, Math.PI + a, Math.PI * 2 - a, false) // the slice past the hinge
    s.closePath()
  }
  return s
}
const PRINT = 0.5 // the printed layer's thickness, over the deck

/** the puck, drawn (tab and flap flipping with `doors`) */
export function PuckModel({ doors, onTab }: { doors: { current: Record<Door, DoorState> }; onTab?: (d: Door) => void }) {
  const mat = useMemo(() => {
    const label = labelTexture()
    label.repeat.set(-1 / (2 * LABEL_R), 1 / (2 * LABEL_R)) // (its UVs are in mm; seen from above, x runs right to left)
    label.offset.set(0.5, 0.5)
    return {
      white: new MeshStandardMaterial({ color: C.white, roughness: 0.55 }),
      deck: new MeshStandardMaterial({ color: C.inside, roughness: 0.6 }),
      label: new MeshStandardMaterial({ color: '#ffffff', map: label, roughness: 0.5 }),
      one: new MeshStandardMaterial({ map: tabText('one'), transparent: true, roughness: 0.6, depthWrite: false }),
      many: new MeshStandardMaterial({ map: tabText('many'), transparent: true, roughness: 0.6, depthWrite: false }),
    }
  }, [])
  const geo = useMemo(() => {
    const e = P.edge
    const profile = [
      new Vector2(0, -P.h / 2),
      ...corner(P.r - e, -P.h / 2 + e, e, -Math.PI / 2, 0),
      ...corner(P.r - e, P.h / 2 - e, e, 0, Math.PI / 2),
      new Vector2(LABEL_R + 0.6, P.h / 2),
      new Vector2(LABEL_R, LABEL_Y + 0.2),
      new Vector2(LABEL_R, LID_BOTTOM),
      new Vector2(CAVITY.r, LID_BOTTOM),
      new Vector2(CAVITY.r, CAVITY.y0),
      new Vector2(0, CAVITY.y0),
    ]
    const body = new LatheGeometry(profile, 72)
    const flat = (s: Shape, depth: number, top: number) => {
      const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 72 })
      g.rotateX(Math.PI / 2) // (shape y -> the puck's z; its thickness goes down from `top`)
      g.translate(0, top, 0)
      return g
    }
    // the deck under the print, with both openings through it
    const disc = new Shape()
    disc.absarc(0, 0, LABEL_R, 0, Math.PI * 2, false)
    disc.holes.push(holeShape('one'), holeShape('many'))
    const deck = flat(disc, P.lid - PRINT, LABEL_Y - PRINT)
    const label = flat(labelPart('main'), PRINT, LABEL_Y)
    // the flap: built where it lies, then shifted so its hinge line is at the origin
    const flap = flat(labelPart('flap'), PRINT, LABEL_Y)
    flap.translate(0, -LABEL_Y, MINTS.many.flap.z0)
    const word = new PlaneGeometry(13, 6.5)
    return { body, deck, label, flap, one: tabGeometry('one'), many: tabGeometry('many'), word }
  }, [])
  const doorsAt = useRef<Record<Door, Group | null>>({ one: null, many: null })
  useFrame(() => {
    const one = doorsAt.current.one
    const many = doorsAt.current.many
    if (one) one.rotation.x = -MINTS.open * doors.current.one.v
    if (many) many.rotation.x = MINTS.open * doors.current.many.v
  })
  const click = (d: Door) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onTab?.(d)
  }
  /** a white tab with its word, reading upright to someone holding the puck "one" up */
  const tab = (d: Door) => (
    <>
      <mesh geometry={geo[d].g} material={mat.white} castShadow receiveShadow />
      <mesh geometry={geo.word} material={mat[d]} position={[0, TAB.lift + 0.02, geo[d].depth * 0.52]} rotation={d === 'one' ? [-Math.PI / 2, Math.PI, 0, 'YXZ'] : [-Math.PI / 2, 0, 0]} />
    </>
  )
  const mz = MINTS.many.flap.z0
  return (
    <group>
      <mesh geometry={geo.body} material={mat.white} castShadow receiveShadow />
      <mesh geometry={geo.deck} material={mat.deck} receiveShadow />
      <mesh geometry={geo.label} material={mat.label} receiveShadow />
      {/* "one": the small white tab over its slot, hinged on its inner edge */}
      <group ref={(r) => void (doorsAt.current.one = r)} position={[0, LABEL_Y, MINTS.one.tab.z0]} onClick={click('one')}>
        {tab('one')}
      </group>
      {/* "many": the printed flap, hinged across the puck, its white tab at the edge */}
      <group ref={(r) => void (doorsAt.current.many = r)} position={[0, LABEL_Y, -mz]} onClick={click('many')}>
        <mesh geometry={geo.flap} material={mat.label} castShadow receiveShadow />
        <group rotation={[0, Math.PI, 0]} position={[0, 0, -(MINTS.many.tab.z0 - mz)]}>
          {tab('many')}
        </group>
      </group>
    </group>
  )
}

/** the puck's colliders: floor, walls, the lid in pieces (the pieces over the openings come and go) */
function PuckColliders({ plugs }: { plugs: { current: Record<Door, RapierCollider | null> } }) {
  const pieces = useMemo(() => {
    const o = MINTS.one.hole
    const m = MINTS.many.hole
    const R = CAVITY.r + 1
    return {
      fixed: [
        lidPiece(-R, R, -m.z0, o.z0), // the middle
        lidPiece(-R, -o.w / 2, o.z0, R), // either side of "one"
        lidPiece(o.w / 2, R, o.z0, R),
      ],
      one: lidPiece(-o.w / 2, o.w / 2, o.z0, R),
      many: lidPiece(-R, R, -R, -m.z0),
    }
  }, [])
  const walls = useMemo(() => {
    const n = 22
    const r = CAVITY.r + P.wall / 2
    const seg = ((2 * Math.PI * r) / n) * 1.1
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return { key: i, position: [Math.cos(a) * r, 0, Math.sin(a) * r] as [number, number, number], rotation: [0, -a, 0] as [number, number, number], args: [P.wall / 2, P.h / 2 - 0.4, seg / 2] as [number, number, number] }
    })
  }, [])
  const mass = MINTS.mass
  return (
    <>
      <CylinderCollider args={[P.floor / 2, P.r - 0.6]} position={[0, -P.h / 2 + P.floor / 2, 0]} mass={mass * 0.35} friction={0.7} collisionGroups={ITEM} />
      {walls.map(({ key, ...w }) => (
        <CuboidCollider key={key} {...w} mass={(mass * 0.35) / walls.length} friction={0.5} collisionGroups={ITEM} />
      ))}
      {pieces.fixed.map((pts, i) => (
        <ConvexHullCollider key={i} args={[pts]} mass={(mass * 0.25) / pieces.fixed.length} friction={0.6} collisionGroups={ITEM} />
      ))}
      {(['one', 'many'] as const).map((d) => (
        <ConvexHullCollider key={d} ref={(r) => void (plugs.current[d] = r)} args={[pieces[d]]} mass={mass * 0.025} friction={0.6} collisionGroups={ITEM} />
      ))}
    </>
  )
}

type Mint = { body: RapierRigidBody; fly: { fl: Flight; pose: Pose; delay: number } | null }
const TIDY_GAP = 0.09 // s between one mint's flight home and the next
const TIDY_PASSES = 3 // tries for any that end up out again

export function LiveMints({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const doors = useRef<Record<Door, DoorState>>({ one: { open: false, v: 0 }, many: { open: false, v: 0 } })
  const plugs = useRef<Record<Door, RapierCollider | null>>({ one: null, many: null })
  const mints = useRef<Mint[]>([])
  const tidy = useRef<{ t: number; reopen: boolean; pass: number; since: number } | null>(null)
  const perch = usePerch({
    key: 'mints-tin',
    label: 'Return Ice Breakers',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0), // it settles straight down onto its spot
    distance: 50,
    snap: 60,
    lift: 40,
    onFly: () => {
      doors.current.one.open = false // (shut, so nothing spills on the way)
      doors.current.many.open = false
    },
    onLand: () => thump(0.25, 'hard'),
  })
  const { world, rapier } = perch
  const mintHover = useItemHover()

  const toggle = (d: Door) => {
    const s = doors.current[d]
    s.open = !s.open
    thump(0.1, 'hard') // a little snap
    for (const m of mints.current) m.body.wakeUp()
  }

  // the tabs swing; the lid's piece over an opening is there only while its tab is (nearly) shut (it
  // stops colliding with anything: a disabled collider stayed solid here, as the charger's blades found)
  useFrame((_, dt) => {
    for (const d of ['one', 'many'] as const) {
      const s = doors.current[d]
      s.v += ((s.open ? 1 : 0) - s.v) * (1 - Math.exp(-Math.min(dt, 0.05) * (s.open ? 12 : 16)))
      const plug = plugs.current[d]
      const shut = s.v < 0.25
      if (plug && (plug.collisionGroups() === ITEM) !== shut) plug.setCollisionGroups(shut ? ITEM : LOOSE)
    }
  })

  // ---- the mints: made once the puck is home, in their layers inside it
  const puckPose = () => {
    const b = perch.body.current
    return b ? poseOf(b) : null
  }
  const toPuck = (p: Vector3, pose: Pose) => _v.copy(p).sub(pose.p).applyQuaternion(_q.copy(pose.q).invert())
  useBeforePhysicsStep(() => {
    const b = perch.body.current
    if (!b) return
    if (!mints.current.length && perch.st.current.perched) {
      const pose = poseOf(b)
      mints.current = mintSpots().map((s, i) => {
        const p = s.clone().applyQuaternion(pose.q).add(pose.p)
        const q = pose.q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), i * 2.4))
        const body = world.createRigidBody(
          rapier.RigidBodyDesc.dynamic()
            .setTranslation(p.x, p.y, p.z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
            .setLinearDamping(0.3)
            .setAngularDamping(2.2) // (so a mint landing on its edge doesn't roll away across the desk like a coin)
            .setSoftCcdPrediction(8), // (small and quick: no slipping through the puck's walls)
        )
        world.createCollider(
          rapier.ColliderDesc.roundCylinder(M.t / 2 - M.bevel, M.d / 2 - M.bevel, M.bevel).setMass(M.mass).setFriction(0.45).setRestitution(0.05).setCollisionGroups(ITEM),
          body,
        )
        body.sleep()
        return { body, fly: null }
      })
      return
    }
    // tidying: each loose mint flies up over the "many" opening and down in through it
    const td = tidy.current
    if (td) {
      td.t += world.timestep
      let busy = false
      for (const m of mints.current) {
        const f = m.fly
        if (!f) continue
        busy = true
        if (f.delay > 0) {
          f.delay -= world.timestep
          continue
        }
        const done = f.fl.step(world.timestep)
        f.fl.pose(f.pose.p, f.pose.q)
        m.body.setNextKinematicTranslation(f.pose.p)
        m.body.setNextKinematicRotation(f.pose.q)
        if (done) {
          m.fly = null
          m.body.setBodyType(rapier.RigidBodyType.Dynamic, true)
          m.body.collider(0).setCollisionGroups(ITEM) // (solid again, in its spot)
          m.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          td.since = 0
        }
      }
      // all in: once they've settled, shut the flap; any knocked out go round again
      if (!busy) {
        td.since += world.timestep
        const calm = mints.current.every((m) => {
          const v = m.body.linvel()
          return Math.hypot(v.x, v.y, v.z) < 40
        })
        if ((calm && td.since > 0.5) || td.since > 2.5) {
          tidy.current = null
          if (loose().length && td.pass < TIDY_PASSES) startTidy(td.pass + 1, td.reopen)
          else if (!td.reopen) doors.current.many.open = false
        }
      }
    }
    // safety: nothing flies off like a bullet; lost out of the world, it's back in the puck
    const pose = poseOf(b)
    mints.current.forEach((m, i) => {
      if (m.fly) return
      const v = m.body.linvel()
      const sp = Math.hypot(v.x, v.y, v.z)
      if (sp > 2500) m.body.setLinvel({ x: (v.x / sp) * 2500, y: (v.y / sp) * 2500, z: (v.z / sp) * 2500 }, true)
      if (m.body.translation().y < -1500) {
        const s = mintSpots()[i % 19].clone()
        s.y = CAVITY.y1 - M.t
        s.applyQuaternion(pose.q).add(pose.p)
        m.body.setTranslation(s, true)
        m.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
    })
  })
  useEffect(
    () => () => {
      for (const m of mints.current) if (world.getRigidBody(m.body.handle)) world.removeRigidBody(m.body)
      mints.current = []
    },
    [world],
  )

  const loose = () => {
    const pose = puckPose()
    if (!pose) return []
    return mints.current.filter((m) => !inCavity(toPuck(m.body.translation() as Vector3, pose)))
  }
  /** free spots inside, lying flat, from the top down: where no mint (or spot already given) is near */
  const freeSpots = (pose: Pose, n: number) => {
    const taken = mints.current.filter((m) => !m.fly).map((m) => toPuck(m.body.translation() as Vector3, pose).clone())
    const out: Vector3[] = []
    const step = M.d * 0.5
    for (let y = CAVITY.y1 - M.t / 2 - 0.3; y > CAVITY.y0 + M.t / 2 && out.length < n; y -= M.t * 0.5)
      for (let x = -CAVITY.r; x <= CAVITY.r && out.length < n; x += step)
        for (let z = -CAVITY.r; z <= CAVITY.r && out.length < n; z += step) {
          if (Math.hypot(x, z) > CAVITY.r - M.d / 2 - 0.6) continue
          const p = new Vector3(x, y, z)
          const clear = (q: Vector3) => Math.hypot(q.x - x, q.z - z) > M.d + 0.4 || Math.abs(q.y - y) > M.t + 0.3
          if (taken.every(clear) && out.every(clear)) out.push(p)
        }
    return out
  }
  const startTidy = (pass = 1, reopenIn?: boolean) => {
    const pose = puckPose()
    if (!pose || tidy.current) return
    const out = loose()
    if (!out.length) return
    const reopen = reopenIn ?? doors.current.many.open
    doors.current.many.open = true
    const zc = -(MINTS.many.hole.z0 + HOLE_R) / 2
    const w = (x: number, y: number, z: number) => new Vector3(x, y, z).applyQuaternion(pose.q).add(pose.p)
    const above = w(0, P.h / 2 + 30, zc)
    const spots = freeSpots(pose, out.length)
    out.forEach((m, i) => {
      const from = poseOf(m.body)
      const spot = spots[i] ?? new Vector3(((i % 5) - 2) * 7, CAVITY.y1 - M.t / 2 - 0.3, 0) // (full: somewhere on top)
      // over the opening, down in through it, then across to its spot
      const route = planRoute(world, rapier, from.p, w(spot.x * 0.3, CAVITY.y1 - M.t / 2 - 0.3, zc), { approach: above, clearance: 30, radius: 8 })
      const curve = new CatmullRomCurve3([...route.points, w(spot.x, spot.y, spot.z)], false, 'centripetal')
      const q1 = pose.q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), i * 1.3))
      m.fly = { fl: new Flight(curve, from.q, q1, { speed: 360, min: 0.7, max: 1.7, turn: [0.05, 0.7] }), pose: from, delay: (pass === 1 ? 0.25 : 0.05) + i * TIDY_GAP } // (the tab opens first)
      m.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
      m.body.collider(0).setCollisionGroups(LOOSE) // flying, it touches nothing
    })
    tidy.current = { t: 0, reopen, pass, since: 0 }
  }

  // ---- drawing the mints: one instanced mesh, from their bodies each frame
  const inst = useMemo(() => {
    const disc = new Shape()
    disc.absarc(0, 0, M.d / 2 - M.bevel, 0, Math.PI * 2, false)
    const g = new ExtrudeGeometry(disc, { depth: M.t - 2 * M.bevel, bevelEnabled: true, bevelThickness: M.bevel, bevelSize: M.bevel, bevelSegments: 3, curveSegments: 28 })
    g.translate(0, 0, -(M.t - 2 * M.bevel) / 2)
    g.rotateX(-Math.PI / 2) // flat, its faces up and down
    const mesh = new InstancedMesh(g, new MeshStandardMaterial({ color: '#ffffff', map: speckTexture(13), roughness: 0.75 }), MINTS.count)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.count = 0
    mesh.frustumCulled = false
    return mesh
  }, [])
  useFrame(() => {
    const list = mints.current
    inst.count = list.length
    list.forEach((m, i) => {
      const t = m.body.translation()
      const r = m.body.rotation()
      inst.setMatrixAt(i, _m.compose(_v.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), ONE))
    })
    inst.instanceMatrix.needsUpdate = true
  })
  const mintBox = useMemo(() => new Box3(new Vector3(-M.d / 2, -M.t / 2, -M.d / 2), new Vector3(M.d / 2, M.t / 2, M.d / 2)), [])
  const mintGrab = useMemo(
    () =>
      grabbable({
        body: (point: Vector3) => {
          if (tidy.current) return null
          let best: RapierRigidBody | null = null
          let bd = 14
          for (const m of mints.current) {
            const d = _v.copy(m.body.translation() as Vector3).distanceTo(point)
            if (d < bd) {
              bd = d
              best = m.body
            }
          }
          return best
        },
        lift: 18,
        mark: 12,
        grip: 0.02,
        box: mintBox,
      }),
    [mintBox],
  )

  const tidyItem: PromptItem = {
    key: 'mints-tidy',
    label: 'Tidy mints',
    icon: 'tidy',
    at: (out) => {
      const l = loose()
      out.set(0, 0, 0)
      for (const m of l) out.add(m.body.translation() as Vector3)
      return out.divideScalar(Math.max(1, l.length)).add(_v.set(0, 35, 0))
    },
    when: () => {
      if (tidy.current || !perch.st.current.perched) return false
      const l = loose()
      if (!l.length) return false
      return l.every((m) => {
        const v = m.body.linvel()
        return Math.hypot(v.x, v.y, v.z) < 15
      })
    },
    run: () => startTidy(),
    hover: mintHover.hovered,
  }

  if (import.meta.env.DEV) Object.assign(window, { __mints: { ...perch, doors, mints, loose, startTidy, toggle } }) // for inspecting from the console

  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} sound="hard" hold={{ lift: 30, ...perch.hold }}>
        <group {...perch.hover.bind}>
          <PuckModel doors={doors} onTab={toggle} />
        </group>
        <PuckColliders plugs={plugs} />
      </Holdable>
      <primitive object={inst} {...withHover(mintGrab, mintHover)} />
      <Prompts items={[perch.prompt, tidyItem]} />
    </>
  )
}
