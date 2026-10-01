import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { Euler, Matrix4, Quaternion, Vector3, type Group } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { Basket, CLEAR, CONTENTS, contentAt } from '../picnic/Picnic'
import { Blanket } from '../picnic/Blanket'
import { ClosedBook, OpenBook, OPEN_BOOK } from '../picnic/Books'
import { Flights, type Flight } from '../picnic/Flight'
import { FoodCollider, FoodModel, type Food, type FoodState } from '../picnic/food'
import { nearestGrape } from '../picnic/Grapes'
import { nearestBerry } from '../picnic/Strawberries'
import { feed, tear, throwBread, WHOLE } from '../picnic/feed'
import { Feed } from '../picnic/Toss'
import { Ducks, ducksAt } from '../ducks/Ducks'
import { Sparrows } from '../ducks/Sparrows'
import { Board, BOARD } from '../picnic/Board'
import { FruitBowl, BOWL } from '../picnic/FruitBowl'
import { Lemon, LEMON, Mug, MUG, Pitcher, PITCHER } from '../picnic/Lemonade'
import { Butterflies, Flowers, VASE } from '../picnic/Flowers'
import { LAYOUT } from '../picnic/layout'
import { BASKET, BLANKET, BOOKS } from '../picnic/spec'
import { liveBody, LiveProp, setPrompt } from './Physical'
import { clickSpot, frameAround, useLook, type Spot } from './look'
import { onReset } from './reset'
import { onWalk, SET } from './set'
import type { CarState } from './Car'

/**
 * The picnic on the Quad (../picnic), on the open lawn inside the V: the gingham blanket laid on the grass
 * (it stays put), the willow basket by its near corner, two books stacked, The Little Prince open face up.
 * The basket and the books are loose things (the car knocks them about, you carry them); one prompt,
 * Reset Picnic, puts it all back (and the sandwiches back in the basket).
 *
 *   the basket   click it: the camera goes in and its handles swing down; click what's in it (the wrapped
 *                subs, the grapes, the baguette) and it's lifted out, up over the rim and down onto the
 *                blanket, a toy to carry from there; click a bunch of grapes or the strawberries there to eat one
 *   the baguette out on the blanket: click it and a piece is torn off the end you clicked nearer and thrown
 *                to the ducks (crumbs fall where it tore)
 *   the book     click it: the camera goes in; click its right page to turn it, its left to turn back
 *
 *   the spread   (./Spread, below) the grazing board and the bowl of fruit: click anything on them to eat it;
 *                the lemonade: click the pitcher and it's lifted and poured into the emptier mug, click a
 *                mug to drink some; the lemons roll; the jar of wildflowers has two butterflies about it
 *
 * And a family of mallards (../ducks) about the lawn south of it, who come for the bread; and sparrows down
 * out of the cherries now and then, hopping about the blanket's edge after the crumbs.
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
/** a point in the world, in the blanket's frame (real mm) */
const onCloth = (x: number, z: number, margin = 0) => {
  const dx = x - AT.x
  const dz = z - AT.z
  const lx = (dx * c - dz * s) / K
  const lz = (dx * s + dz * c) / K
  return Math.abs(lx) < BLANKET.w / 2 + margin && Math.abs(lz) < BLANKET.l / 2 + margin
}
const PAVING = 25
/** the ground's height: the blanket's top, the walks' bricks, the lawn */
const ground = (x: number, z: number) => (onCloth(x, z) ? LAWN + LAYOUT.y * K : onWalk(x, z) ? PAVING : LAWN)
/** the ducks' home: the lawn south of the picnic, inside the V */
const DUCK_HOME = { x: -1000, z: 760, r: 400 }
/** the sparrows: up in the nearer cherries, down round the blanket */
const SPARROW_PERCHES = [1, 2, 3].map((i) => new Vector3(SET.trees[i].x, 760, SET.trees[i].z))
const SPARROW_NEAR = { x: AT.x, z: AT.z, r: 480, inner: 330 }
/** what they walk round: the trunks, and what's on the blanket */
const DUCK_AVOID = [
  ...SET.trees.map((t) => ({ x: t.x, z: t.z, r: 120 })),
  { ...place(LAYOUT.basket.x, 0, LAYOUT.basket.z), r: 0.55 * BASKET.l * K },
  { ...place(LAYOUT.stack[0].x, 0, LAYOUT.stack[0].z), r: 0.55 * BOOKS[1].h * K },
  { ...place(LAYOUT.open.x, 0, LAYOUT.open.z), r: 0.5 * OPEN_BOOK.w * K },
  { ...place(LAYOUT.board.x, 0, LAYOUT.board.z), r: BOARD.r * K },
  { ...place(LAYOUT.bowl.x, 0, LAYOUT.bowl.z), r: BOWL.r * K },
  { ...place(LAYOUT.pitcher.x, 0, LAYOUT.pitcher.z), r: PITCHER.r * K * 1.3 },
  ...LAYOUT.mugs.map((m) => ({ ...place(m.x, 0, m.z), r: MUG.r * K * 1.3 })),
  { ...place(LAYOUT.flowers.x, 0, LAYOUT.flowers.z), r: VASE.r * K * 2 },
].map((p) => ({ x: p.x, z: p.z, r: p.r }))
/** the close looks: down into the basket from over its front, its handles either side; down on the open book */
const BASKET_ROT = AT.rot + LAYOUT.basket.rot
const BASKET_LOOK = new Vector3(0.18 * Math.cos(BASKET_ROT) + 0.85 * Math.sin(BASKET_ROT), 1.7, -0.18 * Math.sin(BASKET_ROT) + 0.85 * Math.cos(BASKET_ROT)).normalize()
const BOOK_ROT = AT.rot + LAYOUT.open.rot
const BOOK_LOOK = new Vector3(0.12 * Math.cos(BOOK_ROT) + 0.55 * Math.sin(BOOK_ROT), 1.6, -0.12 * Math.sin(BOOK_ROT) + 0.55 * Math.cos(BOOK_ROT)).normalize()

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
      frame: (pos, at, aspect) => frameAround(pos, at, aspect, place(LAYOUT.basket.x, 140, LAYOUT.basket.z), 185, 135, BASKET_LOOK),
      hint: 'click something to lift it out',
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

  // ---- what's in the basket: in it, on its way out, or out (toys on the blanket); and what's been eaten
  const [present, setPresent] = useState(() => CONTENTS.map(() => true))
  const [flights, setFlights] = useState<Flight[]>([])
  const [taken, setTaken] = useState<{ id: number; food: Food; p: [number, number, number]; r: [number, number, number] }[]>([])
  const [food, setFood] = useState<Record<string, FoodState>>({})
  const tears = useRef(0)
  const held = useRef<Record<number, Group | null>>({})
  const eat = (f: Food, e: ThreeEvent<MouseEvent>) => {
    if (f.kind === 'baguette') {
      // torn: a piece off the nearer end, thrown to the ducks
      e.stopPropagation()
      const st = food[f.key]
      const lo = st?.lo ?? WHOLE.lo
      const hi = st?.hi ?? WHOLE.hi
      const o = e.eventObject
      o.updateWorldMatrix(true, false)
      const n = tears.current++
      const t = tear(lo, hi, o.worldToLocal(e.point.clone()).x, n)
      throwBread({ from: o.matrixWorld.clone(), a: t.a, b: t.b, fromLo: t.fromLo, scale: K, ducks: ducksAt(), ground, onBlanket: (x, z) => onCloth(x, z, 60), n })
      setFood((all) => ({ ...all, [f.key]: t.left ?? { lo: 0, hi: 0 } }))
      if (!t.left) setTaken((all) => all.filter((x) => x.food.key !== f.key))
      return
    }
    if (f.kind !== 'grapes' && f.kind !== 'strawberries') return
    e.stopPropagation()
    const local = e.eventObject.worldToLocal(e.point.clone())
    setFood((all) => {
      const eaten = new Set(all[f.key]?.eaten)
      const i = f.kind === 'grapes' ? nearestGrape(f.v as 0 | 1, local, eaten) : nearestBerry(local, eaten)
      if (i < 0) return all
      eaten.add(i)
      return { ...all, [f.key]: { ...all[f.key], eaten } }
    })
  }
  const next = useRef(1)
  const basketModel = useRef<Group>(null)
  const take = (k: number) => {
    const g = basketModel.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    const from = g.matrixWorld.clone().multiply(contentAt(k))
    const [x, z, r] = LAYOUT.landing[k]
    const to = new Matrix4().compose(place(x, LAYOUT.y + 2, z), new Quaternion().setFromAxisAngle(up, AT.rot + r), new Vector3(K, K, K))
    setPresent((p) => p.map((v, i) => (i === k ? false : v)))
    const clear = g.localToWorld(new Vector3(0, CLEAR + CONTENTS[k].below, 0)).y
    setFlights((f) => [...f, { id: next.current++, food: CONTENTS[k], state: food[CONTENTS[k].key], from, to, clear }])
  }
  const land = (f: Flight) => {
    const p = new Vector3()
    const q = new Quaternion()
    f.to.decompose(p, q, new Vector3())
    setFlights((all) => all.filter((x) => x.id !== f.id))
    setTaken((t) => [...t, { id: f.id, food: f.food, p: [p.x, p.y, p.z], r: new Euler().setFromQuaternion(q).toArray().slice(0, 3) as [number, number, number] }])
  }
  const refill = () => {
    spreadReset.forEach((f) => f())
    setPresent(CONTENTS.map(() => true))
    setFlights([])
    setTaken([])
    setFood({})
    feed.clear()
    tears.current = 0
  }
  useEffect(() => onReset(refill), [])
  const base = useMemo(() => setPrompt('picnic', 'Reset Picnic', (o) => o.copy(place(-360, 900, -500))), [])
  const outRef = useRef(0)
  outRef.current = taken.length + flights.length + present.filter((v) => !v).length + Object.keys(food).length
  const prompt: PromptItem = useMemo(
    () => ({
      ...base,
      when: () => base.when() || outRef.current > 0 || spreadTouched.current,
      run: () => {
        base.run()
        refill()
      },
    }),
    [base],
  )
  if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __picnic: { open: () => clickSpot(spot), read: () => clickSpot(bookSpot), take, tear: (x: number) => { const t = taken.find((t) => t.food.kind === 'baguette'); const o = t && held.current[t.id]; if (t && o) eat(t.food, { stopPropagation() {}, eventObject: o, point: o.localToWorld(new Vector3(x, 26, 0)) } as unknown as ThreeEvent<MouseEvent>) } } }) // (for trying it from the console)

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
          <Basket open={open} present={present} state={food} onClick={zoom} onTake={(k, e) => (e.stopPropagation(), take(k))} />
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
      {/* what's lifted out, and what's out on the blanket (toys) */}
      <Flights flights={flights} onLand={land} />
      {taken.map((t) => (
        <Holdable key={t.id} position={t.p} rotation={t.r} colliders={false} linearDamping={0.4} angularDamping={0.7} sound="none">
          <group ref={(o) => void (held.current[t.id] = o)} scale={K} onClick={(e) => eat(t.food, e)}>
            <FoodModel f={t.food} state={food[t.food.key]} />
          </group>
          <FoodCollider f={t.food} state={food[t.food.key]} k={K} />
        </Holdable>
      ))}
      <Spread car={car} />
      {/* the bread thrown, and the ducks */}
      <Feed scale={K} />
      <Ducks scale={K} home={DUCK_HOME} ground={ground} avoid={() => DUCK_AVOID} offLimits={(x, z) => onCloth(x, z, 120) || onWalk(x, z, 30)} threat={() => ({ x: car.current.x, z: car.current.z, speed: Math.abs(car.current.v) })} />
      <Sparrows scale={K} perches={SPARROW_PERCHES} near={SPARROW_NEAR} ground={ground} threat={() => ({ x: car.current.x, z: car.current.z, speed: Math.abs(car.current.v) })} />
      <Prompts items={[prompt]} far={9000} />
    </>
  )
}

// ---- the spread on the blanket
const spreadReset = new Set<() => void>()
const spreadTouched = { current: false }
const MUG_START = [0.8, 0.45]
/** the pitcher's spout, in its own frame (real mm) */
const SPOUT = new Vector3(-PITCHER.neck + 4, PITCHER.h + PITCHER.band + 6, 0)
const _v = new Vector3()
const _q = new Quaternion()
function Spread({ car }: { car: { current: CarState } }) {
  const [eaten, setEaten] = useState<Record<string, Set<number>>>({})
  const levels = useMemo(() => MUG_START.map((l) => ({ current: l })), [])
  const want = useMemo(() => MUG_START.map((l) => ({ current: l })), [])
  // the pitcher, up and pouring: where it's held (world), into which mug, how far through
  const pose = useRef<{ p: Vector3; q: Quaternion } | null>(null)
  const pour = useRef<{ mug: number; t: number } | null>(null)
  const stream = useRef<Group>(null)
  useEffect(() => {
    const reset = () => {
      setEaten({})
      MUG_START.forEach((l, i) => ((levels[i].current = l), (want[i].current = l)))
      pose.current = null
      pour.current = null
      spreadTouched.current = false
    }
    spreadReset.add(reset)
    return () => void spreadReset.delete(reset)
  }, [levels, want])
  const eat = (key: string) => (i: number) => {
    spreadTouched.current = true
    setEaten((all) => ({ ...all, [key]: new Set([...(all[key] ?? []), i]) }))
  }
  const pourOut = () => {
    if (pour.current) return
    const mug = levels[0].current <= levels[1].current ? 0 : 1
    if (levels[mug].current > 0.85) return
    pour.current = { mug, t: 0 }
    spreadTouched.current = true
  }
  const sip = (i: number) => {
    want[i].current = Math.max(0, want[i].current - 0.25)
    spreadTouched.current = true
  }
  useFrame((_, raw) => {
    const dt = Math.max(0, Math.min(0.05, raw))
    // the mugs' lemonade going down as it's drunk (and up as it's poured)
    levels.forEach((l, i) => (l.current += (want[i].current - l.current) * Math.min(1, dt * 3)))
    const P = pour.current
    const s = stream.current
    if (!P) {
      if (s) s.visible = false
      return
    }
    P.t += dt
    const mb = liveBody('picnicmug' + P.mug)
    const pb = liveBody('picnicpitcher')
    if (!mb || !pb) return (pour.current = null)
    // held over the mug from the side it's on, tipped toward it, its spout over the mug's mouth
    const m = mb.translation()
    const pp = pb.translation()
    const d = _v.set(m.x - pp.x, 0, m.z - pp.z)
    if (P.t < 0.05 || !pose.current) {
      if (d.lengthSq() < 1e-6) d.set(1, 0, 0)
      d.normalize()
      const yaw = Math.atan2(d.z, -d.x)
      const q = new Quaternion().setFromAxisAngle(up, yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1.05))
      const spout = SPOUT.clone().multiplyScalar(K).applyQuaternion(q)
      const p = new Vector3(m.x, m.y + (MUG.h + 34) * K, m.z).sub(spout)
      pose.current = { p, q }
    }
    // pouring once it's there: the stream from its spout down into the mug, the mug filling
    const pouring = P.t > 0.7 && P.t < 2.3
    if (pouring) want[P.mug].current = Math.min(0.92, want[P.mug].current + dt * 0.45)
    if (s) {
      s.visible = pouring
      if (pouring) {
        const r = pb.rotation()
        const top = SPOUT.clone().multiplyScalar(K).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(new Vector3(pp.x, pp.y, pp.z))
        const bottom = new Vector3(m.x, m.y + (8 + levels[P.mug].current * MUG.h * 0.72) * K, m.z)
        s.position.copy(top).lerp(bottom, 0.5)
        s.scale.set(1, Math.max(0.1, top.distanceTo(bottom)), 1)
        s.quaternion.setFromUnitVectors(up, top.clone().sub(bottom).normalize())
      }
    }
    if (P.t > 2.6) {
      pose.current = null
      pour.current = null
    }
  })
  const pointer = (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))
  const unpointer = () => (document.body.style.cursor = '')
  const at = (p: { x: number; z: number; rot: number }, lift = 0) => home(p.x, LAYOUT.y + lift, p.z, p.rot)
  if (import.meta.env.DEV) Object.assign(window, { __spread: { pour: pourOut, sip, eat: (k: string, i: number) => eat(k)(i) } }) // (for trying it from the console)
  return (
    <>
      <LiveProp id="picnicboard" label="" set="picnic" at={at(LAYOUT.board)} car={car} lift={0} feelAlong={[-0.5 * BOARD.r * K, 0.5 * BOARD.r * K]} feelR={BOARD.r * K * 0.6}>
        <group scale={K}>
          <Board eaten={eaten.board} onEat={eat('board')} />
        </group>
        <CylinderCollider args={[(BOARD.t / 2) * K, BOARD.r * K]} position={[0, (BOARD.t / 2) * K, 0]} mass={0.3} friction={0.9} />
      </LiveProp>
      <LiveProp id="picnicbowl" label="" set="picnic" at={at(LAYOUT.bowl)} car={car} lift={0} feelR={BOWL.r * K}>
        <group scale={K}>
          <FruitBowl eaten={eaten.bowl} onEat={eat('bowl')} />
        </group>
        <CylinderCollider args={[(BOWL.h / 2) * K, BOWL.r * K]} position={[0, (BOWL.h / 2) * K, 0]} mass={0.2} friction={0.9} />
      </LiveProp>
      <LiveProp id="picnicpitcher" label="" set="picnic" at={at(LAYOUT.pitcher)} car={car} lift={0} feelR={PITCHER.r * K} pose={pose}>
        <group scale={K} onClick={(e) => (e.stopPropagation(), pourOut())} onPointerOver={pointer} onPointerOut={unpointer}>
          <Pitcher />
        </group>
        <CylinderCollider args={[((PITCHER.h + PITCHER.band) / 2) * K, PITCHER.r * K]} position={[0, ((PITCHER.h + PITCHER.band) / 2) * K, 0]} mass={0.5} friction={0.8} />
      </LiveProp>
      {LAYOUT.mugs.map((m, i) => (
        <LiveProp key={i} id={`picnicmug${i}`} label="" set="picnic" at={at(m)} car={car} lift={0} feelR={MUG.r * K}>
          <group scale={K} onClick={(e) => (e.stopPropagation(), sip(i))} onPointerOver={pointer} onPointerOut={unpointer}>
            <Mug level={levels[i]} />
          </group>
          <CylinderCollider args={[(MUG.h / 2) * K, MUG.r * K]} position={[0, (MUG.h / 2) * K, 0]} mass={0.15} friction={0.8} />
        </LiveProp>
      ))}
      {LAYOUT.lemons.map((m, i) => (
        <LiveProp key={i} id={`picniclemon${i}`} label="" set="picnic" at={at(m)} car={car} lift={0} feelR={(LEMON.l / 2) * K}>
          <group scale={K}>
            <Lemon />
          </group>
          <BallCollider args={[(LEMON.w / 2) * K]} position={[0, (LEMON.w / 2) * K, 0]} mass={0.05} friction={0.6} />
        </LiveProp>
      ))}
      <LiveProp id="picnicflowers" label="" set="picnic" at={at(LAYOUT.flowers)} car={car} lift={0} feelR={VASE.r * K * 1.5}>
        <group scale={K}>
          <Flowers />
        </group>
        <CylinderCollider args={[(VASE.h / 2) * K, VASE.r * K]} position={[0, (VASE.h / 2) * K, 0]} mass={0.1} friction={0.8} />
      </LiveProp>
      <Butterflies
        at={() => {
          const b = liveBody('picnicflowers')
          if (!b) return null
          const t = b.translation()
          return new Vector3(t.x, t.y, t.z)
        }}
        scale={K}
      />
      {/* the lemonade poured, a thin stream from the spout */}
      <group ref={stream} visible={false}>
        <mesh>
          <cylinderGeometry args={[0.9, 0.7, 1, 8]} />
          <meshBasicMaterial color="#f6e7a4" transparent opacity={0.85} />
        </mesh>
      </group>
    </>
  )
}
