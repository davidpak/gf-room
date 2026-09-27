import { BufferGeometry, Mesh, type Object3D } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

/**
 * Fast pointer hit-testing (three-mesh-bvh). Every mesh raycasts through a bounds tree when its
 * geometry has one, and exactly as before when it doesn't. Build trees for heavy geometry that
 * never changes shape (a blanket drawn once, a rigid item): testing the pointer against 140k
 * triangles then takes microseconds instead of several milliseconds per mouse move.
 * Geometry that moves its vertices (a cable tube) must not get a tree.
 */
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast

/** give this (fixed-shape) geometry a bounds tree; returns it for chaining */
export function fastHits<G extends BufferGeometry>(geometry: G): G {
  if (!geometry.boundsTree) geometry.computeBoundsTree()
  return geometry
}

/** bounds trees for every fixed-shape mesh under `root` above `minTris` triangles (rigid items) */
export function fastHitsUnder(root: Object3D, minTris = 2000) {
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || (m as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh || !m.geometry) return
    const g = m.geometry
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3
    if (tris >= minTris) fastHits(g)
  })
}
