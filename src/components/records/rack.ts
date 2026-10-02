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
 * The stand: a two-tier pine table, the Victrola on top at the left, the crate beside it, then the Dig box; the
 * back stock on the shelf below (the way record stands are: a console table, more under it). Our own design, sized
 * round what it holds: [EW] the player 322 × 312; the crate 358 wide outside, 328 deep. Its frame: its middle, its
 * feet at y 0, its front toward +z.
 */
export const CRATE = {
  in: { w: LP.sleeve + 16, d: 300 }, // inside (50 records, a 4.5 mm jacket every 5 mm)
  wall: 14,
  floor: 12,
  h: 200, // ends and back
  front: 120, // the low front
  hole: { w: 90, h: 30, y: 150 }, // the hand-holes in the ends
  lean: 0.1, // radians back
  colors: { pine: '#e3bf8c', pineShade: '#9a7f9a' },
}
const CW = CRATE.in.w + 2 * CRATE.wall // 358
const CD = CRATE.in.d + 2 * CRATE.wall // 328
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
  crate: -150,
  digBox: { x: 160, z: 20, w: 190, d: 150 },
}
const S = STAND
export const shelfTop = S.shelf.y + S.shelf.t

export type Check = { what: string; value: string; ok: boolean }
export function checkStand(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const pl = S.player.x - EW.w / 2
  c('the player on the top, clear of its end', `${pl} > ${-S.w / 2}`, pl > -S.w / 2 + 10)
  c('the player clear of the crate', `${S.player.x + EW.w / 2} < ${S.crate - CW / 2}`, S.player.x + EW.w / 2 + 10 < S.crate - CW / 2)
  c('the crate clear of the Dig box', `${S.crate + CW / 2} < ${S.digBox.x - S.digBox.w / 2}`, S.crate + CW / 2 + 10 < S.digBox.x - S.digBox.w / 2)
  c('the crate as deep as the top', `${CD} < ${S.d}`, CD < S.d)
  c('the top at a table’s height', `${S.h}`, S.h >= 680 && S.h <= 760)
  return out
}
