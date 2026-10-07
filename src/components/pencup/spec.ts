/**
 * Rina's pen cup: a red glazed ceramic cup, fluted (rounded ribs up its side), full of what's on her desk, millimetres.
 *
 * Sources
 *   [P]  her photos: room-desk-night.jpg (by the lamp: the red cup, its ribs catching the light down its left side,
 *        black pens and a grey-clear one leaning back, yellow highlighters with their caps up, and her black eyelash
 *        curler hung on the front: its clamp hooked over the rim, its arms and handles down the outside of the cup,
 *        black over the red), room-desk-wide.png (the same from the left: the same cup, squat, the pens fanning out of it).
 *        Read off the night photo: the cup about as wide as it is tall, the pens out above its rim by about two
 *        thirds of its height, all leaning outward from the middle like a bouquet
 *   [E]  real things: a ceramic desk cup's wall and floor, a retractable gel pen (Pilot G2: 145 long, 10.7 across
 *        its grip), a round highlighter (about 120 long, 16 across), a used hex pencil (7.5 across the flats), an
 *        eyelash curler (about 105 long, its clamp about 34 across), their weights
 *
 * Frame: the middle of the cup's footprint at x 0, z 0, its bottom on y 0, its front toward +z.
 *
 * Contents: each pen, highlighter and pencil stands with its foot (its lower end) on the cup's floor (`at`: out
 * along the way it leans, and across) and leans out toward `toward` (degrees round from +x toward +z: 90 is the
 * front) until it rests on the rim's inner edge, as a pen does in a cup: its lean isn't set, it follows from where
 * its foot is (`lean()`). The curler isn't in it but on it: hung over the front rim (`curlerPaths()`).
 */
export const PENCUP = {
  cup: {
    rTop: 45, // [P][E] at the rim (90 across: the photo's squat cup, a little wider than the usual 80)
    rFoot: 41, // [P] a slight taper down
    h: 92, // [P] about as tall as it is wide
    wall: 5, // [E] glazed earthenware
    floor: 8, // [E]
    rim: 2.5, // [E] the rim rounded over
    foot: 3, // [E] its foot rounded
    ribs: { n: 20, depth: 1.6, top: 6, bottom: 5 }, // [P] the flutes, stopping short of the rim and the foot
  },
  pen: { len: 142, r: 5, grip: 5.4, plunger: 3, clip: { w: 3.6, len: 40, t: 1.6 } }, // [E] a G2
  highlighter: { len: 120, r: 7.5, cap: 8.2, capLen: 36 }, // [E]
  pencil: { len: 160, r: 4.3 }, // [E] across the corners (7.5 across the flats)
  // [P][E] the curler, hung on the front rim: in its own frame (x across, y up from the loops' bottom, +z away from
  // the cup), its plane a little off the wall, its clamp bent back over the rim into the cup
  curler: { x: -3, y: 4, z: 48, tube: 2.4, loop: { r: 7.5, x: 9, y: 10 }, hinge: 55, half: 16, top: 97, reach: 16 },
  // what's in it (fitted so none goes through another; see the check): kind, colour, its foot on the floor, the way it
  // leans, its turn about its own length (0: a pen's clip outward)
  items: [
    { kind: 'pen', color: 'black', at: [15, 4], toward: -100, spin: 0 },
    { kind: 'pen', color: 'black', at: [17, 3], toward: -55, spin: 0 },
    { kind: 'pen', color: 'clear', at: [18, 4], toward: -140, spin: 0 },
    { kind: 'highlighter', color: 'yellow', at: [-2, 2], toward: -165, spin: 40 },
    { kind: 'highlighter', color: 'yellow', at: [19, 2], toward: 0, spin: -30 },
    { kind: 'highlighter', color: 'green', at: [15, -1], toward: 150, spin: 20 },
    { kind: 'pencil', color: 'yellow', at: [24, 4], toward: 45, spin: 10 },
  ] as Item[],
  lift: 30, // how far a clicked one comes up before it drops back
  mass: 0.42, // [E] kg: the cup ~0.3, the rest ~0.12
  colors: {
    cup: '#d8323a',
    inside: '#b8262e',
    penBlack: '#2c2a33',
    penGrip: '#45424d',
    penClear: '#c9c6d2',
    metal: '#b9b8c4',
    hlYellow: '#f4e25a',
    hlYellowCap: '#e9cf33',
    hlGreen: '#8fd66a',
    hlGreenCap: '#62bf4e',
    pencil: '#f1bf3a',
    wood: '#ecc99c',
    lead: '#3a3840',
    eraser: '#f2a0a6',
    curler: '#2b2a31',
    pad: '#4b4855',
  },
}
export type Kind = 'pen' | 'highlighter' | 'pencil'
/** at: its foot, out along the way it leans and across it (mm) */
export type Item = { kind: Kind; color: string; at: [number, number]; toward: number; spin: number }

const C = PENCUP.cup
/** the cup's inner radius at height y (the outer taper, less the wall) */
export const innerR = (y: number) => C.rFoot + ((C.rTop - C.rFoot) * y) / C.h - C.wall
/** a thing's radius where it touches the rim, and how long it is */
export function size(k: Kind) {
  const P = PENCUP
  if (k === 'pen') return { r: P.pen.grip, len: P.pen.len }
  if (k === 'highlighter') return { r: P.highlighter.cap, len: P.highlighter.len }
  return { r: P.pencil.r, len: P.pencil.len }
}
/** where it stands: its foot (x, y, z) and its axis (unit), leaning till it rests on the rim's inner edge */
export function lean(it: Item) {
  const { r } = size(it.kind)
  const a = (it.toward * Math.PI) / 180
  const ux = Math.cos(a)
  const uz = Math.sin(a)
  const fx = ux * it.at[0] - uz * it.at[1]
  const fz = uz * it.at[0] + ux * it.at[1]
  const y0 = C.floor
  const H = C.h - C.rim - y0 // up to where the rim rounds over
  const R = innerR(C.h) - r // its axis this far out at the rim
  const fu = fx * ux + fz * uz
  const t = -fu + Math.sqrt(fu * fu - (fx * fx + fz * fz) + R * R) // out along u from the foot to there
  const L = Math.hypot(t, H)
  return { foot: [fx, y0, fz] as [number, number, number], axis: [(ux * t) / L, H / L, (uz * t) / L] as [number, number, number], angle: Math.atan2(t, H) }
}

type V3 = [number, number, number]
/** the curler's tubes, as lines through points in its own frame (see PENCUP.curler): the two handles from the loops
 *  up to the hinge, the two arms up from it and bent back over the rim, the clamp's frame across their ends and its
 *  pad below that. The loops are rings round (±loop.x, loop.y) in its plane */
export function curlerPaths() {
  const K = PENCUP.curler
  const L = K.loop
  const side = (sx: number) => ({
    handle: [[sx * L.x, L.y + L.r, 0], [sx * 5, 36, 0], [sx * 2.5, K.hinge, 0]] as V3[],
    arm: [[sx * 3, K.hinge, 0], [sx * 12, 72, 0], [sx * K.half, 86, 0], [sx * K.half, K.top - 1, -4], [sx * K.half, K.top + 1, -K.reach / 2], [sx * K.half, K.top, -K.reach]] as V3[],
  })
  const l = side(-1)
  const r = side(1)
  return {
    handles: [l.handle, r.handle],
    arms: [l.arm, r.arm],
    clamp: [[-K.half, K.top, -K.reach], [0, K.top, -K.reach - 5], [K.half, K.top, -K.reach]] as V3[],
    pad: [[-K.half + 3, K.top - 6, -K.reach + 1], [0, K.top - 6, -K.reach - 4], [K.half - 3, K.top - 6, -K.reach + 1]] as V3[],
  }
}
/** points along all the curler's tubes and round its loops, in the cup's frame */
export function curlerPoints() {
  const K = PENCUP.curler
  const P = curlerPaths()
  const out: V3[] = []
  const world = ([x, y, z]: V3): V3 => [x + K.x, y + K.y, z + K.z]
  for (const line of [...P.handles, ...P.arms, P.clamp, P.pad])
    for (let i = 0; i < line.length - 1; i++)
      for (let k = 0; k < 8; k++) out.push(world(line[i].map((v, j) => v + ((line[i + 1][j] - v) * k) / 8) as V3))
  for (const sx of [-1, 1])
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      out.push(world([sx * K.loop.x + Math.cos(a) * K.loop.r, K.loop.y + Math.sin(a) * K.loop.r, 0]))
    }
  return out
}
const outerR = (y: number) => C.rFoot + ((C.rTop - C.rFoot) * y) / C.h

/** the nearest two segments come (each a thing's axis, foot to `upTo` above the floor) */
function segDist(a0: number[], a1: number[], b0: number[], b1: number[]) {
  let best = Infinity
  const N = 24
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const s = i / N
      const t = j / N
      const d = Math.hypot(...[0, 1, 2].map((k) => a0[k] + (a1[k] - a0[k]) * s - (b0[k] + (b1[k] - b0[k]) * t)))
      if (d < best) best = d
    }
  return best
}

export type Check = { what: string; value: string; ok: boolean }
export function checkPenCup(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const P = PENCUP
  c('a desk cup’s size: 75–95 across, 85–105 tall [E]', `${2 * C.rTop} × ${C.h}`, 2 * C.rTop >= 75 && 2 * C.rTop <= 95 && C.h >= 85 && C.h <= 105)
  c('squat as in her photo: about as wide as it’s tall [P]', `${((2 * C.rTop) / C.h).toFixed(2)}`, Math.abs((2 * C.rTop) / C.h - 1) < 0.1)
  c('the ribs stand clear of the wall’s thickness', `${C.ribs.depth} of ${C.wall}`, C.ribs.depth < C.wall / 2)
  c('a real G2 and a real pencil [E]', `pen ${P.pen.len} × ${2 * P.pen.grip}, pencil ${P.pencil.len}`, Math.abs(P.pen.len - 145) < 8 && Math.abs(2 * P.pen.grip - 10.7) < 1 && P.pencil.len < 191)
  const L = P.items.map(lean)
  const feetIn = P.items.every((it, i) => Math.hypot(L[i].foot[0], L[i].foot[2]) + size(it.kind).r <= innerR(C.floor) + 0.01)
  c('every foot on the floor, inside the wall', feetIn ? 'inside' : 'through the wall', feetIn)
  const angles = L.map((l) => (l.angle * 180) / Math.PI)
  c('they lean as pens in a cup do: 8°–30° [P]', `${Math.min(...angles).toFixed(0)}°–${Math.max(...angles).toFixed(0)}°`, angles.every((a) => a >= 8 && a <= 30))
  const above = P.items.map((it, i) => L[i].foot[1] + size(it.kind).len * L[i].axis[1] - C.h)
  c('each well out over the rim (to be seen, to be picked) [P]', `${Math.min(...above).toFixed(0)} – ${Math.max(...above).toFixed(0)} above`, above.every((a) => a >= 22))
  const pens = P.items.map((it, i) => (it.kind === 'pen' ? above[i] : NaN)).filter((a) => !isNaN(a))
  c('the pens out by about two thirds of the cup [P]', `${(Math.max(...pens) / C.h).toFixed(2)}`, Math.max(...pens) / C.h > 0.5 && Math.max(...pens) / C.h < 0.8)
  // none through another, up to just over the rim (above it they fan apart)
  let worst = Infinity
  let pair = ''
  const up = C.h + 12 - C.floor
  for (let i = 0; i < L.length; i++)
    for (let j = i + 1; j < L.length; j++) {
      const a = L[i]
      const b = L[j]
      const a1 = a.foot.map((v, k) => v + (a.axis[k] * up) / a.axis[1])
      const b1 = b.foot.map((v, k) => v + (b.axis[k] * up) / b.axis[1])
      const gap = segDist(a.foot, a1, b.foot, b1) - size(P.items[i].kind).r - size(P.items[j].kind).r
      if (gap < worst) {
        worst = gap
        pair = `${i}–${j}`
      }
    }
  c('none through another, in the cup', `closest ${worst.toFixed(1)} (${pair})`, worst >= 0)
  // the curler: hung on the rim, clear of the cup and of everything in it
  const K = P.curler
  const pts = curlerPoints()
  const bad = { wall: 0, item: 0, low: Infinity, near: Infinity }
  for (const [x, y, z] of pts) {
    const r = Math.hypot(x, z)
    if (y < C.h + K.tube && r > innerR(Math.min(y, C.h)) - K.tube && r < outerR(Math.min(y, C.h)) + K.tube) bad.wall++
    bad.low = Math.min(bad.low, y - K.tube)
    L.forEach((l, i) => {
      // (the thing's axis, foot to its top: the nearest point on it)
      const len = size(P.items[i].kind).len
      const d = [x - l.foot[0], y - l.foot[1], z - l.foot[2]]
      const t = Math.max(0, Math.min(len, d[0] * l.axis[0] + d[1] * l.axis[1] + d[2] * l.axis[2]))
      const gap = Math.hypot(...d.map((v, k) => v - l.axis[k] * t)) - size(P.items[i].kind).r - K.tube
      bad.near = Math.min(bad.near, gap)
    })
  }
  c('the curler on the rim, through no part of the cup [P]', bad.wall ? `${bad.wall} points in the wall` : 'clear', bad.wall === 0)
  const inside = curlerPaths().clamp.every(([x, , z]) => Math.hypot(x + K.x, z + K.z) < innerR(C.h) - K.tube)
  c('its clamp hooked in over the rim, its loops hanging outside [P]', inside ? 'clamp inside, loops out' : 'not hooked', inside && K.z - K.tube > C.rTop)
  c('its loops just off the desk', `${bad.low.toFixed(1)} up`, bad.low > 0 && bad.low < 10)
  c('the curler through nothing in the cup', `closest ${bad.near.toFixed(1)}`, bad.near >= 0)
  const cl = 2 * K.half + 2 * K.tube
  c('a real curler: about 105 long, its clamp ~36 across [E]', `${(K.top + 1 + K.tube).toFixed(0)} × ${cl.toFixed(0)}`, Math.abs(K.top + 1 + K.tube - 105) < 10 && Math.abs(cl - 36) < 6)
  c('it stands: the cup heavier than all it holds', `${P.mass} kg, the contents ~0.12`, P.mass > 0.3)
  return out
}
