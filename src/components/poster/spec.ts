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
  /** the notes' slips as paper: each glued at its top, its bottom edge free (a slip of printer paper doesn't lie
   *  dead flat). Small and slow on purpose: alive the way the Quad's petals are, never an effect laid over it [E] */
  slips: {
    curl: 0.5, // mm its free bottom edge stands off the board, resting
    sway: 0.25, // mm it stirs by itself, now and then (each its own pace)
    breeze: { lift: 1.4, every: 11, cross: 4, width: 160 }, // a draft along the board: mm, s apart, s to cross, mm wide
    lifted: 3.5, // mm its bottom edge comes up off the board, pointed at (its top: a fifth of that)
    ease: 7, // 1/s: how quickly it lifts and settles
  },
  /** what holds each slip up: a pin of its own through its top, in one of her letters' colours (toy plastic), one of
   *  three kinds. Real ones [E]: a push pin's grip about 11 mm across and 9 mm off the board; a map pin's ball 7 mm
   *  on a pin standing 7 mm out; a thumb tack's flat head 10 mm across, 2 mm proud */
  pins: {
    top: 8, // mm clear at a slip's top for its pin (its words start under it)
    at: 4, // mm down from the slip's top edge, the pin's middle
    // push pin, its profile from the paper up (r, z): a collar, the body tapering in then out, the grip
    push: [[0, 0], [4.2, 0], [4.2, 1], [2.2, 1.3], [2.5, 4.2], [3.3, 6.6], [5.5, 6.9], [5.6, 8.3], [5.2, 8.9], [0, 9]] as [number, number][],
    map: { ball: 3.6, shaft: 0.55, out: 7 },
    tack: [[0, 0], [5, 0], [5, 0.5], [4.4, 1.3], [2.6, 1.9], [0, 2]] as [number, number][],
    colors: ['#c7a8dc', '#ee93a6', '#f6bd3c', '#ef7a4a', '#4dbcc0', '#8ccb8a'], // [P] her letters'
    steel: '#b9bcc4',
  },
  /** a soft glow: the board a touch brighter than her wall in the dim room, a faint light on the wall round it; barely
   *  there (David: "way too bright, again subtlety") [E] */
  glow: { board: 0.05, reach: 70, wall: 0.07, color: '#fff0d8' },
  /** dust in the air in front of it, drifting, now and then catching the light: a few, small, slow, faint (alive the
   *  way the Quad's petals are) [E: dust motes ~0.1 mm, seen as specks a few mm across in a beam] */
  motes: { count: 46, size: [2.4, 5], deep: 420, drift: 5, opacity: 0.4, color: '#fff3dc' },
  /** a note clicked: the camera glides in square to it (as the Quad's photos), the note and this much more round it
   *  filling the view; ← → the next one; Esc back [E] */
  focus: { room: 1.3, glide: 0.9 },
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
  const S = P.slips
  c('the slips stir by a few mm at most (subtle, as the Quad’s petals) [E]', `rest ${S.curl}, sway ${S.sway}, draft ${S.breeze.lift}, pointed at ${S.lifted} mm`, S.curl + S.sway + S.breeze.lift <= 2.5 && S.lifted <= 5)
  c('a draft now and then, not all the time [E]', `every ${S.breeze.every} s, crossing in ${S.breeze.cross} s`, S.breeze.every >= 2 * S.breeze.cross)
  c('its glow barely there [E]', `board ${P.glow.board}, wall ${P.glow.wall}`, P.glow.board <= 0.08 && P.glow.wall <= 0.1)
  c('a few faint motes, slow [E]', `${P.motes.count} at most ${P.motes.opacity} strong, ${P.motes.drift} mm/s`, P.motes.count <= 60 && P.motes.opacity <= 0.4 && P.motes.drift <= 8)
  const pin = P.pins
  const pushR = Math.max(...pin.push.map(([r]) => r))
  const pushH = Math.max(...pin.push.map(([, z]) => z))
  c('a push pin about 11 mm across, 9 mm off the board [E]', `${(pushR * 2).toFixed(1)} × ${pushH.toFixed(1)}`, Math.abs(pushR * 2 - 11) < 1.5 && Math.abs(pushH - 9) < 1.5)
  c('a pin clear of its slip’s words (its head inside the room left at the top) [E]', `head ${pin.at - pushR}..${pin.at + pushR} mm, words from ${pin.top}`, pin.at + Math.min(pushR, pin.map.ball) <= pin.top + 2)
  // on the wall: over the desk (its top 600 deep from x -1580 to -381), under the bulkhead (2250), clear of the window (x -350)
  const top = POSTER_AT.y + P.h / 2
  const right = POSTER_AT.x + P.w / 2
  c('over the desk, under the bulkhead, left of the window [P]', `x ${(POSTER_AT.x - P.w / 2).toFixed(0)}..${right.toFixed(0)}, y ${(POSTER_AT.y - P.h / 2).toFixed(0)}..${top.toFixed(0)}`, right < -350 && POSTER_AT.x - P.w / 2 > -1600 && top < 2250 && POSTER_AT.y - P.h / 2 > 1100)
  return out
}
