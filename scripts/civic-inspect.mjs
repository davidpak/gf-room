/**
 * Looks inside the Civic model (COLLADA, from Sketchfab: see scripts/civic.mjs): its parts, where
 * each sits, what it's made of. For working out which pieces are the doors, the trunk, the wheels.
 *   node scripts/civic-inspect.mjs <model.dae>
 */
import fs from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { Box3, Mesh, Texture, TextureLoader } from 'three'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'

globalThis.DOMParser = DOMParser
TextureLoader.prototype.load = () => new Texture() // (its one texture, the tail-light reflector: not needed)
const text = fs.readFileSync(process.argv[2], 'utf8')
const { scene } = new ColladaLoader().parse(text, '')
scene.updateMatrixWorld(true)
const all = new Box3().setFromObject(scene)
console.log('whole', all.min.toArray().map(Math.round), all.max.toArray().map(Math.round))
// every mesh: its material, triangle count, box
const rows = []
scene.traverse((o) => {
  if (!(o instanceof Mesh)) return
  const b = new Box3().setFromObject(o)
  const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => m.name).join('+')
  const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
  let p = o.parent
  const path = []
  while (p && path.length < 4) {
    path.unshift(p.name)
    p = p.parent
  }
  rows.push({ path: path.join('/'), mats, tris, min: b.min.toArray(), max: b.max.toArray() })
})
console.log(rows.length, 'meshes')
const byMat = {}
for (const r of rows) byMat[r.mats] = (byMat[r.mats] ?? 0) + r.tris
console.log(byMat)
const mm = (v) => v.map((x) => Math.round(x * 1000))
for (const r of rows.filter((r) => r.tris > 150 && /Pintura|Vidro|Cromado|Interno|Roda|Placa/.test(r.mats))) console.log(r.mats.padEnd(24), String(r.tris).padStart(6), mm(r.min).join(','), ' → ', mm(r.max).join(','), ' ', r.path.split('/').slice(-2).join('/'))

console.log('--- in the right-hand door zone')
for (const r of rows) { const [x0,y0,z0]=mm(r.min), [x1,y1,z1]=mm(r.max); if (x0 > 1750 && z0 > -3750 && z1 < -1450 && y1 > 300) console.log(r.mats.padEnd(24), String(r.tris).padStart(6), mm(r.min).join(','), ' → ', mm(r.max).join(','), ' ', r.path.split('/').slice(-2).join('/')) }
console.log('--- plate, trunk zone')
for (const r of rows) { const [x0,y0,z0]=mm(r.min), [x1,y1,z1]=mm(r.max); if ((/Placa/.test(r.mats)) || (z1 < -4150 && y0 > 600 && x0 > 600 && x1 < 1900)) console.log(r.mats.padEnd(24), String(r.tris).padStart(6), mm(r.min).join(','), ' → ', mm(r.max).join(','), ' ', r.path.split('/').slice(-2).join('/')) }
