import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, ConvexHullCollider, useBeforePhysicsStep } from '@react-three/rapier'
import { CapsuleGeometry, CylinderGeometry, ExtrudeGeometry, Matrix4, MeshStandardMaterial, Quaternion, Shape, SphereGeometry, Vector3, type BufferGeometry, type Group } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { thump } from '../../lib/sound/thump'
import { Prompts } from '../prompt/Prompts'
import { EAR, EAR_AT, HEAD, MUZZLE, MUZZLE_AT, WUMPUS, eyeAt, leafFrame, nostrilAt, radial, shapePoints, type Blob } from './spec'

/**
 * Rina's Wumpus stress ball (./spec): Wumpus's head in soft periwinkle foam, a pale muzzle, round
 * black eyes, purple nostrils, flat ears with pale faces, a green sprout on top.
 *
 *   carry / turn  the shared hand, like everything else (left-drag, right-drag, wheel, keys)
 *   squishy       the hand squeezes it as it picks it up (and holds it a little squashed); it squashes
 *                 on landing, by how hard, and wobbles back (drawn only: its collider stays whole)
 *   its perch     it lives tucked in the lamp's arm, sat on a claw clip, back to the pole (`perchAt`, the perch in the
 *                 world). There it's held fast, riding along as the desk goes up and down. Let go of
 *                 it near there and it hops back in
 *   Return Wumpus anywhere else, once it's at rest, a fix-it prompt flies it home round what's in the
 *                 way and settles it back in, backing into its spot
 */
const C = WUMPUS.color
const _q = new Quaternion()
const _up = new Vector3()
const Z = new Vector3(0, 0, 1)

/** a soft box from a sphere, each point pushed out to the superellipsoid's surface */
function blobGeometry(s: Blob, w = 56, h = 40): BufferGeometry {
  const g = new SphereGeometry(1, w, h)
  const pos = g.attributes.position
  const d = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    radial(s, d.fromBufferAttribute(pos, i), d)
    pos.setXYZ(i, d.x, d.y, d.z)
  }
  g.computeVertexNormals()
  return g
}

/** one leaf: an almond, soft-edged, lying flat, pointing +X from its base */
function leafGeometry() {
  const L = WUMPUS.leaf
  const b = 0.9 // the soft edge
  const s = new Shape()
  s.moveTo(0, 0)
  s.quadraticCurveTo(L.len * 0.42, L.w * 0.95, L.len - b, 0)
  s.quadraticCurveTo(L.len * 0.42, -L.w * 0.95, 0, 0)
  const g = new ExtrudeGeometry(s, { depth: L.t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 16 })
  g.translate(0, 0, -(L.t - 2 * b) / 2)
  g.rotateX(-Math.PI / 2) // flat, its width across Z
  return g
}

/** a pose that turns +Z to `normal`, at p */
const facing = (p: Vector3, normal: Vector3) => ({ position: p.toArray() as [number, number, number], quaternion: new Quaternion().setFromUnitVectors(Z, normal).toArray() as [number, number, number, number] })

export function WumpusModel() {
  const mat = useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: C.body, roughness: 1 }),
      muzzle: new MeshStandardMaterial({ color: C.muzzle, roughness: 1 }),
      nostril: new MeshStandardMaterial({ color: C.nostril, roughness: 1 }),
      eye: new MeshStandardMaterial({ color: C.eye, roughness: 0.55 }),
      shine: new MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.4 }),
      ear: new MeshStandardMaterial({ color: C.ear, roughness: 1 }),
      leaf: new MeshStandardMaterial({ color: C.leaf, roughness: 0.9 }),
      stem: new MeshStandardMaterial({ color: C.stem, roughness: 1 }),
    }),
    [],
  )
  const geo = useMemo(() => {
    const E = WUMPUS.eye
    const N = WUMPUS.nostril
    const eye = new SphereGeometry(E.d / 2, 24, 16)
    eye.scale(1, 1, E.flat)
    const nostril = new CapsuleGeometry(N.h / 2, N.w - N.h, 6, 12)
    nostril.rotateZ(Math.PI / 2)
    nostril.scale(1, 1, 0.35)
    return {
      head: blobGeometry(HEAD),
      muzzle: blobGeometry(MUZZLE, 44, 32),
      ear: blobGeometry(EAR, 32, 24),
      pad: blobGeometry({ a: 0.9, b: EAR.b * 0.66, c: EAR.c * 0.6, n: 2.4, nBottom: 2.4 }, 24, 16), // the ear's pale face
      eye,
      shine: new SphereGeometry(0.62, 10, 8),
      nostril,
      leaf: leafGeometry(),
      stem: new CylinderGeometry(WUMPUS.leaf.stem.r, WUMPUS.leaf.stem.r * 1.2, WUMPUS.leaf.stem.h, 12),
    }
  }, [])
  const place = useMemo(() => {
    const e = eyeAt()
    const n = nostrilAt()
    const mirror = (p: { position: [number, number, number]; quaternion: [number, number, number, number] }) => ({
      position: [-p.position[0], p.position[1], p.position[2]] as [number, number, number],
      quaternion: [p.quaternion[0], -p.quaternion[1], -p.quaternion[2], p.quaternion[3]] as [number, number, number, number],
    })
    const eye = facing(e.p.clone().addScaledVector(e.normal, -0.5), e.normal) // set in a touch
    const nostril = facing(n.p.clone().addScaledVector(n.normal, 0.05), n.normal)
    const { top, out } = leafFrame()
    const L = WUMPUS.leaf
    const leaf = (s: 1 | -1) => {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), s * L.rise) // tipped up
      if (s < 0) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)) // (pointing -X)
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.18)) // a little twist, like a real sprout
      return { position: top.clone().addScaledVector(out(s), -0.6).toArray() as [number, number, number], quaternion: q.toArray() as [number, number, number, number] }
    }
    return { eye, eyeL: mirror(eye), nostril, nostrilL: mirror(nostril), leafR: leaf(1), leafL: leaf(-1), stem: top.clone().setY(top.y - L.stem.h / 2) }
  }, [])
  return (
    <group>
      <mesh geometry={geo.head} material={mat.body} castShadow receiveShadow />
      <mesh geometry={geo.muzzle} material={mat.muzzle} position={MUZZLE_AT} castShadow receiveShadow />
      {[place.eye, place.eyeL].map((p, i) => (
        <group key={i} {...p}>
          <mesh geometry={geo.eye} material={mat.eye} />
          <mesh geometry={geo.shine} material={mat.shine} position={[i ? 0.9 : -0.9, 0.9, WUMPUS.eye.d * WUMPUS.eye.flat * 0.42]} scale={[1, 1, 0.4]} />
        </group>
      ))}
      {[place.nostril, place.nostrilL].map((p, i) => (
        <mesh key={i} geometry={geo.nostril} material={mat.nostril} {...p} />
      ))}
      {[1, -1].map((s) => (
        <group key={s} position={[s * EAR_AT.x, EAR_AT.y, EAR_AT.z]}>
          <mesh geometry={geo.ear} material={mat.body} castShadow receiveShadow />
          <mesh geometry={geo.pad} material={mat.ear} position={[s * (EAR.a - 0.55), 0, 0]} />
        </group>
      ))}
      <mesh geometry={geo.stem} material={mat.stem} position={place.stem} castShadow />
      <mesh geometry={geo.leaf} material={mat.leaf} {...place.leafR} castShadow />
      <mesh geometry={geo.leaf} material={mat.leaf} {...place.leafL} castShadow />
    </group>
  )
}

const ITEM = groups(GROUP.item, 0xffff)
const SQUASH = { k: 260, c: 11, held: 0.05, grab: 1.7, land: 3.2 } // the squish's spring (1/s², 1/s) and kicks

export function LiveWumpus({ perchAt, spawn }: { perchAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const squish = useRef<Group>(null)
  const spring = useRef({ s: 0, v: 0 })
  const speed = useRef(0) // how fast it went last step: a hit is a sudden loss of it (a reported hit comes after the contact has slowed it)
  const hull = useMemo(() => new Float32Array(shapePoints(10).flatMap((p) => [p.x, p.y, p.z])), [])
  const sprout = useMemo(() => leafFrame().top.toArray() as [number, number, number], [])
  // home on the claw clip, backing in along the way it faces
  const perch = usePerch({
    key: 'wumpus',
    label: 'Return Wumpus',
    perchAt,
    approach: new Vector3(0, 0, 1),
    onLand: () => {
      thump(0.18, 'soft')
      spring.current.v += SQUASH.land * 0.3 // a little settle
    },
  })
  const { body, st } = perch

  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b) return
    const v = b.linvel()
    const sp = Math.hypot(v.x, v.y, v.z)
    if (b.isDynamic() && !st.current.held && speed.current - sp > 120) spring.current.v += SQUASH.land * Math.min(1, (speed.current - sp) / 1000) // landed: squash by how hard
    speed.current = sp
  })

  // the squish: a springy squash along the way up, pinned at its bottom (drawn only)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const sp = spring.current
    const target = st.current.held ? SQUASH.held : 0
    sp.v += (-SQUASH.k * (sp.s - target) - SQUASH.c * sp.v) * dt
    sp.s = Math.min(0.3, Math.max(-0.16, sp.s + sp.v * dt))
    const g = squish.current
    if (!g?.parent) return
    if (Math.abs(sp.s) < 1e-4 && Math.abs(sp.v) < 1e-3) {
      sp.s = 0
      sp.v = 0
      if (!g.matrix.equals(IDENTITY)) {
        g.matrix.identity()
        g.matrixWorldNeedsUpdate = true
      }
      return
    }
    g.parent.getWorldQuaternion(_q)
    _up.set(0, 1, 0).applyQuaternion(_q.invert())
    const along = 1 - sp.s
    const perp = 1 / Math.sqrt(along) // (keeps its volume: it bulges as it squashes)
    const d = along - perp
    const { x, y, z } = _up
    const t = -HEAD.b * sp.s // the bottom stays put
    g.matrix.set(
      perp + d * x * x, d * x * y, d * x * z, t * x,
      d * y * x, perp + d * y * y, d * y * z, t * y,
      d * z * x, d * z * y, perp + d * z * z, t * z,
      0, 0, 0, 1,
    )
    g.matrixWorldNeedsUpdate = true
  })

  if (import.meta.env.DEV) Object.assign(window, { __wumpus: { ...perch, spring } }) // for inspecting from the console

  return (
    <>
      <Holdable
        bodyRef={body}
        position={spawn}
        colliders={false}
        sound="soft"
        restitution={0.15}
        linearDamping={0.8}
        angularDamping={1.5}
        hold={{
          lift: 30,
          onGrab: (b) => {
            perch.hold.onGrab(b)
            spring.current.v += SQUASH.grab // squeezed as it's picked up
          },
          onRelease: perch.hold.onRelease,
        }}
      >
        <group ref={squish} matrixAutoUpdate={false} {...perch.hover.bind}>
          <WumpusModel />
        </group>
        <ConvexHullCollider args={[hull]} mass={WUMPUS.mass * 0.95} friction={0.9} collisionGroups={ITEM} />
        <BallCollider args={[4]} position={sprout} mass={WUMPUS.mass * 0.05} friction={0.9} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
const IDENTITY = new Matrix4()
