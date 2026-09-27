import type { RapierRigidBody, useRapier } from '@react-three/rapier'
import { BufferAttribute, BufferGeometry, Quaternion, Sphere, Vector3 } from 'three'

/**
 * Cables as real physics (Rapier), for any cord in the world: a chain of short capsule links joined
 * end to end by ball joints, with a soft spring from every link to the one after next so it resists
 * bending the way a woven cable does (and keeps a little memory of the curves it was laid in). The
 * links don't collide with each other (cheap, steady); they do collide with everything else.
 *
 * Whatever is fixed to its ends (plugs) is given with ends(); detach lets them go (to move the cable
 * by hand) and attach fixes them again as they are. (A Rapier multibody chain was tried: in this
 * version it goes unstable with a weight hanging off it, and re-making its joints crashes the engine.)
 *
 * Millimetres. Build it from points laid along the cable's rest shape, then read `points()` each
 * frame and hand them to a Tube to draw one smooth cable over the links.
 */
export type Rope = {
  links: RapierRigidBody[]
  lengths: number[]
  /** the cable's centre line: the joints between the links, plus both ends (links + 1 points);
   *  `alpha` < 1 draws it that far from where it was before the last step (see snapshot) */
  points: (out: Vector3[], alpha?: number) => Vector3[]
  /** remember where the links are, before a physics step (for drawing it blended between steps) */
  snapshot: () => void
  /** fix these to the cable's two ends as they are now (plugs) */
  ends: (a: RapierRigidBody | null, b: RapierRigidBody | null) => void
  /** let go of the ends (the cable can then be moved by hand) */
  detach: () => void
  /** fix the ends again, as they are now */
  attach: () => void
  remove: () => void
}

// the Rapier that @react-three/rapier runs (its own copy)
type Api = ReturnType<typeof useRapier>
export type PhysWorld = Api['world']
export type PhysLib = Api['rapier']
export type Joint = ReturnType<PhysWorld['createImpulseJoint']>
const Y = new Vector3(0, 1, 0)
const _q = new Quaternion()
const _a = new Vector3()

export const GROUP = {
  rope: 0x0002,
  plug: 0x0004,
  device: 0x0008, // something a plug goes into (a charger, a laptop)
}
/** Rapier collision groups: (membership << 16) | filter */
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff)

export function createRope(
  world: PhysWorld,
  rapier: PhysLib,
  pts: Vector3[],
  o: { radius: number; mass: number; bend: number; bendDamping: number; memory: number; linearDamping?: number; angularDamping?: number; friction?: number },
): Rope {
  const links: RapierRigidBody[] = []
  const lengths: number[] = []
  const mids: Vector3[] = []
  const joints: Joint[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const len = a.distanceTo(b)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    _q.setFromUnitVectors(Y, _a.copy(b).sub(a).normalize())
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setLinearDamping(o.linearDamping ?? 0.8)
        .setAngularDamping(o.angularDamping ?? 3)
        .setSoftCcdPrediction(12), // soft CCD: no tunnelling at speed, and not sticky at rest like full CCD
    )
    world.createCollider(
      rapier.ColliderDesc.capsule(Math.max(0.05, len / 2 - o.radius), o.radius)
        .setMass(o.mass)
        .setFriction(o.friction ?? 0.6)
        .setRestitution(0)
        .setCollisionGroups(groups(GROUP.rope, 0xffff & ~GROUP.rope & ~GROUP.plug))
        .setContactSkin(0.6), // contacts start 0.6 mm out: a thin link meets the desk before it's in it
      body,
    )
    links.push(body)
    lengths.push(len)
    mids.push(mid)
  }
  for (let i = 0; i < links.length - 1; i++) {
    const j = world.createImpulseJoint(rapier.JointData.spherical({ x: 0, y: lengths[i] / 2, z: 0 }, { x: 0, y: -lengths[i + 1] / 2, z: 0 }), links[i], links[i + 1], true)
    j.setContactsEnabled(false)
    joints.push(j)
  }
  // the ends: whatever is fixed to them (plugs), fixed as they are when attached
  let endJoints: Joint[] = []
  let endA: RapierRigidBody | null = null
  let endB: RapierRigidBody | null = null
  const bodyPose = (b: RapierRigidBody) => {
    const t = b.translation()
    const r = b.rotation()
    return { p: new Vector3(t.x, t.y, t.z), q: new Quaternion(r.x, r.y, r.z, r.w) }
  }
  /** a fixed joint keeping two bodies as they are now, meeting at world point p */
  const fixedAt = (b1: RapierRigidBody, b2: RapierRigidBody, p: Vector3) => {
    const f = (b: RapierRigidBody) => {
      const o = bodyPose(b)
      const inv = o.q.clone().invert()
      const l = p.clone().sub(o.p).applyQuaternion(inv)
      return { anchor: { x: l.x, y: l.y, z: l.z }, frame: { x: inv.x, y: inv.y, z: inv.z, w: inv.w } }
    }
    const a = f(b1)
    const b = f(b2)
    return rapier.JointData.fixed(a.anchor, a.frame, b.anchor, b.frame)
  }
  const endOf = (i: number, sign: 1 | -1) => {
    const o = bodyPose(links[i])
    return new Vector3(0, (sign * lengths[i]) / 2, 0).applyQuaternion(o.q).add(o.p)
  }
  const detach = () => {
    for (const j of endJoints) if (world.getImpulseJoint(j.handle)) world.removeImpulseJoint(j, true)
    endJoints = []
  }
  const attach = () => {
    detach()
    const add = (b1: RapierRigidBody, b2: RapierRigidBody, p: Vector3) => {
      const j = world.createImpulseJoint(fixedAt(b1, b2, p), b1, b2, true)
      j.setContactsEnabled(false)
      endJoints.push(j)
    }
    if (endA) add(endA, links[0], endOf(0, -1))
    if (endB) add(links[links.length - 1], endB, endOf(links.length - 1, 1))
  }
  // bending stiffness: link i to link i + 2, rest length between the laid-in shape and straight
  for (let i = 0; i < links.length - 2; i++) {
    const laid = mids[i].distanceTo(mids[i + 2])
    const straight = lengths[i] / 2 + lengths[i + 1] + lengths[i + 2] / 2
    const rest = laid * o.memory + straight * (1 - o.memory)
    const zero = { x: 0, y: 0, z: 0 }
    const j = world.createImpulseJoint(rapier.JointData.spring(rest, o.bend, o.bendDamping, zero, zero), links[i], links[i + 2], true)
    j.setContactsEnabled(false)
    joints.push(j)
  }

  // each link's pose now (or blended from before the last step), and before the last step
  const P = links.map(() => new Vector3())
  const Q = links.map(() => new Quaternion())
  const prevP = links.map(() => new Vector3())
  const prevQ = links.map(() => new Quaternion())
  let snapped = false
  const pose = (i: number, alpha: number) => {
    const t = links[i].translation()
    const r = links[i].rotation()
    P[i].set(t.x, t.y, t.z)
    Q[i].set(r.x, r.y, r.z, r.w)
    if (snapped && alpha < 1) {
      const a = Math.max(0, alpha)
      P[i].lerpVectors(prevP[i], P[i], a)
      _q.copy(Q[i])
      Q[i].copy(prevQ[i]).slerp(_q, a)
    }
  }
  const end = (i: number, half: number, out: Vector3) => out.set(0, half, 0).applyQuaternion(Q[i]).add(P[i])
  const tmp = new Vector3()
  return {
    links,
    lengths,
    points(out, alpha = 1) {
      const n = links.length
      while (out.length < n + 1) out.push(new Vector3())
      for (let i = 0; i < n; i++) pose(i, alpha)
      end(0, -lengths[0] / 2, out[0])
      for (let i = 1; i < n; i++) {
        end(i - 1, lengths[i - 1] / 2, out[i])
        out[i].add(end(i, -lengths[i] / 2, tmp)).multiplyScalar(0.5)
      }
      end(n - 1, lengths[n - 1] / 2, out[n])
      return out
    },
    snapshot() {
      for (let i = 0; i < links.length; i++) {
        const t = links[i].translation()
        const r = links[i].rotation()
        prevP[i].set(t.x, t.y, t.z)
        prevQ[i].set(r.x, r.y, r.z, r.w)
      }
      snapped = true
    },
    ends(a, b) {
      endA = a
      endB = b
      attach()
    },
    detach,
    attach,
    remove() {
      detach()
      for (const j of joints) if (world.getImpulseJoint(j.handle)) world.removeImpulseJoint(j, false)
      for (const b of links) if (world.getRigidBody(b.handle)) world.removeRigidBody(b)
    },
  }
}

/**
 * A tube drawn along a moving centre line: smoothed with Catmull-Rom (`sub` samples per span),
 * framed by parallel transport so it never twists, rebuilt in place each frame (no allocation).
 * uv.x runs along the cable (0..1), uv.y round it.
 */
export class Tube {
  geometry = new BufferGeometry()
  private rings: number
  private radial: number
  private c: Vector3[]
  private sub: number
  length = 0

  constructor(points: number, sub = 3, radial = 10) {
    this.sub = sub
    this.radial = radial
    this.rings = (points - 1) * sub + 1
    this.c = Array.from({ length: this.rings }, () => new Vector3())
    const verts = this.rings * (radial + 1)
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(verts * 3), 3))
    this.geometry.setAttribute('normal', new BufferAttribute(new Float32Array(verts * 3), 3))
    const uv = new Float32Array(verts * 2)
    const idx: number[] = []
    for (let j = 0; j < this.rings; j++)
      for (let k = 0; k <= radial; k++) {
        uv[(j * (radial + 1) + k) * 2] = j / (this.rings - 1)
        uv[(j * (radial + 1) + k) * 2 + 1] = k / radial
        if (j < this.rings - 1 && k < radial) {
          const a = j * (radial + 1) + k
          const b = a + radial + 1
          idx.push(a, a + 1, b, b, a + 1, b + 1)
        }
      }
    this.geometry.setAttribute('uv', new BufferAttribute(uv, 2))
    this.geometry.setIndex(idx)
    this.geometry.boundingSphere = new Sphere(new Vector3(), 1e6) // it moves: never cull, always pickable
  }

  /** draw only from point `i` on (the rest is hidden: a cable reeled into its plug); 0 draws it all */
  visibleFrom(i: number) {
    this.geometry.setDrawRange(Math.max(0, i) * this.sub * this.radial * 6, Infinity)
  }

  update(p: Vector3[], r: number) {
    const { c, sub, radial } = this
    const n = p.length
    let k = 0
    for (let i = 0; i < n - 1; i++) {
      const p0 = p[Math.max(i - 1, 0)]
      const p1 = p[i]
      const p2 = p[i + 1]
      const p3 = p[Math.min(i + 2, n - 1)]
      for (let s = 0; s < sub; s++) {
        const t = s / sub
        const t2 = t * t
        const t3 = t2 * t
        const f0 = -0.5 * t3 + t2 - 0.5 * t
        const f1 = 1.5 * t3 - 2.5 * t2 + 1
        const f2 = -1.5 * t3 + 2 * t2 + 0.5 * t
        const f3 = 0.5 * t3 - 0.5 * t2
        c[k++].set(
          p0.x * f0 + p1.x * f1 + p2.x * f2 + p3.x * f3,
          p0.y * f0 + p1.y * f1 + p2.y * f2 + p3.y * f3,
          p0.z * f0 + p1.z * f1 + p2.z * f2 + p3.z * f3,
        )
      }
    }
    c[k].copy(p[n - 1])
    const pos = this.geometry.attributes.position.array as Float32Array
    const nor = this.geometry.attributes.normal.array as Float32Array
    const T = new Vector3()
    const N = new Vector3()
    const B = new Vector3()
    this.length = 0
    for (let j = 0; j < this.rings; j++) {
      const a = c[Math.max(j - 1, 0)]
      const b = c[Math.min(j + 1, this.rings - 1)]
      T.copy(b).sub(a).normalize()
      if (j > 0) this.length += c[j].distanceTo(c[j - 1])
      if (j === 0) N.set(Math.abs(T.y) < 0.9 ? 0 : 1, Math.abs(T.y) < 0.9 ? 1 : 0, 0)
      N.addScaledVector(T, -T.dot(N)).normalize() // carry the frame along (parallel transport)
      B.crossVectors(T, N)
      for (let q = 0; q <= radial; q++) {
        const ang = (q / radial) * Math.PI * 2
        const cx = Math.cos(ang)
        const sx = Math.sin(ang)
        const nx = N.x * cx + B.x * sx
        const ny = N.y * cx + B.y * sx
        const nz = N.z * cx + B.z * sx
        const v = (j * (radial + 1) + q) * 3
        pos[v] = c[j].x + nx * r
        pos[v + 1] = c[j].y + ny * r
        pos[v + 2] = c[j].z + nz * r
        nor[v] = nx
        nor[v + 1] = ny
        nor[v + 2] = nz
      }
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.normal.needsUpdate = true
  }
}
