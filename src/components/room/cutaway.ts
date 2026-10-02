import { useSyncExternalStore } from 'react'

/**
 * Which sides of the room are cut away right now (the camera is outside them): a dollhouse.
 * ./Shell hides the walls itself (no re-render); anything else that has to change with a wall
 * (the closet grows its own back when the south wall goes) subscribes with useCutaway().
 */
export type Cut = { north: boolean; east: boolean; south: boolean; west: boolean; ceiling: boolean }
let state: Cut = { north: false, east: false, south: false, west: false, ceiling: false }
const subs = new Set<() => void>()

export const cutaway = {
  get: () => state,
  set(next: Cut) {
    if (next.north === state.north && next.east === state.east && next.south === state.south && next.west === state.west && next.ceiling === state.ceiling) return
    state = next
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => subs.delete(f)
  },
}

export function useCutaway() {
  return useSyncExternalStore(cutaway.subscribe, cutaway.get)
}
