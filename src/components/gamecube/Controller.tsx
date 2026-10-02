import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CapsuleGeometry, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Shape, TorusGeometry, Vector2, type BufferGeometry, type Material, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { anchor } from './anchors'
import { COLORS, PAD } from './spec'
import { getCube, padButton } from './state'

/**
 * A GameCube controller [C], toy style: its body (the top's outline extruded, rounded over), the two grips hanging
 * from it toward you, and its buttons, each its own part. Its frame: the origin under its middle at the ground, +y
 * up, +z toward whoever holds it (its cable leaves the far side, -z). START, A and B (and X, Y) click: they dip, and
 * the game hears them (./state); \`pad\` is which port it's in. \`color\`: 'indigo' or 'black'.
 */
const TOPY = 30 // (its top's height, resting on its grips' ends and its body's underside)
/** the top's outline (x right, y away from you) */
const OUTLINE = (() => {
  const s = new Shape()
  const pts = [
    [0, 33],
    [34, 39],
    [60, 30],
    [74, 9],
    [75, -14],
    [64, -34],
    [44, -40],
    [24, -30],
    [0, -24],
    [-24, -30],
    [-44, -40],
    [-64, -34],
    [-75, -14],
    [-74, 9],
    [-60, 30],
    [-34, 39],
  ].map(([x, y]) => new Vector2(x * 0.907, y)) // (narrowed by its rounding over)
  s.moveTo(0, 33)
  s.splineThru([...pts.slice(1), pts[0]])
  return s
})()
const BODY = new ExtrudeGeometry(OUTLINE, { depth: 8, bevelEnabled: true, bevelThickness: 7, bevelSize: 7, bevelSegments: 4, curveSegments: 40, steps: 1 })
  .rotateX(-Math.PI / 2)
  .translate(0, TOPY - 15, 0) // (its body 8 to 30 up, held up on its grips)
const GRIP = new CapsuleGeometry(14, 28, 6, 16)
// (the caps' profiles from the bottom up, so they face out)
const STICK_CAP = new LatheGeometry(
  [
    [0, 0],
    [10, 0],
    [10.5, 1.8],
    [9.5, 3.6],
    [6, 4.4],
    [0, 4.5],
  ].map(([x, y]) => new Vector2(x, y)),
  28,
)
const C_CAP = new LatheGeometry(
  [
    [0, 0],
    [7.2, 0],
    [7, 2.6],
    [5, 4],
    [0, 4],
  ].map(([x, y]) => new Vector2(x, y)),
  24,
)
const GATE = new CylinderGeometry(1, 1, 1, 8)
const ROUND = new CylinderGeometry(1, 1, 1, 28)
const ARC = (from: number, to: number) => new TorusGeometry(15.5, 4.6, 10, 20, to - from).rotateZ(from).rotateX(-Math.PI / 2)
const XB = ARC(-0.75, 0.5)
const YB = ARC(1.05, 2.15)
const DPAD = new RoundedBoxGeometry(19, 4, 6.4, 2, 1.4)
const TRIGGER = new RoundedBoxGeometry(32, 11, 16, 2, 4)
const ZB = new RoundedBoxGeometry(22, 5, 9, 2, 2)
const STRAIN = new CylinderGeometry(3.4, 4.2, 12, 12).rotateX(Math.PI / 2)

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
function Key({ k, pad, geo, m, at, scale = [1, 1, 1], rot = 0, act }: { k: string; pad: number; geo: BufferGeometry; m: Material; at: [number, number, number]; scale?: [number, number, number]; rot?: number; act?: () => void }) {
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
  return <mesh ref={ref} geometry={geo} material={m} position={at} scale={scale} rotation={[0, rot, 0]} {...on} />
}

export function Controller({ color, pad }: { color: 'indigo' | 'black'; pad: number }) {
  const l = looks[color]
  const mats = useMemo(() => ({ body: bruno({ color: l.body, shade: l.shade }), grip: bruno({ color: l.grip, shade: l.shade }), trigger: bruno({ color: l.trigger, shade: l.shade }) }), [l])
  const T = TOPY + 0.2
  const press = (b: 'start' | 'a' | 'b' | 'x' | 'y') => () => padButton(b, pad)
  return (
    <group>
      <mesh geometry={BODY} material={mats.body} castShadow receiveShadow />
      {/* the grips, under its sides, reaching toward you (what it stands on), splayed */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={GRIP} material={mats.grip} position={[s * PAD.grip.x, 14.5, PAD.grip.z]} rotation={[Math.PI / 2 + 0.1, s * 0.22, 0, 'YXZ']} castShadow />
      ))}
      {/* the main stick in its gate, the D-pad */}
      <mesh geometry={GATE} material={BTN.gate} position={[-42, T, -8]} scale={[15, 1.4, 15]} rotation={[0, Math.PI / 8, 0]} />
      <mesh geometry={ROUND} material={BTN.gate} position={[-42, T + 3, -8]} scale={[4, 6, 4]} />
      <mesh geometry={STICK_CAP} material={BTN.grey} position={[-42, T + 5, -8]} castShadow />
      <mesh geometry={DPAD} material={BTN.grey} position={[-22, T + 1.6, 20]} castShadow />
      <mesh geometry={DPAD} material={BTN.grey} position={[-22, T + 1.6, 20]} rotation={[0, Math.PI / 2, 0]} castShadow />
      {/* START; A, B, X, Y (live: they dip); the C-stick */}
      <group userData={{ live: true }}>
      <Key k="start" pad={pad} geo={ROUND} m={BTN.grey} at={[0, T + 1.2, -4]} scale={[3.8, 2.4, 3.8]} act={press('start')} />
      <Key k="a" pad={pad} geo={ROUND} m={BTN.a} at={[38, T + 2, -4]} scale={[10.5, 4, 10.5]} act={press('a')} />
      <Key k="b" pad={pad} geo={ROUND} m={BTN.b} at={[19, T + 1.8, 13]} scale={[6, 3.6, 6]} act={press('b')} />
      <Key k="x" pad={pad} geo={XB} m={BTN.grey} at={[38, T + 2.2, -4]} act={press('x')} />
      <Key k="y" pad={pad} geo={YB} m={BTN.grey} at={[38, T + 2.2, -4]} act={press('y')} />
      </group>
      <mesh geometry={GATE} material={BTN.gate} position={[27, T, 26]} scale={[10, 1.4, 10]} rotation={[0, Math.PI / 8, 0]} />
      <mesh geometry={C_CAP} material={BTN.c} position={[27, T + 2.5, 26]} castShadow />
      {/* L and R under the back shoulders, Z on the right one */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={TRIGGER} material={mats.trigger} position={[s * 50, TOPY - 15, -30]} rotation={[0, s * -0.32, 0]} />
      ))}
      <mesh geometry={ZB} material={BTN.z} position={[50, TOPY - 5, -38]} rotation={[0, -0.35, 0]} />
      {/* the cable leaving its far side */}
      <mesh geometry={STRAIN} material={mats.grip} position={[0, TOPY - 13, -40]} />
      <group ref={anchor(`pad${pad}`)} position={[0, TOPY - 13, -46]} rotation={[0, Math.PI, 0]} />
    </group>
  )
}
