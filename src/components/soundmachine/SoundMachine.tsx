import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CylinderCollider } from '@react-three/rapier'
import { ExtrudeGeometry, LatheGeometry, MeshStandardMaterial, Path, Shape, Vector2, Vector3, type BufferGeometry, type Group, type Matrix4 } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedRect } from '../../lib/shapes'
import { Prompts } from '../prompt/Prompts'
import { SOUNDMACHINE } from './spec'

/**
 * Rina's sound machine (./spec): the white drum, the collar over it with its openings round the side (the fan's
 * dark drum seen through them), the low dome on top, two rocker switches low on the front.
 *
 *   the left switch    power: on, a soft hush fades in (pink noise through a low-pass, quiet) and the collar
 *                      starts to turn, slowly; off, both die away
 *   the right switch   the speed: high lifts the hush a little brighter and turns the collar a touch faster
 *
 * Frame: ./spec (the footprint's middle, its bottom on y 0, the switches toward +z).
 */
const S = SOUNDMACHINE
const K = S.colors
const RC = S.r - S.collar.inset // the collar's outside
const Y0 = S.body.h + S.seam // the collar's foot
const Y1 = Y0 + S.collar.h // its top, where the dome starts

// ---- the shapes (made once)
const v = (r: number, y: number) => new Vector2(r, y)
/** the body: the foot ring under it, the rounded lower edge, straight up to the collar, a small round in at the top */
function bodyGeometry() {
  const F = S.foot
  const pts = [v(0, 0), v(S.r - F.inset - 1, 0), v(S.r - F.inset, 1), v(S.r - F.inset, F.h)]
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 + ((Math.PI / 2) * k) / 6
    pts.push(v(S.r - F.r + Math.cos(a) * F.r, F.h + F.r + Math.sin(a) * F.r))
  }
  pts.push(v(S.r, S.body.h - 1.5), v(S.r - 0.5, S.body.h - 0.4), v(S.r - 1.5, S.body.h), v(0, S.body.h))
  return new LatheGeometry(pts, 96)
}
/** a ring or a piece of one (angles a0..a1, round from +x toward -z), lying flat, from y a up to y b, edges softened */
function band(a: number, b: number, ro: number, ri: number, a0?: number, a1?: number) {
  let s: Shape
  if (a0 === undefined || a1 === undefined) {
    s = new Shape().absarc(0, 0, ro, 0, Math.PI * 2, false)
    s.holes.push(new Path().absarc(0, 0, ri, 0, Math.PI * 2, true))
  } else {
    s = new Shape().absarc(0, 0, ro, a0, a1, false)
    s.absarc(0, 0, ri, a1, a0, true)
  }
  const e = 0.6
  const g = new ExtrudeGeometry(s, { depth: b - a - 2 * e, bevelEnabled: true, bevelThickness: e, bevelSize: e, bevelOffset: -e, bevelSegments: 2, curveSegments: 64 })
  g.rotateX(-Math.PI / 2) // (lying flat, its depth up)
  g.translate(0, a + e, 0)
  return g
}
/** the collar: a band below the openings, the pillars between them, the band above */
function collarGeometry() {
  const V = S.vents
  const ri = RC - S.collar.wall
  const ya = Y0 + V.below
  const yb = ya + V.h
  const open = V.w / RC // (the openings' angle)
  const step = (Math.PI * 2) / V.n
  const parts = [band(Y0, ya + 0.6, RC, ri), band(yb - 0.6, Y1, RC, ri)]
  // (turned half a step: an opening straight over the switches, not a pillar)
  for (let i = 0; i < V.n; i++) parts.push(band(ya, yb, RC, ri, i * step + open / 2 + Math.PI / 2, (i + 1) * step - open / 2 + Math.PI / 2))
  return parts
}
/** the dome: from the collar's top, a soft shoulder, then a low dome over the middle */
function capGeometry() {
  const pts = [v(RC - S.collar.wall, Y1), v(RC, Y1)]
  for (let k = 0; k <= 20; k++) {
    const u = 1 - (k / 20) ** 1.6 // (finer near the shoulder)
    const q = 1 - u * u
    pts.push(v(RC * u, Y1 + S.cap.rise * (0.35 * q ** 0.3 + 0.65 * q)))
  }
  return new LatheGeometry(pts, 96)
}
/** the fan's drum inside, dark */
const drumGeometry = () => new LatheGeometry([v(S.inside.r, S.body.h - 1), v(S.inside.r, Y1 + 1), v(0, Y1 + 1)], 64)
/** a rounded rectangle w × h, t thick, its back on z 0 */
function tile(w: number, h: number, r: number, t: number) {
  const b = Math.min(0.8, t / 3)
  const g = new ExtrudeGeometry(roundedRect(w, h, r), { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 10 })
  g.translate(0, 0, b)
  return g
}
let SHAPES: { body: BufferGeometry; collar: BufferGeometry[]; cap: BufferGeometry; drum: BufferGeometry; plate: BufferGeometry; rocker: BufferGeometry } | null = null
const shapes = () => {
  const W = S.switches
  return (SHAPES ??= {
    body: bodyGeometry(),
    collar: collarGeometry(),
    cap: capGeometry(),
    drum: drumGeometry(),
    plate: tile(W.w + 2 * W.plate + 2, W.h + 2 * W.plate + 2, 2.5, 3),
    rocker: tile(W.w, W.h, 1.8, W.rocker).translate(0, 0, -W.rocker / 2), // (centred on its hinge)
  })
}
/** where each switch sits on the front: its x and its turn to face straight out of the drum there */
const SW = [-1, 1].map((side) => {
  const x = side * (S.switches.gap / 2 + S.switches.w / 2 + S.switches.plate)
  return { x, turn: Math.asin(x / S.r), z: Math.sqrt(S.r * S.r - x * x) }
})

// ---- the hush: pink noise, low-passed, faded in and out; asleep when off (a running AudioContext costs frames)
let audio: { ctx: AudioContext; lp: BiquadFilterNode; gain: GainNode; sleep?: ReturnType<typeof setTimeout> } | null = null
function pinkNoise(ctx: AudioContext) {
  const len = ctx.sampleRate * 4
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0 // (Paul Kellet's filter)
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  // (the loop's ends crossfaded, so it doesn't tick round)
  const x = Math.floor(ctx.sampleRate * 0.05)
  for (let i = 0; i < x; i++) d[len - x + i] = d[len - x + i] * (1 - i / x) + d[i] * (i / x)
  return buf
}
function hush(on: boolean, high: boolean) {
  const N = S.noise
  if (!on && !audio) return
  if (!audio) {
    const ctx = new AudioContext()
    const src = ctx.createBufferSource()
    src.buffer = pinkNoise(ctx)
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.5
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(lp).connect(gain).connect(ctx.destination)
    src.start()
    audio = { ctx, lp, gain }
  }
  const a = audio
  const t = a.ctx.currentTime
  if (a.sleep) clearTimeout(a.sleep)
  a.sleep = undefined
  if (on && a.ctx.state === 'suspended') void a.ctx.resume()
  a.lp.frequency.setTargetAtTime(high ? N.high : N.low, t, 0.4)
  const g = a.gain.gain
  g.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  if (on) g.linearRampToValueAtTime(N.gain * (high ? 1.15 : 1), t + N.fadeIn)
  else {
    g.linearRampToValueAtTime(0, t + N.fadeOut)
    a.sleep = setTimeout(() => void a.ctx.suspend(), N.fadeOut * 1000 + 300)
  }
}

/** the sound machine, drawn: on or off, high or low (the rockers show it, the collar turns while on);
 *  `onSwitch` when a rocker's clicked */
export function SoundMachineModel({ on = false, high = false, onSwitch }: { on?: boolean; high?: boolean; onSwitch?: (i: number) => void }) {
  const s = shapes()
  const mat = useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: K.body, roughness: 0.6 }),
      collar: new MeshStandardMaterial({ color: K.collar, roughness: 0.6 }),
      inside: new MeshStandardMaterial({ color: K.inside, roughness: 0.9 }),
      plate: new MeshStandardMaterial({ color: K.plate, roughness: 0.7 }),
      rocker: new MeshStandardMaterial({ color: K.rocker, roughness: 0.5 }),
    }),
    [],
  )
  // the collar: up to speed, and down again, over a couple of seconds (as a fan spins up)
  const collar = useRef<Group>(null)
  const speed = useRef(0)
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20)
    const want = on ? (high ? S.spin.high : S.spin.low) : 0
    speed.current += (want - speed.current) * Math.min(1, d * 1.2)
    if (collar.current && speed.current > 1e-4) collar.current.rotation.y -= speed.current * d
  })
  const click = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSwitch?.(i)
  }
  const W = S.switches
  return (
    <group>
      <mesh geometry={s.body} material={mat.body} castShadow receiveShadow />
      <mesh geometry={s.drum} material={mat.inside} receiveShadow />
      <group ref={collar}>
        {s.collar.map((g, i) => (
          <mesh key={i} geometry={g} material={mat.collar} castShadow receiveShadow />
        ))}
        <mesh geometry={s.cap} material={mat.collar} castShadow receiveShadow />
      </group>
      {/* the rockers, each in its plate on the front: pressed at the top when on (or high) */}
      {SW.map((w, i) => (
        <group key={i} position={[w.x, W.y, w.z - 1.2]} rotation={[0, w.turn, 0]}>
          <mesh geometry={s.plate} material={mat.plate} position={[0, 0, 0]} receiveShadow />
          <mesh geometry={s.rocker} material={mat.rocker} position={[0, 0, 3 + W.rocker / 2 - 0.6]} rotation={[(i === 0 ? on : high) ? -W.tilt : W.tilt, 0, 0]} castShadow onClick={click(i)} />
        </group>
      ))}
    </group>
  )
}

const ITEM = groups(GROUP.item, 0xffff)

/** the sound machine on the desk: to pick up, turn, put back ("Return sound machine"), and switch on */
export function LiveSoundMachine({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const [on, setOn] = useState(false)
  const [high, setHigh] = useState(false)
  const perch = usePerch({
    key: 'soundmachine',
    label: 'Return sound machine',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0,
    away: 150,
    lift: S.h + 40,
  })
  // (the hush follows the switches, only ever after a click; and stops with the page)
  const clicked = useRef(false)
  useEffect(() => {
    if (clicked.current) hush(on, high)
  }, [on, high])
  useEffect(() => () => hush(false, false), [])
  const onSwitch = (i: number) => {
    clicked.current = true
    if (i === 0) setOn((o) => !o)
    else setHigh((h) => !h)
  }
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <SoundMachineModel on={on} high={high} onSwitch={onSwitch} />
        </group>
        <CylinderCollider args={[S.h / 2, S.r]} position={[0, S.h / 2, 0]} mass={S.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
