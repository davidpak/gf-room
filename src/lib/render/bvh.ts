import { BufferGeometry, Mesh } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

/**
 * Pointing at big things, fast: what's under the pointer is found by casting a ray into the scene on every move,
 * and three.js tests a mesh by trying every one of its triangles. Over the Civic (~500k) that was ~18 ms a move,
 * frames lost every time the pointer crossed the car to open a door. A mesh whose geometry has an index of its
 * triangles (three-mesh-bvh's bounds tree: boxes within boxes) is tested in a fraction of a millisecond; every
 * other mesh is tested as before.
 *
 * Only for geometry that keeps its shape (the index isn't rebuilt when a geometry's points move): the car, and
 * what <Static> merges (still by definition).
 */
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast

/** the triangles below which a plain test is about as quick */
const MIN_TRIS = 1000

/** index these meshes' geometries for the pointer (each geometry once; small ones skipped) */
export function indexForPointer(meshes: Mesh[]) {
  for (const m of meshes) {
    const g = m.geometry
    if (g.boundsTree || g.morphAttributes.position) continue
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3
    if (tris >= MIN_TRIS) g.computeBoundsTree()
  }
}
