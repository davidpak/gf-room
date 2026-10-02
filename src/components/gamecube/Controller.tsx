import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Path, Shape, TorusGeometry, Vector2, type Material, type Mesh } from 'three'
import { Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { anchor } from './anchors'
import { GRIP, PAD2 } from './pad'
import { COLORS } from './spec'
import { getCube, padButton } from './state'

/**
 * A GameCube controller [C], built from its measured spec (./pad: dimensions.com's drawing, top and side), toy style.
 * Its frame: the origin on the ground under its middle (the grips' ends are what it stands on), +z toward whoever
 * holds it, its cable leaving the far side (-z).
 *
 *   the top    its outline from above (the grips cut away), a slab; the two lobes raised on it (round the main stick
 *              and the D-pad, round A and the C-stick), START in the lower middle between them
 *   the grips  each a tube swept from the shoulder (the trigger's housing) down and toward you to its rounded end,
 *              through sections taken off the outline from above and the side's profile
 *   on top     the main stick in its octagonal gate, its round surround; A in its well, B, the kidney X and Y (their
 *              outlines extruded); the D-pad cross in its well; the yellow C-stick in its gate; START; L and R on the
 *              far edge, Z on R
 *
 * START, A, B, X and Y click: they dip, and the game hears them (./state); `pad` is which port it's in. `color`:
 * 'indigo' or 'black'.
 */
const P = PAD2
const TOP = -Math.min(...P.under.map((u) => u[1])) // (the top's height: the grips' ends on the ground)
const ZC = P.d / 2
const Z = (z: number) => z - ZC // (the drawing's z from the far edge, to the model's from its middle)
const shape = (pts: [number, number][], mirror = false) => {
  const s = new Shape()
  const q = mirror ? [...pts].reverse().map(([x, z]) => [-x, z] as [number, number]) : pts
  // (smoothed through its points: the drawing's are ~5 mm apart, and a wall turned at each would show its facets)
  const smooth = new CatmullRomCurve3(q.map(([x, z]) => new Vector3(x, -Z(z), 0)), true, 'centripetal').getSpacedPoints(Math.max(60, q.length * 4))
  s.setFromPoints(smooth.slice(0, -1).map((p) => new Vector2(p.x, p.y)))
  return s
}
/** a plan shape stood up between heights y0 and y1, rounded over by b */
const slab = (s: Shape, y0: number, y1: number, b: number) =>
  new ExtrudeGeometry(s, { depth: y1 - y0 - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 16 }).rotateX(-Math.PI / 2).translate(0, y0 + b, 0)

/** an outline moved in by d (each point along the bisector of its edges; the outlines here run clockwise from above) */
const inset = (pts: [number, number][], d: number) =>
  pts.map((p, i): [number, number] => {
    const a = pts[(i - 1 + pts.length) % pts.length]
    const b = pts[(i + 1) % pts.length]
    const tx = b[0] - a[0]
    const tz = b[1] - a[1]
    const l = Math.hypot(tx, tz) || 1
    // (the inward normal: for a clockwise loop (seen from above, z toward you), to the right of the way it runs)
    return [p[0] - (tz / l) * d * WIND, p[1] + (tx / l) * d * WIND]
  })
/** which way the outlines run (+1 or -1): from their signed area */
const area = (pts: [number, number][]) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)
const WIND = Math.sign(area(PAD2.lobe))

/** the top's outline with the grips cut off (their tubes take over from it) */
const CORE = P.outline.filter(([x, z]) => !(x < -43 && z > 31) && !(x > 43 && z > 31))

/** a grip: its sections swept into a tube, closed at both ends */
function gripGeometry(side: 1 | -1) {
  const N = 24
  const pos: number[] = []
  const idx: number[] = []
  // (between the measured sections, smoothly: Catmull-Rom through them)
  const sec = GRIP
  const lerp = (i: number, t: number, k: 'x' | 'h' | 'a' | 'b' | 'z') => {
    const p0 = sec[Math.max(0, i - 1)][k]
    const p1 = sec[i][k]
    const p2 = sec[Math.min(sec.length - 1, i + 1)][k]
    const p3 = sec[Math.min(sec.length - 1, i + 2)][k]
    const t2 = t * t
    const t3 = t2 * t
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  }
  const rings: { x: number; y: number; z: number; a: number; b: number }[] = []
  for (let i = 0; i < sec.length - 1; i++)
    for (let s = 0; s < 4; s++) {
      const t = s / 4
      rings.push({ x: side * lerp(i, t, 'x'), y: TOP + lerp(i, t, 'h'), z: Z(lerp(i, t, 'z')), a: Math.max(0.5, lerp(i, t, 'a')), b: Math.max(0.5, lerp(i, t, 'b')) })
    }
  const last = sec[sec.length - 1]
  rings.push({ x: side * last.x, y: TOP + last.h, z: Z(last.z), a: last.a, b: last.b })
  for (const r of rings)
    for (let j = 0; j < N; j++) {
      const th = (j / N) * Math.PI * 2
      pos.push(r.x + r.a * Math.cos(th), r.y + r.b * Math.sin(th), r.z)
    }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < N; j++) {
      const a = i * N + j
      const b = i * N + ((j + 1) % N)
      if (side > 0) idx.push(a, b, a + N, b, b + N, a + N)
      else idx.push(a, a + N, b, b, a + N, b + N)
    }
  // (the ends: a fan to each ring's middle)
  const cap = (i: number, flip: boolean) => {
    const r = rings[i]
    const c = pos.length / 3
    pos.push(r.x, r.y, r.z)
    for (let j = 0; j < N; j++) {
      const a = i * N + j
      const b = i * N + ((j + 1) % N)
      if (flip !== side < 0) idx.push(c, b, a)
      else idx.push(c, a, b)
    }
  }
  cap(0, true)
  cap(rings.length - 1, false)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** a round button turned from its profile (from its rim up to its domed middle) */
const button = (r: number, h: number, dome: number) =>
  new LatheGeometry(
    [[0, 0], [r, 0], [r, h - 0.8], [r - 0.6, h], [r * 0.5, h + dome * 0.8], [0, h + dome]].map(([x, y]) => new Vector2(x, y)),
    32,
  )
/** an octagonal rim (a gate): out to `outer` at its corners, its hole `inner`, `t` high */
const gate = (inner: number, outer: number, t: number) => {
  const oct = (r: number, into: Path) => {
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2
      if (i) into.lineTo(r * Math.cos(a), r * Math.sin(a))
      else into.moveTo(r * Math.cos(a), r * Math.sin(a))
    }
  }
  const s = new Shape()
  oct(outer, s)
  const hole = new Path()
  oct(inner, hole)
  s.holes.push(hole)
  return new ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).rotateX(-Math.PI / 2)
}
/** the D-pad's cross */
const cross = () => {
  const { span, arm } = P.dpad
  const h = span / 2
  const a = arm / 2
  const s = new Shape(
    [[-a, -h], [a, -h], [a, -a], [h, -a], [h, a], [a, a], [a, h], [-a, h], [-a, a], [-h, a], [-h, -a], [-a, -a]].map(([x, y]) => new Vector2(x, y)),
  )
  return new ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 }).rotateX(-Math.PI / 2)
}
/** X or Y: its kidney outline, about its own middle */
const kidney = (pts: [number, number][]) => {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const g = new ExtrudeGeometry(new Shape(pts.map(([x, z]) => new Vector2(x - cx, -(z - cz)))), { depth: P.rise.xy - 1.2, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 }).rotateX(-Math.PI / 2)
  return { g, x: cx, z: cz }
}

const looks = {
  indigo: { body: COLORS.indigo, shade: '#3a3070', grip: '#5246a8', trigger: '#7468cc' },
  black: { body: COLORS.black, shade: '#141318', grip: '#26252c', trigger: '#4a4952' },
}
const BTN = {
  grey: bruno({ color: COLORS.grey, shade: '#8a8a9a' }),
  gate: bruno({ color: '#3a3842', shade: '#1e1d24' }),
  a: bruno({ color: COLORS.a, shade: '#1f6a48' }),
  b: bruno({ color: COLORS.b, shade: '#8a2a2a' }),
  c: bruno({ color: COLORS.c, shade: '#9a6a1a' }),
  z: bruno({ color: COLORS.z, shade: '#4a44a0' }),
}

/** a button on its top: clicked, it dips, and the game hears it */
function Key({ k, pad, geo, m, at, act }: { k: string; pad: number; geo: BufferGeometry; m: Material; at: [number, number, number]; act?: () => void }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const o = ref.current
    if (!o) return
    const p = getCube().pressed[`${k}${pad}`] ?? -9
    o.position.y = at[1] - (performance.now() / 1000 - p < 0.16 ? 1.4 : 0)
  })
  const on = act
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          act()
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        },
        onPointerOut: () => (document.body.style.cursor = ''),
      }
    : {}
  return <mesh ref={ref} geometry={geo} material={m} position={at} castShadow {...on} />
}

export function Controller({ color, pad }: { color: 'indigo' | 'black'; pad: number }) {
  const l = looks[color]
  const mats = useMemo(() => ({ body: bruno({ color: l.body, shade: l.shade }), grip: bruno({ color: l.grip, shade: l.shade }), trigger: bruno({ color: l.trigger, shade: l.shade }) }), [l])
  const geo = useMemo(() => {
    const x = kidney(P.X)
    const y = kidney(P.Y)
    return {
      // (the slab, rounded well over; the lobes a raised step on it, set in a little from where the two outlines meet so
      // their walls never lie on the slab's)
      core: slab(shape(CORE), TOP - 17, TOP - 3, 4.5),
      lobeL: slab(shape(inset(P.lobe, 0.8)), TOP - 5.5, TOP, 2),
      lobeR: slab(shape(inset(P.lobe, 0.8), true), TOP - 5.5, TOP, 2),
      gripL: gripGeometry(-1),
      gripR: gripGeometry(1),
      gate: gate(P.stick.gate - 1.6, P.stick.gate + 0.4, 0.9),
      surround: new TorusGeometry(P.stick.surround, 0.7, 6, 48).rotateX(Math.PI / 2),
      shaft: new CylinderGeometry(P.stick.shaft, P.stick.shaft + 0.6, P.stick.top - P.stick.capT, 20),
      cap: new LatheGeometry(
        // (the cap: its rim, its top with two rings stepped into it)
        [[0, 0], [P.stick.cap, 0], [P.stick.cap + 0.3, 1.6], [P.stick.cap, P.stick.capT], [5.9, P.stick.capT], [5.6, P.stick.capT - 0.5], [4.2, P.stick.capT - 0.5], [4.0, P.stick.capT - 1], [0, P.stick.capT - 1]].map(([a, b]) => new Vector2(a, b)),
        32,
      ),
      cgate: gate(P.cstick.gate - 1.6, P.cstick.gate + 0.4, 0.9),
      cshaft: new CylinderGeometry(2.6, 3, 4, 16),
      ccap: new LatheGeometry([[0, 0], [P.cstick.cap, 0], [P.cstick.cap, 2], [P.cstick.cap - 1, 3], [0, 3.3]].map(([a, b]) => new Vector2(a, b)), 28),
      dwell: new TorusGeometry(P.dpad.well, 0.6, 6, 40).rotateX(Math.PI / 2),
      awell: new TorusGeometry(P.a.well, 0.6, 6, 48).rotateX(Math.PI / 2),
      cross: cross(),
      a: button(P.a.r, P.rise.a - 1, 1),
      b: button(P.b.r, P.rise.b - 0.8, 0.8),
      start: button(P.start.r, P.rise.start + 2.2, 0.4),
      x,
      y,
      trigger: new RoundedBoxGeometry(P.trigger.x1 - P.trigger.x0, 13, P.trigger.z1 - P.trigger.z0, 2, 3),
      zb: new RoundedBoxGeometry(P.z.x1 - P.z.x0, 3.5, P.z.z1 - P.z.z0, 2, 1.4),
      strain: new CylinderGeometry(3.4, 4.2, 10, 12).rotateX(Math.PI / 2),
    }
  }, [])
  const press = (b: 'start' | 'a' | 'b' | 'x' | 'y') => () => padButton(b, pad)
  const T = TOP
  return (
    <group>
      <mesh geometry={geo.core} material={mats.body} castShadow receiveShadow />
      <mesh geometry={geo.lobeL} material={mats.body} castShadow receiveShadow />
      <mesh geometry={geo.lobeR} material={mats.body} castShadow receiveShadow />
      <mesh geometry={geo.gripL} material={mats.grip} castShadow receiveShadow />
      <mesh geometry={geo.gripR} material={mats.grip} castShadow receiveShadow />
      {/* the main stick: its surround, its gate, its shaft and cap */}
      <mesh geometry={geo.surround} material={mats.body} position={[P.stick.x, T, Z(P.stick.z)]} />
      <mesh geometry={geo.gate} material={BTN.gate} position={[P.stick.x, T - 0.2, Z(P.stick.z)]} />
      <mesh geometry={geo.shaft} material={BTN.gate} position={[P.stick.x, T + (P.stick.top - P.stick.capT) / 2, Z(P.stick.z)]} />
      <mesh geometry={geo.cap} material={BTN.grey} position={[P.stick.x, T + P.stick.top - P.stick.capT, Z(P.stick.z)]} castShadow />
      {/* the D-pad in its well; the C-stick in its gate */}
      <mesh geometry={geo.dwell} material={mats.body} position={[P.dpad.x, T, Z(P.dpad.z)]} />
      <mesh geometry={geo.cross} material={BTN.grey} position={[P.dpad.x, T - 0.5, Z(P.dpad.z)]} castShadow />
      <mesh geometry={geo.cgate} material={BTN.gate} position={[P.cstick.x, T - 0.2, Z(P.cstick.z)]} />
      <mesh geometry={geo.cshaft} material={BTN.gate} position={[P.cstick.x, T + 2, Z(P.cstick.z)]} />
      <mesh geometry={geo.ccap} material={BTN.c} position={[P.cstick.x, T + P.cstick.top - 3.3, Z(P.cstick.z)]} castShadow />
      <mesh geometry={geo.awell} material={mats.body} position={[P.a.x, T, Z(P.a.z)]} />
      {/* START; A, B, X, Y (live: they dip) */}
      <group userData={{ live: true }}>
        <Key k="start" pad={pad} geo={geo.start} m={BTN.grey} at={[P.start.x, T - 3, Z(P.start.z)]} act={press('start')} />
        <Key k="a" pad={pad} geo={geo.a} m={BTN.a} at={[P.a.x, T - 0.5, Z(P.a.z)]} act={press('a')} />
        <Key k="b" pad={pad} geo={geo.b} m={BTN.b} at={[P.b.x, T - 0.5, Z(P.b.z)]} act={press('b')} />
        <Key k="x" pad={pad} geo={geo.x.g} m={BTN.grey} at={[geo.x.x, T - 0.5, Z(geo.x.z)]} act={press('x')} />
        <Key k="y" pad={pad} geo={geo.y.g} m={BTN.grey} at={[geo.y.x, T - 0.5, Z(geo.y.z)]} act={press('y')} />
      </group>
      {/* L and R on the far edge, Z on R */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.trigger} material={mats.trigger} position={[(s * (P.trigger.x0 + P.trigger.x1)) / 2, T - 8, Z((P.trigger.z0 + P.trigger.z1) / 2) - 1]} castShadow />
      ))}
      <mesh geometry={geo.zb} material={BTN.z} position={[(P.z.x0 + P.z.x1) / 2, T - 0.2, Z((P.z.z0 + P.z.z1) / 2)]} castShadow />
      {/* the cable leaving its far side */}
      <mesh geometry={geo.strain} material={mats.grip} position={[0, T + P.cableAt.h, Z(0) - 4]} />
      <group ref={anchor(`pad${pad}`)} position={[0, T + P.cableAt.h, Z(0) - 9]} rotation={[0, Math.PI, 0]} />
    </group>
  )
}
