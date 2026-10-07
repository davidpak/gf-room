import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sphere, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three'

/**
 * Small things, seen small, cost less: each little mesh's size on screen (its bounding sphere's radius in
 * pixels, from the camera) decides how it's drawn.
 *
 *   NO_SHADOW px or less   drawn, but it casts no shadow (a few pixels' shadow you can't see is a whole draw)
 *   GONE px or less        not drawn at all (smaller than a pixel: a screw across the Quad, a button seen from afar)
 *
 * Done with layers, so nothing else is disturbed: SEEN is drawn by the camera but not by the shadow cameras (they
 * only draw layer 0); FAR by neither. The pointer sees SEEN too. Only meshes that are just on layer 0 are touched
 * (not the merged-away originals of <Static>, not anything else on its own layers), and never instanced or skinned
 * ones, nor ones that say not to (`userData.keep`) or never cull (cables: a huge sphere). Each crossing has some give
 * (hysteresis), so nothing flickers at the line. A change in what casts asks for the shadows to be drawn again
 * (./ShadowOnDemand keeps them otherwise).
 *
 * Why: measured on David's machine, the frame's cost was draw calls, not pixels: the Quad drew 1,310 a frame (690
 * of them shadows), 600 of its 993 meshes under 4 cm across.
 */
export const SEEN = 5
/** ?nocull: off (to compare) */
const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nocull')
const FAR = 6
const NO_SHADOW = 3 // px
const GONE = 1 // px
const GIVE = 1.25 // (back in when it's this much past the line)
const BIG = 400 // mm: bigger than this, never culled (no saving worth the check)

type State = 0 | 1 | 2 // drawn and casting, drawn without its shadow, not drawn
const LAYER = [0, SEEN, FAR]
/** still where we put it (or something else has taken it over since: <Static> merging it away) */
const ours = (m: Mesh, st: State) => m.layers.mask === 1 << LAYER[st]
const _s = new Sphere()
const _v = new Vector3()

export function DetailCull() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const raycaster = useThree((s) => s.raycaster)
  const gl = useThree((s) => s.gl)
  const list = useRef<Mesh[]>([])
  const state = useRef(new WeakMap<Mesh, State>())
  const frame = useRef(0)

  useEffect(() => {
    camera.layers.enable(SEEN)
    raycaster.layers.enable(SEEN)
    return () => {
      // (taken away: everything back as it was)
      for (const m of list.current) {
        const st = state.current.get(m)
        if (st && ours(m, st)) m.layers.set(0)
      }
      list.current = []
      state.current = new WeakMap()
    }
  }, [camera, raycaster])

  useFrame(() => {
    if (OFF) return
    const f = frame.current++
    const cam = camera as PerspectiveCamera
    if (!cam.isPerspectiveCamera) return
    // who's small: looked for now and then (things come and go)
    if (f % 90 === 0) {
      const next: Mesh[] = []
      scene.traverse((o: Object3D) => {
        const m = o as Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean }
        if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.userData.keep) return
        const st = state.current.get(m) ?? 0
        if (!ours(m, st)) return void state.current.delete(m) // (on layers of its own: not ours)
        const g = m.geometry
        if (!g.boundingSphere) g.computeBoundingSphere()
        if (!g.boundingSphere || g.boundingSphere.radius > BIG) return
        next.push(m)
      })
      // (any that dropped out: back as they were)
      const keep = new Set(next)
      for (const m of list.current) {
        const st = state.current.get(m)
        if (!keep.has(m) && st && ours(m, st)) {
          m.layers.set(0)
          state.current.set(m, 0)
        }
      }
      list.current = next
    }
    // sizes, a sixth of them each frame (each checked ten times a second at 60)
    const px = gl.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360)) / cam.zoom
    const L = list.current
    let shadowsChanged = false
    for (let i = f % 6; i < L.length; i += 6) {
      const m = L[i]
      // (a geometry swapped in since the list was made hasn't measured itself yet)
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
      _s.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld)
      const d = _v.copy(_s.center).applyMatrix4(cam.matrixWorldInverse).z
      // (behind the camera, or at it: as if big; the frustum culls it anyway)
      const r = d >= -1 ? Infinity : (_s.radius / -d) * px
      const was = state.current.get(m) ?? 0
      if (!ours(m, was)) {
        state.current.delete(m)
        continue
      }
      // (in a state already: it stays till it's GIVE past the line)
      const under = (line: number, s: State) => r <= (was >= s ? line * GIVE : line)
      const next: State = under(GONE, 2) ? 2 : under(NO_SHADOW, 1) ? 1 : 0
      if (next === was) continue
      m.layers.set(LAYER[next])
      state.current.set(m, next)
      if (m.castShadow) shadowsChanged = true
    }
    if (shadowsChanged) gl.shadowMap.needsUpdate = true
  })
  return null
}
