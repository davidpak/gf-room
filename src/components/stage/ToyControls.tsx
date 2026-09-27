import { useEffect, type ComponentProps } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MOUSE } from 'three'

/**
 * The camera, the same on every page with things to pick up: the left button belongs to the hand
 * (carry, click), so
 *   press the wheel + drag   look around
 *   right-drag (empty space) pan (right-drag on a thing turns it instead)
 *   wheel                    zoom (while you hold something the hand pauses the camera, and the
 *                            wheel lifts / tilts what you hold)
 * No browser autoscroll on a middle press. Takes any OrbitControls props (target, limits, pan off...).
 */
export function ToyControls(props: ComponentProps<typeof OrbitControls>) {
  return (
    <>
      <OrbitControls makeDefault enableDamping dampingFactor={0.06} {...props} mouseButtons={{ LEFT: -1 as MOUSE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN }} />
      <NoAutoscroll />
    </>
  )
}

/** a middle-button press on the canvas looks around, not the browser's autoscroll */
function NoAutoscroll() {
  const el = useThree((s) => s.gl.domElement)
  useEffect(() => {
    const stop = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    }
    el.addEventListener('mousedown', stop)
    el.addEventListener('auxclick', stop)
    return () => {
      el.removeEventListener('mousedown', stop)
      el.removeEventListener('auxclick', stop)
    }
  }, [el])
  return null
}
