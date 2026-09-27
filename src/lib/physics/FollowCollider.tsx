import { useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Quaternion, Vector3, type Object3D } from 'three'

/**
 * A solid box that follows something that moves on its own (a sliding mirror door, a drawer, the
 * swinging bedroom door, a lamp riding the desk). Each frame it copies `target`'s world position
 * and rotation onto a kinematic body, so the doll and pillows bump into the thing where it
 * actually is. Put `target` (an empty group) at the centre of the moving part; `half` is the box's
 * half size in the target's frame; or give it colliders as children (placed in the target's frame)
 * for another shape. Needs a <Physics> ancestor.
 */
const _p = new Vector3()
const _q = new Quaternion()

export function FollowCollider({ target, half, children }: { target: RefObject<Object3D | null>; half?: [number, number, number]; children?: ReactNode }) {
  const body = useRef<RapierRigidBody>(null)
  useFrame(() => {
    const t = target.current
    const b = body.current
    if (!t || !b) return
    t.getWorldPosition(_p)
    t.getWorldQuaternion(_q)
    b.setNextKinematicTranslation(_p)
    b.setNextKinematicRotation(_q)
  })
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false}>
      {children ?? (half && <CuboidCollider args={half} friction={0.8} />)}
    </RigidBody>
  )
}
