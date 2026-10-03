/**
 * The "Rina" poster over her desk: a sheet of poster board, her name across it in big hand-drawn bubble letters
 * (a thick black outline, filled in coloured pencil: the R pink to red, the i orange to yellow, the n orange to
 * red, the a teal to green to yellow), and all round them the notes her friends wrote her. Ours are her friends'
 * words of encouragement from David's Google Form (./messages), written in round the letters. mm.
 *
 * Sources
 *   [P]  the photos: public/reference/room-desk-poster.jpg (straight on, over the desk, under the calligraphy, left
 *        of the lamp), room-desk-wide.png (where it is on the wall), and David's close photo of it: the letters
 *        fill most of its width and about half its height, a band of notes above them and below, columns of notes
 *        down the right, a column on the left; a "Hello my name is" sticker low on the left
 *   [E]  poster board's usual size, 22 × 28 in, landscape (the photos fit it); where on the wall, by eye
 *
 * Its frame: its middle at the origin, its face toward +z, flat in x (across) and y (up).
 */
const IN = 25.4
export const POSTER = {
  w: 28 * IN, // [E] 711
  h: 22 * IN, // [E] 559
  t: 0.6, // card
  curl: 5, // [P] how far its corners lift off the wall, at most
  // where the letters go, as shares of the sheet (from its left, from its top) [P]
  letters: { x0: 0.07, x1: 0.88, y0: 0.24, y1: 0.8, outline: 0.012 },
  colors: {
    paper: '#f6f0e2',
    ink: '#1d1a22',
    // [P] each letter's colouring, top to bottom
    R: ['#f2a3b4', '#e8667a', '#d9483f'],
    i: ['#f6b23c', '#f2cf4a', '#f7e27a'],
    n: ['#f19a3e', '#ec6a3a', '#e2553f'],
    a: ['#5bc6c0', '#7fcf8e', '#e9dc5a'],
  },
  // the notes' places round the letters (shares of the sheet: x0, y0, x1, y1), filled in order [P]
  bands: [
    [0.04, 0.03, 0.96, 0.22], // above the letters, across
    [0.88, 0.22, 0.98, 0.82], // down the right
    [0.04, 0.82, 0.96, 0.98], // below
    [0.01, 0.24, 0.07, 0.8], // a narrow one down the left
  ] as [number, number, number, number][],
}

/** on her north wall: over the desk, a little left of its middle, under the calligraphy [P][E] (room frame) */
export const POSTER_AT = { x: -1010, y: 1660, z: -1900 + 1 }

export type Check = { what: string; value: string; ok: boolean }
export function checkPoster(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const P = POSTER
  c('poster board, 22 × 28 in, landscape [E]', `${P.w.toFixed(0)} × ${P.h.toFixed(0)}`, P.w > P.h && Math.abs(P.w - 711.2) < 1)
  const L = P.letters
  c('the letters fill most of its width, about half its height [P]', `${((L.x1 - L.x0) * 100).toFixed(0)}% × ${((L.y1 - L.y0) * 100).toFixed(0)}%`, L.x1 - L.x0 > 0.75 && L.y1 - L.y0 > 0.45 && L.y1 - L.y0 < 0.65)
  // the notes' bands clear of the letters and each other
  const overlap = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
  const box = [L.x0, L.y0, L.x1, L.y1]
  c('the notes’ places clear of the letters', P.bands.every((b) => !overlap(b, box)) ? 'clear' : 'over them', P.bands.every((b) => !overlap(b, box)))
  let apart = true
  for (let i = 0; i < P.bands.length; i++) for (let j = i + 1; j < P.bands.length; j++) if (overlap(P.bands[i], P.bands[j])) apart = false
  c('the notes’ places apart', apart ? 'apart' : 'overlapping', apart)
  c('on the sheet', P.bands.every((b) => b[0] >= 0 && b[2] <= 1 && b[1] >= 0 && b[3] <= 1) ? 'inside' : 'off it', P.bands.every((b) => b[0] >= 0 && b[2] <= 1 && b[1] >= 0 && b[3] <= 1))
  // on the wall: over the desk (its top 600 deep from x -1580 to -381), under the bulkhead (2250), clear of the window (x -350)
  const top = POSTER_AT.y + P.h / 2
  const right = POSTER_AT.x + P.w / 2
  c('over the desk, under the bulkhead, left of the window [P]', `x ${(POSTER_AT.x - P.w / 2).toFixed(0)}..${right.toFixed(0)}, y ${(POSTER_AT.y - P.h / 2).toFixed(0)}..${top.toFixed(0)}`, right < -350 && POSTER_AT.x - P.w / 2 > -1600 && top < 2250 && POSTER_AT.y - P.h / 2 > 1100)
  return out
}
