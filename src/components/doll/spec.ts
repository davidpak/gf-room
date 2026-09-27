/**
 * David's crochet doll, millimetres, from public/reference/doll-front.png, doll-back.png and the
 * real hoodie (hoodie-front.jpg, hoodie-back.jpg). Real doll size: 350 tall.
 *
 * Frame: origin on the floor between the feet, Y up, the doll faces +Z (its left hand is +X).
 * Round parts are lathes: profiles are [radius, y] from bottom to top, revolved around their axis.
 */
export const DOLL = {
  height: 339,

  // joints (doll coordinates). Everything hangs off these so animation only rotates groups:
  // pelvis (bob/sway) → legs at the hips, torso at the waist → arms at the shoulders, head at the neck
  rig: { hipY: 132, waistY: 132, neckY: 226 },
  headDrop: -17, // the head (modelled chin at 250) sits on a short, sturdy neck
  neck: { r: 14.5, y0: 220, y1: 246 }, // ~6 mm shows between the collar and the head
  stitch: { w: 4.6, h: 4.0 }, // single crochet, from the photo: ~16 stitches across a 74 mm face

  yarn: {
    skin: { color: '#f2dcc2', sheen: '#fff4e6' },
    black: { color: '#3a3360', sheen: '#7d73ad' }, // his black, as a deep navy-plum: never pure black
    maroon: { color: '#a3263e', sheen: '#e0707f' }, // the hoodie's maroon, a little brighter
    pink: { color: '#e0557f', sheen: '#ffb3c8' },
    white: { color: '#f1eee6', sheen: '#ffffff' },
  },
  thread: {
    white: '#f4f1ea', brown: '#5a3a24', darkBrown: '#3b2618', pink: '#e45a78', green: '#7fb04a', yellow: '#e6c14a', grey: '#55525a',
    eye: '#3a2618', brow: '#6e5040', mouth: '#c9546b',
  },

  head: {
    // egg, chin to crown
    profile: [
      [0, 250], [18, 252], [28, 256], [34, 264], [37, 276], [37.5, 290], [36.5, 305], [33, 322], [26, 334], [15, 341], [0, 344],
    ] as [number, number][],
    depth: 0.95, // z scale
  },
  // a sweet face: tall brown oval eyes like the doll's (with a little highlight), tiny brows, small smile
  face: { eyeY: 283, eyeX: 14, eyeW: 5.4, eyeH: 8.6, browY: 293.5, noseY: 274, mouthY: 268 },
  ear: { y: 282, r: 8 },

  // his beanie (public/reference/beanie.webp): black ribbed cuffed watch cap, DoodleBob embroidered
  // in white on the front of the cuff. Worn tipped back a little so the middle part shows.
  beanie: {
    crown: [
      [41.5, 316], [42.7, 326], [42.2, 334], [39.6, 341], [34, 347], [25.5, 351.5], [13.5, 354.6], [0, 356],
    ] as [number, number][],
    crownRibs: { count: 64, depth: 0.55, fadeFrom: 340, fadeTo: 352 },
    cuff: { y0: 304, y1: 322, rIn: 40.5, rOut: 45.8, ribs: 48, ribDepth: 1.1 },
    doodle: { half: 0.34 }, // radians either side of the front of the cuff
    tilt: -0.14, // radians, about the head centre: front lifts, back drops
    pivotY: 300,
  },
  // one crocheted hair piece; its lower edge [|angle from the front|, y]: the middle part's V,
  // curtain bangs sweeping to the temples, then a bob over the sides down to the nape
  hair: {
    edge: [
      [0, 313], [0.12, 307], [0.35, 300.5], [0.62, 295], [0.9, 288], [1.25, 280], [1.6, 271], [2.2, 259], [Math.PI, 253],
    ] as [number, number][],
    top: 332, // up under the beanie
    partY: 316,
    thick: 3.4,
    bob: 2.4, // extra roundness over the sides and back
  },

  torso: {
    // the hoodie: a little chunky and boxy, hem over the hips, dropped shoulders
    profile: [
      [0, 128], [39, 128], [40.5, 131], [40.5, 139], [41.5, 141], [42, 160], [41.5, 185], [40, 200], [37, 210], [31, 217.5], [21, 222.5], [13, 225.5], [12, 226],
    ] as [number, number][],
    depth: 0.8,
  },
  // the hood, down: a flat folded pouch lying on the upper back, under the collar
  hood: { pos: [0, 205, -35] as [number, number, number], size: [31, 16, 8] as [number, number, number] },
  collar: { R: 14.5, t: 4.6, y: 224, tilt: -0.15 }, // the hood's rolled edge around the neck
  pocket: { y0: 146, y1: 172, half: 0.75 }, // radians either side of the front
  logo: { y: [190, 207] as [number, number], theta: [0.1, 0.64] as [number, number] }, // DOOM, the wearer's left chest
  back: { y: [145, 190] as [number, number] }, // ALLCAPS! and the zigzags, below the hood

  arm: {
    shoulder: [37, 209] as [number, number], // x, y of the shoulder joint
    spread: 0.3, // radians out from hanging straight down
    sleeve: [
      [0, -70], [9, -69], [10.5, -66], [10.5, -60], [10, -35], [9.5, -12], [8, -4], [4.5, 0], [0, 1],
    ] as [number, number][], // cuff (bottom) to the rounded shoulder cap (top at the joint)
    hand: { r: 7.5, len: 18 },
  },

  legs: {
    x: 19, // hip joints either side
    profile: [
      [0, 26], [19.5, 26], [20, 29], [19.5, 36], [18.5, 80], [18, 136], [0, 137],
    ] as [number, number][], // wide pants, a little flare at the hem; shorter, cuter legs
  },
  shoe: {
    x: 19,
    z: 8,
    profile: [
      [0, 0], [16, 0], [17, 3], [17.2, 9], [16.5, 16], [14, 24], [9, 30], [0, 33],
    ] as [number, number][],
    stretch: 1.8, // z scale: toe to heel
    bands: { pink: [0, 5], white: [5, 9] } as Record<string, [number, number]>,
  },
}
