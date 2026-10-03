import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, Path, Shape, type Group } from 'three'
import { roundedPolygon } from '../../lib/shapes'
import { Static } from '../../lib/render/Static'
import { OPEN, type ClipSpec } from './spec'

/**
 * The clips' looks (./spec), each in its own frame: two jaws that swing open about the hinge (`open`:
 * 0 shut, 1 wide) and a hinge that stays put.
 *
 *   amber    tortoise acetate: flat slotted panels, lips of combing teeth, a chunky hinge, tabs
 */
type Open = { current: number }
const BEVEL = 0.6

/** a jaw: swings about the hinge's pin (vertical, at hinge.x), +Z jaw one way, -Z the other */
function Jaw({ c, side, open, children }: { c: ClipSpec; side: 1 | -1; open: Open; children: ReactNode }) {
  const pivot = useRef<Group>(null)
  useFrame(() => {
    if (pivot.current) pivot.current.rotation.y = side * OPEN * open.current
  })
  return (
    <group ref={pivot} position={[c.hinge.x, 0, 0]} userData={{ live: true }}>
      <group position={[-c.hinge.x, 0, 0]}>
        <Static>{children}</Static>
      </group>
    </group>
  )
}

/** a jaw's flat side lying in XY (extruded +Z by `depth`), with holes */
function panel(c: ClipSpec, radii: number[], holes: Path[], depth = c.t) {
  const L = c.length
  const s = roundedPolygon(
    [
      [0, -L / 2],
      [c.x1, -L / 2],
      [c.x1, L / 2],
      [0, L / 2],
    ],
    radii,
  )
  s.holes.push(...holes)
  const b = Math.min(BEVEL, depth / 3)
  return new ExtrudeGeometry(s, { depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 12 }).translate(0, 0, b)
}
/** a lip: an arc of acetate round the pole from beside it (90°) to behind it, `side` +1 the +Z jaw */
function lip(c: ClipSpec, side: 1 | -1, length = c.length) {
  const r0 = c.lip.r
  const r1 = c.lip.r + c.t
  const a0 = -side * (Math.PI / 2) // (the shape's y is the world's -z once stood up)
  const a1 = -side * c.lip.to
  const s = new Shape()
  s.absarc(0, 0, r1, a0, a1, side > 0)
  s.absarc(0, 0, r0, a1, a0, side < 0)
  s.closePath()
  const b = Math.min(BEVEL, c.t / 3)
  const g = new ExtrudeGeometry(s, { depth: length - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.6, bevelSegments: 2, curveSegments: 16 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -length / 2 + b, 0)
  return g
}
/** a handle tab's place: behind the hinge, splayed out (the jaws are shut) */
const tabAt = (c: ClipSpec, side: 1 | -1) => ({
  position: [c.hinge.x + c.hinge.r + c.handle.len / 2 - 2, 0, side * (c.zIn + c.t / 2 - 5 + Math.sin(c.handle.splay) * (c.handle.len / 2))] as [number, number, number],
  rotation: [0, -side * c.handle.splay, 0] as [number, number, number],
})
/** the teeth at each lip's end, reaching past the middle behind the pole, the two jaws' in turn */
function teeth(c: ClipSpec, per: number) {
  const n = per * 2
  const step = c.length / n
  const rm = c.lip.r + c.t / 2
  const reach = Math.PI - c.lip.to + 0.12
  return Array.from({ length: n }, (_, i) => {
    const side = (i % 2 ? -1 : 1) as 1 | -1
    const a = side * (c.lip.to + reach / 2)
    return {
      key: i,
      side,
      position: [Math.cos(a) * rm, -c.length / 2 + step * (i + 0.5), Math.sin(a) * rm] as [number, number, number],
      rotation: [0, -a + Math.PI / 2, 0] as [number, number, number],
      args: [reach * rm, step * 0.78, c.t] as [number, number, number],
    }
  })
}
// ---- amber: tortoise acetate rectangle
function Amber({ c, open }: { c: ClipSpec; open: Open }) {
  const mat = useMemo(() => ({ acetate: new MeshStandardMaterial({ color: '#bb7d4c', roughness: 0.65 }), dark: new MeshStandardMaterial({ color: '#8d5932', roughness: 0.8 }) }), [])
  const geo = useMemo(() => {
    const cx = c.x1 / 2
    const slot = roundedPolygon(
      [
        [cx - 3.25, -36],
        [cx + 3.25, -36],
        [cx + 3.25, 36],
        [cx - 3.25, 36],
      ],
      3.15,
      new Path(),
    )
    return { panel: panel(c, [0.5, 7, 7, 0.5], [slot]), lip: { 1: lip(c, 1), [-1]: lip(c, -1) }, pin: new CylinderGeometry(c.hinge.r * 0.55, c.hinge.r * 0.55, c.hinge.h + 3, 12) }
  }, [c])
  const tt = useMemo(() => teeth(c, 7), [c])
  const hx0 = c.x1 - 2
  const hx1 = c.hinge.x + c.hinge.r
  return (
    <>
      {([1, -1] as const).map((s) => (
        <Jaw key={s} c={c} side={s} open={open}>
          <mesh geometry={geo.panel} material={mat.acetate} position={[0, 0, s * c.zIn]} scale={[1, 1, s]} castShadow receiveShadow />
          <mesh geometry={geo.lip[s]} material={mat.acetate} castShadow receiveShadow />
          {tt
            .filter((t) => t.side === s)
            .map((t) => (
              <RoundedBox key={t.key} args={t.args} radius={1.1} smoothness={2} position={t.position} rotation={t.rotation} material={mat.acetate} castShadow />
            ))}
          <RoundedBox args={[c.handle.len + 4, c.handle.h, c.t]} radius={1.3} smoothness={2} {...tabAt(c, s)} material={mat.acetate} castShadow receiveShadow />
        </Jaw>
      ))}
      <RoundedBox args={[hx1 - hx0, c.hinge.h, 2 * (c.zIn + c.t)]} radius={3.5} smoothness={3} position={[(hx0 + hx1) / 2, 0, 0]} material={mat.acetate} castShadow receiveShadow />
      <mesh geometry={geo.pin} material={mat.dark} position={[c.hinge.x, 0, 0]} />
    </>
  )
}

/** a clip's look, by kind */
export function ClipModel({ c, open }: { c: ClipSpec; open: Open }) {
  // (merged: one draw a material; the jaws, swinging, each merged on their own)
  return (
    <Static>
      <Amber c={c} open={open} />
    </Static>
  )
}
