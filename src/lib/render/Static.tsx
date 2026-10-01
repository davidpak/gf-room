import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, Matrix4, Mesh, type BufferGeometry, type Group, type Material, type Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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
const _m = new Matrix4()
const _inv = new Matrix4()

type Built = { meshes: Mesh[]; sig: string }

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
function collect(root: Object3D, merged: Set<Object3D>) {
  root.updateWorldMatrix(true, true)
  _inv.copy(root.matrixWorld).invert()
  const out: Mesh[] = []
  const walk = (o: Object3D) => {
    if (!o.visible || merged.has(o) || o.userData.live) return
    if (mergeable(o)) out.push(o)
    for (const c of o.children) walk(c)
  }
  for (const c of root.children) walk(c)
  const sig = out
    .map((m) => {
      const e = _m.multiplyMatrices(_inv, m.matrixWorld).elements
      let h = 0
      for (let i = 0; i < 16; i++) h += e[i] * (i + 1.37)
      return `${m.id}:${m.geometry.id}:${(m.material as Material).uuid}:${h.toFixed(2)}`
    })
    .join(',')
  return { meshes: out, sig }
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

export function Static({ children }: { children: ReactNode }) {
  const root = useRef<Group>(null)
  const raycaster = useThree((s) => s.raycaster)
  const built = useRef<Built & { merged: Mesh[] }>({ meshes: [], sig: '', merged: [] })
  // (the pointer sees the hidden layer too)
  useEffect(() => void raycaster.layers.enable(HIDDEN), [raycaster])
  const rebuild = () => {
    const r = root.current
    if (!r) return
    const b = built.current
    const merged = new Set<Object3D>(b.merged)
    const { meshes, sig } = collect(r, merged)
    if (sig === b.sig) return
    // put the old ones back on the drawn layer, take the old merge away
    for (const m of b.meshes) m.layers.set(0)
    for (const m of b.merged) {
      r.remove(m)
      m.geometry.dispose()
    }
    const next = meshes.length > 1 ? build(r, meshes) : []
    if (next.length) {
      for (const m of meshes) m.layers.set(HIDDEN)
      for (const m of next) r.add(m)
    }
    built.current = { meshes: next.length ? meshes : [], sig, merged: next }
  }
  useLayoutEffect(rebuild)
  // (pieces coming and going between renders of this one: checked a few times a second)
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current += dt
    if (t.current < 0.3) return
    t.current = 0
    rebuild()
  })
  // (taken away, or remounted: everything as it was, so a remount merges afresh)
  useLayoutEffect(
    () => () => {
      const b = built.current
      for (const m of b.meshes) m.layers.set(0)
      for (const m of b.merged) {
        m.removeFromParent()
        m.geometry.dispose()
      }
      built.current = { meshes: [], sig: '', merged: [] }
    },
    [],
  )
  return <group ref={root}>{children}</group>
}
