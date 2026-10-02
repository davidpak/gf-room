import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep } from '@react-three/rapier'
import { Quaternion, Vector3 } from 'three'
import { Cable, DiscFlight } from '../gamecube/Cable'
import { Case } from '../gamecube/Case'
import { Controller } from '../gamecube/Controller'
import { Crt } from '../gamecube/Crt'
import { Bench, Cushion, Rug } from '../gamecube/Furniture'
import { GameCube } from '../gamecube/GameCube'
import { CABLES, LAYOUT } from '../gamecube/Setup'
import { BENCH, CASE, CUBE, CUSHION, PAD, RUG, TV } from '../gamecube/spec'
import { padButton, useCube } from '../gamecube/state'
import { Prompts } from '../prompt/Prompts'
import { LiveProp, liveBody, setPrompt } from './Physical'
import { clickSpot, frameAround, getLook, type Spot } from './look'
import { SET } from './set'
import type { CarState } from './Car'
import { Static } from '../../lib/render/Static'

/**
 * The GameCube setup on the Quad (../gamecube), on the open lawn inside the V east of the picnic, the TV's back to
 * the cherries: the rug, the bench with the CRT on it, the console with Melee in it, the two controllers, the case,
 * the cushions. At the benches' toy scale (0.24). All of it loose like the picnic's (the car shoves it, the hand
 * carries it), the controllers' cables leashing them to the console, the AV cable the console to the TV.
 *
 *   the TV       click it: the camera goes in to watch (a click on the screen there, or Enter, is START; Backspace B)
 *   the console  click it: the camera goes down onto its top, its buttons big enough to press (../gamecube/state:
 *                POWER, OPEN, RESET, the lid, the disc); pressing POWER, or shutting the lid with it on, the camera
 *                goes back to the TV to watch it start
 *   the pads     their START, A and B work wherever you are
 *   R            all of it back as it was (or its prompt, when anything's out of place)
 */
const K = 0.24
const LAWN = 4
const A = SET.game
const cos = Math.cos(A.rot)
const sin = Math.sin(A.rot)
/** the setup's own frame (real mm, the rug's middle at its origin) to the Quad's */
const world = (lx: number, ly: number, lz: number) => new Vector3(A.x + (lx * cos + lz * sin) * K, LAWN + ly * K, A.z + (-lx * sin + lz * cos) * K)
const at = (p: { x: number; z: number; rot: number }, y = RUG.t) => {
  const w = world(p.x, y, p.z)
  return { x: w.x, y: w.y, z: w.z, rot: A.rot + p.rot }
}
const S = (r: number) => (r * K) / 2 // (a half-size, real mm to the toy's)

/** a loose piece of the setup: its model at the toy's scale, a simple body */
function Piece({ id, home, car, feelR, feelPts, lift = 0, children, body }: { id: string; home: { x: number; y: number; z: number; rot: number }; car: { current: CarState }; feelR: number; feelPts?: [number, number][]; lift?: number; children: ReactNode; body: ReactNode }) {
  return (
    <LiveProp id={`game${id}`} label="" set="game" at={home} car={car} lift={lift} feelAlong={[0]} feelPts={feelPts} feelR={feelR}>
      <group scale={K}>{children}</group>
      {body}
    </LiveProp>
  )
}

/** the cables as leashes: each end held within the cable's length of the other (a pull along the ground, shared by
 *  mass, never a yank: a cable drags what's on it, it doesn't fling it) */
const LEASHES = [
  { a: 'gamecube', b: 'gamepad1', len: PAD.cable * K },
  { a: 'gamecube', b: 'gamepad2', len: PAD.cable * K },
  { a: 'gamecube', b: 'gametv', len: 1800 * K },
]
function Leashes() {
  useBeforePhysicsStep((w) => {
    if (import.meta.env.DEV && (window as unknown as { __noLeash?: boolean }).__noLeash) return
    const dt = w.timestep
    for (const l of LEASHES) {
      const A = liveBody(l.a)
      const B = liveBody(l.b)
      if (!A || !B) continue
      const pa = A.translation()
      const pb = B.translation()
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const dz = pb.z - pa.z
      const d = Math.hypot(dx, dy, dz)
      const over = d - l.len
      if (over <= 0) continue
      const h = Math.hypot(dx, dz)
      if (h < 1e-3) continue
      const nx = dx / h
      const nz = dz / h
      const ia = A.isDynamic() ? 1 / A.mass() : 0
      const ib = B.isDynamic() ? 1 / B.mass() : 0
      if (ia + ib === 0) continue
      const va = A.linvel()
      const vb = B.linvel()
      const apart = (vb.x - va.x) * nx + (vb.z - va.z) * nz
      const j = Math.min((Math.max(0, apart) + Math.min(over * 0.4, 6) / dt) / (ia + ib), 400 / Math.max(ia, ib)) // (at most 400 mm/s a step on the lighter end)
      if (ia) A.applyImpulse({ x: nx * j, y: 0, z: nz * j }, true)
      if (ib) B.applyImpulse({ x: -nx * j, y: 0, z: -nz * j }, true)
    }
  })
  return null
}

const _q = new Quaternion()
const _c = new Vector3()
const _n = new Vector3()
/** where the camera goes for a piece: its body's pose, a point and a direction in its own frame (real mm) */
function frameOn(id: string, mid: Vector3, dir: Vector3, w: number, h: number) {
  return (pos: Vector3, look: Vector3, aspect: number) => {
    const b = liveBody(id)
    if (!b) return
    const t = b.translation()
    const r = b.rotation()
    _q.set(r.x, r.y, r.z, r.w)
    _c.copy(mid).multiplyScalar(K).applyQuaternion(_q).add(t as Vector3)
    _n.copy(dir).applyQuaternion(_q)
    frameAround(pos, look, aspect, _c, w, h, _n)
  }
}

export function QuadGame({ car }: { car: { current: CarState } }) {
  const c = useCube()
  const tvSpot = useMemo<Spot>(
    () => ({
      key: 'gametv',
      items: [],
      frame: frameOn('gametv', new Vector3(0, TV.screen.y - 120, 0), new Vector3(0, 0.2, 1).normalize(), TV.w * K * 1.3, TV.h * K * 1.75), // (low: the TV up in the frame, the hint under it)
      keys: (e) => {
        if (e.key === 'Enter') padButton('start', 1)
        else if (e.key === 'Backspace') padButton('b', 1)
        else return false
        return true
      },
      hint: 'click the screen or press Enter for START · Backspace for B',
    }),
    [],
  )
  const cubeSpot = useMemo<Spot>(
    () => ({
      key: 'gamecube',
      items: [],
      frame: frameOn('gamecube', new Vector3(0, CUBE.h * 0.7, 12), new Vector3(0, 1.3, 1).normalize(), CUBE.w * K * 2.3, CUBE.h * K * 2.4),
      hint: 'POWER: the light grey button, back left · OPEN: front left · RESET: front right · lid up, click the disc to put it in its case',
    }),
    [],
  )
  if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __game: { tv: () => clickSpot(tvSpot), cube: () => clickSpot(cubeSpot) } }) // (for trying it from the console)
  // pressing POWER (or shutting the lid, it on) at the console: back to the TV to watch it start
  const was = useRef({ power: c.power, lid: c.lid })
  useEffect(() => {
    const w = was.current
    was.current = { power: c.power, lid: c.lid }
    if (getLook()?.spot.key !== 'gamecube') return
    if ((c.power && !w.power) || (c.power && w.lid && !c.lid)) {
      const t = setTimeout(() => getLook()?.spot.key === 'gamecube' && clickSpot(tvSpot), 900)
      return () => clearTimeout(t)
    }
  }, [c.power, c.lid, tvSpot])
  const toTv = (e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), clickSpot(tvSpot))
  const screen = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (getLook()?.spot.key === 'gametv') padButton('start', 1)
    else clickSpot(tvSpot)
  }
  const prompt = useMemo(() => setPrompt('game', 'Reset GameCube', (o) => o.copy(world(0, BENCH.h + TV.h + 300, LAYOUT.tv.z))), [])

  const benchTop = RUG.t + BENCH.h
  return (
    <>
      {/* the rug (it stays put; its top solid, and deep, so nothing's shoved in under it) */}
      <group position={[A.x, LAWN, A.z]} rotation={[0, A.rot, 0]}>
        <group scale={K}>
          <Static>
            <Rug />
          </Static>
        </group>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[S(RUG.w), 20, S(RUG.d)]} position={[0, RUG.t * K - 20, 0]} friction={0.9} />
        </RigidBody>
      </group>

      <Piece car={car} id="bench" home={at(LAYOUT.bench)} lift={60} feelR={S(BENCH.d)} feelPts={[[-0.3 * BENCH.w * K, 0], [0, 0], [0.3 * BENCH.w * K, 0]]} body={
        <>
          <CuboidCollider args={[S(BENCH.w), S(BENCH.top), S(BENCH.d)]} position={[0, (BENCH.h - BENCH.top / 2) * K, 0]} mass={6} friction={0.8} />
          {[-1, 1].map((s) => (
            <CuboidCollider key={s} args={[S(BENCH.side), S(BENCH.h - BENCH.top), S(BENCH.d - 10)]} position={[s * (BENCH.w / 2 - BENCH.side / 2) * K, ((BENCH.h - BENCH.top) / 2) * K, 0]} mass={2} friction={0.8} />
          ))}
          <CuboidCollider args={[S(BENCH.w - 2 * BENCH.side), S(BENCH.shelf.t), S(BENCH.d - 30)]} position={[0, BENCH.shelf.y * K, 0]} mass={2} friction={0.8} />
        </>
      }>
        <Static>
          <Bench />
        </Static>
      </Piece>
      <Piece car={car} id="tv" home={at(LAYOUT.tv, benchTop)} lift={80} feelR={S(TV.w)} feelPts={[[0, -0.25 * TV.d * K]]} body={
        <>
          <CuboidCollider args={[S(TV.w), S(TV.h), S(TV.bezel)]} position={[0, S(TV.h), -S(TV.bezel)]} mass={8} friction={0.7} />
          <CuboidCollider args={[S(TV.w - 110), S(TV.h - 90), S(TV.d - TV.bezel - 20)]} position={[0, 245 * K, -(TV.bezel + (TV.d - TV.bezel - 20) / 2) * K]} mass={12} friction={0.7} />
          <CuboidCollider args={[S(360), S(26), S(300)]} position={[0, 13 * K, -250 * K]} mass={2} friction={0.8} />
        </>
      }>
        <Static>
          <Crt onBody={toTv} onScreen={screen} />
        </Static>
      </Piece>
      <Piece car={car} id="cube" home={at(LAYOUT.cube)} feelR={S(CUBE.w) + 4} body={<CuboidCollider args={[S(CUBE.w), S(CUBE.h), S(CUBE.d)]} position={[0, S(CUBE.h), 0]} mass={CUBE.mass} friction={0.8} />}>
        <Static>
          <GameCube onBody={(e) => (e.stopPropagation(), clickSpot(cubeSpot))} />
        </Static>
      </Piece>
      {LAYOUT.pads.map((p, i) => (
        <Piece key={i} car={car} id={`pad${i + 1}`} home={at(p)} feelR={S(PAD.w) * 0.8} body={<CuboidCollider args={[S(PAD.w), S(48), S(PAD.d)]} position={[0, 24 * K, 0]} mass={PAD.mass} friction={0.8} />}>
          <Static>
            <Controller color={p.color} pad={i + 1} />
          </Static>
        </Piece>
      ))}
      <Piece car={car} id="case" home={at(LAYOUT.case)} feelR={S(CASE.h) * 0.8} body={<CuboidCollider args={[S(CASE.w), S(CASE.t), S(CASE.h)]} position={[0, S(CASE.t), 0]} mass={0.15} friction={0.8} />}>
        <Static>
          <Case />
        </Static>
      </Piece>
      {LAYOUT.cushions.map((p, i) => (
        <Piece key={i} car={car} id={`cushion${i}`} home={at(p)} feelR={S(CUSHION.s)} body={<CuboidCollider args={[S(CUSHION.s * 0.92), S(CUSHION.t), S(CUSHION.s * 0.92)]} position={[0, S(CUSHION.t), 0]} mass={0.6} friction={0.9} />}>
          <Static>
            <Cushion color={p.color} />
          </Static>
        </Piece>
      ))}

      {/* the cables, between wherever their ends are now; the disc between the console and its case */}
      {CABLES.map((cb) => (
        <Cable key={cb.from} {...cb} radius={3 * K} ground={LAWN + RUG.t * K} />
      ))}
      <DiscFlight />
      <Leashes />
      <Prompts items={[prompt]} far={9000} />
    </>
  )
}

