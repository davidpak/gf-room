import { useSyncExternalStore } from 'react'

/**
 * The record player's state (./Eastwood draws it, ./play makes the music follow it): on or off, the lid, the mode
 * the small knob's on, the volume, what's on the platter (which disc of which pressing, which side up), and the arm:
 * where it's swung to, up or down.
 *
 * What moves every frame (the arm's angle and lift, the platter's turn) is in `live`, eased toward the state's
 * targets by the model; the state is what's been asked for.
 */
import type { Pressing } from './vinyl'

export type OnPlatter = { p: Pressing; disc: number; face: 0 | 1 } // (face 0: the disc's first side up)
export type Deck = {
  power: boolean
  poweredAt: number // (s: the display says HI for a moment)
  lid: boolean // (open)
  mode: 'phono' | 'bt'
  volume: number // 0..1
  on: OnPlatter | null
  /** the arm: `a` its angle (radians, from its rest toward the spindle), down on the record or up */
  arm: { a: number; down: boolean }
  /** dragging the arm: it follows the hand, up */
  held: boolean
  pressed: Record<string, number>
}
let s: Deck = { power: false, poweredAt: -10, lid: true, mode: 'phono', volume: 0.6, on: null, arm: { a: 0, down: false }, held: false, pressed: {} }
const subs = new Set<() => void>()
export const setDeck = (o: Partial<Deck>) => {
  s = { ...s, ...o }
  subs.forEach((f) => f())
}
export const getDeck = () => s
export const useDeck = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getDeck)
export const now = () => performance.now() / 1000
export const press = (k: string) => setDeck({ pressed: { ...s.pressed, [k]: now() } })

/** the moving parts, as they are this frame (`wide`: a record's going on or being turned over: the lid's swung
 *  back past upright, out of its way) */
export const live = { a: 0, lift: 1, spin: 0, turn: 0, lid: 1, wide: false }

/** the side up on the platter */
export const sideUp = (o: OnPlatter) => o.p.sides[2 * o.disc + o.face]
