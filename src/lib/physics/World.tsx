import { Waiting } from '../ready'
import { Suspense, useEffect, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, Physics, RigidBody, useBeforePhysicsStep } from '@react-three/rapier'
import { Hand } from './Hand'

/**
 * The toy physics world for every stage: soft, comfortable, a little unrealistic (Bruno's folio
 * floats too). Millimetres throughout; lengthUnit 1000 tells Rapier its tolerances are in mm.
 *
 *   gravity        about 0.3 g (3000 mm/s²): things drift down and land gently
 *   tolerances     things sink at most 0.4 mm into each other (thin cables sit on the desk, not in it)
 *   solver         8 iterations of 2 passes: long jointed chains (cables) stay steady and firm
 *   drawing        physics steps first in every frame, then everything is drawn blended between the
 *                  last two steps (smooth at any refresh rate, whatever the step): component bodies by
 *                  the library, hand-made ones (a cable's links, its plugs) with stepAlpha()
 *   timeStep       1/60 s; stages with a cable step at 1/120 (thin fast links never skip through things)
 *   contacts       (contactFrequency, else by the step) firm at 1/120 steps (natural frequency 240: a cable carrying a hanging charger over the
 *                  desk's edge doesn't sink into it, where the default 30 lets it sink 3 mm and more); 30 at 1/60
 *   the hand       every stage can pick things up the same way (./Hand): anything wrapped in
 *                  <Holdable> (or marked with `grabbable`) is carried, turned, lifted with the same
 *                  controls everywhere. Pages give their camera the shared bindings (ToyControls)
 *
 * Includes a big solid floor at y = floorY (0 unless given).
 */
export const TOY_PHYSICS = { gravity: 3000, allowedLinearError: 0.0004, solverIterations: 8, interpolate: true }
const PHYSICS_PRIORITY = -50 // before every other frame callback: the hand and the drawing see this frame's steps

/** the step clock: frame time against steps taken, so hand-made bodies blend exactly as the library's */
const clock = { total: 0, steps: 0, ts: 1 / 60 }
/** how far this frame is between the last physics step and the next (0..1): draw a hand-made body at
 *  its pose before the last step blended toward its pose now by this much */
/** seconds per physics step, now */
export const stepTime = () => clock.ts
export const stepAlpha = () => (clock.total - clock.steps * clock.ts) / clock.ts
function StepClock({ timeStep }: { timeStep: number }) {
  useEffect(() => {
    clock.total = 0
    clock.steps = 0
    clock.ts = timeStep
  }, [timeStep])
  useBeforePhysicsStep(() => {
    clock.steps++
  })
  useFrame((_, dt) => {
    clock.total += Math.min(dt, 0.5) // (as the library counts it)
    // keep in step with the library's own count, should they ever drift apart
    const lead = clock.total - clock.steps * clock.ts
    if (lead < 0) clock.total = clock.steps * clock.ts
    else if (lead >= clock.ts) clock.total = clock.steps * clock.ts + clock.ts * 0.999
  }, PHYSICS_PRIORITY + 1)
  return null
}

export function World({
  children,
  debug = false,
  floorY = 0,
  solverIterations = TOY_PHYSICS.solverIterations,
  interpolate = TOY_PHYSICS.interpolate,
  allowedLinearError = TOY_PHYSICS.allowedLinearError,
  gravity = TOY_PHYSICS.gravity,
  hand = true,
  timeStep = 1 / 60,
  contactFrequency,
}: {
  children: ReactNode
  debug?: boolean
  floorY?: number
  solverIterations?: number
  interpolate?: boolean
  /** how far things may sink into each other before being pushed apart, x lengthUnit (0.001 = 1 mm) */
  allowedLinearError?: number
  /** mm/s² downward: 9810 is real */
  gravity?: number
  /** the shared hand for picking things up (on unless a stage handles pointers itself) */
  hand?: boolean
  /** seconds per physics step (smaller: steadier cables, more work) */
  timeStep?: number
  /** how firm contacts are (natural frequency): 240 at fine steps, 30 at 1/60, unless given */
  contactFrequency?: number
}) {
  return (
    // the engine loads as WebAssembly: everything outside the world renders while it arrives
    <Suspense fallback={<Waiting />}>
      <Physics gravity={[0, -gravity, 0]} lengthUnit={1000} debug={debug} numSolverIterations={solverIterations} numInternalPgsIterations={2} contactNaturalFrequency={contactFrequency ?? (timeStep < 1 / 90 ? 240 : 30)} timeStep={timeStep} interpolate={interpolate} updatePriority={PHYSICS_PRIORITY} allowedLinearError={allowedLinearError}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[6000, 50, 6000]} position={[0, floorY - 50, 0]} friction={0.9} />
        </RigidBody>
        <StepClock timeStep={timeStep} />
        {hand ? <Hand>{children}</Hand> : children}
      </Physics>
    </Suspense>
  )
}
