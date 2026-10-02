import { useSyncExternalStore } from 'react'

/** The desk lamp's switch: click the lamp to toggle it. */
type Cozy = { lamp: boolean }
let state: Cozy = { lamp: true }
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
}

export function useCozy() {
  return useSyncExternalStore(cozy.subscribe, cozy.get)
}
