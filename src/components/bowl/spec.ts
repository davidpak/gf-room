/**
 * Rina's bowl and its chopsticks, millimetres.
 *
 *   the bowl        a deep, round-bellied ceramic rice / noodle bowl on a little foot ring. Inside: white glaze with
 *                   blue-teal pinwheels (rings of slanted dashes round a dot, which read as swirls) and dots between.
 *                   Outside: a dark slate glaze under a light lattice of long hexagons. The lip a dark edge
 *   the chopsticks  a pair of stainless (Korean style) chopsticks, square and tapering, lying side by side across the
 *                   bowl from rim to rim, overhanging both sides
 *
 * Sources
 *   [P]  her photo room-desk-night.jpg (front right, zoomed): the inside's pattern, the outside's lattice, the dark
 *        rim, the chopsticks lying across it diagonally, overhanging both rims
 *   [E]  real products: a 6" ceramic bowl (150 across, 70 tall, a foot ring about 65 across, walls 4 to 5,
 *        0.3 kg); stainless chopsticks (230 long, about 5.5 square at the top tapering to 3, 25 g each)
 *
 * Its frame: the foot's middle at x 0, z 0, its bottom on y 0 (round, so +z, its front, is only where the
 * chopsticks' tips point away from: they cross it from back left to front right). Profiles are (r, y).
 */
export const BOWL = {
  r: 75, // [E] 150 across
  h: 70, // [E] tall, to the top of the lip
  wall: 4.5, // [E]
  // [E] the foot ring: its outside and inside radii, its height; the underside inside it lifted `recess`
  foot: { rOut: 33.5, rIn: 28, h: 7, recess: 3 },
  // [P] the belly: a curve from the foot's top out and up to the rim, through this control point (r, y): full and
  // round, nearly upright at the rim
  belly: { ctrl: [70, 10] as [number, number] },
  floor: 11.5, // [E] the inside floor's height
  // [P] the inside's pinwheels: each `motif` mm across, in rings `rings` mm out from the middle (along the surface)
  motif: 26,
  rings: [0, 29, 57, 84, 108],
  colors: { glaze: '#f4f1ea', blue: '#5f97a3', outside: '#4c5560', lattice: '#bcc3c6', lip: '#3d3836', clay: '#b9a68e', steel: '#cdcdcf' },
  chop: {
    len: 230, // [E]
    butt: 2.75, // [E] half the square at the top end
    tip: 1.5, // [E] ...and at the tip
    yaw: 0.6, // [P] across the bowl, back left to front right (radians round y, from +x)
    off: [5, 15.5], // [P] each one's line from the bowl's middle, seen from above (side by side)
    tipOver: [32, 38], // [P] how far each tip end reaches past the rim (the butts overhang more)
  },
  mass: { bowl: 0.3, chop: 0.025 }, // [E] kg
}

const B = BOWL
type P = [number, number]
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as P
  })

/** the belly's outside curve, from the foot's top to the rim, and each point's inward normal */
function belly(n = 28) {
  const p0: P = [B.foot.rOut + 0.5, B.foot.h]
  const p1 = B.belly.ctrl
  const L = B.wall / 2
  const p2: P = [B.r, B.h - L]
  const pts: P[] = []
  const nrm: P[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = (1 - t) * (1 - t)
    const b = 2 * t * (1 - t)
    const c = t * t
    pts.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]])
    const dr = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
    const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
    const k = Math.hypot(dr, dy)
    nrm.push([-dy / k, dr / k]) // (turned toward the inside: up and in)
  }
  return { pts, nrm }
}

/** the bowl's profile: outside (the underside, the foot ring, the belly, half the lip; clay below `footTop`) and
 *  inside (the other half of the lip, down the inside of the belly, across the floor to the middle) */
export function bowlProfile() {
  const F = B.foot
  const { pts, nrm } = belly()
  const outer: P[] = [[0, F.recess], [F.rIn - 1.5, F.recess], [F.rIn, 0.6], [F.rIn + 0.8, 0], [F.rOut - 0.8, 0], [F.rOut, 0.8], ...pts]
  const inBelly = pts.map(([r, y], i) => [r + nrm[i][0] * B.wall, y + nrm[i][1] * B.wall] as P)
  // the lip: a half round from the outside's top over to the inside's
  const [or, oy] = pts[pts.length - 1]
  const [ir, iy] = inBelly[inBelly.length - 1]
  const cr = (or + ir) / 2
  const cy = (oy + iy) / 2
  const rad = Math.hypot(or - ir, oy - iy) / 2
  const a0 = Math.atan2(oy - cy, or - cr)
  outer.push(...arc(cr, cy, rad, a0, Math.PI / 2, 4).slice(1))
  const inner: P[] = [...arc(cr, cy, rad, Math.PI / 2, a0 + Math.PI, 4), ...inBelly.slice(0, -1).reverse()]
  // (the floor: level from where the inside of the belly bottoms out, to the middle)
  inner.push([inner[inner.length - 1][0] * 0.6, B.floor], [0, B.floor])
  return { outer, inner, lipR: cr, top: cy + rad }
}

/** arc lengths along a profile, from its first point */
export function lengths(pts: P[]) {
  const s = [0]
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return s
}

/** each chopstick as it lies: its middle, its yaw and pitch (round y, then z: its own +x the butt end), and the stick's
 *  own x where it crosses each rim. Its underside is level (the taper's tilt taken up by the pitch), resting on the lip */
export function chopsticks() {
  const C = B.chop
  const { lipR, top } = bowlProfile()
  const slope = (C.butt - C.tip) / C.len
  const pitch = Math.atan(slope)
  const dir = [Math.cos(C.yaw), -Math.sin(C.yaw)] // its +x seen from above (x, z)
  const side = [Math.sin(C.yaw), Math.cos(C.yaw)]
  return C.off.map((d, k) => {
    const L = Math.sqrt(lipR * lipR - d * d)
    const c = -L - C.tipOver[k] + C.len / 2 // its middle along the chord
    const half = (C.tip + C.butt) / 2
    return {
      at: [side[0] * d + dir[0] * c, top + half, side[1] * d + dir[1] * c] as [number, number, number],
      yaw: C.yaw,
      pitch,
      cross: [-L - c, L - c],
      half,
    }
  })
}

export type Check = { what: string; value: string; ok: boolean }
export function checkBowl(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const { inner, lipR, top } = bowlProfile()
  c('a 6" bowl’s size [E]', `${2 * B.r} across × ${top.toFixed(1)} tall`, 2 * B.r === 150 && Math.abs(top - B.h) < 1)
  // what it holds, to a finger under the brim
  const pts = inner.filter(([, y]) => y < top - 5).sort((a, b) => a[1] - b[1])
  let v = 0
  for (let i = 1; i < pts.length; i++) v += (Math.PI * (pts[i][1] - pts[i - 1][1]) * (pts[i - 1][0] ** 2 + pts[i - 1][0] * pts[i][0] + pts[i][0] ** 2)) / 3
  c('it holds a bowl of noodles (500 to 800 ml) [E]', `${(v / 1000).toFixed(0)} ml`, v / 1000 > 450 && v / 1000 < 850)
  c('a hollow with real walls', `walls ${B.wall}, the floor ${B.floor - B.foot.recess} thick`, B.wall >= 4 && B.floor - B.foot.recess >= 6)
  c('round bellied: wide well below the rim [P]', `the control point at ${B.belly.ctrl.join(', ')}`, B.belly.ctrl[0] > B.r * 0.85 && B.belly.ctrl[1] < B.h * 0.25)
  c('a foot ring under it, about 65 across [E]', `${2 * B.foot.rOut}`, Math.abs(2 * B.foot.rOut - 65) < 6)
  c('it stands: the foot wide enough not to rock', `${(B.foot.rOut / B.r).toFixed(2)} of its width`, B.foot.rOut / B.r > 0.38)
  const S = chopsticks()
  const C = B.chop
  const over = S.every((s) => s.cross[0] > -C.len / 2 + 20 && s.cross[1] < C.len / 2 - 20)
  c('the chopsticks span the bowl, overhanging both rims [P]', S.map((s) => `${(s.cross[0] + C.len / 2).toFixed(0)} / ${(C.len / 2 - s.cross[1]).toFixed(0)} over`).join(', '), over)
  const gap = Math.abs(C.off[1] - C.off[0]) - 2 * C.butt
  c('side by side, not touching', `${gap.toFixed(1)} apart at the butts`, gap > 2 && gap < 10)
  c('they rest on the lip, not in the glaze', `their undersides at ${top.toFixed(1)}, the lip at r ${lipR.toFixed(1)}`, S.every((s) => Math.abs(s.at[1] - s.half - top) < 0.01))
  c('real chopsticks: 230 long, square, tapering [E]', `${C.len}, ${2 * C.butt} to ${2 * C.tip}`, C.len === 230 && C.butt > C.tip)
  return out
}
