import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Euler, Matrix4, Quaternion, Vector3, type Group } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { Basket, CLEAR, sandwichInBasket, SANDWICH_AT } from '../picnic/Picnic'
import { Blanket } from '../picnic/Blanket'
import { ClosedBook, OpenBook, OPEN_BOOK } from '../picnic/Books'
import { Flights, type Flight } from '../picnic/Flight'
import { Sandwich, SANDWICH_T } from '../picnic/Sandwich'
import { LAYOUT } from '../picnic/layout'
import { BASKET, BLANKET, BOOKS } from '../picnic/spec'
import { LiveProp, setPrompt } from './Physical'
import { clickSpot, frameAround, useLook, type Spot } from './look'
import { onReset } from './reset'
import { SET } from './set'
import type { CarState } from './Car'

/**
 * The picnic on the Quad (../picnic), on the open lawn inside the V: the gingham blanket laid on the grass
 * (it stays put), the willow basket by its near corner, two books stacked, The Little Prince open face up.
 * The basket and the books are loose things (the car knocks them about, you carry them); one prompt,
 * Reset Picnic, puts it all back (and the sandwiches back in the basket).
 *
 *   the basket   click it: the camera goes in and its lids lift; click a sandwich and it's lifted out, up
 *                over the rim and down onto the blanket, a toy to carry from there (four of them)
 *   the book     click it: the camera goes in; click its right page to turn it, its left to turn back
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
const up = new Vector3(0, 1, 0)
/** the close looks: down into the basket from over its end, between its two lids stood up; down on the open book */
const BASKET_ROT = AT.rot + LAYOUT.basket.rot
const BASKET_LOOK = new Vector3(0.8 * Math.cos(BASKET_ROT) + 0.55 * Math.sin(BASKET_ROT), 1.7, -0.8 * Math.sin(BASKET_ROT) + 0.55 * Math.cos(BASKET_ROT)).normalize()
const BOOK_ROT = AT.rot + LAYOUT.open.rot
const BOOK_LOOK = new Vector3(0.12 * Math.cos(BOOK_ROT) + 0.55 * Math.sin(BOOK_ROT), 1.6, -0.12 * Math.sin(BOOK_ROT) + 0.55 * Math.cos(BOOK_ROT)).normalize()
/** a sandwich lying flat, its collider (real mm, its frame: the cut along x, the rest toward -z) */
const SANDWICH_BOX = { half: [71, SANDWICH_T / 2, 36] as [number, number, number], at: [0, SANDWICH_T / 2, -34] as [number, number, number] }

export function QuadPicnic({ car }: { car: { current: CarState } }) {
  const look = useLook()
  const looking = look?.spot.key === 'picnic'
  const reading = look?.spot.key === 'picnicbook'
  const open = useRef(0)
  useFrame((_, dt) => {
    open.current += ((looking ? 1 : 0) - open.current) * Math.min(1, dt * 5)
  })
  const spot = useMemo<Spot>(
    () => ({
      key: 'picnic',
      items: [],
      frame: (pos, at, aspect) => frameAround(pos, at, aspect, place(LAYOUT.basket.x, 150, LAYOUT.basket.z), 210, 150, BASKET_LOOK),
      hint: 'click a sandwich to lift it out',
    }),
    [],
  )
  const bookSpot = useMemo<Spot>(
    () => ({
      key: 'picnicbook',
      items: [],
      frame: (pos, at, aspect) => frameAround(pos, at, aspect, place(LAYOUT.open.x, 10, LAYOUT.open.z), OPEN_BOOK.w * K * 1.15, OPEN_BOOK.h * K * 1.2, BOOK_LOOK),
      hint: 'click the right page to turn it · the left to turn back',
    }),
    [],
  )
  const zoom = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!looking) clickSpot(spot)
  }
  const zoomBook = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!reading) clickSpot(bookSpot)
  }

  // ---- the sandwiches: in the basket, on their way out, or out (toys on the blanket)
  const [present, setPresent] = useState([true, true, true, true])
  const [flights, setFlights] = useState<Flight[]>([])
  const [taken, setTaken] = useState<{ id: number; half: 0 | 1; p: [number, number, number]; r: [number, number, number] }[]>([])
  const next = useRef(1)
  const basketModel = useRef<Group>(null)
  const take = (k: number) => {
    const g = basketModel.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    const from = g.matrixWorld.clone().multiply(sandwichInBasket(k))
    const [x, z, r] = LAYOUT.landing[k]
    const to = new Matrix4().compose(place(x, LAYOUT.y + 2, z), new Quaternion().setFromAxisAngle(up, AT.rot + r), new Vector3(K, K, K))
    setPresent((p) => p.map((v, i) => (i === k ? false : v)))
    const clear = g.localToWorld(new Vector3(0, CLEAR, 0)).y
    setFlights((f) => [...f, { id: next.current++, half: SANDWICH_AT[k][4], from, to, clear }])
  }
  const land = (f: Flight) => {
    const p = new Vector3()
    const q = new Quaternion()
    f.to.decompose(p, q, new Vector3())
    setFlights((all) => all.filter((x) => x.id !== f.id))
    setTaken((t) => [...t, { id: f.id, half: f.half, p: [p.x, p.y, p.z], r: new Euler().setFromQuaternion(q).toArray().slice(0, 3) as [number, number, number] }])
  }
  const refill = () => {
    setPresent([true, true, true, true])
    setFlights([])
    setTaken([])
  }
  useEffect(() => onReset(refill), [])
  const base = useMemo(() => setPrompt('picnic', 'Reset Picnic', (o) => o.copy(place(-360, 900, -500))), [])
  const outRef = useRef(0)
  outRef.current = taken.length + flights.length + present.filter((v) => !v).length
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
  if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __picnic: { open: () => clickSpot(spot), read: () => clickSpot(bookSpot), take } }) // (for trying it from the console)

  const { l, d, h } = BASKET
  const pointer = (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))
  const unpointer = () => (document.body.style.cursor = '')
  return (
    <>
      {/* the blanket, laid on the grass (it stays put) */}
      <group position={[AT.x, LAWN, AT.z]} rotation={[0, AT.rot, 0]} scale={K}>
        <Blanket />
      </group>
      {/* (its top, solid: what's set down on it rests on the cloth, not down in it on the grass) */}
      <RigidBody type="fixed" colliders={false} position={[AT.x, LAWN, AT.z]} rotation={[0, AT.rot, 0]}>
        <CuboidCollider args={[(BLANKET.w / 2) * K, 1, (BLANKET.l / 2) * K]} position={[0, LAYOUT.y * K - 1, 0]} friction={0.9} />
      </RigidBody>
      {/* the basket: click it to go in and lift its lids */}
      <LiveProp id="picnicbasket" label="" set="picnic" at={home(LAYOUT.basket.x, LAYOUT.y, LAYOUT.basket.z, LAYOUT.basket.rot)} car={car} lift={0} feelAlong={[-0.25 * l * K, 0.25 * l * K]} feelR={(d / 2) * K}>
        <group ref={basketModel} scale={K} onPointerOver={pointer} onPointerOut={unpointer}>
          <Basket open={open} present={present} onClick={zoom} onSandwich={(k, e) => (e.stopPropagation(), take(k))} />
        </group>
        <CuboidCollider args={[(l / 2) * K, (h / 2) * K, (d / 2) * K]} position={[0, (h / 2) * K, 0]} mass={0.5} friction={0.8} />
      </LiveProp>
      {/* two books stacked; the little one open: click it to go in and read */}
      {LAYOUT.stack.map((b) => (
        <LiveProp key={b.k} id={`picnicbook${b.k}`} label="" set="picnic" at={home(b.x, LAYOUT.y + b.y, b.z, b.rot)} car={car} lift={0} feelAlong={[0]} feelR={(BOOKS[b.k].h / 2) * K}>
          <group scale={K}>
            <ClosedBook k={b.k} />
          </group>
          <CuboidCollider args={[(BOOKS[b.k].w / 2) * K, (BOOKS[b.k].t / 2) * K, (BOOKS[b.k].h / 2) * K]} position={[0, (BOOKS[b.k].t / 2) * K, 0]} mass={0.1} friction={0.9} />
        </LiveProp>
      ))}
      <LiveProp id="picnicbookopen" label="" set="picnic" at={home(LAYOUT.open.x, LAYOUT.y, LAYOUT.open.z, LAYOUT.open.rot)} car={car} lift={0} feelAlong={[-0.25 * OPEN_BOOK.w * K, 0.25 * OPEN_BOOK.w * K]} feelR={(OPEN_BOOK.h / 2) * K}>
        <group scale={K} onClick={zoomBook} onPointerOver={pointer} onPointerOut={unpointer}>
          <OpenBook active={reading} />
        </group>
        <CuboidCollider args={[(OPEN_BOOK.w / 2) * K, (OPEN_BOOK.t / 2) * K, (OPEN_BOOK.h / 2) * K]} position={[0, (OPEN_BOOK.t / 2) * K, 0]} mass={0.1} friction={0.9} />
      </LiveProp>
      {/* the sandwiches lifted out, and those out on the blanket (toys) */}
      <Flights flights={flights} onLand={land} />
      {taken.map((t) => (
        <Holdable key={t.id} position={t.p} rotation={t.r} colliders={false} linearDamping={0.4} angularDamping={0.7} sound="none">
          <group scale={K}>
            <Sandwich half={t.half} />
          </group>
          <CuboidCollider args={[SANDWICH_BOX.half[0] * K, SANDWICH_BOX.half[1] * K, SANDWICH_BOX.half[2] * K]} position={[SANDWICH_BOX.at[0] * K, SANDWICH_BOX.at[1] * K, SANDWICH_BOX.at[2] * K]} mass={0.03} friction={0.9} />
        </Holdable>
      ))}
      <Prompts items={[prompt]} far={9000} />
    </>
  )
}
