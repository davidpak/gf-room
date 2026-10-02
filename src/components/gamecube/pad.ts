/**
 * [C] The GameCube controller (DOL-003), measured. Sources:
 *
 *   [W]  Wikipedia, "GameCube controller": 140 × 100 × 65 mm; its cable 2 m (the first models'); A big and green
 *        in the middle of the right, B small and red low left of it, X and Y kidney-shaped right of and above it, the
 *        yellow C-stick low left of the face buttons, the D-pad under the main stick, START in the middle; L and R
 *        triggers, Z in front of R
 *   [DC] dimensions.com, "GameCube Controller", and its dimensioned drawing (public/reference/gamecube/
 *        controller.svg): 140 × 100 (4") × 65, 0.2 kg; its top view and side view to scale (3.591 px a mm), read off
 *        their vectors (getBBox, getPointAtLength) to 0.1 mm: the outline, the lobes, every button's place, size and
 *        shape, and the side's profile (how deep the grips hang). Its third view is drawn upside down: only its
 *        thickness and how far the buttons stand up are taken from it
 *   [PH] David's photos of an indigo one and a black one (pad-indigo.png, pad-black.webp): the colours, how the
 *        sticks' caps look, est.
 *
 * Its own frame in the drawing's terms: x across (right +), z from its far edge (the cable's) toward you, 0 to
 * 101.7; heights from its top surface (the lobes' tops), down negative. The model puts its origin on the ground
 * under its middle (./Controller).
 */
export const PAD2 = {
  w: 140, // [W][DC]
  d: 101.7, // [DC] (the drawing's 4": 365.5 px)
  thick: 64.5, // [DC] (its third view, grips' bottoms to the stick's cap)
  mass: 0.2, // [DC]
  cable: 2000, // [W]
  /** [DC] its outline from above (x, z), the grips reaching toward you, the D-pad's and C-stick's round pods between them */
  outline: [
    [-66.7, 34.5], [-67.5, 39.4], [-68.1, 44.4], [-68.7, 49.4], [-69.2, 54.5], [-69.6, 59.5], [-69.9, 64.5], [-70, 69.6], [-69.9, 74.6], [-69.7, 79.6], [-69.3, 84.6], [-68.5, 89.6],
    [-67.1, 94.5], [-64.6, 98.8], [-60.4, 101.5], [-55.4, 101.4], [-51.5, 98.3], [-49.2, 93.9], [-47.8, 89], [-46.9, 84.1], [-46.1, 79.1], [-45.3, 74.1], [-44.3, 69.2], [-42.8, 64.4],
    [-41, 66.6], [-40, 71.5], [-37.8, 76], [-34.4, 79.8], [-30.1, 82.4], [-25.3, 83.8], [-20.3, 83.8], [-15.4, 82.4], [-11.2, 79.8], [-7.8, 76.1], [-5.5, 71.6], [-4.6, 66.6],
    [-5.1, 61.6], [-6.9, 56.9], [-9.8, 52.8], [-13.6, 49.5], [-15.6, 46.2], [-10.7, 45.1], [-5.7, 44.5], [-0.6, 44.3], [4.4, 44.4], [9.4, 44.9], [14.4, 45.9], [14.6, 48.7],
    [10.7, 51.9], [7.5, 55.8], [5.4, 60.4], [4.6, 65.4], [5.2, 70.4], [7.1, 75], [10.2, 79], [14.3, 81.9], [19, 83.6], [24.1, 83.9], [29, 82.9], [33.4, 80.5], [37, 77],
    [39.6, 72.7], [40.8, 67.8], [42.3, 63.3], [44, 68], [45.1, 72.9], [45.9, 77.9], [46.7, 82.9], [47.6, 87.8], [48.8, 92.7], [50.8, 97.3], [54.3, 100.9], [59.2, 101.7],
    [63.7, 99.6], [66.7, 95.6], [68.2, 90.8], [69.1, 85.9], [69.6, 80.9], [69.9, 75.8], [70, 70.8], [69.9, 65.8], [69.7, 60.7], [69.3, 55.7], [68.9, 50.7], [68.3, 45.7],
    [67.6, 40.7], [66.9, 35.7], [66.3, 30.7], [64.9, 25.8], [62.6, 21.4], [59.4, 17.5], [57.2, 13.3], [53.4, 10], [49.7, 6.7], [45.2, 4.5], [40.2, 4.2], [35.3, 5.1],
    [30.6, 4.2], [25.7, 3], [20.8, 2], [15.8, 1.3], [10.8, 0.7], [5.8, 0.2], [0.7, 0], [-4.3, 0.1], [-9.3, 0.5], [-14.3, 1.1], [-19.3, 1.8], [-24.3, 2.7], [-29.2, 3.8],
    [-34.1, 5.2], [-38.8, 4.5], [-43.8, 4.3], [-48.5, 5.9], [-52.2, 9.3], [-54.4, 13.7], [-58.5, 16.7], [-61.9, 20.4], [-64.4, 24.7], [-66.1, 29.5],
  ] as [number, number][],
  /** [DC] the left lobe's outline (the raised top round the main stick and down round the D-pad; the right one mirrors it) */
  lobe: [
    [-17.7, 34.9], [-17.9, 31.4], [-18.7, 28], [-19.9, 24.7], [-21.6, 21.6], [-23.7, 18.8], [-26.3, 16.3], [-29.1, 14.2], [-32.2, 12.5], [-35.5, 11.3], [-39, 10.6], [-42.5, 10.4],
    [-46, 10.7], [-49.5, 11.5], [-52.8, 12.8], [-55.8, 14.6], [-58.6, 16.8], [-61.1, 19.3], [-63.1, 22.2], [-64.7, 25.3], [-65.9, 28.7], [-66.5, 32.1], [-66.7, 35.7], [-66.3, 39.2],
    [-65.3, 42.6], [-63.8, 45.8], [-61.9, 48.7], [-59.6, 51.4], [-56.9, 53.6], [-53.9, 55.5], [-50.7, 57], [-47.4, 58.4], [-44.5, 60.3], [-42.3, 63.1], [-41, 66.4], [-40.4, 69.8],
    [-39.3, 73.2], [-37.6, 76.3], [-35.3, 78.9], [-32.5, 81.1], [-29.4, 82.7], [-26, 83.7], [-22.5, 84], [-19, 83.6], [-15.6, 82.5], [-12.5, 80.8], [-9.8, 78.5], [-7.6, 75.8],
    [-6, 72.7], [-4.9, 69.3], [-4.6, 65.8], [-5, 62.3], [-6, 58.9], [-7.6, 55.7], [-9.7, 52.9], [-12.3, 50.5], [-15, 48.3], [-17, 45.4], [-17.9, 42], [-17.9, 38.5],
  ] as [number, number][],
  /** [DC] the side's profile: how far below the top the underside reaches (z, h), and how far the top's come down (the
   *  grips sloping away toward you) */
  under: [[14.5, -37.3], [18.8, -41.4], [27.2, -39.2], [35.7, -38], [44.2, -39.6], [52, -43.4], [59.9, -47], [68.1, -49.7], [76.7, -51.1], [78.9, -51.2], [87.5, -50.2], [95.3, -46.7], [100.8, -40.1], [101.5, -35.8]] as [number, number][],
  over: [[41.3, 0], [49.9, -0.6], [58.5, -1.9], [66.9, -4.2], [75, -7.2], [82.8, -11], [90.1, -15.7], [96.2, -21.9], [100.4, -29.4], [101.4, -33.7]] as [number, number][],
  // [DC] the main stick: in an octagonal gate 25.3 across its corners, a round surround 32.9 across; its cap 17.4
  // across (rings at 11.8, 8.4), 3.6 thick, on a shaft 9.7 wide; the cap's top 12.5 above the top (side view)
  stick: { x: -42.2, z: 34.9, gate: 12.63, surround: 16.45, cap: 8.7, capT: 3.6, shaft: 4.85, top: 12.5 },
  // [DC] A Ø17.3 in its well (r 16.5); B Ø10.3; X and Y, kidneys round A (their outlines below); START Ø7.5 in the middle
  a: { x: 42.2, z: 34.9, r: 8.65, well: 16.5 },
  b: { x: 27.5, z: 42.4, r: 5.15 },
  start: { x: 0, z: 35.3, r: 3.75 },
  X: [[55.1, 34], [55.3, 35.4], [55.6, 36.8], [56.3, 38.1], [57.5, 38.8], [58.9, 39.1], [60.3, 39], [61.6, 38.5], [62.5, 37.5], [62.8, 36.1], [62.9, 34.7], [62.8, 33.2], [62.6, 31.8], [62.4, 30.4], [62.1, 29], [61.7, 27.6], [61.1, 26.3], [60.3, 25.2], [59.2, 24.3], [57.8, 24], [56.4, 24.1], [55.1, 24.7], [54.1, 25.7], [53.7, 27.1], [53.9, 28.5], [54.3, 29.9], [54.8, 31.2], [55, 32.6]] as [number, number][],
  Y: [[41.3, 22.3], [42.7, 22.2], [44.1, 21.8], [45.3, 21.1], [46.1, 19.9], [46.3, 18.5], [46.2, 17.1], [45.7, 15.8], [44.6, 14.9], [43.2, 14.6], [41.8, 14.6], [40.4, 14.7], [39, 14.9], [37.6, 15.2], [36.2, 15.5], [34.8, 15.9], [33.5, 16.5], [32.4, 17.3], [31.5, 18.5], [31.2, 19.8], [31.4, 21.3], [32, 22.5], [33, 23.5], [34.4, 23.9], [35.8, 23.7], [37.1, 23.3], [38.5, 22.8], [39.9, 22.5]] as [number, number][],
  // [DC] the D-pad: a cross 18.7 across, its arms 5.9 wide, in a round well 23.6 across; the C-stick: a cap Ø12 in an
  // octagonal gate 23.6 across its corners; each on its pod, mirrored about the middle
  dpad: { x: -22.75, z: 65.85, span: 18.7, arm: 5.9, well: 11.8, top: 1.7 },
  cstick: { x: 22.75, z: 65.85, gate: 11.8, cap: 6, top: 7 },
  // [DC] on the far edge: L (x -54..-35.6) and R (mirrored), z 4.1-13.4 from above; Z on R, x 38.3-52.2, z 4.1-9.3;
  // the cable leaving the far edge's middle 19.5 below the top (its third view: the plug's port 12 wide)
  trigger: { x0: 35.6, x1: 54, z0: 4.1, z1: 13.4 },
  z: { x0: 38.3, x1: 52.2, z0: 4.1, z1: 9.3 },
  cableAt: { h: -19.5 },
  // [PH] est.: how high the face buttons stand above the top (the third view's: A 5.3, B 7.2, X 5)
  rise: { a: 4.5, b: 4, xy: 4, start: 2 },
}

/** [est. from DC's top and side views] each grip as a tube: its middle (x, h) and half its width and height at each
 *  z, from where it leaves the shoulder (the triggers' housing) to its rounded end: its edges on the outline from
 *  above, its top and bottom on the side's profile */
export const GRIP: { z: number; x: number; h: number; a: number; b: number }[] = [
  { z: 6, x: -50, h: -16, a: 11, b: 13 },
  { z: 14, x: -54, h: -19, a: 13.5, b: 18.5 },
  { z: 27, x: -55, h: -19.5, a: 14, b: 19.5 },
  { z: 45, x: -56, h: -20.5, a: 13.5, b: 19.5 },
  { z: 55, x: -56.4, h: -23.5, a: 13.4, b: 21.5 },
  { z: 64, x: -56.4, h: -26, a: 13.4, b: 22.5 },
  { z: 72, x: -57.2, h: -28.5, a: 12.6, b: 21.8 },
  { z: 79, x: -58, h: -30.3, a: 11.8, b: 20.9 },
  { z: 85, x: -58.2, h: -31.6, a: 11, b: 18.8 },
  { z: 90, x: -58.2, h: -32.7, a: 10, b: 16.6 },
  { z: 95, x: -58, h: -34.3, a: 8.6, b: 12.4 },
  { z: 99, x: -58, h: -34.8, a: 6.3, b: 7 },
  { z: 101.4, x: -58, h: -35.2, a: 1.5, b: 1.5 },
]

/** its checks: the spec against the references, and against itself */
export function checkPad() {
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })
  const P = PAD2
  const near = (a: number, b: number, t: number) => Math.abs(a - b) <= t
  const xs = P.outline.map((p) => p[0])
  const zs = P.outline.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs)
  const d = Math.max(...zs) - Math.min(...zs)
  add('140 × 100 from above [W][DC]', near(w, 140, 0.5) && near(d, 100, 2), `${w.toFixed(1)} × ${d.toFixed(1)}`)
  const deepest = Math.min(...P.under.map((u) => u[1]))
  add('65 thick, grips to stick top [W][DC]', near(-deepest + P.stick.top, 65, 1.5), `${(-deepest + P.stick.top).toFixed(1)}`)
  add('the main stick and A level, mirrored [DC]', P.stick.z === P.a.z && near(P.stick.x, -P.a.x, 0.01), `x ±${P.a.x}, z ${P.a.z}`)
  add('the D-pad and C-stick mirrored, level [DC]', P.dpad.z === P.cstick.z && near(P.dpad.x, -P.cstick.x, 0.01), `x ±${P.cstick.x}, z ${P.cstick.z}`)
  add('START on the middle line [DC]', P.start.x === 0, `z ${P.start.z}`)
  add('A the biggest, B smaller [W][DC]', 2 * P.a.r > 2 * P.b.r + 5, `Ø${2 * P.a.r}, Ø${2 * P.b.r}`)
  const c = (pts: [number, number][]) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
  const [xx, xz] = c(P.X)
  const [yx, yz] = c(P.Y)
  add("X right of A, Y above it [W][DC]", xx > P.a.x + 8 && Math.abs(xz - P.a.z) < 6 && yz < P.a.z - 8 && Math.abs(yx - P.a.x) < 6, `X (${xx.toFixed(1)}, ${xz.toFixed(1)}), Y (${yx.toFixed(1)}, ${yz.toFixed(1)})`)
  add('B low left of A, C-stick lower left [W]', P.b.x < P.a.x && P.b.z > P.a.z && P.cstick.x < P.b.x && P.cstick.z > P.b.z, 'yes')
  // every button inside the outline (crossing count)
  const inside = (x: number, z: number) => {
    let k = false
    for (let i = 0, j = P.outline.length - 1; i < P.outline.length; j = i++) {
      const [xi, zi] = P.outline[i]
      const [xj, zj] = P.outline[j]
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) k = !k
    }
    return k
  }
  const spots = [[P.stick.x, P.stick.z], [P.a.x, P.a.z], [P.b.x, P.b.z], [P.start.x, P.start.z], [P.dpad.x, P.dpad.z], [P.cstick.x, P.cstick.z], [xx, xz], [yx, yz]]
  add('every button inside the outline [DC]', spots.every(([x, z]) => inside(x, z)), `${spots.length} of ${spots.length}`)
  // the grips' tubes against the side's profile: their bottoms on its underside, their tops under its top line
  const at = (z: number) => {
    const i = GRIP.findIndex((g) => g.z >= z)
    const a = GRIP[Math.max(0, i - 1)]
    const b = GRIP[Math.max(0, i)]
    const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z)
    return { h: a.h + (b.h - a.h) * t, b: a.b + (b.b - a.b) * t }
  }
  const prof = (pts: [number, number][], z: number) => {
    const i = pts.findIndex((p) => p[0] >= z)
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.max(0, i)]
    const t = b[0] === a[0] ? 0 : (z - a[0]) / (b[0] - a[0])
    return a[1] + (b[1] - a[1]) * t
  }
  const devs = [30, 45, 60, 70, 79, 88, 95].map((z) => Math.abs(at(z).h - at(z).b - prof(P.under, z)))
  add("the grips' bottoms on the side's profile [DC]", Math.max(...devs) < 2, `worst ${Math.max(...devs).toFixed(1)} mm off (z 30-95)`)
  const tops = [60, 70, 79, 88, 95].map((z) => at(z).h + at(z).b - prof(P.over, z))
  add("the grips' tops under the side's top line [DC]", Math.max(...tops) < 2, `worst ${Math.max(...tops).toFixed(1)} over`)
  add('the grips end where the outline does [DC]', near(GRIP[GRIP.length - 1].z, 101.4, 0.5) && near(GRIP[GRIP.length - 1].x, -58, 1), `z ${GRIP[GRIP.length - 1].z}`)
  add('its cable 2 m [W]', P.cable === 2000, `${P.cable / 1000} m`)
  add('0.2 kg [DC]', P.mass === 0.2, `${P.mass} kg`)
  return results
}
