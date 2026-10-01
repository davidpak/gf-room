import { useLayoutEffect, useMemo, useRef } from 'react'
import { CatmullRomCurve3, Color, InstancedMesh, Matrix4, Quaternion, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import { bruno } from '../quad/bruno'
import { rng } from './paint'

/**
 * A bunch of grapes (./spec [G]), lying on its side as it's been set down, in real millimetres: the grapes
 * (green ones a little long, red ones rounder) packed round the stalk, wide at its shoulders, tapering to its
 * tip, settled flat underneath where it lies; the woody stem out of its top. Eaten grapes (`eaten`, by index)
 * are gone.
 *
 * Its frame: lying on y = 0, its stem at x = 0, its tip toward +x.
 */
export const GRAPES = [
  { n: 34, r: 10.5, long: 1.15, len: 150, wide: 46, color: '#a9d062', deep: '#83b347', shade: '#5f8a5e' }, // [G] green
  { n: 28, r: 9.5, long: 1.04, len: 118, wide: 40, color: '#7c2d4e', deep: '#5a2140', shade: '#4a2846' }, // red
] as const

const made: Record<number, ReturnType<typeof build>> = {}
function build(k: 0 | 1) {
  const G = GRAPES[k]
  const r = rng(201 + k * 17)
  // packed: dropped into the bunch's shape and pushed apart, settling down onto the ground
  const pts = Array.from({ length: G.n }, (_, i) => {
    const t = (i + r()) / G.n
    const x = 18 + t * (G.len - 25)
    const env = G.wide * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.85)), 0.8)
    const a = r() * Math.PI * 2
    const d = env * Math.sqrt(r())
    return new Vector3(x, G.r + 20 + Math.sin(a) * d * 0.6, Math.cos(a) * d)
  })
  const size = pts.map(() => G.r * (0.88 + r() * 0.22))
  for (let it = 0; it < 120; it++) {
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const d = pts[i].distanceTo(pts[j])
        const want = (size[i] + size[j]) * 0.96
        if (d < want && d > 1e-4) {
          const push = pts[j].clone().sub(pts[i]).multiplyScalar(((want - d) / d) * 0.5)
          pts[i].sub(push)
          pts[j].add(push)
        }
      }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      p.y -= 1.2 // (settling)
      p.y = Math.max(size[i] * 0.97, p.y)
      // (held to the stalk: not too far out from its line)
      const t = Math.min(1, Math.max(0, (p.x - 18) / (G.len - 25)))
      const env = G.wide * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.85)), 0.8) + 4
      const off = new Vector3(0, p.y - G.wide * 0.55, p.z)
      if (off.length() > env) off.setLength(env)
      p.y = G.wide * 0.55 + off.y
      p.z = off.z
      p.x = Math.min(G.len, Math.max(14, p.x))
    }
  }
  // each grape: its size, turned a little this way and that, its colour a little different
  const mats = pts.map((p, i) => {
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1 + r() - 0.5, r() - 0.5, r() - 0.5).normalize())
    return new Matrix4().compose(p, q, new Vector3(size[i], size[i] * G.long, size[i]))
  })
  const cols = pts.map(() => new Color(G.color).lerp(new Color(G.deep), r() * 0.7).multiplyScalar(0.94 + r() * 0.1))
  // the stalk through it, and the woody stem out of its top
  const mid = pts.reduce((a, p) => a + p.y, 0) / pts.length - 4 // (down in among them)
  const stalk = new TubeGeometry(new CatmullRomCurve3([new Vector3(-22, mid + 14, 8), new Vector3(-14, mid + 9, 4), new Vector3(-4, mid + 2, 1), new Vector3(14, mid - 2, 0), new Vector3(G.len * 0.6, mid - 6, 0)]), 20, 2.6, 6)
  const twigs = [new TubeGeometry(new CatmullRomCurve3([new Vector3(-14, mid + 9, 4), new Vector3(-17, mid + 4, -6), new Vector3(-15, mid - 2, -12)]), 6, 1.6, 5)]
  return { mats, cols, stalk, twigs }
}
export const SPHERE = new SphereGeometry(1, 16, 12)
const STEM = bruno({ color: '#8e7a45', shade: '#5f5550' })
export const SKIN = [0, 1].map((k) => bruno({ color: '#ffffff', shade: GRAPES[k].shade, sheen: 0.35 }))

export function Grapes({ k = 0, eaten }: { k?: 0 | 1; eaten?: Set<number> }) {
  const b = useMemo(() => (made[k] ??= build(k)), [k])
  const inst = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = inst.current
    if (!m) return
    const zero = new Matrix4().makeScale(0, 0, 0)
    b.mats.forEach((mx, i) => {
      m.setMatrixAt(i, eaten?.has(i) ? zero : mx)
      m.setColorAt(i, b.cols[i])
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [b, eaten])
  return (
    <group>
      <instancedMesh ref={inst} args={[SPHERE, SKIN[k], b.mats.length]} castShadow receiveShadow />
      <mesh geometry={b.stalk} material={STEM} castShadow />
      {b.twigs.map((g, i) => (
        <mesh key={i} geometry={g} material={STEM} />
      ))}
    </group>
  )
}
export const grapeCount = (k: 0 | 1) => GRAPES[k].n
/** the grape nearest a point (its frame) that's not been eaten yet, or -1 */
export function nearestGrape(k: 0 | 1, p: Vector3, eaten?: Set<number>) {
  const b = (made[k] ??= build(k))
  let best = -1
  let bd = Infinity
  const c = new Vector3()
  b.mats.forEach((m, i) => {
    if (eaten?.has(i)) return
    const d = c.setFromMatrixPosition(m).distanceTo(p)
    if (d < bd) [bd, best] = [d, i]
  })
  return best
}
/** its box, for a collider (its frame) */
export const grapesBox = (k: 0 | 1) => {
  const G = GRAPES[k]
  return { half: [G.len / 2 + 6, G.wide * 0.55 + 4, G.wide + 4] as [number, number, number], at: [G.len / 2 - 2, G.wide * 0.55 + 4, 0] as [number, number, number] }
}
