import { Waiting } from '../../lib/ready'
import { Suspense, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CatmullRomCurve3, ExtrudeGeometry, MeshStandardMaterial, TubeGeometry, Vector3, type Group } from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { roundedPolygon, roundedRect } from '../../lib/shapes'
import { createMapleMaterial } from '../../lib/mapleMaterial'
import { H_MIN, type Motor } from '../../lib/motor'
import { Keypad } from '../keypad/Keypad'
import { DESK, STACK } from './spec'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Quaternion } from 'three'

const _p = new Vector3()
const _r = new Quaternion()

/**
 * FEZIBO standing desk, built part by part from ./spec.ts.
 *   static : feet, levelling pads, inner (narrow) column tubes
 *   lift   : top, side brackets, crossbar, outer (wide) tubes + collars, motor, hooks, keypad
 * The lift group rises with the motor; the outer tubes slide down over the inner ones.
 */
const MAT = {
  frame: new MeshStandardMaterial({ color: '#f7eefe', roughness: 0.42, metalness: 0.08 }), // lavender white
  maple: createMapleMaterial('#efbe8b', 0.6), // softened: the toy look
  mapleEdge: new MeshStandardMaterial({ color: '#d99c63', roughness: 0.7 }),
  rubber: new MeshStandardMaterial({ color: '#3b3155', roughness: 0.9 }),
  motor: new MeshStandardMaterial({ color: '#3b3155', roughness: 0.5, metalness: 0.2 }),
}

const shadow = { castShadow: true, receiveShadow: true }

/**
 * Bevels: every hard edge is rounded, big enough to catch a thin line of light from across the
 * room (2 to 8 m away, where a 2-3 mm rounding vanishes). Roughly 6-8 mm on the tubes and rails,
 * never more than ~40% of a part's smallest side.
 *
 * CREASE: extruded shapes come out faceted; smoothing normals between faces less than this far
 * apart (radians) makes each bevel shade as one soft curve while the flat faces stay flat.
 */
const R = { inner: 6, outer: 8, collar: 4.5, bracket: 7, beam: 7 }
const FOOT_BEVEL = 5
const CREASE = 0.5

/** `children` sit on the desktop (origin: the top surface, centre) and ride up and down with it. */
export function Desk({ motor, children }: { motor: Motor; children?: ReactNode }) {
  const lift = useRef<Group>(null)
  const topMarker = useRef<Group>(null)
  const topBody = useRef<RapierRigidBody>(null)
  const placed = useRef(false) // the first frame the desktop's body is put straight in place (not swept up from the floor through everything)
  useFrame(() => {
    if (lift.current) lift.current.position.y = motor.height - H_MIN
    // the desktop is a moving (kinematic) collider: whatever sits on it rides up and down with it
    if (topMarker.current && topBody.current) {
      topMarker.current.getWorldPosition(_p)
      topMarker.current.getWorldQuaternion(_r)
      if (!placed.current) {
        placed.current = true
        topBody.current.setTranslation(_p, true)
        topBody.current.setRotation(_r, true)
      }
      topBody.current.setNextKinematicTranslation(_p)
      topBody.current.setNextKinematicRotation(_r)
    }
  })

  return (
    <group>
      {/* static base */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * DESK.legX, 0, 0]}>
          <Foot />
          <InnerTube />
        </group>
      ))}

      {/* everything that rises */}
      <RigidBody ref={topBody} type="kinematicPosition" colliders={false}>
        <CuboidCollider args={[DESK.top.w / 2, DESK.top.t / 2, DESK.top.d / 2]} friction={0.8} />
      </RigidBody>
      {/* solid feet, so things dropped under the desk don't fall through them */}
      <RigidBody type="fixed" colliders={false}>
        {[-1, 1].map((s) => (
          <CuboidCollider key={s} args={[DESK.foot.width / 2, (DESK.foot.lift + DESK.foot.height) / 2, DESK.foot.length / 2]} position={[s * DESK.legX, (DESK.foot.lift + DESK.foot.height) / 2, 0]} />
        ))}
        {/* the legs, from the feet up to the underside of the top */}
        {[-1, 1].map((s) => (
          <CuboidCollider key={'leg' + s} args={[DESK.outer.w / 2, DESK.topUnder / 2, DESK.outer.d / 2]} position={[s * DESK.legX, DESK.topUnder / 2, 0]} />
        ))}
      </RigidBody>

      <group ref={lift}>
        <group ref={topMarker} position={[0, DESK.topUnder + DESK.top.t / 2, 0]} />
        <Top />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * DESK.legX, 0, 0]}>
            <Bracket />
            <OuterTube />
          </group>
        ))}
        <Beam />
        <Motor />
        <Hook side={-1} />
        <Hook side={1} />
        <group position={[0, DESK.topUnder + DESK.top.t, 0]}>{children}</group>
        <group position={[DESK.keypad.x, DESK.topUnder, DESK.top.d / 2 + 20]}>
          <Suspense fallback={<Waiting />}>
            <Keypad motor={motor} slab={false} />
          </Suspense>
        </group>
      </group>
    </group>
  )
}

/**
 * Maple top: rounded-corner plan, extruded, with a soft rounded bevel all round (DESK.top.edge).
 * The bevel grows the outline by `edge`, so the plan is drawn `edge` smaller with its corner
 * radius `edge` smaller: the finished top is exactly w by d with plan corners of `corner`.
 * Darker edge band: the sides and the bevels are the extrusion's second material.
 */
function Top() {
  const { w, d, t, corner, edge } = DESK.top
  const geo = useMemo(() => {
    const g = new ExtrudeGeometry(roundedRect(w - 2 * edge, d - 2 * edge, Math.max(corner - edge, 1)), {
      depth: t - 2 * edge,
      bevelEnabled: true,
      bevelThickness: edge,
      bevelSize: edge,
      bevelSegments: 5,
      curveSegments: 12,
    })
    g.rotateX(-Math.PI / 2) // plan lies in XZ, extrusion goes up
    toCreasedNormals(g, CREASE)
    return g
  }, [w, d, t, corner, edge])
  return <mesh geometry={geo} material={[MAT.maple, MAT.mapleEdge]} position={[0, DESK.topUnder + edge, 0]} {...shadow} />
}

/**
 * T-foot: side profile (flat top, sloped ends) extruded across its width, rounded all round.
 * The bevel grows the profile by FOOT_BEVEL, so the profile is drawn that much inside the spec's
 * outline (near enough on the shallow slopes) and the finished foot is the spec's size: it
 * stands on the pads and the inner tube stands on it. Pads underneath.
 */
function Foot() {
  const { length, width, height, flat, endHeight, lift } = DESK.foot
  const geo = useMemo(() => {
    const b = FOOT_BEVEL
    const L = length / 2 - b
    const F = flat / 2
    const profile = roundedPolygon(
      [
        [-L, b],
        [L, b],
        [L, endHeight - b],
        [F, height - b],
        [-F, height - b],
        [-L, endHeight - b],
      ],
      [1, 1, 2, 8, 8, 2], // plus the bevel: finished corners of about 6, 7 and 13
    )
    const depth = width - 2 * b
    const g = new ExtrudeGeometry(profile, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 8 })
    g.rotateY(-Math.PI / 2) // profile (u,v) = (z,y), extrusion becomes X
    g.translate(depth / 2, 0, 0)
    toCreasedNormals(g, CREASE)
    return g
  }, [length, width, height, flat, endHeight])
  const { r, h, inset } = DESK.pad
  return (
    <group>
      <mesh geometry={geo} material={MAT.frame} position={[0, lift, 0]} {...shadow} />
      {[-1, 1].map((s) => (
        <mesh key={s} material={MAT.rubber} position={[0, h / 2, s * (length / 2 - inset)]} {...shadow}>
          <cylinderGeometry args={[r, r * 1.08, h, 24]} />
        </mesh>
      ))}
    </group>
  )
}

function InnerTube() {
  const { w, d, len } = DESK.inner
  return <RoundedBox args={[w, len, d]} radius={R.inner} smoothness={3} position={[0, STACK.footTop + len / 2, 0]} material={MAT.frame} {...shadow} />
}

function OuterTube() {
  const { w, d, len } = DESK.outer
  const c = DESK.collar
  return (
    <group>
      <RoundedBox args={[w, len, d]} radius={R.outer} smoothness={3} position={[0, STACK.outerTop - len / 2, 0]} material={MAT.frame} {...shadow} />
      <RoundedBox args={[c.w, c.h, c.d]} radius={R.collar} smoothness={3} position={[0, STACK.outerBottom + c.h / 2, 0]} material={MAT.frame} {...shadow} />
    </group>
  )
}

function Bracket() {
  const { w, h, len } = DESK.bracket
  return <RoundedBox args={[w, h, len]} radius={R.bracket} smoothness={3} position={[0, DESK.topUnder - h / 2, 0]} material={MAT.frame} {...shadow} />
}

function Beam() {
  const { h, d, z } = DESK.beam
  const len = 2 * DESK.legX - DESK.bracket.w
  return <RoundedBox args={[len, h, d]} radius={R.beam} smoothness={3} position={[0, DESK.topUnder - h / 2, z]} material={MAT.frame} {...shadow} />
}

/** Single motor, hanging on the inside of the right column, behind the crossbar. */
function Motor() {
  const { r, len } = DESK.motor
  const x = DESK.legX - DESK.outer.w / 2 - r - 2
  return (
    <group position={[x, STACK.bracketBottom - len / 2, DESK.beam.z]}>
      <mesh material={MAT.motor} {...shadow}>
        <cylinderGeometry args={[r, r, len - 8, 32]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={MAT.motor} position={[0, s * (len / 2 - 4), 0]} {...shadow}>
          <cylinderGeometry args={[r - (s > 0 ? 0 : 3), r - (s > 0 ? 3 : 0), 8, 32]} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * J-hook screwed under the top just outside a side bracket, curling outward.
 * Left = bag hook, right = headphone hook (as in the product photo).
 */
function Hook({ side }: { side: -1 | 1 }) {
  const tube = DESK.hook.tube
  const { geo, tip } = useMemo(() => {
    const pts = [
      [0, -3],
      [0, -20],
      [1.5, -36],
      [8, -48],
      [19, -51],
      [28, -45],
      [31, -34],
      [31, -27],
    ].map(([x, y]) => new Vector3(x, y, 0))
    const curve = new CatmullRomCurve3(pts)
    return { geo: new TubeGeometry(curve, 64, tube, 14, false), tip: pts[pts.length - 1] }
  }, [tube])
  const x = side * DESK.hook.x
  return (
    <group position={[x, DESK.topUnder, DESK.hook.z]} scale={[side, 1, 1]}>
      <RoundedBox args={[26, 4, 36]} radius={1.5} smoothness={3} position={[0, -2, 0]} material={MAT.frame} {...shadow} />
      <mesh geometry={geo} material={MAT.frame} {...shadow} />
      <mesh material={MAT.frame} position={tip} {...shadow}>
        <sphereGeometry args={[tube, 14, 10]} />
      </mesh>
    </group>
  )
}
