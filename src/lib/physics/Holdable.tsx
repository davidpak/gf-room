import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, type RapierRigidBody, type RigidBodyProps } from '@react-three/rapier'
import { Group, Vector3, type Object3D } from 'three'
import { grabbable, type GrabSpec } from './Hand'
import { thump } from '../sound/thump'
import { fastHitsUnder } from '../render/fastHits'

/**
 * Any item you can pick up, the one way for the whole world. Wrap its meshes (and colliders):
 *
 *   <Holdable position={[...]} colliders="hull" lift={40}> ...meshes </Holdable>
 *
 * and it gets the shared hand (./Hand, inside every <World>): left-drag carries it, right-drag
 * turns it in place, both together switch, the wheel lifts / tilts, Q/E R/F Z/C turn it while
 * carried, the hand lends it grip weight, it floats down softly when let go, a marker shows where it
 * will land. Plus: a thump on impact scaled by how hard it hit (`sound`, `onImpact` for squash etc.),
 * and it respawns where it started if it ever falls out of the world.
 *
 * `hold` passes the rest of the hand's options (lift, spring, free, keep, mark, onGrab / onRelease
 * for magnets and such); `bodyRef` gets the Rapier body.
 */
type Props = Omit<RigidBodyProps, 'children'> & {
  children: ReactNode
  /** how it's held: lift, spring, free, keep, mark, turn, onGrab, onRelease... (see GrabSpec) */
  hold?: Omit<GrabSpec, 'body'>
  sound?: 'soft' | 'hard' | 'none'
  onImpact?: (strength: number) => void
  bodyRef?: { current: RapierRigidBody | null }
}

const IMPACT_MIN = 0.06 // ignore micro-contacts while resting (they would jitter squash effects)

export function Holdable({ children, hold, sound = 'hard', onImpact, bodyRef, position, ...rb }: Props) {
  const body = useRef<RapierRigidBody>(null)
  const spawn = useMemo(() => (position ? new Vector3(...(position as [number, number, number])) : new Vector3()), [position])
  const holdRef = useRef(hold)
  holdRef.current = hold
  // one spec for the item's life; its callbacks read the latest props
  const spec = useMemo(
    () =>
      grabbable({
        body: () => body.current,
        get lift() {
          return holdRef.current?.lift
        },
        get spring() {
          return holdRef.current?.spring
        },
        get free() {
          return holdRef.current?.free
        },
        get turn() {
          return holdRef.current?.turn
        },
        get mark() {
          return holdRef.current?.mark
        },
        get pull() {
          return holdRef.current?.pull
        },
        get box() {
          return holdRef.current?.box
        },
        keep: () => holdRef.current?.keep?.() ?? true,
        onGrab: (b: RapierRigidBody, point: Vector3, object: Object3D) => holdRef.current?.onGrab?.(b, point, object),
        onRelease: (b: RapierRigidBody) => holdRef.current?.onRelease?.(b),
      }),
    [],
  )

  // its meshes are rigid: hit-test them through bounds trees (heavy items stay fast to point at)
  const group = useRef<Group>(null)
  useEffect(() => {
    if (group.current) fastHitsUnder(group.current)
  }, [])

  // out of the world: back where it started
  useFrame(() => {
    const b = body.current
    if (!b || b.translation().y > -2000) return
    b.setTranslation(spawn, true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: 0 }, true)
  })

  return (
    <RigidBody
      ref={(b) => {
        body.current = b
        if (bodyRef) bodyRef.current = b
      }}
      position={position}
      friction={0.9}
      restitution={0}
      linearDamping={0.6}
      angularDamping={1}
      {...rb}
      onCollisionEnter={() => {
        const b = body.current
        if (!b) return
        const v = b.linvel()
        const s = Math.min(1, Math.hypot(v.x, v.y, v.z) / 1200)
        if (s < IMPACT_MIN) return
        if (sound !== 'none') thump(s, sound)
        onImpact?.(s)
      }}
    >
      <group ref={group} {...spec}>
        {children}
      </group>
    </RigidBody>
  )
}
