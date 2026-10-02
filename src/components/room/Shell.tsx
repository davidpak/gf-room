import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { ExtrudeGeometry, MeshStandardMaterial, Path, Shape, Vector2, type Group, type Mesh } from 'three'
import { cutaway } from './cutaway'
import { createPlankMaterial } from '../../lib/plankMaterial'
import { CLOSET } from '../closet/spec'
import { Door } from './Door'
import { Window } from './Window'
import { ROOM } from './spec'

/**
 * Rina's room shell (./spec.ts): plank floor on a base slab, four full walls with real thickness
 * and softly bevelled edges, the window opening in the north wall, the door notch in the south
 * wall, the ceiling bulkhead along the west wall, baseboards, outlets, and the ceiling with its
 * (switched off) light and a smoke detector.
 *
 * A dollhouse: any wall the camera is outside of is cut away, and so is the ceiling when the
 * camera is above it, so from outside the room reads as a little diorama you look into, and from
 * inside it is a closed room.
 */
const { w, d, h, wall: T } = ROOM
const BB = ROOM.baseboard
const shadow = { castShadow: true, receiveShadow: true }
// the room's own surfaces catch shadows but don't cast them (cheaper)
const surface = { receiveShadow: true }
// the closet (SE) protrudes into the room; its west side panel ends the south wall
const CLOSET_X0 = w / 2 - CLOSET.opening.w - CLOSET.wall
const CLOSET_FRONT = d / 2 - CLOSET.depth

/** Paint + trim for one wall: each wall has its own so it can fade on its own. */
function useWallMaterials() {
  return useMemo(
    () => ({
      paint: new MeshStandardMaterial({ color: ROOM.paint, roughness: 0.93 }),
      trim: new MeshStandardMaterial({ color: ROOM.trim, roughness: 0.45 }),
    }),
    [],
  )
}

const BEVEL = 6 // every wall edge (the window recess, the door opening, the cut tops) is rounded this much

/**
 * A wall slab from a 2D outline (u along the wall, y up), extruded `T` toward +Z with softly
 * bevelled edges. Pass the outline already shrunk by BEVEL and the holes already grown by BEVEL:
 * the bevel grows them back, so the finished wall has exactly the intended size.
 */
function extrudeWall(outline: [number, number][], holes: [number, number][][] = []) {
  const v = (pts: [number, number][]) => pts.map(([x, y]) => new Vector2(x, y))
  const s = new Shape(v(outline))
  for (const hole of holes) s.holes.push(new Path(v(hole)))
  const g = new ExtrudeGeometry(s, {
    depth: T - 2 * BEVEL,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 4,
  })
  g.translate(0, 0, BEVEL) // the faces land at z = 0 and z = T
  return g
}
/** A rectangle shrunk by the bevel (for outlines) or grown by it (for holes, pass -1). */
const inset = (x0: number, y0: number, x1: number, y1: number, k = 1) => rect(x0 + k * BEVEL, y0 + k * BEVEL, x1 - k * BEVEL, y1 - k * BEVEL)
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

/** The groups each cut-away side hides (filled in by the walls). */
type Sides = Record<'north' | 'east' | 'south' | 'west' | 'ceiling' | 'soffit', RefObject<Group | null>>
const MARGIN = 40 // the camera has to be this far outside a wall before it goes

export function Shell() {
  const floor = useMemo(() => createPlankMaterial(ROOM.floor, ROOM.plank), [])
  const base = useMemo(() => new MeshStandardMaterial({ color: ROOM.base, roughness: 0.9 }), [])
  const sides: Sides = {
    north: useRef<Group>(null),
    east: useRef<Group>(null),
    south: useRef<Group>(null),
    west: useRef<Group>(null),
    ceiling: useRef<Group>(null),
    soffit: useRef<Group>(null),
  }
  const northPaint = useRef<Mesh>(null)

  useFrame(({ camera }) => {
    const c = camera.position
    const cut = {
      north: c.z < -d / 2 - MARGIN,
      east: c.x > w / 2 + MARGIN,
      south: c.z > d / 2 + MARGIN,
      west: c.x < -w / 2 - MARGIN,
      ceiling: c.y > h + MARGIN,
    }
    cutaway.set(cut)
    const k = cutaway.get()
    if (sides.east.current) sides.east.current.visible = !k.east
    if (sides.south.current) sides.south.current.visible = !k.south
    if (sides.west.current) sides.west.current.visible = !k.west
    if (sides.ceiling.current) sides.ceiling.current.visible = !k.ceiling
    if (sides.soffit.current) sides.soffit.current.visible = !k.ceiling && !k.west
    if (sides.north.current) sides.north.current.visible = !k.north
    if (northPaint.current) northPaint.current.visible = !k.north
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]} material={floor} receiveShadow>
        <planeGeometry args={[w, d]} />
      </mesh>
      {/* the diorama's base: a soft slab under the floor and the walls */}
      <RoundedBox args={[w + 2 * T + 40, 140, d + 2 * T + 40]} radius={18} smoothness={3} position={[0, -70.5, 0]} material={base} receiveShadow />
      <group ref={sides.ceiling}>
        <Ceiling />
      </group>
      <NorthWall group={sides.north} paint={northPaint} />
      <group ref={sides.east}>
        <EastWall />
      </group>
      <group ref={sides.south}>
        <SouthWall />
      </group>
      <group ref={sides.west}>
        <WestWall />
      </group>
      <group ref={sides.soffit}>
        <Soffit />
      </group>
    </group>
  )
}

function Baseboard({ from, to, at, axis, mat }: { from: number; to: number; at: number; axis: 'x' | 'z'; mat: MeshStandardMaterial }) {
  const len = to - from
  const mid = (from + to) / 2
  const pos: [number, number, number] = axis === 'x' ? [mid, BB.h / 2, at] : [at, BB.h / 2, mid]
  const args: [number, number, number] = axis === 'x' ? [len, BB.h, BB.t] : [BB.t, BB.h, len]
  return <RoundedBox args={args} radius={4.5} smoothness={2} position={pos} material={mat} {...shadow} />
}

/** Duplex outlet cover plate. */
function Outlet({ pos, rotY = 0, mat }: { pos: [number, number, number]; rotY?: number; mat: MeshStandardMaterial }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <RoundedBox args={[70, 115, 6]} radius={2.5} position={[0, 0, 3]} material={mat} />
      {[-22, 22].map((y) => (
        <RoundedBox key={y} args={[34, 30, 5]} radius={4} position={[0, y, 6.5]} material={mat} />
      ))}
    </group>
  )
}

/** The ceiling: a flat slab, a round flush-mount light (off: the room is lit from outside), a smoke detector. */
function Ceiling() {
  const { paint, trim } = useWallMaterials()
  return (
    <group>
      <mesh position={[0, h + T / 2, 0]} material={paint} {...surface}>
        <boxGeometry args={[w + 2 * T, T, d + 2 * T]} />
      </mesh>
      <mesh position={[150, h - 18, 100]} material={trim}>
        <cylinderGeometry args={[165, 175, 36, 48]} />
      </mesh>
      <mesh position={[w / 2 - 700, h - 12, 1000]} material={trim}>
        <cylinderGeometry args={[60, 64, 24, 32]} />
      </mesh>
    </group>
  )
}

function NorthWall({ group, paint: paintRef }: { group: RefObject<Group | null>; paint: RefObject<Mesh | null> }) {
  const { paint, trim } = useWallMaterials()
  const W = ROOM.window
  const geo = useMemo(() => extrudeWall(inset(-w / 2 - T, 0, w / 2 + T, h), [inset(W.x0, W.sill, W.x1, W.head, -1)]), [W])
  return (
    <group>
      {/* (the window stays when the wall is cut away: it is furniture) */}
      <mesh ref={paintRef} geometry={geo} position={[0, 0, -d / 2 - T]} material={paint} {...shadow} />
      <group ref={group}>
        <Baseboard from={-w / 2} to={w / 2} at={-d / 2 + BB.t / 2} axis="x" mat={trim} />
      </group>
      <Window />
    </group>
  )
}

function EastWall() {
  const { paint, trim } = useWallMaterials()
  const geo = useMemo(() => extrudeWall(inset(-d / 2, 0, d / 2, h)), [])
  return (
    <group>
      {/* built along u = -z, then turned so it extrudes outward (+X) */}
      <mesh geometry={geo} position={[w / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={paint} {...surface} />
      <Baseboard from={-d / 2} to={CLOSET_FRONT} at={w / 2 - BB.t / 2} axis="z" mat={trim} />
      <Outlet pos={[w / 2, 300, 900]} rotY={-Math.PI / 2} mat={trim} />
    </group>
  )
}

function SouthWall() {
  const { paint, trim } = useWallMaterials()
  const D = ROOM.door
  const x1 = D.x0 + D.w
  // full width (it is also the closet's back wall), with the door notched out of the bottom
  const geo = useMemo(
    () =>
      // the outline shrunk by the bevel all round (the door notch grows by it)
      extrudeWall([
        [-w / 2 - T + BEVEL, BEVEL],
        [D.x0 - BEVEL, BEVEL],
        [D.x0 - BEVEL, D.h + BEVEL],
        [x1 + BEVEL, D.h + BEVEL],
        [x1 + BEVEL, BEVEL],
        [w / 2 + T - BEVEL, BEVEL],
        [w / 2 + T - BEVEL, h - BEVEL],
        [-w / 2 - T + BEVEL, h - BEVEL],
      ]),
    [D, x1],
  )
  return (
    <group>
      <mesh geometry={geo} position={[0, 0, d / 2]} material={paint} {...surface} />
      <Baseboard from={-w / 2} to={D.x0 - D.casing} at={d / 2 - BB.t / 2} axis="x" mat={trim} />
      <Baseboard from={x1 + D.casing} to={CLOSET_X0} at={d / 2 - BB.t / 2} axis="x" mat={trim} />
      <Door />
    </group>
  )
}

function WestWall() {
  const { paint, trim } = useWallMaterials()
  const geo = useMemo(() => extrudeWall(inset(-d / 2, 0, d / 2, h)), [])
  return (
    <group>
      <mesh geometry={geo} position={[-w / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={paint} {...surface} />
      <Baseboard from={-d / 2} to={d / 2} at={-w / 2 + BB.t / 2} axis="z" mat={trim} />
    </group>
  )
}

/** The ceiling bulkhead along the west wall, over the desk side of the room (goes with the ceiling or the west wall). */
function Soffit() {
  const { paint } = useWallMaterials()
  const S = ROOM.soffit
  return (
    <RoundedBox args={[S.w, S.drop, d]} radius={6} smoothness={2} position={[-w / 2 + S.w / 2, h - S.drop / 2, 0]} material={paint} {...surface} />
  )
}
