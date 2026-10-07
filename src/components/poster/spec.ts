/**
 * The "Rina" poster over her desk: a sheet of white poster board, her name across it in big hand-drawn bubble letters
 * (a black marker outline, coloured in: the R lilac to pink to salmon, the i orange to yellow, the n red to orange,
 * the a teal to green to yellow), and all round them, as on hers, notes from the people in her class: typed, a slip
 * each, signed "—name", in columns filling every bit of the board the letters leave. Ours are her friends' words from
 * David's Google Form (./messages). mm.
 *
 * Sources
 *   [P]  the photos: public/reference/room-desk-poster.jpg (straight on, over the desk, under the calligraphy, left
 *        of the lamp), room-desk-wide.png (where it is on the wall), and David's close photo of it: the letters
 *        fill about 85% of its width and 70% of its height, typed notes in columns above them and below, and down
 *        the right; the sheet's nearly square in her photo (470 × 440 px), about 28 × 25 in
 *   [E]  its size: a bit bigger than hers, her name smaller on it (about half its width), for more of
 *        her friends' notes all round it; where on the wall, by eye
 *
 * Its frame: its middle at the origin, its face toward +z, flat in x (across) and y (up).
 */
const IN = 25.4
export const POSTER = {
  w: 30 * IN, // [E] 762
  h: 28 * IN, // [P][E] 711: nearly square, as in her photo
  t: 0.6, // card
  curl: 5, // [P] how far its corners lift off the wall, at most
  // where the letters go, as shares of the sheet (from its left, from its top) [P]
  letters: { x0: 0.24, x1: 0.74, y0: 0.31, y1: 0.69 },
  marker: 3.8, // mm: her marker's line, outside the colouring [P: ~1.5% of the letters' height]
  colors: {
    paper: '#f7f4ec',
    slip: '#fdfbf6', // the printer paper the notes are typed on
    ink: '#1d1719',
    type: '#1f1e24',
  },
  /** [P] each letter's colouring: stops along it, `dir` the way it runs (x, y in its own box, 0..1 from → to) */
  coloring: {
    R: { stops: ['#c7a8dc', '#e3a1c4', '#ee93a6', '#f08a80'], dir: [0.2, 0, 0.75, 1] },
    i: { stops: ['#f3a43a', '#f6bd3c', '#f8d64c'], dir: [0.5, 0, 0.5, 1] },
    n: { stops: ['#e2433b', '#ea5c36', '#f08236', '#f6a43c'], dir: [0.4, 0, 0.6, 1] },
    a: { stops: ['#3eaed0', '#4dbcc0', '#8ccb8a', '#d9d854', '#f6d943'], dir: [0.45, 0.05, 0.3, 0.95] },
  } as Record<'R' | 'i' | 'n' | 'a', { stops: string[]; dir: [number, number, number, number] }>,
  // the notes: typed in columns round the letters (as hers) [P]
  notes: {
    margin: 9, // mm round the sheet's edge
    clear: 6, // mm kept off the letters' marker
    col: 112, // mm: a column at most (hers are about a sixth of the board)
    gap: 4, // mm between columns
  },
}

/** on her north wall: over the desk, a little left of its middle, under the calligraphy [P][E] (room frame) */
export const POSTER_AT = { x: -1010, y: 1660, z: -1900 + 1 }

export type Check = { what: string; value: string; ok: boolean }
export function checkPoster(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const P = POSTER
  c('nearly square, as in her photo (470 × 440 px) [P]', `${P.w.toFixed(0)} × ${P.h.toFixed(0)} (${(P.w / P.h).toFixed(2)})`, Math.abs(P.w / P.h - 470 / 440) < 0.08)
  const L = P.letters
  c('her name about half its width [E]', `${((L.x1 - L.x0) * 100).toFixed(0)}% × ${((L.y1 - L.y0) * 100).toFixed(0)}%`, Math.abs(L.x1 - L.x0 - 0.5) < 0.06)
  c('room for notes all round it [P]', `${(L.y0 * P.h).toFixed(0)} above, ${((1 - L.y1) * P.h).toFixed(0)} below, ${(L.x0 * P.w).toFixed(0)} left, ${((1 - L.x1) * P.w).toFixed(0)} right`, L.y0 * P.h > 120 && (1 - L.y1) * P.h > 120 && L.x0 * P.w > 70 && (1 - L.x1) * P.w > 120)
  c('her marker about 1.5% of the letters’ height [P]', `${P.marker} mm (${((P.marker / ((L.y1 - L.y0) * P.h)) * 100).toFixed(1)}%)`, Math.abs(P.marker / ((L.y1 - L.y0) * P.h) - 0.015) < 0.004)
  // on the wall: over the desk (its top 600 deep from x -1580 to -381), under the bulkhead (2250), clear of the window (x -350)
  const top = POSTER_AT.y + P.h / 2
  const right = POSTER_AT.x + P.w / 2
  c('over the desk, under the bulkhead, left of the window [P]', `x ${(POSTER_AT.x - P.w / 2).toFixed(0)}..${right.toFixed(0)}, y ${(POSTER_AT.y - P.h / 2).toFixed(0)}..${top.toFixed(0)}`, right < -350 && POSTER_AT.x - P.w / 2 > -1600 && top < 2250 && POSTER_AT.y - P.h / 2 > 1100)
  return out
}
