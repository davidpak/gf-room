import { useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderCollider, type RapierRigidBody } from '@react-three/rapier'
import { Quaternion, Vector3, type Object3D } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { leaveCrate } from './browse'
import { putOn } from './putOn'
import { Disc, discThick, useArt } from './Record'
import { sizeOf, type Pressing } from './vinyl'

/**
 * Records out of their jackets, for real: clicked out of the jacket (./Crate), the record's a thing like any other,
 * carried (left drag), turned (right drag), dropped. Carried to the turntable, near its spindle, it goes on by itself
 * (the hand lets go of it), or let go over the platter (./putOn: down onto the spindle, whichever side is up, up). A few at most lie about: taking out another past that
 * puts the oldest back in its jacket.
 */
type Loose = { key: number; p: Pressing; disc: number; at: Vector3; q: Quaternion }
let list: Loose[] = []
let n = 0
const subs = new Set<() => void>()
const set = (l: Loose[]) => {
  list = l
  subs.forEach((f) => f())
}
const useLoose = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => list)
export const clearLoose = () => set([])

/** the record out of its jacket, starting just where it was shown (an Object3D in the disc's frame) */
export function takeLoose(p: Pressing, disc: number, at: Object3D) {
  at.updateWorldMatrix(true, false)
  const pos = new Vector3()
  const q = new Quaternion()
  at.getWorldPosition(pos)
  at.getWorldQuaternion(q)
  set([...list.filter((l) => !(l.p.uri === p.uri && l.disc === disc)).slice(-2), { key: ++n, p, disc, at: pos, q }])
  // (the jacket back in the crate, the camera back out: her hand's free to carry it)
  leaveCrate()
}

/** where the spindle is (./Turntable sets it): a record let go near enough goes on */
export const spindle = { current: null as Object3D | null }
const _s = new Vector3()
const _c = new Vector3()
const _up = new Vector3()

/** how near the spindle (its world scale's mm) a record's middle has to be to go on: across, and above */
const NEAR = { across: 75, below: -25, above: 260 }

function Record({ l, scale }: { l: Loose; scale: number }) {
  const art = useArt(l.p)
  const S = sizeOf(l.p)
  const t = discThick(S)
  const body = useRef<RapierRigidBody | null>(null)
  // held: carried by the hand; armed: it's been carried clear of the player first (so picking one up off the platter
  // area doesn't put it straight back); going: near enough while held, the hand lets go and it goes on
  const st = useRef({ held: false, armed: false, going: false })
  /** how it is against the spindle now: near enough to go on, and which side's up */
  const near = (b: RapierRigidBody) => {
    const sp = spindle.current
    if (!sp) return null
    sp.getWorldPosition(_s)
    const k = sp.getWorldScale(_c).x
    const r = b.rotation()
    _up.set(0, 1, 0).applyQuaternion(new Quaternion(r.x, r.y, r.z, r.w))
    // (its middle: up from the body's origin, its bottom face, by half its thickness)
    const tr = b.translation()
    _c.set(tr.x, tr.y, tr.z).addScaledVector(_up, (t * scale) / 2)
    const across = Math.hypot(_c.x - _s.x, _c.z - _s.z)
    const above = _c.y - _s.y
    return { ok: across < NEAR.across * k && above > NEAR.below * k && above < NEAR.above * k, far: across > NEAR.across * 2 * k || above > NEAR.above * 1.5 * k, face: (_up.y < 0 ? 1 : 0) as 0 | 1 }
  }
  const goOn = (face: 0 | 1) => {
    set(list.filter((x) => x.key !== l.key))
    putOn(l.p, l.disc, face)
  }
  // held near the player: it goes on by itself (the hand lets go of it, ./Turntable sets it down on the spindle)
  useFrame(() => {
    const b = body.current
    const s0 = st.current
    if (!b || !s0.held || s0.going) return
    const n = near(b)
    if (!n) return
    if (n.far) s0.armed = true
    if (s0.armed && n.ok) s0.going = true
  })
  if (!art) return null
  const hold = {
    lift: 40 * scale,
    whileLooking: true,
    keep: () => !st.current.going,
    onGrab: () => {
      const b = body.current
      st.current = { held: true, armed: !!b && !near(b)?.ok, going: false }
    },
    onRelease: (b: RapierRigidBody) => {
      const s0 = st.current
      s0.held = false
      const n = near(b)
      // (let go over the platter, or the hand letting go because it's near: on it goes)
      if (s0.going || n?.ok) goOn(n?.face ?? 0)
    },
  }
  return (
    <Holdable
      bodyRef={body}
      position={[l.at.x, l.at.y, l.at.z]}
      quaternion={[l.q.x, l.q.y, l.q.z, l.q.w]}
      colliders={false}
      ccd
      sound="soft"
      linearDamping={0.5}
      angularDamping={1.2}
      hold={hold}
    >
      <group scale={scale}>
        <Disc p={l.p} art={art} disc={l.disc} />
      </group>
      {/* (a record's a few toy tenths of a mm thick: its body a little thicker, so it rests on things, not in them) */}
      <CylinderCollider args={[Math.max((t * scale) / 2, 1.2), S.r * scale]} position={[0, Math.max((t * scale) / 2, 1.2), 0]} mass={S.mass} friction={0.6} restitution={0.05} />
    </Holdable>
  )
}

/** the records lying about, drawn at `scale` (the page's size for things: 1 full size, the Quad's toy scale) */
export function LooseRecords({ scale = 1 }: { scale?: number }) {
  const l = useLoose()
  return (
    <>
      {l.map((x) => (
        <Record key={x.key} l={x} scale={scale} />
      ))}
    </>
  )
}
