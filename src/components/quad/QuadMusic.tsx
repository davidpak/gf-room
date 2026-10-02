import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { Quaternion, Vector3, type Group } from 'three'
import { Static } from '../../lib/render/Static'
import { Prompts } from '../prompt/Prompts'
import { useBrowse } from '../records/browse'
import { Crate } from '../records/Crate'
import { CRATES, type CrateId } from '../records/library'
import { LooseRecords, takeLoose } from '../records/Loose'
import { askDig } from '../records/Overlay'
import { CRATE, STAND, shelfTop } from '../records/rack'
import { useFillCrates } from '../records/shelf'
import { Stand } from '../records/Stand'
import { Turntable } from '../records/Turntable'
import { EW } from '../records/victrola'
import { LiveProp, liveBody, setPrompt } from './Physical'
import { clickSpot, frameAround, type Spot } from './look'
import { SET } from './set'
import type { CarState } from './Car'

/**
 * The record stand on the Quad (../records), on the big lawn west of the cookie stand: the Victrola on top with the
 * On Repeat, Saved and Dig crates beside it, This Year, All-Time, Played Lately and Playlists on the shelf below. At
 * the GameCube's toy scale (0.24). The stand and the player loose like everything (the car shoves them, the hand
 * carries them); the crates part of the stand.
 *
 *   the player   click it: the camera comes down over it, its buttons, arm and knobs to hand (../records/Turntable)
 *   a crate      click it: the camera comes in over it; A / D flip through, Enter takes one out (a shelf crate
 *                slides out from under the top first); click a record out of its jacket: it's out, to carry
 *   Dig          its card: what to look for (an artist, an album, a song); or "more by" from a record taken out
 *   a record     carried over the platter and let go, it goes on
 *   R            all of it back as it was (or its prompt, when anything's out of place)
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

export function QuadMusic({ car }: { car: { current: CarState } }) {
  useFillCrates()
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
    }),
    [],
  )
  const prompt = useMemo(() => setPrompt('music', 'Reset Record Stand', (o) => o.copy(world(0, STAND.h + 700, 0))), [])
  const home = (lx: number, ly: number, lz: number, rot = 0) => {
    const w = world(lx, ly, lz)
    return { x: w.x, y: w.y, z: w.z, rot: A.rot + rot }
  }
  const legX = STAND.w / 2 - STAND.leg.inset - STAND.leg.s / 2
  const crate = (id: CrateId) => (
    <Crate id={id} label={labelOf(id)} onTake={takeLoose} onCard={id === 'dig' ? () => askDig() : undefined} empty={id === 'dig' ? 'click to ask for anything' : ''} />
  )
  const toPlayer = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    clickSpot(playerSpot)
  }
  return (
    <>
      <LiveProp id="musicstand" label="" set="music" at={home(0, 0, 0)} car={car} lift={60} feelPts={[-1, 0, 1].map((u) => [u * STAND.w * 0.33 * K, 0] as [number, number])} feelR={S(STAND.d)}>
        <group scale={K}>
          <Static>
            <Stand />
          </Static>
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
          <Turntable />
        </group>
        <CuboidCollider args={[S(EW.w), S(EW.cab), S(EW.d)]} position={[0, S(EW.cab), 0]} mass={EW.mass} friction={0.8} />
      </LiveProp>
      <LooseRecords scale={K} />
      <Prompts items={[prompt]} far={9000} />
    </>
  )
}
