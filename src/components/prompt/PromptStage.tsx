import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CuboidCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { MeshStandardMaterial, PCFShadowMap, Quaternion, Vector3 } from 'three'
import { Effects } from '../stage/StageLights'
import { TOY, ToyLights } from '../stage/ToyLights'
import { ToyControls } from '../stage/ToyControls'
import { Stylize } from '../../lib/stylize'
import { createMapleMaterial } from '../../lib/mapleMaterial'
import { World } from '../../lib/physics/World'
import { Holdable } from '../../lib/physics/Holdable'
import { Prompts, type PromptIcon, type PromptItem } from './Prompts'

/**
 * The fix-it prompt on its own (gallery first): three toy blocks on a patch of the desk, each with
 * its prompt showing from the start so the look can be judged. Click one: it pops, sparkles, and
 * the block hops (or, moved off its spot, floats home). Carry a block away and its prompt comes
 * back once it's at rest.
 */
const maple = createMapleMaterial('#efbe8b', 0.6)
const BLOCKS: { key: string; label: string; icon: PromptIcon; color: string; x: number }[] = [
  { key: 'home', label: 'Put it back', icon: 'home', color: '#f6c6d8', x: -170 },
  { key: 'plug', label: 'Plug it back in', icon: 'plug', color: '#c9e4c5', x: 0 },
  { key: 'tidy', label: 'Tidy the cable', icon: 'tidy', color: '#c8d4f5', x: 170 },
]
const S = 60 // block size
const _q = new Quaternion()

function Block({ b }: { b: (typeof BLOCKS)[number] }) {
  const { rapier } = useRapier()
  const body = useRef<RapierRigidBody>(null)
  const demo = useRef(true) // showing from the start, so it can be seen
  const anim = useRef<{ t: number; from: Vector3; q: Quaternion } | null>(null)
  const home = useMemo(() => new Vector3(b.x, S / 2, 0), [b.x])
  const mat = useMemo(() => new MeshStandardMaterial({ color: b.color, roughness: 1 }), [b.color])
  const pos = (out: Vector3) => {
    const t = body.current?.translation()
    return t ? out.set(t.x, t.y, t.z) : out.copy(home)
  }

  useFrame((_, dt) => {
    const a = anim.current
    const r = body.current
    if (!a || !r) return
    a.t = Math.min(1, a.t + dt / 0.7)
    const k = a.t * a.t * (3 - 2 * a.t)
    const p = a.from.clone().lerp(home, k)
    p.y += Math.sin(Math.PI * k) * 70
    r.setNextKinematicTranslation(p)
    r.setNextKinematicRotation(_q.copy(a.q).slerp(new Quaternion(), k))
    if (a.t >= 1) {
      anim.current = null
      r.setLinvel({ x: 0, y: 0, z: 0 }, false)
      r.setAngvel({ x: 0, y: 0, z: 0 }, false)
      r.setBodyType(rapier.RigidBodyType.Dynamic, true)
    }
  })

  const item: PromptItem = {
    key: b.key,
    label: b.label,
    icon: b.icon,
    at: (out) => pos(out).add(new Vector3(0, S / 2 + 18, 0)),
    when: () => !anim.current && (demo.current || pos(new Vector3()).distanceTo(home) > 30),
    run: () => {
      const r = body.current
      if (!r) return
      demo.current = false
      const q = r.rotation()
      anim.current = { t: 0, from: pos(new Vector3()), q: new Quaternion(q.x, q.y, q.z, q.w) }
      r.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
    },
  }
  return (
    <>
      <Holdable bodyRef={body} position={home.toArray()} colliders="cuboid" hold={{ lift: 40 }}>
        <RoundedBox args={[S, S, S]} radius={10} smoothness={4} material={mat} castShadow receiveShadow />
      </Holdable>
      <Prompts items={[item]} />
    </>
  )
}

function Scene() {
  return (
    <>
      <ToyLights extent={500} />
      <Stylize />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -26, 0]}>
        <circleGeometry args={[2400, 64]} />
        <meshStandardMaterial color={TOY.floor} roughness={1} />
      </mesh>
      <RoundedBox args={[900, 25, 500]} radius={8} smoothness={3} position={[0, -12.5, 0]} material={maple} receiveShadow />
      <World floorY={-26}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[450, 12.5, 250]} position={[0, -12.5, 0]} friction={0.9} />
        </RigidBody>
        {BLOCKS.map((b) => (
          <Block key={b.key} b={b} />
        ))}
      </World>
    </>
  )
}

export function PromptStage() {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: [-120, 420, 620], fov: 32, near: 5, far: 20000 }} gl={{ antialias: false }}>
      <Scene />
      <Effects aoRadius={12} />
      <ToyControls target={[0, 30, 0]} minDistance={150} maxDistance={3000} />
    </Canvas>
  )
}
