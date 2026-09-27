import { useEffect, useMemo, useRef } from 'react'
import { invalidate, useFrame, type ThreeEvent } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, CylinderCollider, useBeforePhysicsStep, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { Box3, CatmullRomCurve3, ExtrudeGeometry, InstancedMesh, LatheGeometry, Matrix4, MeshStandardMaterial, Path, Quaternion, SRGBColorSpace, Shape, ShapeGeometry, TextureLoader, Vector2, Vector3, type BufferGeometry, type Group } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { grabbable } from '../../lib/physics/Hand'
import { GROUP, groups } from '../../lib/physics/rope'
import { Flight, planRoute } from '../../lib/physics/route'
import { poseOf, usePerch, type Pose } from '../../lib/physics/usePerch'
import { stepAlpha } from '../../lib/physics/World'
import { Prompts, useItemHover, withHover, type PromptItem } from '../prompt/Prompts'
import { BAND_Y, CAVITY, HOLE_R, LABEL_R, LABEL_Y, MINTS, TAB_TOP, inCavity, mintSpots } from './spec'
import { speckTexture } from './label'

/**
 * Rina's Ice Breakers spearmint mints (./spec): the green cup with its white rim, the maker's own lid
 * and base printed on it (their product shots, laid on flat), two flip tabs, and the 53 mints in it.
 *
 *   the puck      an object like any other: carried, turned, put down anywhere (the shared hand).
 *                 "Return Ice Breakers" once it's well away from its spot or knocked over
 *   the tabs      click one to flip it open (or shut): "one" over a slot a mint slips out of on its
 *                 edge, one at a time; "many" lifts a big slice of the lid off a wide opening
 *   the mints     while both tabs are shut they're packed: they ride in the puck as they lie, no
 *                 physics, so nothing jostles or slips through. Open a tab and they come alive where
 *                 they lie: tip the puck and they pour, pick one up. Shut it again and those inside
 *                 settle back into the pack. Spilled ones: "Tidy mints" flies them back in through the
 *                 "many" opening to free spots inside (flying, they touch nothing)
 */
const C = MINTS.color
const P = MINTS.puck
const M = MINTS.mint
const ITEM = groups(GROUP.item, 0xffff)
const LOOSE = groups(GROUP.item, 0) // (touches nothing)
const LID_BOTTOM = CAVITY.y1
const PRINT = 0.4 // the printed layer over the deck
const TAB_T = 0.9
const RING_R = CAVITY.r + 0.8 // the lid's colliders reach out over the wall to here
const _v = new Vector3()
const _v2 = new Vector3()
const _q = new Quaternion()
const _q2 = new Quaternion()
const _m = new Matrix4()
const _m2 = new Matrix4()
const ONE = new Vector3(1, 1, 1)

type Door = 'one' | 'many'
/** a puck turned to q: how far its lowest point (a rim edge, or a face) is below its middle, for the
 *  hand turning it (it stands on its edge, not hovering over where a box's corner would be) */
const puckLowest = (q: Quaternion) => {
  const up = _v2.set(0, 1, 0).applyQuaternion(q).y
  return P.r * Math.sqrt(Math.max(0, 1 - up * up)) + (P.h / 2) * Math.abs(up)
}
type DoorState = { open: boolean; v: number }
/** each divot in the rim's inner edge: its half width and which side (+1 "one", -1 "many") */
const DIVOTS = [
  { half: MINTS.one.tab.w / 2 + 0.3, side: 1, depth: MINTS.one.divot },
  { half: MINTS.many.tab.w / 2 + 0.3, side: -1, depth: MINTS.many.divot },
] as const

/** points round a rounded corner (for the puck's profiles) */
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
function capPoints(half: number, z0: number, R: number, rc: number, side: 1 | -1) {
  const edge = Math.sqrt(Math.max(0, R * R - half * half))
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
  const q = pts.map(([x, y]) => [x, side * y] as [number, number])
  if (side < 0) q.reverse()
  return q
}
const toShape = (pts: [number, number][], into: Shape | Path = new Shape()) => {
  into.moveTo(...pts[0])
  for (const p of pts.slice(1)) into.lineTo(...p)
  into.closePath()
  return into
}
const capShape = (half: number, z0: number, R: number, rc: number, side: 1 | -1) => toShape(capPoints(half, z0, R, rc, side)) as Shape
const chord = (R: number, z0: number) => Math.sqrt(R * R - z0 * z0)
/** the rim's inner edge, round from +x (angle t toward +z): pushed out at the divots */
const rimIn = (t: number) => {
  const x = Math.cos(t) * LABEL_R
  const z = Math.sin(t) * LABEL_R
  for (const d of DIVOTS) if (Math.sign(z) === d.side && Math.abs(x) < d.half) return LABEL_R + d.depth
  return LABEL_R
}
/** the white rim over the lid: a ring from its inner edge (with the divots) out to the puck's edge */
function rimShape() {
  const s = new Shape().absarc(0, 0, P.r, 0, Math.PI * 2, false)
  const hole: [number, number][] = []
  const n = 360
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2
    const r = rimIn(t)
    hole.push([Math.cos(t) * r, Math.sin(t) * r])
  }
  s.holes.push(toShape(hole, new Path()) as Path)
  return s
}
/** a flat part: a shape `thick` thick, its top at `top`, lying level (shape y = the puck's z); the
 *  shape's UVs are its coordinates in mm (the photos are laid on by them) */
function flat(shape: Shape, thick: number, top: number, bevel = 0) {
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(0.01, thick - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 64,
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
  const t = new TextureLoader().load(ph.src, () => invalidate()) // (pages drawn on demand redraw once it's in)
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
      green: new MeshStandardMaterial({ color: C.body, roughness: 0.5 }),
      baseprint: new MeshStandardMaterial({ color: '#ffffff', map: photo('bottom'), roughness: 0.6 }),
      printed: [lid, white, white],
    }
  }, [])
  const geo = useMemo(() => {
    const e = P.edge
    const seam = 0.35 // the little groove where the white band sits on the green cup
    // the green cup: its rounded bottom edge, up the side to the band, and its inside
    const cup = new LatheGeometry(
      [new Vector2(0, -P.h / 2), ...corner(P.r - e, -P.h / 2 + e, e, -Math.PI / 2, 0, 5), new Vector2(P.r, BAND_Y - seam), new Vector2(P.r - seam, BAND_Y), new Vector2(CAVITY.r, BAND_Y), new Vector2(CAVITY.r, CAVITY.y0), new Vector2(0, CAVITY.y0)],
      128,
    )
    const baseDisc = new ShapeGeometry(new Shape().absarc(0, 0, P.r - e, 0, Math.PI * 2, false), 96)
    baseDisc.rotateX(Math.PI / 2) // facing down, shape y -> the puck's z
    baseDisc.translate(0, -P.h / 2 - 0.03, 0)
    // the white band up the side, under the rim
    const band = new LatheGeometry([new Vector2(CAVITY.r, BAND_Y + 0.01), new Vector2(P.r - seam, BAND_Y + 0.01), new Vector2(P.r, BAND_Y + seam), new Vector2(P.r, LID_BOTTOM + 0.5), new Vector2(CAVITY.r, LID_BOTTOM + 0.5), new Vector2(CAVITY.r, BAND_Y + 0.01)], 128)
    // the rim over the lid, its edges softly rounded, the divots in its inner edge
    const rim = flat(rimShape(), P.h / 2 - LID_BOTTOM, P.h / 2, Math.min(P.round, (P.h / 2 - LID_BOTTOM) / 2 - 0.05))
    // the deck under the print, both openings through it
    const deckShape = new Shape().absarc(0, 0, LABEL_R + 0.2, 0, Math.PI * 2, false)
    const oneSlot = () => toShape(capPoints(MINTS.one.hole.w / 2, MINTS.one.hole.z0, HOLE_R, 2.5, 1), new Path()) as Path
    deckShape.holes.push(oneSlot(), toShape(capPoints(chord(HOLE_R, MINTS.many.hole.z0) - 0.01, MINTS.many.hole.z0, HOLE_R, 0, -1), new Path()) as Path)
    const deck = flat(deckShape, P.lid - PRINT, LABEL_Y - PRINT)
    // the printed lid: all but the flap (the "one" slot through it), and the flap
    const fz = MINTS.many.flap.z0
    const mainShape = capShape(chord(LABEL_R, fz) - 0.01, -fz, LABEL_R, 0, 1)
    mainShape.holes.push(oneSlot())
    const label = printedTop(flat(mainShape, PRINT, LABEL_Y))
    const flap = printedTop(flat(capShape(chord(LABEL_R, fz) - 0.01, fz, LABEL_R, 0, -1), PRINT, LABEL_Y))
    flap.translate(0, -LABEL_Y, fz) // (its hinge line at the origin)
    // the tabs, where they lie (reaching into their divots), then shifted to their hinges
    const tab = (d: Door) => printedTop(flat(capShape(MINTS[d].tab.w / 2, MINTS[d].tab.z0, LABEL_R + MINTS[d].divot - 0.3, 3, d === 'one' ? 1 : -1), TAB_T, TAB_TOP, 0.3))
    const one = tab('one').translate(0, -LABEL_Y, -MINTS.one.tab.z0)
    const many = tab('many').translate(0, -LABEL_Y, fz)
    return { cup, baseDisc, band, rim, deck, label, flap, one, many }
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
      <mesh geometry={geo.cup} material={mat.green} castShadow receiveShadow />
      <mesh geometry={geo.baseDisc} material={mat.baseprint} />
      <mesh geometry={geo.band} material={mat.white} castShadow receiveShadow />
      <mesh geometry={geo.rim} material={mat.white} castShadow receiveShadow />
      <mesh geometry={geo.deck} material={mat.inside} receiveShadow />
      <mesh geometry={geo.label} material={mat.printed} receiveShadow />
      {/* "one": the small tab over its slot, hinged on its inner edge, its tip in the rim's divot */}
      <group ref={(r) => void (doorsAt.current.one = r)} position={[0, LABEL_Y, MINTS.one.tab.z0]} onClick={click('one')}>
        <mesh geometry={geo.one} material={mat.printed} castShadow receiveShadow />
      </group>
      {/* "many": a big slice of the lid, hinged near the middle, its tab tucked in the other divot */}
      <group ref={(r) => void (doorsAt.current.many = r)} position={[0, LABEL_Y, -MINTS.many.flap.z0]} onClick={click('many')}>
        <mesh geometry={geo.flap} material={mat.printed} castShadow receiveShadow />
        <mesh geometry={geo.many} material={mat.printed} castShadow receiveShadow />
      </group>
    </group>
  )
}

/** a hull: a region in x, z (points) from y0 to y1 */
const slab = (pts: [number, number][], y0: number, y1: number) => new Float32Array(pts.flatMap(([x, z]) => [x, y0, z, x, y1, z]))
/** the points of a box in x, z clipped to a disc of radius R */
function boxInDisc(x0: number, x1: number, z0: number, z1: number, R: number) {
  const out: [number, number][] = []
  const inBox = (x: number, z: number) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ])
    if (Math.hypot(x, z) <= R) out.push([x, z])
  for (let k = 0; k < 128; k++) {
    const a = (k / 128) * Math.PI * 2
    if (inBox(Math.cos(a) * R, Math.sin(a) * R)) out.push([Math.cos(a) * R, Math.sin(a) * R])
  }
  for (const x of [x0, x1]) if (Math.abs(x) < R) for (const z of [Math.sqrt(R * R - x * x), -Math.sqrt(R * R - x * x)]) if (inBox(x, z)) out.push([x, z])
  for (const z of [z0, z1]) if (Math.abs(z) < R) for (const x of [Math.sqrt(R * R - z * z), -Math.sqrt(R * R - z * z)]) if (inBox(x, z)) out.push([x, z])
  return out
}

/**
 * The puck's colliders: floor, walls, the lid at the label (the pieces over the openings come and go)
 * and the rim round it, up to its top, in short arcs (thinner at the divots).
 */
function PuckColliders({ plugs }: { plugs: { current: Record<Door, RapierCollider | null> } }) {
  const pieces = useMemo(() => {
    const o = MINTS.one.hole
    const m = MINTS.many.hole
    const R = LABEL_R + 0.1
    const Rd = LABEL_R + MINTS.one.divot
    const label = [
      boxInDisc(-R, R, -m.z0, o.z0, R), // the middle
      boxInDisc(-R, -o.w / 2, o.z0, R, R), // either side of "one"
      boxInDisc(o.w / 2, R, o.z0, R, R),
    ].map((p) => slab(p, LID_BOTTOM, P.h / 2)) // (up to the rim's top: thicker than the lid itself, nothing slips through)
    const one = slab(boxInDisc(-o.w / 2, o.w / 2, o.z0, Rd, Rd), LID_BOTTOM, P.h / 2)
    const manyPts = boxInDisc(-R, R, -R, -m.z0, R)
    const dm = DIVOTS[1]
    manyPts.push([-dm.half, -(LABEL_R + dm.depth)], [dm.half, -(LABEL_R + dm.depth)])
    const many = slab(manyPts, LID_BOTTOM, P.h / 2)
    // the rim: arcs of the ring from its inner edge out over the wall, rim-high
    const ring: Float32Array[] = []
    const n = 36
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2
      const a1 = ((k + 1) / n) * Math.PI * 2
      const pts: [number, number][] = []
      for (let j = 0; j <= 3; j++) {
        const t = a0 + ((a1 - a0) * j) / 3
        const ri = rimIn(t)
        pts.push([Math.cos(t) * ri, Math.sin(t) * ri], [Math.cos(t) * RING_R, Math.sin(t) * RING_R])
      }
      ring.push(slab(pts, LID_BOTTOM, P.h / 2))
    }
    return { label, one, many, ring }
  }, [])
  const walls = useMemo(() => {
    const n = 72 // (fine enough that on its edge it rolls round, not over flats)
    const thick = P.wall // (exactly the wall: any thicker and it knocks into things before it touches them, and rocks on the flats' corners)
    const r = CAVITY.r + thick / 2
    const seg = ((2 * Math.PI * r) / n) * 1.1
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return { key: i, position: [Math.cos(a) * r, 0, Math.sin(a) * r] as [number, number, number], rotation: [0, -a, 0] as [number, number, number], args: [thick / 2, P.h / 2 - 0.4, seg / 2] as [number, number, number] }
    })
  }, [])
  const mass = MINTS.mass
  return (
    <>
      <CylinderCollider args={[P.floor / 2, P.r - 0.6]} position={[0, -P.h / 2 + P.floor / 2, 0]} mass={mass * 0.35} friction={0.7} collisionGroups={ITEM} />
      {walls.map(({ key, ...w }) => (
        <CuboidCollider key={key} {...w} mass={(mass * 0.35) / walls.length} friction={0.5} collisionGroups={ITEM} />
      ))}
      {[...pieces.label, ...pieces.ring].map((pts, i) => (
        <ConvexHullCollider key={i} args={[pts]} mass={(mass * 0.25) / (pieces.label.length + pieces.ring.length)} friction={0.6} collisionGroups={ITEM} />
      ))}
      {(['one', 'many'] as const).map((d) => (
        <ConvexHullCollider key={d} ref={(r) => void (plugs.current[d] = r)} args={[pieces[d]]} mass={mass * 0.025} friction={0.6} collisionGroups={ITEM} />
      ))}
    </>
  )
}

/** a mint leaving from here (the puck's frame) went out through an open tab's opening */
function openingAt(doors: Record<Door, DoorState>, p: Vector3) {
  if (p.y < CAVITY.y1 - M.d / 2 - 1) return false // (out by the lid only)
  const one = MINTS.one.hole
  const reach = M.d / 2 + 1 // (its middle can be this far from the opening while its edge goes through)
  if (doors.one.v > 0.3 && Math.abs(p.x) < one.w / 2 + reach && p.z > one.z0 - reach) return true
  if (doors.many.v > 0.3 && p.z < -MINTS.many.hole.z0 + reach) return true
  return false
}
/**
 * One mint. `packed`: riding in the shut puck as it lay (its pose in the puck's frame), its body put
 * aside (kinematic, touching nothing); otherwise live. `inside`: where a live one last was in the puck.
 */
type Mint = { body: RapierRigidBody; packed: { p: Vector3; q: Quaternion; tucked?: boolean } | null; fly: { fl: Flight; pose: Pose; delay: number } | null; inside: Vector3 | null; prev: Pose } // prev: its pose before the last step (drawn blended toward now)
const TIDY_GAP = 0.09 // s between one mint's flight home and the next
const RATTLE = 450 // mm/s: the fastest a mint moves inside the puck, relative to it
const TIDY_PASSES = 3 // tries for any that end up out again

export function LiveMints({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const doors = useRef<Record<Door, DoorState>>({ one: { open: false, v: 0 }, many: { open: false, v: 0 } })
  const plugs = useRef<Record<Door, RapierCollider | null>>({ one: null, many: null })
  const mints = useRef<Mint[]>([])
  const mintHandles = useMemo(() => new Set<number>(), []) // (the mints ride inside it: not what it rests on)
  const tidy = useRef<{ t: number; reopen: boolean; pass: number; since: number } | null>(null)
  const snapBacks = useRef(0) // (how often the out-only-through-a-tab rule has had to act: for checking)
  const drawn = useRef<Group>(null) // the puck as drawn (its pose blended between physics steps)
  const perch = usePerch({
    key: 'mints-tin',
    label: 'Return Ice Breakers',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0), // it settles straight down onto its spot
    distance: 50,
    snap: 0, // (put down anywhere, it stays: it's just a thing on the desk)
    away: 150,
    lift: 40,
    onFly: () => {
      doors.current.one.open = false // (shut, so nothing spills on the way)
      doors.current.many.open = false
    },
  })
  const { world, rapier } = perch
  const mintHover = useItemHover()

  const toggle = (d: Door) => {
    const s = doors.current[d]
    s.open = !s.open
  }

  // the tabs swing; the lid's piece over an opening is there only while its tab is (nearly) shut (it
  // stops colliding with anything: a disabled collider stayed solid here, as the charger's blades found)
  useFrame((_, dt) => {
    for (const d of ['one', 'many'] as const) {
      const s = doors.current[d]
      s.v += ((s.open ? 1 : 0) - s.v) * (1 - Math.exp(-Math.min(dt, 0.05) * (s.open ? 12 : 16)))
      if (!s.open && s.v < 0.005) s.v = 0
      const plug = plugs.current[d]
      const shut = s.v < 0.25
      if (plug && (plug.collisionGroups() === ITEM) !== shut) plug.setCollisionGroups(shut ? ITEM : LOOSE)
    }
  })

  const puckPose = () => {
    const b = perch.body.current
    return b ? poseOf(b) : null
  }
  const toPuck = (p: Vector3, pose: Pose) => _v.copy(p).sub(pose.p).applyQuaternion(_q.copy(pose.q).invert())
  const throughOpening = (p: Vector3) => openingAt(doors.current, p)
  /** a packed mint to life, where it lies in the puck, moving with it */
  const unpack = (m: Mint, pose: Pose, b: RapierRigidBody) => {
    const pk = m.packed!
    if (pk.tucked) {
      // (a tucked one comes back in a free spot, not on top of whatever moved where it was)
      const spot = freeSpots(pose, 1)[0]
      if (spot) {
        pk.p.copy(spot)
        pk.q.identity()
      }
    }
    const p = pk.p.clone().applyQuaternion(pose.q).add(pose.p)
    const q = pose.q.clone().multiply(pk.q)
    m.body.setTranslation(p, false)
    m.body.setRotation(q, false)
    m.prev = { p: p.clone(), q: q.clone() }
    m.body.setBodyType(rapier.RigidBodyType.Dynamic, true)
    m.body.collider(0).setCollisionGroups(ITEM)
    const v = b.linvel()
    const w = b.angvel()
    const r = _v2.copy(p).sub(pose.p)
    m.body.setLinvel({ x: v.x + w.y * r.z - w.z * r.y, y: v.y + w.z * r.x - w.x * r.z, z: v.z + w.x * r.y - w.y * r.x }, true)
    m.inside = pk.p.clone()
    m.packed = null
  }
  /** a live mint inside the shut puck into the pack, as it lies */
  const pack = (m: Mint, pose: Pose) => {
    const r = m.body.rotation()
    m.packed = { p: toPuck(m.body.translation() as Vector3, pose).clone(), q: pose.q.clone().invert().multiply(_q2.set(r.x, r.y, r.z, r.w)) }
    m.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
    m.body.collider(0).setCollisionGroups(LOOSE)
    m.inside = null
  }

  useBeforePhysicsStep(() => {
    const b = perch.body.current
    if (!b) return
    const pose = poseOf(b)
    // made once, packed in their layers
    if (!mints.current.length) {
      if (!perch.st.current.perched) return
      mints.current = mintSpots().map((s, i) => {
        const lq = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), i * 2.4)
        const p = s.clone().applyQuaternion(pose.q).add(pose.p)
        const q = pose.q.clone().multiply(lq)
        const body = world.createRigidBody(
          rapier.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(p.x, p.y, p.z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
            .setLinearDamping(1.2) // (they settle rather than ricochet round the puck)
            .setAngularDamping(2.2) // (so a mint landing on its edge doesn't roll away across the desk like a coin)
            .setCcdEnabled(true), // (small, and the puck can swing round fast)
        )
        world.createCollider(rapier.ColliderDesc.roundCylinder(M.t / 2 - M.bevel, M.d / 2 - M.bevel, M.bevel).setMass(M.mass).setFriction(0.45).setRestitution(0.05).setCollisionGroups(LOOSE), body)
        mintHandles.add(body.handle)
        return { body, packed: { p: s.clone(), q: lq }, fly: null, inside: null, prev: { p, q } }
      })
      return
    }
    // where each is before this step (to draw it blended between this step and the next)
    for (const m of mints.current) {
      const t = m.body.translation()
      const r = m.body.rotation()
      m.prev.p.set(t.x, t.y, t.z)
      m.prev.q.set(r.x, r.y, r.z, r.w)
    }
    // a tab opening: they all come alive where they lie; both shut again: those inside are packed
    const d = doors.current
    const open = d.one.open || d.many.open || d.one.v > 0 || d.many.v > 0
    // (the puck's still: a tucked mint can come back to life)
    const bv0 = b.linvel()
    const bw0 = b.angvel()
    const calm = !perch.st.current.held && Math.hypot(bv0.x, bv0.y, bv0.z) < 20 && Math.hypot(bw0.x, bw0.y, bw0.z) < 0.4
    for (const m of mints.current) {
      if (m.fly) continue
      if (m.packed && !open) m.packed.tucked = false // (shut: just packed)
      if (m.packed && open && (!m.packed.tucked || calm)) unpack(m, pose, b)
      else if (!m.packed && !open && !tidy.current && inCavity(toPuck(m.body.translation() as Vector3, pose), 0)) pack(m, pose)
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
          if (m.packed) return true
          const v = m.body.linvel()
          return Math.hypot(v.x, v.y, v.z) < 40
        })
        if ((calm && td.since > 0.5) || td.since > 2.5) {
          tidy.current = null
          if (loose().length && td.pass < TIDY_PASSES) startTidy(td.pass + 1, td.reopen)
          else if (!td.reopen) d.many.open = false
        }
      }
    }
    // live ones: nothing flies off like a bullet; lost out of the world, it's back in the pack; and
    // out only through an open tab (squeezed through the lid or a wall as the puck swung round, it's
    // put straight back where it last was inside)
    mints.current.forEach((m, i) => {
      if (m.fly || m.packed) return
      const v = m.body.linvel()
      const sp = Math.hypot(v.x, v.y, v.z)
      if (sp > 2500) m.body.setLinvel({ x: (v.x / sp) * 2500, y: (v.y / sp) * 2500, z: (v.z / sp) * 2500 }, true)
      // inside, no faster than a gentle rattle relative to the puck (a bump shouldn't fire them out)
      if (m.inside) {
        // and falling as it falls: let go, it floats down (the hand lightens its gravity, adds drag); the
        // mints in it do too, or they'd drag it down
        if (m.body.gravityScale() !== b.gravityScale()) m.body.setGravityScale(b.gravityScale(), false)
        const drag = Math.max(1.2, b.linearDamping())
        if (m.body.linearDamping() !== drag) m.body.setLinearDamping(drag)
        const bv = b.linvel()
        const rx = v.x - bv.x
        const ry = v.y - bv.y
        const rz = v.z - bv.z
        const rs = Math.hypot(rx, ry, rz)
        if (rs > RATTLE) m.body.setLinvel({ x: bv.x + (rx / rs) * RATTLE, y: bv.y + (ry / rs) * RATTLE, z: bv.z + (rz / rs) * RATTLE }, true)
      }
      if (m.body.translation().y < -1500) {
        const s = mintSpots()[i % 19].clone()
        s.y = CAVITY.y1 - M.t
        m.packed = { p: s, q: new Quaternion() }
        m.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
        m.body.collider(0).setCollisionGroups(LOOSE)
        if (open) unpack(m, pose, b)
        return
      }
      const local = toPuck(m.body.translation() as Vector3, pose)
      if (inCavity(local, 0)) {
        m.inside = local.clone()
        return
      }
      const was = m.inside
      if (!was) {
        // out: its own weight again
        if (m.body.gravityScale() !== 1) m.body.setGravityScale(1, true)
        if (m.body.linearDamping() !== 1.2) m.body.setLinearDamping(1.2)
        return
      }
      if (throughOpening(was) || throughOpening(local)) {
        m.inside = null
        return
      }
      // out some wrong way: tucked back into the pack where it last was inside (drawn there, touching
      // nothing: never teleported onto the others, whose shove would launch the puck), till it's still
      snapBacks.current++
      const r = m.body.rotation()
      m.packed = { p: was.clone(), q: pose.q.clone().invert().multiply(_q2.set(r.x, r.y, r.z, r.w)), tucked: true }
      m.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
      m.body.collider(0).setCollisionGroups(LOOSE)
      m.inside = null
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
    return mints.current.filter((m) => !m.packed && !inCavity(toPuck(m.body.translation() as Vector3, pose)))
  }
  /** where a mint is, in the puck's frame */
  const inPuck = (m: Mint, pose: Pose) => (m.packed ? m.packed.p.clone() : toPuck(m.body.translation() as Vector3, pose).clone())
  /** free spots inside, lying flat, from the top down: where no mint (or spot already given) is near */
  const freeSpots = (pose: Pose, n: number) => {
    const taken = mints.current.filter((m) => !m.fly).map((m) => inPuck(m, pose))
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
  const upright = (pose: Pose) => _v.set(0, 1, 0).applyQuaternion(pose.q).y > 0.9
  const startTidy = (pass = 1, reopenIn?: boolean) => {
    const pose = puckPose()
    if (!pose || tidy.current || !upright(pose)) return // (in through the top: it has to be the right way up)
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

  // ---- drawing the mints: one instanced mesh; packed ones with the puck as drawn, live ones from their bodies
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
    const g = drawn.current
    g?.updateWorldMatrix(true, false)
    inst.count = list.length
    const alpha = Math.min(1, Math.max(0, stepAlpha()))
    list.forEach((m, i) => {
      if (m.packed && g) {
        inst.setMatrixAt(i, _m.multiplyMatrices(g.matrixWorld, _m2.compose(m.packed.p, m.packed.q, ONE)))
        return
      }
      // blended between its pose before the last step and now, as the puck is drawn
      const t = m.body.translation()
      const r = m.body.rotation()
      _v.set(t.x, t.y, t.z)
      _q.set(r.x, r.y, r.z, r.w)
      _v.lerpVectors(m.prev.p, _v, alpha)
      _q2.copy(m.prev.q).slerp(_q, alpha)
      inst.setMatrixAt(i, _m.compose(_v, _q2, ONE))
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
            if (m.packed || m.fly) continue // (packed: shut in; open a tab first)
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
      const b = perch.body.current
      const pose = puckPose()
      if (tidy.current || !b || !pose || perch.st.current.held || perch.fly.current || !upright(pose)) return false
      const bv = b.linvel()
      if (Math.hypot(bv.x, bv.y, bv.z) > 15) return false
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

  if (import.meta.env.DEV) Object.assign(window, { __mints: { ...perch, doors, mints, loose, startTidy, toggle, snapBacks } }) // for inspecting from the console

  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} sound="hard" hold={{ lift: 30, ...perch.hold, ignore: (c) => mintHandles.has(c.parent()?.handle ?? -1), lowest: puckLowest }}>
        <group ref={drawn} {...perch.hover.bind}>
          <PuckModel doors={doors} onTab={toggle} />
        </group>
        <PuckColliders plugs={plugs} />
      </Holdable>
      <primitive object={inst} {...withHover(mintGrab, mintHover)} />
      <Prompts items={[perch.prompt]} />
      {/* (its own, so it can show while the puck is away too) */}
      <Prompts items={[tidyItem]} />
    </>
  )
}
