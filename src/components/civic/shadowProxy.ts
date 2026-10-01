import { MeshoptSimplifier } from 'meshoptimizer'
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * The car's shadow cast by a stand-in: the model's meshes are ~500k triangles, and every one of them was
 * drawn into the sun's shadow map every frame the car moved (the map follows it). A toy-sized car's
 * shadow needs a few percent of that: each mesh simplified (to a few percent of its triangles), merged
 * into one stand-in for each piece that moves on its own and hung on it, so it opens and turns with its door, its lid, its wheel; the stand-in casts the shadow and draws nothing
 * on screen, the meshes themselves draw and cast none.
 */
let ready = false
void MeshoptSimplifier.ready.then(() => (ready = true))
export const shadowProxiesReady = () => ready
export const whenShadowProxiesReady = MeshoptSimplifier.ready

/** draws nothing (no colour, no depth): only its shadow is seen */
const NOTHING = new MeshBasicMaterial({ colorWrite: false, depthWrite: false })
const cache = new WeakMap<BufferGeometry, BufferGeometry>()
const ERROR_MM = 40
const _v = new Vector3()

/** a simplified copy of a geometry, its positions only (a small one as it is) */
/** (`size`: how big a unit of its positions is, in mm) */
function simplified(g: BufferGeometry, keep: number, size: number): BufferGeometry {
  if (cache.has(g)) return cache.get(g)!
  const pos = g.attributes.position
  const n = pos.count
  const p = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.getX(i)
    p[i * 3 + 1] = pos.getY(i)
    p[i * 3 + 2] = pos.getZ(i)
  }
  const src = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i)
  // (the sloppy simplifier: it merges vertices on a grid, ignoring how the surface is stitched. The model's
  // made of many loose patches the careful one won't touch the edges of; a shadow only needs the shape. Up to
  // 4 cm off on the real car, about 3 texels of the sun's map on the toy, inside its soft edge; its error's
  // given as a share of the piece's size)
  g.computeBoundingBox()
  const d = g.boundingBox!.getSize(_v)
  const extent = Math.max(d.x, d.y, d.z) * size
  const target = Math.max(36, Math.floor((src.length / 3) * keep) * 3)
  const [idx] = MeshoptSimplifier.simplifySloppy(src, p, 3, null, target, extent > 0 ? Math.min(0.05, ERROR_MM / extent) : 0.01)
  const out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(p, 3))
  out.setIndex(new BufferAttribute(idx.length && idx.length < src.length ? idx : src, 1))
  cache.set(g, out)
  return out
}

/** the shadow-casting meshes under `root`: their shadows cast instead by one simplified stand-in for each
 *  piece that moves on its own (the body, each door, the lid, each wheel: the meshes' parents) */
export function addShadowProxies(meshes: Mesh[], keep = 0.03) {
  const byParent = new Map<Object3D, Mesh[]>()
  for (const m of meshes) {
    if (!m.castShadow || !m.parent) continue
    const l = byParent.get(m.parent) ?? []
    l.push(m)
    byParent.set(m.parent, l)
  }
  for (const [parent, ms] of byParent) {
    if (parent.userData.shadowProxy) continue
    const parts: BufferGeometry[] = []
    for (const m of ms) {
      const g = simplified(m.geometry, keep, m.scale.x) // (the car is in real mm at its pieces' hinges)
      m.updateMatrix()
      parts.push(g.clone().applyMatrix4(m.matrix))
      m.castShadow = false
    }
    if (!parts.length) continue
    const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
    if (!geo) continue
    const proxy = new Mesh(geo, NOTHING)
    proxy.castShadow = true
    proxy.raycast = () => {} // (the meshes take the pointer)
    parent.add(proxy)
    parent.userData.shadowProxy = proxy
  }
}
