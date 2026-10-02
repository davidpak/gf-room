import { LP } from './vinyl'
import { EW } from './victrola'

/**
 * The record stand and its crates, in numbers (./Stand and ./Crate draw them). mm.
 *
 * The crate: her records live in it. Our own (no one crate it copies), sized round a 12" jacket the way record
 * crates are: [LP] the jacket's 314 mm across, a finger's room each side; 200 tall, so the records stand well out of
 * it; low at the front so the covers show; a hand-hole cut through each end. Its frame: its middle, its floor's
 * underside at y 0, the low front toward +z.
 *
 * The stand: a two-tier pine table, the Victrola on top at the left, three crates beside it, four more on the shelf
 * below (the way record stands are: a console table with crates under it). Our own design, sized round what it
 * holds: [EW] the player 322 × 312; a crate 358 wide outside, 278 deep. Its frame: its middle, its feet at y 0, its
 * front toward +z. The crates under the top can't lift a record out where they stand (the top's in the way): going
 * through one, it slides out from under, forward.
 */
export const CRATE = {
  in: { w: LP.sleeve + 16, d: 250 }, // inside
  wall: 14,
  floor: 12,
  h: 200, // ends and back
  front: 120, // the low front
  hole: { w: 90, h: 30, y: 150 }, // the hand-holes in the ends
  lean: 0.1, // radians back
  colors: { pine: '#e3bf8c', pineShade: '#9a7f9a' },
}
const CW = CRATE.in.w + 2 * CRATE.wall // 358
const CD = CRATE.in.d + 2 * CRATE.wall // 278
export const STAND = {
  w: 1600,
  d: 520,
  h: 720, // the top's surface
  top: 30,
  shelf: { y: 150, t: 22, inset: 25 }, // (its top surface at y 172)
  leg: { s: 50, inset: 20 },
  apron: { h: 70, t: 20 },
  /** what stands on it, x along it (z 0 unless said) */
  player: { x: -580, z: 10 },
  topCrates: [-205, 175, 555] as number[], // On Repeat, Saved, Dig
  shelfCrates: [-543, -181, 181, 543] as number[], // This Year, All-Time, Played Lately, Playlists
  slide: 400, // how far forward a shelf crate comes out to be gone through
}
const S = STAND
export const shelfTop = S.shelf.y + S.shelf.t

export type Check = { what: string; value: string; ok: boolean }
export function checkStand(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const legIn = S.w / 2 - S.leg.inset - S.leg.s // (the legs' inner faces)
  const pl = S.player.x - EW.w / 2
  c('the player on the top, clear of its end', `${pl} > ${-S.w / 2}`, pl > -S.w / 2 + 10)
  c('the player clear of the first crate', `${S.player.x + EW.w / 2} < ${S.topCrates[0] - CW / 2}`, S.player.x + EW.w / 2 + 10 < S.topCrates[0] - CW / 2)
  c('the top crates apart, on the top', S.topCrates.join(', '), S.topCrates.every((x, i) => !i || x - S.topCrates[i - 1] >= CW + 10) && S.topCrates[2] + CW / 2 < S.w / 2)
  c('the shelf crates between the legs', `${S.shelfCrates[3] + CW / 2} < ${legIn}`, S.shelfCrates.every((x, i) => !i || x - S.shelfCrates[i - 1] >= CW) && S.shelfCrates[3] + CW / 2 < legIn)
  c('a crate fits under the top (its records too)', `${shelfTop} + ${CRATE.floor} + ${314.3} < ${S.h - S.top - S.apron.h}`, shelfTop + CRATE.floor + 314.3 < S.h - S.top - S.apron.h + 60)
  c('the crates as deep as the shelf holds', `${CD} < ${S.d - 2 * S.shelf.inset}`, CD < S.d - 2 * S.shelf.inset)
  const lifted = shelfTop + CRATE.floor + CRATE.h + 15 + 314.3
  c('a shelf crate slid out lifts its record clear of the top', `out ${S.slide}: its back ${S.slide - CD / 2} past the top's edge ${S.d / 2} (the record up to ${lifted.toFixed(0)})`, S.slide - CD / 2 > S.d / 2 - 30)
  c('the top at a table’s height', `${S.h}`, S.h >= 680 && S.h <= 760)
  return out
}

