import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three'
import { LAMP, armPoints, shadeFrame } from '../lamp/spec'
import { CLIP_TOP } from '../clip/spec'

/**
 * Rina's Wumpus stress ball (Discord's "Destress Ball": Wumpus's head in soft foam), millimetres.
 * References (public/reference/):
 *   wumpus.webp          still in its bag, face on (David's photo): proportions and every feature
 *   room-desk-night.jpg  where it lives: tucked into the lamp's arm, under the hook, beside the pole,
 *                        sat on a claw clip clamped on the pole (../clip/spec)
 *   lamp-arm.webp        the same spot from the side: its back against the pole and the arm's rising
 *                        leg, facing out sideways (the way the arm's S is seen in profile)
 *   discordmerch.com/products/destress-ball: 76.2 × 50.8 × 50.8 (3 × 2 × 2 in), "9/10 doctors
 *                        recommend squeezing Wumpus's head when stressed"
 *
 * Measured in wumpus.webp, 5.25 px/mm (the 76.2 from ear to ear is 400 px):
 *   head      330 × 220 px (63 × 42): a soft box, rounder on top, flatter underneath
 *   muzzle    195 × 130 px (37 × 25), 15 px below the head's middle: a raised pale-blue block
 *   eyes      black, ⌀28 px (5.3), 248 px apart (47), 15 px above the middle, beside the muzzle's top
 *   nostrils  purple pills 30 × 14 px (5.7 × 2.7), 56 px apart (10.6), 33 px below the muzzle's middle
 *   ears      flat rounded slabs on the sides, 115 px tall (22), 6.6 out each side, with a pale face
 *   leaf      a green sprout on top, two leaves 165 px tip to tip (31), ~11 above the head
 * The three overall sizes come out as the store's: 76.2 ear to ear, 50.8 from the bottom to the
 * leaves' tips, 50.8 from the back to the muzzle.
 *
 * Local frame: origin at the head's middle, +Y up, +Z the way it faces, ears along X.
 */
export const WUMPUS = {
  size: { w: 76.2, h: 50.8, d: 50.8 }, // the store's
  head: { w: 63, h: 41, d: 44, n: 3, nBottom: 4.5 }, // a superellipsoid (half-sizes = these / 2); n: how boxy (2 = an egg)
  muzzle: { w: 37, h: 24, d: 16, out: 7, y: -3, n: 3.4 }, // `out`: how far it stands off the face
  eye: { d: 5.3, apart: 47, y: 3, flat: 0.45 },
  nostril: { w: 5.7, h: 2.7, apart: 10.6, below: 6.3 },
  ear: { t: 9.2, h: 22, d: 16, out: 6.6, y: -2, n: 2.6 }, // t: thickness across (partly set into the head)
  leaf: { len: 13, w: 7.5, t: 2.4, rise: (25 * Math.PI) / 180, stem: { r: 2, h: 5 } },
  mass: 0.02, // polyurethane foam: a light squishy
  color: {
    body: '#7178dd', // periwinkle (the bag and the lamp's light wash it out; this is it clean)
    muzzle: '#dce4f8',
    nostril: '#6269cf',
    eye: '#1d1b2c',
    ear: '#b3b8f4',
    leaf: '#4cbb6f',
    stem: '#3a9e5a',
  },
}

export type Blob = { a: number; b: number; c: number; n: number; nBottom: number }
export const HEAD: Blob = { a: WUMPUS.head.w / 2, b: WUMPUS.head.h / 2, c: WUMPUS.head.d / 2, n: WUMPUS.head.n, nBottom: WUMPUS.head.nBottom }
const M = WUMPUS.muzzle
export const MUZZLE: Blob = { a: M.w / 2, b: M.h / 2, c: M.d / 2, n: M.n, nBottom: M.n }
/** the muzzle's middle: its front stands `out` off the face */
export const MUZZLE_AT = new Vector3(0, M.y, HEAD.c + M.out - M.d / 2)
const E = WUMPUS.ear
export const EAR: Blob = { a: E.t / 2, b: E.h / 2, c: E.d / 2, n: E.n, nBottom: E.n }
/** the right ear's middle (the left mirrors it): its outer face 6.6 beyond the head's side */
export const EAR_AT = new Vector3(HEAD.a + E.out - E.t / 2, E.y, 0)

/**
 * A soft box (superellipsoid): |x/a|^n + |y/b|^n + |z/c|^n = 1, flatter underneath when nBottom > n.
 * `radial` is the surface point in a direction from the middle.
 */
export function radial(s: Blob, dir: Vector3, out = new Vector3()) {
  const n = dir.y < 0 ? s.nBottom : s.n
  const f = Math.abs(dir.x / s.a) ** n + Math.abs(dir.y / s.b) ** n + Math.abs(dir.z / s.c) ** n
  return out.copy(dir).multiplyScalar(f ** (-1 / n))
}
/** the front (+Z) surface over (x, y), and its outward normal */
export function front(s: Blob, x: number, y: number) {
  const n = y < 0 ? s.nBottom : s.n
  const r = 1 - Math.abs(x / s.a) ** n - Math.abs(y / s.b) ** n
  const z = s.c * Math.max(0, r) ** (1 / n)
  const g = (v: number, k: number) => (Math.sign(v) * Math.abs(v / k) ** (n - 1)) / k
  return { p: new Vector3(x, y, z), normal: new Vector3(g(x, s.a), g(y, s.b), g(z, s.c)).normalize() }
}
/** where the eyes sit (the right one; the left mirrors it) */
export const eyeAt = () => front(HEAD, WUMPUS.eye.apart / 2, WUMPUS.eye.y)
/** the nostrils (the right one): on the muzzle's front, in its lower half */
export function nostrilAt() {
  const N = WUMPUS.nostril
  const f = front(MUZZLE, N.apart / 2, -N.below)
  f.p.add(MUZZLE_AT)
  return f
}
/** the sprout: the stem's top, and each leaf's way out from it (right +1, left -1) */
export function leafFrame() {
  const L = WUMPUS.leaf
  const top = new Vector3(0, radial(HEAD, new Vector3(0, 1, 0)).y + L.stem.h - 2, 0)
  const out = (s: 1 | -1) => new Vector3(s * Math.cos(L.rise), Math.sin(L.rise), 0)
  return { top, out }
}
/** the leaves' tips (for the overall height; the collider rounds them off with a ball) */
export function leafTips() {
  const L = WUMPUS.leaf
  const { top, out } = leafFrame()
  return ([1, -1] as const).map((s) => top.clone().addScaledVector(out(s), L.len).add(new Vector3(0, L.t / 2, 0)))
}

/** points over the whole shape (its own frame): the collider's hull, and the checks */
export function shapePoints(step = 12) {
  const pts: Vector3[] = []
  const d = new Vector3()
  const each = (s: Blob, at: Vector3, mirror = false) => {
    for (let i = 0; i <= step; i++) {
      const th = (i / step) * Math.PI
      for (let j = 0; j < step * 2; j++) {
        const ph = (j / (step * 2)) * Math.PI * 2
        d.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph))
        const p = radial(s, d).add(at)
        pts.push(p.clone())
        if (mirror) pts.push(p.clone().setX(-p.x))
        if (i === 0 || i === step) break // (the poles: one point)
      }
    }
  }
  each(HEAD, new Vector3())
  each(MUZZLE, MUZZLE_AT)
  each(EAR, EAR_AT, true)
  return pts
}

/**
 * Its perch on the lamp (in the lamp's frame, ../lamp/spec): sat on the top of Rina's claw clip
 * (../clip/spec), facing out sideways (+X), its back resting against the pole and the arm's rising
 * leg (the leg is 30 from the pole: it sits across the middle of the pair), under the hook.
 */
export const PERCH_SIT = 0.5 // its bottom over the clip's top
export const PERCH_Y = CLIP_TOP + HEAD.b + PERCH_SIT
export const PERCH_GAP = 0.8 // between its back and the pole's collider
let perchX: number | null = null
export function perch() {
  const lateral = LAMP.arm.offset / 2 // the pole and the leg, either side of its middle
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2) // its +Z to the lamp's +X
  if (perchX === null) {
    // back it up until the nearest of its back is PERCH_GAP off the pole's collider and the leg's
    // (the tubes are round and its back bulges between them: found by halving, not by formula)
    const back = shapePoints(16).map((p) => p.clone().applyQuaternion(q))
    const tubes = [
      { z: 0, r: LAMP.pole.r + 1 }, // (the colliders are a little fatter than the tubes)
      { z: LAMP.arm.offset, r: LAMP.arm.r + 0.5 },
    ]
    const gap = (x: number) => Math.min(...back.map((p) => Math.min(...tubes.map((t) => Math.hypot(p.x + x, p.z + lateral - t.z) - t.r))))
    let lo = 0
    let hi = 80
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2
      if (gap(m) < PERCH_GAP) lo = m
      else hi = m
    }
    perchX = hi
  }
  return new Matrix4().compose(new Vector3(perchX, PERCH_Y, lateral), q, new Vector3(1, 1, 1))
}

/** The spec's own check: geometry that must hold before anything is built. */
export function checkWumpus() {
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })
  const W = WUMPUS
  const pts = shapePoints(24)
  const tips = leafTips()
  const span = (k: 'x' | 'y' | 'z') => {
    const v = pts.map((p) => p[k])
    return { lo: Math.min(...v), hi: Math.max(...v) }
  }
  const wide = span('x').hi - span('x').lo
  const tall = Math.max(...tips.map((t) => t.y)) - span('y').lo
  const deep = span('z').hi - span('z').lo
  add('ear to ear (store 76.2)', Math.abs(wide - W.size.w) < 1, `${wide.toFixed(1)} mm`)
  add('bottom to leaf tips (store 50.8)', Math.abs(tall - W.size.h) < 1.5, `${tall.toFixed(1)} mm`)
  add('back to muzzle (store 50.8)', Math.abs(deep - W.size.d) < 1.5, `${deep.toFixed(1)} mm`)
  add('muzzle / head width (photo 0.59)', Math.abs(W.muzzle.w / W.head.w - 0.59) < 0.03, (W.muzzle.w / W.head.w).toFixed(2))
  add('eyes apart / head width (photo 0.75)', Math.abs(W.eye.apart / W.head.w - 0.75) < 0.03, (W.eye.apart / W.head.w).toFixed(2))
  const eyeGap = W.eye.apart / 2 - W.eye.d / 2 - W.muzzle.w / 2
  add('eyes clear the muzzle', eyeGap > 1, `${eyeGap.toFixed(1)} mm`)
  const e = eyeAt()
  add('eyes on the face, not round the side', e.normal.z > 0.5, `${((Math.acos(e.normal.z) * 180) / Math.PI).toFixed(0)}° off the front`)
  const nIn = W.muzzle.w / 2 - (W.nostril.apart / 2 + W.nostril.w / 2)
  add('nostrils on the muzzle', nIn > 3 && W.nostril.below + W.nostril.h / 2 < W.muzzle.h / 2 - 2, `${nIn.toFixed(1)} mm in from its side`)
  // the ears are set into the head: their inner face is inside it all round their edge
  let worstEar = -1e9
  const sideways: Blob = { ...HEAD, a: HEAD.c, c: HEAD.a } // the head seen from the side: its surface in x over (z, y)
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2
    const y = EAR_AT.y + Math.sin(t) * EAR.b * 0.95
    const z = Math.cos(t) * EAR.c * 0.95
    worstEar = Math.max(worstEar, EAR_AT.x - EAR.a - front(sideways, z, y).p.z)
  }
  add('ears set into the head (no gap)', worstEar < -0.3, `${(-worstEar).toFixed(1)} mm in`)
  // a flat patch underneath to stand on (within 1 mm of the lowest point)
  let flat = 0
  for (let x = 0; x < HEAD.a; x += 0.25) if (HEAD.b * Math.max(0, 1 - Math.abs(x / HEAD.a) ** HEAD.nBottom) ** (1 / HEAD.nBottom) > HEAD.b - 1) flat = 2 * x
  add('stands on a flat patch', flat > 20, `${flat.toFixed(0)} mm across`)

  // the perch: resting against the pole and the leg, clear of the arm's bends and the shade
  const P = perch()
  const world = pts.map((p) => p.clone().applyMatrix4(P))
  const worldTips = tips.map((p) => p.clone().applyMatrix4(P))
  const pole = Math.min(...world.map((p) => Math.hypot(p.x, p.z) - (LAMP.pole.r + 1)))
  add('rests against the pole', pole > 0.2 && pole < 2, `${pole.toFixed(1)} mm`)
  const sit = Math.min(...world.map((p) => p.y)) - CLIP_TOP
  add('sits on the claw clip', sit > 0.1 && sit < 1.5, `${sit.toFixed(1)} mm over its top`)
  const arm = new CatmullRomCurve3(armPoints(), false, 'centripetal').getSpacedPoints(300)
  const armGap = Math.min(...world.map((p) => Math.min(...arm.map((a) => a.distanceTo(p))))) - (LAMP.arm.r + 0.5)
  add('beside the arm, not in it', armGap > 0.2 && armGap < 6, `${armGap.toFixed(1)} mm`)
  const F = shadeFrame()
  const S = LAMP.shade
  let shade = 1e9
  for (const p of [...world, ...worldTips]) {
    const v = p.clone().sub(F.top)
    const t = v.dot(F.axis)
    const r = v.addScaledVector(F.axis, -t).length()
    if (t >= 0 && t <= S.h) shade = Math.min(shade, r - (S.rTop + (S.rBottom - S.rTop) * (t / S.h)))
    else if (t < 0 && t > -LAMP.cap.h) shade = Math.min(shade, r - LAMP.cap.r)
  }
  add('clear of the shade and cap', shade > 5, `${shade.toFixed(0)} mm`)
  const topY = Math.max(...worldTips.map((t) => t.y))
  // (the hook is in the arm's plane, which it sits beside: 'beside the arm' covers it) the finial's urn tops the pole
  add('under the finial', topY < LAMP.pole.top - 10, `leaves ${(LAMP.pole.top - topY).toFixed(0)} mm below it`)
  return results
}
