import { ROOM } from '../room/spec'
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial, RoundedBox } from '@react-three/drei'
import { Frustum, Matrix4, MeshStandardMaterial, Vector3, type Group, type Mesh } from 'three'
import { stepSpring, type Spring } from '../../lib/spring'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { FollowCollider } from '../../lib/physics/FollowCollider'
import { CLOSET, DOOR } from './spec'

const _p = new Vector3()
const _n = new Vector3()
const _m = new Matrix4()
const _f = new Frustum()

/**
 * Closet with two bypass mirror doors (see ./spec.ts).
 *   click a door: it glides to the other end of its track on a heavy, low-bounce spring,
 *   passing over or under the other door because the two run in separate lanes.
 * The mirrors are real planar reflections of the scene.
 *
 * `sides` lets the room turn off a side wall that the room already provides.
 */
const MAT = {
  wall: new MeshStandardMaterial({ color: ROOM.paint, roughness: 0.93 }),
  interior: new MeshStandardMaterial({ color: '#f6cdbd', roughness: 0.95 }),
  trim: new MeshStandardMaterial({ color: '#5b4d8a', roughness: 0.38, metalness: 0.6 }), // the dark frames, as a deep lavender-grey
  track: new MeshStandardMaterial({ color: '#6b5b98', roughness: 0.35, metalness: 0.65 }),
  shelf: new MeshStandardMaterial({ color: '#fff0e2', roughness: 0.8 }),
  rod: new MeshStandardMaterial({ color: '#cbc0ec', roughness: 0.3, metalness: 0.7 }),
}
const shadow = { castShadow: true, receiveShadow: true }

/**
 * Bevels: the frames, tracks and shelf have rounded edges, big enough to catch a thin line of
 * light from across the room, never more than ~40% of a piece's smallest side. The shell walls
 * stay square: they meet the room's own walls, floor and ceiling.
 *   frame  the doors' 22 mm stiles and rails (the mirror sits just inside their rounded edge)
 *   track  the 40 mm top track
 *   floor  the 14 mm floor guide
 *   shelf  the 22 mm shelf
 */
const R = { frame: 5, track: 6, floor: 5, shelf: 6 }

export function Closet({ sides = { left: true, right: true }, back = true }: { sides?: { left?: boolean; right?: boolean }; back?: boolean }) {
  const { opening, depth, ceiling, wall, track, lanes, shelf, rod } = CLOSET
  const W = opening.w
  return (
    <group>
      {/* shell: back wall (the room can provide it: `back={false}`), side walls, header above the opening */}
      {back && (
        <mesh position={[0, ceiling / 2, -depth - wall / 2]} material={MAT.interior} {...shadow}>
          <boxGeometry args={[W + 2 * wall, ceiling, wall]} />
        </mesh>
      )}
      {sides.left !== false && (
        <mesh position={[-W / 2 - wall / 2, ceiling / 2, -depth / 2]} material={MAT.wall} {...shadow}>
          <boxGeometry args={[wall, ceiling, depth + wall]} />
        </mesh>
      )}
      {sides.right !== false && (
        <mesh position={[W / 2 + wall / 2, ceiling / 2, -depth / 2]} material={MAT.wall} {...shadow}>
          <boxGeometry args={[wall, ceiling, depth + wall]} />
        </mesh>
      )}
      <mesh position={[0, (opening.h + ceiling) / 2, 0]} material={MAT.wall} {...shadow}>
        <boxGeometry args={[W + 2 * wall, ceiling - opening.h, wall]} />
      </mesh>

      {/* solid: the walls, the header, the shelf */}
      <RigidBody type="fixed" colliders={false}>
        {back && <CuboidCollider args={[W / 2 + wall, ceiling / 2, wall / 2]} position={[0, ceiling / 2, -depth - wall / 2]} />}
        {sides.left !== false && <CuboidCollider args={[wall / 2, ceiling / 2, (depth + wall) / 2]} position={[-W / 2 - wall / 2, ceiling / 2, -depth / 2]} />}
        {sides.right !== false && <CuboidCollider args={[wall / 2, ceiling / 2, (depth + wall) / 2]} position={[W / 2 + wall / 2, ceiling / 2, -depth / 2]} />}
        <CuboidCollider args={[W / 2 + wall, (ceiling - opening.h) / 2, wall / 2]} position={[0, (opening.h + ceiling) / 2, 0]} />
        <CuboidCollider args={[(W - 10) / 2, shelf.t / 2, (depth - 60) / 2]} position={[0, shelf.y, -depth / 2 - 30]} />
      </RigidBody>

      {/* tracks: two-channel top track under the header, low floor guide */}
      <RoundedBox args={[W, track.h, track.d]} radius={R.track} position={[0, opening.h - track.h / 2, 0]} material={MAT.track} {...shadow} />
      <RoundedBox args={[W, track.floorH, track.d]} radius={R.floor} position={[0, track.floorH / 2, 0]} material={MAT.track} {...shadow} />

      {/* interior: shelf and hanging rod */}
      <RoundedBox args={[W - 10, shelf.t, depth - 60]} radius={R.shelf} position={[0, shelf.y, -depth / 2 - 30]} material={MAT.shelf} {...shadow} />
      <mesh position={[0, rod.y, -depth / 2 + 40]} rotation={[0, 0, Math.PI / 2]} material={MAT.rod} castShadow>
        <cylinderGeometry args={[rod.r, rod.r, W - 20, 20]} />
      </mesh>

      {/* the two bypass doors, back lane starts left, front lane starts right */}
      <SlidingMirror lane={lanes.back} startRight={false} />
      <SlidingMirror lane={lanes.front} startRight />
    </group>
  )
}

function SlidingMirror({ lane, startRight }: { lane: number; startRight: boolean }) {
  const { t, frame } = CLOSET.door
  const group = useRef<Group>(null)
  const [right, setRight] = useState(startRight)
  const slide = useRef<Spring>({ x: startRight ? DOOR.right : DOOR.left, v: 0 })
  const glass = useRef<Mesh>(null)
  const solid = useRef<Group>(null) // the door's collider follows this
  // a live reflection re-renders the whole scene, so only while this mirror is on screen and
  // facing the camera (otherwise nobody can see it)
  const [live, setLive] = useState(false)
  const liveRef = useRef(false)
  const unseen = useRef(0) // seconds out of view: switch off only after a while (no flicker at the edge)

  useFrame(({ camera }, dt) => {
    if (!group.current) return
    // a mirrored door is heavy: soft stiffness, nearly critical damping, a hint of settle
    group.current.position.x = stepSpring(slide.current, right ? DOOR.right : DOOR.left, dt, 38, 11)
    const m = glass.current
    if (!m) return
    m.getWorldPosition(_p)
    m.getWorldDirection(_n)
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _f.setFromProjectionMatrix(_m)
    const see = _p.sub(camera.position).dot(_n) < 0 && _f.intersectsObject(m)
    unseen.current = see ? 0 : unseen.current + dt
    const want = see || (liveRef.current && unseen.current < 1.5)
    if (want !== liveRef.current) {
      liveRef.current = want
      setLive(want)
    }
  })

  const mirrorW = DOOR.w - 2 * frame
  const mirrorH = DOOR.h - 2 * frame

  return (
    <group
      ref={group}
      position={[slide.current.x, DOOR.y0, lane]}
      onClick={(e) => {
        e.stopPropagation()
        setRight((r) => !r)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      <group ref={solid} position={[0, DOOR.h / 2, 0]} />
      <FollowCollider target={solid} half={[DOOR.w / 2, DOOR.h / 2, t / 2]} />
      {/* frame: stiles and rails around the glass */}
      <RoundedBox args={[frame, DOOR.h, t]} radius={R.frame} position={[-DOOR.w / 2 + frame / 2, DOOR.h / 2, 0]} material={MAT.trim} {...shadow} />
      <RoundedBox args={[frame, DOOR.h, t]} radius={R.frame} position={[DOOR.w / 2 - frame / 2, DOOR.h / 2, 0]} material={MAT.trim} {...shadow} />
      <RoundedBox args={[DOOR.w - 2 * frame, frame, t]} radius={R.frame} position={[0, frame / 2, 0]} material={MAT.trim} {...shadow} />
      <RoundedBox args={[DOOR.w - 2 * frame, frame, t]} radius={R.frame} position={[0, DOOR.h - frame / 2, 0]} material={MAT.trim} {...shadow} />
      {/* backing board */}
      <mesh position={[0, DOOR.h / 2, -2]} material={MAT.trim} castShadow>
        <boxGeometry args={[mirrorW, mirrorH, t - 8]} />
      </mesh>
      {/* the mirror: a real planar reflection while you can see it */}
      <mesh ref={glass} position={[0, DOOR.h / 2, t / 2 - 3]}>
        <planeGeometry args={[mirrorW, mirrorH]} />
        {live ? (
          <MeshReflectorMaterial mirror={1} resolution={384} mixBlur={0} blur={[0, 0]} mixStrength={1.15} color="#4e4868" metalness={0.5} roughness={0.9} />
        ) : (
          <meshStandardMaterial color="#6f6890" metalness={0.9} roughness={0.25} />
        )}
      </mesh>
    </group>
  )
}
