import { getDeck, live, setDeck, type OnPlatter } from './deck'
import { bandStarts, needle } from './play'
import { EW } from './victrola'

/**
 * The whole album, not just a side: what a person does at the end of side A, done for her. The arm lifts and goes
 * back to its rest, the record's turned over (or, after side B of a double album, the next disc's put on), and the
 * needle's set down at the first song of the next side. ⏭ on a side's last song and ⏮ on its first do the same,
 * across. Anything she does with her own hand meanwhile (the arm, the record, the power) calls it off.
 */
let gen = 0
export const changing = { on: false }
export function cancelChange() {
  gen++
  changing.on = false
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const sideIndex = (o: OnPlatter) => 2 * o.disc + o.face
/** the next (or previous) side with songs on it, from side k */
export function sideFrom(o: OnPlatter, k: number, by: 1 | -1) {
  for (let j = k + by; j >= 0 && j < o.p.sides.length; j += by) if (o.p.sides[j].bands.length) return j
  return null
}

/** turn to side k (the record over, or the other disc), the needle down at its song `band` ('last': its last) */
export async function turnTo(k: number, band: number | 'last') {
  const my = ++gen
  changing.on = true
  const go = () => my === gen
  needle.runout = false
  needle.ended = false
  setDeck({ arm: { a: live.a, down: false }, lid: true })
  await wait(450)
  if (!go()) return
  setDeck({ arm: { a: EW.arm.rest, down: false } })
  await wait(900)
  if (!go()) return
  const o = getDeck().on
  if (!o) return
  setDeck({ on: { ...o, disc: Math.floor(k / 2), face: (k % 2) as 0 | 1 } })
  await wait(2800) // (tipped off the spindle, lifted, turned over, set down: ./Turntable's Flip)
  if (!go()) return
  const starts = bandStarts(o.p.sides[k])
  setDeck({ arm: { a: starts[band === 'last' ? starts.length - 1 : band], down: true } })
  await wait(900)
  if (go()) changing.on = false
}

/** the side's played to its end: on to the next one (after a breath), or, the album over, the arm home */
export async function sideEnded() {
  const o = getDeck().on
  needle.ended = false
  if (!o) return
  const next = sideFrom(o, sideIndex(o), 1)
  const my = ++gen
  await wait(1400)
  if (my !== gen) return
  if (next != null) return turnTo(next, 0)
  setDeck({ arm: { a: live.a, down: false } })
  await wait(450)
  if (my === gen) setDeck({ arm: { a: EW.arm.rest, down: false } })
}
