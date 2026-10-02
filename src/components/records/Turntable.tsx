import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Plane, Vector3, type Group } from 'three'
import { sdk } from '../../lib/spotify/player'
import { getDeck, live, now, press, setDeck, sideUp, useDeck } from './deck'
import { EW, angleFor, deckY, platterTop, stylusAt } from './victrola'
import { spindle } from './Loose'
import { Eastwood } from './Eastwood'
import { bandStarts, drop, lift, needle, tick } from './play'
import { cancelChange, changing, sideEnded, sideFrom, sideIndex, turnTo } from './changer'
import { Disc, discThick, useArt } from './Record'
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
    // (the end of a side, played to: on to the next, by itself)
    if (needle.ended && needle.runout && d.power) void sideEnded()
    // where it's swung: the hand's, the music's, or where it was left
    const toward = isDown && d.power ? tick(dt) : null
    const a = d.held ? d.arm.a : toward ?? d.arm.a
    live.a += (a - live.a) * Math.min(1, dt * (d.held ? 18 : toward != null ? 10 : 5))
    // the platter: turning while it's on and the arm's off its rest (the motor's switch), up to speed
    const S = d.on ? sizeOf(d.on.p) : null
    const target = d.power && (live.a > REST + 0.04 || changing.on) && !needle.runout ? ((S?.rpm ?? 100 / 3) / 60) * Math.PI * 2 : 0
    live.spin += (target - live.spin) * Math.min(1, dt * (target ? 1.6 : 0.9))
    live.turn += live.spin * dt
  })
  return null
}

/** `gate`: asked before any of its buttons, knobs, arm or lid work (true: they don't: on the Quad, only once it's
 *  looked at closely) */
export function Turntable({ gate }: { gate?: () => boolean } = {}) {
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
      cancelChange()
      const s = getDeck()
      setDeck({ power: !s.power, poweredAt: now() })
    },
    lid: () => setDeck({ lid: !getDeck().lid }),
    arm: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return
      cancelChange()
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
      cancelChange()
      const s = getDeck()
      if (s.arm.a > REST + 0.02) setDeck({ arm: { a: live.a, down: !s.arm.down } })
    },
    playpause: () => {
      press('playpause')
      const s = getDeck()
      if (s.mode === 'bt') return void sdk()?.togglePlay()
      cancelChange()
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
      cancelChange()
      const o = s.on
      const sides = o.p.sides.length
      const next = (sideIndex(o) + 1) % sides
      setDeck({ on: { ...o, disc: Math.floor(next / 2), face: (next % 2) as 0 | 1 } })
      needle.runout = false
    },
  }
  // (each part asks the gate first)
  const gated = Object.fromEntries(Object.entries(on).map(([k, f]) => [k, (e: ThreeEvent<PointerEvent>) => (gate?.() ? undefined : (f as (e: ThreeEvent<PointerEvent>) => void)(e))])) as typeof on
  function skip(by: number) {
    press(by < 0 ? 'prev' : 'next')
    const s = getDeck()
    if (s.mode === 'bt') return void (by < 0 ? sdk()?.previousTrack() : sdk()?.nextTrack())
    if (!s.on) return
    const o = s.on
    const starts = bandStarts(sideUp(o))
    // the song it's in (or, lifted, the one under it; in the run-out, past the last)
    const k = needle.playing ? needle.band : needle.runout ? starts.length : starts.findIndex((a) => a > live.a + 0.002) - 1
    const here = k < 0 ? starts.length - 1 : k
    // (⏮ a few seconds into a song: back to its start, as players do; else the one before)
    const to = by < 0 && needle.playing && needle.ms > 3000 ? here : here + by
    // off this side: over to the next (or back to the last song of the one before)
    if (to >= starts.length || to < 0) {
      const j = sideFrom(o, sideIndex(o), by < 0 ? -1 : 1)
      if (j != null) void turnTo(j, by < 0 ? 'last' : 0)
      return
    }
    cancelChange()
    // (lifted, swung, lowered: the needle comes down at the song's start)
    needle.runout = false
    setDeck({ arm: { a: live.a, down: false } })
    setTimeout(() => setDeck({ arm: { a: starts[Math.max(0, to)], down: true } }), 350)
  }
  // the volume follows the knob
  useEffect(() => void sdk()?.setVolume(d.volume), [d.volume])
  const S = d.on ? sizeOf(d.on.p) : null
  return (
    <group ref={root}>
      <Driver />
      {/* (where the spindle is: a loose record let go near it goes on: ./Loose) */}
      <object3D ref={(o) => void (spindle.current = o)} position={[EW.platter.x, platterTop, EW.platter.z]} />
      <Eastwood on={gated}>
        {d.on && art && S && (
          <Flip key={`${d.on.p.uri}/${d.on.disc}`} face={d.on.face} t={discThick(S)} r={S.r}>
            <Disc p={d.on.p} art={art} disc={d.on.disc} />
          </Flip>
        )}
      </Eastwood>
    </group>
  )
}

/** where the stylus is now, in the player's frame (for a look at it) */
export const stylusNow = () => stylusAt(live.a)

/**
 * The disc turned over (face 1 up) the way a hand does it, in one smooth movement through these poses:
 *   tipped     its left side lifted (its right edge, under the arm's rest, stays down): the hole rises off the spindle
 *   slid       eased left, its edge out from under the arm
 *   up         lifted level, higher than it's wide (on its edge, it's still clear of the deck)
 *   over       turned over
 * and back down the same way, the other face up. A record just put on comes down onto the spindle that way too
 * (from up, slid, tipped). The poses are joined by a smooth curve (Catmull-Rom through them, still at the ends).
 */
type Pose = [x: number, y: number, rz: number] // (rz: the turn about the front-to-back axis; less lowers the right side)
function curve(keys: Pose[], times: number[], t: number): Pose {
  const n = keys.length
  if (t <= times[0]) return keys[0]
  if (t >= times[n - 1]) return keys[n - 1]
  let i = 0
  while (t > times[i + 1]) i++
  const h = times[i + 1] - times[i]
  const u = (t - times[i]) / h
  // tangents: through the neighbours (none at the ends: it starts and stops still)
  const tan = (j: number, c: number) => (j === 0 || j === n - 1 ? 0 : ((keys[j + 1][c] - keys[j - 1][c]) / (times[j + 1] - times[j - 1])) * h)
  const out: number[] = []
  for (let c = 0; c < 3; c++) {
    const p0 = keys[i][c]
    const p1 = keys[i + 1][c]
    const m0 = tan(i, c)
    const m1 = tan(i + 1, c)
    const u2 = u * u
    const u3 = u2 * u
    out.push((2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1)
  }
  return out as Pose
}
function Flip({ face, t, r, children }: { face: 0 | 1; t: number; r: number; children: React.ReactNode }) {
  const g = useRef<Group>(null)
  const from = useRef<0 | 1>(face) // (the face up when it last settled)
  const clock = useRef(0)
  const arriving = useRef(true)
  // (the tip that lifts the hole clear of the spindle with the right edge left down; the slide that clears the arm)
  const tip = Math.asin((EW.platter.spindleH + 3) / r)
  const slide = -26
  const H = r + 35
  const path = useMemo(() => {
    const down = (f: number): Pose => [0, 0, f * Math.PI]
    const tipped = (f: number): Pose => [0, r * Math.sin(tip), f * Math.PI - tip]
    const slid = (f: number): Pose => [slide, r * Math.sin(tip) + 6, f * Math.PI - tip]
    const up = (f: number): Pose => [slide, H, f * Math.PI]
    return { down, tipped, slid, up }
  }, [r, tip, H])
  useFrame((_, dtRaw) => {
    const o = g.current
    if (!o) return
    const dt = Math.min(dtRaw, 0.05)
    const P = path
    let pose: Pose
    if (arriving.current) {
      // put on: in from above, down the last part of the way
      clock.current += dt
      const keys = [[slide, H + 60, face * Math.PI] as Pose, P.slid(face), P.tipped(face), P.down(face)]
      const times = [0, 0.55, 0.85, 1.15]
      pose = curve(keys, times, clock.current)
      if (clock.current >= 1.15) {
        arriving.current = false
        clock.current = 0
      }
    } else if (face !== from.current) {
      clock.current += dt
      const f0 = from.current
      // (over: the turn continues the same way round from where it was)
      const keys = [P.down(f0), P.tipped(f0), P.slid(f0), P.up(f0), [slide, H, (f0 + 1) * Math.PI] as Pose, P.slid(f0 + 1 as 0 | 1), P.tipped(f0 + 1 as 0 | 1), P.down(f0 + 1 as 0 | 1)]
      const times = [0, 0.35, 0.6, 1.0, 1.55, 1.95, 2.2, 2.55]
      pose = curve(keys, times, clock.current)
      if (clock.current >= 2.55) {
        from.current = face
        clock.current = 0
        pose = P.down(face)
      }
    } else pose = P.down(face)
    o.position.x = pose[0]
    o.rotation.z = pose[2]
    // (its thickness made up as it turns over: the disc's turned about its own middle)
    o.position.y = pose[1] + (t * (1 - Math.cos(pose[2]))) / 2
  })
  return <group ref={g}>{children}</group>
}
