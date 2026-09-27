import { BufferGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D, type Scene } from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ROOM } from '../spec'

/**
 * Dev only: exports the room for the Blender lighting bake (blender/bake_room.py).
 *
 * Every mesh in the scene gets one of three roles:
 *   bake      static architecture and furniture: Blender gives it lightmap UVs and bakes the
 *             room's light into textures, which the page then shows (./Baked)
 *   occluder  things that move or stay live-lit (the doll, lamp, bedding, pillows, blinds,
 *             mirrors): they block and bounce light in the bake, but keep their live lighting
 *   skip      glowing and see-through things (bulbs, sky, halos, the shade's glow)
 *
 * Meshes are identified by their path in the scene graph (child indices from the scene root),
 * which is stable as long as the code that builds the room doesn't change; re-bake when it does.
 * Geometry is exported in its own local space under a node carrying its world transform, all
 * under a root scaled to metres, so Blender's lights behave at real size.
 *
 * Writes blender/bake/in/room.glb and blender/bake/in/room.json through the dev server.
 */
export type BakeRole = 'bake' | 'occluder' | 'skip'

export function pathOf(o: Object3D) {
  const parts: number[] = []
  let c: Object3D | null = o
  while (c && c.parent) {
    parts.push(c.parent.children.indexOf(c))
    c = c.parent
  }
  return parts.reverse().join('/')
}

function flagged(o: Object3D, key: string) {
  for (let c: Object3D | null = o; c; c = c.parent) if (c.userData[key]) return true
  return false
}

function mats(m: Mesh): Material[] {
  return Array.isArray(m.material) ? m.material : [m.material]
}

export function roleOf(o: Object3D): BakeRole {
  const mesh = o as Mesh
  if (!mesh.isMesh || !o.visible) return 'skip'
  for (let c: Object3D | null = o; c; c = c.parent) if (!c.visible) return 'skip'
  const ms = mats(mesh)
  const kinds = ms.map((m) => m.type)
  if (ms.some((m) => m.transparent || m.blending !== 1 || !m.colorWrite)) return 'skip'
  if (kinds.some((k) => k === 'MeshBasicMaterial' || k === 'ShaderMaterial' || k === 'PointsMaterial')) return 'skip'
  if ((mesh as InstancedMesh).isInstancedMesh) return 'occluder'
  if (flagged(o, 'bakeLive')) return 'occluder'
  const key = (m: Material) => ((m as { customProgramCacheKey?: () => string }).customProgramCacheKey?.() ?? '')
  if (ms.some((m) => key(m).includes('fabric'))) return 'occluder'
  if (ms.some((m) => (m as { mirror?: number }).mirror !== undefined)) return 'occluder'
  return 'bake'
}

/** Position + normal (+ index) only: Blender makes the lightmap UVs. Keeps material groups. */
function slim(g: BufferGeometry) {
  const out = new BufferGeometry()
  out.setAttribute('position', g.getAttribute('position').clone())
  const n = g.getAttribute('normal')
  if (n) out.setAttribute('normal', n.clone())
  else out.computeVertexNormals()
  if (g.index) out.setIndex(g.index.clone())
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex)
  return out
}

function exportMaterial(m: Material) {
  const c = (m as { color?: Color }).color
  return new MeshStandardMaterial({ color: c ? c.clone() : new Color(0.8, 0.8, 0.8), roughness: 1, metalness: 0 })
}

export async function exportBake(scene: Scene) {
  scene.updateMatrixWorld(true)
  const root = new Group()
  root.name = 'bake_root'
  root.scale.setScalar(0.001) // mm -> m
  const entries: { name: string; path: string; role: BakeRole }[] = []
  const matCache = new Map<Material, MeshStandardMaterial>()
  const expMat = (m: Material) => {
    if (!matCache.has(m)) matCache.set(m, exportMaterial(m))
    return matCache.get(m)!
  }
  let i = 0
  scene.traverse((o) => {
    const role = roleOf(o)
    if (role === 'skip') return
    const mesh = o as Mesh
    let geo: BufferGeometry
    let material: MeshStandardMaterial | MeshStandardMaterial[]
    const node = new Mesh()
    if ((mesh as InstancedMesh).isInstancedMesh) {
      // blinds' slats and the like: one merged occluder in world space
      const im = mesh as InstancedMesh
      const parts: BufferGeometry[] = []
      const m4 = new Matrix4()
      for (let k = 0; k < im.count; k++) {
        im.getMatrixAt(k, m4)
        const g = slim(im.geometry)
        g.clearGroups()
        g.applyMatrix4(m4.clone().premultiply(im.matrixWorld))
        parts.push(g.index ? g.toNonIndexed() : g)
      }
      if (!parts.length) return
      geo = mergeGeometries(parts)!
      material = expMat(mats(mesh)[0])
    } else {
      geo = slim(mesh.geometry)
      material = Array.isArray(mesh.material) ? mesh.material.map(expMat) : expMat(mesh.material)
      mesh.matrixWorld.decompose(node.position, node.quaternion, node.scale)
    }
    const name = (role === 'bake' ? 'B' : 'O') + String(i++).padStart(4, '0')
    node.name = name
    node.geometry = geo
    node.material = material
    root.add(node)
    entries.push({ name, path: (mesh as InstancedMesh).isInstancedMesh ? '' : pathOf(mesh), role })
  })

  // the lights, in room millimetres
  const lamp = { pos: [0, 0, 0], dir: [0, -1, 0] }
  const fairy: number[][] = []
  const v = new Vector3()
  const t = new Vector3()
  scene.traverse((o) => {
    if (o.userData.bakeLampLight) {
      o.getWorldPosition(v)
      ;(o as unknown as { target: Object3D }).target.getWorldPosition(t)
      lamp.pos = v.toArray()
      lamp.dir = t.sub(v).normalize().toArray()
    }
    if (o.userData.bakeFairy) {
      const im = o as InstancedMesh
      const m4 = new Matrix4()
      for (let k = 0; k < im.count; k++) {
        im.getMatrixAt(k, m4)
        fairy.push(v.setFromMatrixPosition(m4.premultiply(im.matrixWorld)).toArray())
      }
    }
  })
  const W = ROOM.window
  const info = {
    entries,
    lights: { lamp, fairy },
    room: { w: ROOM.w, d: ROOM.d, h: ROOM.h, wall: ROOM.wall },
    window: { x0: W.x0, x1: W.x1, sill: W.sill, head: W.head, z: -ROOM.d / 2 - ROOM.wall },
  }

  const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer
  const post = (name: string, body: BodyInit) => fetch('/__bake/' + name, { method: 'POST', body }).then((r) => r.text())
  const a = await post('room.glb', glb)
  const b = await post('room.json', JSON.stringify(info, null, 1))
  root.traverse((o) => (o as Mesh).geometry?.dispose())
  return { meshes: entries.length, baked: entries.filter((e) => e.role === 'bake').length, glb: a, json: b }
}

