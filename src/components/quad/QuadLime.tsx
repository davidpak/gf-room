import { CuboidCollider } from '@react-three/rapier'
import { Glider } from '../lime/Glider'
import { LiveProp } from './Physical'
import { SET } from './set'
import type { CarState } from './Car'

/**
 * Lime's rentals on the Quad (../lime): Gliders parked on the walks, on their kickstands, loose things the car
 * can knock over (a prompt stands each back up). At the benches' toy scale, 0.24.
 */
const K = 0.24
const PAVING = 25
/** a Glider's body as a box (its frame: the rear axle on the ground at the origin, forward +x) */
const BOX = { x0: -250, x1: 1370, y1: 760, w: 300 }

export function QuadLime({ car }: { car: { current: CarState } }) {
  return (
    <>
      {SET.lime.gliders.map((g, i) => (
        <LiveProp key={i} id={`glider${i}`} label="Stand the Glider up" at={{ x: g.x, y: PAVING, z: g.z, rot: g.rot }} car={car} lift={0} feelAlong={[0, 0.5 * (BOX.x1 + BOX.x0) * K, BOX.x1 * K * 0.9]} feelR={(BOX.w / 2) * K}>
          <group scale={K}>
            <Glider />
          </group>
          <CuboidCollider args={[((BOX.x1 - BOX.x0) / 2) * K, (BOX.y1 / 2) * K, (BOX.w / 2) * K]} position={[((BOX.x1 + BOX.x0) / 2) * K, (BOX.y1 / 2) * K, 0]} mass={1.2} friction={0.8} />
        </LiveProp>
      ))}
    </>
  )
}
