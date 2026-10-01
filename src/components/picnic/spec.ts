/**
 * A picnic, in real millimetres: a gingham blanket on the grass, a willow basket with sandwiches in it, and
 * three classics to read.
 *
 * Sources
 *   [B]  picnic blankets as they're sold: 60 × 80" (1520 × 2030) the usual size for two to four
 *   [W]  the basket after Wickerwise's woodchip picnic basket (amazon.com): 14 1/4 × 9 × 7 1/4", woven
 *        woodchip, two folding wooden handles riveted on in brass, a gingham liner folded over its rim and
 *        tied with bows; [W'] its handles and ties measured off the product photo (rivets at ±88 of its 362,
 *        the ties at ±62, the handles meeting over its middle). Before it: [P] Picnic Time's Piccadilly, 16" long,
 *        9 1/2" deep, 11" tall to its rim and lids, 14 1/2" to the top of its handle; a double lid (two flaps
 *        hinged on a fixed middle strip, opening out to the sides), red gingham lining, a plate strapped
 *        under each lid, leatherette closures
 *   [K]  the books: B-format paperbacks (129 × 198) for Pride and Prejudice (~480 pages: 26 thick) and
 *        Norwegian Wood (~390: 24); The Little Prince the small hardback (165 × 235, ~96 pages: 13)
 *   [S]  a sandwich: sandwich loaf slices ~110 square, 12 thick; cut corner to corner
 *
 * The covers are drawn here (a cloth binding and a stamped title, a blue sky with a little planet, a
 * plain red jacket), not anyone's cover art.
 */
const IN = 25.4

export const BLANKET = { w: 60 * IN, l: 80 * IN, t: 3, check: 64 } // [B] 1524 × 2032; checks ~2.5"
export const BASKET = {
  l: 14.25 * IN, // [W] 362 across
  d: 9 * IN, // [W] 229 deep
  h: 7.25 * IN, // [W] 184 to its rim
  taper: 14, // (a little narrower at its foot than its rim, all round)
  wall: 8, // the woodchip's thickness
  rim: 12, // the doubled band round its top
  handle: { w: 32, t: 5, rise: 235, x: 88, lean: 0.29 }, // [W'] flat wooden straps riveted each side, swung up they lean in to meet
  overhang: 46, // the liner folded down over its rim outside
  bow: 62, // the liner's ties, each side, just in from the handles
}
export const SANDWICH = { side: 110, bread: 12, filling: 14, n: 4 } // [S] four halves, stood up in a row
export const BOOKS = [
  { title: 'Pride and Prejudice', author: 'Jane Austen', w: 129, h: 198, t: 26, cover: '#8fae8c', ink: '#f3e2b0' }, // [K]
  { title: 'Norwegian Wood', author: 'Haruki Murakami', w: 129, h: 198, t: 24, cover: '#c8423f', ink: '#fbf2e6' },
  { title: 'The Little Prince', author: 'Antoine de Saint-Exupéry', w: 165, h: 235, t: 13, cover: '#a9cfe8', ink: '#f6e7a6' },
] as const
