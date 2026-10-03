import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { ShadowOnDemand } from './ShadowOnDemand'
import { DetailCull } from './DetailCull'

/**
 * Keeps the frame rate up:
 *   shadows on demand    shadow maps are only redrawn when something moved (./ShadowOnDemand)
 *   detail cull          little things seen little cast no shadow, or aren't drawn (./DetailCull)
 *   (no adaptive resolution: changing the pixel ratio mid-session rebuilds every effect buffer and
 *    flashes a frame; stages use a fixed, modest ratio instead)
 *   ?perf                the r3f-perf overlay: ./Canvas
 *
 * Mount once inside a single-view <Canvas> (it's part of <Effects>).
 */
export function Quality() {
  const get = useThree((s) => s.get)
  // dev only: expose the R3F store for profiling from the console (window.__r3f())
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __r3f: typeof get }).__r3f = get
  }, [get])
  return (
    <>
      <ShadowOnDemand />
      <DetailCull />
    </>
  )
}
