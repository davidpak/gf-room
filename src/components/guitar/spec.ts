/**
 * A Martin D-28 (the 14-fret dreadnought), in real millimetres, and its molded hardshell case.
 *
 * Sources
 *   [M]  martinguitar.com/guitars/standard-series/D-28.html (spec sheet): 25.4" scale, 20 frets, joins the
 *        body at the 14th, 1 3/4" at the nut, 2 1/8" at the 12th fret, 2 5/32" string spacing at the saddle,
 *        16" radius, ebony board with pearl dots, ebony belly bridge with a compensated bone saddle, bone pins
 *        with tortoise dots, antique white binding, style 28 multi-stripe rosette, faux tortoise pickguard,
 *        solid headstock with a rosewood plate, nickel open-gear tuners with butterbean knobs, aging toner top
 *   [D]  a 1937 D-28 drawing (quoted at umgf.com): lower bout 15.73", waist 10.81", upper bout 11.60", body 19.97"
 *   [C]  guitarchalk.com: body 20" long, 4 7/8" deep (at the tail)
 *   [P]  Martin's front photo of the D-28 (Y25D28_f.jpg, 1195 × 3000), measured by pixel in the browser:
 *        the body outline row by row (its treble edge from the top's centre line, x 665 px, the photo being
 *        a little from the bass side), the soundhole, the pickguard, the bridge and saddle, the headstock.
 *        Along the guitar 0.3676 mm/px (the body's 1382 px = 508 mm; the saddle falls at 645 mm from the nut,
 *        as the scale says it should). Across 0.4297 mm/px (the lower bout's 924 px = 397 mm); with that the
 *        upper bout reads 294 and the waist 277, against [D]'s 295 and 275
 *   [K]  the case, Martin 12C640 (reverb.com, americanmusical.com): outside 44 1/4 × 18 1/4 × 7 1/2",
 *        inside 42" overall, body 20 1/2" long, 4" deep; black molded shell, green plush, five latches
 *
 * Its frame: u runs along it from the nut (0) toward the tail; x across, + to the treble side (the
 * pickguard's side, on the right as you face it neck up); the top's face is z = 0, the back is at -depth.
 */
const IN = 25.4

export const SCALE = 25.4 * IN // [M] 645.2
export const FRETS = 20 // [M]
/** where fret n is, from the nut (n = 0 is the nut) */
export const fretU = (n: number) => SCALE * (1 - Math.pow(2, -n / 12))
export const JOIN = fretU(14) // [M] the body starts here: 357.7

export const NECK = {
  nut: 1.75 * IN, // [M] 44.45 wide at the nut
  at12: 2.125 * IN, // [M] 53.98 at the 12th fret
  board: 6, // the fingerboard's thickness (ebony)
  boardEnd: fretU(20) + 6, // [P] it runs 6 past the 20th fret into the body, stopping short of the rosette
  shaft: [15, 17.5] as const, // its back's depth under the board, at the 1st fret and the 9th (GE modified low oval: ~0.82" through at the 1st)
  heel: 64, // how far down the neck the heel starts flaring into the body
}
/** the neck's width at u */
export const neckW = (u: number) => NECK.nut + ((NECK.at12 - NECK.nut) * u) / fretU(12)

/** the body's outline [P]: the treble edge (px) every 8 px down the photo, from its top (y 1502) to its tail (y 2884) */
const EDGE_PX = [
  1504, 732, 1512, 796, 1520, 849, 1528, 878, 1536, 900, 1544, 916, 1552, 930, 1560, 940, 1568, 949, 1576, 958, 1584, 964, 1592, 970, 1600, 976, 1608, 981, 1616, 985, 1624, 990, 1632, 992, 1640, 995, 1648, 998, 1656, 1000, 1664, 1002, 1672, 1004, 1680, 1005, 1688,
  1006, 1696, 1007, 1704, 1008, 1712, 1008, 1720, 1007, 1728, 1007, 1736, 1007, 1744, 1007, 1752, 1008, 1760, 1006, 1768, 1005, 1776, 1007, 1784, 1004, 1792, 1005, 1800, 1004, 1808, 1003, 1816, 1002, 1824, 1001, 1832, 1000, 1840, 999, 1848, 996, 1856, 997, 1864, 994, 1872, 995,
  1880, 992, 1888, 992, 1896, 991, 1904, 990, 1912, 989, 1920, 988, 1928, 988, 1936, 988, 1944, 987, 1952, 987, 1960, 988, 1968, 988, 1976, 990, 1984, 991, 1992, 992, 2000, 993, 2008, 995, 2016, 996, 2024, 998, 2032, 1000, 2040, 1002, 2048, 1006, 2056, 1007, 2064, 1009, 2072,
  1012, 2080, 1015, 2088, 1018, 2096, 1021, 2104, 1024, 2112, 1026, 2120, 1029, 2128, 1032, 2136, 1036, 2144, 1039, 2152, 1043, 2160, 1045, 2168, 1049, 2176, 1053, 2184, 1055, 2192, 1059, 2200, 1063, 2208, 1065, 2216, 1068, 2224, 1071, 2232, 1075, 2240, 1078, 2248, 1081, 2256,
  1084, 2264, 1087, 2272, 1090, 2280, 1093, 2288, 1096, 2296, 1099, 2304, 1101, 2312, 1104, 2320, 1106, 2328, 1109, 2336, 1111, 2344, 1113, 2352, 1115, 2360, 1117, 2368, 1119, 2376, 1120, 2384, 1122, 2392, 1123, 2400, 1124, 2408, 1123, 2416, 1124, 2424, 1127, 2432, 1126, 2440,
  1126, 2448, 1127, 2456, 1127, 2464, 1127, 2472, 1127, 2480, 1126, 2488, 1126, 2496, 1126, 2504, 1125, 2512, 1124, 2520, 1123, 2528, 1122, 2536, 1121, 2544, 1119, 2552, 1118, 2560, 1116, 2568, 1114, 2576, 1112, 2584, 1109, 2592, 1107, 2600, 1104, 2608, 1101, 2616, 1101, 2624,
  1097, 2632, 1094, 2640, 1090, 2648, 1086, 2656, 1082, 2664, 1077, 2672, 1072, 2680, 1066, 2688, 1062, 2696, 1056, 2704, 1050, 2712, 1043, 2720, 1036, 2728, 1025, 2736, 1019, 2744, 1007, 2752, 998, 2760, 987, 2768, 979, 2776, 966, 2784, 951, 2792, 939, 2800, 923, 2808, 907,
  2816, 886, 2824, 863, 2832, 839, 2840, 816, 2848, 784, 2856, 746, 2864, 703,
]
const PX = { centre: 665, top: 1502, tail: 2884, along: 508 / (2884 - 1502), across: 397 / (2 * (1127 - 665)) }
export const BODY = {
  length: 20 * IN, // [C] 508
  lower: 15.625 * IN, // [M]/[C] 397
  upper: 11.6 * IN, // [D] 294.6
  waist: 10.81 * IN, // [D] 274.6
  depthTail: 4.875 * IN, // [C] 123.8
  depthHeel: 100, // (a dreadnought's usual 3 15/16" at the neck)
}
/** the outline's half-widths down the body: [s from the top of the body, half-width], smoothed ends */
export const OUTLINE: [number, number][] = (() => {
  const pts: [number, number][] = [[0, 0]]
  for (let i = 0; i < EDGE_PX.length; i += 2) pts.push([(EDGE_PX[i] - PX.top) * PX.along, (EDGE_PX[i + 1] - PX.centre) * PX.across])
  pts.push([BODY.length - 4, 16], [BODY.length, 0])
  return pts
})()
/** the body's half-width s mm down from its top */
export function halfWidth(s: number) {
  if (s <= 0 || s >= BODY.length) return 0
  for (let i = 1; i < OUTLINE.length; i++) {
    const [s1, w1] = OUTLINE[i]
    if (s1 >= s) {
      const [s0, w0] = OUTLINE[i - 1]
      return w0 + ((w1 - w0) * (s - s0)) / (s1 - s0 || 1)
    }
  }
  return 0
}
/** the body's depth s mm down from its top (it tapers toward the neck) */
export const depthAt = (s: number) => BODY.depthHeel + ((BODY.depthTail - BODY.depthHeel) * Math.min(1, Math.max(0, s))) / BODY.length

export const SOUNDHOLE = { u: JOIN + (1915 - PX.top) * PX.along, r: 50 } // [P] its centre 152 mm into the body; 4" across (the photo: 98 across its width)
export const ROSETTE = { inner: 55, outer: 67 } // [P] the rings round it, to where the pickguard starts
/** the pickguard [P]: its inner edge round the rosette, down the treble side; [x, u] */
export const PICKGUARD: [number, number][] = (() => {
  const pts: [number, number][] = []
  const R = 67
  const c = SOUNDHOLE.u
  // round the rosette, from its top on the treble side down to where the guard leaves it
  const a0 = Math.atan2(467.2 - c, 50.3)
  const a1 = Math.atan2(570.8 - c, 27)
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((a1 - a0) * i) / 10
    pts.push([Math.cos(a) * R, c + Math.sin(a) * R])
  }
  pts.push([29, 610], [36.5, 621.6], [47, 628.9], [63, 636.3], [71, 639.5], [79, 636.3], [96, 628.9], [112.6, 621.6], [119.9, 614.3], [126.7, 592.2], [126.7, 570.2], [124.2, 548.1], [120.7, 533.4], [116, 518.7], [109.6, 504], [105.7, 496.6], [101.4, 489.3], [95.8, 482], [88.5, 474.6], [77.3, 467.2])
  return pts
})()
export const BRIDGE = {
  u0: 636, // [P] its front edge (toward the neck)
  u1: 668, // its back edge; its belly drops to 675 in the middle
  belly: 675,
  half: 77, // [P] 6 1/16" long
  h: 9, // tall at its middle; its wings taper to 6
  wing: 6,
  saddle: { treble: 645.6, bass: 649.8, half: 37, t: 3, h: 3 }, // [M] compensated: the bass end further back
  pins: 659, // the row of bridge pins
}
export const STRINGS = {
  nut: 36.3, // E to E at the nut (1 3/4" nut)
  saddle: (2 + 5 / 32) * IN, // [M] 54.8 at the saddle
  // low E to high E [open Hz, gauge in (medium: .013–.056), wound]
  set: [
    { note: 'E2', hz: 82.41, gauge: 0.056, wound: true },
    { note: 'A2', hz: 110.0, gauge: 0.045, wound: true },
    { note: 'D3', hz: 146.83, gauge: 0.035, wound: true },
    { note: 'G3', hz: 196.0, gauge: 0.026, wound: true },
    { note: 'B3', hz: 246.94, gauge: 0.017, wound: false },
    { note: 'E4', hz: 329.63, gauge: 0.013, wound: false },
  ],
  overNut: 1.2, // how far over the board at the nut
  overTop: BRIDGE.h + 3, // over the top at the saddle
}
/** where string i (0 = low E) crosses u, across: low E toward -x (the bass side) */
export function stringX(i: number, u: number) {
  const t = Math.min(1, Math.max(0, u / SCALE))
  const span = STRINGS.nut + (STRINGS.saddle - STRINGS.nut) * t
  return -span / 2 + (span * i) / 5
}
/** how high string i runs over the top at u */
export const stringZ = (u: number) => NECK.board + STRINGS.overNut + ((STRINGS.overTop - NECK.board - STRINGS.overNut) * Math.min(1, Math.max(0, u))) / SCALE
export const FRET_WIRE = { w: 2.8, h: 1.4 } // (thickened for the toy look: a real one's 2.4 × 1.2)
export const DOTS = [3, 5, 7, 9, 12, 15, 17] // [M] pearl dots

export const HEAD = {
  back: 15, // [P] angled back 15°
  length: 148, // [P] 143 foreshortened in the photo, so ~148 along it
  nutW: 55, // [P] its width by the nut, and at its top
  topW: 72,
  t: 14,
  posts: [38, 72, 106], // [P] the tuner posts, from the nut along it
}
export const NUT = { t: 6, h: 5 } // bone: 6 thick, 5 over the board

// ---- what goes with it
export const STRAP = { w: 50, t: 2.5 } // a woven 2" strap
export const PICK = { w: 26, l: 30, t: 0.9 } // a 351 shape (medium)
export const CASE = {
  outside: { l: 44.25 * IN, w: 18.25 * IN, h: 7.5 * IN }, // [K] 1124 × 464 × 191
  inside: { l: 42 * IN, body: 20.5 * IN, depth: 4 * IN }, // [K] 1067, 521, 102
  wall: 12,
  split: 0.66, // how much of its depth is the bottom shell (the lid the rest)
  open: 1.85, // how far its lid's open (rad)
  latches: 5, // [K]
}
/** it's about 1 m from its tail to the top of its head */
export const TOTAL = JOIN + BODY.length + HEAD.length * Math.cos((HEAD.back * Math.PI) / 180)
