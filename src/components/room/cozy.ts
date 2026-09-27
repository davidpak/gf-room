import { useSyncExternalStore } from 'react'
import { Object3D } from 'three'

/**
 * The room's two switches: the desk lamp, and the string lights (plugged into the outlet in the
 * lamp's base). Click either to toggle. Also holds the lamp's plug point, so the cords can find it
 * as the desk rises and falls.
 */
type Cozy = { lamp: boolean; strings: boolean }
let state: Cozy = { lamp: true, strings: true }
const subs = new Set<() => void>()

export const cozy = {
  get: () => state,
  toggle(k: keyof Cozy) {
    state = { ...state, [k]: !state[k] }
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => void subs.delete(f)
  },
  /** where cords meet the lamp base (updated by the lamp; world space) */
  plug: new Object3D(),
}

export function useCozy() {
  return useSyncExternalStore(cozy.subscribe, cozy.get)
}
