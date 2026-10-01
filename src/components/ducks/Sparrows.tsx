import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConeGeometry, CylinderGeometry, SphereGeometry, Vector3, type Group } from 'three'
import { bruno } from '../quad/bruno'
import { feed } from '../picnic/feed'
import { ducksAt } from './Ducks'

/**
 * House sparrows (../picnic/spec [S']), in real millimetres, the toy look: a plump little body (the cock's grey crown,
 * chestnut back, black bib and pale cheeks; the hen plain buff and brown), a stubby beak, a cocked tail. They
 * come down out of the cherries to the picnic, hop about its edge (a hop, a look round, a peck), take any
 * crumbs going, and fly back up into the trees after a while, or at once if the car comes or a duck gets
 * too close.
 *
 * In the scene's units: `scale` its toy scale, `perches` where in the trees they go (world), `near` where
 * they come down to (a centre and how far round it), `ground` its height.
 */
export type SparrowOpts = {
  scale: number
  perches: Vector3[]
  near: { x: number; z: number; r: number; inner: number }
  ground: (x: number, z: number) => number
  threat?: () => { x: number; z: number; speed: number } | null
}
const LEN = 150 // [S'] a house sparrow, beak to tail

const C = {
  belly: bruno({ color: '#ddd3c6', shade: '#9c929e' }),
  back: bruno({ color: '#9b6038', shade: '#5f4048' }),
  crown: bruno({ color: '#8f8c92', shade: '#5f5c68' }),
  bib: bruno({ color: '#2b2427', shade: '#1c181c' }),
  cheek: bruno({ color: '#f1ece4', shade: '#b4acb6' }),
  henBack: bruno({ color: '#a8865f', shade: '#6c5a5c' }),
  henCrown: bruno({ color: '#8a6d50', shade: '#5c4a4e' }),
  wing: bruno({ color: '#7b5236', shade: '#4c3640' }),
  bar: bruno({ color: '#f4efe6', shade: '#b9b0b8' }),
  beak: bruno({ color: '#4a4044', shade: '#2e282c' }),
  henBeak: bruno({ color: '#c9a66c', shade: '#8a7466' }),
  leg: bruno({ color: '#c29a86', shade: '#8a6e70' }),
  eye: bruno({ color: '#16131a', shade: '#100e12' }),
}
const BALL = new SphereGeometry(1, 16, 12)
const BEAK = new ConeGeometry(5.5, 15, 8)
const LEG = new CylinderGeometry(1.4, 1.4, 20, 5)

export type SparrowPose = Pose
type Pose = { flap: number; peck: number; hop: number; look: number; flying: boolean }
export function Sparrow({ cock, pose }: { cock: boolean; pose: { current: Pose } }) {
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const wings = useRef<(Group | null)[]>([])
  useFrame(() => {
    const p = pose.current
    if (body.current) body.current.rotation.z = p.flying ? -0.25 : -p.peck * 0.6 + 0.15
    if (head.current) {
      head.current.rotation.z = -p.peck * 0.5
      head.current.rotation.y = p.look
    }
    wings.current.forEach((w, i) => {
      if (!w) return
      const a = p.flying ? 0.2 + 1.2 * Math.abs(Math.sin(p.flap)) : 0
      w.rotation.x = (i ? 1 : -1) * a
    })
  })
  const back = cock ? C.back : C.henBack
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={LEG} material={C.leg} position={[0, 10, s * 7]} />
      ))}
      <group ref={body} position={[0, 34, 0]}>
        {/* its plump body, its back over it, its tail cocked up behind */}
        <mesh geometry={BALL} material={C.belly} scale={[44, 30, 30]} castShadow />
        <mesh geometry={BALL} material={back} position={[-6, 9, 0]} scale={[42, 24, 28]} />
        <mesh geometry={BALL} material={C.wing} position={[-52, 12, 0]} rotation={[0, 0, 0.35]} scale={[30, 4, 13]} castShadow />
        {[-1, 1].map((s, i) => (
          <group key={s} ref={(o) => void (wings.current[i] = o)} position={[2, 12, s * 22]}>
            <mesh geometry={BALL} material={C.wing} position={[-14, 0, s * 4]} rotation={[s * -0.3, 0, 0.1]} scale={[30, 13, 9]} castShadow />
            <mesh geometry={BALL} material={C.bar} position={[-4, -3, s * 10]} rotation={[s * -0.3, 0, 0.1]} scale={[10, 2.5, 3]} />
          </group>
        ))}
        {/* its head: the crown, the cheeks, the cock's black bib; its beak, its eyes */}
        <group ref={head} position={[36, 20, 0]}>
          <mesh geometry={BALL} material={cock ? C.cheek : C.belly} scale={[22, 20, 20]} castShadow />
          <mesh geometry={BALL} material={cock ? C.crown : C.henCrown} position={[-2, 6, 0]} scale={[21, 16, 19]} />
          {cock && <mesh geometry={BALL} material={C.back} position={[-10, 2, 0]} scale={[14, 14, 21]} />}
          {cock && <mesh geometry={BALL} material={C.bib} position={[10, -16, 0]} scale={[12, 10, 13]} />}
          <mesh geometry={BEAK} material={cock ? C.beak : C.henBeak} position={[22, -2, 0]} rotation={[0, 0, -Math.PI / 2]} />
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={BALL} material={C.eye} position={[10, 3, s * 16]} scale={3.2} />
          ))}
        </group>
      </group>
    </group>
  )
}

type Bird = {
  cock: boolean
  mode: 'away' | 'flying' | 'ground'
  p: Vector3
  from: Vector3
  to: Vector3
  t: number
  dur: number
  timer: number
  stay: number
  yaw: number
  hopT: number
  hopFrom: Vector3
  hopTo: Vector3
  pose: { current: Pose }
  next: 'ground' | 'away'
}

export function Sparrows(o: SparrowOpts) {
  const opts = useRef(o)
  opts.current = o
  const birds = useMemo<Bird[]>(
    () =>
      [true, false, true].map((cock, i) => ({
        cock,
        mode: 'away',
        p: o.perches[i % o.perches.length].clone(),
        from: new Vector3(),
        to: new Vector3(),
        t: 0,
        dur: 1,
        timer: 2 + i * 3,
        stay: 0,
        yaw: 0,
        hopT: 0,
        hopFrom: new Vector3(),
        hopTo: new Vector3(),
        pose: { current: { flap: 0, peck: 0, hop: 0, look: 0, flying: false } },
        next: 'ground',
      })),
    [],
  )
  const groups = useRef<(Group | null)[]>([])
  useFrame((_, raw) => {
    const dt = Math.max(0, Math.min(0.05, raw))
    const { scale, perches, near, ground, threat } = opts.current
    const L = LEN * scale
    const car = threat?.() ?? null
    const ducks = ducksAt()
    const crumbs = feed.bits().filter((b) => b.kind === 'crumb')
    const fly = (b: Bird, to: Vector3, next: Bird['next']) => {
      b.mode = 'flying'
      b.from.copy(b.p)
      b.to.copy(to)
      b.t = 0
      b.dur = Math.max(0.6, b.p.distanceTo(to) / (55 * L))
      b.next = next
    }
    const spot = () => {
      // somewhere round the picnic: by a crumb if there are any, else off the edge of the blanket
      const c = crumbs[Math.floor(Math.random() * crumbs.length)]
      if (c && Math.random() < 0.8) return new Vector3(c.p.x + (Math.random() - 0.5) * 3 * L, 0, c.p.z + (Math.random() - 0.5) * 3 * L)
      const a = Math.random() * Math.PI * 2
      const r = near.inner + Math.random() * (near.r - near.inner)
      return new Vector3(near.x + Math.cos(a) * r, 0, near.z + Math.sin(a) * r)
    }
    birds.forEach((b, i) => {
      const p = b.pose.current
      if (b.mode === 'away') {
        b.timer -= dt
        if (b.timer <= 0) {
          const to = spot()
          to.y = ground(to.x, to.z)
          if (car && Math.hypot(car.x - to.x, car.z - to.z) < 30 * L) b.timer = 3
          else fly(b, to, 'ground')
        }
      } else if (b.mode === 'flying') {
        b.t = Math.min(1, b.t + dt / b.dur)
        const u = b.t
        const e = u * u * (3 - 2 * u)
        b.p.lerpVectors(b.from, b.to, e)
        b.p.y += Math.sin(Math.PI * u) * Math.min(12 * L, b.from.distanceTo(b.to) * 0.2)
        const dx = b.to.x - b.from.x
        const dz = b.to.z - b.from.z
        if (dx * dx + dz * dz > 1) b.yaw = Math.atan2(-dz, dx)
        p.flying = true
        p.flap += dt * 38
        if (u >= 1) {
          p.flying = false
          if (b.next === 'ground') {
            b.mode = 'ground'
            b.stay = 12 + Math.random() * 20
            b.hopT = 0.5
            b.hopFrom.copy(b.p)
            b.hopTo.copy(b.p)
          } else {
            b.mode = 'away'
            b.timer = 6 + Math.random() * 18
          }
        }
      } else {
        // on the ground: hop, look round, peck; off again in a while, or at once if something comes at it
        b.stay -= dt
        const scared = (car && Math.hypot(car.x - b.p.x, car.z - b.p.z) < (car.speed > 20 * scale ? 22 : 8) * L) || ducks.some((d) => Math.hypot(d.x - b.p.x, d.z - b.p.z) < 2.2 * L)
        if (b.stay <= 0 || scared) {
          const perch = perches[Math.floor(Math.random() * perches.length)].clone().add(new Vector3((Math.random() - 0.5) * 20 * L, (Math.random() - 0.5) * 4 * L, (Math.random() - 0.5) * 20 * L))
          fly(b, perch, 'away')
          return
        }
        b.hopT -= dt
        if (b.hopT <= 0) {
          // the next hop: toward a crumb near it, else a little way, now and then
          const crumb = crumbs.find((c) => c.p.distanceTo(b.p) < 6 * L)
          let to: Vector3
          if (crumb && crumb.p.distanceTo(b.p) < 0.9 * L) {
            // (there: peck it up)
            feed.bite(crumb.id)
            p.peck = 1
            to = b.p.clone()
          } else if (crumb) to = b.p.clone().lerp(crumb.p, Math.min(1, (1.5 * L) / crumb.p.distanceTo(b.p)))
          else to = Math.random() < 0.6 ? b.p.clone().add(new Vector3((Math.random() - 0.5) * 2.4 * L, 0, (Math.random() - 0.5) * 2.4 * L)) : b.p.clone()
          if (to.distanceTo(b.p) < 0.1 * L && Math.random() < 0.5) p.peck = 1
          to.y = ground(to.x, to.z)
          b.hopFrom.copy(b.p)
          b.hopTo.copy(to)
          const dx = to.x - b.p.x
          const dz = to.z - b.p.z
          if (dx * dx + dz * dz > 1e-4) b.yaw = Math.atan2(-dz, dx)
          b.hopT = 0.35 + Math.random() * 0.8
          p.hop = 0
          if (Math.random() < 0.4) p.look = (Math.random() - 0.5) * 1.6
        }
        // the hop itself: a quick bound
        p.hop = Math.min(1, p.hop + dt / 0.16)
        b.p.lerpVectors(b.hopFrom, b.hopTo, p.hop)
        b.p.y += Math.sin(Math.PI * p.hop) * 0.25 * L * (b.hopFrom.distanceTo(b.hopTo) > 0.05 * L ? 1 : 0)
        p.peck = Math.max(0, p.peck - dt * 5)
        p.look *= 1 - dt * 0.8
      }
      const g = groups.current[i]
      if (g) {
        g.visible = b.mode !== 'away'
        g.position.copy(b.p)
        g.rotation.y = b.yaw
        g.scale.setScalar(scale)
      }
    })
  })
  return (
    <>
      {birds.map((b, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <Sparrow cock={b.cock} pose={b.pose} />
        </group>
      ))}
    </>
  )
}
