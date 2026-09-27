import { useSyncExternalStore } from 'react'

/**
 * Using the laptop: the camera's in front of its screen and RinaOS has the pointer and the keys.
 * One laptop, one switch; anything can read it (the laptop, its camera, the hand) or flip it.
 */
let active = false
const subs = new Set<() => void>()
export const osMode = {
  get: () => active,
  set(v: boolean) {
    if (active === v) return
    active = v
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => void subs.delete(f)
  },
}
export const useOsMode = () => useSyncExternalStore(osMode.subscribe, osMode.get)
