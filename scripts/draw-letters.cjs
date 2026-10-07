// Her "Rina" redrawn clean from the trace (scripts/rina-trace.json, made by trace-letters.cjs off her photo): each
// outline sampled, its photo-noise wobble smoothed out along it (her marker's lines are smooth), and written as
// src/components/poster/letters.ts, a path per letter (her colours go by letter); the R drawn by hand over her photo
// (R_HAND below). No packages.
//   node scripts/draw-letters.cjs [sigma px]
const fs = require('fs')
const ROOT = require('path').join(__dirname, '..') + '/'
const T = JSON.parse(fs.readFileSync(ROOT + 'scripts/rina-trace.json', 'utf8'))
const SIGMA = Number(process.argv[2] ?? 9) // px of the frame (4 to a photo pixel): wobble shorter than ~6 sigma goes
const STEP = 2 // px between samples

// the trace's contours as points (its cubics sampled)
const tok = T.fill.match(/[MCLZ]|-?[0-9.]+/g)
const contours = []
let cur
let x = 0
let y = 0
for (let i = 0; i < tok.length; ) {
  const t = tok[i++]
  if (t === 'M') {
    x = +tok[i++]
    y = +tok[i++]
    contours.push((cur = [[x, y]]))
  } else if (t === 'C') {
    while (i < tok.length && !/[A-Z]/.test(tok[i])) {
      const p = tok.slice(i, i + 6).map(Number)
      i += 6
      for (let k = 1; k <= 16; k++) {
        const u = k / 16
        const v = 1 - u
        cur.push([v * v * v * x + 3 * v * v * u * p[0] + 3 * v * u * u * p[2] + u * u * u * p[4], v * v * v * y + 3 * v * v * u * p[1] + 3 * v * u * u * p[3] + u * u * u * p[5]])
      }
      x = p[4]
      y = p[5]
    }
  } else if (t === 'L') {
    while (i < tok.length && !/[A-Z]/.test(tok[i])) cur.push([(x = +tok[i++]), (y = +tok[i++])])
  }
}

/** a closed polyline resampled every `step` along it */
function resample(c, step) {
  const out = []
  let carry = 0
  for (let k = 0; k < c.length; k++) {
    const a = c[k]
    const b = c[(k + 1) % c.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    let s = carry
    while (s < len) {
      out.push([a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len])
      s += step
    }
    carry = s - len
  }
  return out
}
/** gaussian along a closed polyline (sigma in samples) */
function smooth(c, sigma) {
  const r = Math.ceil(sigma * 3)
  const w = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-((k - r) ** 2) / (2 * sigma * sigma)))
  const sw = w.reduce((a, b) => a + b, 0)
  const n = c.length
  return c.map((_, i) => {
    let sx = 0
    let sy = 0
    for (let k = -r; k <= r; k++) {
      const p = c[(((i + k) % n) + n) % n]
      sx += p[0] * w[k + r]
      sy += p[1] * w[k + r]
    }
    return [sx / sw, sy / sw]
  })
}
const area = (c) => c.reduce((a, p, k) => { const q = c[(k + 1) % c.length]; return a + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const centroid = (c) => {
  let a = 0, cx = 0, cy = 0
  for (let k = 0; k < c.length; k++) { const [x1, y1] = c[k], [x2, y2] = c[(k + 1) % c.length]; const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f }
  return [cx / (3 * a), cy / (3 * a)]
}
/** a closed polyline as smooth path data: a cubic through every few samples (Catmull-Rom) */
function toPath(c, every) {
  const p = c.filter((_, k) => k % every === 0)
  const n = p.length
  const f = (v) => v.toFixed(1)
  let d = `M${f(p[0][0])} ${f(p[0][1])}`
  for (let k = 0; k < n; k++) {
    const p0 = p[(k - 1 + n) % n], p1 = p[k], p2 = p[(k + 1) % n], p3 = p[(k + 2) % n]
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d + 'Z'
}

// her R, drawn by hand over her photo (the trace's R came out lumpy and pinched: her R's stem is thin beside its hole
// and the photo's blur ran them together). Points along the inside of her marker, read off the photo (its pixels,
// 4x: x 505 + px/4, y 280 + py/4, so the frame's x = px - 20, y = py + 32); 'c' a corner she drew sharp, the rest
// rounded off as a hand draws them
const R_HAND = {
  outline: [
    [40, 100], [70, 62], [150, 42], [240, 42], [332, 70], [384, 124], [422, 198], [434, 285], [428, 366], [405, 432],
    [363, 490], [310, 544], [266, 596, 'c'], // the bowl, round to where the leg leaves it
    [333, 700], [424, 850], [503, 1000], [560, 1094, 'c'], // the leg's outside, down to its foot (a marker's width off the i)
    [470, 1104], [378, 1102, 'c'], // its foot
    [339, 1000], [284, 850], [247, 750], [207, 670, 'c'], // its inside, up to where it leaves the stem
    [207, 800], [222, 950], [240, 1118, 'c'], // the stem's inside, down
    [180, 1121], [125, 1118, 'c'], // its foot
    [121, 1100], [116, 900], [103, 700], [83, 500], [55, 300], [35, 160], // its outside, up (leaning back as hers)
  ],
  hole: [
    [108, 158, 'c'], [180, 153], [250, 173], [297, 227], [312, 292], [301, 357], [265, 420], [222, 462], [193, 480, 'c'],
    [170, 412], [150, 332], [130, 252], [110, 175],
  ],
}
/** a hand-drawn outline: corners kept, the rest rounded (Chaikin), in the frame */
function hand(points) {
  let q = points.map(([x, y, c]) => ({ x: x - 20, y: y + 32, c: c === 'c' }))
  for (let it = 0; it < 5; it++) {
    const out = []
    for (let k = 0; k < q.length; k++) {
      const a = q[k]
      const b = q[(k + 1) % q.length]
      if (a.c) out.push(a)
      else out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y })
      if (!b.c) out.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y })
      else out.push({ x: 0.5 * a.x + 0.5 * b.x, y: 0.5 * a.y + 0.5 * b.y })
    }
    // (each corner once, where it was)
    q = out.filter((v, k) => !(v.c && out.findIndex((w) => w === v) !== k))
  }
  return resample(q.map((v) => [v.x, v.y]), STEP)
}

// each contour, smoothed, to its letter (by where it sits across: the photo's x of its middle)
const parts = { R: [], i: [], n: [], a: [] }
const boxes = {}
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
/** where the trace ran a letter's hole into its outline (a hairline slit, where her marker round the hole met the
 *  outer one): cut there into the outline and the hole, so each is drawn round on its own */
function unslit(c) {
  const PINCH = 14 // px apart, at most, across a slit
  const out = []
  const todo = [c]
  while (todo.length) {
    const q = todo.pop()
    let best = null
    for (let i = 0; i < q.length; i++)
      for (let j = i + 60; j < q.length; j++) {
        if (q.length - (j - i) < 60) break
        const d = Math.hypot(q[i][0] - q[j][0], q[i][1] - q[j][1])
        if (d < PINCH && (!best || d < best.d)) best = { i, j, d }
      }
    if (!best) {
      out.push(q)
      continue
    }
    // the whole slit dropped, both its sides, as far as they run close (else a notch is left where it was), and a
    // little more, for the ends to round off
    const at = (k) => q[((k % q.length) + q.length) % q.length]
    const close = (u, v) => Math.hypot(at(u)[0] - at(v)[0], at(u)[1] - at(v)[1]) < PINCH * 1.8
    let out0 = 0
    let in0 = 0
    while (out0 < 80 && close(best.i - out0 - 1, best.j + out0 + 1)) out0++
    while (in0 < 80 && best.i + in0 + 1 < best.j - in0 - 1 && close(best.i + in0 + 1, best.j - in0 - 1)) in0++
    const ia = best.i - out0 - 4
    const ib = best.i + in0 + 4
    const ja = best.j - in0 - 4
    const jb = best.j + out0 + 4
    todo.push(q.slice(ib, ja + 1), [...q.slice(jb), ...q.slice(0, Math.max(0, ia + 1))])
  }
  return out.filter((q) => q.length > 30)
}
/** where a hole's marker met the outline's for a stretch (the a's left side pinches that thin in her photo), the
 *  trace opened the hole to the outside: cut across there by hand, between these points (frame px), into the
 *  outline and the hole */
const CUTS = [
  [[1103, 775], [1094, 854]], // the a: its hole's left side, where it opened onto the outline
]
function cut(cs) {
  for (const [p, q] of CUTS) {
    const near = (c, [x, y]) => c.reduce((b, v, k) => (Math.hypot(v[0] - x, v[1] - y) < Math.hypot(c[b][0] - x, c[b][1] - y) ? k : b), 0)
    const k = cs.findIndex((c) => c.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 6) && c.some((v) => Math.hypot(v[0] - q[0], v[1] - q[1]) < 6))
    if (k < 0) throw new Error('no outline through the cut ' + p + ' ' + q)
    const c = cs[k]
    const [i, j] = [near(c, p), near(c, q)].sort((u, v) => u - v)
    cs.splice(k, 1, c.slice(i, j + 1), [...c.slice(j), ...c.slice(0, i + 1)])
  }
  return cs
}
function add(letter, s) {
  parts[letter].push(toPath(s, 3))
  const b = (boxes[letter] ??= [Infinity, Infinity, -Infinity, -Infinity])
  for (const [u, v] of s) {
    ;(x0 = Math.min(x0, u)), (y0 = Math.min(y0, v)), (x1 = Math.max(x1, u)), (y1 = Math.max(y1, v))
    ;(b[0] = Math.min(b[0], u)), (b[1] = Math.min(b[1], v)), (b[2] = Math.max(b[2], u)), (b[3] = Math.max(b[3], v))
  }
  console.log(letter, 'points', s.length, 'area', Math.round(area(s)))
}
for (const c of cut(contours.flatMap((c) => unslit(resample(c, STEP))))) {
  const s = smooth(c, SIGMA / STEP)
  const px = T.crop.x + centroid(s)[0] / T.crop.scale
  const letter = px < 620 ? 'R' : px < 680 ? 'i' : px < 780 ? 'n' : 'a'
  if (letter !== 'R') add(letter, s) // (the R: drawn by hand)
}
// the R: its outline the way round the trace's outlines go (area < 0), its hole the other way
const R = hand(R_HAND.outline)
const Rh = hand(R_HAND.hole)
add('R', area(R) < 0 ? R : R.reverse())
add('R', area(Rh) > 0 ? Rh : Rh.reverse())
const box = [x0, y0, x1, y1].map(Math.round)
fs.writeFileSync(
  ROOT + 'src/components/poster/letters.ts',
  `/**
 * Her "Rina" off her poster: traced from the photo of her desk (scripts/trace-letters.cjs → scripts/rina-trace.json),
 * then drawn clean (scripts/draw-letters.cjs: each outline's photo-noise wobble smoothed out, sigma ${SIGMA}). Path data per
 * letter in a ${T.w} × ${T.h} frame (4 to a photo pixel); \`box\` their bounds (x0, y0, x1, y1), the marker not included.
 */
export const LETTERS = {
  w: ${T.w},
  h: ${T.h},
  box: ${JSON.stringify(box)} as [number, number, number, number],
  /** each letter's own bounds */
  boxes: ${JSON.stringify(Object.fromEntries(Object.entries(boxes).map(([k, b]) => [k, b.map(Math.round)])))} as Record<'R' | 'i' | 'n' | 'a', [number, number, number, number]>,
  parts: ${JSON.stringify(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.join('')])), null, 2)} as Record<'R' | 'i' | 'n' | 'a', string>,
}
`,
)
console.log('box', box)
