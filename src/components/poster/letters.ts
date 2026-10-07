/**
 * Her "Rina", drawn clean in her style (public/reference/room-desk-poster.jpg): bubble letters, each the fat round
 * stroke of a pen line through its middle, so its edge is smooth and even all round and her marker goes round it
 * at one width. As hers: leaning back a little (their tops to the left), the n and the a as tall as two thirds of
 * the R, the i's dot an egg, the n's stem standing a little above its arch (her notch), the a one round bowl with
 * its stem down the right and a little kick at its foot.
 *
 * The letters' frame: y down, their baseline at 100, the R's top at 0. Each letter's strokes: SVG path data (the
 * line through the middle) and how wide (the colouring; her marker goes round outside that). `box`: its bounds
 * with the strokes' widths, for its colouring to run across.
 */
export type Stroke = { d: string; w: number }
export type Letter = { strokes: Stroke[]; box: [number, number, number, number] }

const W = 11.5 // a stroke, wide
export const LETTERS: { R: Letter; i: Letter; n: Letter; a: Letter; box: [number, number, number, number] } = {
  R: {
    strokes: [
      { d: 'M10 97 L5 6', w: W }, // the stem
      { d: 'M5 6 C27 0 50 4 50 26 C50 46 31 52 9 50', w: W }, // the bowl, back to the stem
      { d: 'M23 51 L50 97', w: W + 1 }, // the leg
    ],
    box: [-2, -1, 57, 104],
  },
  i: {
    strokes: [
      { d: 'M75 97 L71 43', w: W }, // the stem
      { d: 'M70.8 17.5 L72 23.5', w: W + 5 }, // the dot: an egg
    ],
    box: [63, 6, 82, 104],
  },
  n: {
    strokes: [
      { d: 'M97 97 L93 40', w: W }, // the stem, a little above the arch
      { d: 'M94 57 C96 42 108 38 116 38 C130 38 134 48 134 62 L136 97', w: W }, // the arch, down to the right
    ],
    box: [86, 33, 143, 104],
  },
  a: {
    strokes: [
      { d: 'M178 69 C178 84 172 94 163 94 C154 94 148 84 148 69 C148 54 154 44 163 44 C172 44 178 54 178 69 Z', w: W }, // the bowl
      { d: 'M179 42 L181 90 C182 98 186 100 193 97', w: W }, // the stem down its right, a kick at the foot
    ],
    box: [141, 35, 200, 104],
  },
  box: [-2, -1, 199, 104], // all of them, with their strokes' widths (not the marker)
}
export const NAMES = ['R', 'i', 'n', 'a'] as const
