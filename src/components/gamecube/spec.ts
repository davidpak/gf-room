/**
 * A GameCube set up on the lawn (./GameCube, ./Crt, ./Controller, ./Disc, ./Setup): the console, Super Smash Bros.
 * Melee in it, two controllers plugged in (an indigo one and a black one), an old 20" CRT on a low TV bench, a rug,
 * two floor cushions. Real millimetres (the Quad draws it at its people-sized toy scale, 0.24); each thing's frame:
 * +y up, its front facing +z.
 *
 * [G] the Nintendo GameCube (DOL-001): 150 W × 110 H × 161 D, 2.4 kg, indigo. On top, the disc lid (most of the top,
 *     hinged at the back, a black round window in it), and three round buttons in the top's corners: POWER at the
 *     back left (light grey, its green lamp beside it), RESET at the front left, OPEN at the front right (it pops the
 *     lid). On the front, a silver panel: four controller ports in a row, the two memory card slots under them. A
 *     vent grille on the right side; the carry handle looped off the back; four rubber feet.
 * [D] its disc: an 8 cm mini DVD, 1.2 thick, its hole 15 across.
 * [C] the controller (DOL-003): ~150 across, ~105 front to back, ~60 thick through the grips; its cable 2 m. The main
 *     stick top left, the D-pad under it; START in the middle; the big green A on the right, red B by it low left,
 *     X and Y (grey, curved) round A's right and top; the yellow C-stick low; L and R on the back shoulders, Z on the
 *     right one's top.
 * [K] the game case: 135 × 190 × 14, black, the cover art under its clear sleeve.
 * [T] a 20" (4:3) CRT TV, the kind in every dorm: ~520 W × 460 H, ~470 D, its screen 390 × 292 (19" viewable), the
 *     glass bowed out a little; a row of small buttons and the power switch under the screen, its lamp, and the
 *     front AV jacks (yellow, white, red) low on the right. The GameCube's AV cable runs to those.
 * [B] a low TV bench, birch: 800 × 420 × 400, an open shelf under its top.
 * [R] a 6 × 4 ft rug (1830 × 1220); [U] two floor cushions, 400 square, 90 thick.
 */
const IN = 25.4

export const CUBE = {
  w: 150,
  h: 110,
  d: 161,
  feet: 4, // (it stands this high on its rubber feet)
  r: 7, // (its edges' round)
  // (the lid: its corners rounded wide, the buttons in them; open: how far it swings up, radians; gap: it sits this
  // far over its bed, the disc under it)
  lid: { w: 124, d: 122, r: 30, t: 5, hingeZ: -64, open: 1.25, window: 39, gap: 1.6 },
  well: { r: 44 },
  buttons: {
    power: { x: -60, z: -66, r: 7.5 }, // [G] back left, light grey
    reset: { x: -60, z: 58, r: 5.5 }, // front left
    open: { x: 60, z: 58, r: 6.5 }, // front right
  },
  lamp: { x: -45, z: -71 },
  panel: { x0: -71, x1: 30, y0: 12, y1: 76 }, // [G] the silver port panel on the front
  ports: { y: 54, xs: [-58, -35, -12, 11], r: 7 },
  slots: { y: 27, xs: [-46, -2], w: 34, h: 5 },
  handle: { back: 26, r: 5.5, y: 92 },
  mass: 2.4,
}
export const DISC = { r: 40, hole: 7.5, t: 1.2 }
export const PAD = {
  w: 150,
  d: 105,
  h: 34, // (the body's thickness, the grips under it deeper)
  grip: { x: 50, z: 34 }, // (each grip's middle)
  cable: 2000,
  mass: 0.19,
}
export const CASE = { w: 135, h: 190, t: 14 }
export const TV = {
  w: 520,
  h: 460,
  bezel: 64, // (the front's depth)
  d: 470,
  screen: { w: 390, h: 292, y: 270, bow: 9 },
  back: { w: 330, h: 290, y: 245 }, // (the tube's housing, tapering to this at its back)
  feet: 10,
  mass: 22,
}
export const BENCH = { w: 800, h: 420, d: 400, top: 30, side: 28, shelf: { y: 110, t: 22 } }
export const RUG = { w: 72 * IN, d: 48 * IN, t: 8 }
export const CUSHION = { s: 400, t: 90 }

/** the colours: the indigo console and controller, the black controller, the buttons' own */
export const COLORS = {
  indigo: '#5a4fb4',
  indigoDark: '#463d96',
  silver: '#cfd0d8',
  black: '#2c2b33',
  grey: '#c9c9d2',
  a: '#36a872',
  b: '#e0504a',
  c: '#f2b83a',
  z: '#7b74e0',
  tv: '#47434e',
  tvDark: '#34313b',
}
