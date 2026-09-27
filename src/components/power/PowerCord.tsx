import { useMemo, useRef, type RefObject } from 'react'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CatmullRomCurve3, ExtrudeGeometry, MeshStandardMaterial, Vector3, type Group, type Object3D } from 'three'
import { Tube } from '../../lib/physics/rope'
import { receptacleShape } from '../room/Lamp'

/**
 * Power cords: a plain black cord from something to a wall outlet. Not physics: it just keeps to
 * its route as the things it joins move (the desk going up and down), drawn as one smooth tube.
 *
 *   from     the cord's first points (world), read every frame: out of the appliance and over
 *            whatever it runs across. From the last one it drops straight to the floor
 *   via      points it runs past on the floor (world, x and z; the floor doesn't move)
 *   socket   the receptacle it's plugged into (a WallOutlet socket: origin the face's centre, +Z
 *            out of the wall). The plug sits there; the cord leaves its back and falls away to
 *            `side` (-1 left, +1 right) down to the floor
 *   prongs   2 (a lamp's plug, small) or 3 (grounded, bigger: the desk)
 *
 * Mount it at the top of the scene (world frame, not inside anything that moves).
 */
const CORD = new MeshStandardMaterial({ color: '#2b2538', roughness: 1 }) // black, a touch plum, like the other darks
const SAMPLES = 96
const PLUG = {
  2: { size: [20, 26, 15] as [number, number, number], corner: 4, boot: { r: 4.5, len: 7 } },
  3: { size: [28, 32, 19] as [number, number, number], corner: 5, boot: { r: 5.5, len: 9 } },
}

const _v = new Vector3()

export function PowerCord({
  from,
  via = [],
  socket,
  side = 1,
  prongs = 2,
  radius = 2.8,
  floor = 0,
}: {
  from: () => Vector3[]
  via?: [number, number][]
  socket: RefObject<Object3D | null>
  side?: -1 | 1
  prongs?: 2 | 3
  radius?: number
  floor?: number
}) {
  const tube = useMemo(() => new Tube(SAMPLES, 1, 10), [])
  const plug = useRef<Group>(null)
  const P = PLUG[prongs]
  const back = P.size[2] + P.boot.len // where the cord leaves the plug (from the face)

  useFrame(() => {
    const s = socket.current
    if (!s || !plug.current) return
    s.updateWorldMatrix(true, false)
    // the plug sits on the socket
    plug.current.matrix.copy(s.matrixWorld)
    plug.current.matrixWorld.copy(s.matrixWorld)

    const r = radius
    const pts = from().map((p) => p.clone())
    const A = pts[pts.length - 1]
    // near the socket, from the plug's back out and down (socket frame), then to the floor
    const local = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(s.matrixWorld)
    const P0 = local(0, 0, back)
    const P1 = local(5 * side, -1, back + 7)
    const P2 = local(22 * side, -8, back + 13)
    const W = local(34 * side, 0, back + 18).setY(floor + r + 35)
    const Wf = local(46 * side, 0, back + 36).setY(floor + r)
    // the drop: straight down from A, rounding onto the floor toward where it goes next
    const next = via.length ? new Vector3(via[0][0], 0, via[0][1]) : Wf
    const h = _v.set(next.x - A.x, 0, next.z - A.z).normalize()
    const drop = [new Vector3(A.x, floor + r + 40, A.z), new Vector3(A.x + h.x * 40, floor + r, A.z + h.z * 40)]
    const floorPts = via.map(([x, z]) => new Vector3(x, floor + r, z))
    const curve = new CatmullRomCurve3([...pts, ...drop, ...floorPts, Wf, W, P2, P1, P0], false, 'centripetal')
    tube.update(curve.getSpacedPoints(SAMPLES - 1), r)
  })

  return (
    <>
      <mesh geometry={tube.geometry} material={CORD} castShadow receiveShadow />
      <group ref={plug} matrixAutoUpdate={false}>
        <RoundedBox args={P.size} radius={P.corner} smoothness={3} position={[0, 0, P.size[2] / 2 + 0.3]} material={CORD} castShadow receiveShadow />
        {/* the strain relief the cord comes out of */}
        <mesh material={CORD} position={[0, 0, P.size[2] + P.boot.len / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[radius + 0.6, P.boot.r, P.boot.len, 16]} />
        </mesh>
      </group>
    </>
  )
}

/**
 * A duplex wall outlet floating where the wall would be: the cover plate and two receptacles
 * (ground hole down), 39 mm apart as real ones are. Faces +Z. `top` / `bottom` are the sockets'
 * anchors for PowerCord.
 */
const PLATE = { w: 70, h: 115, t: 5 }
const SPACING = 39
const FACE = 2.5 // the receptacle stands this proud of the plate
const MAT = {
  plate: new MeshStandardMaterial({ color: '#f5efe4', roughness: 1 }),
  face: new MeshStandardMaterial({ color: '#ece4d4', roughness: 1 }),
  hole: new MeshStandardMaterial({ color: '#1b1626', roughness: 1 }),
}

export function WallOutlet({
  top,
  bottom,
  ...props
}: { top?: RefObject<Group | null>; bottom?: RefObject<Group | null> } & Omit<ThreeElements['group'], 'ref'>) {
  const face = useMemo(
    () => new ExtrudeGeometry(receptacleShape(), { depth: 1.4, bevelEnabled: true, bevelThickness: 1.1, bevelSize: 1.1, bevelSegments: 3, curveSegments: 20 }),
    [],
  )
  return (
    <group {...props}>
      <RoundedBox args={[PLATE.w, PLATE.h, PLATE.t]} radius={2.4} smoothness={3} position={[0, 0, PLATE.t / 2]} material={MAT.plate} castShadow receiveShadow />
      {[1, -1].map((s) => (
        <group key={s} position={[0, (s * SPACING) / 2, PLATE.t]}>
          <mesh position={[0, 0, 0.1]} material={MAT.hole}>
            <planeGeometry args={[28, 30]} />
          </mesh>
          <mesh geometry={face} material={MAT.face} castShadow receiveShadow />
          <group ref={s > 0 ? top : bottom} position={[0, 0, FACE]} />
        </group>
      ))}
      {/* the plate's screw */}
      <mesh material={MAT.face} position={[0, 0, PLATE.t + 0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[3, 3, 0.8, 16]} />
      </mesh>
    </group>
  )
}
