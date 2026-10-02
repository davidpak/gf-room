import { useEffect, useMemo } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { Quaternion, Vector3 } from 'three'
import { Static } from '../../lib/render/Static'
import { Prompts } from '../prompt/Prompts'
import { getBrowse, openCrate, setBrowseParent, takeOut } from '../records/browse'
import { Crate } from '../records/Crate'
import { VinylWarm } from '../records/Record'
import { LABEL } from '../records/library'
import { askDig } from '../records/Overlay'
import { playOn } from '../records/putOn'
import { CRATE, STAND, shelfTop } from '../records/rack'
import { useFillCrates, useShelf } from '../records/shelf'
import { Stand } from '../records/Stand'
import { Turntable } from '../records/Turntable'
import { EW, platterTop } from '../records/victrola'
import type { Pressing } from '../records/vinyl'
import { LiveProp, liveBody, setPrompt } from './Physical'
import { clickSpot, frameAround, getLook, lookAt, type Spot } from './look'
import { AFrame } from './CookieStand'
import { Bunting, CANOPY, PicksRack, RACK, RUG, VinylStrings, VinylWall, MusicCanopy, MusicRug, NowPlayingEasel, Notes, useSpinningFace } from './MusicDecor'
import { Basket, CoffeeTable, DIGBOX, DigBox, Plant, Pouf, Stock, Succulent, TABLE } from './MusicCorner'
import { SpeakerOnStand } from '../speaker/Speaker'
import { L100 } from '../speaker/spec'
import { SET } from './set'
import type { CarState } from './Car'

/**
 * The record stand on the Quad (../records), on the big lawn west of the cookie stand: the Victrola on top, her
 * saved albums in the crate beside it, the Dig box; under a striped canopy, on a braided rug, between two tall
 * speakers, a listening corner out front (./MusicCorner). At the GameCube's toy scale (0.24). The stand, the player
 * and the furniture loose like everything (the car shoves them); the crate part of the stand.
 *
 *   the stand    click any of it: the camera takes in the whole stand (its canopy, its sign, its easel); from there:
 *   the player   click it: the camera comes down over it, its buttons, arm and knobs to hand (../records/Turntable)
 *   the crate    click it: the camera comes in over it; A / D flip through, Enter takes one out; click a record out
 *                of its jacket: it goes on the player and plays, the camera over the player
 *   the Dig box  click it: write what to dig for (an artist, an album, a song); what's found fills the crate in place
 *                of hers (or "more by" from a record taken out), till "back to her records"
 *   Esc          back a step: from a record to the crate, from the crate or the player to the stand, then the car
 *   R            all of it back as it was (or its prompt, when anything's out of place)
 * Dressed like the cookie stand (./MusicDecor): a striped canopy with string lights and its name on a plank, a
 * braided rug, a chalkboard out front saying what's spinning, an easel with the playing record's jacket on it.
 */
const K = 0.24
const DEV = import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev'))
const LAWN = 4
const A = SET.music
const cos = Math.cos(A.rot)
const sin = Math.sin(A.rot)
/** the stand's own frame (real mm, its middle at its origin) to the Quad's */
const world = (lx: number, ly: number, lz: number) => new Vector3(A.x + (lx * cos + lz * sin) * K, LAWN + ly * K, A.z + (-lx * sin + lz * cos) * K)
const S = (r: number) => (r * K) / 2

const _q = new Quaternion()
const _c = new Vector3()
const _n = new Vector3()

/** the chalkboard out front, saying what's spinning (its face kept up to date) */
function SpinningSign() {
  const face = useSpinningFace()
  return <AFrame w={SIGN.w} len={SIGN.len} lean={SIGN.lean} face={face} />
}
// (spread round the stand: the picks rack off its left end, the easel off its right, the sign out front on the lawn)
const SIGN = { w: 760, len: 1100, lean: 0.22, x: -2450, z: 900, rot: 0.35 }
const EASEL_AT = { x: 1480, z: 380, rot: -0.4 }
const PICKS_AT = { x: -1660, z: 330, rot: 0.4 }
// (the furniture: the speakers either side of the stand, the listening corner out front, the plants at the back)
// (a JBL L100 Classic on its JS-120 either side, clear of the stand's ends, turned a little in; its tweeter toward
// the middle: ../speaker)
const SPEAKERS_AT = [-1010, 1010].map((x) => ({ x, z: -40, rot: x < 0 ? 0.12 : -0.12, side: (x < 0 ? 1 : -1) as -1 | 1 }))
const SPEAKER_BOX = { w: L100.w, h: 800, d: L100.d } // (the speaker on its stand, as a box: what the car bumps)
const TABLE_AT = { x: 650, z: 800, rot: 0.3 }
const POUFS_AT = [
  { x: 250, z: 950, rot: 0, mint: true },
  { x: 1000, z: 1060, rot: 0, mint: false },
]
const PLANTS_AT = [
  { x: -960, z: -520, seed: 0 },
  { x: 960, z: -520, seed: 3 },
]
// (on the stand's top, past the Dig box: a succulent, a few records lying about; under it, the back stock)
const TOP_STACK = { x: 590, z: 30, n: 3, turn: 0.18 }
const SHELF_STOCK = { row: { x0: -690, n: 50, z: 0 }, stacks: [{ x: -150, z: -10, n: 6, turn: -0.05 }, { x: 260, z: 0, n: 4, turn: 0.15 }] }

/** the picks rack: a few of her saved albums, face out */
function Picks() {
  const sh = useShelf()
  return <PicksRack records={sh.crates.saved.slice(0, 3)} title={'Rina\'s Picks ♡'} />
}
/** her saved albums lying about: a few on the top, the back stock on the shelf */
function Lying() {
  const sh = useShelf()
  const saved = sh.crates.saved
  return (
    <>
      <group position={[0, STAND.h, 0]}>
        <Stock records={saved.slice(3)} row={{ x0: 0, n: 0, z: 0 }} stacks={[TOP_STACK]} who="top" />
      </group>
      <group position={[0, shelfTop, 0]}>
        <Stock records={saved} row={SHELF_STOCK.row} stacks={SHELF_STOCK.stacks} who="shelf" />
      </group>
    </>
  )
}
/** the crate: her saved albums, or what she dug for */
function TheCrate({ onPlay, gate }: { onPlay: (p: Pressing, disc: number) => void; gate: () => boolean }) {
  const sh = useShelf()
  return <Crate id={sh.showing} label={LABEL[sh.showing]} note={sh.showing === 'dig' ? sh.dug : ''} onPlay={onPlay} gate={gate} />
}

export function QuadMusic({ car }: { car: { current: CarState } }) {
  useFillCrates()
  if (DEV) Object.assign(window, { __music: { openCrate, takeOut, getBrowse, getLook } }) // (for trying it from the console; &dev on a build)
  // ---- looking: the whole stand first; from there, the player or the crate; Esc back a step at a time
  const standSpot = useMemo<Spot>(
    () => ({
      key: 'music',
      items: [],
      frame: (pos, look, aspect) => {
        const b = liveBody('musicstand')
        if (!b) return
        const t = b.translation()
        const r = b.rotation()
        _q.set(r.x, r.y, r.z, r.w)
        // (the canopy and its plank, the speakers, the sign out front, the easel, all in; a little from the left, above)
        _c.set(-380, 1100, 420).multiplyScalar(K).applyQuaternion(_q).add(t as Vector3)
        _n.set(-0.08, 0.32, 1).normalize().applyQuaternion(_q)
        frameAround(pos, look, aspect, _c, 4900 * K, 3200 * K, _n)
      },
      quiet: true,
    }),
    [],
  )
  const playerSpot = useMemo<Spot>(
    () => ({
      key: 'turntable',
      items: [],
      // (down over the player from in front: its strip, its platter and its arm all to hand)
      frame: (pos, look, aspect) => {
        const b = liveBody('musicplayer')
        if (!b) return
        const t = b.translation()
        const r = b.rotation()
        _q.set(r.x, r.y, r.z, r.w)
        // (the frame's middle in front of the player: it sits high, its strip clear of the words under it)
        _c.set(0, EW.cab + 20, 95).multiplyScalar(K).applyQuaternion(_q).add(t as Vector3)
        _n.set(0, 1.1, 0.9).normalize().applyQuaternion(_q)
        frameAround(pos, look, aspect, _c, 470 * K, 520 * K, _n)
      },
      quiet: true,
      keys: (e) => {
        if (e.key !== 'Escape') return false
        lookAt({ spot: standSpot, i: null })
        return true
      },
    }),
    [standSpot],
  )
  useEffect(() => {
    setBrowseParent(standSpot)
    return () => setBrowseParent(null)
  }, [standSpot])
  /** a click on any of it from afar: the whole stand first (true: the click's taken) */
  const first = () => {
    if (getLook()) return false
    clickSpot(standSpot)
    return true
  }
  const toStand = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    clickSpot(standSpot)
  }
  const prompt = useMemo(() => setPrompt('music', 'Reset Record Stand', (o) => o.copy(world(0, STAND.h + 700, 0))), [])
  // (on the rug: what stands on it stands on its top)
  const home = (lx: number, ly: number, lz: number, rot = 0, onRug = true) => {
    const w = world(lx, ly + (onRug ? RUG.t : 0), lz)
    return { x: w.x, y: w.y, z: w.z, rot: A.rot + rot }
  }
  const legX = STAND.w / 2 - STAND.leg.inset - STAND.leg.s / 2
  // (the player: from afar, the stand; from the stand, the player; looked at, its own parts work)
  const toPlayer = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!getLook()) clickSpot(standSpot)
    else if (getLook()?.spot.key !== 'turntable') lookAt({ spot: playerSpot, i: null })
  }
  const notClose = () => getLook()?.spot.key !== 'turntable'
  // a record clicked out of its jacket: onto the player, playing, the camera over it
  const play = (p: Pressing, disc: number) => {
    playOn(p, disc)
    lookAt({ spot: playerSpot, i: null })
  }
  const dig = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!first()) askDig()
  }
  return (
    <>
      <LiveProp id="musicstand" label="" set="music" at={home(0, 0, 0)} car={car} lift={60} feelPts={[-1, 0, 1].map((u) => [u * STAND.w * 0.33 * K, 0] as [number, number])} feelR={S(STAND.d)}>
        <group scale={K}>
          <group onClick={toStand}>
            <Static>
              <Stand />
              <group position={[340, STAND.h, -150]}>
                <Succulent />
              </group>
              <group position={[600, shelfTop, 0]}>
                <Basket />
              </group>
            </Static>
            <Lying />
          </group>
          {/* the crate beside the player, the Dig box past it */}
          <group position={[STAND.crate, STAND.h, 0]}>
            <TheCrate onPlay={play} gate={first} />
          </group>
          <group position={[STAND.digBox.x, STAND.h, STAND.digBox.z]} rotation={[0, -0.12, 0]}>
            <Static>
              <DigBox onClick={dig} />
            </Static>
          </group>
        </group>
        <CuboidCollider args={[S(STAND.w), S(STAND.top), S(STAND.d)]} position={[0, (STAND.h - STAND.top / 2) * K, 0]} mass={8} friction={0.8} />
        <CuboidCollider args={[S(STAND.w - 2 * STAND.leg.inset), S(STAND.shelf.t), S(STAND.d - 2 * STAND.shelf.inset)]} position={[0, (STAND.shelf.y + STAND.shelf.t / 2) * K, 0]} mass={3} friction={0.8} />
        {[-1, 1].map((sx) => (
          <CuboidCollider key={sx} args={[S(STAND.leg.s), S(STAND.h - STAND.top), S(STAND.d - 2 * STAND.leg.inset)]} position={[sx * legX * K, ((STAND.h - STAND.top) / 2) * K, 0]} mass={1} friction={0.9} />
        ))}
        {/* (the crate's bulk, and the Dig box's, on the top) */}
        <CuboidCollider args={[S(CRATE.in.w + 2 * CRATE.wall), S(CRATE.h), S(CRATE.in.d + 2 * CRATE.wall)]} position={[STAND.crate * K, (STAND.h + CRATE.h / 2) * K, 0]} mass={0.5} friction={0.8} />
        <CuboidCollider args={[S(DIGBOX.w), S(DIGBOX.h), S(DIGBOX.d)]} position={[STAND.digBox.x * K, (STAND.h + DIGBOX.h / 2) * K, STAND.digBox.z * K]} mass={0.2} friction={0.8} />
      </LiveProp>
      <LiveProp id="musicplayer" label="" set="music" at={home(STAND.player.x, STAND.h, STAND.player.z)} car={car} lift={40} feelPts={[[0, 0]]} feelR={S(EW.w)}>
        <group scale={K} onClick={toPlayer}>
          <Turntable gate={notClose} />
          {/* (notes drift up off the platter while a record plays) */}
          <Notes from={[EW.platter.x, platterTop, EW.platter.z]} />
        </group>
        <CuboidCollider args={[S(EW.w), S(EW.cab), S(EW.d)]} position={[0, S(EW.cab), 0]} mass={EW.mass} friction={0.8} />
      </LiveProp>
      {/* the rug under it all */}
      <group position={[A.x, LAWN, A.z]} rotation={[0, A.rot, 0]}>
        <group scale={K} onClick={toStand}>
          <Static>
            <MusicRug />
          </Static>
        </group>
        {/* (its top solid, and deep, so what's dropped on it rests on it, not in it) */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[S(RUG.w) * 0.97, 20, S(RUG.d) * 0.97]} position={[0, RUG.t * K - 20, 0]} friction={0.9} />
        </RigidBody>
      </group>
      {/* the canopy over it all, the plants in its back corners, the records hung at its back */}
      <LiveProp id="musiccanopy" label="" set="music" at={home(0, 0, 0)} car={car} lift={0} feelPts={[-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * CANOPY.hx * K, sz * CANOPY.hz * K] as [number, number]))} feelR={14}>
        <group scale={K} onClick={toStand}>
          <Static>
            <MusicCanopy />
            <Bunting />
            <VinylStrings />
            {PLANTS_AT.map((p) => (
              <group key={p.x} position={[p.x, 0, p.z]}>
                <Plant seed={p.seed} />
              </group>
            ))}
          </Static>
          <VinylWall />
        </group>
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <group key={sx * 3 + sz}>
              <CylinderCollider args={[(CANOPY.eave / 2) * K, 30 * K]} position={[sx * CANOPY.hx * K, (CANOPY.eave / 2) * K, sz * CANOPY.hz * K]} mass={0.3} friction={0.8} />
              <CuboidCollider args={[60 * K, 10 * K, 60 * K]} position={[sx * CANOPY.hx * K, 30 * K, sz * CANOPY.hz * K]} mass={1} friction={0.9} />
            </group>
          )),
        )}
        {PLANTS_AT.map((p) => (
          <CylinderCollider key={p.x} args={[S(360), 170 * K]} position={[p.x * K, S(360), p.z * K]} mass={0.6} friction={0.8} />
        ))}
        <CuboidCollider args={[(CANOPY.hx + CANOPY.over) * K, 30 * K, (CANOPY.hz + CANOPY.over) * K]} position={[0, (CANOPY.eave + 20) * K, 0]} mass={1.2} friction={0.6} />
      </LiveProp>
      {/* the speakers either side */}
      {SPEAKERS_AT.map((s, i) => (
        <LiveProp key={i} id={`musicspeaker${i}`} label="" set="music" at={home(s.x, 0, s.z, s.rot)} car={car} lift={60} feelPts={[[0, 0]]} feelR={S(SPEAKER_BOX.w)}>
          <group scale={K} onClick={toStand}>
            <Static>
              <SpeakerOnStand side={s.side} />
            </Static>
          </group>
          <CuboidCollider args={[S(SPEAKER_BOX.w), S(SPEAKER_BOX.h), S(SPEAKER_BOX.d)]} position={[0, S(SPEAKER_BOX.h), 0]} mass={4} friction={0.8} />
        </LiveProp>
      ))}
      {/* the listening corner: the coffee table, the poufs */}
      <LiveProp id="musictable" label="" set="music" at={home(TABLE_AT.x, 0, TABLE_AT.z, TABLE_AT.rot)} car={car} lift={60} feelPts={[[0, 0]]} feelR={S(TABLE.r * 2)}>
        <group scale={K} onClick={toStand}>
          <Static>
            <CoffeeTable />
          </Static>
          <TableRecord />
        </group>
        <CylinderCollider args={[S(TABLE.h), TABLE.r * K]} position={[0, S(TABLE.h), 0]} mass={1} friction={0.8} />
      </LiveProp>
      {POUFS_AT.map((p, i) => (
        <LiveProp key={i} id={`musicpouf${i}`} label="" set="music" at={home(p.x, 0, p.z, p.rot)} car={car} lift={60} feelPts={[[0, 0]]} feelR={S(480)}>
          <group scale={K} onClick={toStand}>
            <Static>
              <Pouf mint={p.mint} />
            </Static>
          </group>
          <CylinderCollider args={[S(300), 230 * K]} position={[0, S(300), 0]} mass={0.4} friction={0.9} />
        </LiveProp>
      ))}
      <LiveProp id="musicpicks" label="" set="music" at={home(PICKS_AT.x, 0, PICKS_AT.z, PICKS_AT.rot)} car={car} lift={60} feelPts={[[0, 0]]} feelR={S(RACK.w)}>
        <group scale={K} onClick={toStand}>
          <Static>
            <Picks />
          </Static>
        </group>
        <CuboidCollider args={[S(RACK.w), S(RACK.h), S(RACK.d)]} position={[0, S(RACK.h), -40 * K]} mass={1.5} friction={0.8} />
      </LiveProp>
      <LiveProp id="musiceasel" label="" set="music" at={home(EASEL_AT.x, 0, EASEL_AT.z, EASEL_AT.rot)} car={car} lift={60} feelPts={[[0, 0]]} feelR={S(400)}>
        <group scale={K} onClick={toStand}>
          <Static>
            <NowPlayingEasel />
          </Static>
        </group>
        <CuboidCollider args={[S(380), S(820), S(260)]} position={[0, S(820), -60 * K]} mass={0.8} friction={0.8} />
      </LiveProp>
      <LiveProp id="musicsign" label="" set="music" at={home(SIGN.x, 0, SIGN.z, SIGN.rot, false)} car={car} lift={(SIGN.len + 200) * K} feelAlong={[-0.3 * SIGN.w * K, 0.3 * SIGN.w * K]} feelR={40}>
        <group scale={K} onClick={toStand}>
          <Static>
            <SpinningSign />
          </Static>
        </group>
        <CuboidCollider args={[S(SIGN.w), 10 * K, SIGN.len * Math.sin(SIGN.lean) * K]} position={[0, 10 * K, 0]} mass={1} friction={0.8} />
        <CuboidCollider args={[S(SIGN.w), S(SIGN.len * Math.cos(SIGN.lean)), (SIGN.len * Math.sin(SIGN.lean) * K) / 2]} position={[0, S(SIGN.len * Math.cos(SIGN.lean)), 0]} mass={0.8} friction={0.8} />
      </LiveProp>
      <Prompts items={[prompt]} far={9000} />
      <VinylWarm />
    </>
  )
}

/** a record lying on the coffee table, by the mug (one of hers) */
function TableRecord() {
  const sh = useShelf()
  return (
    <group position={[-60, TABLE.h, -60]}>
      <Stock records={sh.crates.saved.slice(9)} row={{ x0: 0, n: 0, z: 0 }} stacks={[{ x: 0, z: 0, n: 1, turn: 0.5 }]} who="table" />
    </group>
  )
}
