import { useMemo } from 'react'
import { ConvexHullCollider, CuboidCollider } from '@react-three/rapier'
import { BackSide, BoxGeometry, DoubleSide, BufferAttribute, LatheGeometry, Matrix4, MeshStandardMaterial, SphereGeometry, Vector2, Vector3, type BufferGeometry, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { Prompts } from '../prompt/Prompts'
import { art } from './art'
import { KEEPSAKES, frameOuter, tent } from './spec'

/**
 * Rina's cards and keepsakes (./spec), each a thing of its own:
 *
 *   the cards    two panels of card stock folded at a spine and stood open in a tent: the daughter card's painting
 *                on its front (./art), the Mickey card's sepia drawing on kraft; plain inside
 *   the frame    a deep gold box moulding with a step inside, the photo in its white mat set back in it, a backing
 *                board and an easel leg; it leans back on the leg
 *   the box      the cocoa bomb's carton, printed all round, its window cut clear: inside, the white chocolate
 *                bear-ball on its paper cup
 *
 * Frames: ./spec (each footprint's middle at the origin, its bottom on y 0, its face toward +z).
 */
const K = KEEPSAKES
const COL = K.colors
const ITEM = groups(GROUP.item, 0xffff)
const rad = (d: number) => (d * Math.PI) / 180

// ---- the cards
let CARD: { panel: BufferGeometry; hull: Float32Array } | null = null
const cardShapes = () =>
  (CARD ??= (() => {
    const C = K.card
    const T = tent()
    const pts: number[] = []
    for (const [x, z] of [T.spine, T.front, T.back]) pts.push(x, 0, z, x, C.h, z)
    return { panel: new BoxGeometry(C.w, C.h, C.t).translate(C.w / 2, C.h / 2, 0), hull: new Float32Array(pts) }
  })())

/** a greeting card, standing open: `which` one of hers */
export function CardModel({ which }: { which: 'daughter' | 'mickey' }) {
  const s = cardShapes()
  const T = tent()
  const mats = useMemo(() => {
    const m = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]) => new MeshStandardMaterial({ roughness: 0.85, ...o })
    const edge = m({ color: which === 'mickey' ? COL.kraft : COL.cardInside })
    const inside = m({ map: which === 'daughter' ? art.daughterInsideLeft() : undefined, color: which === 'daughter' ? '#ffffff' : '#efe2cc' })
    // BoxGeometry's order: +x, -x, +y, -y, +z (out), -z (in)
    const front: Material[] = [edge, edge, edge, edge, m({ map: which === 'daughter' ? art.daughterFront() : art.mickeyFront() }), inside]
    const back: Material[] = [
      edge,
      edge,
      edge,
      edge,
      which === 'daughter' ? m({ map: art.daughterInside() }) : inside,
      which === 'daughter' ? m({ map: art.daughterBack() }) : m({ color: COL.kraft }),
    ]
    return { front, back }
  }, [which])
  return (
    <group position={[T.spine[0], 0, T.spine[1]]}>
      <mesh geometry={s.panel} material={mats.front} rotation={[0, T.yawFront, 0]} castShadow receiveShadow />
      <mesh geometry={s.panel} material={mats.back} rotation={[0, T.yawBack, 0]} castShadow receiveShadow />
    </group>
  )
}

// ---- the frame
/** the frame's lean: built upright (its face at z 0, its back at -depth), tipped back on its back foot; the easel's
 *  hinge and foot; the hull; how far to shift it so its footprint's middle is at the origin */
function frameLayout() {
  const F = K.frame
  const o = frameOuter()
  const D = F.depth
  const tilt = new Matrix4().makeTranslation(0, 0, -D).multiply(new Matrix4().makeRotationX(-rad(F.lean))).multiply(new Matrix4().makeTranslation(0, 0, D))
  const hinge = new Vector3(0, o.h * 0.6, -D - 3).applyMatrix4(tilt)
  const a = rad(F.lean + 24) // the leg, back from upright
  const L = hinge.y / Math.cos(a)
  const foot = new Vector3(0, 0, hinge.z - L * Math.sin(a))
  const pts: Vector3[] = []
  for (const x of [-o.w / 2, o.w / 2]) for (const y of [0, o.h]) for (const z of [0, -D]) pts.push(new Vector3(x, y, z).applyMatrix4(tilt))
  for (const x of [-18, 18]) pts.push(new Vector3(x, 0, foot.z), new Vector3(x, hinge.y, hinge.z))
  const zs = pts.map((p) => p.z)
  const shift = -(Math.min(...zs) + Math.max(...zs)) / 2
  pts.forEach((p) => (p.z += shift))
  return { o, tilt, hinge, foot, L, a, shift, hull: new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z])) }
}
let FRAME: ReturnType<typeof makeFrame> | null = null
function makeFrame() {
  const F = K.frame
  const o = frameOuter()
  const D = F.depth
  const open = F.photo
  // a ring of four rounded bars (top and bottom the full width, the sides between), its face at z 0, its back at -depth
  const ring = (ow: number, oh: number, iw: number, ih: number, depth: number, b: number) => {
    const tb = (oh - ih) / 2
    const sd = (ow - iw) / 2
    const bar = (w: number, h: number, x: number, y: number) => new RoundedBoxGeometry(w, h, depth, 3, Math.min(b, w / 2 - 0.01, h / 2 - 0.01)).translate(x, y, -depth / 2)
    return mergeGeometries([bar(ow, tb, 0, (oh - tb) / 2), bar(ow, tb, 0, -(oh - tb) / 2), bar(sd + b, ih + 2 * b, -(ow - sd) / 2 + b / 2, 0), bar(sd + b, ih + 2 * b, (ow - sd) / 2 - b / 2, 0)])!
  }
  const inner = { w: open.w + 2 * F.lip, h: open.h + 2 * F.lip }
  return {
    layout: frameLayout(),
    moulding: ring(o.w, o.h, inner.w, inner.h, D, 3.5).translate(0, o.h / 2, 0),
    step: ring(inner.w + 2, inner.h + 2, open.w, open.h, 8, 1.2).translate(0, o.h / 2, -3),
    photo: new BoxGeometry(open.w + 1, open.h + 1, 1).translate(0, o.h / 2, -10),
    board: new BoxGeometry(o.w - 6, o.h - 6, 3).translate(0, o.h / 2, -D - 1.5),
    leg: new BoxGeometry(36, 1, 3),
  }
}
const frameShapes = () => (FRAME ??= makeFrame())

/** the gold frame, leaning back on its easel, her photo in it */
export function FrameModel() {
  const s = frameShapes()
  const L = s.layout
  const mats = useMemo(() => {
    const brown = new MeshStandardMaterial({ color: '#5b4330', roughness: 0.9 })
    return {
      gold: new MeshStandardMaterial({ color: COL.gold, roughness: 0.4, metalness: 0.5 }),
      step: new MeshStandardMaterial({ color: COL.goldDeep, roughness: 0.45, metalness: 0.5 }),
      photo: [brown, brown, brown, brown, new MeshStandardMaterial({ map: art.photo(), roughness: 0.6 }), brown],
      brown,
    }
  }, [])
  // the leg: from its hinge on the back down to its foot (the box's long side along its own y)
  const mid = L.hinge.clone().add(L.foot).multiplyScalar(0.5)
  return (
    <group position={[0, 0, L.shift]}>
      <group matrixAutoUpdate={false} matrix={L.tilt}>
        <mesh geometry={s.moulding} material={mats.gold} castShadow receiveShadow />
        <mesh geometry={s.step} material={mats.step} receiveShadow />
        <mesh geometry={s.photo} material={mats.photo} receiveShadow />
        <mesh geometry={s.board} material={mats.brown} castShadow receiveShadow />
      </group>
      <mesh geometry={s.leg} material={mats.brown} position={[mid.x, mid.y, mid.z]} rotation={[L.a, 0, 0]} scale={[1, L.L, 1]} castShadow />
    </group>
  )
}

// ---- the cocoa box
/** the carton: rounded a hair, each face's print laid on flat (its UVs set from where it is) */
function cartonGeometry() {
  const B = K.box
  const g = new RoundedBoxGeometry(B.w, B.h, B.d, 2, B.round)
  const pos = g.attributes.position
  const uv = g.attributes.uv as BufferAttribute
  const index = g.index
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
  return g.translate(0, B.h / 2, 0)
}
let BOX: ReturnType<typeof makeBox> | null = null
function makeBox() {
  const B = K.box
  const bm = K.bomb
  const cup = bm.cup
  const r = bm.d / 2
  const ballY = cup.h - 4 + r
  return {
    carton: cartonGeometry(),
    inside: new BoxGeometry(B.w - 1.6, B.h - 1.6, B.d - 1.6).translate(0, B.h / 2, 0),
    // the paper cup: a little flared, open at the top
    cup: new LatheGeometry([new Vector2(0, 0.6), new Vector2(cup.d / 2 - 5, 0.6), new Vector2(cup.d / 2 - 4, 0), new Vector2(cup.d / 2, cup.h)], 40),
    ball: new SphereGeometry(r, 40, 28).translate(0, ballY, 0),
    ear: new SphereGeometry(bm.ears / 2, 16, 12),
    bead: new SphereGeometry(1, 12, 8),
    ballY,
  }
}
const boxShapes = () => (BOX ??= makeBox())

/** the cocoa bomb's box, the bear-ball in its window */
export function CocoaBoxModel() {
  const s = boxShapes()
  const r = K.bomb.d / 2
  const mats = useMemo(() => {
    const f = art.box()
    const m = (map: MeshStandardMaterial['map'], o: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) => new MeshStandardMaterial({ map, roughness: 0.7, ...o })
    return {
      faces: [m(f.right), m(f.left), m(f.top), m(f.bottom), m(f.front, { alphaTest: 0.5 }), m(f.back)],
      inside: new MeshStandardMaterial({ color: COL.boardInside, roughness: 0.9, side: BackSide }),
      cup: new MeshStandardMaterial({ color: COL.cup, roughness: 0.8, side: DoubleSide }),
      chocolate: new MeshStandardMaterial({ color: COL.chocolate, roughness: 0.55 }),
      dark: new MeshStandardMaterial({ color: '#4a2a1c', roughness: 0.5 }),
    }
  }, [])
  // its ears up on the ball, a little forward; its eyes and nose (milk chocolate drops) on its face
  const on = (theta: number, phi: number, out = 0) =>
    [Math.sin(theta) * Math.sin(phi) * (r + out), s.ballY + Math.cos(theta) * (r + out), Math.sin(theta) * Math.cos(phi) * (r + out)] as [number, number, number]
  return (
    <group>
      <mesh geometry={s.carton} material={mats.faces} castShadow receiveShadow />
      <mesh geometry={s.inside} material={mats.inside} receiveShadow />
      <mesh geometry={s.cup} material={mats.cup} receiveShadow />
      <mesh geometry={s.ball} material={mats.chocolate} castShadow receiveShadow />
      <mesh geometry={s.ear} material={mats.chocolate} position={on(0.55, -0.55, -1)} />
      <mesh geometry={s.ear} material={mats.chocolate} position={on(0.55, 0.55, -1)} />
      <mesh geometry={s.bead} material={mats.dark} position={on(1.25, -0.3)} scale={[1.6, 2, 1.6]} />
      <mesh geometry={s.bead} material={mats.dark} position={on(1.25, 0.3)} scale={[1.6, 2, 1.6]} />
      <mesh geometry={s.bead} material={mats.dark} position={on(1.5, 0)} scale={[2.8, 2, 2.2]} />
    </group>
  )
}

// ---- live: each to pick up, turn and put back
function useHome(key: string, label: string, homeAt: () => Matrix4 | null, h: number) {
  return usePerch({ key, label, perchAt: homeAt, approach: new Vector3(0, 1, 0), snap: 0, away: 150, lift: h + 40 })
}
type LiveProps = { homeAt: () => Matrix4 | null; spawn: [number, number, number] }

function LiveCard({ which, label, homeAt, spawn }: LiveProps & { which: 'daughter' | 'mickey'; label: string }) {
  const perch = useHome(`card-${which}`, label, homeAt, K.card.h)
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} sound="soft" restitution={0.05} linearDamping={0.8} angularDamping={1.5} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <CardModel which={which} />
        </group>
        <ConvexHullCollider args={[cardShapes().hull]} mass={K.mass.card} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
/** her mum's card, standing open */
export function LiveDaughterCard(p: LiveProps) {
  return <LiveCard which="daughter" label="Return card" {...p} />
}
/** the Mickey card, standing open */
export function LiveMickeyCard(p: LiveProps) {
  return <LiveCard which="mickey" label="Return Mickey card" {...p} />
}

/** the gold frame with her and her sister */
export function LiveFrame({ homeAt, spawn }: LiveProps) {
  const perch = useHome('frame', 'Return photo', homeAt, frameOuter().h)
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <FrameModel />
        </group>
        <ConvexHullCollider args={[frameShapes().layout.hull]} mass={K.frame.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

/** the hot cocoa polar bear in its box */
export function LiveCocoaBox({ homeAt, spawn }: LiveProps) {
  const B = K.box
  const perch = useHome('cocoa', 'Return cocoa', homeAt, B.h)
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} sound="soft" restitution={0.1} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <CocoaBoxModel />
        </group>
        <CuboidCollider args={[B.w / 2, B.h / 2, B.d / 2]} position={[0, B.h / 2, 0]} mass={K.mass.box} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
