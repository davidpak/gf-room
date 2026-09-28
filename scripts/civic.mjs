/**
 * David's Civic, from the real thing's 3D model to the site: `npm run civic`.
 *
 *   in    photos/../public/reference/2016-honda-civic.zip's model.dae, unpacked (the path as an argument):
 *         "2016 Honda Civic" by Icons of Denmark (SketchUp, from Sketchfab); COLLADA, in inches, Z up
 *   out   public/models/civic.glb (git-ignored with the download: its licence to check before it ships)
 *
 * What it does:
 *   - every piece baked into the car's frame, in real mm: +z forward, +y up, the tyres on the ground at
 *     0, x across (the driver's side +x); scaled up the model's 3.5% to Honda's 4630 mm length
 *   - the sunroof glass painted over (the model is an EX; the LX's roof is solid)
 *   - the tyres left out (thousands of little tread blocks: the site draws its own); the rims kept
 *   - the pieces sorted into parts by where they sit (see ./civic-inspect.mjs): the body; the four doors
 *     (panel, window, card, handle, trim, and the front ones' mirrors); the trunk lid (its deck, lip and
 *     rear panel, the H and CIVIC badges, the tail lights' upper bars); the four wheels' rims
 *   - each part merged by material, its node placed at its hinge (a door's front edge, the lid's front
 *     edge) or its wheel's centre, so the site only turns the node
 */
import fs from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { Box3, BufferAttribute, BufferGeometry, Group, Matrix3, Mesh, MeshStandardMaterial, Scene, Texture, TextureLoader, Vector3 } from 'three'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

globalThis.DOMParser = DOMParser
TextureLoader.prototype.load = () => new Texture() // (its one texture, the tail-light reflector: not needed)
// (the exporter reads its buffers through FileReader: Node has Blob, not FileReader)
globalThis.FileReader = class {
  readAsArrayBuffer(b) {
    b.arrayBuffer().then((r) => ((this.result = r), this.onloadend?.()))
  }
  readAsDataURL(b) {
    b.arrayBuffer().then((r) => ((this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64')), this.onloadend?.()))
  }
}

const src = process.argv[2]
if (!src) throw new Error('usage: node scripts/civic.mjs <model.dae>')
const { scene } = new ColladaLoader().parse(fs.readFileSync(src, 'utf8'), '')
scene.updateMatrixWorld(true)

// ---- the frame: the model's middle, its scale to the real car
const whole = new Box3()
scene.traverse((o) => o instanceof Mesh && whole.union(new Box3().setFromObject(o)))
const CX = (whole.min.x + whole.max.x) / 2
const CZ = (whole.min.z + whole.max.z) / 2
const S = (4630 / (whole.max.z - whole.min.z)) // (m → real mm: its length to Honda's 4630)
const toCar = (v) => v.set((v.x - CX) * S, v.y * S, (v.z - CZ) * S)
const mid = CX // (for the sides, in the model's metres)
const OUT = 1.84 // (a side's outer skin starts this far across, the right side; the left mirrored)
const LAMPS = /Metal_Vermelho|Metal_Lanterna|Vidro_Ré|Vidros_Vermelhos|Refletor_Lanterna|Vidro_Laranja/

/** which part a piece belongs to, by where its box sits (model metres) */
function partOf(b, mat) {
  const right = b.min.x > OUT
  const left = b.max.x < 2 * mid - OUT
  if ((right || left) && b.min.y > 0.24) {
    const s = right ? 'r' : 'l' // (model +x is the car's… see below: flipped to car x after)
    if (b.min.z > -2.72 && b.max.z < -1.48) return `door_f${s}`
    if (b.min.z > -3.64 && b.max.z < -2.63 && b.min.y > 0.26) return `door_r${s}`
  }
  if (b.min.x > 0.6 && b.max.x < 1.925 && b.min.y > 0.735 && b.max.z < -4.25 && b.min.z > -4.7 && !(LAMPS.test(mat) && b.min.y < 0.93)) return 'trunk'
  if (/Carro_Roda/.test(mat)) {
    const c = b.getCenter(new Vector3())
    return `wheel_${c.z > CZ ? 'f' : 'r'}${c.x > mid ? 'r' : 'l'}`
  }
  return 'body'
}

// ---- gather the triangles: part → material → positions, normals (car frame)
const parts = {}
const _v = new Vector3()
scene.traverse((o) => {
  if (!(o instanceof Mesh)) return
  const mats = Array.isArray(o.material) ? o.material : [o.material]
  if (mats.some((m) => m.name === 'Carro_Pneu')) return
  const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const groups = g.groups.length ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }]
  const box = new Box3().setFromObject(o)
  const nm = new Matrix3().getNormalMatrix(o.matrixWorld)
  for (const gr of groups) {
    let mat = mats[gr.materialIndex ?? 0]?.name ?? 'Carro_Plastico'
    if (mat === 'Carro_Vidros' && box.min.y > 1.3) mat = 'Carro_Pintura' // (the model's sunroof: David's LX has a solid roof)
    if (mat === 'Carro_Pneu') continue
    const part = partOf(box, mat)
    const bucket = ((parts[part] ??= {})[mat] ??= { p: [], n: [] })
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      toCar(_v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld))
      bucket.p.push(_v.x, _v.y, _v.z)
      if (nor) _v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize()
      else _v.set(0, 0, 0)
      bucket.n.push(_v.x, _v.y, _v.z)
    }
  }
})

// ---- build the parts: merged per material, each at its pivot
const root = new Scene()
root.name = 'civic'
const materials = {}
const matOf = (name) => (materials[name] ??= Object.assign(new MeshStandardMaterial(), { name }))
let tris = 0
for (const [part, byMat] of Object.entries(parts)) {
  // the part's box, for its pivot
  const pb = new Box3()
  for (const { p } of Object.values(byMat)) for (let i = 0; i < p.length; i += 3) pb.expandByPoint(_v.set(p[i], p[i + 1], p[i + 2]))
  const pivot = new Vector3()
  if (part.startsWith('door_')) pivot.set(pb.getCenter(_v).x > 0 ? pb.max.x : pb.min.x, (pb.min.y + pb.max.y) / 2, pb.max.z - 20) // (its front edge, outside)
  else if (part === 'trunk') pivot.set(0, pb.max.y, pb.max.z) // (its front edge, on top)
  else if (part.startsWith('wheel_')) pb.getCenter(pivot)
  const node = new Group()
  node.name = part
  node.position.copy(pivot)
  for (const [mat, { p, n }] of Object.entries(byMat)) {
    const g = new BufferGeometry()
    const arr = new Float32Array(p)
    for (let i = 0; i < arr.length; i += 3) (arr[i] -= pivot.x), (arr[i + 1] -= pivot.y), (arr[i + 2] -= pivot.z)
    g.setAttribute('position', new BufferAttribute(arr, 3))
    // its own normals (the panels' sharp edges stay sharp); flat ones worked out where it has none
    if (n.some((x) => x !== 0)) g.setAttribute('normal', new BufferAttribute(new Float32Array(n), 3))
    else g.computeVertexNormals()
    const m = mergeVertices(g, 0.05)
    tris += m.index.count / 3
    const mesh = new Mesh(m, matOf(mat))
    mesh.name = `${part}:${mat}`
    node.add(mesh)
  }
  root.add(node)
  console.log(part.padEnd(10), Object.keys(byMat).length, 'materials', 'box', pb.min.toArray().map(Math.round).join(','), '→', pb.max.toArray().map(Math.round).join(','))
}
console.log('triangles', tris)

const glb = await new GLTFExporter().parseAsync(root, { binary: true })
fs.mkdirSync('public/models', { recursive: true })
fs.writeFileSync('public/models/civic.glb', Buffer.from(glb))
console.log('wrote public/models/civic.glb', (glb.byteLength / 1e6).toFixed(1), 'MB')
