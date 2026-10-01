import { useSyncExternalStore } from 'react'
import { Matrix4, Vector3 } from 'three'
import { BAGUETTE, pieceLength } from './Baguette'

/**
 * The bread out for the ducks: pieces torn off the baguette and thrown, crumbs that fell as it tore. Each
 * lands somewhere and lies there till it's eaten (a piece takes a duck a few pecks, a crumb one). One store
 * for the scene: whoever tears and throws adds to it (./Toss draws them), the ducks (../ducks) read it and
 * eat from it.
 */
export type Bit = {
  id: number
  kind: 'piece' | 'crumb'
  /** where it lies (world) and which way */
  p: Vector3
  yaw: number
  /** pecks it takes, pecks left */
  bites: number
  left: number
  /** a piece: what part of the baguette it was (its own frame), so it's drawn as it tore */
  a: number
  b: number
  seed: number
}
/** something in the air: torn off and thrown, or a crumb falling */
export type Throw = { id: number; kind: 'piece' | 'crumb'; from: Matrix4; to: Vector3; a: number; b: number; t: number; dur: number; seed: number }

let bits: Bit[] = []
let throws: Throw[] = []
let version = 0
let next = 1
const subs = new Set<() => void>()
const changed = () => {
  version++
  subs.forEach((f) => f())
}

export const feed = {
  bits: () => bits,
  throws: () => throws,
  /** throw it: from where it is (world matrix, its scale the drawing's) to land at `to` */
  toss(t: Omit<Throw, 'id' | 't'>) {
    throws = [...throws, { ...t, id: next++, t: 0 }]
    changed()
  },
  /** it's come down: lying where it landed, to be eaten */
  land(t: Throw, yaw: number) {
    throws = throws.filter((x) => x.id !== t.id)
    const bitesFor = t.kind === 'piece' ? Math.max(2, Math.round((t.b - t.a) / 16)) : 1
    bits = [...bits, { id: t.id, kind: t.kind, p: t.to.clone(), yaw, bites: bitesFor, left: bitesFor, a: t.a, b: t.b, seed: t.seed }]
    landed.forEach((f) => f(bits[bits.length - 1]))
    changed()
  },
  /** a peck at it: how much is left (it's gone at 0) */
  bite(id: number) {
    const b = bits.find((x) => x.id === id)
    if (!b) return 0
    b.left--
    if (b.left <= 0) bits = bits.filter((x) => x.id !== id)
    changed()
    return Math.max(0, b.left)
  },
  clear() {
    bits = []
    throws = []
    changed()
  },
  /** told when something lands (the ducks look up) */
  onLand(f: (b: Bit) => void) {
    landed.add(f)
    return () => void landed.delete(f)
  },
}
const landed = new Set<(b: Bit) => void>()

export function useFeed() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => version,
  )
}

/** tearing the baguette (what's left of it: lo..hi) at a point along it (x, its frame): which end the
 *  piece comes off (the nearer), the piece, and what's left (null: that was the last of it) */
export function tear(lo: number, hi: number, x: number, n: number) {
  const len = pieceLength(n)
  const fromLo = x - lo < hi - x
  if (hi - lo - len < 46) return { a: lo, b: hi, left: null, fromLo }
  return fromLo ? { a: lo, b: lo + len, left: { lo: lo + len, hi }, fromLo } : { a: hi - len, b: hi, left: { lo, hi: hi - len }, fromLo }
}
export const WHOLE = { lo: -BAGUETTE.l / 2, hi: BAGUETTE.l / 2 }

/** a piece torn off (a..b of the baguette, whose frame is `from` in the world) thrown toward the ducks
 *  (their middle, landing a little short of them, off the blanket), and the crumbs that fell where it tore */
export function throwBread(o: { from: Matrix4; a: number; b: number; fromLo: boolean; scale: number; ducks: { x: number; z: number }[]; ground: (x: number, z: number) => number; onBlanket?: (x: number, z: number) => boolean; n: number }) {
  const L = 580 * o.scale // (a duck's length: how far it's thrown is counted in it)
  const start = new Vector3((o.a + o.b) / 2, 26, 0).applyMatrix4(o.from)
  const dir = new Vector3()
  let dist = 4 * L
  if (o.ducks.length) {
    const c = o.ducks.reduce<Vector3>((s, d) => s.add(new Vector3(d.x, 0, d.z)), new Vector3()).multiplyScalar(1 / o.ducks.length)
    dir.set(c.x - start.x, 0, c.z - start.z)
    dist = dir.length()
  }
  if (dir.lengthSq() < 1e-6) dir.set(Math.cos(o.n), 0, Math.sin(o.n))
  dir.normalize()
  const reach = Math.max(1.6 * L, Math.min(4.5 * L, dist - 2.2 * L))
  const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.sin(o.n * 12.9898) * 0.5) * 1.4 * L)
  const to = start.clone().addScaledVector(dir, reach).add(side)
  for (let k = 0; k < 30 && o.onBlanket?.(to.x, to.z); k++) to.addScaledVector(dir, 0.25 * L)
  to.y = o.ground(to.x, to.z)
  feed.toss({ kind: 'piece', from: o.from, to, a: o.a, b: o.b, dur: 0.7 + reach / (12 * L), seed: o.n * 7 + 3 })
  // crumbs, where it tore
  const at = new Vector3(o.fromLo ? o.b : o.a, 30, 0).applyMatrix4(o.from)
  const count = 2 + (o.n % 3)
  for (let k = 0; k < count; k++) {
    const ang = o.n * 2.4 + k * 2.1
    const r = (0.04 + 0.05 * ((k * 0.37 + o.n * 0.61) % 1)) * L
    const land = new Vector3(at.x + Math.cos(ang) * r, 0, at.z + Math.sin(ang) * r)
    land.y = o.ground(land.x, land.z)
    feed.toss({ kind: 'crumb', from: new Matrix4().makeTranslation(at.x, at.y, at.z), to: land, a: 0, b: 0, dur: 0.35 + 0.1 * k, seed: o.n * 13 + k })
  }
}
