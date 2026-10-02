import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { Quaternion, Vector3, type Group } from 'three'
import { Static } from '../../lib/render/Static'
import { Prompts } from '../prompt/Prompts'
import { setBrowseParent, useBrowse } from '../records/browse'
import { Crate } from '../records/Crate'
import { CRATES, type CrateId } from '../records/library'
import { LooseRecords, takeLoose } from '../records/Loose'
import { askDig } from '../records/Overlay'
import { CRATE, STAND, shelfTop } from '../records/rack'
import { useFillCrates, useShelf } from '../records/shelf'
import { Stand } from '../records/Stand'
import { Turntable } from '../records/Turntable'
import { EW, platterTop } from '../records/victrola'
import { LiveProp, liveBody, setPrompt } from './Physical'
import { clickSpot, frameAround, getLook, lookAt, type Spot } from './look'
import { AFrame } from './CookieStand'
import { Bunting, CANOPY, PicksRack, RACK, RUG, VinylWall, MusicCanopy, MusicRug, NowPlayingEasel, Notes, useSpinningFace } from './MusicDecor'
import { SET } from './set'
import type { CarState } from './Car'

/**
 * The record stand on the Quad (../records), on the big lawn west of the cookie stand: the Victrola on top with the
 * On Repeat, Saved and Dig crates beside it, This Year, All-Time, Played Lately and Playlists on the shelf below. At
 * the GameCube's toy scale (0.24). The stand and the player loose like everything (the car shoves them, the hand
 * carries them); the crates part of the stand.
 *
 *   the stand    click any of it: the camera takes in the whole stand (its canopy, its sign, its easel); from there:
 *   the player   click it: the camera comes down over it, its buttons, arm and knobs to hand (../records/Turntable)
 *   a crate      click it: the camera comes in over it; A / D flip through, Enter takes one out (a shelf crate
 *                slides out from under the top first); click a record out of its jacket: it's out, to carry
 *   Dig          its card: what to look for (an artist, an album, a song); or "more by" from a record taken out
 *   a record     carried over the platter and let go, it goes on
 *   Esc          back a step: from a record to its crate, from a crate or the player to the stand, then the car
 *   R            all of it back as it was (or its prompt, when anything's out of place)
 * Dressed like the cookie stand (./MusicDecor): a striped canopy with string lights and its name on a plank, a
 * braided rug, a chalkboard out front saying what's spinning, an easel with the playing record's jacket on it.
 */
const K = 0.24
const LAWN = 4
const A = SET.music
const cos = Math.cos(A.rot)
const sin = Math.sin(A.rot)
/** the stand's own frame (real mm, its middle at its origin) to the Quad's */
const world = (lx: number, ly: number, lz: number) => new Vector3(A.x + (lx * cos + lz * sin) * K, LAWN + ly * K, A.z + (-lx * sin + lz * cos) * K)
const S = (r: number) => (r * K) / 2

const TOP: CrateId[] = ['repeat', 'saved', 'dig']
const SHELF: CrateId[] = ['year', 'alltime', 'lately', 'playlists']
const labelOf = (id: CrateId) => CRATES.find((c) => c.id === id)!.label

/** a crate on the shelf: slid out forward from under the top while it's gone through */
function Sliding({ id, children }: { id: CrateId; children: ReactNode }) {
  const g = useRef<Group>(null)
  const b = useBrowse()
  const out = b.crate === id && b.mode !== 'none'
  useFrame((_, dt) => {
    const o = g.current
    if (o) o.position.z += ((out ? STAND.slide : 0) - o.position.z) * Math.min(1, Math.min(dt, 0.05) * 6)
  })
  return <group ref={g}>{children}</group>
}

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

/** the picks rack: her all-time favourites (or, till those come, what's on repeat, what's saved) */
function Picks() {
  const sh = useShelf()
  const [records, title] = sh.crates.alltime.length ? [sh.crates.alltime, 'All-Time Picks ♡'] : sh.crates.repeat.length ? [sh.crates.repeat, 'On Repeat ♡'] : [sh.crates.saved, 'Rina\'s Picks ♡']
  return <PicksRack records={records.slice(0, 3)} title={title} />
}

export function QuadMusic({ car }: { car: { current: CarState } }) {
  useFillCrates()
  // ---- looking: the whole stand first; from there, the player or a crate; Esc back a step at a time
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
        // (the canopy and its plank, the sign out front, the easel, all in; a little from the left, a little above)
        _c.set(-380, 1100, 420).multiplyScalar(K).applyQuaternion(_q).add(t as Vector3)
        _n.set(-0.08, 0.32, 1).normalize().applyQuaternion(_q)
        frameAround(pos, look, aspect, _c, 4900 * K, 3200 * K, _n)
      },
      hint: 'click the record player, or a crate to go through it',
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
      hint: 'POWER, then drag the arm over a record · CUE lifts it · drag the big knob for volume',
      back: 'back to the stand',
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
  const crate = (id: CrateId) => (
    <Crate id={id} label={labelOf(id)} onTake={takeLoose} onCard={id === 'dig' ? () => askDig() : undefined} empty={id === 'dig' ? 'click to ask for anything' : ''} gate={first} />
  )
  // (the player: from afar, the stand; from the stand, the player; looked at, its own parts work)
  const toPlayer = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!getLook()) clickSpot(standSpot)
    else if (getLook()?.spot.key !== 'turntable') lookAt({ spot: playerSpot, i: null })
  }
  const notClose = () => getLook()?.spot.key !== 'turntable'
  return (
    <>
      <LiveProp id="musicstand" label="" set="music" at={home(0, 0, 0)} car={car} lift={60} feelPts={[-1, 0, 1].map((u) => [u * STAND.w * 0.33 * K, 0] as [number, number])} feelR={S(STAND.d)}>
        <group scale={K}>
          <group onClick={toStand}>
            <Static>
              <Stand />
            </Static>
          </group>
          {/* the crates: three on the top beside the player, four on the shelf */}
          {TOP.map((id, i) => (
            <group key={id} position={[STAND.topCrates[i], STAND.h, 0]}>
              {crate(id)}
            </group>
          ))}
          {SHELF.map((id, i) => (
            <group key={id} position={[STAND.shelfCrates[i], shelfTop, 0]}>
              <Sliding id={id}>{crate(id)}</Sliding>
            </group>
          ))}
        </group>
        <CuboidCollider args={[S(STAND.w), S(STAND.top), S(STAND.d)]} position={[0, (STAND.h - STAND.top / 2) * K, 0]} mass={8} friction={0.8} />
        <CuboidCollider args={[S(STAND.w - 2 * STAND.leg.inset), S(STAND.shelf.t), S(STAND.d - 2 * STAND.shelf.inset)]} position={[0, (STAND.shelf.y + STAND.shelf.t / 2) * K, 0]} mass={3} friction={0.8} />
        {[-1, 1].map((sx) => (
          <CuboidCollider key={sx} args={[S(STAND.leg.s), S(STAND.h - STAND.top), S(STAND.d - 2 * STAND.leg.inset)]} position={[sx * legX * K, ((STAND.h - STAND.top) / 2) * K, 0]} mass={1} friction={0.9} />
        ))}
        {/* (the crates' bulk on the top, so what's dropped there rests on them) */}
        {STAND.topCrates.map((x) => (
          <CuboidCollider key={x} args={[S(CRATE.in.w + 2 * CRATE.wall), S(CRATE.h), S(CRATE.in.d + 2 * CRATE.wall)]} position={[x * K, (STAND.h + CRATE.h / 2) * K, 0]} mass={0.5} friction={0.8} />
        ))}
      </LiveProp>
      <LiveProp id="musicplayer" label="" set="music" at={home(STAND.player.x, STAND.h, STAND.player.z)} car={car} lift={40} feelPts={[[0, 0]]} feelR={S(EW.w)}>
        <group scale={K} onClick={toPlayer}>
          <Turntable gate={notClose} />
          {/* (notes drift up off the platter while a record plays) */}
          <Notes from={[EW.platter.x, platterTop, EW.platter.z]} />
        </group>
        <CuboidCollider args={[S(EW.w), S(EW.cab), S(EW.d)]} position={[0, S(EW.cab), 0]} mass={EW.mass} friction={0.8} />
      </LiveProp>
      {/* the canopy over it all, the rug under, the easel with the jacket of what's on */}
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
      <LiveProp id="musiccanopy" label="" set="music" at={home(0, 0, 0)} car={car} lift={0} feelPts={[-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * CANOPY.hx * K, sz * CANOPY.hz * K] as [number, number]))} feelR={14}>
        <group scale={K} onClick={toStand}>
          <Static>
            <MusicCanopy />
            <Bunting />
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
        <CuboidCollider args={[(CANOPY.hx + CANOPY.over) * K, 30 * K, (CANOPY.hz + CANOPY.over) * K]} position={[0, (CANOPY.eave + 20) * K, 0]} mass={1.2} friction={0.6} />
      </LiveProp>
      <LiveProp id="musicpicks" label="" set="music" at={home(PICKS_AT.x, 0, PICKS_AT.z, PICKS_AT.rot)} car={car} lift={60} feelPts={[[0, 0]]} feelR={S(RACK.w)}>
        <group scale={K} onClick={toStand}>
          <Picks />
        </group>
        <CuboidCollider args={[S(RACK.w), S(RACK.h), S(RACK.d)]} position={[0, S(RACK.h), -40 * K]} mass={1.5} friction={0.8} />
      </LiveProp>
      <LiveProp id="musiceasel" label="" set="music" at={home(EASEL_AT.x, 0, EASEL_AT.z, EASEL_AT.rot)} car={car} lift={60} feelPts={[[0, 0]]} feelR={S(400)}>
        <group scale={K} onClick={toStand}>
          <NowPlayingEasel />
        </group>
        <CuboidCollider args={[S(380), S(820), S(260)]} position={[0, S(820), -60 * K]} mass={0.8} friction={0.8} />
      </LiveProp>
      <LiveProp id="musicsign" label="" set="music" at={home(SIGN.x, 0, SIGN.z, SIGN.rot, false)} car={car} lift={(SIGN.len + 200) * K} feelAlong={[-0.3 * SIGN.w * K, 0.3 * SIGN.w * K]} feelR={40}>
        <group scale={K} onClick={toStand}>
          <SpinningSign />
        </group>
        <CuboidCollider args={[S(SIGN.w), 10 * K, SIGN.len * Math.sin(SIGN.lean) * K]} position={[0, 10 * K, 0]} mass={1} friction={0.8} />
        <CuboidCollider args={[S(SIGN.w), S(SIGN.len * Math.cos(SIGN.lean)), (SIGN.len * Math.sin(SIGN.lean) * K) / 2]} position={[0, S(SIGN.len * Math.cos(SIGN.lean)), 0]} mass={0.8} friction={0.8} />
      </LiveProp>
      <LooseRecords scale={K} />
      <Prompts items={[prompt]} far={9000} />
    </>
  )
}
