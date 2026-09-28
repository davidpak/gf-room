import { Vector3 } from 'three'

/**
 * Growing trees, each its own: give it a seed and a species, it grows a tree nobody has drawn.
 *
 *   genes      the seed rolls the tree's character first: how its trunk leans, how high it forks,
 *              how many main limbs (unevenly round it), how far they reach, how crooked they are,
 *              how much they sag
 *   growth     a branch grows in short steps: it wanders a little every step and now and then turns
 *              an elbow; young ones reach for the light, long ones sag under their own length
 *   branching  side branches sprout at uneven places along a branch, turning round it (the golden
 *              angle, jostled), angled out and up; each thinner than its parent (da Vinci's rule:
 *              the parent's cross-section shared out) and shorter, down to the twigs
 *   blossom    clouds along the upper side of the finer branches and at their tips (so the canopy
 *              takes the branches' shape, with the dark limbs showing through underneath)
 *
 * Returns the branches (smooth paths with a radius at each end) and the blossom clouds, in mm, the
 * tree's foot at the origin. Pure: the same seed grows the same tree.
 */
export type Species = {
  trunk: { h: [number, number]; r: [number, number]; lean: [number, number] }
  limbs: { n: [number, number]; rise: [number, number]; reach: [number, number]; sag: number }
  branch: { n: [number, number][]; angle: [number, number]; shrink: [number, number] }
  crook: { wander: number; elbow: number; elbowChance: number }
  reachUp: number
  /** branches sag no lower than this (mm) */
  floor: number
  depth: number
  blossom: { from: number; r: [number, number]; spacing: number; lift: [number, number] }
}

/** the Quad's Yoshino cherries: short, thick trunks forking low into long crooked limbs that sweep
 *  out nearly level and sag, a wide cloud of blossom */
export const YOSHINO: Species = {
  trunk: { h: [170, 330], r: [85, 125], lean: [0.05, 0.28] },
  limbs: { n: [2, 4], rise: [0.25, 0.85], reach: [520, 980], sag: 0.32 },
  branch: {
    n: [
      [3, 5],
      [2, 4],
      [1, 3],
    ],
    angle: [0.45, 1.0],
    shrink: [0.45, 0.72],
  },
  crook: { wander: 0.2, elbow: 0.5, elbowChance: 0.14 },
  reachUp: 0.1,
  floor: 380,
  depth: 3,
  blossom: { from: 1, r: [95, 165], spacing: 150, lift: [35, 85] },
}

export type Branch = { pts: Vector3[]; r0: number; r1: number; depth: number }
export type Cloud = { at: Vector3; r: number }
export type Tree = { branches: Branch[]; clouds: Cloud[]; height: number; spread: number }

export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const UP = new Vector3(0, 1, 0)
const between = (rand: () => number, [a, b]: [number, number]) => a + (b - a) * rand()
/** any direction square to d */
const across = (d: Vector3, rand: () => number) => {
  const a = Math.abs(d.y) < 0.9 ? UP : new Vector3(1, 0, 0)
  const p = new Vector3().crossVectors(d, a).normalize()
  return p.applyAxisAngle(d, rand() * Math.PI * 2)
}

export function growTree(seed: number, sp: Species = YOSHINO): Tree {
  const rand = rng(seed)
  const branches: Branch[] = []
  const clouds: Cloud[] = []

  /** a branch: from `from` along `dir`, `len` long, `r0` thick at its root; then its children */
  const grow = (from: Vector3, dir: Vector3, len: number, r0: number, depth: number, sag: number) => {
    const step = Math.min(90, Math.max(38, len / 9))
    const n = Math.max(3, Math.round(len / step))
    const pts = [from.clone()]
    const d = dir.clone().normalize()
    let p = from.clone()
    // a crooked character of its own: which way it tends to wander
    const lean = across(d, rand).multiplyScalar(sp.crook.wander * 0.5)
    for (let i = 1; i <= n; i++) {
      const k = i / n
      // wander, and now and then an elbow
      d.applyAxisAngle(across(d, rand), (rand() - 0.5) * sp.crook.wander * (depth === 0 ? 0.3 : 1))
      if (depth > 0 && rand() < sp.crook.elbowChance) d.applyAxisAngle(across(d, rand), (rand() < 0.5 ? -1 : 1) * sp.crook.elbow * (0.6 + rand() * 0.6))
      d.addScaledVector(lean, 0.08)
      // reach for the light; sag under its own length (more toward its end, more the longer it is)
      d.addScaledVector(UP, sp.reachUp * (depth + 1) * 0.35)
      d.y -= sag * k * (len / 900)
      // (however it sags, it keeps above head height: the canopy's a ceiling, not a skirt)
      if (depth > 0 && p.y < sp.floor) d.y = Math.max(d.y, 0.2 + (sp.floor - p.y) / 300)
      d.normalize()
      p = p.clone().addScaledVector(d, step)
      pts.push(p)
    }
    const r1 = Math.max(2.5, r0 * (depth === 0 ? 0.72 : 0.22))
    branches.push({ pts, r0, r1, depth })
    const at = (t: number) => {
      const f = t * (pts.length - 1)
      const i = Math.min(pts.length - 2, Math.floor(f))
      return pts[i].clone().lerp(pts[i + 1], f - i)
    }
    const dirAt = (t: number) => {
      const f = t * (pts.length - 1)
      const i = Math.min(pts.length - 2, Math.floor(f))
      return pts[i + 1].clone().sub(pts[i]).normalize()
    }
    const rAt = (t: number) => r0 + (r1 - r0) * t
    // blossom: along the upper side of the finer branches, and a bigger cloud at the tip
    if (depth >= sp.blossom.from) {
      const along = len / sp.blossom.spacing
      for (let i = 0; i < along; i++) {
        const t = 0.3 + (0.7 * (i + rand() * 0.6)) / Math.max(1, along)
        if (t > 1) continue
        clouds.push({ at: at(t).addScaledVector(UP, between(rand, sp.blossom.lift)), r: between(rand, sp.blossom.r) * (depth === sp.blossom.from ? 0.85 : 1) })
      }
      clouds.push({ at: at(1).addScaledVector(UP, between(rand, sp.blossom.lift) * 0.6), r: between(rand, sp.blossom.r) * 1.15 })
    }
    if (depth >= sp.depth) return
    // the children: at uneven places, turning round the branch, angled out and up
    if (depth === 0) {
      // the main limbs, off the fork (one sometimes lower down the trunk, for character)
      const count = Math.round(between(rand, sp.limbs.n))
      let az = rand() * Math.PI * 2
      const share = Math.sqrt(1 / count) * 1.1
      for (let i = 0; i < count; i++) {
        az += ((Math.PI * 2) / count) * (0.6 + rand() * 0.8)
        const rise = between(rand, sp.limbs.rise)
        const out = new Vector3(Math.cos(az), 0, Math.sin(az))
        const ld = out.multiplyScalar(Math.cos(rise)).addScaledVector(UP, Math.sin(rise)).normalize()
        const t = i === 0 && rand() < 0.35 ? 0.55 + rand() * 0.2 : 0.88 + rand() * 0.12
        // (the root pulled back into the trunk: no seam)
        const root = at(t).addScaledVector(ld, -rAt(t) * 0.5)
        grow(root, ld, between(rand, sp.limbs.reach) * (t < 0.8 ? 0.8 : 1), rAt(t) * share * (0.85 + rand() * 0.3), 1, sp.limbs.sag * (0.7 + rand() * 0.8))
      }
      return
    }
    const [lo, hi] = sp.branch.n[Math.min(depth - 1, sp.branch.n.length - 1)]
    const count = Math.round(lo + rand() * (hi - lo))
    const ts = Array.from({ length: count }, () => 0.22 + rand() * 0.7).sort((a, b) => a - b)
    let spin = rand() * Math.PI * 2
    const share = Math.sqrt(1 / (count + 1))
    for (const t of ts) {
      spin += 2.39996 + (rand() - 0.5) * 0.9 // (the golden angle, jostled)
      const pd = dirAt(t)
      const side = across(pd, () => 0).applyAxisAngle(pd, spin)
      const angle = between(rand, sp.branch.angle)
      const cd = pd.clone().applyAxisAngle(side.clone().cross(pd).normalize(), angle)
      // out and a little up (never back in toward the trunk, never straight down)
      cd.y = Math.max(cd.y, -0.25) + 0.12
      cd.normalize()
      const r = Math.max(2.5, rAt(t) * share * 1.25 * (0.8 + rand() * 0.4))
      const root = at(t).addScaledVector(cd, -rAt(t) * 0.4)
      grow(root, cd, len * (1 - t * 0.5) * between(rand, sp.branch.shrink), r, depth + 1, sag * 0.6)
    }
  }

  // the trunk: up out of the ground, leaning its own way
  const lean = between(rand, sp.trunk.lean)
  const la = rand() * Math.PI * 2
  const tdir = new Vector3(Math.cos(la) * Math.sin(lean), Math.cos(lean), Math.sin(la) * Math.sin(lean))
  grow(new Vector3(0, -25, 0), tdir, between(rand, sp.trunk.h), between(rand, sp.trunk.r), 0, 0)

  let height = 0
  let spread = 0
  for (const c of clouds) {
    height = Math.max(height, c.at.y + c.r)
    spread = Math.max(spread, Math.hypot(c.at.x, c.at.z) + c.r)
  }
  return { branches, clouds, height, spread }
}
