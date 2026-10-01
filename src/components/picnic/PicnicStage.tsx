import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { LOOK, bruno } from '../quad/bruno'
import { Basket, Blanket, Book, TentedBook } from './Picnic'
import { LAYOUT } from './layout'

/**
 * The picnic on its own (gallery first), full size, in the Quad's evening light: the gingham blanket, the
 * basket (click it to open its lids; click a sandwich to take it), two books stacked and one left open face
 * down. &cam=x,y,z&at=x,y,z to look closely; &view=open starts with its lids up.
 */
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
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
const num = (k: string) => (q?.get(k) ? (q.get(k)!.split(',').map(Number) as [number, number, number]) : null)
const CAM = num('cam')
const AT = num('at')
const OPEN = q?.get('view') === 'open'

function Scene() {
  const background = useMemo(sky, [])
  const [lidUp, setLidUp] = useState(OPEN)
  const [left, setLeft] = useState(4)
  const open = useRef(OPEN ? 1 : 0)
  useFrame((_, dt) => {
    open.current += ((lidUp ? 1 : 0) - open.current) * Math.min(1, dt * 6)
  })
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight
        color={LOOK.light}
        intensity={LOOK.intensity}
        position={LOOK.sun.clone().multiplyScalar(3000)}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-1600}
        shadow-camera-right={1600}
        shadow-camera-top={1600}
        shadow-camera-bottom={-1600}
        shadow-camera-near={100}
        shadow-camera-far={8000}
        shadow-bias={-0.0004}
        shadow-normalBias={2}
      />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2600, 64]} />
      </mesh>
      <Blanket />
      <group position={[LAYOUT.basket.x, LAYOUT.y, LAYOUT.basket.z]} rotation={[0, LAYOUT.basket.rot, 0]}>
        <Basket
          open={open}
          left={left}
          onClick={(e) => (e.stopPropagation(), setLidUp((o) => !o))}
          onSandwich={() => setLeft((n) => Math.max(0, n - 1))}
        />
      </group>
      {LAYOUT.stack.map((b) => (
        <group key={b.k} position={[b.x, LAYOUT.y + b.y, b.z]} rotation={[0, b.rot, 0]}>
          <Book k={b.k} />
        </group>
      ))}
      <group position={[LAYOUT.open.x, LAYOUT.y, LAYOUT.open.z]} rotation={[0, LAYOUT.open.rot, 0]}>
        <TentedBook k={LAYOUT.open.k} />
      </group>
    </>
  )
}

export function PicnicStage() {
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 10, far: 30000, position: CAM ?? [1600, 2100, 2900] }}>
      <Scene />
      <OrbitControls makeDefault target={AT ?? [0, 80, 0]} enableDamping minDistance={300} maxDistance={8000} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  )
}
