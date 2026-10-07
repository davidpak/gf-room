import { ConvexHullCollider, CuboidCollider } from '@react-three/rapier'
import { CanvasTexture, CylinderGeometry, LatheGeometry, MeshStandardMaterial, SRGBColorSpace, Vector2, Vector3, type BufferGeometry, type Matrix4 } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { Prompts } from '../prompt/Prompts'
import { BOWL, bowlProfile, chopsticks, lengths } from './spec'

/**
 * Rina's bowl with her chopsticks across it (./spec).
 *
 *   the bowl        a lathe of its profile, outside and inside meeting over the half-round lip. Each side painted in
 *                   its own texture: the outside's lattice laid out along the profile (as many cells round at the foot
 *                   as at the rim, so they shrink toward the foot as on the real one); the inside's pinwheels laid on
 *                   the bowl unrolled flat from its middle, each drawn stretched round by just what the bowl's curve
 *                   takes back, so they come out round on it
 *   the chopsticks  square tapering steel, lying across from rim to rim; part of the bowl (picked up with it)
 *
 * Frame: ./spec (the foot's middle, the bottom on y 0).
 */
const B = BOWL
const SEGS = 96

type P = [number, number]
/** a lathe of (r, y) points (seam at the back); `uvOf` sets each vertex's uv from its point's index and its position
 *  (u null: the lathe's own, round it) */
function lathe(pts: P[], uvOf: (j: number, x: number, y: number, z: number) => [number | null, number]) {
  const g = new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    SEGS,
    Math.PI,
    Math.PI * 2,
  )
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = uvOf(i % pts.length, pos.getX(i), pos.getY(i), pos.getZ(i))
    uv.setXY(i, u ?? uv.getX(i), v)
  }
  return g
}

const texture = (c: HTMLCanvasElement) => {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** the outside: clay under the foot, the slate glaze with its lattice of long hexagons, the dark lip */
function paintOutside(outer: P[], s: number[]) {
  const W = 2048
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const total = s[s.length - 1]
  const row = (sv: number) => (1 - sv / total) * H
  const footTop = s[6] // (the belly's first point)
  const lipFrom = s[s.length - 5] // (the lip's outer half)
  g.fillStyle = B.colors.clay
  g.fillRect(0, 0, W, H)
  g.fillStyle = B.colors.outside
  g.fillRect(0, row(total), W, row(footTop) - row(total))
  g.fillStyle = B.colors.lip
  g.fillRect(0, 0, W, row(lipFrom) + 1)
  // the radius at a length along the profile
  const rAt = (sv: number) => {
    for (let i = 1; i < s.length; i++) if (s[i] >= sv) return outer[i - 1][0] + ((outer[i][0] - outer[i - 1][0]) * (sv - s[i - 1])) / (s[i] - s[i - 1] || 1)
    return outer[outer.length - 1][0]
  }
  const N = 34
  g.strokeStyle = B.colors.lattice
  g.lineWidth = 2.4
  g.lineJoin = 'round'
  let sv = lipFrom - 2.5
  for (let k = 0; sv > footTop + 4; k++) {
    const w = (Math.PI * rAt(sv)) / N // (half a cell's width, mm)
    const h = 1.55 * w // (half its height: long, upright hexagons)
    const mid = sv - h
    for (let col = 0; col <= N; col++) {
      const cx = ((col + (k % 2 ? 0.5 : 0)) / N) * W
      const hw = (W / N) * 0.5 - 2
      const y0 = row(mid + h)
      const y1 = row(mid + h / 2)
      const y2 = row(mid - h / 2)
      const y3 = row(mid - h)
      g.beginPath()
      g.moveTo(cx, y0 + 1.5)
      g.lineTo(cx + hw, y1 + 1)
      g.lineTo(cx + hw, y2 - 1)
      g.lineTo(cx, y3 - 1.5)
      g.lineTo(cx - hw, y2 - 1)
      g.lineTo(cx - hw, y1 + 1)
      g.closePath()
      g.stroke()
    }
    sv -= 1.5 * h
  }
  return texture(c)
}

/** the inside, unrolled flat from its middle (a point `sv` along the profile at `sv` from the canvas's centre):
 *  white glaze, rings of blue pinwheels and dots between, the dark lip round the edge */
function paintInside(radius: (sv: number) => number, total: number, lipFrom: number) {
  const N = 1536
  const c = document.createElement('canvas')
  c.width = N
  c.height = N
  const g = c.getContext('2d')!
  const k = N / (2 * total) // px a mm
  g.fillStyle = B.colors.glaze
  g.fillRect(0, 0, N, N)
  g.setTransform(k, 0, 0, k, N / 2, N / 2)
  g.fillStyle = B.colors.blue
  g.strokeStyle = B.colors.blue
  g.lineCap = 'round'
  // a motif at (sv, angle a), stretched round by sv / r so it's round on the bowl
  const at = (sv: number, a: number, draw: () => void) => {
    g.save()
    g.rotate(a)
    g.translate(sv, 0)
    g.scale(1, sv > 1 ? sv / radius(sv) : 1)
    draw()
    g.restore()
  }
  const R = B.motif / 2
  const pinwheel = () => {
    g.beginPath()
    g.arc(0, 0, R * 0.16, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 1.1
    // (two rings of short dashes, a white gap between, each dash leaning a little: they wheel round)
    for (const [r0, r1, n] of [[R * 0.36, R * 0.56, 16], [R * 0.72, R * 0.97, 26]] as const) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const b = a + 0.16
        g.beginPath()
        g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
        g.lineTo(Math.cos(b) * r1, Math.sin(b) * r1)
        g.stroke()
      }
    }
  }
  const dot = () => {
    g.beginPath()
    g.arc(0, 0, 1.6, 0, Math.PI * 2)
    g.fill()
  }
  B.rings.forEach((sv, i) => {
    if (sv === 0) return at(0, 0, pinwheel)
    const n = Math.max(6, Math.floor((2 * Math.PI * radius(sv)) / (B.motif * 1.12)))
    const twist = i * 0.37
    for (let j = 0; j < n; j++) at(sv, twist + (j / n) * Math.PI * 2, pinwheel)
    // dots between this ring and the one inside it
    const sd = sv - (sv - B.rings[i - 1]) * 0.5
    for (let j = 0; j < n; j++) at(sd, twist + ((j + 0.5) / n) * Math.PI * 2, dot)
  })
  // the dark lip, round the edge
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = B.colors.lip
  g.beginPath()
  g.arc(N / 2, N / 2, N, 0, Math.PI * 2)
  g.arc(N / 2, N / 2, lipFrom * k, 0, Math.PI * 2, true)
  g.fill()
  return texture(c)
}

let SHAPES: { outer: BufferGeometry; inner: BufferGeometry; stick: BufferGeometry; hull: Float32Array; mats: Record<'outside' | 'inside' | 'steel', MeshStandardMaterial> } | null = null
const shapes = () =>
  (SHAPES ??= (() => {
    const { outer, inner } = bowlProfile()
    const so = lengths(outer)
    const total = so[so.length - 1]
    // the inside, measured from the middle out (its points run from the lip down to the middle)
    const fromMid = [...inner].reverse()
    const si = lengths(fromMid)
    const sMax = si[si.length - 1]
    const radius = (sv: number) => {
      for (let i = 1; i < si.length; i++) if (si[i] >= sv) return fromMid[i - 1][0] + ((fromMid[i][0] - fromMid[i - 1][0]) * (sv - si[i - 1])) / (si[i] - si[i - 1] || 1)
      return fromMid[fromMid.length - 1][0]
    }
    const lipFrom = si[si.length - 5] // (the lip's inner half)
    const outerG = lathe(outer, (j) => [null, so[j] / total])
    const innerG = lathe(inner, (j, x, _y, z) => {
      const sv = si[inner.length - 1 - j]
      const r = Math.hypot(x, z) || 1
      return [0.5 + ((sv / sMax) * (x / r)) / 2, 0.5 - ((sv / sMax) * (z / r)) / 2]
    })
    const C = B.chop
    // square, tapering, its faces up and down and to the sides, along +x (the butt at +x)
    const stick = new CylinderGeometry(C.butt * Math.SQRT2, C.tip * Math.SQRT2, C.len, 4, 1).rotateY(Math.PI / 4).rotateZ(-Math.PI / 2)
    const n = 24
    const hullPts = outer.filter((_, i) => i >= 4 && i % 3 === 0).concat([outer[outer.length - 1]])
    const hull = new Float32Array(hullPts.flatMap(([r, y]) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, y, Math.sin((i / n) * Math.PI * 2) * r]).flat()))
    return {
      outer: outerG,
      inner: innerG,
      stick,
      hull,
      mats: {
        outside: new MeshStandardMaterial({ map: paintOutside(outer, so), roughness: 0.5 }),
        inside: new MeshStandardMaterial({ map: paintInside(radius, sMax, lipFrom), roughness: 0.4 }),
        steel: new MeshStandardMaterial({ color: B.colors.steel, roughness: 0.45, metalness: 0.4, flatShading: true }),
      },
    }
  })())

/** her bowl, her chopsticks lying across it */
export function BowlModel({ sticks = true }: { sticks?: boolean }) {
  const s = shapes()
  return (
    <group>
      <mesh geometry={s.outer} material={s.mats.outside} castShadow receiveShadow />
      <mesh geometry={s.inner} material={s.mats.inside} receiveShadow />
      {sticks &&
        chopsticks().map((c, i) => (
          <mesh key={i} geometry={s.stick} material={s.mats.steel} position={c.at} rotation={[0, c.yaw, c.pitch]} castShadow receiveShadow />
        ))}
    </group>
  )
}

const ITEM = groups(GROUP.item, 0xffff)

/** the bowl (with its chopsticks) on the desk: to pick up, turn, put back ("Return bowl") */
export function LiveBowl({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const perch = usePerch({ key: 'bowl', label: 'Return bowl', perchAt: homeAt, approach: new Vector3(0, 1, 0), snap: 0, away: 150, lift: B.h + 40 })
  const C = B.chop
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <BowlModel />
        </group>
        <ConvexHullCollider args={[shapes().hull]} mass={B.mass.bowl} friction={0.8} collisionGroups={ITEM} />
        {chopsticks().map((c, i) => (
          <CuboidCollider key={i} args={[C.len / 2, c.half, c.half]} position={c.at} rotation={[0, c.yaw, c.pitch]} mass={B.mass.chop} friction={0.6} collisionGroups={ITEM} />
        ))}
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
