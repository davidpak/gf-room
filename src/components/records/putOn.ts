import { frontUp, leaveCrate } from './browse'
import { cancelChange } from './changer'
import { getDeck, live, now, setDeck, sideUp } from './deck'
import { EW } from './victrola'
import { bandStarts, lift, needle } from './play'
import { toFront } from './shelf'
import type { Pressing } from './vinyl'

/** a record onto the platter (that disc, that side up; the one there, if any, back in its jacket): the arm lifted
 *  and swung home first, the lid swung wide; the record comes down onto the spindle once the arm's clear of it
 *  (./Turntable's Flip) */
export function putOn(p: Pressing, disc = 0, face: 0 | 1 = 0) {
  cancelChange()
  lift()
  needle.runout = false
  needle.ended = false
  leaveCrate()
  live.wide = true // (till it's down: ./Turntable's Flip)
  live.landed = ''
  setDeck({ on: { p, disc, face }, arm: { a: EW.arm.rest, down: false }, lid: true })
}

/** a record put on and played: once it's down on the spindle, the player on and the needle at its first song; its
 *  jacket goes back in the front of the crate (empty of that record while it plays: ./Crate) */
export function playOn(p: Pressing, disc = 0) {
  putOn(p, disc, 0)
  // (its jacket back in the front of the crate, the front one up next time: it's the one she'll look for)
  toFront(p.uri)
  frontUp()
  const on = getDeck().on
  // (the needle only over it once it's down on the spindle)
  const t0 = performance.now()
  const wait = setInterval(() => {
    const d = getDeck()
    // (something else done meanwhile: another record, the arm in hand)
    if (d.on !== on || !d.on || d.held || performance.now() - t0 > 8000) return clearInterval(wait)
    if (live.landed !== `${p.uri}/${disc}`) return
    clearInterval(wait)
    const a = bandStarts(sideUp(d.on))[0]
    if (a == null) return
    setDeck({ power: true, poweredAt: d.power ? d.poweredAt : now(), arm: { a, down: true } })
  }, 100)
}
