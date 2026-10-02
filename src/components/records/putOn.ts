import { leaveCrate } from './browse'
import { cancelChange } from './changer'
import { getDeck, now, setDeck, sideUp } from './deck'
import { bandStarts, lift, needle } from './play'
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

/** a record put on and played: once it's down on the spindle, the player on and the needle at its first song */
export function playOn(p: Pressing, disc = 0) {
  putOn(p, disc, 0)
  const on = getDeck().on
  setTimeout(() => {
    const d = getDeck()
    // (something else done meanwhile: another record, the arm in hand)
    if (d.on !== on || !d.on || d.held) return
    const a = bandStarts(sideUp(d.on))[0]
    if (a == null) return
    setDeck({ power: true, poweredAt: d.power ? d.poweredAt : now(), arm: { a, down: true } })
  }, 1250)
}
