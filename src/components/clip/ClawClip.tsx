import { useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import { CuboidCollider } from '@react-three/rapier'
import { CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, Path, Shape, type Group } from 'three'
import { FollowCollider } from '../../lib/physics/FollowCollider'
import { roundedPolygon } from '../../lib/shapes'
import { CLIP } from './spec'

/**
 * Rina's claw clip (./spec), clamped on the lamp's pole: two slotted amber jaws hugging the pole,
 * their lips' teeth combing together behind it, the hinge and its two splayed handle tabs sticking
 * out to the side (the Wumpus sits on its top end). Put it inside the lamp's group (lamp frame).
 * `solid`: a collider riding along with it.
 */
const C = CLIP
const L = C.length
const P = C.panel
const BEVEL = 0.6

/** one jaw's flat side, lying in XY (extruded +Z by its thickness), the long slot through it */
function panelGeometry() {
  const s = roundedPolygon(
    [
      [P.x0, -L / 2],
      [P.x1, -L / 2],
      [P.x1, L / 2],
      [P.x0, L / 2],
    ],
    [0.5, P.r, P.r, 0.5],
  )
  const cx = (P.x0 + P.x1) / 2
  const { l, w } = P.slot
  s.holes.push(
    roundedPolygon(
      [
        [cx - w / 2, -l / 2],
        [cx + w / 2, -l / 2],
        [cx + w / 2, l / 2],
        [cx - w / 2, l / 2],
      ],
      w / 2 - 0.1,
      new Path(),
    ),
  )
  return new ExtrudeGeometry(s, { depth: C.t - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 12 }).translate(0, 0, BEVEL)
}

/** a jaw's lip, curling round the pole from beside it (90°) to behind it; `side` +1 is the +Z jaw */
function lipGeometry(side: 1 | -1) {
  const r0 = C.lip.r
  const r1 = C.lip.r + C.t
  // drawn in the shape's plane, where after turning it upright the shape's y is the world's -z
  const a0 = -side * (Math.PI / 2)
  const a1 = -side * C.lip.to
  const s = new Shape()
  s.absarc(0, 0, r1, a0, a1, side > 0)
  s.absarc(0, 0, r0, a1, a0, side < 0)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: L - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL * 0.6, bevelSegments: 2, curveSegments: 16 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -L / 2 + BEVEL, 0)
  return g
}

export function ClawClip({ solid = true }: { solid?: boolean }) {
  const at = useRef<Group>(null)
  const mat = useMemo(
    () => ({
      acetate: new MeshStandardMaterial({ color: C.color.acetate, roughness: 0.65 }),
      dark: new MeshStandardMaterial({ color: C.color.dark, roughness: 0.8 }),
    }),
    [],
  )
  const geo = useMemo(() => ({ panel: panelGeometry(), lipR: lipGeometry(1), lipL: lipGeometry(-1), pin: new CylinderGeometry(C.hinge.r * 0.55, C.hinge.r * 0.55, C.hinge.h + 3, 12) }), [])
  // the teeth: at each lip's end, reaching past the middle behind the pole, the two jaws' in turn
  const teeth = useMemo(() => {
    const n = C.lip.teeth * 2
    const step = L / n
    const rm = C.lip.r + C.t / 2
    const reach = Math.PI - C.lip.to + 0.12 // past the middle: they comb together
    return Array.from({ length: n }, (_, i) => {
      const side = i % 2 ? -1 : 1
      const a = side * (C.lip.to + reach / 2) // its middle, round from +X (toward +Z for the +Z jaw)
      return {
        key: i,
        position: [Math.cos(a) * rm, -L / 2 + step * (i + 0.5), Math.sin(a) * rm] as [number, number, number],
        rotation: [0, -a + Math.PI / 2, 0] as [number, number, number],
        args: [reach * rm, step * 0.78, C.t] as [number, number, number],
      }
    })
  }, [])
  const H = C.hinge
  const hx0 = P.x1 - 2
  const hx1 = H.x + H.r
  return (
    <group position={[0, C.y, 0]}>
      <mesh geometry={geo.panel} material={mat.acetate} position={[0, 0, P.z]} castShadow receiveShadow />
      <mesh geometry={geo.panel} material={mat.acetate} position={[0, 0, -P.z]} scale={[1, 1, -1]} castShadow receiveShadow />
      <mesh geometry={geo.lipR} material={mat.acetate} castShadow receiveShadow />
      <mesh geometry={geo.lipL} material={mat.acetate} castShadow receiveShadow />
      {teeth.map(({ key, ...t }) => (
        <RoundedBox key={key} args={t.args} radius={1.1} smoothness={2} position={t.position} rotation={t.rotation} material={mat.acetate} castShadow />
      ))}
      {/* the hinge: the jaws' backs meet round a pin, the spring inside */}
      <RoundedBox args={[hx1 - hx0, H.h, 2 * (P.z + C.t)]} radius={3.5} smoothness={3} position={[(hx0 + hx1) / 2, 0, 0]} material={mat.acetate} castShadow receiveShadow />
      <mesh geometry={geo.pin} material={mat.dark} position={[H.x, 0, 0]} />
      {/* the handle tabs, splayed (the jaws are shut) */}
      {[1, -1].map((s) => (
        <RoundedBox
          key={s}
          args={[C.handle.len + 4, C.handle.h, C.t]}
          radius={1.3}
          smoothness={2}
          position={[hx1 + C.handle.len / 2 - 2, 0, s * (P.z + C.t / 2 - 5 + Math.sin(C.handle.splay) * (C.handle.len / 2))]}
          rotation={[0, -s * C.handle.splay, 0]}
          material={mat.acetate}
          castShadow
          receiveShadow
        />
      ))}
      <group ref={at} />
      {solid && (
        <FollowCollider target={at}>
          <CuboidCollider args={[(hx1 + C.lip.r + C.t) / 2, L / 2, P.z + C.t]} position={[(hx1 - C.lip.r - C.t) / 2, 0, 0]} friction={0.8} />
          <CuboidCollider args={[C.handle.len / 2, C.handle.h / 2, P.z]} position={[hx1 + C.handle.len / 2, 0, 0]} friction={0.8} />
        </FollowCollider>
      )}
    </group>
  )
}
