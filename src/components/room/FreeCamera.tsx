import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import CameraControlsImpl from 'camera-controls'

/**
 * A free camera for looking at every little thing, like the viewport in Blender:
 *
 *   left drag / middle drag      orbit around what you're looking at
 *   right drag / shift + middle  pan
 *   wheel                        zoom toward the cursor (it keeps going: push right through things)
 *   W A S D                      fly forward, left, back, right
 *   Q / E                        fly down / up
 *   shift                        faster
 *   F                            back to the diorama view
 *
 * A click that ends a drag never counts as a click, so orbiting across the lamp doesn't toggle it.
 * Room frame, millimetres. It starts outside the room, up in the west-south-west, looking in: a long
 * lens on a little diorama (the near walls and the ceiling cut away, see ./Shell).
 */
export const VIEW = {
  fov: 38,
  position: [-5100, 5250, 3100] as const,
  target: [300, 480, -300] as const,
}
const SPEED = 1400 // mm per second
const FAST = 3.2

export function FreeCamera() {
  const controls = useRef<CameraControlsImpl>(null)
  const keys = useRef({ f: 0, b: 0, l: 0, r: 0, u: 0, d: 0, fast: false })

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const A = CameraControlsImpl.ACTION
    c.mouseButtons.left = A.NONE // the left button is the hand's (carry, click); look with the middle button
    c.mouseButtons.middle = A.ROTATE
    c.mouseButtons.right = A.TRUCK
    c.mouseButtons.wheel = A.DOLLY
    c.dollyToCursor = true
    c.infinityDolly = true
    c.minDistance = 250
    c.maxDistance = 16000
    c.smoothTime = 0.18
    c.draggingSmoothTime = 0.08
    c.azimuthRotateSpeed = 0.6
    c.polarRotateSpeed = 0.6
    c.setLookAt(...VIEW.position, ...VIEW.target, false)

    // shift + middle drag pans, like Blender
    const down = (e: PointerEvent) => {
      if (e.button === 1) c.mouseButtons.middle = e.shiftKey ? A.TRUCK : A.ROTATE
    }
    // a drag is not a click: swallow the click at the window before three's handlers see it
    let from = [0, 0]
    const press = (e: PointerEvent) => (from = [e.clientX, e.clientY])
    const click = (e: MouseEvent) => {
      if (Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 5) e.stopPropagation()
    }
    const map: Record<string, keyof typeof keys.current> = {
      KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r', KeyE: 'u', KeyQ: 'd',
      ArrowUp: 'f', ArrowDown: 'b', ArrowLeft: 'l', ArrowRight: 'r',
    }
    const key = (e: KeyboardEvent, on: boolean) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.current.fast = on
      else if (e.code === 'KeyF' && on) c.setLookAt(...VIEW.position, ...VIEW.target, true)
      const k = map[e.code]
      if (k) (keys.current[k] as number) = on ? 1 : 0
    }
    const kd = (e: KeyboardEvent) => key(e, true)
    const ku = (e: KeyboardEvent) => key(e, false)
    const blur = () => Object.assign(keys.current, { f: 0, b: 0, l: 0, r: 0, u: 0, d: 0, fast: false })
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('click', click, true)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerdown', press, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const k = keys.current
    const step = Math.min(dt, 0.05) * SPEED * (k.fast ? FAST : 1)
    if (k.f - k.b) c.forward((k.f - k.b) * step, false)
    if (k.r - k.l) c.truck((k.r - k.l) * step, 0, false)
    if (k.u - k.d) c.elevate((k.u - k.d) * step, false)
  })

  return <CameraControls ref={controls} makeDefault />
}
