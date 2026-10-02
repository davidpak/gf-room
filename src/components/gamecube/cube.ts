/**
 * [G] The Nintendo GameCube (DOL-001), indigo, measured. Its frame: x right, y up, z toward its front; the origin on
 * the ground under its middle; millimetres. Sources:
 *
 *   [W]  Wikipedia, "GameCube" (and dimensions.com, "GameCube"): 150 W × 110 H × 161 D; 1.4 kg (Wikipedia's:
 *        dimensions.com says 2.4)
 *   [DD] dimensions.com's dimensioned drawing (public/reference/gamecube/dimensions.svg): top, front and side
 *        elevations to scale, ~2.22 px a mm (its outlines come to 150, 110, 161 within 0.1): every position on the
 *        top, the front and the sides is read off its vectors (getBBox, getPointAtLength), to 0.1 mm
 *   [RR] Wikimedia Commons, "Nintendo GameCube rear.jpg" (public/reference/gamecube/rear.jpg): the back square on,
 *        6.05 px a mm across, 6.09 down: the handle and the sockets, scanned by pixel
 *   [PH] Wikimedia Commons, Evan-Amos's photos (open.jpg with the lid up, back-left.jpg, front-right.jpg) and David's
 *        (david.png): what no drawing has (the well, the handle's loop, the printed names, the lamp), by eye: est.
 *
 * Kept local, out of the repository: the reference folder (public/reference/gamecube/).
 */
export const CUBE = {
  w: 150, // [W]
  h: 110, // [W]
  d: 161, // [W]
  mass: 1.4, // [W]
  feet: 1.5, // [PH] est.: four rubber pads under its corners, barely proud
  round: 3, // [PH] est.: its edges' round
  band: 24.3, // [DD] the seam round its bottom (front: 587.5 in 397.5-641.4; side: 260.4 in 70.5-314.4)
  // the lid [DD] (x from the left side, y from the back, as the drawing has them): its sides at x 15.5 and 134.5, from
  // the back (less a 2.5 lip: est.) to its front edge, which bows out from 141.6 at its ends to 146.4 in the middle (a
  // circle's arc, r 219); notched round three of the buttons, r 11.8 about each. t: its thickness; open: how far it
  // swings up (radians, est. from open.jpg); gap: round it, in the top
  lid: { x0: 15.5, x1: 134.5, back: 2.5, frontEnds: 141.6, frontMid: 146.4, bowR: 219, notchR: 11.8, t: 4, open: 1.25, gap: 0.6 },
  window: { r: 41.75, z: 0 }, // [DD] the round black window, 185.9 px (83.5) across, its middle 80.5 from the back
  well: { depth: 10, drive: 42 }, // [PH] est. (open.jpg): the well under the lid, the black drive in it
  grip: { x0: 56.6, x1: 93.4, dip: 150.4 }, // [DD] the finger dip under the lid's front edge
  logo: { x0: 100.8, x1: 128.1, y0: 5.6, y1: 12.7 }, // [DD] the raised Nintendo pill, back right
  // the buttons [DD]: each in a ring 17.0 across, centred on the lid's side lines; POWER 40.2 from the back on the
  // left, RESET and OPEN 139.9 from the back; OPEN's own button 9.4 across in its ring
  buttons: {
    power: { x: -59.5, z: -40.3, r: 7.5, ring: 8.5 }, // light grey [PH]
    reset: { x: -59.5, z: 59.4, r: 7.4, ring: 8.5 },
    open: { x: 59.5, z: 59.4, r: 7.4, ring: 8.5, inner: 4.7 },
  },
  lamp: { x: -67.2, z: -27 }, // [PH] est.: the power lamp, in the strip beside the lid just in front of POWER
  // the front [DD]: the silver panel, 117.1 × 60.3 (16.5 in from each side, from the band's seam up to 84.6), 2.6
  // proud (the top view's strip 427.9-433.6); four ports Ø15.3 at x ±14.2, ±44.3, 64.6 up (their keyed insides
  // 9.7 × 8.4); the memory card slots 36.4 × 7.3 at x ±29.25, 38.3 up
  panel: { w: 117.1, y0: 24.3, y1: 84.6, proud: 2.6, r: 4 },
  ports: { y: 64.6, xs: [-44.3, -14.2, 14.2, 44.3], r: 7.65, key: { w: 9.7, h: 8.4 } },
  slots: { y: 38.3, xs: [-29.25, 29.25], w: 36.4, h: 7.3 },
  // each side [DD] (open.jpg, back-left.jpg: both have one): the vent grid, 8 × 8 cells of 6.79 (54.3 square),
  // centred front to back, 30.6 to 85.0 up
  vents: { n: 8, cell: 6.79, y0: 30.6, y1: 85.0 },
  // the back [RR]: the handle, a black strap 126.4 wide, 68.0 to 100.1 up (its loop out the back, est. [PH]: 30 out,
  // its corners r 20, 5 thick); the analog AV out 23 × 12.2 at x -30.5, 37.9 up; the digital one 22.5 wide at x 5.0;
  // DC 12V IN 15.4 × 10.8 at x -50, 58.3 up; ten vent slots across x -42.3..16.4, 15.4-26.9 up; the inset panel
  // they're on, x -53..54, 13-50 up. (Seen from behind: the photo's left is the console's right)
  handle: { w: 126.4, y0: 68.0, y1: 100.1, out: 30, r: 20, t: 5 },
  av: { x: -30.5, y: 37.9, w: 23, h: 12.2 },
  digital: { x: 5.0, y: 37.9, w: 22.5, h: 12.2 },
  dc: { x: -50, y: 58.3, w: 15.4, h: 10.8 },
  backVents: { x0: -42.3, x1: 16.4, y0: 15.4, y1: 26.9, n: 10 },
  backPanel: { x0: -53, x1: 54, y0: 13, y1: 50 },
}

/** what the references measure, as measured (for the checks): the drawing's lid outline, sampled (x from the left,
 *  y from the back), and positions read off it and off the rear photo */
export const CUBE_REF = {
  lidSamples: [
    [134.5, 62.7], [134.5, 125.3], [133.7, 127.6], [131.5, 128.6], [129.1, 129.5], [127.1, 130.9], [125.3, 132.6], [124, 134.8], [123.2, 137.1], [122.8, 139.6], [121.3, 141.5],
    [116.4, 142.4], [111.5, 143.1], [106.5, 143.9], [101.6, 144.5], [96.6, 145.1], [91.7, 145.6], [86.7, 146], [81.7, 146.3], [76.7, 146.4], [71.7, 146.4], [66.8, 146.2],
    [61.8, 145.9], [56.8, 145.4], [51.9, 144.9], [46.9, 144.3], [42, 143.6], [37, 142.9], [32.1, 142.1], [29.6, 141.7], [27.6, 140.5], [27, 138.1], [26.4, 135.7],
    [25.2, 133.5], [23.6, 131.5], [21.7, 130], [19.4, 128.9], [17, 128.2], [15.5, 126.3], [15.5, 90], [15.6, 53.6], [17.2, 51.8], [19.5, 51.1], [21.8, 50], [23.7, 48.5],
    [25.3, 46.5], [26.4, 44.3], [27, 41.8], [27.1, 39.3], [26.7, 36.9], [25.7, 34.6], [24.3, 32.5], [22.5, 30.8], [20.3, 29.5], [18, 28.7], [15.9, 27.5], [15.5, 25.1], [15.5, 10],
  ] as [number, number][],
  ports: [181.85, 249.15, 312.45, 379.7].map((px) => (px - 113.4) / 2.2313 - 75), // [DD] port middles, px → mm from the middle
  portY: 110 - (498.15 - 397.5) / 2.2173,
  handle: { x0: (98 - 25) / 6.053 - 75, x1: (862 - 25) / 6.053 - 75, top: 110 - (79 - 19) / 6.09, bottom: 110 - (275 - 19) / 6.09 }, // [RR]
  av: { x: 75 - (663.5 - 25) / 6.053, y: 110 - (458 - 19) / 6.09 }, // [RR]
}

/** the lid's outline on top, built from the spec: [x, z] round it (z toward the front). `grow` it outward (the hole
 *  in the top it sits in) */
export function lidOutline(grow = 0): [number, number][] {
  const L = CUBE.lid
  const { power, reset, open } = CUBE.buttons
  const xl = L.x0 - CUBE.w / 2 - grow
  const xr = L.x1 - CUBE.w / 2 + grow
  const back = L.back - CUBE.d / 2 - grow
  const n = L.notchR - grow
  const zMid = L.frontMid - CUBE.d / 2 + grow
  const R = L.bowR + grow
  const bow = (x: number) => zMid - R + Math.sqrt(R * R - x * x)
  // where a notch's circle meets the bow (between its centre and its edge on the side away from the corner)
  const meet = (bx: number, bz: number, toward: number) => {
    let a = bx
    let b = bx + toward * n
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2
      if (Math.hypot(m - bx, bow(m) - bz) < n) a = m
      else b = m
    }
    return a
  }
  const out: [number, number][] = [[xr, back]]
  const around = (cx: number, cz: number, a0: number, a1: number, steps = 16) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps
      out.push([cx + n * Math.cos(a), cz + n * Math.sin(a)])
    }
  }
  // down the right side to OPEN, round it on the inside to the bow
  const xo = meet(open.x, open.z, -1)
  const ao = Math.atan2(bow(xo) - open.z, xo - open.x)
  around(open.x, open.z, -Math.PI / 2, ao - 2 * Math.PI)
  // along the bow to RESET, round it to the left side
  const xs = meet(reset.x, reset.z, 1)
  for (let i = 1; i < 30; i++) {
    const x = xo + ((xs - xo) * i) / 30
    out.push([x, bow(x)])
  }
  around(reset.x, reset.z, Math.atan2(bow(xs) - reset.z, xs - reset.x), -Math.PI / 2)
  // up the left side, round POWER, on to the back
  around(power.x, power.z, Math.PI / 2, -Math.PI / 2)
  out.push([xl, back])
  return out
}

/** its checks: the spec against the references, and against itself */
export function checkCube() {
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })
  const C = CUBE
  const R = CUBE_REF
  const near = (a: number, b: number, t: number) => Math.abs(a - b) <= t
  add('150 × 110 × 161 [W]', C.w === 150 && C.h === 110 && C.d === 161, `${C.w} × ${C.h} × ${C.d}`)
  // the lid's outline against the drawing's: each sample's distance from the outline built from the spec
  const out = lidOutline()
  const off = (px: number, pz: number) => {
    let best = Infinity
    for (let i = 0; i < out.length; i++) {
      const [ax, az] = out[i]
      const [bx, bz] = out[(i + 1) % out.length]
      const vx = bx - ax
      const vz = bz - az
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)))
      best = Math.min(best, Math.hypot(px - ax - vx * t, pz - az - vz * t))
    }
    return best
  }
  const devs = R.lidSamples.map(([x, y]) => off(x - C.w / 2, y - C.d / 2))
  const worst = Math.max(...devs)
  add("the lid's outline on the drawing's [DD]", worst < 1.2, `${devs.length} samples, worst ${worst.toFixed(2)} off, mean ${(devs.reduce((a, b) => a + b, 0) / devs.length).toFixed(2)}`)
  const front = Math.max(...out.map((p) => p[1])) + C.d / 2
  add("the lid's front 146.4 from the back [DD]", near(front, C.lid.frontMid, 0.2), front.toFixed(1))
  add('the window Ø83.5 in the middle [DD]', near(2 * C.window.r, 83.5, 0.3) && C.window.z === 0, `Ø${2 * C.window.r}`)
  add('the window inside the lid, room round it', C.window.r + 12 < (C.lid.x1 - C.lid.x0) / 2, `${((C.lid.x1 - C.lid.x0) / 2 - C.window.r).toFixed(1)} each side`)
  add('each ring clears its notch by 3+ [DD]', Object.values(C.buttons).every((b) => C.lid.notchR - b.ring >= 3 - 0.01), `ring ${C.buttons.power.ring} in r ${C.lid.notchR}`)
  add('each button fits its ring', Object.values(C.buttons).every((b) => b.r < b.ring), Object.values(C.buttons).map((b) => b.r).join(', '))
  add('POWER 40.2 from the back, left [DD]', near(C.buttons.power.z + C.d / 2, 40.2, 0.2) && C.buttons.power.x < 0, `${(C.buttons.power.z + C.d / 2).toFixed(1)}`)
  add('the ports where the drawing has them [DD]', C.ports.xs.every((x, i) => near(x, R.ports[i], 0.3)) && near(C.ports.y, R.portY, 0.3), `${C.ports.xs.join(', ')} at ${C.ports.y} (drawing ${R.ports.map((v) => v.toFixed(1)).join(', ')} at ${R.portY.toFixed(1)})`)
  add('ports and slots mirror about the middle', near(C.ports.xs[0], -C.ports.xs[3], 0.01) && near(C.ports.xs[1], -C.ports.xs[2], 0.01) && near(C.slots.xs[0], -C.slots.xs[1], 0.01), 'yes')
  add('ports and slots inside the panel', C.ports.xs.every((x) => Math.abs(x) + C.ports.r < C.panel.w / 2) && C.ports.y + C.ports.r < C.panel.y1 && C.slots.y - C.slots.h / 2 > C.panel.y0, `panel ${C.panel.w} × ${(C.panel.y1 - C.panel.y0).toFixed(1)}`)
  add('the panel stands on the band [DD]', C.panel.y0 === C.band, `${C.panel.y0} on ${C.band}`)
  const grid = C.vents.n * C.vents.cell
  add('the vents 8 × 8, 54.3 square [DD]', near(grid, 54.3, 0.2) && near(C.vents.y1 - C.vents.y0, grid, 0.3), `${grid.toFixed(1)} × ${(C.vents.y1 - C.vents.y0).toFixed(1)}`)
  add('the handle 126.4 wide, 68.0-100.1 up [RR]', near(C.handle.w, R.handle.x1 - R.handle.x0, 0.5) && near(C.handle.y0, R.handle.bottom, 0.4) && near(C.handle.y1, R.handle.top, 0.4), `${C.handle.w}, ${C.handle.y0}-${C.handle.y1} (photo ${(R.handle.x1 - R.handle.x0).toFixed(1)}, ${R.handle.bottom.toFixed(1)}-${R.handle.top.toFixed(1)})`)
  add('the AV out where the rear photo has it [RR]', near(C.av.x, R.av.x, 0.6) && near(C.av.y, R.av.y, 1.5), `x ${C.av.x}, ${C.av.y} up (photo ${R.av.x.toFixed(1)}, ${R.av.y.toFixed(1)})`)
  const floor = C.h - C.well.depth
  const discTop = floor + 2 + 1 + 1.2 // (the drive, the spindle's seat, the disc)
  add('the disc lies under the shut lid', discTop < C.h - C.lid.t - 0.5, `disc top ${discTop.toFixed(1)}, the lid's underside ${C.h - C.lid.t}`)
  add('the 8 cm disc shows in the window', 40 < C.window.r, 'Ø80 under Ø83.5')
  add('1.4 kg [W]', C.mass === 1.4, `${C.mass} kg`)
  return results
}
