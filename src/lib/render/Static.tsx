import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, BufferAttribute, Matrix4, Mesh, Object3D, Sphere, type BufferGeometry, type Group, type Material, type Raycaster } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { indexForPointer } from './bvh'

/**
 * Fewer draw calls for things that don't move inside themselves: wrap them in <Static> and their meshes are
 * drawn as one mesh per material (and shadow setting), merged in the wrapper's frame, so the whole thing still
 * moves with whatever carries it (a loose thing's body). Nothing about how they behave changes: the meshes are all
 * still there, still clicked, hovered and grabbed as before, just moved to a layer the camera and the shadows
 * don't draw (HIDDEN, which the pointer still sees). When a piece of it comes or goes (eaten off the board), or
 * is hidden, it's merged again.
 *
 * Left as they are: instanced and skinned meshes, morphing ones, see-through ones (they're sorted one by one),
 * ones with several materials, and anything under a group marked `userData.live` (it moves inside itself).
 * Don't wrap anything that animates its parts (a lid, a page, a string): it would look frozen.
 */
export const HIDDEN = 7
const DEBUG = import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev'))
const _m = new Matrix4()
const _inv = new Matrix4()
const _box = new Box3()
const _sphere = new Sphere()

type Sig = { key: string; h: number }[]
type Built = { meshes: Mesh[]; sig: Sig }
const same = (a: Sig, b: Sig) => a.length === b.length && a.every((x, i) => x.key === b[i].key && Math.abs(x.h - b[i].h) < 0.5)

function mergeable(o: Object3D): o is Mesh {
  const m = o as Mesh
  if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh || (m as { isSkinnedMesh?: boolean }).isSkinnedMesh) return false
  if (Array.isArray(m.material)) return false
  const mat = m.material as Material
  if (mat.transparent || m.morphTargetInfluences?.length || m.geometry.morphAttributes.position) return false
  return true
}
/** the meshes under root to merge (visible all the way up, not under a live group), and a signature of them:
 *  which they are, their geometry and material, where they sit in root (so a piece swapped, reshaped or moved is
 *  merged again) */
function collect(from: Object3D, root: Object3D, merged: Set<Object3D>) {
  _inv.copy(root.matrixWorld).invert()
  const out: Mesh[] = []
  // (anything else drawn in it, left as it is: its place is kept up every frame, one by one)
  const others: Object3D[] = []
  const drawn = (o: Object3D) => (o as Mesh).isMesh || (o as { isLine?: boolean }).isLine || (o as { isPoints?: boolean }).isPoints || (o as { isSprite?: boolean }).isSprite
  const walk = (o: Object3D) => {
    if (merged.has(o)) return
    if (o.userData.live) return o.traverse((c) => void (drawn(c) && others.push(c)))
    if (!o.visible) return
    if (mergeable(o)) out.push(o)
    else if (drawn(o)) others.push(o)
    for (const c of o.children) walk(c)
  }
  for (const c of from.children) walk(c)
  // (which they are, and where: a number each, compared with some give, so the last decimal drifting as a loose
  // thing settles isn't taken for a change)
  const sig: Sig = out.map((m) => {
    const e = _m.multiplyMatrices(_inv, m.matrixWorld).elements
    let h = 0
    for (let i = 0; i < 16; i++) h += e[i] * (i + 1.37)
    return { key: `${m.id}:${m.geometry.id}:${(m.material as Material).uuid}`, h }
  })
  return { meshes: out, sig, others }
}

function build(root: Group, meshes: Mesh[]) {
  root.updateWorldMatrix(true, true)
  _inv.copy(root.matrixWorld).invert()
  const groups = new Map<string, { mat: Material; cast: boolean; recv: boolean; order: number; geos: BufferGeometry[] }>()
  for (const m of meshes) {
    const g = m.geometry
    const attrs = Object.keys(g.attributes).sort().join('|')
    const key = `${(m.material as Material).uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}|${attrs}`
    let k = groups.get(key)
    if (!k) groups.set(key, (k = { mat: m.material as Material, cast: m.castShadow, recv: m.receiveShadow, order: m.renderOrder, geos: [] }))
    // its geometry baked into the wrapper's frame (indexed, so they all merge; turned the right way if it's mirrored)
    _m.multiplyMatrices(_inv, m.matrixWorld)
    const c = g.clone()
    c.morphAttributes = {}
    if (!c.index) {
      const n = c.attributes.position.count
      const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n)
      for (let i = 0; i < n; i++) idx[i] = i
      c.setIndex(new BufferAttribute(idx, 1))
    }
    c.applyMatrix4(_m)
    if (_m.determinant() < 0) {
      const ix = c.index!.array
      for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]
    }
    c.clearGroups()
    k.geos.push(c)
  }
  const out: Mesh[] = []
  for (const k of groups.values()) {
    const geo = k.geos.length === 1 ? k.geos[0] : mergeGeometries(k.geos, false)
    if (!geo) continue
    if (k.geos.length > 1) k.geos.forEach((g) => g.dispose())
    const mesh = new Mesh(geo, k.mat)
    mesh.castShadow = k.cast
    mesh.receiveShadow = k.recv
    mesh.renderOrder = k.order
    mesh.raycast = () => {} // (the meshes it's made of take the pointer)
    mesh.userData.merged = true
    out.push(mesh)
  }
  return out
}

const NOOP = () => {}
/** a number that changes when anything in it does (what's there, shown or not, its shape, its look, where it sits):
 *  worked out without making anything, so checking for changes leaves nothing for the garbage collector */
function fingerprint(o: Object3D): number {
  const e = o.matrix.elements
  let h = o.id * 0.6180339 + (o.visible ? 1.5 : 0)
  h += o.position.x * 1.1 + o.position.y * 1.7 + o.position.z * 2.3 + o.quaternion.x * 3.1 + o.quaternion.y * 3.7 + o.quaternion.z * 4.3
  h += o.scale.x * 5.1 + o.scale.y * 5.3 + o.scale.z * 5.9 + e[12] * 1.9 + e[13] * 2.9 + e[14] * 3.9 + e[0] * 0.7 + e[5] * 0.9
  const m = o as Mesh
  if (m.isMesh) h += m.geometry.id * 7.7 + ((m.material as unknown as { id?: number }).id ?? 0) * 11.3
  if (!o.visible) return h
  const c = o.children
  for (let i = 0; i < c.length; i++) if (!c[i].userData.live) h = h * 1.0000001 + fingerprint(c[i])
  return h
}
const RAY = (o: Mesh) => Object.getPrototypeOf(o).raycast as Mesh['raycast']

export function Static({ children }: { children: ReactNode }) {
  const root = useRef<Group>(null)
  const orig = useRef<Group>(null)
  const raycaster = useThree((s) => s.raycaster)
  const gl = useThree((s) => s.gl)
  const built = useRef<Built & { merged: Mesh[] }>({ meshes: [], sig: [], merged: [] })
  // (the pointer sees the hidden layer too)
  useEffect(() => void raycaster.layers.enable(HIDDEN), [raycaster])
  // while it's merged, the meshes it's made of aren't redrawn, so their places aren't worked out every frame
  // either (the scene's biggest per-frame chore): only when the pointer's over them (once a frame at most), or
  // to check them for changes
  const stamp = useRef(-1)
  // what's drawn in it but not merged (a see-through jar, a swinging handle): kept in place as the scene's
  // places are worked out, along their own lines of parents only
  const loose = useRef<Object3D[]>([])
  const keepLoose = () => {
    const o = orig.current
    if (!o || !o.parent) return
    o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix)
    for (const l of loose.current) {
      if (!l.parent) continue // (taken away since it was last merged round: gone from the list at the next rebuild)
      if (l.matrixAutoUpdate) l.updateMatrix()
      l.matrixWorld.multiplyMatrices(l.parent!.matrixWorld, l.matrix)
    }
  }
  const thaw = () => {
    const o = orig.current
    if (!o) return
    root.current?.updateWorldMatrix(true, false)
    Object3D.prototype.updateMatrixWorld.call(o, true)
  }
  // (all of it, in the wrapper's frame: a pointer's ray that misses this misses every piece, so nothing in it
  // need be brought up to date or tried)
  const bound = useRef(new Sphere())
  const near = (rc: Raycaster) => {
    const r = root.current
    return !!r && rc.ray.intersectsSphere(_sphere.copy(bound.current).applyMatrix4(r.matrixWorld))
  }
  const fresh = () => {
    const frame = gl.info.render.frame
    if (stamp.current === frame) return
    stamp.current = frame
    thaw()
  }
  const rebuild = () => {
    const r = root.current
    const o = orig.current
    if (!r || !o) return
    thaw()
    const b = built.current
    const { meshes, sig, others } = collect(o, r, new Set<Object3D>(b.merged))
    // (each one's line of parents down from the wrapper, worked out once: kept up top down, no climbing)
    const seen = new Set<Object3D>()
    const chain: Object3D[] = []
    for (const l of others) {
      const up: Object3D[] = []
      for (let p: Object3D | null = l; p && p !== o; p = p.parent) if (!seen.has(p)) up.push(p)
      up.reverse().forEach((p) => (seen.add(p), chain.push(p)))
    }
    loose.current = chain
    if (same(sig, b.sig)) return
    // put the old ones back on the drawn layer, take the old merge away
    for (const m of b.meshes) {
      m.layers.set(0)
      delete (m as Partial<Mesh>).raycast
    }
    for (const m of b.merged) {
      r.remove(m)
      m.geometry.dispose()
    }
    if (DEBUG && b.sig.length) ((window as unknown as { __restatics?: unknown[] }).__restatics ??= []).push({ t: Math.round(performance.now()), n: [b.meshes.length, meshes.length] })
    const next = meshes.length > 1 ? build(r, meshes) : []
    if (next.length) {
      indexForPointer(meshes) // (still, so found under the pointer quickly: ./bvh)
      _box.makeEmpty()
      for (const m of next) {
        m.geometry.computeBoundingBox()
        _box.union(m.geometry.boundingBox!)
      }
      _box.getBoundingSphere(bound.current)
      for (const m of meshes) {
        m.layers.set(HIDDEN)
        m.raycast = function (rc, hits) {
          if (!near(rc)) return
          fresh()
          RAY(this).call(this, rc, hits)
        }
      }
      for (const m of next) r.add(m)
    }
    if (next.length) o.updateMatrixWorld = loose.current.length ? keepLoose : NOOP
    else delete (o as Partial<Group>).updateMatrixWorld
    built.current = { meshes: next.length ? meshes : [], sig, merged: next }
  }
  useLayoutEffect(() => {
    rebuild()
    if (orig.current) print.current = fingerprint(orig.current)
  })
  // (pieces coming and going between renders of this one: checked twice a second, each on its own beat so they
  // never all check on the same frame, and cheaply: merged again only if its fingerprint changed)
  const t = useRef(-Math.random() * 0.5)
  const print = useRef(NaN)
  useFrame((_, dt) => {
    t.current += dt
    if (t.current < 0.5) return
    t.current -= 0.5
    const o = orig.current
    if (!o) return
    const p = fingerprint(o)
    if (p === print.current) return
    print.current = p
    rebuild()
  })
  // (taken away, or remounted: everything as it was, so a remount merges afresh)
  useLayoutEffect(
    () => () => {
      const b = built.current
      for (const m of b.meshes) {
        m.layers.set(0)
        delete (m as Partial<Mesh>).raycast
      }
      for (const m of b.merged) {
        m.removeFromParent()
        m.geometry.dispose()
      }
      if (orig.current) delete (orig.current as Partial<Group>).updateMatrixWorld
      built.current = { meshes: [], sig: [], merged: [] }
    },
    [],
  )
  return (
    <group ref={root}>
      <group ref={orig}>{children}</group>
    </group>
  )
}
