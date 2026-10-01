import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BoxGeometry, CanvasTexture, PCFSoftShadowMap, SRGBColorSpace, Vector3 } from 'three'
import { Canvas } from '../../../lib/render/Canvas'
import { LOOK, bruno } from '../../quad/bruno'
import { Throw } from '../Throw'
import { PAPER, PAPER_COLORS } from '../spec'
import { PaperPlane, planeAt, takeSheet, usePlanePhase } from './PaperPlane'
import '../art.css'

/**
 * The paper airplane on its own (gallery first): a stack of coloured sheets on the art blanket, the top one laid out
 * to fold (./PaperPlane). Fold it into a dart and flick it to throw it; the camera watches where it goes.
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
const SHEET = new BoxGeometry(PAPER.w, 0.5, PAPER.h)
const sheetMats = PAPER_COLORS.map((c) => bruno({ color: c, shade: '#9d93ad' }))
const HOME: [number, number, number] = [-120, 12, 120] // (just over the blanket's swell)

/** the stack of sheets: click it for a fresh one */
function Stack() {
  return (
    <group
      position={[340, 11, 60]}
      rotation={[0, 0.25, 0]}
      onClick={(e) => (e.stopPropagation(), takeSheet())}
      onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} geometry={SHEET} material={sheetMats[i % sheetMats.length]} position={[Math.sin(i * 2.3) * 3, 0.25 + i * 0.55, Math.cos(i * 1.7) * 3]} rotation={[0, Math.sin(i) * 0.03, 0]} castShadow receiveShadow />
      ))}
    </group>
  )
}

/** the camera keeps an eye on the plane once it's thrown */
function Watch() {
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null
  const phase = usePlanePhase()
  const home = useMemo(() => new Vector3(0, 0, 60), [])
  useFrame((_, dt) => {
    if (!controls) return
    const want = phase === 'flying' || phase === 'landed' ? planeAt : phase === 'folding' ? home : null
    if (!want) return
    controls.target.lerp(want, Math.min(1, dt * 2.5))
    controls.update()
  })
  return null
}

function Scene() {
  const background = useMemo(sky, [])
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get }) // (for screenshots from the console)
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight color={LOOK.light} intensity={LOOK.intensity} position={LOOK.sun.clone().multiplyScalar(3000)} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-1800} shadow-camera-right={1800} shadow-camera-top={1800} shadow-camera-bottom={-1800} shadow-camera-near={100} shadow-camera-far={8000} shadow-bias={-0.0004} shadow-normalBias={2} />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[60000, 64]} />
      </mesh>
      <Throw />
      <Stack />
      <PaperPlane home={HOME} colors={PAPER_COLORS} />
      <Watch />
    </>
  )
}

function Hint() {
  const phase = usePlanePhase()
  const text = {
    folding: 'fold it into a dart: hover a dashed line, click to fold (in the right order, or it crumples!)',
    ball: 'crumpled! click it to pick it up and flick it, or take a new sheet',
    held: 'flick up and let go to throw it',
    flying: 'wheee',
    landed: 'click it to pick it up again, or take a new sheet',
  }[phase]
  return (
    <div className="paintbox on" style={{ flexDirection: 'row', gap: 12 }}>
      <span>{text}</span>
      <button className="paintbox-btn" onClick={() => takeSheet()}>
        new sheet
      </button>
    </div>
  )
}

export function PlaneStage() {
  return (
    <>
      <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 32, near: 10, far: 120000, position: [-120, 980, 1100] }}>
        <Scene />
        <OrbitControls makeDefault target={[-120, 0, 120]} enableDamping minDistance={150} maxDistance={20000} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      <Hint />
    </>
  )
}
