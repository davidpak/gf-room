import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { Vector3, type Group, type PerspectiveCamera, type PointLight } from 'three'
import { Doll, type DollRig } from './Doll'
import { useToyIdle } from './useToyIdle'
import { DOLL } from './spec'

/**
 * David the crochet doll, playable (like Bruno's car, but a toy):
 *
 *   WASD / arrows   walk (relative to the camera)      shift   hurry
 *   space           hop; space again in the air: a big boing (enough to get up on the bed)
 *   scroll          zoom: in = close and top-down, out = pulled back and level, the whole room
 *
 * Camera, Bruno style: not an orbit camera. It sits up near the ceiling, backed off and to one
 * side, looking down at him at a fixed angle, and glides after him; it never leaves the room.
 *
 * Movement is Rapier's own character controller (the physics engine the room already uses):
 * it slides along walls, steps over small ledges, snaps to the floor and shoves pillows. The
 * walk: easy steps where the swinging leg lifts (he has no knees), hips and shoulders twisting
 * against each other, gentle arm swing, a soft bob on each footfall. A stretch on take-off, a
 * boing on landing, and standing still he fidgets like a toy (./useToyIdle).
 *
 * Must be inside a <World> (physics).
 */
const MOVE = {
  walk: 650, // mm/s
  run: 1150,
  accel: 11, // 1/s: how quickly he gets up to speed / stops
  turn: 10, // 1/s: how quickly he turns to face where he's going
  gravity: 9810 * 0.8, // a touch floaty, it's a toy
  hop: 380, // mm
  boing: 720, // mm, the second hop in the air: up onto the bed (675) or the desk with room to spare
  stride: 150, // mm per step: easy, not tippy-toe
  radius: 52, // capsule: as wide as he is, arms included
}
// the follow camera. Zoom changes the angle: zoomed in it is close and top-down on him; zoomed out
// it pulls back and levels off to show the room (the lamp, the string lights up by the ceiling).
// Each pair is [zoomed in, zoomed out]; x toward the west, z toward the south, heights above his feet
const CAM = {
  side: [-240, -650],
  back: [850, 2900],
  height: [1350, 1780],
  lookY: [220, 1050],
  fov: 56,
  follow: 3.5,
  margin: 160,
  start: 0.4, // 0 = all the way in, 1 = all the way out
}
const mix = (ab: number[], t: number) => ab[0] + (ab[1] - ab[0]) * t
const CENTER = DOLL.height / 2
const HALF = CENTER - MOVE.radius
const UP = new Vector3(0, 1, 0)

type Keys = { f: number; b: number; l: number; r: number; run: boolean; jump: boolean }

/** WASD / arrows / shift / space, ignoring keys typed into inputs. */
function useKeys() {
  const k = useRef<Keys>({ f: 0, b: 0, l: 0, r: 0, run: false, jump: false })
  useEffect(() => {
    const map: Record<string, keyof Keys> = {
      KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
    }
    const set = (e: KeyboardEvent, down: boolean) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return
      const dir = map[e.code]
      if (dir) {
        ;(k.current[dir] as number) = down ? 1 : 0
        e.preventDefault()
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') k.current.run = down
      else if (e.code === 'Space') {
        if (down && !e.repeat) k.current.jump = true
        e.preventDefault()
      }
    }
    const kd = (e: KeyboardEvent) => set(e, true)
    const ku = (e: KeyboardEvent) => set(e, false)
    const blur = () => Object.assign(k.current, { f: 0, b: 0, l: 0, r: 0, run: false, jump: false })
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return k
}

const lerpAngle = (a: number, b: number, t: number) => a + (((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * t

export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }

type Props = {
  spawn: [number, number, number]
  heading?: number
  /** drive the camera (the main view); off for check-sheet views */
  follow?: boolean
  /** where the camera may go (the room's inside) */
  bounds?: Bounds
}

export function PlayerDoll({ spawn, heading = 0, follow = false, bounds }: Props) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const yawGroup = useRef<Group>(null)
  const heroLight = useRef<PointLight>(null)
  const rig = useRef<DollRig | null>(null)
  const { world, rapier } = useRapier()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const keys = useKeys()
  const idleOn = useRef(true)
  const toy = useToyIdle(rig, idleOn)

  // created per mount (React may mount, unmount and mount again in development)
  const controllerRef = useRef<ReturnType<typeof world.createCharacterController> | null>(null)
  useEffect(() => {
    const c = world.createCharacterController(2) // 2 mm skin
    c.setUp({ x: 0, y: 1, z: 0 })
    c.enableAutostep(45, 25, false) // hop up small ledges (a drawer rail, a rug) without jumping
    c.enableSnapToGround(30)
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    c.setMinSlopeSlideAngle((35 * Math.PI) / 180)
    c.setApplyImpulsesToDynamicBodies(true) // shove pillows around
    c.setCharacterMass(0.6)
    controllerRef.current = c
    return () => {
      controllerRef.current = null
      world.removeCharacterController(c)
    }
  }, [world])

  // scroll to zoom the follow camera
  const zoom = useRef(CAM.start)
  useEffect(() => {
    if (!follow) return
    const wheel = (e: WheelEvent) => {
      zoom.current = Math.min(1, Math.max(0, zoom.current + e.deltaY * 0.0008))
    }
    window.addEventListener('wheel', wheel, { passive: true })
    return () => window.removeEventListener('wheel', wheel)
  }, [follow])

  const st = useRef({
    vel: new Vector3(),
    vy: 0,
    grounded: false,
    jumps: 0,
    air: 0,
    yaw: heading,
    phase: 0,
    move: 0,
    cam: new Vector3(),
    look: new Vector3(),
    placed: false,
  })
  const v = useMemo(() => ({ fwd: new Vector3(), right: new Vector3(), wish: new Vector3(), want: new Vector3(), goal: new Vector3() }), [])

  useFrame((_, dt) => {
    const b = body.current
    const c = collider.current
    const r = rig.current
    const controller = controllerRef.current
    if (!b || !c || !controller) return
    const s = st.current
    const h = Math.min(dt, 1 / 30)
    const k = keys.current

    // what the player wants, relative to where the camera looks
    camera.getWorldDirection(v.fwd)
    v.fwd.y = 0
    v.fwd.normalize()
    v.right.crossVectors(v.fwd, UP)
    v.wish.copy(v.fwd).multiplyScalar(k.f - k.b).addScaledVector(v.right, k.r - k.l)
    const wants = v.wish.lengthSq() > 0.01
    if (wants) v.wish.normalize()
    v.want.copy(v.wish).multiplyScalar(k.run ? MOVE.run : MOVE.walk)
    s.vel.lerp(v.want, 1 - Math.exp(-MOVE.accel * h))

    // hop, and a bigger boing in the air
    if (k.jump) {
      k.jump = false
      if (s.grounded || s.air < 0.12) {
        s.vy = Math.sqrt(2 * MOVE.gravity * MOVE.hop)
        s.jumps = 1
        toy.play([
          [0, 'squash', 1.12],
          [0.12, 'squash', 1],
        ])
      } else if (s.jumps === 1) {
        s.vy = Math.sqrt(2 * MOVE.gravity * MOVE.boing)
        s.jumps = 2
        toy.play([
          [0, 'squash', 1.16],
          [0.14, 'squash', 1],
          [0, 'arms', 0.9],
          [0.35, 'arms', 0],
        ])
      }
    }
    s.vy -= MOVE.gravity * h

    // let the character controller resolve it against the room
    const want = { x: s.vel.x * h, y: s.vy * h, z: s.vel.z * h }
    controller.computeColliderMovement(c, want)
    const m = controller.computedMovement()
    const grounded = controller.computedGrounded()
    if (grounded && s.vy <= 0) {
      if (!s.grounded && s.air > 0.18) {
        // landing: a squash that boings back, bigger for bigger falls
        const hard = Math.min(1, s.air / 0.7)
        toy.play([
          [0, 'squash', 0.9 - 0.08 * hard],
          [0.1, 'squash', 1],
        ])
      }
      s.vy = 0
      s.jumps = 0
      s.air = 0
    } else s.air += h
    if (s.vy > 0 && m.y < want.y * 0.5) s.vy = 0 // bumped his head
    s.grounded = grounded
    const p = b.translation()
    const next = { x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }
    if (next.y < -1500) Object.assign(next, { x: spawn[0], y: spawn[1] + CENTER + 300, z: spawn[2] }) // fell out of the world
    b.setNextKinematicTranslation(next)

    // face where he's going
    if (wants) s.yaw = lerpAngle(s.yaw, Math.atan2(v.wish.x, v.wish.z), 1 - Math.exp(-MOVE.turn * h))
    if (yawGroup.current) yawGroup.current.rotation.y = s.yaw

    // the follow camera: up high, backed off to one side, gliding after him, kept inside the room
    if (follow) {
      const z = zoom.current
      const feetY = next.y - CENTER
      v.goal.set(next.x + mix(CAM.side, z), feetY + mix(CAM.height, z), next.z + mix(CAM.back, z))
      if (bounds) {
        v.goal.x = Math.min(bounds.maxX - CAM.margin, Math.max(bounds.minX + CAM.margin, v.goal.x))
        v.goal.z = Math.min(bounds.maxZ - CAM.margin, Math.max(bounds.minZ + CAM.margin, v.goal.z))
        v.goal.y = Math.min(bounds.maxY - CAM.margin, v.goal.y)
      }
      const lookY = feetY + mix(CAM.lookY, z)
      // keep the camera out of furniture: if something solid is between him and where the camera
      // wants to be, it comes in just in front of it (pillows don't count)
      {
        const from = { x: next.x, y: lookY, z: next.z }
        const dx = v.goal.x - from.x
        const dy = v.goal.y - from.y
        const dz = v.goal.z - from.z
        const dist = Math.hypot(dx, dy, dz)
        if (dist > 1) {
          const ray = new rapier.Ray(from, { x: dx / dist, y: dy / dist, z: dz / dist })
          const hit = world.castRay(ray, dist, true, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, b)
          if (hit) {
            const toi = Math.max(120, (hit as unknown as { timeOfImpact: number }).timeOfImpact - 90)
            v.goal.set(from.x + (dx / dist) * toi, from.y + (dy / dist) * toi, from.z + (dz / dist) * toi)
          }
        }
      }
      if (!s.placed) {
        s.placed = true
        s.cam.copy(v.goal)
        s.look.set(next.x, lookY, next.z)
        camera.fov = CAM.fov
        camera.updateProjectionMatrix()
      }
      const f = 1 - Math.exp(-CAM.follow * h)
      s.cam.lerp(v.goal, f)
      s.look.lerp(v.goal.set(next.x, lookY, next.z), f * 1.6)
      camera.position.copy(s.cam)
      camera.lookAt(s.look)
    }
    if (heroLight.current) {
      heroLight.current.position.set(next.x + (s.cam.x - next.x) * 0.35, next.y + 420, next.z + (s.cam.z - next.z) * 0.35)
    }

    // the walk, layered on top of the idle (which runs first and sets the base pose)
    if (!r) return
    const speed = Math.hypot(s.vel.x, s.vel.z)
    s.move += (Math.min(1.5, speed / MOVE.walk) - s.move) * (1 - Math.exp(-10 * h))
    idleOn.current = s.move < 0.06 && grounded
    const wk = grounded ? Math.min(1.2, s.move) : 0
    s.phase += ((speed * h) / MOVE.stride) * Math.PI
    const sw = Math.sin(s.phase)
    const cw = Math.cos(s.phase)
    // legs swing from the hips; the one swinging forward lifts a little (no knees, so the lift sells the step)
    r.legL.rotation.x = sw * 0.36 * wk
    r.legR.rotation.x = -sw * 0.36 * wk
    r.legL.position.y = Math.max(0, -cw) * 8 * wk
    r.legR.position.y = Math.max(0, cw) * 8 * wk
    // arms swing gently against the legs
    r.armL.rotation.x = -sw * 0.26 * wk
    r.armR.rotation.x = sw * 0.26 * wk
    // hips twist with the stride, shoulders twist back, the head keeps looking ahead
    r.pelvis.rotation.y = sw * 0.09 * wk
    r.torso.rotation.y = -sw * 0.17 * wk
    r.head.rotation.y = sw * 0.08 * wk
    // a soft bob on each footfall, a little weight shift, leaning into it
    r.root.position.y = (1 - Math.cos(2 * s.phase)) * 3.2 * wk
    r.root.rotation.z += sw * 0.03 * wk
    r.torso.rotation.x = 0.05 * Math.min(1, wk)
    r.head.rotation.z += Math.sin(s.phase + 0.7) * 0.025 * wk
    // in the air: legs split, arms up
    const air = grounded ? 0 : Math.min(1, s.air * 6)
    if (air > 0) {
      r.legL.rotation.x += 0.35 * air
      r.legR.rotation.x -= 0.25 * air
      r.armL.rotation.z += 0.55 * air
      r.armR.rotation.z -= 0.55 * air
    }
  })

  return (
    <>
    {follow && <pointLight ref={heroLight} color="#ffe2c4" intensity={55} decay={1} distance={1200} />}
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[spawn[0], spawn[1] + CENTER, spawn[2]]}>
      <CapsuleCollider ref={collider} args={[HALF, MOVE.radius]} />
      <group ref={yawGroup} position={[0, -CENTER, 0]} rotation={[0, heading, 0]}>
        <Doll rig={rig} />
      </group>
    </RigidBody>
    </>
  )
}
