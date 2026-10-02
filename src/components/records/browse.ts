import { useSyncExternalStore } from 'react'
import { Vector3, type Object3D } from 'three'
import { frameAround, getLook, lookAt, type Spot } from '../quad/look'
import type { Pressing } from './vinyl'

/**
 * Going through the crate, two steps in (the Quad's way of looking: ../quad/look, the camera gliding in):
 *
 *   the crate   click it: the camera comes in over it, the front record rises out of it; A / D or ← / → bring up
 *               the one before, after (the one up sinks back)
 *   a record    Enter, Space, or a click on the one up: it comes out, up in front of the crate, its record (both,
 *               for a double album) sliding out of its jacket, and the camera comes in to it; A / D go on to the
 *               next one out. Click one of its records: it's put on the turntable (the camera goes back out)
 *   back        Esc: the record back in the crate, then the crate left
 */
export type Browse = { mode: 'none' | 'crate' | 'out'; i: number }
let s: Browse = { mode: 'none', i: 0 }
const subs = new Set<() => void>()
const set = (o: Partial<Browse>) => {
  s = { ...s, ...o }
  subs.forEach((f) => f())
}
export const getBrowse = () => s
export const useBrowse = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getBrowse)

/** the crate's records, and the crate and the out record's place in the world (for framing them) */
export const browseRefs = { records: [] as Pressing[], crate: null as Object3D | null, out: null as Object3D | null }

const _c = new Vector3()
const _n = new Vector3()
/** (the camera let down a little, so what's framed sits high, clear of what the page writes under it) */
const lower = (pos: Vector3, at: Vector3, h: number) => {
  pos.y -= h * 0.22
  at.y -= h * 0.22
}
const toward = (o: Object3D, up: number) => _n.set(0, up, 1).normalize().transformDirection(o.matrixWorld)

export const crateSpot: Spot = {
  key: 'crate',
  items: [],
  hint: 'A / D or ← → to flip through · Enter or click to take one out · Esc to step back',
  frame: (pos, at, aspect) => {
    const o = browseRefs.crate
    if (!o) return
    // (from the crate's own place: its records moving in it don't move the camera)
    o.updateWorldMatrix(true, false)
    o.getWorldPosition(_c)
    _c.y += 260
    frameAround(pos, at, aspect, _c, 560, 520, toward(o, 0.75))
    lower(pos, at, 520)
  },
  keys: (e) => step(e) || (e.key === 'Enter' || e.key === ' ' ? (takeOut(s.i), true) : false),
}
export const recordSpot: Spot = {
  key: 'record',
  items: [],
  hint: 'click a record to put it on · A / D for the next one · Esc to put it back',
  frame: (pos, at, aspect) => {
    const o = browseRefs.out
    if (!o) return
    o.updateWorldMatrix(true, false)
    o.getWorldPosition(_c)
    const p = browseRefs.records[s.i]
    const wide = p && p.sides.length > 2 ? 760 : 660
    frameAround(pos, at, aspect, _c, wide, 400, toward(o, 0.18))
    lower(pos, at, 400)
  },
  keys: (e) => {
    if (e.key === 'Escape') {
      backToCrate()
      return true
    }
    return step(e)
  },
}

function step(e: KeyboardEvent) {
  const by = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ? -1 : e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' ? 1 : 0
  if (!by) return false
  const n = browseRefs.records.length
  if (n) set({ i: (s.i + by + n) % n })
  return true
}

/** into the crate (the record up: the one there was, or the front one) */
export function openCrate(i = s.i) {
  set({ mode: 'crate', i: Math.max(0, Math.min(browseRefs.records.length - 1, i)) })
  lookAt({ spot: crateSpot, i: null })
}
export function takeOut(i: number) {
  set({ mode: 'out', i })
  lookAt({ spot: recordSpot, i: null })
}
export function backToCrate() {
  set({ mode: 'crate' })
  lookAt({ spot: crateSpot, i: null })
}
/** out of the crate altogether */
export function leaveCrate() {
  set({ mode: 'none' })
  if (getLook()?.spot.key === 'crate' || getLook()?.spot.key === 'record') lookAt(null)
}
// (the look let go some other way, Esc from the crate: the crate let go too)
if (typeof window !== 'undefined')
  window.addEventListener('keydown', () => {
    queueMicrotask(() => {
      const k = getLook()?.spot.key
      if (s.mode !== 'none' && k !== 'crate' && k !== 'record') set({ mode: 'none' })
    })
  })
