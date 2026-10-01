import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { IcosahedronGeometry, Matrix4, Quaternion, Vector3, type Group } from 'three'
import { bruno } from '../quad/bruno'
import { baguetteGeo, BAGUETTE_R, BREAD } from './Baguette'
import { feed, useFeed, type Bit, type Throw } from './feed'
import { rng } from './paint'

/**
 * The bread for the ducks (./feed), drawn: a piece torn off the baguette pulls away from it and is thrown,
 * turning over in the air, down onto the grass (where it lies, getting smaller as it's pecked at); crumbs
 * that fell as it tore drop and lie there. `scale` is the scene's (the Quad's toy scale, 1 in the gallery).
 */
const CRUMB = new IcosahedronGeometry(1, 0)
{
  // (each crumb a little lumpy)
  const p = CRUMB.attributes.position
  const r = rng(3)
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.6 + r() * 0.3), p.getZ(i) * (0.8 + r() * 0.4))
  CRUMB.computeVertexNormals()
}
const CRUMB_MATS = [bruno({ color: '#f1dcae', shade: '#b39a90' }), bruno({ color: '#c98a45', shade: '#8a6478' })]
const crumbSize = (seed: number) => 6 + (seed % 5)

/** a piece's resting pose: lying on its bottom, turned `yaw`, at p (its middle) */
function lying(b: { p: Vector3; yaw: number }, scale: number) {
  return new Matrix4().compose(b.p.clone().add(new Vector3(0, BAGUETTE_R * 0.8 * scale, 0)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), b.yaw), new Vector3(scale, scale, scale))
}

function Flying({ t, scale }: { t: Throw; scale: number }) {
  const g = useRef<Group>(null)
  const mid = (t.a + t.b) / 2
  const geo = useMemo(() => (t.kind === 'piece' ? baguetteGeo(t.a, t.b) : null), [t])
  const path = useMemo(() => {
    const p0 = new Vector3()
    const q0 = new Quaternion()
    const s = new Vector3()
    t.from.decompose(p0, q0, s)
    // (from the middle of the piece where it is on the baguette)
    const start = t.kind === 'piece' ? new Vector3(mid, BAGUETTE_R, 0).applyMatrix4(t.from) : p0.clone()
    const pull = new Vector3(Math.sign(mid) * 16, 2, 0).applyQuaternion(q0).multiplyScalar(s.x)
    const r = rng(t.seed)
    const yaw = r() * Math.PI * 2
    const end = lying({ p: t.to, yaw }, scale)
    const pe = new Vector3()
    const qe = new Quaternion()
    end.decompose(pe, qe, new Vector3())
    const spin = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
    const dist = start.distanceTo(pe)
    return { start, pull, q0, pe, qe, yaw, spin, high: t.kind === 'piece' ? dist * 0.32 + 40 * scale : 0, turns: t.kind === 'piece' ? 1.5 + r() * 1.5 : 1 }
  }, [t, mid, scale])
  const _q = useMemo(() => new Quaternion(), [])
  const _s = useMemo(() => new Quaternion(), [])
  const done = useRef(false)
  useFrame((_, dt) => {
    const o = g.current
    if (!o || done.current) return
    t.t = Math.min(1, t.t + Math.max(0, Math.min(0.05, dt)) / t.dur)
    const u = t.t
    const { start, pull, q0, pe, qe, spin, high, turns } = path
    const PULL = t.kind === 'piece' ? 0.16 : 0
    if (u < PULL) {
      // torn: pulled away from the rest, twisting free
      const k = u / PULL
      o.position.copy(start).addScaledVector(pull, Math.sin((k * Math.PI) / 2))
      o.quaternion.copy(q0).multiply(_s.setFromAxisAngle(new Vector3(1, 0, 0), k * 0.4))
    } else {
      // thrown: up and over, turning, down onto the grass (a crumb just falls)
      const v = (u - PULL) / (1 - PULL)
      o.position.lerpVectors(start.clone().add(pull), pe, v)
      o.position.y += high * 4 * v * (1 - v)
      _q.copy(q0).multiply(_s.setFromAxisAngle(spin, v * turns * Math.PI * 2))
      o.quaternion.copy(_q).slerp(qe, Math.pow(v, 3))
    }
    o.scale.setScalar(scale)
    if (u >= 1) {
      done.current = true
      feed.land(t, path.yaw)
    }
  })
  return (
    <group ref={g}>
      {geo ? (
        <group position={[-mid, -BAGUETTE_R, 0]}>
          <BreadMeshes geo={geo} />
        </group>
      ) : (
        <mesh geometry={CRUMB} material={CRUMB_MATS[t.seed % 2]} scale={crumbSize(t.seed)} castShadow />
      )}
    </group>
  )
}

/** a piece, lying where it landed: smaller each time it's pecked, a little shake when it is */
function Lying({ b, scale }: { b: Bit; scale: number }) {
  const g = useRef<Group>(null)
  const geo = useMemo(() => (b.kind === 'piece' ? baguetteGeo(b.a, b.b) : null), [b])
  const mid = (b.a + b.b) / 2
  const m = useMemo(() => lying(b, scale), [b, scale])
  const last = useRef(b.left)
  const shake = useRef(0)
  useFrame((_, dt) => {
    const o = g.current
    if (!o) return
    if (b.left !== last.current) {
      last.current = b.left
      shake.current = 1
    }
    shake.current = Math.max(0, shake.current - dt * 4)
    const k = b.kind === 'piece' ? 0.4 + 0.6 * (b.left / b.bites) : 1
    o.matrix.copy(m)
    o.matrix.multiply(new Matrix4().makeRotationY(Math.sin(shake.current * 20) * 0.15 * shake.current))
    o.matrix.multiply(new Matrix4().makeScale(k, k, k))
  })
  return (
    <group ref={g} matrixAutoUpdate={false}>
      {geo ? (
        <group position={[-mid, -BAGUETTE_R * 0.8, 0]}>
          <BreadMeshes geo={geo} />
        </group>
      ) : (
        <mesh geometry={CRUMB} material={CRUMB_MATS[b.seed % 2]} scale={crumbSize(b.seed)} position={[0, -BAGUETTE_R * 0.8 + 3, 0]} castShadow />
      )}
    </group>
  )
}

function BreadMeshes({ geo }: { geo: ReturnType<typeof baguetteGeo> }) {
  return (
    <>
      <mesh geometry={geo.crust} material={BREAD.crust} castShadow />
      {geo.caps.map((c, i) => (
        <mesh key={i} geometry={c} material={BREAD.torn} />
      ))}
    </>
  )
}

export function Feed({ scale }: { scale: number }) {
  useFeed()
  return (
    <>
      {feed.throws().map((t) => (
        <Flying key={t.id} t={t} scale={scale} />
      ))}
      {feed.bits().map((b) => (
        <Lying key={b.id} b={b} scale={scale} />
      ))}
    </>
  )
}
