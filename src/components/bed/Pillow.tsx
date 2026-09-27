import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, type Group } from 'three'
import { createFabricMaterial, useDivots, WEAVE_MM, type DivotConfig } from '../../lib/fabric'
import { stepSpring, type Spring } from '../../lib/spring'
import { Grabbable } from '../../lib/physics/Grabbable'
import { ConvexHullCollider } from '@react-three/rapier'

/**
 * A standard white pillow (20 × 26 in), well stuffed, in a slightly loose white cotton case.
 * It's a real physics object: grab it, carry it, drop it (see lib/physics/Grabbable).
 *
 * Shape is a formula, no simulation:
 *   plan     rounded rectangle whose sides bow in, like a stuffed pillow
 *   top      plush and a little lumpy
 *   bottom   flattened where it rests, so it sits ON things instead of balancing on a point
 *   case     loose: broad lumps, wrinkles radiating from the corners, a wavy seam, and floppy
 *            corner "ears" that droop a little
 *
 *   hover   puffs up very slightly
 *   grab    a soft dent with creases where you pinched it
 *   land    squashes and springs back, harder landings squash more (with a soft thump)
 *
 * Local frame: X = the long side (26 in), Z = the short side, Y up. Origin = the flat underside.
 */
const IN = 25.4
export const PILLOW = { len: 26 * IN, w: 20 * IN, top: 125, bottom: 55, segU: 60, segV: 48 }
const DIVOT: DivotConfig = { count: 6, radius: 58, depth: 18, crease: 4.5, sinkIn: 0.45, hold: 1.2, relax: 6 }

function plan(u: number, v: number) {
  const x = u * (PILLOW.len / 2) * (1 - 0.06 * (1 - v * v))
  const z = v * (PILLOW.w / 2) * (1 - 0.07 * (1 - u * u))
  const f = Math.pow(Math.max((1 - u * u) * (1 - v * v), 0), 0.42)
  return { x, z, f }
}

/** Loose-case detail on the top surface, in mm (multiplied by fullness so the seam stays put). */
function looseCase(u: number, v: number, seed: number) {
  let corners = 0
  for (const [cu, cv] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const d = Math.hypot(u - cu, v - cv)
    const ang = Math.atan2(v - cv, u - cu)
    corners += Math.exp(-d * 2.4) * Math.sin(ang * 8 + seed + cu * 1.3 + cv * 2.1)
  }
  const lumps = Math.sin(u * 2.1 + seed) * Math.sin(v * 1.7 + seed * 2.0)
  const ripples = Math.sin(u * 6.3 + v * 2.2 + seed * 3.0) * Math.cos(v * 4.1 - u * 1.3)
  return 6 * corners + 9 * lumps + 2.5 * ripples
}

function makePillowGeometry(seed: number) {
  const nu = PILLOW.segU + 1
  const nv = PILLOW.segV + 1
  const count = nu * nv
  const pos = new Float32Array(count * 2 * 3)
  const uv = new Float32Array(count * 2 * 2)
  const B = PILLOW.bottom
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const u = -1 + (2 * i) / PILLOW.segU
      const v = -1 + (2 * j) / PILLOW.segV
      const p = plan(u, v)
      // floppy ears + a slightly wavy seam, shared by top and bottom so the seam stays closed
      const ear = -12 * Math.pow(Math.abs(u * v), 3)
      const seam = 3 * Math.sin(u * 9 + v * 7 + seed) * (1 - p.f)
      const top = PILLOW.top * p.f + looseCase(u, v, seed) * p.f + ear + seam
      const bot = -B * Math.pow(Math.min(1, p.f * 2.4), 0.8) + ear + seam // flat where it rests
      const n = j * nu + i
      pos.set([p.x, top + B, p.z], n * 3)
      pos.set([p.x, bot + B, p.z], (count + n) * 3)
      uv.set([p.x / WEAVE_MM, p.z / WEAVE_MM], n * 2)
      uv.set([p.x / WEAVE_MM, p.z / WEAVE_MM], (count + n) * 2)
    }
  const idx: number[] = []
  for (let j = 0; j < PILLOW.segV; j++)
    for (let i = 0; i < PILLOW.segU; i++) {
      const a = j * nu + i
      const b = a + 1
      const c = a + nu
      const d = c + 1
      idx.push(a, c, b, b, c, d)
      idx.push(count + a, count + b, count + c, count + b, count + d, count + c)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * A simple collision shape: ~100 points sampled from the pillow surface. Using every vertex made
 * the contact flicker between tiny faces, which showed as idle shaking.
 */
function hullPoints(g: BufferGeometry) {
  const pos = g.getAttribute('position')
  const nu = PILLOW.segU + 1
  const nv = PILLOW.segV + 1
  const count = nu * nv
  const pts: number[] = []
  for (const base of [0, count])
    for (let j = 0; j < nv; j += 6)
      for (let i = 0; i < nu; i += 6) {
        const k = base + j * nu + i
        pts.push(pos.getX(k), pos.getY(k), pos.getZ(k))
      }
  return new Float32Array(pts)
}

type Props = { seed?: number; position: [number, number, number]; rotation?: [number, number, number] }

export function Pillow({ seed = 0, position, rotation }: Props) {
  const geo = useMemo(() => makePillowGeometry(seed), [seed])
  const { material, uniforms } = useMemo(() => createFabricMaterial({ key: 'pillow', divot: DIVOT, undulation: 0.35, sides: 0.3 }), [])
  const press = useDivots(uniforms, DIVOT)
  const squashGroup = useRef<Group>(null)
  const squash = useRef<Spring>({ x: 1, v: 0 })
  const [hover, setHover] = useState(false)
  const held = useRef(false)
  const hull = useMemo(() => hullPoints(geo), [geo])

  useFrame((_, dt) => {
    if (!squashGroup.current) return
    // sags a little while carried, puffs a touch on hover; calm spring so resting pillows sit still
    const target = held.current ? 0.95 : hover ? 1.015 : 1
    const sy = stepSpring(squash.current, target, dt, 140, 16)
    const bulge = 1 + (1 - sy) * 0.3
    squashGroup.current.scale.set(bulge, sy, bulge)
  })

  return (
    <Grabbable
      position={position}
      rotation={rotation}
      colliders={false}
      density={0.00000003} // per mm³: about a kilo, a light pillow
      linearDamping={1.1} // air drag: drifts
      angularDamping={2.2} // tumbles less
      restitution={0.06}
      spring={{ k: 32, c: 9 }} // soft, laggy carry: swings behind your hand
      sound="soft"
      onImpact={(s) => (squash.current.v -= 1.8 * s)}
      onGrab={(local) => {
        press(local)
        held.current = true
      }}
      onRelease={() => (held.current = false)}
    >
      <ConvexHullCollider args={[hull]} friction={1.1} />
      <group ref={squashGroup} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <mesh geometry={geo} material={material} castShadow receiveShadow />
      </group>
    </Grabbable>
  )
}
