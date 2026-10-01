import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Matrix4, Quaternion, Vector3, type Group } from 'three'
import { FoodModel, type Food, type FoodState } from './food'

/**
 * Something lifted out of the basket (./food): up out of it, over its rim in an arc, turning as it goes, and
 * down to lie on the blanket (where it's handed on: to the physics as a toy in the Quad, or left lying on the
 * gallery page). `from` and `to` are world matrices (their scale the thing's).
 */
export type Flight = { id: number; food: Food; state?: FoodState; from: Matrix4; to: Matrix4; /** the height (world) it rises to first, clear of the basket */ clear: number }
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
    // straight up out of the basket, clear of its rim; then over in an arc and down onto the blanket
    const p1 = new Vector3(p0.x, f.clear, p0.z)
    const c = p1.clone().lerp(p3, 0.5)
    c.y = f.clear + (f.clear - p3.y) * 0.35
    return { p0, p1, c, p3, q0, q3, s }
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
    const ease = (x: number) => x * x * (3 - 2 * x)
    const { p0, p1, c, p3, q0, q3, s } = path
    if (u < 0.38) _p.lerpVectors(p0, p1, ease(u / 0.38))
    else {
      // (a quadratic arc from over the basket to the blanket: it only drops once it's out past the rim)
      const v = ease((u - 0.38) / 0.62)
      const a = 1 - v
      _p.set(0, 0, 0).addScaledVector(p1, a * a).addScaledVector(c, 2 * a * v).addScaledVector(p3, v * v)
    }
    // (held as it was till it's clear of the rim:) then turning to lie as it'll land, with a little tip as it swings over
    const v = u < 0.38 ? 0 : ease((u - 0.38) / 0.62)
    _q.copy(q0).slerp(q3, Math.min(1, v * 1.1))
    _tilt.setFromAxisAngle(new Vector3(1, 0, 0), Math.sin(Math.PI * v) * 0.3)
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
      <FoodModel f={f.food} state={f.state} />
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
