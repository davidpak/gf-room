import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3, type Group, type Mesh } from 'three'
import { bruno } from '../quad/bruno'
import { anchors } from './anchors'
import { Disc } from './Disc'
import { FLIGHT, getCube } from './state'

/**
 * A cable between two of the setup's anchors (./anchors), wherever they've been carried: it leaves each along the
 * anchor's +z, droops, and lies along the ground between (a formula shape, no rope: a curve from end to end, sagged,
 * kept off the ground), a tube round it, rebuilt in place only when an end has moved. Drawn in the world's own frame
 * (so it can sit anywhere in the scene); \`ground\` the world height it lies on, \`radius\` its thickness there.
 */
const N = 48 // (along it)
const R = 6 // (round it)
const _a = new Vector3()
const _b = new Vector3()
const _da = new Vector3()
const _db = new Vector3()
const _p = new Vector3()
const _t = new Vector3()
const _n = new Vector3()
const _bn = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const UP = new Vector3(0, 1, 0)
const SIDE = new Vector3(1, 0, 0)

export function Cable({ from, to, radius, ground, color }: { from: string; to: string; radius: number; ground: number; color: string }) {
  const ref = useRef<Mesh>(null)
  const mat = useMemo(() => bruno({ color, shade: '#141318' }), [color])
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array((N + 1) * R * 3), 3))
    g.setAttribute('normal', new BufferAttribute(new Float32Array((N + 1) * R * 3), 3))
    const idx: number[] = []
    for (let i = 0; i < N; i++)
      for (let j = 0; j < R; j++) {
        const a = i * R + j
        const b = i * R + ((j + 1) % R)
        idx.push(a, a + R, b, b, a + R, b + R)
      }
    g.setIndex(idx)
    return g
  }, [])
  const last = useRef('')
  const pts = useMemo(() => Array.from({ length: N + 1 }, () => new Vector3()), [])
  useFrame(() => {
    const m = ref.current
    const A = anchors.get(from)
    const B = anchors.get(to)
    if (!m) return
    if (!A || !B) {
      m.visible = false
      return
    }
    m.visible = true
    A.updateWorldMatrix(true, false)
    B.updateWorldMatrix(true, false)
    _a.setFromMatrixPosition(A.matrixWorld)
    _b.setFromMatrixPosition(B.matrixWorld)
    _da.set(0, 0, 1).transformDirection(A.matrixWorld)
    _db.set(0, 0, 1).transformDirection(B.matrixWorld)
    const key = [_a, _b, _da, _db].map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`).join('|')
    if (key === last.current) return
    last.current = key
    // the curve: out of each end along its anchor, sagging between, kept on the ground
    const L = _a.distanceTo(_b)
    const k = Math.max(L * 0.3, radius * 12)
    const lie = ground + radius
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const u = 1 - t
      const p = pts[i]
      p.copy(_a).multiplyScalar(u * u * u)
      p.addScaledVector(_p.copy(_a).addScaledVector(_da, k), 3 * u * u * t)
      p.addScaledVector(_p.copy(_b).addScaledVector(_db, k), 3 * u * t * t)
      p.addScaledVector(_b, t * t * t)
      p.y -= L * 0.55 * Math.sin(Math.PI * t) * Math.min(1, 6 * t * u)
      if (p.y < lie) p.y = lie
    }
    const pos = geo.attributes.position as BufferAttribute
    const nor = geo.attributes.normal as BufferAttribute
    for (let i = 0; i <= N; i++) {
      _t.copy(pts[Math.min(N, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize()
      _n.crossVectors(_t, Math.abs(_t.y) > 0.9 ? SIDE : UP).normalize()
      _bn.crossVectors(_t, _n)
      for (let j = 0; j < R; j++) {
        const a = (j / R) * Math.PI * 2
        _s.copy(_n).multiplyScalar(Math.cos(a)).addScaledVector(_bn, Math.sin(a))
        const o = (i * R + j) * 3
        pos.array[o] = pts[i].x + _s.x * radius
        pos.array[o + 1] = pts[i].y + _s.y * radius
        pos.array[o + 2] = pts[i].z + _s.z * radius
        nor.array[o] = _s.x
        nor.array[o + 1] = _s.y
        nor.array[o + 2] = _s.z
      }
    }
    pos.needsUpdate = true
    nor.needsUpdate = true
  })
  return <mesh ref={ref} geometry={geo} material={mat} matrixAutoUpdate={false} matrixWorldAutoUpdate={false} frustumCulled={false} castShadow raycast={() => {}} />
}

/** the disc flying between the console and its case (./state's flight): out of one seat, up in an arc, into the other */
const _m0 = new Matrix4()
const _m1 = new Matrix4()
const _p0 = new Vector3()
const _p1 = new Vector3()
const _q0 = new Quaternion()
const _q1 = new Quaternion()
const _s0 = new Vector3()
const _s1 = new Vector3()
export function DiscFlight() {
  const ref = useRef<Group>(null)
  const f = getCube().flight
  useFrame(() => {
    const g = ref.current
    const fl = getCube().flight
    if (!g) return
    g.visible = !!fl
    if (!fl) return
    const A = anchors.get(fl.to === 'case' ? 'seat-console' : 'seat-case')
    const to = anchors.get(fl.to === 'case' ? 'seat-case' : 'seat-console')
    if (!A || !to) return
    A.updateWorldMatrix(true, false)
    to.updateWorldMatrix(true, false)
    _m0.copy(A.matrixWorld).decompose(_p0, _q0, _s0)
    _m1.copy(to.matrixWorld).decompose(_p1, _q1, _s1)
    const t = Math.min(1, Math.max(0, (performance.now() / 1000 - fl.at) / FLIGHT))
    const e = t * t * (3 - 2 * t)
    _p.lerpVectors(_p0, _p1, e)
    _p.y += Math.sin(Math.PI * e) * 120 * _s0.y
    _q.slerpQuaternions(_q0, _q1, e)
    _s.lerpVectors(_s0, _s1, e)
    g.matrixWorld.compose(_p, _q, _s)
  })
  return (
    <group ref={ref} matrixAutoUpdate={false} matrixWorldAutoUpdate={false} visible={!!f}>
      <Disc />
    </group>
  )
}
