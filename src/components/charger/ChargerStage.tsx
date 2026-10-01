import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Canvas } from '../../lib/render/Canvas'
import { RoundedBox } from '@react-three/drei'
import { CatmullRomCurve3, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, PCFShadowMap, TubeGeometry, Vector2, Vector3 } from 'three'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { Stylize } from '../../lib/stylize'
import { createMapleMaterial } from '../../lib/mapleMaterial'
import { receptacleShape } from '../room/Lamp'
import { LAMP } from '../lamp/spec'
import { CHARGER, STAND, cablePoints, chargerPose, checkCharger, portLayout } from './spec'
import { Charger, PLUG_LENGTH, UsbCPlug, wovenMaterial } from './Charger'
import { ChargerColliders, LiveCharger } from './ChargerPhysics'
import { World } from '../../lib/physics/World'
import { ToyControls } from '../stage/ToyControls'

/**
 * The charger on its own, on a patch of the maple desk, beside an outlet stand (a stand-in for the
 * lamp base), all real physics (ChargerPhysics): pick up and carry the charger, the cable, either
 * plug; fold the prongs, pull the plug, plug it into the outlet. &check shows the
 * verification sheet: Apple's and ChargerLAB's photos beside the same fixed views, and the spec's
 * check.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const B = CHARGER.body
const PORT = portLayout()
const OUT = 30 // how far the plug comes out when pulled

type State = { folded: boolean; plugged: boolean; pose: 0 | 1 }

/** The outlet stand: a soft lilac-silver puck (like the lamp base) with one receptacle face up. */
function Stand() {
  const geo = useMemo(() => {
    const T = STAND.top
    const puck = new LatheGeometry(
      [new Vector2(0, 0), new Vector2(STAND.r, 0), new Vector2(STAND.r, T - 5), new Vector2(STAND.r - 1.5, T - 1.5), new Vector2(STAND.r - 5, T), new Vector2(0, T)],
      72,
    )
    const face = new ExtrudeGeometry(receptacleShape(), { depth: 1.4, bevelEnabled: true, bevelThickness: 1.1, bevelSize: 1.1, bevelSegments: 3, curveSegments: 20 })
    return { puck, face }
  }, [])
  const mat = useMemo(
    () => ({
      metal: new MeshStandardMaterial({ color: '#d9d3e4', roughness: 1 }),
      face: new MeshStandardMaterial({ color: '#3d3656', roughness: 1 }),
      well: new MeshStandardMaterial({ color: '#1b1626', roughness: 1 }),
    }),
    [],
  )
  // the face turned so its slots run along X (their centre line at slotLine), the ground hole toward +X
  return (
    <group position={[STAND.at[0], 0, STAND.at[1]]}>
      <mesh geometry={geo.puck} material={mat.metal} castShadow receiveShadow />
      <group rotation={[0, Math.PI / 2, 0]}>
        <group position={[0, STAND.top, STAND.slotLine + 4]} /* receptacleShape puts the slots 4 above its middle */>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} material={mat.well}>
            <planeGeometry args={[LAMP.outlet.w - 2, LAMP.outlet.h - 2]} />
          </mesh>
          <mesh geometry={geo.face} material={mat.face} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} castShadow receiveShadow />
        </group>
      </group>
    </group>
  )
}

/**
 * The charger and its cable, moved by springs: pose (desk <-> outlet), the plug in or out. The cable
 * is re-laid (and kept 3 ft) whenever either moves; the far plug lies at its end.
 */
function Rig({ state, set, cable = true }: { state: State; set?: (s: Partial<State>) => void; cable?: boolean }) {
  const group = useRef<Group>(null!)
  const plug = useRef<Group>(null!)
  const tube = useRef<Mesh>(null!)
  const far = useRef<Group>(null!)
  const pose = useRef({ x: state.pose as number, v: 0 })
  const out = useRef({ x: state.plugged ? 0 : 1, v: 0 })
  const last = useRef({ p: -1, o: -1 })
  const uLen = useMemo(() => ({ value: CHARGER.cable.length }), [])
  const woven = useMemo(() => wovenMaterial(uLen), [uLen])

  useFrame((_, dt) => {
    const spring = (s: { x: number; v: number }, target: number, k: number, d: number) => {
      const h = Math.min(dt, 1 / 30)
      s.v += (-k * (s.x - target) - d * s.v) * h
      s.x += s.v * h
      return s.x
    }
    const p = Math.min(1, Math.max(0, spring(pose.current, state.pose, 28, 10.5)))
    const o = Math.min(1.05, Math.max(0, spring(out.current, state.plugged ? 0 : 1, 90, 14)))
    const P = chargerPose(p)
    group.current.position.copy(P.position)
    group.current.rotation.set(0, 0, P.angle)
    plug.current.position.set(PORT.at.x + o * OUT, PORT.at.y, 0)
    if (!cable || (Math.abs(p - last.current.p) < 1e-4 && Math.abs(o - last.current.o) < 1e-4)) return
    last.current = { p, o }
    const curve = new CatmullRomCurve3(cablePoints(P.cableStart(o * OUT), p), false, 'centripetal')
    tube.current.geometry.dispose()
    tube.current.geometry = new TubeGeometry(curve, 480, CHARGER.cable.r, 10, false)
    uLen.value = curve.getLength()
    // the far plug lies flat at the end, its shell pointing on along the cable
    const end = curve.getPoint(1)
    const t = curve.getTangent(1).setY(0).normalize()
    far.current.position.copy(end).addScaledVector(t, PLUG_LENGTH).setY(CHARGER.plug.mold[1] / 2)
    far.current.rotation.set(0, Math.atan2(t.z, -t.x), 0)
  })

  const togglePlug = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    set?.({ plugged: !state.plugged })
  }
  return (
    <>
      <group ref={group}>
        <Charger folded={state.folded} onToggleFold={() => set?.({ folded: !state.folded })} />
        <group ref={plug} visible={cable}>
          <UsbCPlug onClick={togglePlug} />
        </group>
      </group>
      <mesh ref={tube} material={woven} visible={cable} castShadow receiveShadow />
      <group ref={far} visible={cable}>
        <UsbCPlug />
      </group>
    </>
  )
}

function Scene({
  state,
  set,
  cable = true,
  stand = true,
  live = false,
}: {
  state: State
  set?: (s: Partial<State>) => void
  cable?: boolean
  stand?: boolean
  /** real physics (the page); the check sheet uses the laid-out, still version */
  live?: boolean
}) {
  return (
    <>
      <ToyLights extent={450} normalBias={0.35} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -26, 0]}>
        <circleGeometry args={[3000, 64]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      {/* a patch of the desk's maple top */}
      <RoundedBox args={[820, 25, 640]} radius={8} smoothness={3} position={[-15, -12.5, 150]} material={maple} receiveShadow />
      {stand && <Stand />}
      {live && set ? (
        <World floorY={-26} timeStep={1 / 120}>
          <ChargerColliders />
          <LiveCharger state={state} set={set} />
        </World>
      ) : (
        <Rig state={state} set={set} cable={cable} />
      )}
    </>
  )
}

const HERO: [number, number, number] = [-170, 120, 230]
const TARGET: [number, number, number] = [0, 30, 10]

const button: React.CSSProperties = {
  background: '#2f2850',
  color: '#efe9ff',
  border: '1px solid #5a4f8a',
  borderRadius: 999,
  padding: '8px 14px',
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
}

export function ChargerStage() {
  const [state, setState] = useState<State>({ folded: true, plugged: true, pose: 0 })
  const set = (s: Partial<State>) =>
    setState((prev) => {
      const next = { ...prev, ...s }
      if (next.pose === 1) next.folded = false // it can only go in with the prongs out
      return next
    })
  return (
    <>
      <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: HERO, fov: 30, near: 2, far: 20000 }} gl={{ antialias: false }}>
        <Scene state={state} set={set} live />
        <Effects aoRadius={4} />
        <ToyControls target={TARGET} minDistance={60} maxDistance={2500} />
      </Canvas>
      <div style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button style={button} onClick={() => set({ folded: !state.folded })} disabled={state.pose === 1}>
          {state.folded ? 'unfold the prongs' : 'fold the prongs'}
        </button>
        <button style={button} onClick={() => set({ plugged: !state.plugged })}>
          {state.plugged ? 'pull the plug' : 'plug it back in'}
        </button>
        <button style={button} onClick={() => set({ pose: state.pose ? 0 : 1 })}>
          {state.pose ? 'back on the desk' : 'plug into the outlet'}
        </button>
      </div>
    </>
  )
}

export function ChargerCheck() {
  const results = checkCharger()
  const C = CHARGER
  const c = new Vector3(0, B.h / 2, 0)
  const folded = () => <Scene state={{ folded: true, plugged: true, pose: 0 }} cable={false} stand={false} />
  const open = () => <Scene state={{ folded: false, plugged: true, pose: 0 }} cable={false} stand={false} />
  const pulled = () => <Scene state={{ folded: false, plugged: false, pose: 0 }} stand={false} />
  return (
    <CheckSheet
      scene={folded}
      views={[
        { kind: 'image', label: 'reference: Apple, face on, prongs folded', src: '/reference/adapter-70w-GEO.jpg' },
        { kind: 'ortho', label: 'front (+Z): outline, duck head L, logo', from: new Vector3(0, B.h / 2, 3000), at: c, zoom: 3.4 },
        {
          kind: 'text',
          label: 'spec (mm) and its check',
          text: `body   ${B.w} × ${B.h} × ${B.t}, corners r ${B.corner}, edges r ${B.edge}
duck   ${C.duck.in} in × ${C.duck.down} down
logo   ${C.logo.w} × ${C.logo.h}, ${C.logo.up} above centre
blade  ${C.prong.w} × ${C.prong.t}, ${C.prong.out} out, ${C.prong.apart} apart, ${C.prong.down} down
port   ${C.port.w} × ${C.port.h}, ${C.port.down} down
plug   ${C.plug.mold.join(' × ')}, one sleeve
cable  ⌀${2 * C.cable.r}, ${C.cable.length}

${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.what}: ${r.value}`).join('\n')}`,
        },
        { kind: 'image', label: 'reference: ChargerLAB, the prong edge (28.66)', src: '/reference/cl70-2023062802171023.jpg' },
        { kind: 'ortho', label: 'prong edge (-X): slots, folded blades', from: new Vector3(-3000, B.h / 2, 0), at: c, zoom: 3.4 },
        { kind: 'ortho', label: 'top: tips peek over, slots run out', from: new Vector3(0, 3000, 0), at: new Vector3(0, 0, 0), up: new Vector3(0, 0, -1), zoom: 3.4 },
        { kind: 'image', label: 'reference: Apple, prongs out', src: '/reference/adapter-70w-prongs.png' },
        { kind: 'hero', label: 'prongs out, as Apple shows it (drag)', position: [-190, 72, 250], target: [0, B.h / 2, 0], fov: 22, scene: open },
        { kind: 'hero', label: 'the port, the plug pulled (drag)', position: [200, 95, 150], target: [40, 40, 0], fov: 26, scene: pulled },
      ]}
    />
  )
}
