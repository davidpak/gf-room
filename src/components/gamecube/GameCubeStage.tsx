import { useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { CanvasTexture, PCFSoftShadowMap, SRGBColorSpace, Vector3, type Group } from 'three'
import { Canvas } from '../../lib/render/Canvas'
import { Holdable } from '../../lib/physics/Holdable'
import { World } from '../../lib/physics/World'
import { CheckSheet } from '../check/CheckSheet'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { LOOK, bruno } from '../quad/bruno'
import { ToyControls } from '../stage/ToyControls'
import { DiscFlight } from './Cable'
import { CUBE, checkCube } from './cube'
import { anchor } from './anchors'
import { GameCube } from './GameCube'
import { getCube, shutLid, tidyCube } from './state'

/**
 * The GameCube on its own (gallery first), full size, in the Quad's evening light: carry it, turn it (the hand: left
 * drag, right drag), press POWER (back left, light grey: its lamp lights), OPEN (front right: the lid pops), RESET;
 * click the lid to shut it; with the lid up click the disc to take it out (it's set down beside it) and again to put
 * it back. Its prompt puts Melee back and shuts the lid. &check: its sheet (the references beside it, and the checks).
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

function Light({ extent = 600 }: { extent?: number }) {
  const background = useMemo(sky, [])
  return (
    <>
      <primitive attach="background" object={background} />
      <directionalLight color={LOOK.light} intensity={LOOK.intensity} position={LOOK.sun.clone().multiplyScalar(1500)} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent} shadow-camera-near={50} shadow-camera-far={5000} shadow-bias={-0.0004} shadow-normalBias={0.6} />
      <mesh material={LAWN} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2400, 64]} />
      </mesh>
    </>
  )
}

function Scene() {
  const get = useThree((s) => s.get)
  if (import.meta.env.DEV) Object.assign(window, { __r3f: get }) // (for screenshots from the console)
  const body = useRef<Group>(null)
  const prompt = useMemo<PromptItem[]>(
    () => [
      {
        key: 'disc',
        label: 'Put Melee back in',
        icon: 'tidy',
        at: (o) => o.set(0, CUBE.h + 140, 0),
        when: () => getCube().disc !== 'console' && !getCube().flight,
        run: tidyCube,
      },
      {
        key: 'lid',
        label: 'Close the lid',
        icon: 'tidy',
        at: (o) => o.set(0, CUBE.h + 140, 0),
        when: () => getCube().lid && getCube().disc === 'console' && !getCube().flight,
        run: shutLid,
      },
    ],
    [],
  )
  return (
    <>
      <Light />
      <World floorY={0} timeStep={1 / 120}>
        <Holdable position={[0, 2, 0]} colliders={false} linearDamping={0.4} angularDamping={0.8} hold={{ lift: 40 }}>
          <group ref={body}>
            <GameCube />
          </group>
          <CuboidCollider args={[CUBE.w / 2, CUBE.h / 2, CUBE.d / 2]} position={[0, CUBE.h / 2, 0]} mass={CUBE.mass} friction={0.8} />
          <CuboidCollider args={[CUBE.handle.w / 2, (CUBE.handle.y1 - CUBE.handle.y0) / 2, CUBE.handle.out / 2]} position={[0, (CUBE.handle.y0 + CUBE.handle.y1) / 2, -CUBE.d / 2 - CUBE.handle.out / 2]} mass={0.1} friction={0.8} />
        </Holdable>
      </World>
      {/* (where the disc's set down, taken out: beside it on the grass) */}
      <group ref={anchor('seat-case')} position={[200, 0.2, 40]} rotation={[0, 0.4, 0]} />
      <DiscFlight />
      <Prompts items={prompt} />
    </>
  )
}

export function GameCubeStage() {
  return (
    <Canvas flat shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ fov: 30, near: 5, far: 20000, position: [420, 360, 560] }}>
      <Scene />
      <ToyControls target={[0, 50, 0]} minDistance={120} maxDistance={3000} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  )
}

/** the console alone, still, for the sheet */
function One() {
  return (
    <>
      <Light extent={300} />
      <GameCube />
    </>
  )
}

export function GameCubeCheck() {
  const results = checkCube()
  const C = CUBE
  const mid = new Vector3(0, C.h / 2, 0)
  return (
    <CheckSheet
      scene={() => <One />}
      views={[
        { kind: 'image', label: 'reference: dimensions.com, side · front · top', src: '/reference/gamecube/dimensions.svg' },
        { kind: 'ortho', label: 'top (front down)', from: new Vector3(0, 3000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 0.8 },
        { kind: 'ortho', label: 'front', from: new Vector3(0, C.h / 2, 3000), at: mid, zoom: 1.25 },
        { kind: 'ortho', label: 'right side', from: new Vector3(3000, C.h / 2, 0), at: mid, zoom: 1.25 },
        { kind: 'image', label: 'reference: Commons, the back (silver)', src: '/reference/gamecube/rear.jpg' },
        { kind: 'ortho', label: 'back', from: new Vector3(0, C.h / 2, -3000), at: mid, zoom: 1.25 },
        { kind: 'image', label: 'reference: Commons, Evan-Amos, the lid up', src: '/reference/gamecube/open.jpg' },
        { kind: 'image', label: "reference: David's", src: '/reference/gamecube/david.png' },
        { kind: 'hero', label: 'as David photographed it (drag)', position: [260, 230, 300], target: [0, 50, 0], fov: 30 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `body     ${C.w} × ${C.h} × ${C.d}, ${C.mass} kg, band seam ${C.band} up
lid      sides x ${C.lid.x0}/${C.lid.x1}, front ${C.lid.frontEnds}-${C.lid.frontMid} (bow r ${C.lid.bowR}), notches r ${C.lid.notchR}
window   Ø${2 * C.window.r} · buttons in Ø${2 * C.buttons.power.ring} rings, POWER ${(C.buttons.power.z + C.d / 2).toFixed(1)} from the back
panel    ${C.panel.w} × ${(C.panel.y1 - C.panel.y0).toFixed(1)}, ${C.panel.proud} proud · ports Ø${2 * C.ports.r} at ${C.ports.xs.join(', ')}
vents    ${C.vents.n} × ${C.vents.n} of ${C.vents.cell}, ${C.vents.y0}-${C.vents.y1} up, both sides
handle   ${C.handle.w} wide, ${C.handle.y0}-${C.handle.y1} up, ${C.handle.out} out (est.)

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
      ]}
    />
  )
}
