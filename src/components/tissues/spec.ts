/**
 * Rina's Kleenex: the upright cube, Kleenex Professional comfort touch (21271), millimetres.
 * References: public/reference/kleenex-cube.webp (the maker's product shot: its print, sampled for
 * the colours); webstaurantstore.com and kcprofessional.com for 21271: "Box Length: 4 1/2 Inches,
 * Box Width: 4 3/8 Inches, Box Height: 5 Inches", 90 sheets 8.25 × 8.25 in, 36 boxes a case at
 * 13.9 lb (~175 g a box, with its share of the carton).
 *
 * The print: a teal wash, deep green-teal at the top (#007b6f, #048474) through bright teal (#09a7b0)
 * to pale aqua at the bottom (#b7d9dd), all over overlapping soft circles, scattered gold dots; a
 * dark green oval on the top with the logo; a dark green tag hanging off the top edge of a side,
 * rounded at the bottom, the logo in white.
 *
 * Hers is opened: the oval torn out of the top, a tissue standing up out of it, pinched in the hole
 * and fanning out above in soft folds (modelled, not simulated: it's a shape, like the blankets).
 *
 * Frame: origin at the box's middle, +Y up, the long side (4 1/2) along X.
 */
const IN = 25.4
export const TISSUES = {
  box: { w: 4.5 * IN, d: (4 + 3 / 8) * IN, h: 5 * IN, round: 1.2 }, // round: its edges, a hair soft
  hole: { a: 44, b: 27 }, // the oval opening (half axes): torn out along the printed oval's perforation
  oval: { a: 50, b: 33 }, // the dark green printed oval round it
  sheet: { size: 8.25 * IN, count: 90 },
  pop: { h: 78, w: 118, pinch: 40 }, // the tissue standing up: height over the top, spread at its top, pinched width in the hole
  tag: { w: 34, h: 36 }, // the logo tag down from the top edge of a side
  mass: 0.16, // (kg; with 90 sheets in it)
  color: {
    top: '#077a6e',
    upper: '#048474',
    mid: '#09a7b0',
    low: '#7ebdc3',
    bottom: '#c3e0e2',
    label: '#0b5e52',
    gold: '#d7a64a',
    inside: '#d9d2c3', // bare board inside
    tissue: '#fbfbf8',
  },
}

/** The spec's own check. */
export function checkTissues() {
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })
  const { box, hole, oval, pop, sheet } = TISSUES
  add('box 4 1/2 × 4 3/8 × 5 in (21271)', Math.abs(box.w - 114.3) < 0.1 && Math.abs(box.d - 111.1) < 0.1 && Math.abs(box.h - 127) < 0.1, `${box.w.toFixed(1)} × ${box.d.toFixed(1)} × ${box.h.toFixed(1)}`)
  add('the opening sits well inside the top', hole.a < box.w / 2 - 12 && hole.b < box.d / 2 - 20, `${2 * hole.a} × ${2 * hole.b} on ${box.w.toFixed(0)} × ${box.d.toFixed(0)}`)
  add('the printed oval rims the opening', oval.a > hole.a + 3 && oval.b > hole.b + 3 && oval.a < box.w / 2 - 5, `${2 * oval.a} × ${2 * oval.b}`)
  add('the tissue pinches through the hole', pop.pinch < 2 * hole.a, `${pop.pinch} in a ${2 * hole.a} hole`)
  add('what stands up is less than half a sheet', pop.h < sheet.size / 2 && pop.w < sheet.size, `${pop.h} tall, ${pop.w} across of ${sheet.size.toFixed(0)}`)
  add('a cube of card and tissue weighs ~160 g', TISSUES.mass > 0.12 && TISSUES.mass < 0.2, `${TISSUES.mass * 1000} g`)
  return results
}
