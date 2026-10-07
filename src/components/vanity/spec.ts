/**
 * Rina's jewellery stand and LED vanity mirror, left back on her desk, millimetres.
 *
 * Sources
 *   [P]  her photo (public/reference/room-desk-wall.jpg, left back, zoomed): a clear acrylic stand, a flat upright
 *        panel on a foot, a row of pegs along its top hung with gold chains (a pearl strand on the left, a pearl and
 *        a little star pendant among them), earrings in holes to the right (a red heart, pearls); beside it a white
 *        LED mirror, upright, a little taller than wide, a thin white frame round the glass, the LED dots showing
 *        down its sides. Sized against the laptop in front (a 13" MacBook, 304 wide) and the cards beside it
 *   [E]  estimates and the usual products: an acrylic necklace/earring organiser (about 20 × 26 cm), an 8" × 10"
 *        lighted makeup mirror on a short stand, the thicknesses, the weights
 *
 * Each one's frame: the middle of its footprint at x 0, z 0, its bottom on y 0, its front toward +z.
 */
export const STAND = {
  base: { w: 200, d: 70, h: 10, r: 8 }, // [E] the foot, a clear slab
  panel: { w: 200, h: 250, t: 5, z: -12, r: 10 }, // [P][E] the upright, standing in the foot a little back of its middle
  // [P] the pegs along the top, toward the front: the chains hang from them
  pegs: { y: 238, d: 4, len: 14, knob: 6, at: [-84, -64, -44, -24, -4, 16, 36, 56, 80] },
  // [P] the earring holes, to the right under the pegs
  holes: { d: 3.2, x: [36, 52, 68, 84], y: [204, 178, 152, 126, 100] },
  // [P] the chains: which peg, how far each drops below it, how wide its loop opens, a pearl strand or a chain, and
  // what hangs at its bottom
  necklaces: [
    { peg: 0, drop: 186, open: 10, pearls: true, pendant: 'none' },
    { peg: 1, drop: 196, open: 8, pearls: false, pendant: 'pearl' },
    { peg: 1, drop: 120, open: 6, pearls: false, pendant: 'none' },
    { peg: 2, drop: 150, open: 7, pearls: false, pendant: 'none' },
    { peg: 2, drop: 176, open: 12, pearls: false, pendant: 'heart' },
    { peg: 3, drop: 192, open: 9, pearls: false, pendant: 'star' },
    { peg: 3, drop: 104, open: 5, pearls: false, pendant: 'none' },
    { peg: 4, drop: 132, open: 6, pearls: false, pendant: 'pearl' },
    { peg: 4, drop: 168, open: 9, pearls: false, pendant: 'none' },
    { peg: 5, drop: 92, open: 6, pearls: true, pendant: 'none' },
  ] as { peg: number; drop: number; open: number; pearls: boolean; pendant: 'none' | 'pearl' | 'heart' | 'star' }[],
  chain: { r: 0.7 }, // [E] drawn a little chunky (a real chain is 1 mm across: invisible at a desk's distance)
  pearl: { r: 2.6, pitch: 5.6, pendant: 4.2 }, // [E]
  // [P] earrings in the holes: which column, which row, a pearl drop or a red heart
  earrings: [
    { col: 0, row: 0, kind: 'heart' },
    { col: 2, row: 0, kind: 'pearl' },
    { col: 1, row: 2, kind: 'pearl' },
    { col: 3, row: 3, kind: 'heart' },
  ] as { col: number; row: number; kind: 'pearl' | 'heart' }[],
  mass: 0.55, // [E] kg, the acrylic and what hangs on it
  colors: { acrylic: '#eaf4f6', gold: '#d8b45e', pearl: '#f6efe2', heart: '#c8323a' },
}

export const MIRROR = {
  head: { w: 200, h: 250, t: 13, r: 18, rim: 7 }, // [P][E] the frame: an 8" × 10" glass in a thin white rim
  glass: { inset: 1.5 }, // [E] how far the glass sits back of the rim's front
  tilt: 8, // [E] degrees it leans back on its stand
  base: { w: 130, d: 92, h: 16, r: 22 }, // [E] the foot, heavy (the batteries)
  neck: { w: 34, d: 18, h: 30 }, // [E] the post from the foot up to the hinge
  hinge: { y: 40 }, // [E] where the head turns: its bottom edge just above it
  leds: { inset: 13, pitch: 13, d: 4.5 }, // [P][E] the dots round the glass, 13 in from its edge
  mass: { head: 0.42, base: 0.3 }, // [E] kg
  colors: { frame: '#f4f2ee', glassTop: '#d7d3cc', glassBottom: '#9ea4ad', led: '#fff3dc', ledOff: '#e6e3dc' },
}

/** the LED dots' centres on the glass (x, y from its middle), round a rounded rectangle */
export function ledSpots() {
  const G = MIRROR.head
  const w = G.w - 2 * G.rim - 2 * MIRROR.leds.inset
  const h = G.h - 2 * G.rim - 2 * MIRROR.leds.inset
  const out: [number, number][] = []
  const nx = Math.round(w / MIRROR.leds.pitch)
  const ny = Math.round(h / MIRROR.leds.pitch)
  for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (w * i) / nx
    out.push([x, h / 2], [x, -h / 2])
  }
  for (let j = 1; j < ny; j++) {
    const y = -h / 2 + (h * j) / ny
    out.push([-w / 2, y], [w / 2, y])
  }
  return out
}

export type Check = { what: string; value: string; ok: boolean }

export function checkStand(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const S = STAND
  const H = S.base.h + S.panel.h
  c('an organiser’s size: about 20 × 26 cm [E]', `${S.panel.w} × ${H}`, S.panel.w >= 180 && S.panel.w <= 220 && H >= 240 && H <= 280)
  c('taller than wide, as in her photo [P]', `${(H / S.panel.w).toFixed(2)}`, H / S.panel.w > 1.15 && H / S.panel.w < 1.45)
  c('the panel stands in its foot', `z ${S.panel.z} ± ${S.panel.t / 2} in ±${S.base.d / 2}`, Math.abs(S.panel.z) + S.panel.t / 2 < S.base.d / 2 - 10)
  const pegsIn = S.pegs.at.every((x) => Math.abs(x) + S.pegs.knob / 2 <= S.panel.w / 2 - 4)
  c('the pegs on the panel', pegsIn ? 'inside its edges' : 'over an edge', pegsIn && S.pegs.y < S.base.h + S.panel.h - 6)
  const lowest = Math.min(...S.necklaces.map((n) => S.pegs.y - n.drop - (n.pendant === 'none' ? 0 : 10)))
  c('every chain clear of the foot', `the lowest at y ${lowest} over ${S.base.h}`, lowest > S.base.h + 4)
  const reach = S.pegs.len + S.pegs.knob
  c('the chains hang in front of the foot’s edge, not past it', `${S.panel.z + S.panel.t / 2 + reach} of ${S.base.d / 2}`, S.panel.z + S.panel.t / 2 + reach < S.base.d / 2)
  // the holes clear of the chains (the right of the last necklace peg) and inside the panel
  const lastPeg = Math.max(...S.necklaces.map((n) => S.pegs.at[n.peg])) + Math.max(...S.necklaces.map((n) => n.open)) / 2
  c('the earring holes to the right of the chains [P]', `from x ${S.holes.x[0]}, the chains to ${lastPeg}`, S.holes.x[0] - lastPeg > 8 && Math.max(...S.holes.x) < S.panel.w / 2 - 6)
  c('the holes under the pegs', `top row y ${S.holes.y[0]}, pegs ${S.pegs.y}`, S.holes.y[0] < S.pegs.y - 20 && Math.min(...S.holes.y) > S.base.h + 30)
  // its weight over the foot: the panel's middle line, back of the middle by z
  c('it stands: the weight over the foot', `z ${S.panel.z} of ±${S.base.d / 2}`, Math.abs(S.panel.z) < S.base.d / 2 - 15)
  return out
}

export function checkMirror(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const M = MIRROR
  const G = M.head
  c('an 8" × 10" mirror’s head [E]', `${G.w} × ${G.h}`, Math.abs(G.w - 203) < 15 && Math.abs(G.h - 254) < 15)
  c('a little taller than wide, as in her photo [P]', `${(G.h / G.w).toFixed(2)}`, G.h / G.w > 1.15 && G.h / G.w < 1.35)
  c('a thin rim round the glass [P]', `${G.rim} of ${G.w}`, G.rim / G.w < 0.05)
  const L = ledSpots()
  const gw = G.w / 2 - G.rim
  const gh = G.h / 2 - G.rim
  const inGlass = L.every(([x, y]) => Math.abs(x) + M.leds.d / 2 < gw - 5 && Math.abs(y) + M.leds.d / 2 < gh - 5)
  c('the LEDs on the glass, a ring round it', `${L.length} dots, ${M.leds.inset} in`, inGlass && L.length > 40)
  const a = (M.tilt * Math.PI) / 180
  c('the head clears the desk', `its bottom edge at y ${M.hinge.y}`, M.hinge.y > M.base.h + 10)
  c('the neck under the head', `${M.neck.w} on ${G.w}`, M.neck.w < G.w / 3 && M.base.h + M.neck.h >= M.hinge.y - 12)
  // the head leans back about the hinge: its middle (and weight) back of it by sin(tilt) × half its height
  const headZ = -Math.sin(a) * (G.h / 2)
  const cz = (headZ * M.mass.head) / (M.mass.head + M.mass.base)
  c('it stands: the leaning head’s weight over the foot', `centre at z ${cz.toFixed(1)} of ±${M.base.d / 2}`, Math.abs(cz) < M.base.d / 2 - 20)
  const topBack = -Math.sin(a) * G.h - Math.cos(a) * G.t
  c('leaning back, its top not past the foot by much', `top at z ${topBack.toFixed(0)}`, topBack > -M.base.d / 2 - 30)
  return out
}
