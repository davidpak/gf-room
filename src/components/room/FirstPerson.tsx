import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { worldInput } from '../../lib/inputLock'
import { CLOSET } from '../closet/spec'
import { ROOM } from './spec'

/**
 * Standing in Rina's room, first person: at eye height to start, inside the walls (you never see out).
 *
 *   middle drag     look round
 *   right drag      step along the floor (sideways, forward and back)
 *   wheel           a step forward / back
 *   W A S D, arrows walk
 *   shift / C       up / down (from near the floor to just under the ceiling, the bulkhead's lower over the desk)
 *   F               back to where you came in
 *
 * The left button is the hand's (carry, click). Moves and turns ease toward where they're going, so it's
 * smooth at any frame rate. It sits in the R3F store as the page's `controls` (`enabled`: the hand turns it
 * off while carrying; the laptop glides the camera with getTarget / setLookAt and then gives it back).
 * A click that ends a drag never counts as a click.
 */
export const EYE = 1500 // mm: her eyes, standing
export const START = { position: [-750, EYE, 1350] as const, target: [-700, 950, -1500] as const, fov: 62 }
const SPEED = 1300 // mm a second, walking
const RISE = 750 // mm a second, up or down
const LOW = 350 // mm: as low as the eye goes (crouched by the bed)
const HIGH = ROOM.h - 220 // as high: just under the ceiling
const UNDER_SOFFIT = ROOM.h - ROOM.soffit.drop - 160 // (under the bulkhead along the west wall, over the desk)
const TURN = 0.0042 // radians a pixel
const STEP = 0.45 // mm of floor a pixel, dragging
const WHEEL = 0.9 // mm a wheel unit
const EASE = 14 // how quickly it catches up (1/s)
const PITCH = 1.35 // looking up / down at most
const KEEP = 230 // from the walls (and the closet's front)
const { w, d } = ROOM
const CLOSET_X0 = w / 2 - CLOSET.opening.w - CLOSET.wall
const CLOSET_Z0 = d / 2 - CLOSET.depth

/** where you may be: inside the walls, out of the closet, between the floor and the ceiling */
function inRoom(p: Vector3) {
  p.x = Math.min(w / 2 - KEEP, Math.max(-w / 2 + KEEP, p.x))
  p.z = Math.min(d / 2 - KEEP, Math.max(-d / 2 + KEEP, p.z))
  const x0 = CLOSET_X0 - KEEP
  const z0 = CLOSET_Z0 - KEEP
  if (p.x > x0 && p.z > z0) {
    if (p.x - x0 < p.z - z0) p.x = x0
    else p.z = z0
  }
  const top = p.x < -w / 2 + ROOM.soffit.w + KEEP ? UNDER_SOFFIT : HIGH
  p.y = Math.min(top, Math.max(LOW, p.y))
  return p
}

const lookOf = (from: Vector3, to: Vector3) => {
  const v = to.clone().sub(from).normalize()
  return { yaw: Math.atan2(-v.x, -v.z), pitch: Math.asin(Math.max(-1, Math.min(1, v.y))) }
}

export function FirstPerson() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const set = useThree((s) => s.set)

  // where it's going (goal) and where it is (now); yaw 0 looks north (-z)
  const st = useMemo(() => {
    const p = new Vector3(...START.position)
    const l = lookOf(p, new Vector3(...START.target))
    return { goal: { p: p.clone(), yaw: l.yaw, pitch: l.pitch }, now: { p: p.clone(), yaw: l.yaw, pitch: l.pitch }, keys: { f: 0, b: 0, l: 0, r: 0, up: 0, down: 0 } }
  }, [])

  const controls = useMemo(
    () => ({
      enabled: true,
      getTarget: (out: Vector3) => out.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(1000).add(camera.position),
      // (the laptop's glide: the camera goes exactly there; looking from there becomes the goal)
      setLookAt(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
        camera.position.set(px, py, pz)
        camera.lookAt(tx, ty, tz)
        const l = lookOf(camera.position, new Vector3(tx, ty, tz))
        Object.assign(st.goal, { yaw: l.yaw, pitch: l.pitch })
        Object.assign(st.now, { yaw: l.yaw, pitch: l.pitch })
        st.goal.p.copy(camera.position)
        st.now.p.copy(camera.position)
      },
      update() {},
    }),
    [camera, st],
  )

  useEffect(() => {
    set({ controls: controls as never })
    return () => set({ controls: null })
  }, [set, controls])

  useEffect(() => {
    const el = gl.domElement
    let drag: { button: number; x: number; y: number } | null = null
    let from = [0, 0]
    const fwd = (k: number) => {
      const g = st.goal
      g.p.x -= Math.sin(g.yaw) * k
      g.p.z -= Math.cos(g.yaw) * k
    }
    const side = (k: number) => {
      const g = st.goal
      g.p.x += Math.cos(g.yaw) * k
      g.p.z -= Math.sin(g.yaw) * k
    }
    const down = (e: PointerEvent) => {
      from = [e.clientX, e.clientY]
      if (e.button === 1 || e.button === 2) drag = { button: e.button, x: e.clientX, y: e.clientY }
      if (e.button === 1) e.preventDefault()
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag.x = e.clientX
      drag.y = e.clientY
      if (!controls.enabled || worldInput.locked) return
      const g = st.goal
      if (drag.button === 1) {
        g.yaw -= dx * TURN
        g.pitch = Math.max(-PITCH, Math.min(PITCH, g.pitch - dy * TURN))
      } else {
        side(-dx * STEP)
        fwd(dy * STEP)
      }
    }
    const up = () => (drag = null)
    const wheel = (e: WheelEvent) => {
      if (!controls.enabled || worldInput.locked) return
      e.preventDefault()
      fwd(-e.deltaY * WHEEL)
    }
    // a drag is not a click: swallow the click at the window before three's handlers see it. Only a click on the
    // canvas, measured from where that press began (any press: the page's menu and buttons are never swallowed;
    // measured only from canvas presses, a click on the menu looked like a long drag and the menu never opened)
    const press = (e: PointerEvent) => (from = [e.clientX, e.clientY])
    const click = (e: MouseEvent) => {
      if (e.target === el && Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 5) e.stopPropagation()
    }
    const map: Record<string, 'f' | 'b' | 'l' | 'r'> = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r', ArrowUp: 'f', ArrowDown: 'b', ArrowLeft: 'l', ArrowRight: 'r' }
    const key = (e: KeyboardEvent, on: boolean) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.isContentEditable) return
      const k = st.keys
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') k.up = on ? 1 : 0
      else if (e.code === 'KeyC') k.down = on ? 1 : 0
      else if (e.code === 'KeyF' && on && controls.enabled && !worldInput.locked) {
        st.goal.p.set(...START.position)
        Object.assign(st.goal, lookOf(st.goal.p, new Vector3(...START.target)))
      }
      const m = map[e.code]
      if (m) k[m] = on ? 1 : 0
    }
    const kd = (e: KeyboardEvent) => key(e, true)
    const ku = (e: KeyboardEvent) => key(e, false)
    const blur = () => Object.assign(st.keys, { f: 0, b: 0, l: 0, r: 0, up: 0, down: 0 })
    const menu = (e: MouseEvent) => e.preventDefault()
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', menu)
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('click', click, true)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', menu)
      window.removeEventListener('pointerdown', press, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
    }
  }, [gl, st, controls])

  useFrame((_, dt) => {
    if (!controls.enabled || worldInput.locked) return // (the hand or the laptop has it)
    const t = Math.min(dt, 0.05)
    const { goal: g, now: n, keys: k } = st
    const step = t * SPEED
    g.p.y += (k.up - k.down) * RISE * t
    const f = k.f - k.b
    const r = k.r - k.l
    if (f || r) {
      const s = (f && r ? Math.SQRT1_2 : 1) * step
      g.p.x += (-Math.sin(g.yaw) * f + Math.cos(g.yaw) * r) * s
      g.p.z += (-Math.cos(g.yaw) * f - Math.sin(g.yaw) * r) * s
    }
    inRoom(g.p)
    const a = 1 - Math.exp(-EASE * t)
    n.p.lerp(g.p, a)
    n.yaw += (g.yaw - n.yaw) * a
    n.pitch += (g.pitch - n.pitch) * a
    camera.position.copy(n.p)
    camera.rotation.set(n.pitch, n.yaw, 0, 'YXZ')
  })

  return null
}
