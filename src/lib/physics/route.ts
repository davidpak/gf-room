import { CatmullRomCurve3, Quaternion, Vector3 } from 'three'
import { GROUP, groups, type PhysLib, type PhysWorld } from './rope'

/**
 * Putting things back smoothly: a route round what's in the way, and a flight along it.
 *
 *   planRoute   from where it is to where it goes, asking the physics world what's solid (its own
 *               colliders, not the meshes): out from under anything overhead first (the desk, when
 *               it's fallen behind or under it), up to a clear height, across (round a thin thing
 *               like the lamp's pole if it's in the way, or higher), down to an approach point, then
 *               straight in (a plug into its port, blades into an outlet). One smooth curve
 *               through those points
 *   Flight      along a route over a time that suits its length, easing in and out (no jolts at
 *               either end), turning to its final angle on the way so it arrives square
 *
 * Millimetres. Cables, plugs and devices (a charger) don't count as in the way.
 */
const SOLID = groups(0xffff, 0xffff & ~GROUP.rope & ~GROUP.plug & ~GROUP.device)
const UP = new Vector3(0, 1, 0)

/** eased 0..1: starts and ends at rest, with no kick in its acceleration either */
export const smoother = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function planRoute(
  world: PhysWorld,
  rapier: PhysLib,
  from: Vector3,
  to: Vector3,
  o: { approach?: Vector3; clearance?: number; radius?: number } = {},
) {
  const r = o.radius ?? 20
  const clear = o.clearance ?? 60
  const approach = o.approach ?? to
  /** is the way from a to b blocked, for something about r across (a few parallel rays) */
  const blocked = (a: Vector3, b: Vector3) => {
    const d = b.clone().sub(a)
    const len = d.length()
    if (len < 1) return false
    d.divideScalar(len)
    const side = Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3().crossVectors(d, UP).normalize()
    const lift = new Vector3().crossVectors(side, d).normalize()
    if (lift.y < 0) lift.negate()
    // (no ray below the centre: something resting on a surface would start inside it)
    for (const [s, u] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, 0.5],
    ]) {
      const p = a.clone().addScaledVector(side, s * r).addScaledVector(lift, u * r).addScaledVector(d, 2)
      if (world.castRay(new rapier.Ray(p, d), len - 2, true, undefined, SOLID)) return true
    }
    return false
  }
  /** from under something: the nearest spot to one side with a clear way up */
  const escape = (p0: Vector3, H: number) => {
    let best: Vector3 | null = null
    let bd = Infinity
    for (let a = 0; a < 8; a++) {
      const dir = new Vector3(Math.cos((a * Math.PI) / 4), 0, Math.sin((a * Math.PI) / 4))
      for (let d = 40; d <= 800; d += 40) {
        const p = p0.clone().addScaledVector(dir, d)
        if (blocked(p0, p)) break
        if (!blocked(p, new Vector3(p.x, H, p.z))) {
          if (d < bd) {
            bd = d
            best = p.addScaledVector(dir, r)
          }
          break
        }
      }
    }
    return best
  }

  const pts = [from.clone()]
  let base = from.clone()
  const H0 = Math.max(from.y, approach.y) + clear
  if (blocked(from, new Vector3(from.x, H0, from.z))) {
    const e = escape(from, H0)
    if (e) {
      pts.push(e)
      base = e
    }
  }
  let H = H0
  let via: Vector3 | null = null
  search: for (let k = 0; k < 6; k++, H += 60) {
    const a = new Vector3(base.x, H, base.z)
    const b = new Vector3(approach.x, H, approach.z)
    if (blocked(base, a) || blocked(b, approach)) continue
    if (!blocked(a, b)) break
    // round a thin thing: a waypoint off to one side
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const side = new Vector3().crossVectors(b.clone().sub(a).normalize(), UP).normalize()
    for (const d of [90, -90, 170, -170, 260, -260]) {
      const v = mid.clone().addScaledVector(side, d)
      if (!blocked(a, v) && !blocked(v, b)) {
        via = v
        break search
      }
    }
  }
  if (H - base.y > 12) pts.push(new Vector3(base.x, H, base.z))
  if (via) pts.push(via)
  if (H - approach.y > 12) pts.push(new Vector3(approach.x, H, approach.z))
  pts.push(approach.clone())
  if (to.distanceTo(approach) > 1) pts.push(to.clone())
  const route = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 4)
  if (route.length < 2) route.push(to.clone())
  return new CatmullRomCurve3(route, false, 'centripetal')
}

/**
 * Travel eased with a glide: speeds up over the first `a` of the time, cruises, slows over the last
 * `a` (smooth all through, the top speed only 1 / (1 - a) of the average, not the 1.9x of a plain
 * ease). Distance done (0..1) at time u (0..1), from a table.
 */
function glide(a: number) {
  const n = 128
  const s = [0]
  const v = (u: number) => (u < a ? smoother(u / a) : u > 1 - a ? smoother((1 - u) / a) : 1)
  for (let i = 1; i <= n; i++) s.push(s[i - 1] + (v((i - 1) / n) + v(i / n)) / 2)
  const total = s[n]
  return (u: number) => {
    const x = Math.min(1, Math.max(0, u)) * n
    const i = Math.min(n - 1, Math.floor(x))
    return (s[i] + (s[i + 1] - s[i]) * (x - i)) / total
  }
}
export const GLIDE = glide(0.32)

/** a flight along a route: `pose` gives where it is and its angle at the time flown so far */
export class Flight {
  t = 0
  T: number
  private turn: [number, number]
  constructor(
    public curve: CatmullRomCurve3,
    public q0: Quaternion,
    public q1: Quaternion,
    o: { speed?: number; min?: number; max?: number; turn?: [number, number] } = {},
  ) {
    this.T = Math.min(o.max ?? 2.6, Math.max(o.min ?? 1, curve.getLength() / (o.speed ?? 320)))
    this.turn = o.turn ?? [0.05, 0.8]
  }
  /** fly on by dt; true once it has arrived */
  step(dt: number) {
    this.t = Math.min(this.T, this.t + dt)
    return this.t >= this.T
  }
  pose(p: Vector3, q: Quaternion) {
    this.poseAt(this.t, p, q)
  }
  /** where it is at time t of the flight (without flying there) */
  poseAt(t: number, p: Vector3, q: Quaternion) {
    this.curve.getPointAt(GLIDE(t / this.T), p)
    const [a, b] = this.turn
    q.copy(this.q0).slerp(this.q1, smoother((t / this.T - a) / (b - a)))
  }
}

/**
 * A line through points, read at any distance along it: what a cable follows when it's drawn along
 * a way (where it lay, where its end flew), keeping its length exactly.
 */
export class Path {
  readonly pts: Vector3[]
  readonly acc: number[]
  readonly length: number
  constructor(points: Vector3[]) {
    this.pts = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 1e-3).map((p) => p.clone())
    this.acc = [0]
    for (let i = 1; i < this.pts.length; i++) this.acc.push(this.acc[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]))
    this.length = this.acc[this.acc.length - 1]
  }
  at(s: number, out: Vector3) {
    const { pts, acc } = this
    if (pts.length === 1 || s <= 0) return out.copy(pts[0])
    if (s >= this.length) return out.copy(pts[pts.length - 1])
    let lo = 0
    let hi = acc.length - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (acc[m] <= s) lo = m
      else hi = m
    }
    return out.lerpVectors(pts[lo], pts[hi], (s - acc[lo]) / (acc[hi] - acc[lo]))
  }
}
