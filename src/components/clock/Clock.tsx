import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { ConvexHullCollider } from '@react-three/rapier'
import { CanvasTexture, ExtrudeGeometry, LatheGeometry, MeshStandardMaterial, SRGBColorSpace, type Shape, Vector2, Vector3, type BufferGeometry, type Group, type Matrix4 } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedPolygon, roundedRect } from '../../lib/shapes'
import { Prompts } from '../prompt/Prompts'
import { CLOCK, TOP, WEDGE, profile } from './spec'

/**
 * Rina's alarm clock (./spec): the cream wedge, the grey panel along its top with its four buttons, the smoked lens
 * on the wedge with the time in red seven-segment digits, her own time, the colon blinking the seconds.
 *
 *   the buttons   press in when clicked: the first sets the alarm (its dot, lower left), the second dims the
 *                 digits (bright, dim), the big two are the snooze and the light, pressed for the feel of it
 *   the digits    painted into the lens's own texture, lit there too (its emissive map), redrawn once a second
 *
 * Frame: ./spec (its footprint's middle, its bottom on y 0, the display toward +z).
 */
const C = CLOCK
const PX = 6 // the lens's pixels a mm

// ---- the shapes (made once)
/** a side profile (z, y) made solid, w wide, its long edges rounded e */
function solid(points: [number, number][], radii: number[], w: number, e: number) {
  const g = new ExtrudeGeometry(roundedPolygon(points, radii), {
    depth: w - 2 * e,
    bevelEnabled: true,
    bevelThickness: e,
    bevelSize: e,
    bevelOffset: -e, // (the bevel rounds the outline in, so the profile stays the size it is)
    bevelSegments: 5,
    curveSegments: 10,
  })
  g.translate(0, 0, -(w - 2 * e) / 2)
  g.rotateY(-Math.PI / 2) // the profile's (z, y) onto the clock's, its width along x
  g.computeVertexNormals()
  return g
}
/** where the wedge's line is at height y */
const wedgeZ = (y: number) => C.len / 2 + ((y - C.toe.y) * (C.top.z - C.len / 2)) / (C.top.y - C.toe.y)
/** the body: the shell (above the seam: the round back, the top, the wedge, its toe) over the base, a hair smaller
 *  all round (the seam's under the toe, so every corner on it is square: a bevel spikes at a sharp one) */
function bodyGeometry() {
  const S = C.seam.y
  const i = C.seam.inset
  const z0 = -C.len / 2
  const shell = solid([[z0, S], [-z0, S], [-z0, C.toe.y], [C.top.z, C.top.y], [z0, C.h]], [2, 2, C.round.toe, C.round.top, C.round.back], C.w, C.edge)
  const base = solid([[z0 + i, 0], [-z0 - i, 0], [-z0 - i, S + 1], [z0 + i, S + 1]], [C.round.foot, C.round.foot, 0, 0], C.w - 2 * i, C.edge - i)
  return { shell, base }
}
/** a flat plate (a shape in its own x, y), t thick, rounded b, lying face up (+y) with its top at `top`; uv 0..1 over
 *  w × h, its v up toward -z */
function plate(shape: Shape, w: number, h: number, t: number, b: number, top: number) {
  const g = new ExtrudeGeometry(shape, { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 16 })
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h)
  g.translate(0, 0, b)
  g.rotateX(-Math.PI / 2) // its face up: shape y toward -z
  g.translate(0, top - t, 0)
  return g
}
function buttonGeometry(d: number) {
  const r = d / 2
  const h = C.buttons.h + 1 // (standing C.buttons.h off the panel, from 1 down inside it)
  return new LatheGeometry([new Vector2(0, 0), new Vector2(r, 0), new Vector2(r, h - 1.2), new Vector2(r - 0.4, h - 0.4), new Vector2(r - 1.2, h), new Vector2(0, h)], 24).translate(0, -1, 0)
}
let SHAPES: { body: { shell: BufferGeometry; base: BufferGeometry }; panel: BufferGeometry; lens: BufferGeometry; buttons: BufferGeometry[]; hull: Float32Array } | null = null
const shapes = () =>
  (SHAPES ??= {
    body: bodyGeometry(),
    panel: plate(roundedRect(C.panel.across, C.panel.along, C.panel.along / 2), C.panel.across, C.panel.along, C.panel.t, 0.8, C.panel.proud), // (lying side to side)
    lens: plate(roundedRect(C.lens.w, C.lens.h, C.lens.r), C.lens.w, C.lens.h, C.lens.t, 0.6, C.lens.proud),
    buttons: C.buttons.d.map((d, i) => buttonGeometry(d).scale(C.buttons.long[i], 1, 1)), // (the first a pill, long side to side)
    // its solid: the profile's corners either side (the rounding's a hair inside them)
    hull: new Float32Array(profile().points.flatMap(([z, y]) => [-C.w / 2, y, z, C.w / 2, y, z])),
  })

// ---- the digits
const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', ' ': '' }
const D = C.digits
/** the lens's face: the time (12-hour, no leading zero), the colon, PM and alarm dots; unlit segments faintly there */
function paint(g: CanvasRenderingContext2D, now: Date, o: { dim: boolean; alarm: boolean }) {
  const W = C.lens.w
  const H = C.lens.h
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = C.colors.lens
  g.fillRect(0, 0, W * PX, H * PX)
  const lit = o.dim ? '#a3160d' : C.colors.lit
  const off = C.colors.unlit
  g.setTransform(PX, 0, 0, PX, 0, 0)
  g.translate(W / 2, H / 2)
  g.transform(1, 0, -0.1, 1, 0, 0) // the slant LED digits have
  g.lineCap = 'round'
  g.lineWidth = D.stroke
  const row = 4 * D.w + 3 * D.gap + D.colon
  const x0 = -row / 2
  const y0 = -D.h / 2
  const h12 = now.getHours() % 12 || 12
  const text = `${h12 < 10 ? ' ' : ''}${h12}${String(now.getMinutes()).padStart(2, '0')}`
  const xs = [0, D.w + D.gap, 2 * (D.w + D.gap) + D.colon, 3 * (D.w + D.gap) + D.colon]
  const k = D.stroke * 0.75 // (each segment stops short of its corners, as they're cut)
  const seg: Record<string, [number, number, number, number]> = {
    a: [k, 0, D.w - k, 0],
    b: [D.w, k, D.w, D.h / 2 - k],
    c: [D.w, D.h / 2 + k, D.w, D.h - k],
    d: [k, D.h, D.w - k, D.h],
    e: [0, D.h / 2 + k, 0, D.h - k],
    f: [0, k, 0, D.h / 2 - k],
    g: [k, D.h / 2, D.w - k, D.h / 2],
  }
  for (let i = 0; i < 4; i++) {
    const on = SEG[text[i]]
    for (const [s, [ax, ay, bx, by]] of Object.entries(seg)) {
      g.strokeStyle = on.includes(s) ? lit : off
      g.beginPath()
      g.moveTo(x0 + xs[i] + ax, y0 + ay)
      g.lineTo(x0 + xs[i] + bx, y0 + by)
      g.stroke()
    }
  }
  // the colon, blinking the seconds; PM top left, the alarm bottom left
  const cx = x0 + 2 * (D.w + D.gap) + D.colon / 2 - D.gap / 2
  const dot = (x: number, y: number, on: boolean) => {
    g.fillStyle = on ? lit : off
    g.beginPath()
    g.arc(x, y, D.stroke * 0.6, 0, Math.PI * 2)
    g.fill()
  }
  const blink = now.getSeconds() % 2 === 0
  dot(cx, y0 + D.h * 0.3, blink)
  dot(cx, y0 + D.h * 0.7, blink)
  dot(x0 - 4.5, y0 + 2, now.getHours() >= 12)
  dot(x0 - 4.5, y0 + D.h - 2, o.alarm)
}

/** the clock, drawn: the digits dimmed or not, the alarm's dot on or off; `onButton` when one's clicked (it presses in) */
export function ClockModel({ dim = false, alarm = false, onButton }: { dim?: boolean; alarm?: boolean; onButton?: (i: number) => void }) {
  const s = shapes()
  const face = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = C.lens.w * PX
    c.height = C.lens.h * PX
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return { c, g: c.getContext('2d')!, t }
  }, [])
  const mat = useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: C.colors.body, roughness: 0.6 }),
      panel: new MeshStandardMaterial({ color: C.colors.panel, roughness: 0.7 }),
      button: new MeshStandardMaterial({ color: C.colors.button, roughness: 0.6 }),
      pill: new MeshStandardMaterial({ color: C.colors.pill, roughness: 0.6 }),
      // the lit segments glow (pushed above white: a soft bloom round them)
      lens: new MeshStandardMaterial({ map: face.t, emissiveMap: face.t, emissive: '#ffffff', emissiveIntensity: 1.8, roughness: 0.3 }),
    }),
    [face],
  )
  // redrawn when the second turns (or a setting changes)
  const drawn = useRef('')
  useFrame(() => {
    const now = new Date()
    const key = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds() % 2}|${dim}|${alarm}`
    if (key === drawn.current) return
    drawn.current = key
    paint(face.g, now, { dim, alarm })
    face.t.needsUpdate = true
  })
  // the buttons' travel, springing back
  const press = useRef(C.buttons.d.map(() => 0))
  const btn = useRef<(Group | null)[]>([])
  useFrame((_, dt) => {
    press.current.forEach((p, i) => {
      if (p <= 0) return
      press.current[i] = Math.max(0, p - Math.min(dt, 0.05) * 5)
      const b = btn.current[i]
      if (b) b.position.y = -C.buttons.travel * Math.min(1, press.current[i] * 2)
    })
  })
  const click = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    press.current[i] = 1
    onButton?.(i)
  }
  const T = TOP()
  const W = WEDGE()
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const
  const [tz, ty] = mid(T.from, T.to)
  // (the lens in the middle of the wedge, from just over its toe up to its brow)
  const low = C.toe.y + 3
  const [wz, wy] = mid([wedgeZ(low), low], W.to)
  return (
    <group>
      <mesh geometry={s.body.shell} material={mat.body} castShadow receiveShadow />
      <mesh geometry={s.body.base} material={mat.body} castShadow receiveShadow />
      {/* across the top: the panel, its buttons in a row side to side (their frame: +y out of the top, +z toward the front) */}
      <group position={[0, ty, tz]} rotation={[T.tilt, 0, 0]}>
        <mesh geometry={s.panel} material={mat.panel} receiveShadow />
        {C.buttons.at.map((x, i) => (
          <group key={i} position={[x, C.panel.proud, 0]}>
            <group ref={(g) => void (btn.current[i] = g)}>
              <mesh geometry={s.buttons[i]} material={i === 0 ? mat.pill : mat.button} castShadow receiveShadow onClick={click(i)} />
            </group>
          </group>
        ))}
      </group>
      {/* the lens on the wedge, the time in it */}
      <group position={[0, wy, wz]} rotation={[W.tilt, 0, 0]}>
        <mesh geometry={s.lens} material={mat.lens} receiveShadow />
      </group>
    </group>
  )
}

const ITEM = groups(GROUP.item, 0xffff)

/** the clock on the desk: to pick up, turn, put back ("Return clock"), and press */
export function LiveClock({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const [dim, setDim] = useState(false)
  const [alarm, setAlarm] = useState(true)
  const perch = usePerch({
    key: 'clock',
    label: 'Return clock',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0, // (it stays where it's put)
    away: 150,
    lift: C.h + 40,
  })
  const onButton = (i: number) => {
    if (i === 0) setAlarm((a) => !a)
    if (i === 1) setDim((d) => !d)
  }
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <ClockModel dim={dim} alarm={alarm} onButton={onButton} />
        </group>
        <ConvexHullCollider args={[shapes().hull]} mass={C.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
