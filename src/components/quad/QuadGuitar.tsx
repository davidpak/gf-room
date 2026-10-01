import { Static } from '../../lib/render/Static'
import { useEffect, useMemo, useRef } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { Quaternion, Vector3, type Group } from 'three'
import { GUITAR_BOXES, GuitarModel } from '../guitar/Guitar'
import { CASE_BOX, CaseModel } from '../guitar/Case'
import { leanMatrix, playMatrix } from '../guitar/pose'
import { CASE } from '../guitar/spec'
import { LiveProp } from './Physical'
import { clickSpot, frameAround, useLook, type Spot } from './look'
import { SET } from './set'
import type { CarState } from './Car'

/**
 * The guitar on the Quad (../guitar): a Martin D-28 leaning back against the first cherry of the
 * clothesline (so it's there when you look at the line), its case open on the grass beside it. Both loose things, like the benches: knocked over by the car, carried, put back.
 *
 *   click it   the camera goes in, and the guitar comes up off the tree and holds itself flat in front of
 *              you: hold the left button and sweep across the strings over the soundhole to strum, click
 *              the fingerboard to hold a string down at a fret (again to let go). Esc, and it goes back to
 *              lean on the tree. (Till you've gone in, it's only a guitar: it can't be played)
 *
 * At the benches' toy scale (0.24: people-sized things), ~24 cm long.
 */
const K = 0.24
const LAWN = 4
const TREE = SET.trees[SET.photos.lines[0].trees[0]] // (the line's first cherry)
const TRUNK = { x: TREE.x, z: TREE.z, r: 105 * TREE.scale }
const YAW = 0.35 // (turned a little toward the line, where you look from)

/** its home, leaning on the trunk; and where it's held up to play, in front of it */
const lean = (() => {
  const m = leanMatrix(TRUNK, LAWN, K, YAW)
  const p = new Vector3()
  const q = new Quaternion()
  m.decompose(p, q, new Vector3())
  return { x: p.x, y: p.y, z: p.z, rot: 0, q }
})()
const LOOK_DIR = new Vector3(0.08, 0.2, 1).normalize()
const PLAY_AT = new Vector3(TRUNK.x + 30, 150, TRUNK.z + TRUNK.r + 260)
const play = (() => {
  const m = playMatrix(PLAY_AT, K, Math.atan2(LOOK_DIR.x, LOOK_DIR.z))
  const p = new Vector3()
  const q = new Quaternion()
  m.decompose(p, q, new Vector3())
  return { p, q }
})()
/** the case: on the grass by the tree, set down on a slant, its head end toward the trunk (where the guitar's
 *  been taken out and leant), its lid open on the side away from you */
const CASE_AT = { x: TRUNK.x - 220, y: LAWN, z: TRUNK.z + 170, rot: -Math.PI / 2 + 0.6 }
const O = (CASE.outside.w - 397) / 2 // (how far its shell stands out round the body)

export function QuadGuitar({ car }: { car: { current: CarState } }) {
  const model = useRef<Group>(null)
  const look = useLook()
  const playing = look?.spot.key === 'guitar'
  const pose = useRef<{ p: Vector3; q: Quaternion } | null>(null)
  useEffect(() => void (pose.current = playing ? play : null), [playing])
  const spot = useMemo<Spot>(
    () => ({
      key: 'guitar',
      items: [],
      frame: (pos, at, aspect) => frameAround(pos, at, aspect, PLAY_AT, 290, 130, LOOK_DIR),
      hint: 'hold the left button and sweep across the soundhole to strum · click a string or press 1–6 to pick it · click the fingerboard to hold a string at a fret',
    }),
    [],
  )
  if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __guitar: { play: () => clickSpot(spot), model } }) // (for trying it from the console)
  // (while it's being played, a click on it is the guitar's own: on its way through to the strings, not stopped here)
  const zoom = (e: ThreeEvent<MouseEvent>) => {
    if (playing) return
    e.stopPropagation()
    clickSpot(spot)
  }
  const colliders = useMemo(
    () =>
      GUITAR_BOXES.map((b, i) => (
        <CuboidCollider key={i} args={[b.half[0] * K, b.half[1] * K, b.half[2] * K]} position={[b.at[0] * K, b.at[1] * K, b.at[2] * K]} mass={i ? 0.08 : 0.5} friction={1} />
      )),
    [],
  )
  // the lid, open: a slab stood up (a little past upright) along the case's back edge
  const lid = useMemo(() => {
    const across = CASE.outside.w
    const hb = CASE.outside.h * CASE.split
    const hl = CASE.outside.h - hb
    const a = Math.PI - CASE.open
    return { half: [(across / 2) * K, (hl / 2) * K, (CASE.outside.l / 2) * K] as [number, number, number], at: [(-across / 2 - Math.cos(a) * (across / 2)) * K, (hb + Math.sin(a) * (across / 2)) * K, 0] as [number, number, number], rot: Math.PI - a }
  }, [])
  return (
    <>
      <LiveProp id="guitar" label="Lean the guitar back" at={lean} car={car} lift={280} feelAlong={[0]} feelR={60} pose={pose}>
        <group
          ref={model}
          scale={K}
          onClick={zoom}
          onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <Static>
            <GuitarModel playable={playing} />
          </Static>
        </group>
        {colliders}
      </LiveProp>
      <LiveProp id="guitarcase" label="Put the case back" at={CASE_AT} car={car} lift={140} feelAlong={[-0.3 * CASE.outside.l * K, 0.3 * CASE.outside.l * K]} feelR={60}>
        {/* (laid down, its middle at its origin, its length along z) */}
        <group scale={K}>
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, CASE.outside.l / 2 - O]}>
            <Static>
              <CaseModel />
            </Static>
          </group>
        </group>
        <CuboidCollider args={[CASE_BOX.half[0] * K, CASE_BOX.half[1] * K, CASE_BOX.half[2] * K]} position={[0, CASE_BOX.half[1] * K, 0]} mass={0.6} friction={0.9} />
        <CuboidCollider args={lid.half} position={lid.at} rotation={[0, 0, lid.rot]} mass={0.2} friction={0.8} />
      </LiveProp>
    </>
  )
}
