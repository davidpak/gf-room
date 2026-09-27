import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { Matrix4, Quaternion, Vector3, type Group } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { GROUP, groups } from '../../lib/physics/rope'
import { usePerch } from '../../lib/physics/usePerch'
import { thump } from '../../lib/sound/thump'
import { Prompts } from '../prompt/Prompts'
import { LiveWumpus, WumpusModel } from '../wumpus/Wumpus'
import { perch as wumpusPerch } from '../wumpus/spec'
import { ClipModel } from './models'
import { CLIP_LIST, clipMatrix, type ClipKind, type ClipSpec } from './spec'

/**
 * Rina's claw clip, live (./spec, ./models): clamped at its spot on the lamp's pole, riding the lamp. Pick one up and it opens in your hand (as if you'd squeezed its handles); let go and it snaps
 * shut. Let go near its spot and it goes back on by itself; anywhere else a "Return clip" prompt flies
 * it home (open on the way, snapping shut round the pole). The shared home-spot logic: usePerch.
 *
 * <LampTrinkets lamp={ref}> puts the clip and the Wumpus (who sits on it: take it away and he tumbles
 * off) on a lamp; <StillTrinkets> is the same, drawn only, in the lamp's frame.
 */
const ITEM = groups(GROUP.item, 0xffff)
const _p = new Vector3()
const _q = new Quaternion()

/** whether each clip is on its spot (the Wumpus asks after the amber one) */
const homes = new Map<ClipKind, { current: { perched: boolean; first: boolean } }>()
export const clipAtHome = (id: ClipKind) => {
  const h = homes.get(id)
  return !h || h.current.perched || h.current.first
}

export function LiveClip({ c, lampAt, spawn }: { c: ClipSpec; lampAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const at = useMemo(() => clipMatrix(c), [c])
  const open = useRef(0)
  const openRef = useMemo(() => ({ get current() { return open.current } }), [])
  const perch = usePerch({
    key: `clip-${c.id}`,
    label: 'Return clip',
    perchAt: () => {
      const l = lampAt()
      return l ? l.clone().multiply(at) : null
    },
    approach: new Vector3(1, 0, 0), // it slides on from the hinge's side, jaws round the pole
    distance: 70,
    snap: 70,
    lift: c.length / 2 + 24,
    onLand: () => thump(0.22, 'hard'), // snap
  })
  homes.set(c.id, perch.st)
  if (import.meta.env.DEV) ((window as unknown as { __clips: Record<string, unknown> }).__clips ??= {})[c.id] = { ...perch, open } // for inspecting from the console

  // open while it's held (or flying home), shut the moment it's let go: quick, and a bit quicker shut
  useFrame((_, dt) => {
    const want = perch.st.current.held || perch.fly.current ? 1 : 0
    open.current += (want - open.current) * (1 - Math.exp(-Math.min(dt, 0.05) * (want ? 14 : 24)))
  })

  // its colliders: each jaw's flat side, the hinge, the handles (clear of the pole: nothing inside the
  // jaws, so it slides on and off)
  const H = c.hinge
  const jawHalf = (c.x1 + 1) / 2
  const hx0 = c.x1 - 2
  const hx1 = H.x + H.r
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} sound="hard" hold={{ lift: 25, ...perch.hold }}>
        <group {...perch.hover.bind}>
          <ClipModel c={c} open={openRef} />
        </group>
        {([1, -1] as const).map((s) => (
          <CuboidCollider
            key={s}
            args={[jawHalf, c.length / 2, Math.max(c.t / 2, 1)]}
            position={[(c.x1 - 1) / 2, 0, s * (c.zIn + Math.max(c.t / 2, 1))]}
            mass={c.mass * 0.35}
            friction={0.8}
            collisionGroups={ITEM}
          />
        ))}
        <CuboidCollider args={[(hx1 - hx0) / 2, H.h / 2, c.zIn + c.t]} position={[(hx0 + hx1) / 2, 0, 0]} mass={c.mass * 0.2} friction={0.8} collisionGroups={ITEM} />
        <CuboidCollider args={[c.handle.len / 2, c.handle.h / 2, c.zIn * 0.8]} position={[hx1 + c.handle.len / 2, 0, 0]} mass={c.mass * 0.1} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

const WUMPUS_PERCH = wumpusPerch()

/** the clip and the Wumpus on a lamp (its group's frame is the lamp's) */
export function LampTrinkets({ lamp }: { lamp: RefObject<Group | null> }) {
  const lampAt = () => {
    const l = lamp.current
    if (!l) return null
    l.updateWorldMatrix(true, false)
    return l.matrixWorld
  }
  const spawnOf = (m: Matrix4) => {
    const l = lampAt()
    if (!l) return [0, 600, 0] as [number, number, number]
    l.clone().multiply(m).decompose(_p, _q, new Vector3())
    return _p.toArray() as [number, number, number]
  }
  return (
    <>
      {CLIP_LIST.map((c) => (
        <LiveClip key={c.id} c={c} lampAt={lampAt} spawn={spawnOf(clipMatrix(c))} />
      ))}
      <LiveWumpus
        perchAt={() => {
          const l = lampAt()
          return l && clipAtHome('amber') ? l.clone().multiply(WUMPUS_PERCH) : null
        }}
        spawn={spawnOf(WUMPUS_PERCH)}
      />
    </>
  )
}

const SHUT = { current: 0 }
/** the same, drawn only (for check sheets): put inside the lamp's frame */
export function StillTrinkets() {
  const wp = useMemo(() => {
    const p = new Vector3()
    const q = new Quaternion()
    WUMPUS_PERCH.decompose(p, q, new Vector3())
    return { p, q }
  }, [])
  return (
    <>
      {CLIP_LIST.map((c) => {
        const m = clipMatrix(c)
        const p = new Vector3()
        const q = new Quaternion()
        m.decompose(p, q, new Vector3())
        return (
          <group key={c.id} position={p} quaternion={q}>
            <ClipModel c={c} open={SHUT} />
          </group>
        )
      })}
      <group position={wp.p} quaternion={wp.q}>
        <WumpusModel />
      </group>
    </>
  )
}
