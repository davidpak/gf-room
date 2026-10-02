import { useEffect, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Plane, Vector3, type Group } from 'three'
import { sdk } from '../../lib/spotify/player'
import { getDeck, live, now, press, setDeck, sideUp, useDeck } from './deck'
import { EW, FIT, angleFor, deckY, stylusAt } from './victrola'
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
const MAX = angleFor((EW.platter.hub - 4) / FIT) // (as far in as it'll go)

function Driver() {
  const down = useRef(false)
  const powered = useRef(false)
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const d = getDeck()
    // (swung wide quicker than it's let back)
    const lidTo = !d.lid ? 0 : live.wide ? EW.lid.wide / EW.lid.open : 1
    live.lid += (lidTo - live.lid) * Math.min(1, dt * (lidTo > live.lid ? 6 : 2.4))
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
    // (not shut over a record: it'd go through it)
    lid: () => setDeck({ lid: !getDeck().lid || !!getDeck().on }),
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
      <Eastwood on={gated}>
        {d.on && art && S && (
          <Flip key={`${d.on.p.uri}/${d.on.disc}`} face={d.on.face} t={discThick(S) * FIT} r={S.r * FIT}>
            <group scale={FIT}>
              <Disc p={d.on.p} art={art} disc={d.on.disc} />
            </group>
          </Flip>
        )}
      </Eastwood>
    </group>
  )
}

/** where the stylus is now, in the player's frame (for a look at it) */
export const stylusNow = () => stylusAt(live.a)

/**
 * The disc put on, and turned over (face 1 up), straight up and down: the lid swung wide first (./victrola EW.lid.wide:
 * at its usual 68 its front pane hangs over the back of the platter), the disc lifted straight up off the spindle
 * till it can turn over clear of the platter and the arm, turned over about its front-to-back line, and set straight
 * back down. Put on: straight down from above. Each stretch eased in and out.
 */
const ease = (x: number) => {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}
const WIDEN = 0.35 // (s: the lid swung wide before the disc moves)
function Flip({ face, t, r, children }: { face: 0 | 1; t: number; r: number; children: React.ReactNode }) {
  const g = useRef<Group>(null)
  const from = useRef<0 | 1>(face) // (the face up when it last settled)
  const clock = useRef(0)
  const arriving = useRef(true)
  // (high enough that, on its edge, its lower half clears the platter and the arm: its radius and a little)
  const H = r + 18
  useEffect(() => () => void (live.wide = false), [])
  useFrame((_, dtRaw) => {
    const o = g.current
    if (!o) return
    const dt = Math.min(dtRaw, 0.05)
    let y = 0
    let turn = from.current * Math.PI
    if (arriving.current) {
      // put on: from above, straight down onto the spindle
      live.wide = true
      clock.current += dt
      const k = clock.current - WIDEN
      y = (H + 40) * (1 - ease(k / 0.85))
      turn = face * Math.PI
      if (k >= 0.85) {
        arriving.current = false
        from.current = face
        clock.current = 0
        live.wide = false
      }
    } else if (face !== from.current) {
      // over: up, turned, down
      live.wide = true
      clock.current += dt
      const k = clock.current - WIDEN
      y = H * (ease(k / 0.55) - ease((k - 1.25) / 0.55))
      turn = (from.current + ease((k - 0.5) / 0.8)) * Math.PI
      if (k >= 1.8) {
        from.current = face
        clock.current = 0
        live.wide = false
        y = 0
        turn = face * Math.PI
      }
    }
    o.position.set(0, y + (t * (1 - Math.cos(turn))) / 2, 0) // (its thickness made up as it turns: turned about its own middle)
    o.rotation.z = turn
  })
  return <group ref={g}>{children}</group>
}
