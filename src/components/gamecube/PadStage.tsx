import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace, Vector3 } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { Holdable } from '../../lib/physics/Holdable'
import { World } from '../../lib/physics/World'
import { CheckSheet } from '../check/CheckSheet'
import { LOOK, bruno } from '../quad/bruno'
import { ToyControls } from '../stage/ToyControls'
import { Controller } from './Controller'
import { PAD2, checkPad } from './pad'

/**
 * The GameCube controllers on their own (gallery first), full size, in the Quad's evening light: the indigo one and
 * the black one, to carry and turn (the hand: left drag, right drag); START, A, B, X and Y press (they dip). &check:
 * the sheet (dimensions.com's drawing and David's photos beside it, and the checks).
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
const TOP = -Math.min(...PAD2.under.map((u) => u[1]))

function Light({ extent = 400 }: { extent?: number }) {
  const background = useMemo(sky, [])
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight color={LOOK.light} intensity={LOOK.intensity} position={LOOK.sun.clone().multiplyScalar(1200)} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent} shadow-camera-near={50} shadow-camera-far={4000} shadow-bias={-0.0004} shadow-normalBias={0.5} />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2400, 64]} />
      </mesh>
    </>
  )
}

function Scene() {
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get }) // (for screenshots from the console)
  return (
    <>
      <Light />
      <World floorY={0} timeStep={1 / 120}>
        {(
          [
            [-90, 'indigo', 1, 0.15],
            [90, 'black', 2, -0.15],
          ] as const
        ).map(([x, color, pad, rot]) => (
          <Holdable key={pad} position={[x, 2, 0]} rotation={[0, rot, 0]} colliders={false} linearDamping={0.4} angularDamping={0.8} hold={{ lift: 30 }}>
            <Controller color={color} pad={pad} />
            <CuboidCollider args={[PAD2.w / 2 - 4, 13, 26]} position={[0, TOP - 13, -24]} mass={0.1} friction={0.8} />
            {[-1, 1].map((s) => (
              <CuboidCollider key={s} args={[13, 22, 28]} position={[s * 57, 22, 22]} mass={0.05} friction={0.8} />
            ))}
          </Holdable>
        ))}
      </World>
    </>
  )
}

export function PadStage() {
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 5, far: 20000, position: [120, 300, 380] }}>
      <Scene />
      <ToyControls target={[0, 30, 0]} minDistance={100} maxDistance={2500} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  )
}

/** the indigo one alone, still, for the sheet */
function One() {
  return (
    <>
      <Light extent={200} />
      <Controller color="indigo" pad={1} />
    </>
  )
}

export function PadCheck() {
  const results = checkPad()
  const P = PAD2
  const mid = new Vector3(0, TOP / 2, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'reference: dimensions.com, top · side · (front, upside down)', src: '/reference/gamecube/controller.svg' },
        { kind: 'ortho', label: 'top (cable away, up)', from: new Vector3(0, 3000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 1.4 },
        { kind: 'ortho', label: 'left side (as the drawing: top to the right)', from: new Vector3(-3000, TOP / 2, 0), at: mid, up: new Vector3(1, 0, 0), zoom: 1.4 },
        { kind: 'ortho', label: 'from you', from: new Vector3(0, TOP / 2, 3000), at: mid, zoom: 1.4 },
        { kind: 'image', label: "reference: David's (indigo)", src: '/reference/gamecube/pad-indigo.png' },
        { kind: 'image', label: "reference: David's (black)", src: '/reference/gamecube/pad-black.webp' },
        { kind: 'hero', label: 'as David photographed it (drag)', position: [60, 190, 190], target: [0, 30, 0], fov: 30 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `body     ${P.w} × ${P.d} from above, ${P.thick} thick, ${P.mass} kg, cable ${P.cable / 1000} m
stick    at (${P.stick.x}, ${P.stick.z}), gate ${(2 * P.stick.gate).toFixed(1)}, cap Ø${2 * P.stick.cap}, ${P.stick.top} up
A Ø${2 * P.a.r} at (${P.a.x}, ${P.a.z}) · B Ø${2 * P.b.r} · START Ø${2 * P.start.r}
D-pad ${P.dpad.span} (arms ${P.dpad.arm}) · C-stick cap Ø${2 * P.cstick.cap}, both at z ${P.dpad.z}, x ±${P.cstick.x}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
