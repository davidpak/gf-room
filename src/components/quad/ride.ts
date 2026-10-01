import { useSyncExternalStore } from 'react'

/**
 * Riding a Lime (./QuadLime): which one's being ridden, and where it is. Click a Lime and you're on it (the car's
 * left where it is, its keys now the Lime's, the camera on the Lime); E or Esc and it's parked where it stands.
 *
 * Its frame as the car's (./Car): x, z on the ground, `heading` 0 toward +z, `v` along it (toy mm, mm/s);
 * `y` the ground under it.
 */
export type Ride = { id: string; x: number; y: number; z: number; heading: number; v: number }

let ride: Ride | null = null
const subs = new Set<() => void>()
const tell = () => subs.forEach((f) => f())

/** the Lime being ridden, now (read every frame: the same object, moved) */
export const getRide = () => ride
export function useRide() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => ride,
  )
}
/** on: a Lime, from where it stands */
export function hopOn(r: Ride) {
  ride = r
  tell()
}
/** off: it's parked where it is */
export function hopOff() {
  if (!ride) return
  ride = null
  tell()
}
