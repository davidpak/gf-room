import { useSyncExternalStore } from 'react'

/**
 * What's plugged in: the lamp and the desk only work while their cords are in the wall. Pages
 * without cords leave everything on.
 */
type Power = { lamp: boolean; desk: boolean }
let state: Power = { lamp: true, desk: true }
const subs = new Set<() => void>()

export const power = {
  get: () => state,
  set(k: keyof Power, on: boolean) {
    if (state[k] === on) return
    state = { ...state, [k]: on }
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => void subs.delete(f)
  },
}

export function usePower() {
  return useSyncExternalStore(power.subscribe, power.get)
}
