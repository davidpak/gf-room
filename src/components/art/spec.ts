/**
 * The art corner (./Easel, ./painting): an easel with a canvas someone's begun, a stool, a palette, brushes,
 * paint. Real millimetres (the Quad draws it at its people-sized toy scale, 0.24). Frame: +y up, the canvas
 * facing +z, the easel's front feet on the ground at z 0.
 *
 * [E] a studio A-frame easel, beech (the common kind: a centre mast between two splayed front legs, a back leg
 *     hinged at the top; ~1.7 m tall, sections ~40 × 24 mm, a tray to stand the canvas on at about hip height,
 *     a top clamp sliding down the mast onto the canvas), leaning back about 11°
 * [C] a stretched canvas, 16 × 20 in (406 × 508 mm), ~20 mm deep, gallery-wrapped (the canvas round its edges,
 *     stapled at the back over its stretcher bars)
 * [S] a three-legged wooden stool, ~450 mm tall, a 300 mm round seat
 * [P] an oval wooden palette ~400 × 300 × 5 mm, its thumb hole near one end
 * [J] a glass jar ~90 across × 120, brushes standing in it (handles ~220 mm)
 * [T] artists' oil/acrylic tubes, 37 ml: ~22 across, ~110 long with their caps, the far end crimped flat
 */
export const EASEL = {
  lean: 0.19, // [E] radians back from upright (~11°)
  mast: { w: 40, d: 24, h: 1700 },
  leg: { w: 34, d: 22, spread: 330, top: 1560, apart: 70 }, // (each front leg: from beside the mast near the top out to its foot)
  back: { w: 30, d: 20, foot: -620 }, // (the back leg: from the top to its foot this far behind)
  tray: { y: 760, w: 640, d: 76, t: 18, lip: 20 },
  clamp: { w: 120, h: 40, d: 60 },
}
export const CANVAS = { w: 406, h: 508, d: 20, bar: 20 } // [C] (bar: the stretcher bars' width, seen from behind)
export const STOOL = { h: 450, seat: 150, t: 28, leg: 22, splay: 190 } // [S] (seat: its radius; splay: how far out its feet stand)
export const PALETTE = { w: 400, d: 300, t: 5, hole: 24 } // [P]
export const JAR = { r: 45, h: 120, wall: 6 } // [J] (a glazed stoneware jar: its wall ~6 thick)
export const BRUSH = { len: 220, handle: 5, ferrule: 6 } // [J]
export const TUBE = { r: 11, len: 95, cap: 14 } // [T]

/** the paints, on the palette and in the paint box: soft toy colours, and a few darks to draw with */
export const PAINTS = [
  { name: 'ink', hex: '#2f2a3a' },
  { name: 'white', hex: '#fbf7f0' },
  { name: 'blossom', hex: '#f6c1cf' },
  { name: 'rose', hex: '#e7839f' },
  { name: 'peach', hex: '#f3a774' },
  { name: 'butter', hex: '#f4d78e' },
  { name: 'mint', hex: '#a6dbb0' },
  { name: 'leaf', hex: '#5f9e6e' },
  { name: 'sky', hex: '#93c8ea' },
  { name: 'blue', hex: '#6a7fd6' },
  { name: 'lavender', hex: '#b9a0e2' },
  { name: 'bark', hex: '#8a5a44' },
]

// ---- the art blanket and what's on it (real mm; its frame: x across, z along, y up, its middle at the origin)
const IN = 25.4
/** [B] a woven cotton throw, 50 × 60", stripes along its length, a knotted fringe at each end */
export const THROW = { w: 50 * IN, l: 60 * IN, t: 3, fringe: 60 }
/** [K] a spiral-bound sketchbook, 9 × 12" pages (opened flat: 18 × 12"), a kraft back board */
export const SKETCHBOOK = { w: 9 * IN, h: 12 * IN, board: 2, leaves: 6, rings: 22, ring: 7 }
/** [P] a tin of 12 coloured pencils (~190 × 90 × 12), the pencils 7 across, 175 long, sharpened */
export const PENCILS = { tin: { w: 190, d: 92, h: 12 }, r: 3.6, len: 175 }
/** [W] a travel watercolour box, 12 half pans (16 × 19), its lid opening out flat as a mixing palette */
export const WATERCOLOR = { w: 118, d: 62, h: 14, pan: { w: 16, d: 19, h: 9 } }
/** [H] a 6" beech embroidery hoop, its brass clasp; the linen in it */
export const HOOP = { r: 76, ring: 9, h: 10 }
/** [O] an origami crane folded from a 6" square: ~ 150 across the wings, 110 nose to tail */
export const CRANE = { span: 150, len: 110, h: 60 }
/** [U] an echeveria in a 3" terracotta pot */
export const POT = { r: 40, h: 68, rim: 10 }

/** the pencils' colours, the watercolours' (the paints, and a few more) */
export const PENCIL_COLORS = ['#e2574c', '#f08a4b', '#f4c84a', '#9ccf5f', '#3f9a5c', '#4bb4c9', '#3b6fc4', '#7b5cc4', '#e57fb0', '#8a5a44', '#6b6b6b', '#2f2a3a']

/** [A] a sheet of US Letter (8.5 × 11"), folded into a dart: its keel this deep, each layer this thick (drawn: the
 *  toy look, and so stacked layers never fight); the sheets' colours */
export const PAPER = { w: 8.5 * IN, h: 11 * IN, keel: 28, layer: 0.35 }
export const PAPER_COLORS = ['#f8c9d4', '#bfe6c8', '#d4c6f0', '#f7e3a6']
