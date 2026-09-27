import { useMemo, type RefObject } from 'react'
import { type ThreeElements } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { CatmullRomCurve3, ExtrudeGeometry, LatheGeometry, Matrix4, MeshStandardMaterial, Shape, Vector2, Vector3, type Group } from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedRect } from '../../lib/shapes'
import { LAMP } from '../lamp/spec'
import { receptacleShape } from '../room/Lamp'

/**
 * Power cords' parts: the plug heads, the wall outlet, and the way a cord runs from an appliance to
 * the wall (./LiveCord makes the cord itself: real physics, unplug and plug back in).
 *
 *   plug heads   moulded, tapering back to a ribbed strain-relief boot the cord comes out of, brass
 *                prongs: a lamp's 2 blades (the neutral one wider, polarised, NEMA 1-15P) or the
 *                desk's 2 blades and round ground pin (NEMA 5-15P). Frame: the face that meets the
 *                outlet at z = 0, the prongs out along -Z, the cord leaving the boot along +Z; the
 *                blades on the receptacle's slot line (4 above its centre), the pin 11.9 below that
 *   wall outlet  a duplex plate (70 x 114, softly bevelled, the receptacles standing through it,
 *                ground holes down, 39 apart) with its centre screw. Faces +Z; its sockets' frames
 *                (the face's centre, +Z out) are the anchors `top` / `bottom`
 */
export const CORD = new MeshStandardMaterial({ color: '#2b2538', roughness: 1 }) // black, a touch plum, like the other darks
const BRASS = new MeshStandardMaterial({ color: '#e3cf98', roughness: 1 })
const RIB = new MeshStandardMaterial({ color: '#241f30', roughness: 1 })

export const PLUGS = {
  2: { w: 17, h: 23, d: 12, bevel: 3, corner: 5, taper: [0.24, 0.14], boot: { len: 12, r: 4.8 }, cord: 2.5, blades: [6.35, 7.9], pin: false, mass: 0.015 },
  3: { w: 25, h: 29, d: 16, bevel: 3.5, corner: 6, taper: [0.2, 0.16], boot: { len: 15, r: 6.2 }, cord: 3.1, blades: [6.35, 6.35], pin: true, mass: 0.03 },
} as const
export type Prongs = keyof typeof PLUGS
const BLADE = { t: 1.5, len: 15.9, apart: 12.7, line: 4 } // the slot line is 4 above the face's centre (receptacleShape)
const PIN = { r: 2.4, len: 18.5, below: 11.9 }
/** where the cord leaves the plug (distance from its face) */
export const plugBack = (p: Prongs) => PLUGS[p].d + PLUGS[p].boot.len

export function PlugHead({ prongs, ...props }: { prongs: Prongs } & Omit<ThreeElements['group'], 'ref'>) {
  const P = PLUGS[prongs]
  const geo = useMemo(() => {
    // the body: a rounded face extruded back, bevelled all round, tapering toward the cord
    const b = P.bevel
    const body = new ExtrudeGeometry(roundedRect(P.w - 2 * b, P.h - 2 * b, Math.max(1, P.corner - b)), {
      depth: P.d - 2 * b,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 4,
      curveSegments: 10,
    })
    body.translate(0, 0, b)
    const pos = body.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getZ(i) / P.d))
      pos.setXY(i, pos.getX(i) * (1 - P.taper[0] * t), pos.getY(i) * (1 - P.taper[1] * t))
    }
    toCreasedNormals(body, 0.6)
    // the boot: a taper from the body to the cord, with grip rings
    const R = P.boot.r
    const L = P.boot.len
    const prof: Vector2[] = [new Vector2(0, -0.5), new Vector2(R, -0.5), new Vector2(R, 1.5)]
    const rings = 4
    for (let k = 0; k < rings; k++) {
      const y0 = 2 + (k * (L - 5)) / rings
      const rr = R - ((R - P.cord - 0.6) * k) / rings
      prof.push(new Vector2(rr * 0.9, y0 + 0.6), new Vector2(rr * 0.9, y0 + (L - 5) / rings - 0.6), new Vector2(rr * 0.82, y0 + (L - 5) / rings))
    }
    prof.push(new Vector2(P.cord + 0.5, L - 1), new Vector2(P.cord + 0.3, L), new Vector2(0, L))
    const boot = new LatheGeometry(prof, 24)
    boot.rotateX(Math.PI / 2) // its axis along +Z
    return { body, boot }
  }, [P])
  const sideX = (P.w / 2) * (1 - P.taper[0] * 0.5)
  return (
    <group {...props}>
      <mesh geometry={geo.body} material={CORD} castShadow receiveShadow />
      <mesh geometry={geo.boot} material={CORD} position={[0, 0, P.d]} castShadow receiveShadow />
      {/* grip ribs down the sides (the desk's plug) */}
      {prongs === 3 &&
        [-1, 1].flatMap((s) =>
          [-6, 0, 6].map((y) => <RoundedBox key={`${s}${y}`} args={[0.9, 2.2, P.d * 0.55]} radius={0.4} smoothness={2} position={[s * (sideX - 0.1), y, P.d * 0.5]} material={RIB} />),
        )}
      {/* the prongs */}
      {P.blades.map((bw, i) => (
        <RoundedBox key={i} args={[BLADE.t, bw, BLADE.len]} radius={0.5} smoothness={2} position={[(i ? 1 : -1) * (BLADE.apart / 2), BLADE.line, -BLADE.len / 2]} material={BRASS} castShadow />
      ))}
      {P.pin && (
        <group position={[0, BLADE.line - PIN.below, 0]}>
          <mesh material={BRASS} position={[0, 0, -PIN.len / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[PIN.r, PIN.r, PIN.len, 16]} />
          </mesh>
          <mesh material={BRASS} position={[0, 0, -PIN.len]}>
            <sphereGeometry args={[PIN.r, 16, 8]} />
          </mesh>
        </group>
      )}
    </group>
  )
}

// ---- the wall outlet
const PLATE = { w: 70, h: 114, t: 3.4, bevel: 1.8, corner: 4.5 }
const SPACING = 39
const O = LAMP.outlet
const PROUD = 2.4 // the receptacles stand this far out of the plate
const MAT = {
  plate: new MeshStandardMaterial({ color: '#f5efe4', roughness: 1 }),
  face: new MeshStandardMaterial({ color: '#ebe2d0', roughness: 1 }),
  hole: new MeshStandardMaterial({ color: '#1b1626', roughness: 1 }),
  slot: new MeshStandardMaterial({ color: '#8f8478', roughness: 1 }),
}
/** a receptacle's outline (flat sides, arched top and bottom), grown by `grow` */
function faceOutline(grow: number, path: Shape) {
  const w = O.w + 2 * grow
  const h = O.h + 2 * grow
  const sag = h / 2 - 12
  path.moveTo(-w / 2, -sag)
  path.lineTo(-w / 2, sag)
  path.quadraticCurveTo(-w / 2 + 2, h / 2 + 2, 0, h / 2)
  path.quadraticCurveTo(w / 2 - 2, h / 2 + 2, w / 2, sag)
  path.lineTo(w / 2, -sag)
  path.quadraticCurveTo(w / 2 - 2, -h / 2 - 2, 0, -h / 2)
  path.quadraticCurveTo(-w / 2 + 2, -h / 2 - 2, -w / 2, -sag)
  return path
}
/** the plate's front face (z), and a socket's face (z) */
export const OUTLET = { front: PLATE.t + 2 * PLATE.bevel, face: PLATE.t + 2 * PLATE.bevel + PROUD, spacing: SPACING }

export function WallOutlet({
  top,
  bottom,
  ...props
}: { top?: RefObject<Group | null>; bottom?: RefObject<Group | null> } & Omit<ThreeElements['group'], 'ref'>) {
  const geo = useMemo(() => {
    const b = PLATE.bevel
    const s = roundedRect(PLATE.w - 2 * b, PLATE.h - 2 * b, PLATE.corner - b)
    for (const y of [SPACING / 2, -SPACING / 2]) {
      const hole = faceOutline(0.8, new Shape())
      const moved = new Shape(hole.getPoints(40).map((p) => new Vector2(p.x, p.y + y)))
      s.holes.push(moved)
    }
    const plate = new ExtrudeGeometry(s, { depth: PLATE.t, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 16 })
    plate.translate(0, 0, b)
    toCreasedNormals(plate, 0.6)
    // the receptacle: its face (holes cut through), standing through the plate
    const face = new ExtrudeGeometry(receptacleShape(), { depth: PLATE.t + PROUD, bevelEnabled: true, bevelThickness: 1.1, bevelSize: 1.1, bevelSegments: 3, curveSegments: 20 })
    toCreasedNormals(face, 0.6)
    return { plate, face }
  }, [])
  const faceZ = OUTLET.face - (PLATE.t + PROUD) - 1.1 // so its face is at OUTLET.face
  return (
    <group {...props}>
      <mesh geometry={geo.plate} material={MAT.plate} castShadow receiveShadow />
      {[1, -1].map((s) => (
        <group key={s} position={[0, (s * SPACING) / 2, 0]}>
          {/* the dark inside, seen through the slots */}
          <mesh position={[0, 0, faceZ - 0.4]} material={MAT.hole}>
            <planeGeometry args={[O.w - 3, O.h - 3]} />
          </mesh>
          <mesh geometry={geo.face} material={MAT.face} position={[0, 0, faceZ]} castShadow receiveShadow />
          <group ref={s > 0 ? top : bottom} position={[0, 0, OUTLET.face]} />
        </group>
      ))}
      {/* the centre screw: a low dome with its slot */}
      <group position={[0, 0, OUTLET.front]}>
        <mesh material={MAT.plate} scale={[1, 1, 0.45]}>
          <sphereGeometry args={[3.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh material={MAT.slot} position={[0, 0, 1.4]} rotation={[0, 0, 0.35]}>
          <boxGeometry args={[5.2, 0.7, 0.6]} />
        </mesh>
      </group>
      {/* solid, as a device (a plug in a socket passes into it) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[PLATE.w / 2, PLATE.h / 2, OUTLET.face / 2]} position={[0, 0, OUTLET.face / 2]} collisionGroups={groups(GROUP.device, 0xffff)} friction={0.8} />
      </RigidBody>
    </group>
  )
}

// ---- the way a cord runs
const _h = new Vector3()
/**
 * A cord's run from an appliance to a socket (control points, world): `from` (out of the appliance
 * and over what it crosses), straight down from the last of them to the floor, past `via` on the
 * floor (x, z), to the wall under the socket, up, and in: out of the plug's back and falling away
 * to `side`, so the plug's back (plugBack from its face) is the last point.
 */
export function cordRoute(o: { from: Vector3[]; via?: [number, number][]; socket: Matrix4; side: -1 | 1; back: number; r: number; floor?: number }) {
  const { r, side, back } = o
  const floor = o.floor ?? 0
  const s = o.socket
  const local = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(s)
  const P0 = local(0, 0, back)
  const P1 = local(5 * side, -1, back + 7)
  const P2 = local(22 * side, -8, back + 13)
  const W = local(34 * side, 0, back + 18).setY(floor + r + 35)
  const Wf = local(46 * side, 0, back + 36).setY(floor + r)
  const via = (o.via ?? []).map(([x, z]) => new Vector3(x, floor + r, z))
  const A = o.from[o.from.length - 1]
  const next = via[0] ?? Wf
  _h.set(next.x - A.x, 0, next.z - A.z).normalize()
  const drop = [new Vector3(A.x, floor + r + 40, A.z), new Vector3(A.x + _h.x * 40, floor + r, A.z + _h.z * 40)]
  return [...o.from.map((p) => p.clone()), ...drop, ...via, Wf, W, P2, P1, P0]
}

/**
 * The cord laid along a run, as near `length` long as a gentle sway of its floor stretch allows (at
 * most 25 to either side: the run's own floor loop carries the slack, so it stays in open floor). n + 1
 * points, evenly along it. If the run is longer than the cord, it's cut short (the plug doesn't reach).
 */
export function layCord(run: Vector3[], length: number, n: number, floor: number, r: number) {
  // the floor stretch, filled in so it can sway smoothly
  const pts: { p: Vector3; floor: boolean }[] = []
  for (let i = 0; i < run.length; i++) {
    const f = run[i].y < floor + r + 1
    if (i > 0 && f && pts[pts.length - 1].floor) {
      const a = pts[pts.length - 1].p
      const b = run[i]
      const k = Math.max(1, Math.round(a.distanceTo(b) / 120))
      for (let j = 1; j < k; j++) pts.push({ p: a.clone().lerp(b, j / k), floor: true })
    }
    pts.push({ p: run[i].clone(), floor: f })
  }
  const firstF = pts.findIndex((q) => q.floor)
  let lastF = -1
  pts.forEach((q, i) => q.floor && (lastF = i))
  const make = (amp: number) =>
    pts.map((q, i) => {
      if (!q.floor || i === firstF || i === lastF) return q.p
      const a = pts[Math.max(i - 1, 0)].p
      const b = pts[Math.min(i + 1, pts.length - 1)].p
      const perp = new Vector3(-(b.z - a.z), 0, b.x - a.x).normalize()
      return q.p.clone().addScaledVector(perp, amp * ((i - firstF) % 2 ? 1 : -1))
    })
  const len = (amp: number) => new CatmullRomCurve3(make(amp), false, 'centripetal').getLength()
  let amp = 0
  if (firstF >= 0 && len(0) < length) {
    let lo = 0
    let hi = 25
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2
      if (len(m) < length) lo = m
      else hi = m
    }
    amp = (lo + hi) / 2
  }
  const curve = new CatmullRomCurve3(make(amp), false, 'centripetal')
  const total = curve.getLength()
  const reach = Math.min(1, length / total)
  return Array.from({ length: n + 1 }, (_, i) => curve.getPointAt((i / n) * reach))
}
