import type { ReactNode } from 'react'
import type { RapierRigidBody, RigidBodyProps } from '@react-three/rapier'
import type { Vector3 } from 'three'
import { Holdable } from './Holdable'

/**
 * The pillows' way in to the shared hand (older API, kept so they didn't have to change): the same
 * as <Holdable>, with a big lift (pillows are big), `onGrab` given the pressed point in the pressed
 * mesh's own frame (for the pillow's squish), and a soft thump by default. New items use Holdable.
 */
type Props = Omit<RigidBodyProps, 'children'> & {
  children: ReactNode
  sound?: 'soft' | 'hard' | 'none'
  onImpact?: (strength: number) => void
  onGrab?: (localPoint: Vector3, object: THREE_Object) => void
  onRelease?: () => void
  /** carry spring: lower k / c = softer, laggier, swingier */
  spring?: { k: number; c: number }
  /** how far it rises when picked up (mm) */
  lift?: number
  bodyRef?: { current: RapierRigidBody | null }
}
type THREE_Object = import('three').Object3D

export function Grabbable({ children, sound = 'soft', onImpact, onGrab, onRelease, spring, lift = 120, bodyRef, ...rb }: Props) {
  return (
    <Holdable
      {...rb}
      sound={sound}
      onImpact={onImpact}
      bodyRef={bodyRef}
      hold={{
        lift,
        spring,
        onGrab: (_b, point, object) => onGrab?.(object.worldToLocal(point.clone()), object),
        onRelease: () => onRelease?.(),
      }}
    >
      {children}
    </Holdable>
  )
}
