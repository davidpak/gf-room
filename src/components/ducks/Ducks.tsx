import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { feed, type Bit } from '../picnic/feed'
import { Duck, newPose, type DuckKind, type DuckPose } from './Duck'

/**
 * A family of mallards on the lawn (./Duck): the drake, the hen, and her ducklings in a line behind her.
 * Left alone they potter about near home: walk a little way, stop, look round, peck at the grass, preen, wag
 * their tails. Bread thrown (../picnic/feed) and they're onto it: the hen calls (her bill going, no sound), they all hurry over, the
 * nearest gets there first and pecks it to nothing (the ducklings go for the crumbs), then they wander off
 * again. The car coming and they hurry out of its way, flapping if it's close.
 *
 * Everything's in the scene's units: `scale` is its toy scale (a mallard is 580 mm long; the Quad's 0.24).
 */
export type FlockOpts = {
  scale: number
  home: { x: number; z: number; r: number }
  /** the ground's height there */
  ground: (x: number, z: number) => number
  /** what to keep out of (world circles): trunks, the basket on the blanket… */
  avoid?: () => { x: number; z: number; r: number }[]
  /** where they don't wander to of their own accord (they'll come onto it for bread): the blanket, the walks */
  offLimits?: (x: number, z: number) => boolean
  /** something coming at them (the car), and how fast */
  threat?: () => { x: number; z: number; speed: number } | null
}
const FAMILY: DuckKind[] = ['drake', 'hen', 'duckling', 'duckling', 'duckling']
const LEN = { drake: 580, hen: 560, duckling: 150 }

type Agent = {
  kind: DuckKind
  x: number
  z: number
  y: number
  yaw: number
  v: number
  L: number
  mode: 'idle' | 'walk' | 'food' | 'eat' | 'flee'
  tx: number
  tz: number
  timer: number
  food: number | null
  pose: { current: DuckPose }
  peckT: number
  peckBit: boolean
  lookTo: number
  preenT: number
  quackQ: number[] // (when each quack in a run opens the bill: seconds from now)
  flapT: number
}

/** where they are (world x, z): for aiming bread at them */
let flockNow: { x: number; z: number }[] = []
export const ducksAt = () => flockNow

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const rand = (a: number, b: number) => a + Math.random() * (b - a)

export function Ducks(opts: FlockOpts) {
  const { scale, home } = opts
  const optsRef = useRef(opts)
  optsRef.current = opts
  const A = LEN.drake * scale // (a grown duck's length: their distances are counted in it)
  const agents = useMemo<Agent[]>(
    () =>
      FAMILY.map((kind, i) => {
        const a = (i / FAMILY.length) * Math.PI * 2
        const r = home.r * 0.4
        const x = home.x + Math.cos(a) * r
        const z = home.z + Math.sin(a) * r
        return { kind, x, z, y: 0, yaw: rand(-3, 3), v: 0, L: LEN[kind] * scale, mode: 'idle', tx: x, tz: z, timer: rand(0.5, 4), food: null, pose: { current: newPose() }, peckT: 0, peckBit: false, lookTo: 0, preenT: 0, quackQ: [], flapT: 0 }
      }),
    [home.x, home.z, home.r, scale],
  )
  const groups = useRef<(Group | null)[]>([])

  const call = (a: Agent, n: number) => {
    const gap = a.kind === 'duckling' ? 0.16 : a.kind === 'hen' ? 0.21 : 0.3
    a.quackQ = Array.from({ length: n }, (_, i) => i * gap)
  }
  // bread lands: they look up, the hen calls, they hurry over
  useEffect(
    () =>
      feed.onLand((b: Bit) => {
        if (b.kind !== 'piece') return
        const seen = agents.filter((a) => Math.hypot(a.x - b.p.x, a.z - b.p.z) < 20 * A && a.mode !== 'flee')
        const hen = seen.find((a) => a.kind === 'hen')
        if (hen && Math.random() < 0.85) call(hen, 3 + Math.floor(Math.random() * 3))
        const drake = seen.find((a) => a.kind === 'drake')
        if (drake && Math.random() < 0.4) setTimeout(() => call(drake, 1 + Math.floor(Math.random() * 2)), 300)
        const chick = seen.find((a) => a.kind === 'duckling')
        if (chick) setTimeout(() => call(chick, 2 + Math.floor(Math.random() * 3)), 150)
      }),
    [agents],
  )

  useFrame((_, rawDt) => {
    const dt = Math.max(0, Math.min(0.05, rawDt))
    const o = optsRef.current
    const threat = o.threat?.() ?? null
    const bits = feed.bits()
    const circles = o.avoid?.() ?? []
    // who's going for which bit (a crumb's one duck's; a piece two can share)
    const going = new Map<number, number>()
    for (const a of agents) if (a.food != null) going.set(a.food, (going.get(a.food) ?? 0) + 1)
    agents.forEach((a, i) => {
      const p = a.pose.current
      const chick = a.kind === 'duckling'
      let want = 0 // (the speed it wants)
      let turn = 4
      // ---- the car coming: out of its way
      if (threat) {
        const d = Math.hypot(a.x - threat.x, a.z - threat.z)
        const fleeR = (threat.speed > 60 * scale ? 7 : threat.speed > 10 * scale ? 3.5 : 1.4) * A // (a car parked near they get used to)
        if (d < fleeR) {
          a.mode = 'flee'
          a.food = null
          const k = (6 * A) / Math.max(1, d)
          a.tx = a.x + (a.x - threat.x) * k
          a.tz = a.z + (a.z - threat.z) * k
          a.timer = 1.5
          if (d < 2.6 * A) a.flapT = 0.8
        }
      }
      if (a.mode === 'flee') {
        a.timer -= dt
        want = 2.6 * A
        turn = 8
        if (a.timer <= 0) (a.mode = 'idle'), (a.timer = rand(1, 3))
      } else {
        // ---- bread about: the nearest it fancies that isn't spoken for
        let best: Bit | null = null
        let bd = Infinity
        for (const b of bits) {
          const d = Math.hypot(b.p.x - a.x, b.p.z - a.z) * (b.kind === 'crumb' ? (chick ? 0.6 : 1.4) : chick ? 1.2 : 1)
          if (d > 18 * A) continue
          const n = going.get(b.id) ?? 0
          if (a.food !== b.id && n >= (b.kind === 'crumb' ? 1 : 2)) continue
          if (d < bd) [bd, best] = [d, b]
        }
        if (best) {
          if (a.food !== best.id) {
            if (a.food != null) going.set(a.food, (going.get(a.food) ?? 1) - 1)
            going.set(best.id, (going.get(best.id) ?? 0) + 1)
            a.food = best.id
            if (a.mode !== 'eat') a.mode = 'food'
          }
          a.tx = best.p.x
          a.tz = best.p.z
          // its bill reaches it from about half its length off
          const reach = a.L * (chick ? 0.55 : 0.5)
          const d = Math.hypot(a.tx - a.x, a.tz - a.z)
          if (a.mode === 'food' && d < reach) (a.mode = 'eat'), (a.peckT = 0)
          if (a.mode === 'food') want = Math.min(1.9 * A, (d - reach * 0.8) * 3)
        } else if (a.mode === 'food' || a.mode === 'eat') {
          a.mode = 'idle'
          a.food = null
          a.timer = rand(1, 3)
          p.wag = 0.01 // (a wag of its tail when it's done)
        }
        if (a.mode === 'eat') {
          // pecking: down, a bite, up, again
          const dur = chick ? 0.26 : 0.4
          a.peckT += dt
          const f = (a.peckT % dur) / dur
          p.peck = Math.pow(Math.sin(Math.PI * f), 0.7)
          if (f > 0.5 && !a.peckBit) {
            a.peckBit = true
            if (a.food != null && feed.bite(a.food) === 0) {
              a.food = null
              a.mode = 'idle'
              a.timer = rand(0.6, 2)
              p.wag = 0.01
              if (Math.random() < (chick ? 0.5 : 0.3)) call(a, chick ? 2 : 1 + Math.floor(Math.random() * 2))
            }
          }
          if (f < 0.5) a.peckBit = false
          // (it turns to face the bread)
          const face = Math.atan2(-(a.tz - a.z), a.tx - a.x)
          a.yaw += wrap(face - a.yaw) * Math.min(1, dt * 6)
        } else p.peck += (0 - p.peck) * Math.min(1, dt * 8)
        // ---- nothing doing: the ducklings keep behind their mother in a line, the others potter
        if (a.mode === 'idle' || a.mode === 'walk') {
          if (chick) {
            const lead = agents[i === 2 ? 1 : i - 1]
            const gap = i === 2 ? lead.L * 0.6 : lead.L * 1.1
            a.tx = lead.x - Math.cos(lead.yaw) * gap
            a.tz = lead.z + Math.sin(lead.yaw) * gap
            const d = Math.hypot(a.tx - a.x, a.tz - a.z)
            want = d > a.L * 0.35 ? Math.min(1.8 * A, d * 2.5) : 0
            a.mode = want > 0 ? 'walk' : 'idle'
          } else if (a.mode === 'idle') {
            a.timer -= dt
            if (a.timer <= 0) {
              // off somewhere near home (not onto the blanket, not the walks)
              for (let k = 0; k < 8; k++) {
                const ang = Math.random() * Math.PI * 2
                const r = Math.sqrt(Math.random()) * home.r
                const tx = home.x + Math.cos(ang) * r
                const tz = home.z + Math.sin(ang) * r
                if (o.offLimits?.(tx, tz)) continue
                a.tx = tx
                a.tz = tz
                a.mode = 'walk'
                break
              }
              a.timer = rand(2, 6)
            }
          } else {
            const d = Math.hypot(a.tx - a.x, a.tz - a.z)
            want = Math.min(0.9 * A, d * 2)
            if (d < a.L * 0.3) (a.mode = 'idle'), (a.timer = rand(1.5, 5))
          }
        }
      }
      // ---- moving: turning toward where it's going, speeding up and slowing down
      if (want > 0.5) {
        const face = Math.atan2(-(a.tz - a.z), a.tx - a.x)
        a.yaw += Math.max(-turn * dt, Math.min(turn * dt, wrap(face - a.yaw)))
        want *= Math.max(0.15, Math.cos(wrap(face - a.yaw))) // (slower while it's still turning)
      }
      a.v += (want - a.v) * Math.min(1, dt * 5)
      a.x += Math.cos(a.yaw) * a.v * dt
      a.z -= Math.sin(a.yaw) * a.v * dt
      // ---- not through each other, nor through things
      for (let j = 0; j < agents.length; j++) {
        if (j === i) continue
        const b = agents[j]
        const min = (a.L + b.L) * 0.32
        const dx = a.x - b.x
        const dz = a.z - b.z
        const d = Math.hypot(dx, dz)
        if (d < min && d > 1e-3) {
          a.x += (dx / d) * (min - d) * 0.5
          a.z += (dz / d) * (min - d) * 0.5
        }
      }
      for (const c of circles) {
        const dx = a.x - c.x
        const dz = a.z - c.z
        const d = Math.hypot(dx, dz)
        const min = c.r + a.L * 0.3
        if (d < min && d > 1e-3) {
          a.x += (dx / d) * (min - d)
          a.z += (dz / d) * (min - d)
        }
      }
      a.y = o.ground(a.x, a.z)
      // ---- its pose: waddling, looking about, preening, quacking, flapping, wagging
      p.walk += (a.v / a.L) * Math.PI * 2 * (chick ? 1.6 : 1.15) * dt
      p.stride += (Math.min(1, a.v / (0.35 * a.L)) - p.stride) * Math.min(1, dt * 6)
      if (a.mode === 'idle' && a.v < 0.1 * a.L) {
        if (Math.random() < dt * 0.4) a.lookTo = rand(-0.9, 0.9)
        if (a.preenT <= 0 && !chick && Math.random() < dt * 0.05) a.preenT = 2.4
        // (a peck at the grass now and then)
        if (Math.random() < dt * 0.15) a.peckT = -0.5
      } else a.lookTo = 0
      if (a.peckT < 0 && a.mode !== 'eat') {
        a.peckT = Math.min(0, a.peckT + dt)
        p.peck = Math.max(p.peck, Math.sin(Math.PI * (1 + a.peckT / 0.5)) * 0.9)
      }
      p.look += (a.lookTo - p.look) * Math.min(1, dt * 3)
      if (a.preenT > 0) {
        a.preenT -= dt
        const k = Math.sin((Math.PI * Math.max(0, a.preenT)) / 2.4)
        p.preen = Math.min(1, k * 1.6)
        if (a.v > 0.2 * a.L) a.preenT = 0
      } else p.preen += (0 - p.preen) * Math.min(1, dt * 4)
      a.quackQ = a.quackQ.map((t) => t - dt)
      const open = a.quackQ.some((t) => t < 0 && t > -0.14)
      p.quack += ((open ? 1 : 0) - p.quack) * Math.min(1, dt * 30)
      if (a.quackQ.length && a.quackQ.every((t) => t < -0.2)) a.quackQ = []
      a.flapT = Math.max(0, a.flapT - dt)
      p.flap += ((a.flapT > 0 ? 1 : 0) - p.flap) * Math.min(1, dt * 10)
      if (p.wag > 0) p.wag = p.wag + dt * 22 > Math.PI * 4 ? 0 : p.wag + dt * 22
      const g = groups.current[i]
      if (g) {
        g.position.set(a.x, a.y, a.z)
        g.rotation.y = a.yaw
      }
    })
    flockNow = agents.map((a) => ({ x: a.x, z: a.z }))
  })

  return (
    <>
      {agents.map((a, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} position={[a.x, 0, a.z]}>
          <group scale={scale}>
            <Duck kind={a.kind} pose={a.pose} />
          </group>
        </group>
      ))}
    </>
  )
}
