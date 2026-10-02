import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { getLook, lookBack, lookPose } from '../quad/look'

/**
 * The Quad's looking (../quad/look: a spot clicked, the camera glides in to frame it) on a gallery page, whose camera
 * is ToyControls': while there's something looked at, the camera glides to where it's framed from (the controls
 * let go of it); let go, it glides back to where it was and the controls have it again. The spot's own keys first,
 * then Esc goes back a step.
 */
export function LookCamera() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean; target: Vector3; update: () => void } | null
  const size = useThree((s) => s.size)
  const was = useRef<{ p: Vector3; t: Vector3 } | null>(null)
  const pos = useRef(new Vector3())
  const at = useRef(new Vector3())
  useFrame((_, dtRaw) => {
    if (!controls) return
    const k = 1 - Math.exp(-Math.min(dtRaw, 0.05) * 4.5)
    // (a spot with nothing to frame yet leaves the camera where it is)
    if (getLook() && !was.current) {
      pos.current.copy(camera.position)
      at.current.copy(controls.target)
    }
    if (getLook() && lookPose(pos.current, at.current, size.width / size.height)) {
      if (!was.current) was.current = { p: camera.position.clone(), t: controls.target.clone() }
      controls.enabled = false
      camera.position.lerp(pos.current, k)
      controls.target.lerp(at.current, k)
      controls.update()
    } else if (was.current) {
      camera.position.lerp(was.current.p, k)
      controls.target.lerp(was.current.t, k)
      controls.update()
      if (camera.position.distanceTo(was.current.p) < 2) {
        was.current = null
        controls.enabled = true
      }
    }
  })
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const l = getLook()
      if (!l) return
      if (l.spot.keys?.(e)) return e.preventDefault()
      if (e.key === 'Escape') lookBack()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return null
}
