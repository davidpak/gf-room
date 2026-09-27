import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { BackSide, MeshStandardMaterial, type Group } from 'three'
import { stepSpring, type Spring } from '../../lib/spring'
import { createPlankMaterial } from '../../lib/plankMaterial'
import { ROOM } from './spec'
import { FollowCollider } from '../../lib/physics/FollowCollider'

/**
 * The bedroom door, in the south wall near the SW corner (public/reference/room-closet-door.jpg):
 * white flat slab, white jambs and casing, satin lever handle, hinges on the west edge. It swings
 * into the room onto a dim hallway. A light switch beside it.
 *
 *   click  opens / closes on a spring (hover: it eases open a crack)
 */
const D = ROOM.door
const Z1 = ROOM.d / 2 // the south wall's interior face
const T = ROOM.wall
const shadow = { castShadow: true, receiveShadow: true }

/**
 * Bevels: the jambs, casing and slab all have rounded edges, big enough to catch a thin line of
 * light from across the room, never more than ~40% of a piece's smallest side.
 *   jamb    18 mm jamb boards
 *   casing  16 mm casing
 *   slab    the 35 mm door leaf (the hinge knuckles still touch its rounded hinge edge)
 */
const R = { jamb: 5, casing: 5, slab: 8 }

export function Door() {
  const trim = useMemo(() => new MeshStandardMaterial({ color: ROOM.trim, roughness: 0.4 }), [])
  const metal = useMemo(() => new MeshStandardMaterial({ color: '#c9c9c6', roughness: 0.32, metalness: 0.9 }), [])
  const plate = useMemo(() => new MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.35 }), [])
  const hallFloor = useMemo(() => createPlankMaterial('#8a7865', ROOM.plank), [])
  const hallWall = useMemo(() => new MeshStandardMaterial({ color: '#8e8a92', roughness: 0.95, side: BackSide }), [])
  const x1 = D.x0 + D.w
  const c = D.casing
  const jamb = 18
  const hallX0 = D.x0 - 500
  const hallX1 = x1 + 900
  return (
    <group>
      {/* jambs lining the opening */}
      <RoundedBox args={[jamb, D.h, T - 1.2]} radius={R.jamb} position={[D.x0 + jamb / 2 + 0.6, D.h / 2, Z1 + T / 2]} material={trim} {...shadow} />
      <RoundedBox args={[jamb, D.h, T - 1.2]} radius={R.jamb} position={[x1 - jamb / 2 - 0.6, D.h / 2, Z1 + T / 2]} material={trim} {...shadow} />
      <RoundedBox args={[D.w - 1.2, jamb, T - 1.2]} radius={R.jamb} position={[(D.x0 + x1) / 2, D.h - jamb / 2 - 0.6, Z1 + T / 2]} material={trim} {...shadow} />
      {/* casing on the room side */}
      <RoundedBox args={[c, D.h + c, 16]} radius={R.casing} position={[D.x0 - c / 2, (D.h + c) / 2, Z1 - 8]} material={trim} {...shadow} />
      <RoundedBox args={[c, D.h + c, 16]} radius={R.casing} position={[x1 + c / 2, (D.h + c) / 2, Z1 - 8]} material={trim} {...shadow} />
      <RoundedBox args={[D.w + 2 * c, c, 16]} radius={R.casing} position={[(D.x0 + x1) / 2, D.h + c / 2, Z1 - 8]} material={trim} {...shadow} />
      <Slab trim={trim} metal={metal} />
      {/* light switch on the latch side */}
      <RoundedBox args={[72, 116, 7]} radius={3} position={[x1 + c + 110, 1220, Z1 - 3.5]} material={plate} />
      <RoundedBox args={[34, 56, 8]} radius={2} position={[x1 + c + 110, 1220, Z1 - 8]} material={plate} />
      {/* the hallway beyond: a dim box you see when the door is open */}
      <mesh position={[(hallX0 + hallX1) / 2, ROOM.h / 2, Z1 + T + ROOM.hall.depth / 2]} material={hallWall}>
        <boxGeometry args={[hallX1 - hallX0, ROOM.h, ROOM.hall.depth]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(hallX0 + hallX1) / 2, 0.6, Z1 + T / 2 + ROOM.hall.depth / 2]} material={hallFloor} receiveShadow>
        <planeGeometry args={[hallX1 - hallX0, ROOM.hall.depth + T]} />
      </mesh>
    </group>
  )
}

/** The door leaf on its hinges. */
function Slab({ trim, metal }: { trim: MeshStandardMaterial; metal: MeshStandardMaterial }) {
  const hinge = useRef<Group>(null)
  const solid = useRef<Group>(null) // the door's collider follows this
  const swing = useRef<Spring>({ x: 0, v: 0 })
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const w = D.w - 2 * 18 - 6 // between the jambs, with a small gap
  const h = D.h - 18 - 12
  const x0 = D.x0 + 18 + 3
  useFrame((_, dt) => {
    if (!hinge.current) return
    hinge.current.rotation.y = stepSpring(swing.current, open ? D.swing : hover ? 0.06 : 0, dt, 50, 11)
  })
  const handle = (side: 1 | -1) => (
    // side -1 = room side (-Z face of the slab), +1 = hallway side
    <group position={[w - 70, D.handleY, side < 0 ? -2 : D.t + 2]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={metal}>
        <cylinderGeometry args={[27, 27, 10, 24]} />
      </mesh>
      <mesh position={[0, 0, side * 22]} rotation={[Math.PI / 2, 0, 0]} material={metal}>
        <cylinderGeometry args={[9, 11, 40, 16]} />
      </mesh>
      <RoundedBox args={[118, 17, 13]} radius={6} smoothness={3} position={[-52, 0, side * 40]} material={metal} />
    </group>
  )
  return (
    <group ref={hinge} position={[x0, 12, Z1 + 3]}>
      <group ref={solid} position={[w / 2, h / 2, D.t / 2]} />
      <FollowCollider target={solid} half={[w / 2, h / 2, D.t / 2]} />
      <group
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = 'auto'
        }}
      >
        <RoundedBox args={[w, h, D.t]} radius={R.slab} smoothness={3} position={[w / 2, h / 2, D.t / 2]} material={trim} {...shadow} />
        {handle(-1)}
        {handle(1)}
      </group>
      {/* hinge knuckles on the west edge */}
      {[260, h / 2 + 100, h - 260].map((y) => (
        <mesh key={y} position={[-1, y, -2]} material={metal}>
          <cylinderGeometry args={[6.5, 6.5, 90, 12]} />
        </mesh>
      ))}
    </group>
  )
}
