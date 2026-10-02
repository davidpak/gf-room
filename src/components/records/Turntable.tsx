import { useEffect, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Plane, Vector3, type Group } from 'three'
import { sdk } from '../../lib/spotify/player'
import { getDeck, live, now, press, setDeck, sideUp, useDeck } from './deck'
import { EW, angleFor, deckY, stylusAt } from './victrola'
import { Eastwood } from './Eastwood'
import { bandStarts, drop, lift, needle, tick } from './play'
import { Disc, useArt } from './Record'
import { sizeOf } from './vinyl'

/**
 * The record player, working: the Eastwood (./Eastwood) with what's on its platter, and the hand on it.
 *
 *   POWER        on (the display says HI, then PH; while a song plays, its number), off
 *   the lid      click it: up, down (slowly, like the real one on its hinges)
 *   the arm      drag it (it lifts) over the record and let go: it lowers there, and the song under the needle
 *                plays from that point; drag it back to its rest to stop. CUE (the lever) or ▶❚❚ lifts it, again
 *                lowers it. ◀◀ ▶▶ lift it and set it down at the start of the song before, after
 *   the record   click it while the arm's off it: turned over (the next disc, after the last side)
 *   VOLUME       drag across it (or the wheel over it)
 *   BT / PHONO   the small knob: in BT the player's a speaker for Spotify (▶❚❚ ◀◀ ▶▶ play, skip it)
 */
const REST = EW.arm.rest
const MAX = angleFor(EW.platter.hub - 4) // (as far in as it'll go)

function Driver() {
  const down = useRef(false)
  const powered = useRef(false)
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const d = getDeck()
    live.lid += ((d.lid ? 1 : 0) - live.lid) * Math.min(1, dt * 2.4)
    // the arm: lowered slowly (the cue's damped), lifted quicker
    const up = d.held || !d.arm.down || !d.on ? 1 : 0
    live.lift += Math.max(-dt / 0.9, Math.min(dt / 0.3, up - live.lift))
    const isDown = live.lift < 0.02
    // (the needle comes down, or the power comes on with it already down: it plays from where it is)
    if (isDown && (!down.current || (d.power && !powered.current))) drop()
    powered.current = d.power
    if (!isDown && down.current) lift()
    down.current = isDown
    if (!d.power && needle.playing) lift()
    // where it's swung: the hand's, the music's, or where it was left
    const toward = isDown && d.power ? tick(dt) : null
    const a = d.held ? d.arm.a : toward ?? d.arm.a
    live.a += (a - live.a) * Math.min(1, dt * (d.held ? 18 : toward != null ? 10 : 5))
    // the platter: turning while it's on and the arm's off its rest (the motor's switch), up to speed
    const S = d.on ? sizeOf(d.on.p) : null
    const target = d.power && live.a > REST + 0.04 && !needle.runout ? ((S?.rpm ?? 100 / 3) / 60) * Math.PI * 2 : 0
    live.spin += (target - live.spin) * Math.min(1, dt * (target ? 1.6 : 0.9))
    live.turn += live.spin * dt
  })
  return null
}

export function Turntable() {
  const d = useDeck()
  const art = useArt(d.on?.p ?? null)
  const { camera, gl, raycaster, pointer } = useThree()
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const root = useRef<Group>(null)
  // the hand's drags: the arm, the volume knob
  const drag = (move: (e: PointerEvent) => void, end?: () => void) => {
    if (controls) controls.enabled = false
    const mv = (e: PointerEvent) => move(e)
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      if (controls) controls.enabled = true
      end?.()
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }
  const plane = new Plane()
  const hit = new Vector3()
  const armTo = () => {
    // the pointer on the plane the arm swings in, in the player's frame: the arm's angle that points at it
    const o = root.current
    if (!o) return
    const n = new Vector3(0, 1, 0).transformDirection(o.matrixWorld)
    const p = new Vector3(0, deckY + EW.arm.height, 0).applyMatrix4(o.matrixWorld)
    plane.setFromNormalAndCoplanarPoint(n, p)
    const r = gl.domElement.getBoundingClientRect()
    void r
    raycaster.setFromCamera(pointer, camera)
    if (!raycaster.ray.intersectPlane(plane, hit)) return
    const l = o.worldToLocal(hit.clone())
    const { pivot } = EW.arm
    const a = Math.atan2(pivot.x - l.x, l.z - pivot.z)
    setDeck({ arm: { a: Math.max(REST, Math.min(MAX, a)), down: false } })
  }
  const on = {
    power: () => {
      press('power')
      const s = getDeck()
      setDeck({ power: !s.power, poweredAt: now() })
    },
    lid: () => setDeck({ lid: !getDeck().lid }),
    arm: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return
      setDeck({ held: true, lid: true })
      drag(
        () => armTo(),
        () => {
          const s = getDeck()
          // let go over the record: it lowers there; near its rest: it goes back to it
          const onRecord = !!s.on && s.arm.a > angleFor(sizeOf(s.on.p).r - 0.5) - 0.02
          setDeck({ held: false, arm: { a: onRecord ? s.arm.a : REST, down: onRecord } })
        },
      )
    },
    cue: () => {
      const s = getDeck()
      if (s.arm.a > REST + 0.02) setDeck({ arm: { a: live.a, down: !s.arm.down } })
    },
    playpause: () => {
      press('playpause')
      const s = getDeck()
      if (s.mode === 'bt') return void sdk()?.togglePlay()
      if (s.arm.a > REST + 0.02) setDeck({ arm: { a: live.a, down: !s.arm.down } })
    },
    prev: () => skip(-1),
    next: () => skip(1),
    bt: () => press('bt'),
    small: () => setDeck({ mode: getDeck().mode === 'bt' ? 'phono' : 'bt' }),
    big: (e: ThreeEvent<PointerEvent>) => {
      const x0 = e.clientX
      const v0 = getDeck().volume
      drag((ev) => setDeck({ volume: Math.max(0, Math.min(1, v0 + (ev.clientX - x0) / 240)) }))
    },
    platter: () => {
      // turned over, with the arm off it
      const s = getDeck()
      if (!s.on || s.arm.down || s.held) return
      const o = s.on
      const sides = o.p.sides.length
      const next = (2 * o.disc + o.face + 1) % sides
      setDeck({ on: { ...o, disc: Math.floor(next / 2), face: (next % 2) as 0 | 1 } })
      needle.runout = false
    },
  }
  function skip(by: number) {
    press(by < 0 ? 'prev' : 'next')
    const s = getDeck()
    if (s.mode === 'bt') return void (by < 0 ? sdk()?.previousTrack() : sdk()?.nextTrack())
    if (!s.on) return
    const starts = bandStarts(sideUp(s.on))
    const k = needle.playing ? needle.band : starts.findIndex((a) => a > live.a + 0.002) - 1
    const to = Math.max(0, Math.min(starts.length - 1, (k < 0 ? starts.length - 1 : k) + by))
    // (lifted, swung, lowered: the needle comes down at the song's start)
    needle.runout = false
    setDeck({ arm: { a: live.a, down: false } })
    setTimeout(() => setDeck({ arm: { a: starts[to], down: true } }), 350)
  }
  // the volume follows the knob
  useEffect(() => void sdk()?.setVolume(d.volume), [d.volume])
  const S = d.on ? sizeOf(d.on.p) : null
  return (
    <group ref={root}>
      <Driver />
      <Eastwood on={on}>
        {d.on && art && S && (
          // (face 1 up: the disc turned over)
          <group rotation={[0, 0, d.on.face ? Math.PI : 0]} position={[0, d.on.face ? S.t : 0, 0]}>
            <Disc p={d.on.p} art={art} disc={d.on.disc} />
          </group>
        )}
      </Eastwood>
    </group>
  )
}

/** where the stylus is now, in the player's frame (for a look at it) */
export const stylusNow = () => stylusAt(live.a)
