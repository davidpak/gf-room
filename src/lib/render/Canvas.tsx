import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Canvas as FiberCanvas, useThree, type CanvasProps } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { ready } from '../ready'

/**
 * Every stage's <Canvas>: R3F's, plus what the loading screen needs to know (../ready): it checks in when it
 * mounts, reports the assets loading, and checks out only once everything it suspends on has arrived, its scene
 * is built, its shaders are compiled (all at once, off the first frames) and it has drawn a few frames, so
 * nothing shows half-made or hitches when it's first looked at.
 *
 *   ?perf   the r3f-perf overlay (FPS, GPU time, draw calls); the dev menu toggles it
 */
const DEV_PARAM = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev')
const SHOW_PERF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf')
/** (fetched only when it's asked for) */
const Perf = lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })))

function Progress() {
  const { loaded, total } = useProgress()
  useEffect(() => ready.assets(loaded, total), [loaded, total])
  return null
}

/** mounted once the scene's built (its Suspense resolved): compile, wait for any stragglers, draw, check out */
function Ready({ done }: { done: () => void }) {
  const { gl, scene, camera, get } = useThree()
  useLayoutEffect(() => ready.building(), [])
  useEffect(() => {
    if (import.meta.env.DEV || DEV_PARAM) (window as unknown as { __r3f: typeof get }).__r3f = get // (for profiling from the console; &dev on a build)
    let live = true
    const frames = (n: number) => new Promise<void>((r) => {
      const f = () => (--n <= 0 ? r() : requestAnimationFrame(f))
      requestAnimationFrame(f)
    })
    ;(async () => {
      ready.shaders()
      try {
        await gl.compileAsync(scene, camera)
      } catch {
        /* (not every renderer can: it'll compile as it draws) */
      }
      // (anything still loading outside the suspense: wait for it, a while)
      for (let i = 0; i < 300 && useProgress.getState().active; i++) await frames(1)
      await frames(4)
      if (live) done()
    })()
    return () => void (live = false)
  }, [gl, scene, camera, get, done])
  return null
}

export function Canvas({ children, ...props }: CanvasProps & { children?: ReactNode }) {
  const handle = useRef<ReturnType<typeof ready.join> | null>(null)
  useEffect(() => {
    handle.current = ready.join()
    return () => {
      handle.current?.leave()
      handle.current = null
    }
  }, [])
  const done = useCallback(() => handle.current?.done(), [])
  return (
    <FiberCanvas {...props}>
      <Progress />
      <Suspense fallback={null}>
        {children}
        <Ready done={done} />
      </Suspense>
      {SHOW_PERF && (
        <Suspense fallback={null}>
          <Perf position="top-left" />
        </Suspense>
      )}
    </FiberCanvas>
  )
}
