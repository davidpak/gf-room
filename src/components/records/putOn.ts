import { leaveCrate } from './browse'
import { cancelChange } from './changer'
import { getDeck, setDeck } from './deck'
import { lift, needle } from './play'
import type { Pressing } from './vinyl'

/** a record onto the platter (that disc, that side up; the one there, if any, back in its jacket): it comes down
 *  onto the spindle (./Turntable's Flip) */
export function putOn(p: Pressing, disc = 0, face: 0 | 1 = 0) {
  cancelChange()
  lift()
  needle.runout = false
  needle.ended = false
  leaveCrate()
  setDeck({ on: { p, disc, face }, arm: { a: getDeck().arm.a, down: false }, lid: true })
}
