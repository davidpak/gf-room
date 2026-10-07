import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider } from '@react-three/rapier'
import { CanvasTexture, CatmullRomCurve3, CircleGeometry, LatheGeometry, MeshStandardMaterial, Quaternion, SRGBColorSpace, TubeGeometry, Vector2, Vector3, type BufferGeometry, type Matrix4, type Mesh } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { Prompts } from '../prompt/Prompts'
import { TREE_MUG, TUMBLER, handleLine, mugProfile, mugR, tumblerProfile, tumblerR } from './spec'

/**
 * Rina's Christmas tree mug and her copper tumbler (./spec).
 *
 *   the mug       a lathe of its profile: the outside (painted: the tree on its front, the swirl bands, a few stars,
 *                 all in its own texture) and the inside (plain glaze) meeting over the half-round lip; the handle a
 *                 tube along a C, its ends sunk into the wall. A little cocoa left in it, its surface keeping level
 *                 as she carries it and sloshing a moment when she stops
 *   the tumbler   the same way: the copper outside (a soft sheen painted round it, the steel band at the lip), the
 *                 steel inside
 *
 * Frames: ./spec (the footprint's middle, the bottom on y 0, the front toward +z; the mug's handle to -x).
 */
const M = TREE_MUG
const T = TUMBLER
const PX = 8 // the mug's texture pixels a mm
const SEGS = 72

/** a lathe of (r, y) points, its seam at the back: u 0.5 is the front (+z), u 0.25 the left (-x) */
function lathe(pts: [number, number][], vOf?: (y: number) => number) {
  const g = new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    SEGS,
    Math.PI,
    Math.PI * 2,
  )
  if (vOf) {
    const pos = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setY(i, vOf(pos.getY(i)))
  }
  return g
}

let SHAPES: { mug: { outer: BufferGeometry; inner: BufferGeometry; handle: BufferGeometry; cocoa: BufferGeometry; hull: Float32Array }; tumbler: { outer: BufferGeometry; inner: BufferGeometry; hull: Float32Array } } | null = null
const ring = (r: (y: number) => number, ys: number[], n = 20) =>
  ys.flatMap((y) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r(y), y, Math.sin((i / n) * Math.PI * 2) * r(y)]).flat())
const shapes = () =>
  (SHAPES ??= (() => {
    const mp = mugProfile()
    const tp = tumblerProfile()
    const H = M.handle
    const curve = new CatmullRomCurve3(handleLine().map(([x, y]) => new Vector3(x, y, 0)), false, 'centripetal')
    // (squashed front to back: a handle's wider than it is thick)
    const handle = new TubeGeometry(curve, 48, H.r, 14, false).scale(1, 1, H.wide)
    const cr = mugR(M.cocoa.y) - M.wall - 1
    return {
      mug: {
        outer: lathe(mp.outer, (y) => y / M.h),
        inner: lathe(mp.inner),
        handle,
        cocoa: new CircleGeometry(cr, 48).rotateX(-Math.PI / 2),
        hull: new Float32Array(ring(mugR, [0, M.h])),
      },
      tumbler: {
        outer: lathe(tp.outer, (y) => y / T.h),
        inner: lathe(tp.inner),
        hull: new Float32Array(ring(tumblerR, [0, T.h])),
      },
    }
  })())

// ---- the mug's painting (in mm: x round the mug at its middle height, the front at the middle; y down from the rim)
/** a seeded wobble, so her brushwork's the same every load */
function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
/** a brush stroke: a tapered blade from (x0, y0) bending through (cx, cy) to its point at (x1, y1), w wide at its root */
function blade(g: CanvasRenderingContext2D, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number) {
  const dx = x1 - x0
  const dy = y1 - y0
  const L = Math.hypot(dx, dy) || 1
  const nx = (-dy / L) * (w / 2)
  const ny = (dx / L) * (w / 2)
  g.beginPath()
  g.moveTo(x0 + nx, y0 + ny)
  g.quadraticCurveTo(cx + nx * 0.6, cy + ny * 0.6, x1, y1)
  g.quadraticCurveTo(cx - nx * 0.6, cy - ny * 0.6, x0 - nx, y0 - ny)
  g.closePath()
  g.fill()
}
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5) {
  g.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points
    const k = i % 2 ? r * 0.42 : r
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k)
  }
  g.closePath()
  g.fill()
}
/** a band of swirls round the mug: curls spiralling in, joined by a wavy line, alternately up and down */
function swirls(g: CanvasRenderingContext2D, C: number, y: number, curl: number) {
  const n = Math.round(C / (curl * 5.2))
  const step = C / n
  g.lineWidth = 0.95
  for (let i = 0; i < n + 1; i++) {
    const x = i * step
    const up = i % 2 ? -1 : 1
    const cy = y + up * curl * 0.35
    // the curl: from its outside, 1.4 turns in
    g.beginPath()
    const turns = 1.4
    for (let k = 0; k <= 40; k++) {
      const t = k / 40
      const a = (up > 0 ? Math.PI : 0) + t * turns * Math.PI * 2 * up
      const r = curl * (1 - t * 0.85)
      g.lineTo(x + Math.cos(a) * r, cy + Math.sin(a) * r)
    }
    g.stroke()
    // the stem on to the next curl
    g.beginPath()
    g.moveTo(x - curl, cy)
    g.bezierCurveTo(x - curl - step * 0.2, cy - up * curl * 0.9, x - step + curl + step * 0.15, cy - up * curl * 1.2, x - step + curl * 0.9, cy - up * curl * 0.6)
    g.stroke()
  }
}
function paintMug() {
  const c = document.createElement('canvas')
  const C = 2 * Math.PI * mugR(M.h / 2) // the circumference the painting's laid out on
  c.width = 2048
  c.height = Math.round(M.h * PX)
  const g = c.getContext('2d')!
  g.fillStyle = M.colors.glaze
  g.fillRect(0, 0, c.width, c.height)
  g.setTransform(c.width / C, 0, 0, PX, 0, 0)
  g.fillStyle = M.colors.paint
  g.strokeStyle = M.colors.paint
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const yy = (y: number) => M.h - y // mug height to the canvas's rows
  // the bands
  swirls(g, C, yy(M.bands.top), M.bands.curl)
  swirls(g, C, yy(M.bands.bottom), M.bands.curl * 0.9)
  // the tree, on the front (u 0.5): tiers of drooping boughs, wider down, each a few blades either side
  const r = rng(7)
  const tx = C / 2
  const top = yy(M.tree.y1) + 6
  const bot = yy(M.tree.y0)
  const tiers = 12
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1)
    const y = top + (bot - 4 - top) * f
    const hw = 3 + (M.tree.w / 2 - 3) * f
    for (const side of [-1, 1]) {
      const n = 3 + Math.round(f * 3)
      for (let k = 0; k < n; k++) {
        const kf = (k + 1) / n
        const x0 = tx + side * (hw * (kf - 0.55) * 0.9 + r() * 1.2)
        const y0 = y - 1.2 + r() * 1.5
        const x1 = tx + side * (hw * kf + r() * 1.5)
        const y1 = y + 2 + f * 2.5 + r() * 1.5
        blade(g, x0, y0, (x0 + x1) / 2 + side * 1, y0 - 0.8, x1, y1, 2.1 + f * 1.2)
      }
    }
    // the middle of each tier, filled in
    blade(g, tx - hw * 0.35, y + 0.5, tx, y - 1.5, tx + hw * 0.35, y + 1, 2.4)
  }
  // the trunk, the star
  g.fillRect(tx - 1.6, bot - 4, 3.2, 4)
  star(g, tx, top - 3.5, 3.2)
  // a few little stars about the tree
  for (const [dx, y, s] of [[-24, 80, 1.3], [21, 90, 1.6], [27, 62, 1.1], [-28, 52, 1.2], [18, 34, 1]] as const) star(g, tx + dx, yy(y), s, 4)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** the tumbler's copper: a soft sheen round it (lighter streaks, a darker one), the bare steel band at the lip */
function paintTumbler() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 340
  const g = c.getContext('2d')!
  const base = new Vector3(...hexRGB(T.colors.copper))
  const band = Math.round((T.band / T.h) * c.height)
  const bump = (u: number, at: number, w: number) => Math.exp(-(((((u - at + 1.5) % 1) - 0.5) / w) ** 2))
  for (let x = 0; x < c.width; x++) {
    const u = (x + 0.5) / c.width
    const k = 1 + 0.16 * bump(u, 0.42, 0.05) + 0.08 * bump(u, 0.12, 0.08) - 0.1 * bump(u, 0.6, 0.09) - 0.05 * bump(u, 0.85, 0.1)
    g.fillStyle = `rgb(${Math.min(255, base.x * k)},${Math.min(255, base.y * k)},${Math.min(255, base.z * k)})`
    g.fillRect(x, band, 1, c.height - band)
  }
  g.fillStyle = T.colors.steel
  g.fillRect(0, 0, c.width, band)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
function hexRGB(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

let MATS: Record<'painted' | 'glaze' | 'cocoa' | 'copper' | 'inside', MeshStandardMaterial> | null = null
const mats = () =>
  (MATS ??= {
    painted: new MeshStandardMaterial({ map: paintMug(), roughness: 0.45 }),
    glaze: new MeshStandardMaterial({ color: M.colors.glaze, roughness: 0.45 }),
    cocoa: new MeshStandardMaterial({ color: M.colors.cocoa, roughness: 0.3 }),
    copper: new MeshStandardMaterial({ map: paintTumbler(), roughness: 0.5, metalness: 0.3 }),
    inside: new MeshStandardMaterial({ color: T.colors.inside, roughness: 0.5, metalness: 0.3 }),
  })

const UP = new Vector3(0, 1, 0)
const _q = new Quaternion()
const _t = new Vector3()
/** the cocoa's surface: it keeps level in the world (up to M.cocoa.tilt), lagging on a damped spring so it sloshes */
function Cocoa() {
  const s = shapes()
  const ref = useRef<Mesh>(null)
  const st = useMemo(() => ({ n: new Vector3(0, 1, 0), v: new Vector3() }), [])
  useFrame((_, dt) => {
    const m = ref.current
    if (!m?.parent) return
    const h = Math.min(dt, 1 / 30)
    m.parent.getWorldQuaternion(_q)
    const want = _t.copy(UP).applyQuaternion(_q.invert())
    st.v.addScaledVector(want.sub(st.n), 120 * h).multiplyScalar(1 - 9 * h)
    st.n.addScaledVector(st.v, h).normalize()
    const max = M.cocoa.tilt
    if (st.n.y < Math.cos(max)) {
      const side = Math.hypot(st.n.x, st.n.z) || 1
      st.n.set((st.n.x / side) * Math.sin(max), Math.cos(max), (st.n.z / side) * Math.sin(max))
      st.v.multiplyScalar(0.5)
    }
    m.quaternion.setFromUnitVectors(UP, st.n)
  })
  return <mesh ref={ref} geometry={s.mug.cocoa} material={mats().cocoa} position={[0, M.cocoa.y, 0]} receiveShadow />
}

/** her Christmas tree mug, with a little cocoa in it */
export function TreeMugModel({ cocoa = true }: { cocoa?: boolean }) {
  const s = shapes().mug
  const m = mats()
  return (
    <group>
      <mesh geometry={s.outer} material={m.painted} castShadow receiveShadow />
      <mesh geometry={s.inner} material={m.glaze} receiveShadow />
      <mesh geometry={s.handle} material={m.glaze} castShadow receiveShadow />
      {cocoa && <Cocoa />}
    </group>
  )
}

/** her copper tumbler */
export function TumblerModel() {
  const s = shapes().tumbler
  const m = mats()
  return (
    <group>
      <mesh geometry={s.outer} material={m.copper} castShadow receiveShadow />
      <mesh geometry={s.inner} material={m.inside} receiveShadow />
    </group>
  )
}

const ITEM = groups(GROUP.item, 0xffff)

/** the mug on the desk: to pick up, turn, put back ("Return mug") */
export function LiveTreeMug({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const perch = usePerch({ key: 'tree-mug', label: 'Return mug', perchAt: homeAt, approach: new Vector3(0, 1, 0), snap: 0, away: 150, lift: M.h + 40 })
  const H = M.handle
  const reach = H.reach + H.r
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <TreeMugModel />
        </group>
        <ConvexHullCollider args={[shapes().mug.hull]} mass={M.mass.body} friction={0.8} collisionGroups={ITEM} />
        <CuboidCollider
          args={[reach / 2, (H.top - H.bottom) / 2 + H.r, H.r * H.wide]}
          position={[-(mugR((H.top + H.bottom) / 2) + reach / 2 - 1), (H.top + H.bottom) / 2, 0]}
          mass={M.mass.handle}
          friction={0.8}
          collisionGroups={ITEM}
        />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

/** the tumbler on the desk: to pick up, turn, put back ("Return tumbler") */
export function LiveTumbler({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const perch = usePerch({ key: 'tumbler', label: 'Return tumbler', perchAt: homeAt, approach: new Vector3(0, 1, 0), snap: 0, away: 150, lift: T.h + 40 })
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <TumblerModel />
        </group>
        <ConvexHullCollider args={[shapes().tumbler.hull]} mass={T.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
