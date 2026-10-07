/**
 * Rina's iPad: an 11" iPad Air in a tan folio case (its cover folded back under it), an Apple Pencil in the case's
 * groove along its right side, lying flat on the desk, millimetres.
 *
 * Sources
 *   [P]  her photo (public/reference/room-desk-wall.jpg, front right): lying flat, portrait, its top away from her;
 *        a beige case with a raised rim all round the glass and a groove down the right side holding the white
 *        Pencil; on the screen OneNote (a purple bar along the top with its section tabs), a page of typed lecture
 *        text on the left (LDL cholesterol) with her red and black handwriting beside it, boxes of a printout
 *   [E]  the iPad Air 11" (M2): 247.6 × 178.5 × 6.1, its display 2360 × 1640 at 264 ppi (227.1 × 157.8), its
 *        corners; the Apple Pencil (2nd generation): 166 long, 8.9 across; the case's walls, floor, lip and
 *        cover; the weights (iPad 462 g, case ~240 g, Pencil 21 g)
 *
 * Its frame: the middle of its footprint at x 0, z 0, its bottom on y 0, lying screen up, the screen's top toward
 * -z (so it reads the right way up from +z), the Pencil's groove along +x.
 */
export const IPAD = {
  pad: { w: 178.5, len: 247.6, t: 6.1, r: 18, edge: 1.2 }, // [E] the iPad Air 11"
  screen: { w: 157.8, h: 227.1, r: 9 }, // [E] its display, the bezel even round it
  case: {
    wall: 2.6, // [E] the rim round the iPad
    floor: 1.6, // [E] under it
    lip: 1.0, // [E] the rim stands this far over the glass
    groove: 10, // [P][E] the Pencil's groove, down the right side
    outer: 2.6, // [E] the groove's outside wall
    cover: 3.2, // [E] the folio's cover folded back under it
    r: 20, // [E] its corners
  },
  pencil: { len: 166, d: 8.9, tip: 17, at: -22 }, // [E] the Apple Pencil 2; `at`: its middle along the groove (toward the top)
  mass: 0.72, // [E] kg, all of it
  colors: { case: '#d7c0a0', cover: '#cdb391', pad: '#c9cbd0', bezel: '#0e0e10', pencil: '#f5f4f0', nib: '#e6e4de' },
}

const I = IPAD
const C = I.case
/** the case's outline and where the iPad and the groove sit in it (x) */
export const CASE_W = C.wall + I.pad.w + C.wall + C.groove + C.outer
export const CASE_LEN = C.wall + I.pad.len + C.wall
export const PAD_X = -CASE_W / 2 + C.wall + I.pad.w / 2
export const GROOVE_X = CASE_W / 2 - C.outer - C.groove / 2
/** heights: the floor's top (the folded cover under the case's floor), the glass, the rim's top */
export const FLOOR = C.cover + C.floor
export const GLASS = FLOOR + I.pad.t
export const RIM = GLASS + C.lip
/** the Pencil's top (lying on the groove's floor) */
export const PENCIL_TOP = FLOOR + I.pencil.d

export type Check = { what: string; value: string; ok: boolean }
export function checkIpad(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const diag = Math.hypot(I.screen.w, I.screen.h) / 25.4
  c('an 11" display [E]', `${diag.toFixed(2)}" (Apple rounds 10.86 up)`, diag > 10.8 && diag < 11.05)
  const bx = (I.pad.w - I.screen.w) / 2
  const by = (I.pad.len - I.screen.h) / 2
  c('the bezel even all round [E]', `${bx.toFixed(1)} sides, ${by.toFixed(1)} ends`, Math.abs(bx - by) < 0.5)
  c('the case only a few mm bigger than the iPad [E]', `${CASE_W.toFixed(1)} × ${CASE_LEN.toFixed(1)} on ${I.pad.w} × ${I.pad.len}`, CASE_LEN - I.pad.len < 8 && CASE_W - I.pad.w < 22)
  c('the rim stands proud of the glass [P]', `${C.lip} mm`, C.lip > 0.5 && C.lip < 2)
  c('the Pencil fits its groove', `${I.pencil.d} in ${C.groove}`, I.pencil.d < C.groove && C.groove - I.pencil.d < 2)
  c('the Pencil along the groove, inside the case', `${I.pencil.len} of ${CASE_LEN.toFixed(0)}, its ends ${(I.pencil.at - I.pencil.len / 2).toFixed(0)} to ${(I.pencil.at + I.pencil.len / 2).toFixed(0)}`, Math.abs(I.pencil.at) + I.pencil.len / 2 < CASE_LEN / 2 - C.wall - 4)
  c('the Pencil just proud of the rim [P]', `top ${PENCIL_TOP.toFixed(1)}, the rim ${RIM.toFixed(1)}`, PENCIL_TOP > RIM && PENCIL_TOP < RIM + 4)
  c('flat: lying on the desk [P]', `${RIM.toFixed(1)} mm tall`, RIM < 16)
  c('the screen portrait, its top away (-z) [P]', `${I.screen.w} across × ${I.screen.h} along`, I.screen.h > I.screen.w)
  return out
}
