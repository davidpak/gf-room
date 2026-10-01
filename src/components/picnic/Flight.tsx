import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Matrix4, Quaternion, Vector3, type Group } from 'three'
import { Sandwich } from './Sandwich'

/**
 * A sandwich lifted out of the basket: up out of it, over its rim in an arc, turning as it goes, and down to
 * lie on the blanket (where it's handed on: to the physics as a toy in the Quad, or left lying on the
 * gallery page). `from` and `to` are world matrices (their scale the sandwich's).
 */
export type Flight = { id: number; half: 0 | 1; from: Matrix4; to: Matrix4 }
const DUR = 0.85

function Flying({ f, onLand }: { f: Flight; onLand: (f: Flight) => void }) {
  const g = useRef<Group>(null)
  const t = useRef(0)
  const path = useMemo(() => {
    const p0 = new Vector3()
    const q0 = new Quaternion()
    const s = new Vector3()
    f.from.decompose(p0, q0, s)
    const p3 = new Vector3()
    const q3 = new Quaternion()
    f.to.decompose(p3, q3, new Vector3())
    const k = s.x // (the scale: real mm to the world)
    // straight up out of the basket first, then over and down
    const p1 = p0.clone().add(new Vector3(0, 230 * k, 0))
    const p2 = p3.clone().add(new Vector3(0, 170 * k, 0)).lerp(p1, 0.25)
    return { p0, p1, p2, p3, q0, q3, s }
  }, [f])
  const _p = useMemo(() => new Vector3(), [])
  const _q = useMemo(() => new Quaternion(), [])
  const _tilt = useMemo(() => new Quaternion(), [])
  const landed = useRef(false)
  useFrame((_, dt) => {
    const o = g.current
    if (!o || landed.current) return
    t.current = Math.min(1, t.current + dt / DUR)
    const u = t.current
    // its path: eased in and out, and its height up off the bezier a little (a lift, then a settle)
    const e = u * u * (3 - 2 * u)
    const a = 1 - e
    const { p0, p1, p2, p3, q0, q3, s } = path
    _p.set(0, 0, 0)
      .addScaledVector(p0, a * a * a)
      .addScaledVector(p1, 3 * a * a * e)
      .addScaledVector(p2, 3 * a * e * e)
      .addScaledVector(p3, e * e * e)
    // turning to lie as it'll land, with a little tip as it swings over
    _q.copy(q0).slerp(q3, Math.min(1, e * 1.15))
    _tilt.setFromAxisAngle(new Vector3(1, 0, 0), Math.sin(Math.PI * u) * 0.35)
    _q.multiply(_tilt)
    o.position.copy(_p)
    o.quaternion.copy(_q)
    o.scale.copy(s)
    if (u >= 1) {
      landed.current = true
      onLand(f)
    }
  })
  return (
    <group ref={g} matrixAutoUpdate>
      <Sandwich half={f.half} />
    </group>
  )
}

export function Flights({ flights, onLand }: { flights: Flight[]; onLand: (f: Flight) => void }) {
  return (
    <>
      {flights.map((f) => (
        <Flying key={f.id} f={f} onLand={onLand} />
      ))}
    </>
  )
}
