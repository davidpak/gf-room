import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { BackSide, BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, MeshStandardMaterial, PlaneGeometry, Vector3, type Group, type Matrix4 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { Prompts } from '../prompt/Prompts'
import { bottomTexture, sideTexture, topTexture } from './print'
import { TISSUES } from './spec'

/**
 * Rina's Kleenex cube (./spec): the printed box, opened, a tissue standing up out of it.
 *
 *   the box      an object like any other: carried, turned, put down anywhere (the shared hand); one
 *                solid block to the physics. "Return tissues" once it's well away from its spot or
 *                knocked over
 *   the tissue   a modelled shape, not cloth: pinched in the opening, fanning out above in soft
 *                folds. Click it to pull one: it lifts out and drifts off, and the next pops up
 */
const B = TISSUES.box
const C = TISSUES.color
const POP = TISSUES.pop
const ITEM = groups(GROUP.item, 0xffff)
const STACK_Y = B.h / 2 - 22 // the top of the stack inside (a box a little used)

/** the box: rounded a hair, each face's print laid on flat (its UVs set from where it is) */
function boxGeometry() {
  const g = new RoundedBoxGeometry(B.w, B.h, B.d, 2, B.round)
  const pos = g.attributes.position
  const uv = g.attributes.uv as BufferAttribute
  const index = g.index // (it comes back unindexed: the groups count vertices)
  // BoxGeometry's groups: +x, -x, +y, -y, +z, -z; each seen from outside, u rightward, v up
  const face = [
    (x: number, y: number, z: number) => [0.5 - z / B.d, 0.5 + y / B.h],
    (x: number, y: number, z: number) => [0.5 + z / B.d, 0.5 + y / B.h],
    (x: number, y: number, z: number) => [0.5 + x / B.w, 0.5 - z / B.d],
    (x: number, y: number, z: number) => [0.5 + x / B.w, 0.5 + z / B.d],
    (x: number, y: number, z: number) => [0.5 + x / B.w, 0.5 + y / B.h],
    (x: number, y: number, z: number) => [0.5 - x / B.w, 0.5 + y / B.h],
  ]
  for (const [k, grp] of g.groups.entries()) {
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const j = index ? index.getX(i) : i
      const [u, v] = face[k](pos.getX(j), pos.getY(j), pos.getZ(j))
      uv.setXY(j, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)))
    }
  }
  uv.needsUpdate = true
  return g
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** the tissue standing up: pinched in the opening (from a little down inside it), fanning out above
 *  in soft pleats that deepen toward the top, its top corners drooping, leaning a touch and twisted */
function popGeometry() {
  const N = 28
  const M = 18
  const g = new PlaneGeometry(1, 1, N, M)
  const pos = g.attributes.position
  const y0 = B.h / 2 - 14
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) * 2 // -1..1 across
    const v = pos.getY(i) + 0.5 // 0 at the pinch, 1 at the top
    const spread = POP.pinch / 2 + (POP.w / 2 - POP.pinch / 2) * Math.pow(smooth(Math.min(1, v * 1.25)), 0.8)
    let x = u * spread
    let z = Math.sin(u * Math.PI * 2.4 + 0.6) * (1.5 + 9 * v * v) + 11 * v * v
    const y = y0 + v * (POP.h + 14) - u * u * v * v * 26 + Math.sin(u * 3.3 + 1.1) * 4 * v * v * v
    const turn = 0.3 * v
    ;[x, z] = [x * Math.cos(turn) - z * Math.sin(turn), x * Math.sin(turn) + z * Math.cos(turn)]
    pos.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  return g
}

/** the box and its tissue. `pull`: 0 at rest; while pulling, the tissue lifts out and fades (0..1),
 *  then the next rises (1..2) */
export function TissueBox({ pull, onPull }: { pull?: { current: number }; onPull?: () => void }) {
  const geo = useMemo(() => ({ box: boxGeometry(), pop: popGeometry(), inner: new BoxGeometry(B.w - 2.4, B.h - 2.4, B.d - 2.4), stack: new PlaneGeometry(B.w - 3, B.d - 3) }), [])
  const mat = useMemo(() => {
    const side = (w: number, seed: number, tag: boolean) => new MeshStandardMaterial({ map: sideTexture(w, seed, tag), roughness: 0.62 })
    return {
      faces: [
        side(B.d, 1, false),
        side(B.d, 2, false),
        new MeshStandardMaterial({ map: topTexture(), roughness: 0.62, alphaTest: 0.5 }),
        new MeshStandardMaterial({ map: bottomTexture(), roughness: 0.8 }),
        side(B.w, 3, true),
        side(B.w, 4, true),
      ],
      inside: new MeshStandardMaterial({ color: C.inside, roughness: 0.9, side: BackSide }),
      stack: new MeshStandardMaterial({ color: C.tissue, roughness: 0.95 }),
      tissue: new MeshStandardMaterial({ color: C.tissue, roughness: 0.95, side: DoubleSide, transparent: true }),
    }
  }, [])
  const sheet = useRef<Group>(null)
  useFrame(() => {
    const s = sheet.current
    if (!s) return
    const t = pull?.current ?? 0
    if (t <= 0) {
      s.position.set(0, 0, 0)
      s.scale.set(1, 1, 1)
      mat.tissue.opacity = 1
    } else if (t < 1) {
      // out it comes: up, opening out, fading as it goes
      const e = smooth(t)
      s.position.set(0, 150 * e, 12 * e)
      s.scale.set(1 + 0.5 * e, 1 + 0.6 * e, 1 + 0.5 * e)
      mat.tissue.opacity = 1 - e
    } else {
      // the next one rises out of the opening with a little spring
      const k = t - 1
      const spring = 1 - Math.exp(-6 * k) * Math.cos(9 * k)
      s.position.set(0, 0, 0)
      s.scale.set(1, Math.max(0.05, spring), 1)
      mat.tissue.opacity = 1
    }
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onPull?.()
  }
  return (
    <group>
      <mesh geometry={geo.box} material={mat.faces} castShadow receiveShadow />
      {/* inside: bare board, and the stack of tissues a little down */}
      <mesh geometry={geo.inner} material={mat.inside} receiveShadow />
      <mesh geometry={geo.stack} material={mat.stack} position={[0, STACK_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      <group position={[0, B.h / 2 - 14, 0]}>
        <group ref={sheet}>
          <mesh geometry={geo.pop} material={mat.tissue} position={[0, -(B.h / 2 - 14), 0]} castShadow receiveShadow onClick={click} />
        </group>
      </group>
    </group>
  )
}

/** the cube on the desk, to pick up and put back, and to pull tissues from */
export function LiveTissues({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const pull = useRef(0)
  const perch = usePerch({
    key: 'tissues',
    label: 'Return tissues',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0, // (it's a box on the desk: it stays where it's put)
    away: 150,
    lift: B.h / 2 + 40,
  })
  useFrame((_, delta) => {
    if (pull.current <= 0) return
    pull.current += Math.min(delta, 1 / 30) * (pull.current < 1 ? 1.6 : 1.2)
    if (pull.current >= 2.6) pull.current = 0
  })
  const onPull = () => {
    if (pull.current === 0 || pull.current > 1.6) pull.current = 0.001
  }
  if (import.meta.env.DEV) Object.assign(window, { __tissues: { ...perch, pull } })
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.1} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <TissueBox pull={pull} onPull={onPull} />
        </group>
        <CuboidCollider args={[B.w / 2, B.h / 2, B.d / 2]} mass={TISSUES.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
