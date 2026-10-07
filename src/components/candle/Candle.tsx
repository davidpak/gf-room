import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CylinderCollider } from '@react-three/rapier'
import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LatheGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  type Group,
  type Matrix4,
  type Mesh,
  type PointLight,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { Prompts } from '../prompt/Prompts'
import { CANDLE, flicker } from './spec'

/**
 * Rina's holiday candle (./spec): the red glass tumbler (its label painted into the glass's texture), the cream wax
 * in it, the wick, the flame; the striped ribbon round its top, a bow front-right, two tails down the side. Its tin
 * lid is a thing of its own, set beside it.
 *
 *   the flame   a teardrop, unlit, brighter than white at its heart (the bloom softens it); it sways and stretches
 *               with the flicker, and a small warm light at it rises and falls in step. The glass glows a little
 *               from within when it's lit (its emissive, a band at the wax)
 *   click       the wax, wick or flame: blown out (the flame shrinks away, the light fades), or lit again
 *
 * Frame: ./spec (the jar's axis, its bottom on y 0, the label toward +z).
 */
const C = CANDLE
const J = C.jar
const R = J.d / 2
const PX = 5 // the glass's pixels a mm
const WAX = C.wax.y - C.wax.dish // the wax at the wick

// ---- the textures
function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}
/** the glass all round (u round from the back, the front at u 0.5; v up): deep red at the foot, its label */
function glassTexture() {
  const W = Math.round(Math.PI * J.d * PX)
  const H = J.h * PX
  const { c, g } = canvas(W, H)
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, C.colors.glass)
  grad.addColorStop(0.6, C.colors.glass)
  grad.addColorStop(1, C.colors.glassDeep)
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  // a soft sheen down the glass either side of the front (the glass's thickness catching the light)
  for (const [x, a] of [[0.38, 0.1], [0.66, 0.07]] as const) {
    const s = g.createLinearGradient((x - 0.03) * W, 0, (x + 0.03) * W, 0)
    s.addColorStop(0, 'rgba(255,190,180,0)')
    s.addColorStop(0.5, `rgba(255,190,180,${a})`)
    s.addColorStop(1, 'rgba(255,190,180,0)')
    g.fillStyle = s
    g.fillRect((x - 0.03) * W, 0, 0.06 * W, H)
  }
  // the label: a lighter red rectangle, a gold rule round it, a gold sprig and two lines of its lettering
  const L = C.label
  const x0 = W / 2 - (L.w / 2) * PX
  const y0 = (J.h - L.y - L.h / 2) * PX
  g.fillStyle = C.colors.label
  g.fillRect(x0, y0, L.w * PX, L.h * PX)
  g.strokeStyle = C.colors.gold
  g.lineWidth = L.gold * PX
  g.strokeRect(x0 + 2.5 * PX, y0 + 2.5 * PX, (L.w - 5) * PX, (L.h - 5) * PX)
  g.fillStyle = C.colors.gold
  g.textAlign = 'center'
  g.font = `italic 600 ${6.5 * PX}px "Caveat", Georgia, serif`
  g.fillText('Holiday', W / 2, y0 + 22 * PX)
  g.font = `600 ${2.6 * PX}px Georgia, serif`
  g.fillText('C A N D L E', W / 2, y0 + 29 * PX)
  // the sprig: two leaves and three berries over the lettering
  const sx = W / 2
  const sy = y0 + 11 * PX
  g.beginPath()
  g.ellipse(sx - 3 * PX, sy, 3.2 * PX, 1.4 * PX, -0.4, 0, Math.PI * 2)
  g.ellipse(sx + 3 * PX, sy, 3.2 * PX, 1.4 * PX, 0.4, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#f7e1c9'
  for (const [dx, dy] of [[-1.2, -1.2], [1.2, -1.2], [0, 0.4]]) {
    g.beginPath()
    g.arc(sx + dx * PX, sy + dy * PX, 1.1 * PX, 0, Math.PI * 2)
    g.fill()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  // (Caveat may still be on its way: the label again once it's in)
  void document.fonts?.load(`italic 600 ${6.5 * PX}px "Caveat"`).then(() => {
    g.fillStyle = C.colors.label
    g.fillRect(x0 + 4 * PX, y0 + 15 * PX, (L.w - 8) * PX, 9 * PX)
    g.fillStyle = C.colors.gold
    g.font = `italic 600 ${6.5 * PX}px "Caveat", Georgia, serif`
    g.fillText('Holiday', W / 2, y0 + 22 * PX)
    t.needsUpdate = true
  }).catch(() => {})
  return t
}
/** the glow from within, up the glass: nothing at the foot, most where the wax is (lit through it), less above */
function glowTexture() {
  const { c, g } = canvas(4, 128)
  const grad = g.createLinearGradient(0, 128, 0, 0)
  const at = (y: number) => y / J.h
  grad.addColorStop(0, '#000000')
  grad.addColorStop(at(C.wax.y - 30), '#3a0f08')
  grad.addColorStop(at(C.wax.y - 2), '#ffffff')
  grad.addColorStop(at(C.wax.y + 6), '#b0b0b0')
  grad.addColorStop(1, '#5a5a5a')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
/** the wax's top, from the wall (v 0) to the wick (v 1): cream, the melt pool round the wick a little darker */
function waxTexture() {
  const { c, g } = canvas(4, 64)
  const grad = g.createLinearGradient(0, 64, 0, 0)
  grad.addColorStop(0, C.colors.wax)
  grad.addColorStop(0.55, C.colors.wax)
  grad.addColorStop(0.75, C.colors.pool)
  grad.addColorStop(1, C.colors.pool)
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
/** the ribbon: white, red stripes on the bias; one tile is a square of the ribbon's width */
function stripeTexture() {
  const N = 128
  const { c, g } = canvas(N, N)
  g.fillStyle = C.colors.white
  g.fillRect(0, 0, N, N)
  g.fillStyle = C.colors.red
  const P = N / 4 // four red stripes across
  for (let k = -4; k <= 8; k++) {
    g.beginPath()
    g.moveTo(k * P, 0)
    g.lineTo(k * P + P * 0.5, 0)
    g.lineTo(k * P + P * 0.5 - N, N)
    g.lineTo(k * P - N, N)
    g.closePath()
    g.fill()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  return t
}

// ---- the shapes
/** a corner's arc of points, from angle a0 to a1 about (cx, cy), radius r */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 6) {
  const out: Vector2[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push(new Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)))
  }
  return out
}
/** a lathe whose v is its height (0..1 over the jar), its seam at the back so its u 0.5 is the front */
function lathe(points: Vector2[], segs = 64, vByHeight = true) {
  const g = new LatheGeometry(points, segs, Math.PI, Math.PI * 2)
  if (vByHeight) {
    const pos = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / J.h)
  }
  return g
}
/** the glass from outside: the foot, the side, over the rounded rim to its inner edge */
function jarGeometry() {
  const f = J.foot
  const l = J.lip
  return lathe([new Vector2(0, 0), ...arc(R - f, f, f, -Math.PI / 2, 0), ...arc(R - l, J.h - l, l, 0, Math.PI / 2), new Vector2(R - J.wall + 0.6, J.h), ...arc(R - J.wall + 0.6, J.h - 0.6, 0.6, Math.PI / 2, Math.PI, 3)])
}
/** where a point on the jar's skin is: s round it (mm, from `at` radians toward +x), y up, n out from the glass */
function wrap(s: number, y: number, n: number, at: number) {
  const a = at + s / R
  const r = R + n
  return new Vector3(Math.sin(a) * r, y, Math.cos(a) * r)
}
/** a strip of ribbon along a path on the jar's skin ((s, y, n) at t), its width along `across` (s, y, n) at t (gathered
 *  to `width` of it);
 *  u along its length in ribbon-widths (the stripes), v across */
function strip(path: (t: number) => [number, number, number], across: (t: number) => [number, number, number], at: number, segs: number, width: (t: number) => number = () => 1) {
  const W = C.ribbon.w
  const A = 4 // across, a few: it bends round the glass
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let len = 0
  let prev: [number, number, number] | null = null
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const p = path(t)
    if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])
    prev = p
    const d = across(t)
    for (let j = 0; j <= A; j++) {
      const k = (j / A - 0.5) * width(t)
      const v = wrap(p[0] + d[0] * W * k, p[1] + d[1] * W * k, p[2] + d[2] * W * k, at)
      pos.push(v.x, v.y, v.z)
      uv.push(len / W, j / A)
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < A; j++) {
      const a = i * (A + 1) + j
      const b = a + A + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
function ribbonGeometries() {
  const rb = C.ribbon
  const at = C.bowAt
  const gap = rb.gap
  // the band right round, its width up the glass
  const band = strip((t) => [t * Math.PI * J.d, rb.y, gap], () => [0, 1, 0], at, 96)
  // the loops, either side of the knot: the ribbon folded back on itself, its face out (its width up the glass),
  // out along the glass in front and back behind, a little puffed apart, leaning up
  const P = 12
  const gather = (t: number) => 0.45 + 0.55 * Math.sin(Math.PI * t) // (pinched into the knot, flat out at the far end)
  const loop = (side: 1 | -1) =>
    strip(
      (t) => {
        const f = t * Math.PI * 2
        const s = (rb.bowW / 2) * (1 - Math.cos(f)) * 0.5
        return [side * s, rb.y + s * 0.6 + 3 * Math.sin(f / 2), gap + 1 + P / 2 + (P / 2) * Math.sin(f) + s * 0.2]
      },
      () => [0, 1, 0],
      at,
      48,
      gather,
    )
  // the tails: from the knot down the side, flat on the glass, parting as they fall
  const tail = (side: 1 | -1) => strip((t) => [side * (rb.w * 0.3 + 5 * t), rb.y - rb.tail * t, gap + 0.5 + 0.6 * (1 - t)], () => [1, 0.12 * side, 0], at, 20, (t) => 0.55 + 0.45 * Math.min(1, t * 4))
  return { band, loops: [loop(1), loop(-1)], tails: [tail(1), tail(-1)], knot: new RoundedBoxGeometry(11, 17, 12, 2, 3) }
}
/** the flame: a teardrop, round at its foot, to a point; coloured up its height (a dim blue foot, a bright heart,
 *  an orange tip), brighter than white where it's hottest */
function flameGeometry() {
  const F = C.flame
  const pts: Vector2[] = []
  const N = 20
  for (let i = 0; i <= N; i++) {
    const t = i / N
    pts.push(new Vector2(F.r * Math.sin(Math.PI * Math.pow(t, 0.55)) + (i === 0 || i === N ? 0 : 0), t * F.h))
  }
  const g = new LatheGeometry(pts, 20)
  const pos = g.attributes.position
  const col: number[] = []
  const foot = new Color(0.35, 0.45, 1.1)
  const heart = new Color(2.6, 2.1, 1.35)
  const tip = new Color(2.0, 0.95, 0.35)
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / F.h
    if (t < 0.18) c.copy(foot).lerp(heart, t / 0.18)
    else c.copy(heart).lerp(tip, Math.pow((t - 0.18) / 0.82, 1.6))
    col.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}
function wickGeometry() {
  const W = C.wick
  const y0 = WAX - 1
  const curve = new CatmullRomCurve3([new Vector3(0, y0, 0), new Vector3(0, y0 + W.h * 0.6, 0), new Vector3(W.bend * 0.4, y0 + W.h * 0.92, 0), new Vector3(W.bend, y0 + W.h, 0.3)])
  return new TubeGeometry(curve, 10, W.r, 6, false)
}
function lidGeometry() {
  const L = C.lid
  const r = L.d / 2
  const h = L.h
  const t = L.t
  const pts = [new Vector2(0, h - t), new Vector2(r - t, h - t), new Vector2(r - t, 0), new Vector2(r, 0), ...arc(r - 1.5, h - 1.5, 1.5, 0, Math.PI / 2, 4), new Vector2(r - 6, h), new Vector2(r - 7, h + 0.8), new Vector2(0, h + 0.8)]
  return new LatheGeometry(pts, 64)
}

let SHAPES: ReturnType<typeof makeShapes> | null = null
function makeShapes() {
  return {
    jar: jarGeometry(),
    inner: lathe([new Vector2(R - J.wall, C.wax.y - 0.5), new Vector2(R - J.wall, J.h - 0.6)]),
    // (from the wall in to the wick: its top faces up)
    wax: lathe([new Vector2(R - J.wall + 0.1, C.wax.y), new Vector2(R * 0.5, C.wax.y - C.wax.dish * 0.4), new Vector2(6, WAX + 0.1), new Vector2(0, WAX)], 48, false),
    wick: wickGeometry(),
    flame: flameGeometry(),
    ribbon: ribbonGeometries(),
    lid: lidGeometry(),
  }
}
const shapes = () => (SHAPES ??= makeShapes())

const ease = (x: number) => x * x * (3 - 2 * x)

/** the candle, drawn; `lit` (the flame and its light fade in and out), `onToggle` when its top is clicked */
export function CandleModel({ lit = true, onToggle }: { lit?: boolean; onToggle?: () => void }) {
  const s = shapes()
  const mat = useMemo(
    () => ({
      glass: new MeshStandardMaterial({ map: glassTexture(), emissiveMap: glowTexture(), emissive: '#ff5a2c', emissiveIntensity: 0, roughness: 0.3 }),
      inside: new MeshStandardMaterial({ color: C.colors.inside, roughness: 0.4, side: BackSide }),
      wax: new MeshStandardMaterial({ map: waxTexture(), emissive: '#ff9a50', emissiveIntensity: 0, roughness: 0.8 }),
      wick: new MeshStandardMaterial({ color: C.colors.wick, roughness: 1 }),
      ribbon: new MeshStandardMaterial({ map: stripeTexture(), roughness: 0.75, side: DoubleSide }),
      flame: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.94, depthWrite: false }),
    }),
    [],
  )
  const flame = useRef<Group>(null)
  const light = useRef<PointLight>(null)
  const glass = useRef<Mesh>(null)
  const wax = useRef<Mesh>(null)
  const on = useRef(lit ? 1 : 0)
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    // out quickly (a breath), back in more slowly (it catches, then grows)
    const k = Math.min(dt, 0.05) * (lit ? 1.6 : 3.2)
    on.current = lit ? Math.min(1, on.current + k) : Math.max(0, on.current - k)
    const g = ease(on.current)
    const f = flicker(t)
    const F = flame.current
    if (F) {
      F.visible = g > 0.01
      const grow = lit ? g : Math.pow(g, 0.6) // (blown: it shrinks down onto the wick)
      F.scale.set(grow * (1 - (f - 1) * 0.5), grow * (1 + (f - 1) * 1.4), grow * (1 - (f - 1) * 0.5))
      F.rotation.z = C.flicker.sway * (Math.sin(t * 1.9) * 0.6 + Math.sin(t * 4.7 + 1) * 0.4)
      F.rotation.x = C.flicker.sway * 0.7 * (Math.sin(t * 2.6 + 2) * 0.6 + Math.sin(t * 5.3) * 0.4)
    }
    if (light.current) light.current.intensity = C.light.intensity * g * f
    // (the meshes' own materials: <Stylize /> swaps them for its own)
    const gm = glass.current?.material as MeshStandardMaterial | undefined
    if (gm) gm.emissiveIntensity = 0.55 * g * f
    const wm = wax.current?.material as MeshStandardMaterial | undefined
    if (wm) wm.emissiveIntensity = 0.25 * g * f
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onToggle?.()
  }
  const at = C.bowAt
  const knot = wrap(0, C.ribbon.y, C.ribbon.gap + 5, at)
  return (
    <group>
      <mesh ref={glass} geometry={s.jar} material={mat.glass} castShadow receiveShadow />
      <mesh geometry={s.inner} material={mat.inside} receiveShadow />
      <mesh ref={wax} geometry={s.wax} material={mat.wax} receiveShadow onClick={click} />
      <mesh geometry={s.wick} material={mat.wick} onClick={click} />
      {/* the ribbon */}
      <mesh geometry={s.ribbon.band} material={mat.ribbon} castShadow receiveShadow />
      {s.ribbon.loops.map((g, i) => (
        <mesh key={i} geometry={g} material={mat.ribbon} castShadow receiveShadow />
      ))}
      {s.ribbon.tails.map((g, i) => (
        <mesh key={i} geometry={g} material={mat.ribbon} castShadow receiveShadow />
      ))}
      <mesh geometry={s.ribbon.knot} material={mat.ribbon} position={knot} rotation={[0, at, 0]} castShadow />
      {/* the flame, from its foot by the wick, and its light at its heart */}
      <group position={[0, WAX + C.flame.lift, 0]}>
        <group ref={flame}>
          <mesh geometry={s.flame} material={mat.flame} onClick={click} />
        </group>
        <pointLight ref={light} position={[0, C.flame.h * 0.4, 0]} color={C.light.color} intensity={C.light.intensity} decay={C.light.decay} distance={C.light.distance} />
      </group>
    </group>
  )
}

/** the lid, face up */
export function CandleLidModel() {
  const m = useMemo(() => new MeshStandardMaterial({ color: C.colors.lid, roughness: 0.45, metalness: 0.6 }), [])
  return <mesh geometry={shapes().lid} material={m} castShadow receiveShadow />
}

const ITEM = groups(GROUP.item, 0xffff)

/** the candle on the desk: to pick up, turn, put back ("Return candle"); click its top to blow it out or light it */
export function LiveCandle({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const [lit, setLit] = useState(true)
  const perch = usePerch({
    key: 'candle',
    label: 'Return candle',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0,
    away: 150,
    lift: J.h + 40,
  })
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <CandleModel lit={lit} onToggle={() => setLit((l) => !l)} />
        </group>
        <CylinderCollider args={[J.h / 2, R]} position={[0, J.h / 2, 0]} mass={C.mass} friction={0.7} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

/** its lid, set beside it */
export function LiveCandleLid({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const perch = usePerch({
    key: 'candle-lid',
    label: 'Return candle lid',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0,
    away: 150,
    lift: C.lid.h + 40,
  })
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.15} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <CandleLidModel />
        </group>
        <CylinderCollider args={[C.lid.h / 2, C.lid.d / 2]} position={[0, C.lid.h / 2, 0]} mass={C.lidMass} friction={0.6} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
