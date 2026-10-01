/**
 * A picnic, in real millimetres: a gingham blanket on the grass, a woodchip basket packed with lunch, and
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
 *   And what's packed and laid out (each in its own file, its sizes there): typical sizes, as things are sold,
 *   not one maker's measured
 *   [D]  a sub half: a 12" hoagie roll (~300 × 80 × 58) cut in two on the bias; deli paper round it
 *   [F]  a demi-baguette, ~420 long, 64 across, 52 high, five slashes; [G] grapes, bunches ~120-150 long
 *   [U]  a 250 g strawberry punnet (~92 square at its top, 46 deep); [J] a 340 g jar of jam (68 across, 82 tall)
 *   [C]  a 16" (406) round bamboo board, 20 thick; [B'] a 6 1/2" stoneware bowl
 *   [L]  Ball's 64 oz mason jar pitcher (~116 across, ~220 tall with its lid); 16 oz mason jar mugs (80 × 132)
 *   [V]  a 250 ml jar of wildflowers; [M] mallards ~580 long, ducklings of a week or two ~150; [S'] a house
 *        sparrow ~150 long
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
export const BOOKS = [
  { title: 'Pride and Prejudice', author: 'Jane Austen', w: 129, h: 198, t: 26, cover: '#8fae8c', ink: '#f3e2b0' }, // [K]
  { title: 'Norwegian Wood', author: 'Haruki Murakami', w: 129, h: 198, t: 24, cover: '#c8423f', ink: '#fbf2e6' },
  { title: 'The Little Prince', author: 'Antoine de Saint-Exupéry', w: 165, h: 235, t: 13, cover: '#a9cfe8', ink: '#f6e7a6' },
] as const
