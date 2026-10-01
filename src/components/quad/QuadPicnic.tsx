import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { Euler, Vector3, type Group } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { Basket, Blanket, Book, Sandwich, SANDWICH_AT, SANDWICH_H, TentedBook } from '../picnic/Picnic'
import { LAYOUT } from '../picnic/layout'
import { BASKET, BOOKS, SANDWICH } from '../picnic/spec'
import { LiveProp, setPrompt } from './Physical'
import { clickSpot, frameAround, useLook, type Spot } from './look'
import { onReset } from './reset'
import { SET } from './set'
import type { CarState } from './Car'

/**
 * The picnic on the Quad (../picnic), on the open lawn inside the V: the gingham blanket laid on the grass
 * (it stays put), the willow basket by its near corner, two books stacked, the little one open face down.
 * The basket and the books are loose things (the car knocks them about, you carry them); one prompt,
 * Reset Picnic, puts it all back (and the sandwiches back in the basket).
 *
 *   the basket   click it: the camera goes in to the picnic and its lids lift; click a sandwich and it's
 *                out, tossed onto the blanket, a toy to carry (four of them)
 *
 * At the benches' toy scale, 0.24.
 */
const K = 0.24
const LAWN = 4
const AT = SET.picnic
const c = Math.cos(AT.rot)
const s = Math.sin(AT.rot)
/** a point on the blanket (real mm, its frame) in the world */
const place = (x: number, y: number, z: number) => new Vector3(AT.x + (x * c + z * s) * K, LAWN + y * K, AT.z + (-x * s + z * c) * K)
const home = (x: number, y: number, z: number, rot: number) => {
  const p = place(x, y, z)
  return { x: p.x, y: p.y, z: p.z, rot: AT.rot + rot }
}
/** the close look: down into the basket from over its end, between its two lids stood up */
const BASKET_ROT = AT.rot + LAYOUT.basket.rot
const LOOK_DIR = new Vector3(0.8 * Math.cos(BASKET_ROT) + 0.55 * Math.sin(BASKET_ROT), 1.7, -0.8 * Math.sin(BASKET_ROT) + 0.55 * Math.cos(BASKET_ROT)).normalize()

export function QuadPicnic({ car }: { car: { current: CarState } }) {
  const look = useLook()
  const looking = look?.spot.key === 'picnic'
  const open = useRef(0)
  useFrame((_, dt) => {
    open.current += ((looking ? 1 : 0) - open.current) * Math.min(1, dt * 5)
  })
  const spot = useMemo<Spot>(
    () => ({
      key: 'picnic',
      items: [],
      frame: (pos, at, aspect) => frameAround(pos, at, aspect, place(LAYOUT.basket.x, 150, LAYOUT.basket.z), 210, 150, LOOK_DIR),
      hint: 'click a sandwich to take one out',
    }),
    [],
  )
  const zoom = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!looking) clickSpot(spot)
  }

  // ---- the sandwiches taken out: toys on the blanket (back in the basket on a reset)
  const [left, setLeft] = useState(SANDWICH.n)
  const [taken, setTaken] = useState<{ id: number; p: [number, number, number]; v: [number, number, number]; q: [number, number, number] }[]>([])
  const next = useRef(1)
  const basketModel = useRef<Group>(null)
  const take = (k: number) => {
    const g = basketModel.current
    if (!g) return
    const [x, , z] = SANDWICH_AT[k]
    const p = new Vector3(x, BASKET.wall + SANDWICH_H + 30, z)
    g.updateWorldMatrix(true, false)
    p.applyMatrix4(g.matrixWorld)
    // (tossed out over the basket's side, onto the blanket in front)
    const out = new Vector3(0, 0, z > 0 ? 1 : -1).transformDirection(g.matrixWorld)
    setTaken((t) => [...t, { id: next.current++, p: [p.x, p.y + 6, p.z], v: [out.x * 160, 260, out.z * 160], q: [Math.random() - 0.5, Math.random() * 6, Math.random() - 0.5] }])
    setLeft((n) => n - 1)
  }
  const refill = () => {
    setLeft(SANDWICH.n)
    setTaken([])
  }
  useEffect(() => onReset(refill), [])
  const base = useMemo(() => setPrompt('picnic', 'Reset Picnic', (o) => o.copy(place(-360, 900, -500))), [])
  const outRef = useRef(0)
  outRef.current = taken.length
  const prompt: PromptItem = useMemo(
    () => ({
      ...base,
      when: () => base.when() || outRef.current > 0,
      run: () => {
        base.run()
        refill()
      },
    }),
    [base],
  )

  if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __picnic: { open: () => clickSpot(spot), take } }) // (for trying it from the console)
  const { l, d, h } = BASKET
  return (
    <>
      {/* the blanket, laid on the grass (it stays put) */}
      <group position={[AT.x, LAWN, AT.z]} rotation={[0, AT.rot, 0]} scale={K}>
        <Blanket />
      </group>
      {/* the basket: click it to go in and lift its lids */}
      <LiveProp id="picnicbasket" label="" set="picnic" at={home(LAYOUT.basket.x, LAYOUT.y, LAYOUT.basket.z, LAYOUT.basket.rot)} car={car} lift={0} feelAlong={[-0.25 * l * K, 0.25 * l * K]} feelR={(d / 2) * K}>
        <group
          ref={basketModel}
          scale={K}
          onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <Basket open={open} left={left} onClick={zoom} onSandwich={(k, e) => (e.stopPropagation(), take(k))} />
        </group>
        <CuboidCollider args={[(l / 2) * K, (h / 2) * K, (d / 2) * K]} position={[0, (h / 2) * K, 0]} mass={0.5} friction={0.8} />
      </LiveProp>
      {/* two books stacked, the little one open face down */}
      {LAYOUT.stack.map((b) => (
        <LiveProp key={b.k} id={`picnicbook${b.k}`} label="" set="picnic" at={home(b.x, LAYOUT.y + b.y, b.z, b.rot)} car={car} lift={0} feelAlong={[0]} feelR={(BOOKS[b.k].h / 2) * K}>
          <group scale={K}>
            <Book k={b.k} />
          </group>
          <CuboidCollider args={[(BOOKS[b.k].w / 2) * K, (BOOKS[b.k].t / 2) * K, (BOOKS[b.k].h / 2) * K]} position={[0, (BOOKS[b.k].t / 2) * K, 0]} mass={0.1} friction={0.9} />
        </LiveProp>
      ))}
      <LiveProp id="picnicbookopen" label="" set="picnic" at={home(LAYOUT.open.x, LAYOUT.y, LAYOUT.open.z, LAYOUT.open.rot)} car={car} lift={0} feelAlong={[0]} feelR={(BOOKS[2].w * 0.9) * K}>
        <group scale={K}>
          <TentedBook k={LAYOUT.open.k} />
        </group>
        <CuboidCollider args={[BOOKS[2].w * 0.92 * K, 22 * K, (BOOKS[2].h / 2) * K]} position={[0, 22 * K, 0]} mass={0.08} friction={0.9} />
      </LiveProp>
      {/* the sandwiches taken out */}
      {taken.map((t) => (
        <Holdable key={t.id} position={t.p} rotation={new Euler(...t.q).toArray().slice(0, 3) as [number, number, number]} linearVelocity={t.v} colliders={false} linearDamping={0.4} angularDamping={0.7} sound="none">
          <group scale={K}>
            <Sandwich />
          </group>
          <CuboidCollider args={[SANDWICH_H * 0.75 * K, (SANDWICH_H / 2) * K, ((SANDWICH.bread * 2 + SANDWICH.filling) / 2) * K]} position={[0, (SANDWICH_H / 2) * K, 0]} mass={0.03} friction={0.9} />
        </Holdable>
      ))}
      <Prompts items={[prompt]} far={9000} />
    </>
  )
}
