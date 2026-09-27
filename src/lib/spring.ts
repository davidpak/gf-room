/**
 * Tiny damped spring. Unlike an ease, it can overshoot a little and settle,
 * which is what makes drawers and cushions feel physical.
 *   stiffness: higher = snappier   damping: higher = less bounce
 */
export type Spring = { x: number; v: number }

export function stepSpring(s: Spring, target: number, dt: number, stiffness = 170, damping = 18) {
  const h = Math.min(dt, 1 / 30) // clamp so a dropped frame can't explode the spring
  const a = -stiffness * (s.x - target) - damping * s.v
  s.v += a * h
  s.x += s.v * h
  return s.x
}
