import { useSyncExternalStore } from 'react'
import { CylinderCollider, type RapierRigidBody } from '@react-three/rapier'
import { Quaternion, Vector3, type Object3D } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { leaveCrate } from './browse'
import { putOn } from './putOn'
import { Disc, discThick, useArt } from './Record'
import { sizeOf, type Pressing } from './vinyl'

/**
 * Records out of their jackets, for real: clicked out of the jacket (./Crate), the record's a thing like any other,
 * carried (left drag), turned (right drag), dropped. Let go of it over the turntable's platter and it goes on
 * (./putOn: down onto the spindle, whichever side is up, up). A few at most lie about: taking out another past that
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

function Record({ l, scale }: { l: Loose; scale: number }) {
  const art = useArt(l.p)
  const S = sizeOf(l.p)
  const t = discThick(S)
  if (!art) return null
  const release = (b: RapierRigidBody) => {
    const sp = spindle.current
    if (!sp) return
    sp.getWorldPosition(_s)
    const k = sp.getWorldScale(_c).x
    const r = b.rotation()
    const q = new Quaternion(r.x, r.y, r.z, r.w)
    _up.set(0, 1, 0).applyQuaternion(q)
    // (its middle: up from the body's origin, its bottom face, by half its thickness)
    const tr = b.translation()
    _c.set(tr.x, tr.y, tr.z).addScaledVector(_up, (t * scale) / 2)
    const across = Math.hypot(_c.x - _s.x, _c.z - _s.z)
    const above = _c.y - _s.y
    if (across < 70 * k && above > -25 * k && above < 320 * k) {
      set(list.filter((x) => x.key !== l.key))
      putOn(l.p, l.disc, _up.y < 0 ? 1 : 0)
    }
  }
  return (
    <Holdable
      position={[l.at.x, l.at.y, l.at.z]}
      quaternion={[l.q.x, l.q.y, l.q.z, l.q.w]}
      colliders={false}
      ccd
      sound="soft"
      linearDamping={0.5}
      angularDamping={1.2}
      hold={{ lift: 40 * scale, onRelease: release }}
    >
      <group scale={scale}>
        <Disc p={l.p} art={art} disc={l.disc} />
      </group>
      <CylinderCollider args={[(t * scale) / 2, S.r * scale]} position={[0, (t * scale) / 2, 0]} mass={S.mass} friction={0.6} restitution={0.05} />
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
