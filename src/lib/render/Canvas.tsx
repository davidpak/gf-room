import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Canvas as FiberCanvas, useThree, type CanvasProps } from '@react-three/fiber'
import type { Camera, Light, LightShadow, Mesh, Object3D, Scene, WebGLRenderer } from 'three'
import { useProgress } from '@react-three/drei'
import { ready, stillWaiting } from '../ready'

/**
 * Every stage's <Canvas>: R3F's, plus what the loading screen needs to know (../ready): it checks in when it
 * mounts, reports the assets loading, and checks out only once everything it suspends on has arrived, its scene
 * is built, its shaders are compiled (all at once, off the first frames) and it has drawn a few frames, so
 * nothing shows half-made or hitches when it's first looked at.
 *
 *   ?perf   the r3f-perf overlay (FPS, GPU time, draw calls); the dev menu toggles it
 *   ?hitch  the hitch recorder (./Hitches: what each late frame was doing); the dev menu toggles it
 */
const DEV_PARAM = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev')
const SHOW_PERF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf')
const SHOW_HITCH = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hitch')
/** (fetched only when it's asked for) */
const Perf = lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })))
const Hitches = lazy(() => import('./Hitches').then((m) => ({ default: m.Hitches })))

function Progress() {
  const { loaded, total } = useProgress()
  useEffect(() => ready.assets(loaded, total), [loaded, total])
  return null
}

/**
 * The warm-up, as games do it behind their loading screens: everything drawn once, the hidden things too and what's
 * out of view, its shadows as well, so every shader the page will need is compiled and every model and texture is
 * on the graphics card before anything's shown. Otherwise each is done the first time it comes into view, and
 * driving round the Quad hitches (a shader compiling is a frame or two lost).
 */
function warmUp(gl: WebGLRenderer, scene: Scene, camera: Camera) {
  prepare(scene)
  const was: [Object3D, boolean, boolean][] = []
  scene.traverse((o) => {
    was.push([o, o.visible, o.frustumCulled])
    o.visible = true
    o.frustumCulled = false
    // (a morphing thing that's never been shown yet has no weights: given them, so it can be drawn)
    const m = o as Mesh
    if (m.isMesh && m.geometry?.morphAttributes?.position && !m.morphTargetInfluences) m.updateMorphTargets()
  })
  const shadows: { light: Light & { shadow: LightShadow }; auto: boolean }[] = []
  scene.traverse((o) => {
    const l = o as Light & { shadow?: LightShadow }
    if (l.isLight && l.shadow) {
      shadows.push({ light: l as Light & { shadow: LightShadow }, auto: l.shadow.autoUpdate })
      l.shadow.needsUpdate = true
    }
  })
  try {
    gl.compile(scene, camera)
    gl.render(scene, camera)
    performance.mark(`warm-up:${gl.info.render.calls}`)
  } finally {
    for (const [o, v, c] of was) {
      o.visible = v
      o.frustumCulled = c
    }
    for (const sh of shadows) sh.light.shadow.autoUpdate = sh.auto
  }
}

/** whatever the scene does to its materials before they're drawn (../stylize): done before compiling, so it's
 *  the materials actually drawn that get compiled, once */
const prepare = (scene: Scene) => (scene.userData.prepare as (() => void) | undefined)?.()

/** mounted once the scene's built (its Suspense resolved): compile, wait for any stragglers, draw, check out */
function Ready({ done }: { done: () => void }) {
  const { gl, scene, camera, get } = useThree()
  useLayoutEffect(() => ready.building(), [])
  useEffect(() => {
    if (import.meta.env.DEV || DEV_PARAM) (window as unknown as { __r3f: typeof get }).__r3f = get // (for profiling from the console; &dev on a build)
    let live = true
    // (n frames drawn, or that long in time if frames aren't coming: a tab in the background never hangs here)
    const frames = (n: number) => new Promise<void>((r) => {
      const t = setTimeout(r, n * 60)
      const f = () => (--n <= 0 ? (clearTimeout(t), r()) : requestAnimationFrame(f))
      requestAnimationFrame(f)
    })
    ;(async () => {
      ready.shaders()
      try {
        prepare(scene)
        await Promise.race([gl.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 6000))])
      } catch {
        /* (not every renderer can: it'll compile as it draws) */
      }
      // (anything still loading outside the suspense: wait for it, a while)
      performance.mark('ready:compiled')
      const until = performance.now() + 5000
      while (useProgress.getState().active && performance.now() < until) await frames(1)
      // what's still loading behind its own Suspense (the physics engine, the car): wait for it, a while; then a
      // couple of frames for what mounts once it's drawn, its shaders compiled too, everything drawn once, a few
      // frames to settle
      performance.mark('ready:assets')
      const longest = performance.now() + 15000
      while (stillWaiting() > 0 && performance.now() < longest) await frames(1)
      performance.mark('ready:waited')
      await frames(2)
      try {
        prepare(scene)
        await Promise.race([gl.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 6000))])
      } catch {
        /* (as above) */
      }
      performance.mark('ready:compiled-2')
      if (!live) return
      try {
        warmUp(gl, scene, camera)
      } catch (e) {
        console.warn('warm-up', e) // (never keeps the page from showing)
      }
      await frames(4)
      if (live) done()
    })().catch((e) => {
      console.warn('ready', e)
      if (live) done() // (whatever went wrong, the page still shows)
    })
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
      {SHOW_HITCH && (
        <Suspense fallback={null}>
          <Hitches timeGpu={!SHOW_PERF} />
        </Suspense>
      )}
    </FiberCanvas>
  )
}
