import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CylinderGeometry, ExtrudeGeometry, LatheGeometry, Path, RepeatWrapping, Shape, Vector2, type BufferGeometry, type Group, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { anchor, canvasTexture, capped, rrect } from './anchors'
import { CUBE, lidOutline } from './cube'
import { Disc } from './Disc'
import { COLORS } from './spec'
import { getCube, moveDisc, pressOpen, pressPower, pressReset, shutLid, useCube } from './state'

/**
 * The GameCube [G], built from its measured spec (./cube: dimensions.com's drawing, the rear photo), toy style. Its
 * frame: the origin on the ground under its middle, its front +z.
 *
 *   the body   a block up to the floor of the lid's well, its walls painted all the way round from one strip (the
 *              seam round its bottom, the port insides and card slots on the front, the vent grids on the sides, the
 *              sockets on the back); the top over it, a frame with the lid's outline cut through (the well's walls),
 *              its face painted (the buttons' rings and names, the raised Nintendo pill, the finger dip)
 *   the lid    flush in its hole, the same indigo as the top round it (a thin dark seam between), the round black
 *              window painted in; hinged at the back, rising slowly and smoothly
 *   the light  the lip under the lid's front edge, glowing orange while it's on
 *   the front  the silver panel standing proud of it, the four ports and two slots cut through it
 *   the back   the black strap of the handle looped out; the AV plug in its socket
 *   in it      the drive, its spindle, the disc on it (./Disc)
 *
 * Its buttons each their own part, clicked: POWER (back left: the lip lights), OPEN (front left: the lid opens), RESET
 * (front right, sunk in its ring); the lid
 * clicked shut; the disc, with the lid up, out to its case (./state). The controllers' plugs in ports 1 and 2 and the
 * AV plug are where the cables leave from (./anchors).
 */
const { w: CW, h: CH, d: CD, feet: FEET, round: RND, lid: L } = CUBE
const FLOOR = CH - CUBE.well.depth // (the well's floor: the body's top)
const PX = 4 // (canvas pixels a millimetre)

/** a rounded rectangle, w × h, its corners r, about (cx, cy) */
export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}
/** a plan shape from [x, z] points (drawn as x, -z: the back up) */
const fromPlan = (pts: [number, number][], into = new Shape()) => {
  into.setFromPoints(pts.map(([x, z]) => new Vector2(x, -z)))
  return into
}
/** a plan shape stood up: extruded from y0 up (its caps' uv the plan's own x and -z) */
const standUp = (g: ExtrudeGeometry, y0: number) => g.rotateX(-Math.PI / 2).translate(0, y0, 0)

// ---- the body's walls: one strip painted round it. Its outline (plan) clockwise from the middle of the back, so the
// strip's seam is there, behind the handle; s the distance round from there
const Q = (Math.PI * RND) / 2 // (a corner's quarter round)
const SIDE_X = CW - 2 * RND
const SIDE_Z = CD - 2 * RND
const PERIM = 2 * SIDE_X + 2 * SIDE_Z + 4 * Q
const sOn = {
  back: (x: number) => (x >= 0 ? x : PERIM + x),
  right: (z: number) => SIDE_X / 2 + Q + (z + SIDE_Z / 2),
  front: (x: number) => SIDE_X / 2 + Q + SIDE_Z + Q + (SIDE_X / 2 - x),
  left: (z: number) => SIDE_X / 2 + Q + SIDE_Z + Q + SIDE_X + Q + (SIDE_Z / 2 - z),
}
function bodyOutline(): [number, number][] {
  const pts: [number, number][] = [[0, -CD / 2]]
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (Math.PI / 2) * (i / 6)
      pts.push([cx + RND * Math.cos(a), cz + RND * Math.sin(a)])
    }
  }
  // (plan x right, z front; clockwise seen from above: along the back to the right, down the right side…)
  corner(CW / 2 - RND, -CD / 2 + RND, -Math.PI / 2)
  corner(CW / 2 - RND, CD / 2 - RND, 0)
  corner(-CW / 2 + RND, CD / 2 - RND, Math.PI / 2)
  corner(-CW / 2 + RND, -CD / 2 + RND, Math.PI)
  return pts
}
/** where along the strip a point of the outline is (nearest of the outline's own points: the walls are built from them) */
function stripUV(outline: [number, number][]) {
  const s: number[] = [0]
  for (let i = 1; i < outline.length; i++) s.push(s[i - 1] + Math.hypot(outline[i][0] - outline[i - 1][0], outline[i][1] - outline[i - 1][1]))
  const at = (x: number, y: number) => {
    let best = 0
    let bd = Infinity
    for (let i = 0; i < outline.length; i++) {
      const d = Math.hypot(outline[i][0] - x, -outline[i][1] - y)
      if (d < bd) [bd, best] = [d, i]
    }
    return s[best] / PERIM
  }
  return {
    generateTopUV: (_g: ExtrudeGeometry, v: number[], a: number, b: number, c: number) => [a, b, c].map((i) => new Vector2(v[i * 3], v[i * 3 + 1])),
    generateSideWallUV: (_g: ExtrudeGeometry, v: number[], a: number, b: number, c: number, d: number) => {
      const h = FLOOR - FEET
      const uv = [a, b, c, d].map((i) => new Vector2(1 - at(v[i * 3], v[i * 3 + 1]), v[i * 3 + 2] / h))
      // (the quad that closes the loop: carried on past the end, not back across the whole strip)
      const lo = Math.min(...uv.map((p) => p.x))
      for (const p of uv) if (p.x - lo > 0.5) p.x -= 1
      return uv
    },
  }
}

// ---- the painted faces
const ink = { dark: '#2a2560', hole: '#1d1a24', key: '#8d8b98', seam: '#463d96', label: '#b4acef' }
function wallTexture() {
  const W = Math.ceil(PERIM * PX)
  const H = Math.ceil((FLOOR - FEET) * PX)
  const t = canvasTexture(W, H, (g) => {
    const X = (s: number) => (PERIM - s) * PX // (the strip runs the other way round the canvas: see stripUV)
    const Y = (y: number) => (FLOOR - y) * PX
    g.fillStyle = COLORS.indigo
    g.fillRect(0, 0, W, H)
    // the seam round the bottom
    g.fillStyle = ink.seam
    g.fillRect(0, Y(CUBE.band) - 0.5 * PX, W, 1 * PX)
    // the front: behind the panel's holes, the ports' insides (each keyed) and the card slots
    for (const x of CUBE.ports.xs) {
      const cx = X(sOn.front(x))
      const cy = Y(CUBE.ports.y)
      g.fillStyle = ink.hole
      g.beginPath()
      g.arc(cx, cy, (CUBE.ports.r + 0.6) * PX, 0, Math.PI * 2)
      g.fill()
      const k = CUBE.ports.key
      g.fillStyle = ink.key
      g.beginPath()
      g.moveTo(cx - (k.w / 2) * PX, cy - (k.h / 2) * PX)
      g.lineTo(cx + (k.w / 2) * PX, cy - (k.h / 2) * PX)
      g.lineTo(cx + (k.w / 2 - 1.6) * PX, cy + (k.h / 2) * PX)
      g.lineTo(cx - (k.w / 2 - 1.6) * PX, cy + (k.h / 2) * PX)
      g.closePath()
      g.fill()
      g.fillStyle = ink.hole
      g.fillRect(cx - 2.6 * PX, cy - 1.2 * PX, 5.2 * PX, 2.4 * PX)
    }
    for (const x of CUBE.slots.xs) {
      g.fillStyle = ink.hole
      rrect(g, X(sOn.front(x)) - ((CUBE.slots.w + 1) / 2) * PX, Y(CUBE.slots.y + CUBE.slots.h / 2 + 0.5), (CUBE.slots.w + 1) * PX, (CUBE.slots.h + 1) * PX, 1.5 * PX)
      g.fill()
    }
    // each side: its vent grid (dark cells between bars), the curved lip under it
    const v = CUBE.vents
    const half = (v.n * v.cell) / 2
    for (const side of ['left', 'right'] as const) {
      for (let i = 0; i < v.n; i++)
        for (let j = 0; j < v.n; j++) {
          const z0 = -half + i * v.cell
          const s0 = sOn[side](z0 + 0.7)
          const s1 = sOn[side](z0 + v.cell - 0.7)
          const xa = Math.min(X(s0), X(s1))
          const xb = Math.max(X(s0), X(s1))
          g.fillStyle = ink.dark
          rrect(g, xa, Y(v.y1 - j * v.cell - 0.7), xb - xa, (v.cell - 1.4) * PX, 0.8 * PX)
          g.fill()
        }
      const mid = X(sOn[side](0))
      g.strokeStyle = ink.seam
      g.lineWidth = 1.4 * PX
      g.beginPath()
      g.ellipse(mid, Y(v.y0 - 3), (half + 4) * PX, 4.5 * PX, 0, 0.15 * Math.PI, 0.85 * Math.PI)
      g.stroke()
    }
    // the back: the frame round its recess, the inset panel, the sockets and their names, the vent slots
    const bx = (x: number) => X(sOn.back(x))
    const bp = CUBE.backPanel
    g.fillStyle = '#4f45a4'
    g.fillRect(Math.min(bx(bp.x0), bx(bp.x1)), Y(bp.y1), Math.abs(bx(bp.x1) - bx(bp.x0)), (bp.y1 - bp.y0) * PX)
    g.strokeStyle = ink.seam
    g.lineWidth = 0.8 * PX
    g.strokeRect(Math.min(bx(-68), bx(68)), Y(100), Math.abs(bx(68) - bx(-68)), 92 * PX)
    const socket = (o: { x: number; y: number; w: number; h: number }, fill: string) => {
      g.fillStyle = fill
      rrect(g, bx(o.x) - (o.w / 2) * PX, Y(o.y + o.h / 2), o.w * PX, o.h * PX, 1.6 * PX)
      g.fill()
    }
    socket(CUBE.av, ink.hole)
    socket(CUBE.digital, '#3a3448')
    g.fillStyle = '#9b97aa'
    g.fillRect(bx(CUBE.digital.x) - 8 * PX, Y(CUBE.digital.y + 1.5), 16 * PX, 3 * PX)
    socket(CUBE.dc, ink.hole)
    g.fillStyle = '#6a6578'
    g.beginPath()
    g.arc(bx(CUBE.dc.x) - 2.2 * PX, Y(CUBE.dc.y), 1.3 * PX, 0, Math.PI * 2)
    g.arc(bx(CUBE.dc.x) + 2.2 * PX, Y(CUBE.dc.y), 1.3 * PX, 0, Math.PI * 2)
    g.fill()
    const bv = CUBE.backVents
    for (let i = 0; i < bv.n; i++) {
      const x = bv.x0 + ((bv.x1 - bv.x0) * (i + 0.5)) / bv.n
      g.fillStyle = ink.hole
      g.fillRect(bx(x) - 1.6 * PX, Y(bv.y1), 3.2 * PX, (bv.y1 - bv.y0) * PX)
    }
    g.fillStyle = ink.label
    g.font = `bold ${2.6 * PX}px Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('ANALOG AV OUT', bx(CUBE.av.x), Y(CUBE.av.y + CUBE.av.h / 2 + 3))
    g.fillText('DIGITAL AV OUT', bx(CUBE.digital.x), Y(CUBE.digital.y + CUBE.digital.h / 2 + 3))
    g.fillText('DC 12V IN', bx(CUBE.dc.x), Y(CUBE.dc.y + CUBE.dc.h / 2 + 3))
  })
  t.wrapS = RepeatWrapping
  return t
}
/** the top, seen from above (x right, the back up): the frame's face, or the lid's */
function topTexture(lid: boolean) {
  const t = canvasTexture(CW * PX, CD * PX, (g) => {
    const X = (x: number) => (x + CW / 2) * PX
    const Y = (z: number) => (z + CD / 2) * PX
    g.fillStyle = COLORS.indigo
    g.fillRect(0, 0, CW * PX, CD * PX)
    if (lid) {
      // the round black window, a rim round it
      g.fillStyle = '#121016'
      g.beginPath()
      g.arc(X(0), Y(CUBE.window.z), CUBE.window.r * PX, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#2b2833'
      g.lineWidth = 1.2 * PX
      g.beginPath()
      g.arc(X(0), Y(CUBE.window.z), (CUBE.window.r - 1.5) * PX, 0, Math.PI * 2)
      g.stroke()
      // its name across it, a little cube by it
      const cx = X(0)
      const cy = Y(0)
      g.strokeStyle = '#b9b7c8'
      g.lineWidth = 0.5 * PX
      const s = 4.2 * PX
      const ex = cx - 21 * PX
      g.beginPath()
      g.moveTo(ex, cy - s)
      g.lineTo(ex + s * 0.87, cy - s / 2)
      g.lineTo(ex + s * 0.87, cy + s / 2)
      g.lineTo(ex, cy + s)
      g.lineTo(ex - s * 0.87, cy + s / 2)
      g.lineTo(ex - s * 0.87, cy - s / 2)
      g.closePath()
      g.moveTo(ex, cy)
      g.lineTo(ex, cy + s)
      g.moveTo(ex, cy)
      g.lineTo(ex - s * 0.87, cy - s / 2)
      g.moveTo(ex, cy)
      g.lineTo(ex + s * 0.87, cy - s / 2)
      g.stroke()
      g.fillStyle = '#d9d8e4'
      g.font = `bold ${6 * PX}px Arial, sans-serif`
      g.textAlign = 'left'
      g.textBaseline = 'middle'
      g.fillText('GAMECUBE', cx - 15 * PX, cy + 0.4 * PX)
      g.font = `${2.4 * PX}px Arial, sans-serif`
      g.fillStyle = '#a9a7b8'
      g.fillText('N I N T E N D O', cx - 15 * PX, cy - 5.2 * PX)
      return
    }
    // the frame: the buttons' recessed rings, their names
    for (const b of Object.values(CUBE.buttons)) {
      g.fillStyle = '#3e3588'
      g.beginPath()
      g.arc(X(b.x), Y(b.z), b.ring * PX, 0, Math.PI * 2)
      g.fill()
    }
    // (each name round its button between its ring and the notch, the letters' tops outward, read clockwise)
    const round = (text: string, b: { x: number; z: number; ring: number }, mid: number) => {
      const r = (b.ring + L.notchR - L.gap) / 2
      g.font = `bold ${2.1 * PX}px Arial, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillStyle = ink.label
      const widths = [...text].map((ch) => g.measureText(ch).width / PX + 0.35)
      const total = widths.reduce((a, w) => a + w, 0)
      let a = mid - total / r / 2
      for (const [i, ch] of [...text].entries()) {
        const step = widths[i] / r
        const at = a + step / 2
        g.save()
        g.translate(X(b.x + r * Math.cos(at)), Y(b.z + r * Math.sin(at)))
        g.rotate(at + Math.PI / 2)
        g.fillText(ch, 0, 0)
        g.restore()
        a += step
      }
    }
    const { power, reset, open } = CUBE.buttons
    round('POWER', power, 0) // (down its right side)
    round('OPEN', open, -Math.PI / 4) // (round its back right)
    round('RESET', reset, (-3 * Math.PI) / 4) // (round its back left)
    // the raised Nintendo pill, back right
    const lg = CUBE.logo
    g.strokeStyle = '#4b42a0'
    g.lineWidth = 0.8 * PX
    rrect(g, X(lg.x0 - CW / 2), Y(lg.y0 - CD / 2), (lg.x1 - lg.x0) * PX, (lg.y1 - lg.y0) * PX, ((lg.y1 - lg.y0) / 2) * PX)
    g.stroke()
    g.fillStyle = '#4b42a0'
    g.font = `italic bold ${4.2 * PX}px Arial, sans-serif`
    g.fillText('Nintendo', X((lg.x0 + lg.x1) / 2 - CW / 2), Y((lg.y0 + lg.y1) / 2 - CD / 2 + 0.3))
  })
  return capped(t, -CW / 2, CW / 2, -CD / 2, CD / 2)
}
function panelTexture() {
  const P = CUBE.panel
  const t = canvasTexture(Math.round(P.w * PX), Math.round((P.y1 - P.y0) * PX), (g) => {
    const X = (x: number) => (x + P.w / 2) * PX
    const Y = (y: number) => (P.y1 - y) * PX
    g.fillStyle = COLORS.silver
    g.fillRect(0, 0, g.canvas.width, g.canvas.height)
    CUBE.ports.xs.forEach((x, i) => {
      g.strokeStyle = '#aeb0bc'
      g.lineWidth = 1.4 * PX
      g.beginPath()
      g.arc(X(x), Y(CUBE.ports.y), (CUBE.ports.r + 0.8) * PX, 0, Math.PI * 2)
      g.stroke()
      g.fillStyle = '#6e6d7a'
      for (let k = 0; k <= i; k++) {
        g.beginPath()
        g.arc(X(x + (k - i / 2) * 2.6), Y(CUBE.ports.y + CUBE.ports.r + 4.2), 0.75 * PX, 0, Math.PI * 2)
        g.fill()
      }
    })
    g.fillStyle = '#8a8a96'
    g.font = `bold ${2.4 * PX}px Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    CUBE.slots.xs.forEach((x, i) => g.fillText(i ? 'SLOT B' : 'SLOT A', X(x), Y(CUBE.slots.y - CUBE.slots.h / 2 - 4)))
  })
  return capped(t, -P.w / 2, P.w / 2, P.y0, P.y1)
}

// ---- the parts
function bodyGeometry() {
  const out = bodyOutline()
  return standUp(new ExtrudeGeometry(fromPlan(out), { depth: FLOOR - FEET, bevelEnabled: false, UVGenerator: stripUV(out) as never }), FEET)
}
function frameGeometry() {
  const outer = fromPlan(bodyOutline())
  outer.holes.push(fromPlan(lidOutline(L.gap, true), new Path() as Shape))
  return standUp(new ExtrudeGeometry(outer, { depth: CH - FLOOR, bevelEnabled: false }), FLOOR)
}
function lidGeometry() {
  const b = 0.3
  return standUp(new ExtrudeGeometry(fromPlan(lidOutline(-b)), { depth: L.t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2 }), CH - L.t)
}
/** the lip under the lid's front edge (the power light): out from under the lid's bow to the dip, sunk a little */
function lipGeometry() {
  const zMid = L.frontMid - CD / 2
  const bow = (x: number) => zMid - L.bowR + Math.sqrt(L.bowR * L.bowR - x * x)
  const x0 = CUBE.grip.x0 - CW / 2
  const x1 = CUBE.grip.x1 - CW / 2
  const deep = CUBE.grip.dip - CD / 2
  const pts: [number, number][] = []
  for (let i = 0; i <= 24; i++) {
    const x = x1 + ((x0 - x1) * i) / 24
    const u = (x - (x0 + x1) / 2) / ((x1 - x0) / 2)
    pts.push([x, bow(x) + (deep - bow(0)) * Math.sqrt(Math.max(0, 1 - u * u))])
  }
  for (let i = 0; i <= 12; i++) {
    const x = x0 + ((x1 - x0) * i) / 12
    pts.push([x, bow(x) - 1.5]) // (tucked under the lid's edge)
  }
  return standUp(new ExtrudeGeometry(fromPlan(pts), { depth: 2, bevelEnabled: false }), CH - 2.8)
}
function panelGeometry() {
  const P = CUBE.panel
  const x0 = -P.w / 2
  const x1 = P.w / 2
  const r = P.r
  const rb = 0.8
  const s = new Shape()
  s.moveTo(x0 + rb, P.y0)
  s.lineTo(x1 - rb, P.y0)
  s.absarc(x1 - rb, P.y0 + rb, rb, -Math.PI / 2, 0, false)
  s.lineTo(x1, P.y1 - r)
  s.absarc(x1 - r, P.y1 - r, r, 0, Math.PI / 2, false)
  s.lineTo(x0 + r, P.y1)
  s.absarc(x0 + r, P.y1 - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x0, P.y0 + rb)
  s.absarc(x0 + rb, P.y0 + rb, rb, Math.PI, Math.PI * 1.5, false)
  for (const x of CUBE.ports.xs) s.holes.push(new Path().absarc(x, CUBE.ports.y, CUBE.ports.r, 0, Math.PI * 2, true))
  for (const x of CUBE.slots.xs) s.holes.push(roundRect(CUBE.slots.w, CUBE.slots.h, 1.5, x, CUBE.slots.y))
  const b = 0.5
  return new ExtrudeGeometry(s, { depth: P.proud - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 20 }).translate(0, 0, CD / 2 + b)
}
function handleGeometry() {
  const H = CUBE.handle
  const x = H.w / 2 - H.t / 2
  const z0 = -CD / 2 + 3 // (its ends sunk into the back)
  const z1 = -CD / 2 - H.out
  // its middle line round the U, then that offset either side by half its thickness
  const mid: [number, number][] = [[-x, z0]]
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (Math.PI / 2) * (i / 8)
      mid.push([cx + H.r * Math.cos(a), cz + H.r * Math.sin(a)])
    }
  }
  corner(-x + H.r, z1 + H.r, Math.PI)
  corner(x - H.r, z1 + H.r, -Math.PI / 2)
  mid.push([x, z0])
  const side = (k: number) =>
    mid.map((p, i): [number, number] => {
      const a = mid[Math.max(0, i - 1)]
      const b = mid[Math.min(mid.length - 1, i + 1)]
      const tx = b[0] - a[0]
      const tz = b[1] - a[1]
      const l = Math.hypot(tx, tz)
      return [p[0] - (tz / l) * k, p[1] + (tx / l) * k]
    })
  const ring = [...side(H.t / 2 - 1), ...side(-(H.t / 2 - 1)).reverse()]
  const b = 1
  return standUp(new ExtrudeGeometry(fromPlan(ring), { depth: H.y1 - H.y0 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2 }), H.y0)
}
/** a round button's profile turned: a dome on top, or (with \`inner\`) a smaller button standing in it */
const BUTTON = (r: number, h: number, dome: number, inner = 0) =>
  new LatheGeometry(
    (inner
      ? [[0, h + 0.8], [inner - 0.5, h + 0.8], [inner - 0.1, h + 0.3], [inner - 0.1, h - 0.9], [inner + 0.9, h - 0.9], [inner + 1.1, h], [r - 0.6, h], [r, h - 0.6], [r, 0], [0, 0]] // (the inner button, a groove round it, the ring)
      : [[0, h + dome], [r * 0.6, h + dome * 0.7], [r - 0.6, h], [r, h - 0.6], [r, 0], [0, 0]]
    )
      .reverse()
      .map(([x, y]) => new Vector2(x, y)),
    32,
  )
const FOOT = new RoundedBoxGeometry(14, FEET, 9, 1, 0.6)
const DRIVE = new CylinderGeometry(CUBE.well.drive, CUBE.well.drive, 2, 48)
const SPINDLE = new CylinderGeometry(6, 6.5, 1.5, 24)
const PLUG = new RoundedBoxGeometry(15, 13, 20, 2, 3)
const BOOT = new CylinderGeometry(3.6, 4.6, 12, 14).rotateX(Math.PI / 2)
const AVPLUG = new RoundedBoxGeometry(CUBE.av.w - 1, CUBE.av.h - 1, 18, 2, 2.5)

const M = {
  frameSide: bruno({ color: COLORS.indigo, shade: '#3a3070' }),
  floor: bruno({ color: '#2c2838', shade: '#1c1a24' }),
  lidSide: bruno({ color: COLORS.indigo, shade: '#3a3070' }),
  // the power light: smoky when it's off, orange when it's on
  lipOff: bruno({ color: '#6a4a52', shade: '#3a2830' }),
  lipOn: bruno({ color: '#ff8a3c', emissive: '#ff5208', emissiveIntensity: 1.5 }),
  panelSide: bruno({ color: '#b9bac4', shade: '#7e7f8c' }),
  grey: bruno({ color: '#dcdce4', shade: '#8e8ea0' }),
  button: bruno({ color: '#4c42a6', shade: '#2e2766' }),
  black: bruno({ color: '#232127', shade: '#141217' }),
  drive: bruno({ color: '#1b1a20', shade: '#0f0e13' }),
  spindle: bruno({ color: '#9a98a6', shade: '#55536a' }),
  plug1: bruno({ color: COLORS.indigo, shade: '#3a3070' }),
  plug2: bruno({ color: COLORS.black, shade: '#18171c' }),
}

/** a button on top: clicked, it does its thing, and dips */
function Button({ k, at, geo, m, act }: { k: string; at: { x: number; z: number }; geo: BufferGeometry; m: ReturnType<typeof bruno>; act: () => void }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const o = ref.current
    if (!o) return
    const p = getCube().pressed[k] ?? -9
    o.position.y = CH - 1 - (performance.now() / 1000 - p < 0.16 ? 1.2 : 0)
  })
  return (
    <mesh
      ref={ref}
      geometry={geo}
      material={m}
      position={[at.x, CH - 1, at.z]}
      onClick={(e) => {
        e.stopPropagation()
        act()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    />
  )
}

export function GameCube({ onBody }: { onBody?: (e: ThreeEvent<MouseEvent>) => void }) {
  const c = useCube()
  const geo = useMemo(
    () => ({
      body: bodyGeometry(),
      frame: frameGeometry(),
      lid: lidGeometry(),
      panel: panelGeometry(),
      handle: handleGeometry(),
      power: BUTTON(CUBE.buttons.power.r, 2.2, 0.8),
      open: BUTTON(CUBE.buttons.open.r, 1.8, 0.4),
      reset: BUTTON(CUBE.buttons.reset.r, 1.4, 0, CUBE.buttons.reset.inner),
      lip: lipGeometry(),
    }),
    [],
  )
  const mats = useMemo(
    () => ({
      // (an extrusion's materials: its caps, then its walls)
      body: [M.floor, bruno({ map: wallTexture() })],
      frame: [bruno({ map: topTexture(false) }), M.frameSide],
      lid: [bruno({ map: topTexture(true) }), M.lidSide],
      panel: [bruno({ map: panelTexture() }), M.panelSide],
    }),
    [],
  )
  // the lid: rising slowly and smoothly (its damper: 1.6 s, easing to a stop), shut gently (0.35 s)
  const lid = useRef<Group>(null)
  const swing = useRef({ from: 0, to: 0, at: 0, a: 0 })
  useFrame(() => {
    const g = lid.current
    if (!g) return
    const w = swing.current
    const to = getCube().lid ? -L.open : 0
    const t = performance.now() / 1000
    if (to !== w.to) Object.assign(w, { from: w.a, to, at: t })
    const opening = w.to < w.from
    const k = Math.min(1, (t - w.at) / (opening ? 1.6 : 0.35))
    const e = opening ? 1 - Math.pow(1 - k, 3) : k * k * (3 - 2 * k)
    w.a = w.from + (w.to - w.from) * e
    g.rotation.x = w.a
  })
  const body = (e: ThreeEvent<MouseEvent>) => {
    if (!onBody) return
    e.stopPropagation()
    onBody(e)
  }
  const hingeZ = L.back - CD / 2
  const seat = FLOOR + 2 + 1 // (on the spindle, on the drive)
  const { power, reset, open } = CUBE.buttons
  return (
    <group>
      <mesh geometry={geo.body} material={mats.body} castShadow receiveShadow onClick={body} />
      <mesh geometry={geo.frame} material={mats.frame} castShadow receiveShadow onClick={body} />
      <mesh geometry={geo.panel} material={mats.panel} castShadow receiveShadow onClick={body} />
      <mesh geometry={geo.handle} material={M.black} castShadow onClick={body} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={FOOT} material={M.black} position={[sx * 60, FEET / 2, sz * 68]} />))}
      {/* the well: the drive, its spindle */}
      <mesh geometry={DRIVE} material={M.drive} position={[0, FLOOR + 1, CUBE.window.z]} />
      <mesh geometry={SPINDLE} material={M.spindle} position={[0, FLOOR + 2.75, CUBE.window.z]} />
      <group ref={anchor('seat-console')} position={[0, seat, CUBE.window.z]} userData={{ live: true }}>
        {c.disc === 'console' && <Disc onClick={() => c.lid && moveDisc()} />}
      </group>
      {/* the lid, flush in its hole, hinged at its back edge */}
      <group ref={lid} position={[0, CH, hingeZ]} userData={{ live: true }}>
        <mesh
          geometry={geo.lid}
          material={mats.lid}
          position={[0, -CH, -hingeZ]}
          castShadow
          onClick={(e) => {
            if (!getCube().lid) return body(e)
            e.stopPropagation()
            shutLid()
          }}
        />
      </group>
      {/* the buttons, and the power light (live: they move, it changes) */}
      <group userData={{ live: true }}>
        <Button k="power" at={power} geo={geo.power} m={M.grey} act={pressPower} />
        <Button k="reset" at={reset} geo={geo.reset} m={M.button} act={pressReset} />
        <Button k="open" at={open} geo={geo.open} m={M.button} act={pressOpen} />
        <mesh geometry={geo.lip} material={c.power ? M.lipOn : M.lipOff} />
      </group>
      {/* the controllers' plugs in ports 1 and 2; the AV plug in its socket at the back */}
      {[0, 1].map((i) => (
        <group key={i} position={[CUBE.ports.xs[i], CUBE.ports.y, CD / 2 + CUBE.panel.proud]}>
          <mesh geometry={PLUG} material={i ? M.plug2 : M.plug1} position={[0, 0, 8]} castShadow />
          <mesh geometry={BOOT} material={i ? M.plug2 : M.plug1} position={[0, 0, 23]} />
          <group ref={anchor(`port${i + 1}`)} position={[0, 0, 28]} />
        </group>
      ))}
      <group position={[CUBE.av.x, CUBE.av.y, -CD / 2]}>
        <mesh geometry={AVPLUG} material={M.black} position={[0, 0, -7]} castShadow />
        <mesh geometry={BOOT} material={M.black} position={[0, 0, -21]} />
        <group ref={anchor('avout')} position={[0, 0, -26]} rotation={[0, Math.PI, 0]} />
      </group>
    </group>
  )
}
