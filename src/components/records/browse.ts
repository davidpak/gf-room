import { useSyncExternalStore } from 'react'
import { Vector3, type Object3D } from 'three'
import { frameAround, getLook, lookAt, type Spot } from '../quad/look'
import { getShelf, pressIn } from './shelf'
import type { CrateId } from './library'
import type { Pressing } from './vinyl'

/**
 * Going through a crate, two steps in (the Quad's way of looking: ../quad/look, the camera gliding in):
 *
 *   a crate     click it: the camera comes in over it, the front record rises out of it; A / D or ← / → bring up
 *               the one before, after (the one up sinks back)
 *   a record    Enter, Space, or a click on the one up: it comes out, up in front of the crate, its record (both,
 *               for a double album) sliding out of its jacket, and the camera comes in to it; A / D go on to the
 *               next one out. Click one of its records: it comes out of the jacket for real (./Loose), to be
 *               carried to the turntable
 *   back        Esc: the record back in the crate, then the crate left
 */
export type Browse = { mode: 'none' | 'crate' | 'out'; crate: CrateId | null; i: number }
let s: Browse = { mode: 'none', crate: null, i: 0 }
const subs = new Set<() => void>()
const set = (o: Partial<Browse>) => {
  s = { ...s, ...o }
  subs.forEach((f) => f())
}
export const getBrowse = () => s
export const useBrowse = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getBrowse)

/** the spot above the crates, if they're part of one (the Quad's record stand): Esc from a crate, and taking a
 *  record out, go back to it rather than to the car */
let parent: Spot | null = null
export const setBrowseParent = (p: Spot | null) => void (parent = p)

/** each crate's place in the world, and where a record taken out of it stands (for framing them) */
export const crateRefs = new Map<CrateId, { crate: Object3D | null; out: Object3D | null }>()
const records = (): Pressing[] => (s.crate ? getShelf().crates[s.crate] : []) ?? []
/** the record up (or out) now */
export const recordUp = () => (s.mode === 'none' ? null : (records()[s.i] ?? null))

const _c = new Vector3()
const _n = new Vector3()
const _k = new Vector3()
/** (the camera let down a little, so what's framed sits high, clear of what the page writes under it) */
const lower = (pos: Vector3, at: Vector3, h: number) => {
  pos.y -= h * 0.22
  at.y -= h * 0.22
}
const toward = (o: Object3D, up: number) => _n.set(0, up, 1).normalize().transformDirection(o.matrixWorld)

export const crateSpot: Spot = {
  key: 'crate',
  items: [],
  hint: 'A / D or ← → to flip through · Enter or click to take one out',
  frame: (pos, at, aspect) => {
    const o = s.crate && crateRefs.get(s.crate)?.crate
    if (!o) return
    // (from the crate's own place: its records moving in it don't move the camera; its size whatever it's drawn at)
    o.updateWorldMatrix(true, false)
    const k = o.getWorldScale(_k).x
    o.getWorldPosition(_c)
    _c.y += 330 * k
    frameAround(pos, at, aspect, _c, 600 * k, 660 * k, toward(o, 0.55))
    lower(pos, at, 300 * k)
  },
  keys: (e) => {
    if (e.key === 'Escape' && parent) {
      leaveCrate()
      return true
    }
    return step(e) || (e.key === 'Enter' || e.key === ' ' ? (takeOut(s.i), true) : false)
  },
  get back() {
    return parent ? 'back to the stand' : undefined
  },
}
export const recordSpot: Spot = {
  key: 'record',
  items: [],
  hint: 'click a record to take it out of its jacket · A / D for the next one',
  back: 'put it back',
  frame: (pos, at, aspect) => {
    const o = s.crate && crateRefs.get(s.crate)?.out
    if (!o) return
    o.updateWorldMatrix(true, false)
    const k = o.getWorldScale(_k).x
    o.getWorldPosition(_c)
    const p = recordUp()
    const wide = (p && p.sides.length > 2 ? 760 : 660) * k
    frameAround(pos, at, aspect, _c, wide, 480 * k, toward(o, 0.18))
    lower(pos, at, 260 * k)
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
  const n = records().length
  if (n) set({ i: (s.i + by + n) % n })
  return true
}

/** into a crate (the record up: the one there was, if it's the same crate, or the front one) */
export function openCrate(crate: CrateId, i = crate === s.crate ? s.i : 0) {
  const n = getShelf().crates[crate]?.length ?? 0
  set({ mode: 'crate', crate, i: Math.max(0, Math.min(n - 1, i)) })
  lookAt({ spot: crateSpot, i: null })
}
export function takeOut(i: number) {
  const p = records()[i]
  if (!p) return
  // (a jacket only: its record pressed now, its songs asked for)
  if (p.stub && s.crate) void pressIn(s.crate, p.uri)
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
  const k = getLook()?.spot.key
  if (k === 'crate' || k === 'record') lookAt(parent ? { spot: parent, i: null } : null)
}
/** the look's gone elsewhere (Esc from the crate, a click on nothing, the car driven off): the crate let go too */
export function lookMoved() {
  const k = getLook()?.spot.key
  if (s.mode !== 'none' && k !== 'crate' && k !== 'record') set({ mode: 'none' })
}
