import { useSyncExternalStore } from 'react'
import { dolphinOn } from './dolphin'
import { blipSound, bootSound, cheerSound, clickSound, confirmSound, lidSound, spinSound, tvOffSound, tvOnSound } from '../../lib/sound/gamecube'

/**
 * The setup's state, one for the page (./Setup, the Quad's ./QuadGame): the TV on or off, the console's power, its
 * lid, where the disc is (in the console, in its case, or flying between them), the case open or shut, and what the
 * game's showing. What's on the screen follows from it (./screen).
 *
 *   POWER    (the light grey button, back left) the console on: it boots (the TV, if it's on, plays our chime), then
 *            the game's title, or with no disc in it the console's own menu
 *   OPEN     (the front left one) the lid opens; while it's up the game's stopped ("the Disc Cover is open"); a
 *            click on the lid shuts it, and the game starts again
 *   RESET    (front right, sunk in its ring) starts it over
 *   the disc with the lid up, a click on it takes it out to its case (opening the case); a click on it in the case
 *            puts it back
 *   the TV   its own power button; on with the console off: the blue VIDEO 1 screen
 *   the pads START or A: on from the title (VS.), to the results (she wins), and round again; B steps back
 */
export type Scene = 'boot' | 'title' | 'vs' | 'win'
export type Screen = 'off' | 'video' | 'boot' | 'title' | 'vs' | 'win' | 'cover' | 'nodisc'
export type DiscAt = 'console' | 'case' | 'flying'
export type CubeState = {
  tv: boolean
  tvAt: number // (when the TV last went on or off: its tube warming up, or zipping down)
  power: boolean
  lid: boolean // (up)
  disc: DiscAt
  flight: { to: 'console' | 'case'; at: number } | null
  caseOpen: boolean
  scene: Scene
  at: number // (when the scene began)
  pressed: Record<string, number> // (a button's last press, for its little dip)
}

const BOOT = 5.2 // (s: the console's start before the game, or its menu)
export const FLIGHT = 0.75

let s: CubeState = { tv: true, tvAt: -10, power: false, lid: false, disc: 'console', flight: null, caseOpen: false, scene: 'boot', at: 0, pressed: {} }
const subs = new Set<() => void>()
const set = (o: Partial<CubeState>) => {
  s = { ...s, ...o }
  subs.forEach((f) => f())
}
export const getCube = () => s
export const useCube = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getCube)
const now = () => performance.now() / 1000
const press = (k: string) => ({ ...s.pressed, [k]: now() })

/** what's on the screen now */
export function screenOf(c: CubeState, t = now()): Screen {
  if (!c.tv) return 'off'
  if (!c.power) return 'video'
  if (c.scene === 'boot' && t - c.at < BOOT) return 'boot'
  if (c.lid) return 'cover'
  if (c.disc !== 'console') return 'nodisc'
  return c.scene === 'boot' ? 'title' : c.scene
}

export function pressPower() {
  clickSound()
  if (s.power) {
    set({ power: false, pressed: press('power') })
    if (!s.lid && s.disc === 'console') spinSound(false)
    return
  }
  set({ power: true, scene: 'boot', at: now(), pressed: press('power') })
  if (s.tv && !dolphinOn()) bootSound() // (with Dolphin on the TV, its own sound's playing)
  if (!s.lid && s.disc === 'console') setTimeout(() => spinSound(true), 400)
}
export function pressReset() {
  clickSound()
  set({ pressed: press('reset') })
  if (!s.power) return
  set({ scene: 'boot', at: now() })
  if (s.tv && !dolphinOn()) bootSound() // (with Dolphin on the TV, its own sound's playing)
}
export function pressOpen() {
  clickSound()
  set({ pressed: press('open') })
  if (s.lid) return
  set({ lid: true })
  setTimeout(() => lidSound(true), 40)
  if (s.power && s.disc === 'console') spinSound(false)
}
/** the lid pushed shut: with the disc in and the console on, the game starts again */
export function shutLid() {
  if (!s.lid || s.flight) return
  lidSound(false)
  set({ lid: false })
  if (s.power && s.disc === 'console') {
    spinSound(true)
    if (s.scene === 'boot' && now() - s.at < BOOT) return
    set({ scene: 'title', at: now() })
  }
}
export function pressTv() {
  clickSound()
  const on = !s.tv
  set({ tv: on, tvAt: now(), pressed: press('tv') })
  if (on) tvOnSound()
  else tvOffSound()
}
/** the disc taken out to its case (the lid up), or put back */
export function moveDisc() {
  if (!s.lid || s.flight) return
  if (s.disc === 'console') {
    set({ caseOpen: true, disc: 'flying', flight: { to: 'case', at: now() + 0.25 } })
    setTimeout(() => set({ disc: 'case', flight: null }), (0.25 + FLIGHT) * 1000)
  } else if (s.disc === 'case') {
    set({ disc: 'flying', flight: { to: 'console', at: now() } })
    setTimeout(() => set({ disc: 'console', flight: null }), FLIGHT * 1000)
  }
}
/** back as it came: Melee in it, the lid shut (the fix-it prompt) */
export function tidyCube() {
  if (s.flight) return
  if (s.lid) lidSound(false)
  set({ disc: 'console', lid: false, caseOpen: false })
}
export function toggleCase() {
  if (s.flight) return
  clickSound()
  set({ caseOpen: !s.caseOpen })
}
/** a pad's button: START or A on through the game, B back */
export function padButton(b: 'start' | 'a' | 'b' | 'x' | 'y', pad: number) {
  set({ pressed: press(`${b}${pad}`) })
  if (screenOf(s) !== 'title' && screenOf(s) !== 'vs' && screenOf(s) !== 'win') return
  const sc = screenOf(s) as Scene
  const forward = b === 'start' || b === 'a'
  if (forward) {
    const next: Scene = sc === 'title' ? 'vs' : sc === 'vs' ? 'win' : 'title'
    set({ scene: next, at: now() })
    if (next === 'win') cheerSound()
    else confirmSound()
  } else if (b === 'b' && sc !== 'title') {
    set({ scene: sc === 'win' ? 'vs' : 'title', at: now() })
    blipSound()
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __cube: { get: getCube, pressPower, pressOpen, pressReset, pressTv, shutLid, moveDisc, toggleCase, padButton, tidyCube } }) // (for trying it from the console)
