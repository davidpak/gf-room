import { useSyncExternalStore } from 'react'
import { Vector3, type BoxGeometry, type Mesh } from 'three'

/**
 * Looking at their photos, Bruno's way (his project boards): two steps in.
 *
 *   a spot       click the easel by the bench, or a photo on a clothesline: the camera glides in to take
 *                in the whole spot (the bench and its easel, the whole line)
 *   a photo      then click one of its photos: the camera glides on to frame just that one; ← → step
 *                along to the ones beside it
 *   back         Esc (or a click on nothing) goes back a step: photo → spot → the car
 *
 * `items` are a spot's polaroid meshes (each a box, its face its +z); `frame` says where to stand to take
 * the spot in. The camera itself is ./Car.
 */
export type LookItem = () => Mesh | null
export type Spot = {
  key: string
  items: LookItem[]
  frame: (pos: Vector3, at: Vector3, aspect: number) => void
  /** its own keys while it's looked at (true: taken) */
  keys?: (e: KeyboardEvent) => boolean
  /** its own hint, instead of the photos' */
  hint?: string
  /** what Esc does from it (said in the hint bar: 'back to the car' when not said) */
  back?: string
}
export type Look = { spot: Spot; i: number | null }

let look: Look | null = null
const subs = new Set<() => void>()
export const lookAt = (l: Look | null) => {
  look = l
  subs.forEach((f) => f())
}
export const getLook = () => look
export const useLook = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getLook)
/** a click on a spot's photo `k` (or on the spot itself): in to the spot first, then to the photo */
export const clickSpot = (spot: Spot, k: number | null = null) => lookAt(look?.spot.key === spot.key && k !== null ? { spot, i: k } : { spot, i: look?.spot.key === spot.key ? look.i : null })
/** back a step: from a photo to its spot, from the spot to the car */
export const lookBack = () => lookAt(look && look.i !== null ? { spot: look.spot, i: null } : null)
export const stepLook = (d: number) => {
  if (!look || look.i === null || look.spot.items.length < 2) return
  const n = look.spot.items.length
  lookAt({ spot: look.spot, i: (look.i + d + n) % n })
}

const TAN = Math.tan((15 * Math.PI) / 180) // (half the camera's 30° field of view)
/** where to stand to take in `w` × `h` (mm) round `centre`, looking back along `dir` */
export function frameAround(pos: Vector3, at: Vector3, aspect: number, centre: Vector3, w: number, h: number, dir: Vector3) {
  const d = Math.max(h / (2 * TAN), w / (2 * TAN * aspect)) * 1.12
  at.copy(centre)
  pos.copy(centre).addScaledVector(dir, d)
}

const _n = new Vector3()
const _c = new Vector3()
/** where the camera goes: the spot taken in, or its photo framed square on; false when not looking */
export function lookPose(pos: Vector3, at: Vector3, aspect: number) {
  if (!look) return false
  if (look.i === null) {
    // (a spot with nothing to frame yet, its thing not there this frame, leaves the camera where it is: not gliding
    // off to wherever pos and at last were, nor to the world's middle)
    pos.x = NaN
    look.spot.frame(pos, at, aspect)
    return !Number.isNaN(pos.x)
  }
  const o = look.spot.items[look.i]?.()
  if (!o) return false
  const { width: w, height: h } = (o.geometry as BoxGeometry).parameters
  o.updateWorldMatrix(true, false)
  o.getWorldPosition(_c)
  _n.set(0, 0, 1).transformDirection(o.matrixWorld)
  frameAround(pos, at, aspect, _c, w * 1.25, h * 1.25, _n)
  return true
}

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __look: { lookAt, getLook, stepLook, lookBack } }) // (for trying it from the console)
