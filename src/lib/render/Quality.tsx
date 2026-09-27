import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Perf } from 'r3f-perf'
import { ShadowOnDemand } from './ShadowOnDemand'

/**
 * Keeps the frame rate up:
 *   shadows on demand    shadow maps are only redrawn when something moved (./ShadowOnDemand)
 *   (no adaptive resolution: changing the pixel ratio mid-session rebuilds every effect buffer and
 *    flashes a frame; stages use a fixed, modest ratio instead)
 *   ?perf                add it to the URL for the r3f-perf overlay: FPS, GPU time, draw calls
 *
 * Mount once inside a single-view <Canvas> (it's part of <Effects>).
 */
const SHOW_PERF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf')

export function Quality() {
  const get = useThree((s) => s.get)
  // dev only: expose the R3F store for profiling from the console (window.__r3f())
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __r3f: typeof get }).__r3f = get
  }, [get])
  return (
    <>
      <ShadowOnDemand />
      {SHOW_PERF && <Perf position="top-left" />}
    </>
  )
}
