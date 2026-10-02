import { useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { LOOK, bruno } from '../quad/bruno'

/** the gallery pages' light: the Quad's evening sky, its sun and shadows, a lawn */
function sky() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  LOOK.sky.forEach((col, i) => grad.addColorStop(i / (LOOK.sky.length - 1), col))
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 256)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const LAWN = bruno({ color: '#7fae57' })
export function Light({ extent = 1200 }: { extent?: number }) {
  const background = useMemo(sky, [])
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight color={LOOK.light} intensity={LOOK.intensity} position={LOOK.sun.clone().multiplyScalar(2400)} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent} shadow-camera-near={50} shadow-camera-far={6000} shadow-bias={-0.0004} shadow-normalBias={0.5} />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[4000, 64]} />
      </mesh>
    </>
  )
}

