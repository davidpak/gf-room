import { CuboidCollider } from '@react-three/rapier'
import { Glider } from '../lime/Glider'
import { Scooter } from '../lime/Scooter'
import { LiveProp } from './Physical'
import { SET } from './set'
import type { CarState } from './Car'
import { Static } from '../../lib/render/Static'

/**
 * Lime's rentals on the Quad (../lime): Gliders and scooters parked on the walks, on their kickstands, loose things the car
 * can knock over (a prompt stands each back up). At the benches' toy scale, 0.24.
 */
const K = 0.24
const PAVING = 25
/** a Glider's body as a box (its frame: the rear axle on the ground at the origin, forward +x) */
const BOX = { x0: -250, x1: 1370, y1: 760, w: 300 }
/** a scooter's: its deck and frame low down, its stem up at the front */
const SC = { x0: -215, x1: 1190, y1: 600, w: 150, stem: { x: 900, y: 860, h: 260, w: 120 } }

export function QuadLime({ car }: { car: { current: CarState } }) {
  return (
    <>
      {SET.lime.gliders.map((g, i) => (
        <LiveProp key={i} id={`glider${i}`} label="Stand the Glider up" at={{ x: g.x, y: PAVING, z: g.z, rot: g.rot }} car={car} lift={0} feelAlong={[0, 0.5 * (BOX.x1 + BOX.x0) * K, BOX.x1 * K * 0.9]} feelR={(BOX.w / 2) * K}>
          <group scale={K}>
            <Static>
              <Glider />
            </Static>
          </group>
          <CuboidCollider args={[((BOX.x1 - BOX.x0) / 2) * K, (BOX.y1 / 2) * K, (BOX.w / 2) * K]} position={[((BOX.x1 + BOX.x0) / 2) * K, (BOX.y1 / 2) * K, 0]} mass={1.2} friction={0.8} />
        </LiveProp>
      ))}
      {SET.lime.scooters.map((g, i) => (
        <LiveProp key={i} id={`scooter${i}`} label="Stand the scooter up" at={{ x: g.x, y: PAVING, z: g.z, rot: g.rot }} car={car} lift={0} feelAlong={[0, 0.5 * (SC.x1 + SC.x0) * K, SC.x1 * K * 0.9]} feelR={(SC.w / 2) * K}>
          <group scale={K}>
            <Static>
              <Scooter detail={2} />
            </Static>
          </group>
          <CuboidCollider args={[((SC.x1 - SC.x0) / 2) * K, (SC.y1 / 2) * K, (SC.w / 2) * K]} position={[((SC.x1 + SC.x0) / 2) * K, (SC.y1 / 2) * K, 0]} mass={0.8} friction={0.8} />
          <CuboidCollider args={[50 * K, SC.stem.h * K, (SC.stem.w / 2) * K]} position={[SC.stem.x * K, SC.stem.y * K, 0]} mass={0.2} friction={0.8} />
        </LiveProp>
      ))}
    </>
  )
}
