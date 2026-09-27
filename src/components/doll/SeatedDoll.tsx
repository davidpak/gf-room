import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { stepSpring, type Spring } from '../../lib/spring'
import { Doll, type DollRig } from './Doll'
import { DOLL } from './spec'

/**
 * David's crochet doll sitting like a plush toy, for Rina's desk, leaning back against the lamp:
 * legs straight out in front, bottom on the desk, leaning back a little as if propped against
 * something, arms hanging at his sides with the hands resting on the desk just ahead of him, head
 * tipped a touch to one side.
 *
 * Nothing is remodelled: it is the standing doll (./Doll.tsx) with its joints turned. The rig has
 * no knees, so each leg folds forward whole at its hip joint.
 *
 * Frame: origin on the desk top (y = 0) right under his bottom (midway between the hip joints),
 * facing +Z like the standing doll (his face is at +Z, his left hand at +X). Millimetres.
 * SEATED.backZ is where the back of his hood ends, for standing him against the lamp pole.
 *
 * Life: very slow breathing and, every so often, a tiny extra tilt of the head. No big toy
 * gestures (those are ./useToyIdle, for standing around).
 */

const LEAN = 0.12 // radians back from upright, as if propped against the pole
const SPLAY = 0.07 // radians each leg turns out from straight ahead
const ARM_IN = 0.05 // radians the arms hang closer to his sides than when standing (DOLL.arm.spread)
const HEAD_ROLL = 0.1 // radians the head tips over toward his right shoulder
const HEAD_CLEAR = 0.5 // mm the back of the beanie stays in front of the back of the hood
const BREATH = { period: 4.2, wide: 0.01, tall: 0.005 } // seconds; how much the chest draws in breathing out
const TILT = { more: 0.07, less: 0.08, k: 28, c: 6.5 } // the occasional extra head tilt, and its spring

// modelled in Doll.tsx rather than in the spec, mirrored here
const STRIPE = 0.3 // the sneaker's white stripe stands this proud of the shoe
const HOOD_TILT = 0.18 // the hood lies tipped this much on the upper back
const CUFF_CORNER = 2.5 // the beanie cuff's rounded edge

const R = DOLL.rig
const A = DOLL.arm

/**
 * Legs. Each folds forward at its hip joint (a negative rotation.x swings the foot toward +Z,
 * the same sign PlayerDoll strides with), turned out by SPLAY (rotation.z, applied before the
 * fold, so the leg swings out sideways and the toes still point straight up), and lifted a hair
 * past level so it lies on two points like a stiff plush leg on a table:
 *
 *   the pants' top rim   18 mm radius, 4 mm above the hip joint (tucked up inside the hoodie).
 *                        Folded forward, the back of the pants becomes the underside
 *   the heel             the sneaker's widest ring (17.2 mm at 9 mm up, plus the 0.3 mm white
 *                        stripe) is stretched 1.8x toe to heel about a centre 8 mm in front of
 *                        the leg's axis, so the back of the heel is 17.5 x 1.8 - 8 = 23.5 mm
 *                        behind the axis, 123 mm down the leg
 *
 * The chunky shoe is fatter than the pants, so a leg held dead level would balance on its heel
 * with the pants floating. Raising the feet by atan(5.5 / 127) = 0.043 rad puts both on the desk,
 * the hip joints 18.2 mm up (the rim's radius, plus a hair for the lift).
 */
const [rimR, rimY] = DOLL.legs.profile[DOLL.legs.profile.length - 2] // (the last point closes the cap)
const [wideR, wideY] = DOLL.shoe.profile.reduce((a, b) => (b[0] > a[0] ? b : a))
const heelBack = (wideR + STRIPE) * DOLL.shoe.stretch - DOLL.shoe.z
const heelDown = R.hipY - wideY
const rimUp = rimY - R.hipY
const LIFT = Math.atan2(heelBack - rimR, (heelDown + rimUp) * Math.cos(SPLAY))
const HIP_H = rimR * Math.cos(LIFT) + rimUp * Math.cos(SPLAY) * Math.sin(LIFT)

/**
 * Bottom. The hoodie's hem is its bottom ring (39 mm radius at 128, 4 mm below the waist joint,
 * 0.8 as deep as wide). With the waist joint up at hip height it would hover over the desk, so
 * the torso settles down into its seat, the way stuffing does, until the lowest point of the hem
 * touches the desk. Leaning back tips the hem about the waist joint, so that point is its back
 * edge:  4 cos(lean) + 39 x 0.8 x sin(lean) = 7.7 mm below the waist joint (lean 0.12).
 * The waist joint ends up 7.7 mm above the desk, about 10 mm below the hips: the legs come out
 * from under the front of the hoodie with the seat of the pants just showing beneath the hem.
 * (The lathe's even row spacing rounds the hem's corner off a touch, so the real mesh sits about
 * 0.2 mm up; the heels, pants seat and hands all land within 0.15 mm of the desk.)
 */
const [hemR, hemY] = DOLL.torso.profile[1]

/**
 * Arms. They hang from the shoulders and rest the rounded ends of the hands on the desk. The
 * hand's end is [distance below the shoulder joint, radius], as Arm in Doll.tsx builds it.
 * With the arm `phi` from straight down, each ring of the hand reaches t cos(phi) + r sin(phi)
 * below the shoulder, so the arm swings forward until its reach equals the shoulder's height.
 */
const cuffY = A.sleeve[0][1]
const HAND_END: [number, number][] = [
  [-(cuffY - A.hand.len - 2), 0],
  [-(cuffY - A.hand.len - 1), A.hand.r * 0.7],
  [-(cuffY - A.hand.len + 4), A.hand.r],
]
const reach = (phi: number) => Math.max(...HAND_END.map(([t, r]) => t * Math.cos(phi) + r * Math.sin(phi)))

/**
 * The back of the head, relative to the neck joint with the head upright: the top of the beanie
 * cuff's outer face at the back (the beanie is worn tipped back, so that is what sticks out
 * furthest behind). Tipped about the beanie's pivot, squashed by the head's depth, then dropped
 * onto the neck: about 70 mm up and 47 mm behind the neck joint.
 */
const HEAD_BACK = (() => {
  const B = DOLL.beanie
  const y = B.cuff.y1 - CUFF_CORNER - B.pivotY
  const z = -(B.cuff.rOut + B.cuff.ribDepth)
  const c = Math.cos(B.tilt)
  const s = Math.sin(B.tilt)
  return { y: B.pivotY + y * c - z * s + DOLL.headDrop - R.neckY, z: (y * s + z * c) * DOLL.head.depth }
})()

/**
 * The seated pose for a lean. Rotations about X are all in one plane, so a child's lean in the
 * world is its parent's plus its own. For a point (y, z) above a joint, leaning by `a` (positive
 * tips forward) gives z' = y sin(a) + z cos(a).
 *
 *   hood    the flattened ellipsoid on the upper back (DOLL.hood: 16 tall, 8 deep, centred 73
 *           above the waist joint and 35 behind), tipped HOOD_TILT - lean in the world. Its back
 *           ends at the centre's z minus its half-depth in z: 51.5 mm behind the origin, about
 *           75 mm up, just under the shoulder joints (84 mm up)
 *   head    the beanie is wide and worn tipped back, so with the head upright its back would
 *           stick out 6 mm past the hood and hit the pole first. The head nods forward just
 *           enough that the back of the beanie stays HEAD_CLEAR in front of the hood: the hood
 *           rests on the pole and the head all but does. That is about 5 degrees down in the
 *           world, a slightly shy tuck of the chin
 */
function seat(lean: number) {
  const c = Math.cos(lean)
  const s = Math.sin(lean)
  const waistH = (R.waistY - hemY) * c + hemR * DOLL.torso.depth * Math.abs(s)
  const drop = HIP_H + (R.waistY - R.hipY) - waistH

  // arms: find how far from straight down they hang to just reach the desk (reach falls as
  // phi grows), then split that into their sideways hang and a forward swing
  const shoulderH = waistH + (A.shoulder[1] - R.waistY) * c
  let lo = 0
  let hi = Math.PI / 2
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2
    if (reach(m) > shoulderH) lo = m
    else hi = m
  }
  const forward = Math.acos(Math.min(1, Math.cos(lo) / Math.cos(A.spread - ARM_IN)))

  const [, hoodY, hoodZ] = DOLL.hood.pos
  const [, ry, rz] = DOLL.hood.size
  const tip = HOOD_TILT - lean
  const hoodBack = -(hoodY - R.waistY) * s + hoodZ * c - Math.hypot(rz * Math.cos(tip), ry * Math.sin(tip))

  const neckZ = -(R.neckY - R.waistY) * s
  const k = Math.hypot(HEAD_BACK.y, HEAD_BACK.z)
  const want = Math.max(-1, Math.min(1, (hoodBack + HEAD_CLEAR - neckZ) / k))
  const nod = Math.max(-0.3, Math.min(0.35, Math.asin(want) - Math.atan2(HEAD_BACK.z, HEAD_BACK.y)))
  const headBack = neckZ + HEAD_BACK.y * Math.sin(nod) + HEAD_BACK.z * Math.cos(nod)

  return {
    lean,
    drop,
    legX: -(Math.PI / 2 + LIFT),
    armX: lean - forward, // negative swings the hand forward; the lean back already swung it some
    headX: nod + lean,
    backZ: Math.min(hoodBack, headBack),
  }
}
type Seat = ReturnType<typeof seat>

/**
 * Where to put him, in SeatedDoll's frame (default lean). backZ: the z (negative, behind the
 * origin) where the back of his hood ends, at about shoulder height. Put the front of the lamp
 * pole there and he leans on it; nothing else of him reaches further back.
 */
export const SEATED = { backZ: seat(LEAN).backZ }

/**
 * Sets the whole pose. breath 0..1 (0 = at rest, 1 = breathed out: the chest draws in a touch,
 * never swelling past the rest pose, so nothing breathes into the desk or the pole), roll = the
 * head's side tilt. The head is scaled back up against the chest so only the body breathes.
 */
function pose(r: DollRig, s: Seat, breath: number, roll: number) {
  r.legL.rotation.set(s.legX, 0, SPLAY)
  r.legR.rotation.set(s.legX, 0, -SPLAY)
  r.torso.position.y = -s.drop
  r.torso.rotation.set(-s.lean, 0, 0)
  const wide = 1 - BREATH.wide * breath
  const tall = 1 - BREATH.tall * breath
  r.torso.scale.set(wide, tall, wide)
  r.head.scale.set(1 / wide, 1 / tall, 1 / wide)
  r.head.rotation.set(s.headX, 0, roll)
  r.armL.rotation.set(s.armX, 0, -ARM_IN)
  r.armR.rotation.set(s.armX, 0, ARM_IN)
}

export function SeatedDoll({ lean = LEAN }: { lean?: number }) {
  const rig = useRef<DollRig | null>(null)
  const s = useMemo(() => seat(lean), [lean])
  const life = useRef({ t: 0, next: 5, back: 0, target: HEAD_ROLL, tilt: { x: HEAD_ROLL, v: 0 } as Spring })

  // posed before the first frame is drawn (Doll fills in the rig in its own layout effect, first)
  useLayoutEffect(() => {
    if (rig.current) pose(rig.current, s, 0, life.current.tilt.x)
  }, [s])

  useFrame((_, dt) => {
    const r = rig.current
    if (!r) return
    const L = life.current
    const h = Math.min(dt, 1 / 30)
    L.t += h
    // every 7 to 13 seconds the head tips a little further over (or, now and then, a little
    // straighter), holds a moment, and comes back; a soft spring gives it a small toy wobble
    if (L.t > L.next) {
      L.target = HEAD_ROLL + (Math.random() < 0.7 ? TILT.more : -TILT.less)
      L.back = L.t + 1.4 + Math.random() * 1.6
      L.next = L.t + 7 + Math.random() * 6
    }
    if (L.back && L.t > L.back) {
      L.target = HEAD_ROLL
      L.back = 0
    }
    stepSpring(L.tilt, L.target, h, TILT.k, TILT.c)
    const breath = (1 - Math.cos((2 * Math.PI * L.t) / BREATH.period)) / 2
    pose(r, s, breath, L.tilt.x)
  })

  return (
    <group position={[0, HIP_H - R.hipY, 0]}>
      <Doll rig={rig} />
    </group>
  )
}
