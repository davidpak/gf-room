import { createElement, useLayoutEffect, useSyncExternalStore } from 'react'

/**
 * Is the page ready to show? The loading screen (../components/shell/Loader) stays up until it is: the page's
 * code has arrived, every <Canvas> on it (./render/Canvas) has loaded what it suspends on, built its scene,
 * compiled its shaders and drawn a few frames. Each canvas checks in when it mounts and out when it's ready.
 *
 *   phase      code → assets → building → shaders → ready
 *   progress   0..1, for the bar (how far through those, and through the assets by count)
 */
export type Phase = 'code' | 'assets' | 'building' | 'shaders' | 'ready'
type State = { phase: Phase; progress: number; pending: number; mounted: boolean }

let state: State = { phase: 'code', progress: 0.04, pending: 0, mounted: false }
const subs = new Set<() => void>()
const set = (s: Partial<State>) => {
  state = { ...state, ...s }
  subs.forEach((f) => f())
}
const ORDER: Phase[] = ['code', 'assets', 'building', 'shaders', 'ready']
/** (never goes backwards: two canvases at different stages show the one further behind… or the first's) */
const advance = (phase: Phase, progress: number) => {
  if (state.phase === 'ready') return
  if (ORDER.indexOf(phase) < ORDER.indexOf(state.phase)) return
  const was = state.phase
  set({ phase, progress: Math.max(state.progress, progress) })
  if (was !== phase && typeof performance !== 'undefined') performance.mark('page-' + phase)
  if (phase === 'ready' && typeof performance !== 'undefined') {
    if (import.meta.env.DEV) console.info(`ready in ${Math.round(performance.now())} ms`)
  }
}

export const ready = {
  get: () => state,
  /** the page's code is in and it's mounted: a page with no canvas is ready a moment later */
  mounted() {
    set({ mounted: true })
    advance('assets', 0.15)
    let n = 0
    const tick = () => {
      if (++n < 3) return void requestAnimationFrame(tick)
      if (state.pending === 0 && state.phase !== 'ready') advance('ready', 1)
    }
    requestAnimationFrame(tick)
  },
  /** a canvas checking in: done when it's ready, leave if it's taken away first */
  join() {
    set({ pending: state.pending + 1 })
    let active = true
    const out = () => {
      if (!active) return false
      active = false
      set({ pending: Math.max(0, state.pending - 1) })
      return true
    }
    return {
      done: () => void (out() && state.pending === 0 && advance('ready', 1)),
      leave: () => void out(),
    }
  },
  assets: (loaded: number, total: number) => advance('assets', 0.15 + 0.55 * (total ? loaded / total : 1)),
  building: () => advance('building', 0.75),
  shaders: () => advance('shaders', 0.88),
}

export const useReady = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)

/** parts of a scene still loading behind their own Suspense (the physics engine, a model): the loading screen
 *  waits for them too. Use as such a Suspense's fallback: <Suspense fallback={<Waiting />}> */
let waiting = 0
export const stillWaiting = () => waiting
function WaitingMark() {
  useLayoutEffect(() => {
    waiting++
    return () => void waiting--
  }, [])
  return null
}
export const Waiting = () => createElement(WaitingMark)
