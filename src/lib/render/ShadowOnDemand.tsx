import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { InstancedMesh, Light, LightShadow, Mesh, Object3D } from 'three'

type ShadowLight = Light & { shadow?: LightShadow }

/**
 * Shadow maps are only redrawn when something that casts a shadow actually changed: moved,
 * turned, scaled, appeared, disappeared (a wall fading), or an instanced mesh updated (the
 * blinds tilting), or a mesh reshaped in place (a cable drawn over its moving links). The room is
 * still most of the time, so this skips almost all shadow work.
 *
 * Generic on purpose: nothing needs to report its motion. Each frame it compares every caster's
 * world matrix + visibility with last frame (with a small tolerance, so springs settling forever
 * by a hair don't count). Matrices update during render, so a change is seen one frame late;
 * that is invisible.
 *
 * A shadow-casting light that has no shadow map yet (e.g. it just loaded behind a Suspense)
 * forces an update at once: until its map exists, every lit material samples a missing shadow
 * texture and WebGL drops the draw ("texture format / sampler type mismatch").
 *
 * Only for single-view canvases: with drei <View>s the first view would consume the update.
 */
// (a shadow map's texel is ~1 mm: a move smaller than these never shows; things at rest jitter by about that much
// for ever: the pillows, a plush's limbs; any tighter and the shadows were redrawn every frame)
const TOL_POS = 0.25 // mm
const TOL = 1e-4 // rotation / scale terms
// a change no bigger than this (jitter, a plush's limb settling, a cable's links never quite at rest) redraws them
// at most every SETTLE s; anything more (carried, dropped, a door, a wall going) at once, every frame
const BIG_POS = 1 // mm
const BIG = 2e-3
const SETTLE = 0.125

export function ShadowOnDemand() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const casters = useRef<Object3D[]>([])
  const snap = useRef<Float32Array>(new Float32Array(0))
  const versions = useRef<number[]>([])
  const shapes = useRef<number[]>([]) // each caster's vertex positions version (reshaped in place)
  const lights = useRef<ShadowLight[]>([])
  const small = useRef({ pending: false, last: 0 })

  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])

  useFrame(({ clock }) => {
    let changed = false
    let big = false
    // rescan for added / removed casters and lights (cheap: a walk and a compare, no allocation
    // unless something changed)
    let n = 0
    let same = true
    let nl = 0
    let sameL = true
    scene.traverse((o) => {
      if ((o as Mesh).isMesh && o.castShadow) {
        if (casters.current[n] !== o) same = false
        n++
      } else if ((o as Light).isLight && o.castShadow) {
        if (lights.current[nl] !== o) sameL = false
        nl++
      }
    })
    if (!same || n !== casters.current.length) {
      const list: Object3D[] = []
      scene.traverse((o) => {
        if ((o as Mesh).isMesh && o.castShadow) list.push(o)
      })
      casters.current = list
      snap.current = new Float32Array(list.length * 17)
      versions.current = list.map(() => -1)
      shapes.current = list.map(() => -1)
      changed = big = true
    }
    if (!sameL || nl !== lights.current.length) {
      const list: ShadowLight[] = []
      scene.traverse((o) => {
        if ((o as Light).isLight && o.castShadow) list.push(o as ShadowLight)
      })
      lights.current = list
      changed = big = true
    }
    for (const l of lights.current) if (l.shadow && !l.shadow.map) changed = big = true
    const s = snap.current
    casters.current.forEach((o, i) => {
      const e = o.matrixWorld.elements
      const k = i * 17
      for (let j = 0; j < 16; j++) {
        const tol = j >= 12 && j <= 14 ? TOL_POS : TOL
        const d = Math.abs(e[j] - s[k + j])
        if (d > tol) {
          changed = true
          if (d > (j >= 12 && j <= 14 ? BIG_POS : BIG)) big = true
          s[k + j] = e[j]
        }
      }
      let visible = 1
      for (let p: Object3D | null = o; p; p = p.parent)
        if (!p.visible) {
          visible = 0
          break
        }
      if (s[k + 16] !== visible) {
        changed = big = true
        s[k + 16] = visible
      }
      const im = (o as InstancedMesh).instanceMatrix
      if (im && im.version !== versions.current[i]) {
        changed = big = true
        versions.current[i] = im.version
      }
      const pos = (o as Mesh).geometry?.attributes?.position as { version: number } | undefined
      if (pos && pos.version !== shapes.current[i]) {
        changed = true
        shapes.current[i] = pos.version
      }
    })
    // small changes wait their turn; it's drawn too once they stop (where they came to rest)
    const t = clock.elapsedTime
    const S = small.current
    if (changed) S.pending = true
    if (S.pending && (big || !changed || t - S.last >= SETTLE)) {
      gl.shadowMap.needsUpdate = true
      S.pending = false
      S.last = t
    }
  })

  return null
}
