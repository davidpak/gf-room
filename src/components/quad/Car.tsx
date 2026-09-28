import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Vector3, type DirectionalLight, type Group, type PerspectiveCamera } from 'three'
import { SET, inIsland } from './set'
import { isHolding } from '../../lib/physics/Hand'
import { LOOK, brunoify, shared } from './bruno'

/**
 * Their little car (a toy, mint with a cream roof), driven like Bruno Simon's: W / ↑ go, S / ↓ brake
 * and reverse, A D / ← → steer, Space the handbrake, R back to the start. An arcade car on the flat:
 * a bicycle model (it turns about its back wheels, tighter slow), a push forward, drag, bumps off the
 * trees and the halls. Drawn with a little life: it pitches as it speeds up and brakes, leans into
 * turns, the wheels roll and the front ones steer. The camera follows from above and behind (always
 * the same way round, like Bruno's), the wheel zooms, and the sun's shadow follows it.
 *
 * `state` is shared: where it is and how fast (the polaroids watch it).
 */
export type CarState = { x: number; z: number; heading: number; v: number }
export type Obstacle = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'box'; x: number; z: number; w: number; d: number }

const BODY = { l: 420, w: 220, h: 110 }
export const CAR_BODY = BODY
const WHEEL = { r: 46, w: 34, base: 250, track: 200 }
const RADIUS = 150 // (for bumping into things)
const MAX = 2800
const REVERSE = 1100
const ACCEL = 3000
const BRAKE = 5200
const STEER = 0.6
const VIEW = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('view') : null
const C = { body: '#9fdcc8', roof: '#fbeedd', trim: '#f4a9b4', wheel: '#2b2833', hub: '#fbeedd', glass: '#3b4466', light: '#fff4c8' }

const keys = new Set<string>()
const MAP: Record<string, string> = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake', KeyR: 'reset' }

export function Car({ state, obstacles, movers, paused }: { state: { current: CarState }; obstacles: Obstacle[]; /** obstacles that move (the benches, where they are now), read every frame */ movers?: () => Obstacle[]; paused?: boolean }) {
  const body = useRef<Group>(null)
  const chassis = useRef<Group>(null)
  const wheels = useRef<(Group | null)[]>([])
  const fronts = useRef<(Group | null)[]>([])
  const sim = useRef({ steer: 0, pitch: 0, roll: 0, spin: 0, bob: 0 })
  const zoom = useRef(1)
  useLayoutEffect(() => void (body.current && brunoify(body.current)), []) // (in the Quad's light)
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = MAP[e.code]
      if (!k) return
      e.preventDefault()
      keys.add(k)
    }
    const up = (e: KeyboardEvent) => MAP[e.code] && keys.delete(MAP[e.code])
    const blur = () => keys.clear()
    const wheel = (e: WheelEvent) => !isHolding() && (zoom.current = Math.min(1.8, Math.max(0.55, zoom.current * (1 + Math.sign(e.deltaY) * 0.08))))
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('wheel', wheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('wheel', wheel)
    }
  }, [])

  const camAt = useRef(new Vector3(0, 0, 0))
  const first = useRef(true)
  useFrame(({ scene }, delta) => {
    const sun = scene.getObjectByName('sun') as DirectionalLight | undefined
    const dt = Math.min(delta, 1 / 30)
    const s = state.current
    const m = sim.current
    const k = (n: string) => !paused && keys.has(n)
    if (k('reset')) Object.assign(s, { x: SET.start.x, z: SET.start.z, heading: SET.start.heading, v: 0 })
    // the push forward, the brakes, the drag
    const throttle = (k('up') ? 1 : 0) - (k('down') ? 1 : 0)
    let a = 0
    if (throttle > 0) a = s.v < 0 ? BRAKE : ACCEL * (1 - Math.max(0, s.v) / MAX)
    else if (throttle < 0) a = s.v > 0 ? -BRAKE : -ACCEL * 0.6 * (1 - Math.max(0, -s.v) / REVERSE)
    s.v += a * dt
    s.v *= 1 - (throttle ? 0.25 : 1.4) * dt // (it coasts to a stop)
    if (k('brake')) s.v *= 1 - 5 * dt
    if (Math.abs(s.v) < 4 && !throttle) s.v = 0
    // the steering: gentler the faster it goes; it turns about its back wheels
    const want = ((k('left') ? 1 : 0) - (k('right') ? 1 : 0)) * STEER * (1 - Math.min(0.55, Math.abs(s.v) / MAX * 0.55))
    m.steer += (want - m.steer) * Math.min(1, dt * 8)
    const yaw = (s.v / WHEEL.base) * Math.tan(m.steer) * (k('brake') ? 1.5 : 1)
    s.heading += yaw * dt
    let nx = s.x + Math.sin(s.heading) * s.v * dt
    let nz = s.z + Math.cos(s.heading) * s.v * dt
    // bumping: out of the trees, the halls, the stands; the edges of the Quad
    let hit = 0
    for (const o of movers ? [...obstacles, ...movers()] : obstacles) {
      if (o.kind === 'circle') {
        const dx = nx - o.x
        const dz = nz - o.z
        const d = Math.hypot(dx, dz)
        const min = o.r + RADIUS
        if (d < min && d > 1e-6) {
          nx = o.x + (dx / d) * min
          nz = o.z + (dz / d) * min
          hit = Math.max(hit, 1)
        }
      } else {
        const px = Math.max(o.x - o.w / 2, Math.min(nx, o.x + o.w / 2))
        const pz = Math.max(o.z - o.d / 2, Math.min(nz, o.z + o.d / 2))
        const dx = nx - px
        const dz = nz - pz
        const d = Math.hypot(dx, dz)
        if (d < RADIUS) {
          if (d > 1e-6) {
            nx = px + (dx / d) * RADIUS
            nz = pz + (dz / d) * RADIUS
          }
          hit = 1
        }
      }
    }
    // the island's edge: it stops there (no driving off)
    if (!inIsland(nx, nz, 170)) {
      nx = s.x
      nz = s.z
      hit = 1
    }
    if (hit) s.v *= 1 - Math.min(1, 6 * dt) // (a bump soaks up the speed)
    s.x = nx
    s.z = nz
    // alive: pitch with the push, lean into the turn, a little bob; the wheels roll and steer
    m.pitch += (-a / ACCEL * 0.05 - m.pitch) * Math.min(1, dt * 6)
    m.roll += (-yaw * s.v / MAX * 0.09 - m.roll) * Math.min(1, dt * 6)
    m.spin += (s.v * dt) / WHEEL.r
    m.bob += dt * (4 + Math.abs(s.v) / 300)
    const b = body.current
    if (b) {
      b.position.set(s.x, 0, s.z)
      b.rotation.y = s.heading
    }
    const c = chassis.current
    if (c) {
      c.rotation.set(m.pitch, 0, m.roll)
      c.position.y = WHEEL.r + 14 + Math.sin(m.bob) * Math.min(1.5, Math.abs(s.v) / 1000)
    }
    wheels.current.forEach((w) => w && (w.rotation.x = m.spin))
    fronts.current.forEach((f) => f && (f.rotation.y = m.steer))
    // the camera: from above and behind, always the same way round; the sun's shadow follows
    const target = new Vector3(s.x, 0, s.z)
    if (first.current) camAt.current.copy(target)
    camAt.current.lerp(target, first.current ? 1 : Math.min(1, dt * 4))
    first.current = false
    const z = zoom.current
    // Bruno's camera: high, from the front and a little to the side, always the same way round
    camera.position.set(camAt.current.x + 1500 * z, 3300 * z, camAt.current.z + 3900 * z)
    camera.lookAt(camAt.current.x, 80, camAt.current.z - 150)
    if (VIEW === 'bench') {
      // (?view=bench: down low, in front of the bench from their photo)
      const b = SET.benches[SET.photos.bench]
      camera.position.set(b.x + 380, 230, b.z + 560)
      camera.lookAt(b.x, 110, b.z)
    }
    if (VIEW === 'sign') {
      // (?view=sign: in front of the first lawn sign)
      const g = SET.signs[0]
      camera.position.set(g.x + 200, 300, g.z + 620)
      camera.lookAt(g.x, 210, g.z)
    }
    if (VIEW === 'top') {
      // (?view=top: straight down over the whole island, to hold up against the overhead photo)
      camera.position.set((SET.island.x0 + SET.island.x1) / 2, 15000, (SET.island.z0 + SET.island.z1) / 2 + 1)
      camera.lookAt((SET.island.x0 + SET.island.x1) / 2, 0, (SET.island.z0 + SET.island.z1) / 2)
    }
    // the see-through: the trees open round the line from the camera to the car
    shared.cam.value.copy(camera.position)
    shared.car.value.set(s.x, 150, s.z)
    if (sun) {
      sun.position.copy(LOOK.sun).multiplyScalar(4000).add(camAt.current)
      sun.target.position.set(camAt.current.x, 0, camAt.current.z)
      sun.target.updateMatrixWorld()
    }
  })

  const wheel = (i: number, x: number, z: number, front: boolean) => (
    <group key={i} position={[x, WHEEL.r, z]}>
      <group ref={(r) => void (front ? (fronts.current[i] = r) : null)}>
        <group ref={(r) => void (wheels.current[i] = r)}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[WHEEL.r, WHEEL.r, WHEEL.w, 20]} />
            <meshStandardMaterial color={C.wheel} roughness={0.8} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[Math.sign(x) * (WHEEL.w / 2 + 0.5), 0, 0]}>
            <cylinderGeometry args={[WHEEL.r * 0.5, WHEEL.r * 0.5, 2, 16]} />
            <meshStandardMaterial color={C.hub} roughness={0.5} />
          </mesh>
        </group>
      </group>
    </group>
  )
  return (
    <group ref={body}>
      {wheel(0, -WHEEL.track / 2, WHEEL.base / 2, true)}
      {wheel(1, WHEEL.track / 2, WHEEL.base / 2, true)}
      {wheel(2, -WHEEL.track / 2, -WHEEL.base / 2, false)}
      {wheel(3, WHEEL.track / 2, -WHEEL.base / 2, false)}
      <group ref={chassis}>
        {/* the body, the cabin, its glass, a pink stripe, headlights */}
        <RoundedBox args={[BODY.w, BODY.h, BODY.l]} radius={34} smoothness={4} position={[0, BODY.h / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={C.body} roughness={0.55} />
        </RoundedBox>
        <RoundedBox args={[BODY.w * 0.86, 96, BODY.l * 0.5]} radius={30} smoothness={4} position={[0, BODY.h + 40, -30]} castShadow>
          <meshStandardMaterial color={C.roof} roughness={0.6} />
        </RoundedBox>
        <RoundedBox args={[BODY.w * 0.88, 62, BODY.l * 0.44]} radius={18} smoothness={3} position={[0, BODY.h + 32, -30]}>
          <meshStandardMaterial color={C.glass} roughness={0.25} />
        </RoundedBox>
        <RoundedBox args={[BODY.w + 2, 14, BODY.l * 0.7]} radius={6} smoothness={2} position={[0, BODY.h * 0.52, 10]}>
          <meshStandardMaterial color={C.trim} roughness={0.6} />
        </RoundedBox>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * 70, BODY.h * 0.62, BODY.l / 2 - 2]}>
            <sphereGeometry args={[17, 16, 12]} />
            <meshStandardMaterial color={C.light} emissive={C.light} emissiveIntensity={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
