import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, CylinderCollider, useBeforePhysicsStep, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { Box3, CatmullRomCurve3, ExtrudeGeometry, InstancedMesh, LatheGeometry, Matrix4, MeshStandardMaterial, Quaternion, SRGBColorSpace, Shape, ShapeGeometry, TextureLoader, Vector2, Vector3, type BufferGeometry, type Group } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { grabbable } from '../../lib/physics/Hand'
import { GROUP, groups } from '../../lib/physics/rope'
import { Flight, planRoute } from '../../lib/physics/route'
import { poseOf, usePerch, type Pose } from '../../lib/physics/usePerch'
import { thump } from '../../lib/sound/thump'
import { Prompts, useItemHover, withHover, type PromptItem } from '../prompt/Prompts'
import { CAVITY, HOLE_R, LABEL_R, LABEL_Y, MINTS, TAB_TOP, inCavity, mintSpots } from './spec'
import { speckTexture } from './label'

/**
 * Rina's Ice Breakers spearmint mints (./spec): the white puck with the maker's own lid and base
 * printed on it (their product shots, laid on flat), two flip tabs, and the 53 mints in it, every one
 * its own little thing.
 *
 *   the puck      carried and turned like everything else (the shared hand). It lives on the desk;
 *                 let go near its spot and it settles back; "Return Ice Breakers" flies it home
 *                 (tabs shut first, so nothing spills on the way)
 *   the tabs      click one to flip it open (or shut): "one" over a slot a mint slips out of on its
 *                 edge, one at a time; "many" lifts a slice of the lid off a wide opening. Tip the puck
 *                 with one open and the mints pour out, really: they're loose inside
 *   the mints     each one can be picked up. Spilled ones: "Tidy mints" flies them back in, one after
 *                 another, in through the "many" opening, each to a free spot inside (flying, they
 *                 touch nothing, so they never knock the others out)
 */
const C = MINTS.color
const P = MINTS.puck
const M = MINTS.mint
const ITEM = groups(GROUP.item, 0xffff)
const LOOSE = groups(GROUP.item, 0) // (touches nothing)
const LID_BOTTOM = CAVITY.y1
const PRINT = 0.4 // the printed layer over the deck
const TAB_T = 1.3
/** the "one" notch in the top of the wall: its half angle round the puck (from +z) and its bottom */
const NOTCH = { half: Math.asin(MINTS.one.hole.w / 2 / MINTS.puck.r), y: CAVITY.y1 - MINTS.one.hole.notch }
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

/**
 * A region of the lid, in shape coordinates (x, y = the puck's z): the strip |x| < half from z0 out
 * to a circle of radius R, on the "one" side (+1) or the "many" side (-1), its inner corners rounded
 * by rc. (half = the whole chord and rc = 0: everything past the chord.)
 */
function capShape(half: number, z0: number, R: number, rc: number, side: 1 | -1) {
  const edge = Math.sqrt(Math.max(0, R * R - half * half)) // where the strip's sides meet the circle
  const a = Math.atan2(edge, half)
  const pts: [number, number][] = []
  const add = (x: number, y: number) => {
    const last = pts[pts.length - 1]
    if (!last || Math.hypot(last[0] - x, last[1] - y) > 1e-3) pts.push([x, y])
  }
  add(-half + rc, z0)
  add(half - rc, z0)
  for (let k = 1; k <= 5 && rc > 0; k++) {
    const t = (k / 5) * (Math.PI / 2)
    add(half - rc + Math.sin(t) * rc, z0 + rc - Math.cos(t) * rc)
  }
  for (let k = 0; k <= 32; k++) {
    const t = a + ((Math.PI - 2 * a) * k) / 32
    add(Math.cos(t) * R, Math.sin(t) * R)
  }
  for (let k = 0; k < 5 && rc > 0; k++) {
    const t = (k / 5) * (Math.PI / 2)
    add(-half + rc - Math.cos(t) * rc, z0 + rc - Math.sin(t) * rc)
  }
  const s = new Shape()
  const q = pts.map(([x, y]) => [x, side * y] as [number, number])
  if (side < 0) q.reverse()
  s.moveTo(...q[0])
  for (const p of q.slice(1)) s.lineTo(...p)
  s.closePath()
  return s
}
const chord = (R: number, z0: number) => Math.sqrt(R * R - z0 * z0)
/** the white rim's two halves: a ring from the label out to the edge, parted by the tabs */
function rimPiece(side: 1 | -1) {
  const Ro = P.r
  const Ri = LABEL_R
  const wo = MINTS.one.tab.w / 2
  const wm = MINTS.many.tab.w / 2
  const pts: [number, number][] = []
  const arc = (r: number, a0: number, a1: number) => {
    for (let k = 0; k <= 40; k++) {
      const t = a0 + ((a1 - a0) * k) / 40
      pts.push([Math.cos(t) * r, Math.sin(t) * r])
    }
  }
  arc(Ro, -Math.acos(wm / Ro), Math.acos(wo / Ro)) // round the outside, from the "many" tab to the "one" tab
  arc(Ri, Math.acos(wo / Ri), -Math.acos(wm / Ri)) // and back round the inside
  const s = new Shape()
  const q = pts.map(([x, y]) => [side * x, y] as [number, number])
  if (side < 0) q.reverse()
  s.moveTo(...q[0])
  for (const p of q.slice(1)) s.lineTo(...p)
  s.closePath()
  return s
}
/** a flat part: a shape `thick` thick, its top at `top`, lying level (shape y = the puck's z); the
 *  shape's UVs are its coordinates in mm (the photos are laid on by them) */
function flat(shape: Shape, thick: number, top: number, bevel = 0) {
  const g = new ExtrudeGeometry(shape, {
    depth: thick - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 48,
  })
  g.rotateX(Math.PI / 2) // (shape y -> the puck's z; its thickness goes down from `top`)
  g.translate(0, top - bevel, 0)
  return g
}
/** printed on top, plain everywhere else: its top face material 0, its underside 2, its sides 1
 *  (an extrusion's first half of faces is the face that ends up on top here) */
function printedTop(g: BufferGeometry) {
  const [caps, sides] = g.groups
  const half = caps.count / 2
  g.clearGroups()
  g.addGroup(caps.start, half, 0)
  g.addGroup(caps.start + half, half, 2)
  g.addGroup(sides.start, sides.count, 1)
  return g
}
/** a product shot laid flat over shape coordinates, seen from above ("top": x runs right to left) or below */
function photo(which: 'top' | 'bottom') {
  const ph = MINTS.photo[which]
  const t = new TextureLoader().load(ph.src)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  const s = ph.k / ph.size
  t.repeat.set(which === 'top' ? -s : s, s)
  t.offset.set(ph.cx / ph.size, 1 - ph.cy / ph.size)
  return t
}

/** the puck, drawn (tab and flap flipping with `doors`) */
export function PuckModel({ doors, onTab }: { doors: { current: Record<Door, DoorState> }; onTab?: (d: Door) => void }) {
  const mat = useMemo(() => {
    const white = new MeshStandardMaterial({ color: C.white, roughness: 0.55 })
    const lid = new MeshStandardMaterial({ color: '#ffffff', map: photo('top'), roughness: 0.5 })
    return {
      white,
      inside: new MeshStandardMaterial({ color: C.inside, roughness: 0.6 }),
      base: new MeshStandardMaterial({ color: C.base, roughness: 0.6 }),
      baseprint: new MeshStandardMaterial({ color: '#ffffff', map: photo('bottom'), roughness: 0.6 }),
      printed: [lid, white, white],
    }
  }, [])
  const geo = useMemo(() => {
    const e = P.edge
    const rimY = P.h / 2 - P.rimT
    // the side, round all but the "one" notch; under the notch, the side up to its bottom; the skirt
    // over the notch goes with the tab
    const side = (top: number) => [...corner(P.r - e, -P.h / 2 + e, e, -Math.PI / 4, 0, 3), new Vector2(P.r, top), new Vector2(CAVITY.r, top), new Vector2(CAVITY.r, CAVITY.y0), new Vector2(0, CAVITY.y0)]
    const sides = new LatheGeometry(side(rimY), 96, NOTCH.half, Math.PI * 2 - 2 * NOTCH.half)
    const underNotch = new LatheGeometry(side(NOTCH.y), 8, -NOTCH.half, 2 * NOTCH.half)
    const skirt = new LatheGeometry([new Vector2(CAVITY.r + 0.15, NOTCH.y + 0.1), new Vector2(P.r, NOTCH.y + 0.1), new Vector2(P.r, rimY + 0.05), new Vector2(CAVITY.r + 0.15, rimY + 0.05), new Vector2(CAVITY.r + 0.15, NOTCH.y + 0.1)], 8, -NOTCH.half + 0.004, 2 * NOTCH.half - 0.008)
    skirt.translate(0, -LABEL_Y, -MINTS.one.tab.z0)
    const under = new LatheGeometry([new Vector2(0, -P.h / 2), new Vector2(P.r - e, -P.h / 2), ...corner(P.r - e, -P.h / 2 + e, e, -Math.PI / 2, -Math.PI / 4, 3)], 96)
    const baseDisc = new ShapeGeometry(new Shape().absarc(0, 0, P.r - e, 0, Math.PI * 2, false), 72)
    baseDisc.rotateX(Math.PI / 2) // facing down, shape y -> the puck's z
    baseDisc.translate(0, -P.h / 2 - 0.03, 0)
    const rim = [flat(rimPiece(1), P.rimT, P.h / 2, 0.45), flat(rimPiece(-1), P.rimT, P.h / 2, 0.45)]
    // the deck under the print, both openings through it
    const deckShape = new Shape().absarc(0, 0, LABEL_R, 0, Math.PI * 2, false)
    const oneSlot = () => capShape(MINTS.one.hole.w / 2, MINTS.one.hole.z0, HOLE_R, 3, 1)
    deckShape.holes.push(oneSlot(), capShape(chord(HOLE_R, MINTS.many.hole.z0) - 0.01, MINTS.many.hole.z0, HOLE_R, 0, -1))
    const deck = flat(deckShape, P.lid - PRINT, LABEL_Y - PRINT)
    // the printed lid: all but the flap (the "one" slot through it), and the flap
    const fz = MINTS.many.flap.z0
    const mainShape = capShape(chord(LABEL_R, fz) - 0.01, -fz, LABEL_R, 0, 1)
    mainShape.holes.push(oneSlot())
    const label = printedTop(flat(mainShape, PRINT, LABEL_Y))
    const flap = printedTop(flat(capShape(chord(LABEL_R, fz) - 0.01, fz, LABEL_R, 0, -1), PRINT, LABEL_Y))
    flap.translate(0, -LABEL_Y, fz) // (its hinge line at the origin)
    // the tabs, where they lie, then shifted to their hinges
    const tab = (d: Door) => printedTop(flat(capShape(MINTS[d].tab.w / 2, MINTS[d].tab.z0, P.r - 0.25, 4, d === 'one' ? 1 : -1), TAB_T, TAB_TOP, 0.35))
    const one = tab('one').translate(0, -LABEL_Y, -MINTS.one.tab.z0)
    const many = tab('many').translate(0, -LABEL_Y, fz)
    return { sides, underNotch, skirt, under, baseDisc, rim, deck, label, flap, one, many }
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
  return (
    <group>
      <mesh geometry={geo.sides} material={mat.white} castShadow receiveShadow />
      <mesh geometry={geo.underNotch} material={mat.white} castShadow receiveShadow />
      <mesh geometry={geo.under} material={mat.base} castShadow receiveShadow />
      <mesh geometry={geo.baseDisc} material={mat.baseprint} />
      {geo.rim.map((g, i) => (
        <mesh key={i} geometry={g} material={mat.white} castShadow receiveShadow />
      ))}
      <mesh geometry={geo.deck} material={mat.inside} receiveShadow />
      <mesh geometry={geo.label} material={mat.printed} receiveShadow />
      {/* "one": the white tab over its slot, hinged on its inner edge */}
      <group ref={(r) => void (doorsAt.current.one = r)} position={[0, LABEL_Y, MINTS.one.tab.z0]} onClick={click('one')}>
        <mesh geometry={geo.one} material={mat.printed} castShadow receiveShadow />
        <mesh geometry={geo.skirt} material={mat.white} castShadow receiveShadow />
      </group>
      {/* "many": a slice of the lid, hinged across it, its white tab at the edge */}
      <group ref={(r) => void (doorsAt.current.many = r)} position={[0, LABEL_Y, -MINTS.many.flap.z0]} onClick={click('many')}>
        <mesh geometry={geo.flap} material={mat.printed} castShadow receiveShadow />
        <mesh geometry={geo.many} material={mat.printed} castShadow receiveShadow />
      </group>
    </group>
  )
}

/** points of a region of the lid (a box in x, z clipped to the disc), top and bottom: a hull */
function lidPiece(x0: number, x1: number, z0: number, z1: number, R = CAVITY.r + 0.8) {
  const flatPts: [number, number][] = []
  const inBox = (x: number, z: number) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ])
    if (Math.hypot(x, z) <= R) flatPts.push([x, z])
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2
    const x = Math.cos(a) * R
    const z = Math.sin(a) * R
    if (inBox(x, z)) flatPts.push([x, z])
  }
  for (const x of [x0, x1]) if (Math.abs(x) < R) for (const z of [Math.sqrt(R * R - x * x), -Math.sqrt(R * R - x * x)]) if (inBox(x, z)) flatPts.push([x, z])
  for (const z of [z0, z1]) if (Math.abs(z) < R) for (const x of [Math.sqrt(R * R - z * z), -Math.sqrt(R * R - z * z)]) if (inBox(x, z)) flatPts.push([x, z])
  return new Float32Array(flatPts.flatMap(([x, z]) => [x, LID_BOTTOM, z, x, P.h / 2, z]))
}

/** the puck's colliders: floor, walls, the lid in pieces (the pieces over the openings come and go) */
function PuckColliders({ plugs }: { plugs: { current: Record<Door | 'notch', RapierCollider | null> } }) {
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
      one: lidPiece(-o.w / 2, o.w / 2, o.z0, P.r + 1, P.r), // (out over the wall too: the notch's)
      many: lidPiece(-R, R, -R, -m.z0),
    }
  }, [])
  const walls = useMemo(() => {
    const n = 44
    const r = CAVITY.r + P.wall / 2
    const seg = ((2 * Math.PI * r) / n) * 1.1
    const y0 = -P.h / 2 + 0.4
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      // under the "one" tab the wall stops short of the lid: the notch a flat mint slides out of
      const low = Math.sin(a) > 0 && Math.abs(Math.cos(a) * r) < MINTS.one.hole.w / 2
      const y1 = low ? NOTCH.y : P.h / 2 - 0.4
      return { key: i, position: [Math.cos(a) * r, (y0 + y1) / 2, Math.sin(a) * r] as [number, number, number], rotation: [0, -a, 0] as [number, number, number], args: [P.wall / 2, (y1 - y0) / 2, seg / 2] as [number, number, number] }
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
      <CuboidCollider
        ref={(r) => void (plugs.current.notch = r)}
        args={[MINTS.one.hole.w / 2, (P.h / 2 - NOTCH.y) / 2, P.wall / 2]}
        position={[0, (P.h / 2 + NOTCH.y) / 2, CAVITY.r + P.wall / 2]}
        mass={mass * 0.01}
        friction={0.5}
        collisionGroups={ITEM}
      />
    </>
  )
}

/** a mint leaving from here (the puck's frame) went out through an open tab's opening */
function openingAt(doors: Record<Door, DoorState>, p: Vector3) {
  if (p.y < CAVITY.y1 - M.d) return false // (out by the lid only)
  const one = MINTS.one.hole
  if (doors.one.v > 0.4 && Math.abs(p.x) < one.w / 2 + 2 && p.z > one.z0 - 3) return true
  if (doors.many.v > 0.4 && p.z < -(MINTS.many.hole.z0 - 3)) return true
  return false
}
type Mint = { body: RapierRigidBody; fly: { fl: Flight; pose: Pose; delay: number } | null; inside: Vector3 | null } // inside: where it last was in the puck (its frame), while it's in
const TIDY_GAP = 0.09 // s between one mint's flight home and the next
const TIDY_PASSES = 3 // tries for any that end up out again

export function LiveMints({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const doors = useRef<Record<Door, DoorState>>({ one: { open: false, v: 0 }, many: { open: false, v: 0 } })
  const plugs = useRef<Record<Door | 'notch', RapierCollider | null>>({ one: null, many: null, notch: null })
  const mints = useRef<Mint[]>([])
  const mintHandles = useMemo(() => new Set<number>(), []) // (the mints ride inside it: not what it rests on)
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
      const shut = s.v < 0.25
      for (const plug of d === 'one' ? [plugs.current.one, plugs.current.notch] : [plugs.current.many])
        if (plug && (plug.collisionGroups() === ITEM) !== shut) plug.setCollisionGroups(shut ? ITEM : LOOSE)
    }
  })

  // ---- the mints: made once the puck is home, in their layers inside it
  const puckPose = () => {
    const b = perch.body.current
    return b ? poseOf(b) : null
  }
  const toPuck = (p: Vector3, pose: Pose) => _v.copy(p).sub(pose.p).applyQuaternion(_q.copy(pose.q).invert())
  const throughOpening = (p: Vector3) => openingAt(doors.current, p)
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
            .setCcdEnabled(true), // (small, and the puck swings round fast when it's turned: soft CCD let them through its 1.6 mm lid)
        )
        world.createCollider(
          rapier.ColliderDesc.roundCylinder(M.t / 2 - M.bevel, M.d / 2 - M.bevel, M.bevel).setMass(M.mass).setFriction(0.45).setRestitution(0.05).setCollisionGroups(ITEM),
          body,
        )
        body.sleep()
        mintHandles.add(body.handle)
        return { body, fly: null, inside: s.clone() }
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
          m.inside = null // (it'll count as in once it's there)
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
        return
      }
      // out only through an open tab: if it left the cavity any other way (squeezed through the lid
      // or a wall as the puck swung round), it's put straight back where it last was inside
      const local = toPuck(m.body.translation() as Vector3, pose)
      if (inCavity(local, 0)) {
        m.inside = local.clone()
        return
      }
      const was = m.inside
      if (!was) return // (already out: loose)
      if (throughOpening(was)) {
        m.inside = null
        return
      }
      const back = was.clone().applyQuaternion(pose.q).add(pose.p)
      m.body.setTranslation(back, true)
      const bv = b.linvel()
      m.body.setLinvel(bv, true) // (moving with the puck)
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
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} sound="hard" hold={{ lift: 30, ...perch.hold, ignore: (c) => mintHandles.has(c.parent()?.handle ?? -1) }}>
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
