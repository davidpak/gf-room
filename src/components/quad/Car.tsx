import { Waiting } from '../../lib/ready'
import { Optional } from '../../lib/Optional'
import { RoundedBox } from '@react-three/drei'
import { Suspense, useCallback, useEffect, useRef } from 'react'
import { typing } from '../../lib/inputLock'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type DirectionalLight, type Group, type Object3D, type PerspectiveCamera } from 'three'
import { SET, inIsland, paveSdf } from './set'
import { isHolding } from '../../lib/physics/Hand'
import { getLook, lookAt, lookPose } from './look'
import { hardReset, onReset } from './reset'
import { LOOK, shared } from './bruno'
import { getRide } from './ride'
import { CivicModel, TYRE_R, WELL, openings, shutDoors } from '../civic/Civic'
import { getLowPower } from '../../lib/render/Canvas'
import { TOY } from '../civic/spec'

/**
 * David's car, his black 2016 Civic (../civic/Civic: its doors and trunk open on a click, and the doors
 * swing shut when it drives off), driven like Bruno Simon's: W / ↑ go, S / ↓ brake
 * and reverse, A D / ← → steer, Space the handbrake, R back to the start. An arcade car on the flat:
 * a bicycle model (it turns about its back wheels, tighter slow), a push forward, drag, bumps off the
 * trees and the halls. Drawn with a little life: it pitches as it speeds up and brakes, leans into
 * turns, the wheels roll and the front ones steer. The camera follows from above and behind (always
 * the same way round, like Bruno's), the wheel zooms, and the sun's shadow follows it.
 *
 * `state` is shared: where it is and how fast (the polaroids watch it).
 */
export type CarState = { x: number; z: number; heading: number; v: number; y?: number }
export type Obstacle = { kind: 'circle'; x: number; z: number; r: number; /** a loose thing (./Physical): felt late, so the car's body meets it first and shoves it */ soft?: boolean } | { kind: 'box'; x: number; z: number; w: number; d: number }

// (the Civic at the toy's scale: its length, width and height; its wheels' radius, base and track)
const K = TOY.k
const BODY = { l: 4630 * K, w: 1826 * K, h: 1457 * K }
type Box = { half: [number, number, number]; at: [number, number, number] }
/** a box by its real-mm extents in the car's frame, at the toy's scale */
const span = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box => ({
  half: [((x1 - x0) / 2) * K, ((y1 - y0) / 2) * K, ((z1 - z0) / 2) * K],
  at: [((x0 + x1) / 2) * K, ((y0 + y1) / 2) * K, ((z0 + z1) / 2) * K],
})
/** the car's shape for the physics (./Physical CarBody): the body below the windows (hollow at the back
 *  for the trunk's well: its floor, sides and back), the cabin on it; and the trunk lid, there while shut */
const HW = 913 // (half its width, real mm)
export const CAR_SHAPE = {
  parts: [
    span(-HW, HW, 150, 950, WELL.z1, 2315), // (the body, the front and middle)
    span(-HW, HW, 150, WELL.floor, -2315, WELL.z1), // (under the trunk's floor)
    span(WELL.x, HW, WELL.floor, WELL.rim, -2315, WELL.z1), // (its sides)
    span(-HW, -WELL.x, WELL.floor, WELL.rim, -2315, WELL.z1),
    span(-WELL.x, WELL.x, WELL.floor, 950, -2315, WELL.z0), // (its back)
    span(-700, 700, 950, 1440, -1600, 1000), // (the cabin)
    // (a skirt down to just off the ground under it all: it shoves the picnic's low things, the books, the board,
    // the food, rather than riding over them; and nothing gets wedged under it and pressed into the ground)
    span(-HW + 30, HW - 30, 15, 150, -2290, 2290),
  ],
  lid: span(-640, 640, WELL.rim, WELL.rim + 60, -2218, -1832),
  /** the well, for what's put in it (toy mm, the car's frame) */
  well: { x: WELL.x * K, z0: WELL.z0 * K, z1: WELL.z1 * K, floor: WELL.floor * K, rim: WELL.rim * K },
}
const WHEEL = { r: TYRE_R * K, base: 2697 * K, track: 1584 * K }
/** how far into a loose thing the car may press before it's stopped (its body shoves it first) */
const SOFT = 95
const BUMP = { along: [-1.6, 0, 1.6].map((k) => k * 1000 * TOY.k), r: 1000 * TOY.k } // (for bumping into things: three circles down its length)
/** how high the ground is under a wheel: the lawn, or up on the bricks (a short ramp over the edge) */
const LAWN_Y = 5
const BRICK_Y = 25
export const groundAt = (x: number, z: number) => {
  const t = Math.min(1, Math.max(0, (8 - paveSdf(x, z)) / 16))
  return LAWN_Y + (BRICK_Y - LAWN_Y) * t * t * (3 - 2 * t)
}
const MAX = 2800
const REVERSE = 1100
const ACCEL = 3000
const BRAKE = 5200
const STEER = 0.6
const VIEW = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('view') : null

const _pos = new Vector3()
const _at = new Vector3()
const _tp = new Vector3()
const _target = new Vector3()
const _right = new Vector3()
const _up = new Vector3()
const _sunDir = new Vector3()
/** the sun's shadows follow the camera in whole texels of their map, not smoothly: slid by part of a
 *  texel, every shadow's edge would shimmer and crawl as the car drives */
function snapToTexels(p: Vector3, sun: DirectionalLight) {
  _sunDir.copy(LOOK.sun).normalize()
  _right.set(0, 1, 0).cross(_sunDir).normalize() // (the shadow camera's own right and up, as lookAt makes them)
  _up.copy(_sunDir).cross(_right)
  const c = sun.shadow.camera
  const texel = (c.right - c.left) / sun.shadow.mapSize.x
  const a = Math.round(p.dot(_right) / texel) * texel
  const b = Math.round(p.dot(_up) / texel) * texel
  const d = p.dot(_sunDir)
  return p.copy(_right).multiplyScalar(a).addScaledVector(_up, b).addScaledVector(_sunDir, d)
}
const _ta = new Vector3()
const keys = new Set<string>()
/** a driving key held (up, down, left, right, brake): the car's, or the Lime's while one's ridden (./ride) */
export const held = (n: string) => keys.has(n)
const MAP: Record<string, string> = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake', KeyR: 'reset' }

const NONE: Obstacle[] = []

export function Car({ state, obstacles, movers, paused }: { state: { current: CarState }; obstacles: Obstacle[]; /** obstacles that move (the benches, where they are now), read every frame */ movers?: () => Obstacle[]; paused?: boolean }) {
  const body = useRef<Group>(null)
  const chassis = useRef<Group>(null)
  const wheels = useRef<{ node: Object3D; front: boolean }[]>([])
  // the wheels: out of the leaning, pitching chassis onto the car itself (they stay on the ground as the
  // body leans into a turn or dips under the brakes, not tipping into it)
  const onWheels = useCallback((w: { node: Object3D; front: boolean }[]) => {
    wheels.current = w
    for (const { node } of w) body.current?.attach(node)
  }, [])
  const sim = useRef({ steer: 0, pitch: 0, roll: 0, spin: 0, bob: 0, wheels: [LAWN_Y, LAWN_Y, LAWN_Y, LAWN_Y] })
  const zoom = useRef(1)
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = MAP[e.code]
      // (typing in a box on the page, the Dig crate's card: its letters aren't the car's)
      if (!k || typing(e)) return
      e.preventDefault()
      if (k === 'reset') {
        if (!e.repeat) hardReset() // (everything back: see ./reset)
        return
      }
      keys.add(k)
    }
    // the car's part of a hard reset: back at the start, its doors and trunk shut, the camera out of any close look
    const off = onReset(() => {
      Object.assign(state.current, { x: SET.start.x, z: SET.start.z, heading: SET.start.heading, v: 0 })
      shutDoors()
      openings.trunk = false
      lookAt(null)
    })
    const up = (e: KeyboardEvent) => MAP[e.code] && keys.delete(MAP[e.code])
    const blur = () => keys.clear()
    const wheel = (e: WheelEvent) => !isHolding() && !getLook() && (zoom.current = Math.min(1.8, Math.max(0.55, zoom.current * (1 + Math.sign(e.deltaY) * 0.08))))
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('wheel', wheel, { passive: true })
    return () => {
      off()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('wheel', wheel)
    }
  }, [])

  const camAt = useRef(new Vector3(0, 0, 0))
  const sunRef = useRef<DirectionalLight | null>(null)
  const sunWas = useRef(new Vector3())
  const shadowTick = useRef(0)
  const lowTick = useRef(0)
  // looking at a photo (./look): where the camera frames it, and how far it has glided there (0..1)
  const look = useRef({ pos: new Vector3(), at: new Vector3(), has: false, view: 0 })
  const first = useRef(true)
  useFrame(({ scene }, delta) => {
    // (the sun, found once: looking it up by name every frame walks the whole scene)
    if (!sunRef.current) sunRef.current = (scene.getObjectByName('sun') as DirectionalLight | undefined) ?? null
    const sun = sunRef.current
    const dt = Math.min(delta, 1 / 30)
    const s = state.current
    const m = sim.current
    const riding = getRide()
    const k = (n: string) => !paused && !riding && keys.has(n) // (on a Lime: the keys are its)
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
    // bumping: out of the trees, the halls, the stands; the edges of the Quad. The car's a long thing:
    // three circles down its length, each pushed clear, the car moved by the biggest push
    let hit = 0
    const fx = Math.sin(s.heading)
    const fz = Math.cos(s.heading)
    const moving = movers ? movers() : NONE
    for (let pass = 0; pass < 2; pass++)
      for (const along of BUMP.along) {
        const cx = nx + fx * along
        const cz = nz + fz * along
        let px = 0
        let pz = 0
        for (let oi = 0; oi < obstacles.length + moving.length; oi++) {
          const o = oi < obstacles.length ? obstacles[oi] : moving[oi - obstacles.length]
          let dx: number
          let dz: number
          let min: number
          if (o.kind === 'circle') {
            dx = cx - o.x
            dz = cz - o.z
            // (a loose thing: the car's body touches it before this does, so the car shoves it; only one
            // that can't give, pinned, stops the car, a little into it)
            min = o.soft ? Math.max(BUMP.r * 0.6, o.r + BUMP.r - SOFT) : o.r + BUMP.r
          } else {
            dx = cx - Math.max(o.x - o.w / 2, Math.min(cx, o.x + o.w / 2))
            dz = cz - Math.max(o.z - o.d / 2, Math.min(cz, o.z + o.d / 2))
            min = BUMP.r
          }
          const d = Math.hypot(dx, dz)
          if (d < min && d > 1e-6) {
            const push = min - d
            if (push * push > px * px + pz * pz) [px, pz] = [(dx / d) * push, (dz / d) * push]
            hit = 1
          }
        }
        nx += px
        nz += pz
      }
    // the island's edge: it stops there (no driving off)
    if (!inIsland(nx + fx * BODY.l * 0.45, nz + fz * BODY.l * 0.45, 40) || !inIsland(nx - fx * BODY.l * 0.45, nz - fz * BODY.l * 0.45, 40)) {
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
    // riding the ground: each wheel on what's under it (grass, or up on the bricks), the car raised and
    // tipped to sit on all four
    const [ch, sh] = [Math.cos(s.heading), Math.sin(s.heading)]
    ;[
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ].forEach(([lx, lz], k) => {
      const x = (lx * WHEEL.track) / 2
      const z = (lz * WHEEL.base) / 2
      const g = groundAt(s.x + x * ch + z * sh, s.z - x * sh + z * ch)
      // (up onto the bricks at once: a tyre never sinks into the edge; down off them, eased)
      m.wheels[k] = Math.max(g, m.wheels[k] + (g - m.wheels[k]) * Math.min(1, dt * 30))
    })
    const [fl, fr, bl, br] = m.wheels
    const b = body.current
    if (b) {
      s.y = (fl + fr + bl + br) / 4
      b.position.set(s.x, s.y, s.z)
      b.rotation.order = 'YXZ'
      b.rotation.set(-Math.atan((fl + fr - bl - br) / 2 / WHEEL.base), s.heading, Math.atan((fr + br - fl - bl) / 2 / WHEEL.track))
    }
    const c = chassis.current
    if (c) {
      c.rotation.set(m.pitch, 0, m.roll)
      c.position.y = Math.sin(m.bob) * Math.min(1.5, Math.abs(s.v) / 1000)
    }
    for (const { node, front } of wheels.current) {
      node.rotation.order = 'YXZ'
      node.rotation.set(m.spin, front ? m.steer : 0, 0)
    }
    if (Math.abs(s.v) > 150) shutDoors() // (driving off: the doors swing shut)
    // the camera: from above and behind, always the same way round; the sun's shadow follows
    // (the camera on the car, or on the Lime being ridden)
    if (riding) _target.set(riding.x, 0, riding.z)
    else _target.set(s.x, 0, s.z)
    if (first.current) camAt.current.copy(_target)
    camAt.current.lerp(_target, first.current ? 1 : Math.min(1, dt * 4))
    first.current = false
    const z = zoom.current
    // Bruno's camera: high, from the front and a little to the side, always the same way round
    _pos.set(camAt.current.x + 1500 * z, 3300 * z, camAt.current.z + 3900 * z)
    _at.set(camAt.current.x, 80, camAt.current.z - 150)
    // a photo looked at: the camera glides from following the car to square in front of it, and back
    const lk = look.current
    const on = lookPose(_tp, _ta, camera.aspect)
    if (on) {
      const k = lk.has ? Math.min(1, dt * 5) : 1 // (stepping to the next one: it slides over)
      lk.pos.lerp(_tp, k)
      lk.at.lerp(_ta, k)
      lk.has = true
    }
    lk.view += ((on ? 1 : 0) - lk.view) * Math.min(1, dt * 2.4)
    if (!on && lk.view < 0.002) {
      lk.view = 0
      lk.has = false
    }
    const e = lk.view * lk.view * (3 - 2 * lk.view)
    if (lk.has) {
      _pos.lerp(lk.pos, e)
      _at.lerp(lk.at, e)
    }
    camera.position.copy(_pos)
    camera.lookAt(_at)
    if (VIEW === 'bench') {
      // (?view=bench: down low, in front of the bench from their photo)
      const b = SET.benches[SET.photos.bench]
      camera.position.set(b.x + 380, 230, b.z + 560)
      camera.lookAt(b.x, 110, b.z)
    }
    if (VIEW === 'cookies') {
      // (?view=cookies: the cookie stand, from out front and above)
      const c = SET.cookies
      camera.position.set(c.x + 560, 820, c.z + 1250)
      camera.lookAt(c.x, 300, c.z)
    }
    if (VIEW === 'music') {
      // (?view=music: the record stand, from out front and above)
      const c = SET.music
      camera.position.set(c.x + 250, 560, c.z + 900)
      camera.lookAt(c.x, 140, c.z)
    }
    if (VIEW === 'shoot') {
      // (?view=shoot: the photo shoot between the middle cherries, from in front and a little above)
      const c = SET.shoot.camera
      camera.position.set(c.x + 700, 640, c.z + 1150)
      camera.lookAt(c.x - 60, 120, c.z - 250)
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
    if (lk.has && e > 0.5) shared.car.value.copy(lk.at) // (looking at a photo: the blossom opens in front of it)
    else if (riding) shared.car.value.set(riding.x, 150, riding.z)
    else shared.car.value.set(s.x, 150, s.z)
    // (a slower computer, one that's had to step down (../../lib/render/Canvas): the sun's map 2048, not 4096, and
    // while the car drives, it and its shadows moved and redrawn every other frame, not every one: the map's redraw,
    // every caster round the car, was what the frames went late on)
    const low = getLowPower() > 0
    if (sun && low && sun.shadow.mapSize.x > 2048) {
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
      sun.shadow.needsUpdate = true
    }
    const skip = low && Math.abs(s.v) > 1 && !isHolding() && (++lowTick.current & 1) === 1 // (this frame: the sun and its map left as they were)
    if (sun && !skip) {
      snapToTexels(_target.set(camAt.current.x, 0, camAt.current.z), sun)
      sun.position.copy(LOOK.sun).multiplyScalar(4000).add(_target)
      sun.target.position.copy(_target)
      sun.target.updateMatrixWorld()
      // its shadows: redrawn every frame while they move with the car (or something's being carried), else every
      // other frame (what moves then, the ducks pottering, the petals falling, moves slowly: half the work)
      const moved = sun.position.distanceToSquared(sunWas.current) > 0.01
      sunWas.current.copy(sun.position)
      shadowTick.current++
      sun.shadow.autoUpdate = false
      if (moved || isHolding() || shadowTick.current % 2 === 0) sun.shadow.needsUpdate = true
    }
  })

  return (
    <group ref={body}>
      <group ref={chassis}>
        <Suspense fallback={<Waiting name="car" />}>
          <group scale={K}>
            <Optional fallback={<StandInCar />}>
              <CivicModel onWheels={onWheels} />
            </Optional>
          </group>
        </Suspense>
      </group>
    </group>
  )
}

/** the car when its model isn't there (it's kept local, never shipped): a toy car of the Civic's size and stance, in
 *  the car's real-mm frame (its length along z, the front at +z) */
function StandInCar() {
  const paint = '#1d1f24'
  return (
    <group>
      <RoundedBox args={[1800, 640, 4560]} radius={160} smoothness={4} position={[0, 640, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={paint} roughness={0.35} metalness={0.3} />
      </RoundedBox>
      <RoundedBox args={[1420, 520, 2500]} radius={180} smoothness={4} position={[0, 1180, -300]} castShadow>
        <meshStandardMaterial color="#2c3440" roughness={0.15} metalness={0.4} />
      </RoundedBox>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * 800, TYRE_R, sz * 1350]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[TYRE_R, TYRE_R, 230, 24]} />
          <meshStandardMaterial color="#141414" roughness={0.8} />
        </mesh>
      )))}
    </group>
  )
}
