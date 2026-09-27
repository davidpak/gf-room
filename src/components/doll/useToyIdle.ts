import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { stepSpring, type Spring } from '../../lib/spring'
import type { DollRig } from './Doll'

/**
 * How a crochet toy stands around: it doesn't breathe or drift, it holds still, and every few
 * seconds does one little toy gesture. Limbs move as stiff pieces, the whole doll tips from its
 * feet, and everything rides on bouncy springs so it overshoots and wobbles to a stop, like
 * stuffing settling.
 *
 *   squish  the whole doll squashes down and boings back up (the head nods with it)
 *   tilt    the head tips to one side, wobbles, holds, then comes back
 *   rock    the whole doll rocks side to side from its feet, like a toy being wiggled
 *   flap    a happy little double flap of both arms
 */
export type ToyKey = 'squash' | 'tilt' | 'rock' | 'arms'
type Key = ToyKey
export type Beat = [number, Key, number] // [seconds into the gesture, which spring, target]

const SPRINGS: Record<Key, { k: number; c: number; rest: number }> = {
  squash: { k: 260, c: 8, rest: 1 }, // low damping: a boing
  tilt: { k: 90, c: 8, rest: 0 },
  rock: { k: 150, c: 9, rest: 0 },
  arms: { k: 220, c: 10, rest: 0 },
}

function gesture(): Beat[] {
  const side = Math.random() < 0.5 ? -1 : 1
  const pick = Math.random()
  if (pick < 0.3)
    return [
      [0, 'squash', 0.9],
      [0.16, 'squash', 1],
    ]
  if (pick < 0.6)
    return [
      [0, 'tilt', 0.2 * side],
      [1.5 + Math.random(), 'tilt', 0],
    ]
  if (pick < 0.82)
    return [
      [0, 'rock', 0.07 * side],
      [0.32, 'rock', -0.07 * side],
      [0.64, 'rock', 0.04 * side],
      [0.9, 'rock', 0],
    ]
  return [
    [0, 'arms', 0.38],
    [0.22, 'arms', 0],
    [0.44, 'arms', 0.32],
    [0.66, 'arms', 0],
  ]
}

export function useToyIdle(rig: { current: DollRig | null }, enabled: { current: boolean } = { current: true }) {
  const springs = useRef<Record<Key, Spring>>({
    squash: { x: 1, v: 0 },
    tilt: { x: 0, v: 0 },
    rock: { x: 0, v: 0 },
    arms: { x: 0, v: 0 },
  })
  const targets = useRef<Record<Key, number>>({ squash: 1, tilt: 0, rock: 0, arms: 0 })
  const queue = useRef<{ at: number; key: Key; value: number }[]>([])
  const played = useRef<{ at: number; key: Key; value: number }[]>([]) // one-off beats (landing squash...)
  const clock = useRef(0)
  const next = useRef(1.5)

  useFrame((_, dt) => {
    const r = rig.current
    if (!r) return
    const h = Math.min(dt, 1 / 30)
    clock.current += h
    const now = clock.current
    // schedule the next gesture while idle
    if (enabled.current && now > next.current && queue.current.length === 0) {
      for (const [t, key, value] of gesture()) queue.current.push({ at: now + t, key, value })
      next.current = now + 2.8 + Math.random() * 3
    }
    if (!enabled.current && queue.current.length) {
      queue.current.length = 0
      for (const k of Object.keys(targets.current) as Key[]) targets.current[k] = SPRINGS[k].rest
    }
    const due = (b: { at: number; key: Key; value: number }) => {
      if (b.at > now) return true
      targets.current[b.key] = b.value
      return false
    }
    queue.current = queue.current.filter(due)
    played.current = played.current.filter(due)
    const s = springs.current
    for (const k of Object.keys(s) as Key[]) stepSpring(s[k], targets.current[k], h, SPRINGS[k].k, SPRINGS[k].c)
    // squash & stretch from the feet, keeping the volume (wider when squashed)
    const sq = s.squash.x
    const wide = 1 + (1 - sq) * 0.7
    r.root.scale.set(wide, sq, wide)
    r.root.rotation.z = s.rock.x
    r.head.rotation.z = s.tilt.x
    r.head.rotation.x = (1 - sq) * 0.9 // a little bobblehead nod with the squish
    r.armL.rotation.z = s.arms.x
    r.armR.rotation.z = -s.arms.x
  })

  /** Play a one-off gesture now (e.g. a squash on landing), even while walking. */
  return useRef({
    play(beats: Beat[]) {
      for (const [t, key, value] of beats) played.current.push({ at: clock.current + t, key, value })
    },
  }).current
}
