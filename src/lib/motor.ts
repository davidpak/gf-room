import { typing } from './inputLock'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Hum } from './hum'
import { power } from './power'

/** FEZIBO 47.2 x 23.6: 28.3 in to 46.5 in. Motor state lives in a ref; nothing re-renders per frame. */
export const IN = 25.4 // mm
export const H_MIN = 28.3 * IN
export const H_MAX = 46.5 * IN
const SPEED = 2.4 * IN // mm/s. Real is ~1 in/s; 2.4x keeps it lively.

export type KeypadButton = 'preset1' | 'preset2' | 'preset3' | 'up' | 'down'

const PRESETS: Record<string, number> = {
  preset1: 29.5 * IN, // sitting
  preset2: 38.0 * IN, // stool
  preset3: 44.0 * IN, // standing
}

export type Motor = {
  height: number
  velocity: number
  held: KeypadButton | null
  press: (b: KeypadButton) => void
  release: () => void
}

/** `keyboard: false` leaves the arrow and number keys free (in the room they drive the doll). */
export function useDeskMotor(keyboard = true) {
  const dir = useRef<-1 | 0 | 1>(0)
  const goal = useRef<number | null>(null)
  const hum = useMemo(() => new Hum(), [])
  const state = useMemo<Motor>(
    () => ({
      height: H_MIN,
      velocity: 0,
      held: null,
      press(b) {
        state.held = b
        if (b === 'up') dir.current = 1
        else if (b === 'down') dir.current = -1
        else goal.current = PRESETS[b]
      },
      release() {
        dir.current = 0
        state.held = null
      },
    }),
    [],
  )

  // hardware-style input: pointer release anywhere, arrows hold, 1/2/3 presets
  useEffect(() => {
    const keys: Record<string, KeypadButton> = { ArrowUp: 'up', ArrowDown: 'down', '1': 'preset1', '2': 'preset2', '3': 'preset3' }
    const kd = (e: KeyboardEvent) => {
      if (!keyboard || typing(e)) return
      const b = keys[e.key]
      if (!b || e.repeat) return
      e.preventDefault()
      state.press(b)
    }
    const ku = (e: KeyboardEvent) => keyboard && !typing(e) && keys[e.key] && state.release()
    const pu = () => state.release()
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointercancel', pu)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointercancel', pu)
    }
  }, [state, keyboard])

  useFrame((_, dt) => {
    let v = 0
    if (!power.get().desk) {
      // unplugged: dead
      dir.current = 0
      goal.current = null
    }
    if (dir.current !== 0) {
      goal.current = null
      v = dir.current * SPEED
    } else if (goal.current !== null) {
      const d = goal.current - state.height
      if (Math.abs(d) < 0.3) goal.current = null
      else v = Math.sign(d) * Math.min(SPEED, Math.abs(d) / dt)
    }
    const next = Math.min(H_MAX, Math.max(H_MIN, state.height + v * dt))
    if (next === state.height) v = 0
    const wasMoving = state.velocity !== 0
    state.height = next
    state.velocity = v
    if (wasMoving !== (v !== 0)) (v !== 0 ? hum.start() : hum.stop())
  })

  return state
}
