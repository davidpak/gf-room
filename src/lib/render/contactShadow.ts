import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Sphere, Vector3 } from 'three'
import { GROUP, groups, type PhysLib, type PhysWorld } from '../physics/rope'

/**
 * A cable's contact shadow: the soft shade a thin thing lying on a surface makes right under it
 * (what a 4 mm cable's shadow really looks like: the lights' shadow maps are far too coarse to draw
 * it, and their biases eat it). Computed from the cable itself every time it moves, so it can never
 * come apart from it: along the cable, the physics' own ray finds the surface straight below; a
 * ribbon lies on that surface under the cable, darkest where the cable touches, soft at its edges,
 * widening and fading as the cable lifts away (gone by `reach` mm up).
 *
 * Draw it with the cable (add `mesh` to the scene); call update(points, radius) with the same
 * centre line the cable is drawn from.
 */
const SOLID = groups(0xffff, 0xffff & ~GROUP.rope & ~GROUP.plug & ~GROUP.device) // what it falls on (not cables, plugs, the charger)
const SUB = 3 // samples per span of the centre line (smoothed like the cable)
const ACROSS = 5 // across the ribbon: faded edge, full shade from just past the cable's sides in, faded edge

export class ContactShadow {
  mesh: Mesh
  private pos: Float32Array
  private alpha: Float32Array
  private n: number
  private c: Vector3[]
  private last: Float32Array | null = null
  private from = 0
  constructor(
    private world: PhysWorld,
    private rapier: PhysLib,
    points: number,
    private o: { color?: string; strength?: number; reach?: number } = {},
  ) {
    this.n = (points - 1) * SUB + 1
    this.c = Array.from({ length: this.n }, () => new Vector3())
    const g = new BufferGeometry()
    this.pos = new Float32Array(this.n * ACROSS * 3)
    this.alpha = new Float32Array(this.n * ACROSS)
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('shade', new BufferAttribute(this.alpha, 1))
    const idx: number[] = []
    for (let j = 0; j < this.n - 1; j++)
      for (let k = 0; k < ACROSS - 1; k++) {
        const a = j * ACROSS + k
        const b = a + ACROSS
        idx.push(a, b, a + 1, a + 1, b, b + 1)
      }
    g.setIndex(idx)
    g.boundingSphere = new Sphere(new Vector3(), 1e6)
    const m = new MeshBasicMaterial({ color: new Color(o.color ?? '#2a1d3d'), transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float shade;\nvarying float vShade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = shade;')
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vShade;')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vShade;')
    }
    m.customProgramCacheKey = () => 'contact-shadow'
    this.mesh = new Mesh(g, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
  }

  /** the cable's centre line (the points it's drawn through) and its radius; points before `from` are
   *  hidden (reeled inside a plug) and cast nothing */
  update(p: Vector3[], r: number, from = 0) {
    // unchanged (a cable at rest): nothing to do
    if (!this.last || this.last.length !== p.length * 3) this.last = new Float32Array(p.length * 3).fill(NaN)
    let moved = from !== this.from
    this.from = from
    for (let i = 0; i < p.length && !moved; i++)
      if (!(Math.abs(this.last[i * 3] - p[i].x) <= 0.05 && Math.abs(this.last[i * 3 + 1] - p[i].y) <= 0.05 && Math.abs(this.last[i * 3 + 2] - p[i].z) <= 0.05)) moved = true
    if (!moved) return
    for (let i = 0; i < p.length; i++) {
      this.last[i * 3] = p[i].x
      this.last[i * 3 + 1] = p[i].y
      this.last[i * 3 + 2] = p[i].z
    }
    // smooth the line as the cable is (Catmull-Rom)
    const { c } = this
    const n = p.length
    let k = 0
    for (let i = 0; i < n - 1; i++) {
      const p0 = p[Math.max(i - 1, 0)]
      const p1 = p[i]
      const p2 = p[i + 1]
      const p3 = p[Math.min(i + 2, n - 1)]
      for (let s = 0; s < SUB; s++) {
        const t = s / SUB
        const t2 = t * t
        const t3 = t2 * t
        const f0 = -0.5 * t3 + t2 - 0.5 * t
        const f1 = 1.5 * t3 - 2.5 * t2 + 1
        const f2 = -1.5 * t3 + 2 * t2 + 0.5 * t
        const f3 = 0.5 * t3 - 0.5 * t2
        c[k++].set(p0.x * f0 + p1.x * f1 + p2.x * f2 + p3.x * f3, p0.y * f0 + p1.y * f1 + p2.y * f2 + p3.y * f3, p0.z * f0 + p1.z * f1 + p2.z * f2 + p3.z * f3)
      }
    }
    c[k].copy(p[n - 1])
    const reach = this.o.reach ?? 18
    const strength = this.o.strength ?? 0.62
    const down = { x: 0, y: -1, z: 0 }
    const hit = new Vector3()
    const nrm = new Vector3()
    const tan = new Vector3()
    const side = new Vector3()
    for (let j = 0; j < this.n; j++) {
      const q = c[j]
      const h = this.world.castRayAndGetNormal(new this.rapier.Ray({ x: q.x, y: q.y, z: q.z }, down), reach + r + 40, true, undefined, SOLID)
      let shade = 0
      let w = r * 2.4
      if (h) {
        const gap = h.timeOfImpact - r // how far the cable's underside is above the surface
        hit.set(q.x, q.y - h.timeOfImpact, q.z)
        nrm.set(h.normal.x, h.normal.y, h.normal.z)
        shade = gap < reach ? strength * (1 - gap / reach) ** 2 : 0
        w = r * 2.4 + Math.max(0, gap) * 0.6 // softer and wider as it lifts
      } else {
        hit.copy(q)
        nrm.set(0, 1, 0)
      }
      if (j < from * SUB) shade = 0 // (reeled inside the plug)
      // across the cable, on the surface
      tan.copy(c[Math.min(j + 1, this.n - 1)]).sub(c[Math.max(j - 1, 0)])
      side.crossVectors(tan, nrm).normalize()
      if (!Number.isFinite(side.x) || side.lengthSq() < 0.5) side.set(1, 0, 0)
      hit.addScaledVector(nrm, 0.25) // just off the surface
      const inner = r * 1.15 // full shade to just past the cable's sides (so some shows), then soft to w
      for (let a = 0; a < ACROSS; a++) {
        const v = (j * ACROSS + a) * 3
        const o = [-w, -inner, 0, inner, w][a]
        this.pos[v] = hit.x + side.x * o
        this.pos[v + 1] = hit.y + side.y * o
        this.pos[v + 2] = hit.z + side.z * o
        this.alpha[j * ACROSS + a] = a === 0 || a === ACROSS - 1 ? 0 : shade
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.attributes.shade.needsUpdate = true
  }
}
