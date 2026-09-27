import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import {
  BackSide,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  Euler,
  ExtrudeGeometry,
  FrontSide,
  LatheGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Path,
  Quaternion,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Group,
  type PointLight,
  type SpotLight,
} from 'three'
import { cozy, useCozy } from './cozy'
import { usePower } from '../../lib/power'
import { CapsuleCollider, ConvexHullCollider, CylinderCollider } from '@react-three/rapier'
import { FollowCollider } from '../../lib/physics/FollowCollider'
import { PAL } from '../../lib/palette'
import { LAMP, armPoints, shadeFrame } from '../lamp/spec'

/**
 * Rina's desk lamp, built from its spec (../lamp/spec.ts: every dimension and every detail from the
 * photos, with a geometry check that must pass first). Verified on ?part=lamp&check.
 *
 *   click the lamp or its rocker   on / off: the bulb blooms, the lining glows, the fabric glows,
 *                                  a soft warm spot lights the desk evenly, a warm fill all round
 *
 * The toy look (Bruno Simon's objects, "My Room in 3D"): everything matte, no reflections, a
 * pastel palette (lilac-silver metal, butter-yellow shade, plum plastics), thin parts thickened.
 * Rina's charger is its own item (../charger), plugged into the back outlet.
 *
 * Local frame: origin on the desk at the centre of the base, +Z the way the shade leans. `solid`
 * gives it simple collision boxes that follow it (riding the desk); off when a physics body carries
 * it instead (the lamp's own page).
 */
const B = LAMP.base
const P = LAMP.pole
const S = LAMP.shade
const O = LAMP.outlet
const F = shadeFrame()
const TILT = -S.tilt // rotation about X that points a group's -Y down the shade's axis

/** A smooth turned profile: straight runs with every corner rounded by `r` (mm). */
function filleted(pts: [number, number][], r: number, steps = 5) {
  const out: Vector2[] = [new Vector2(...pts[0])]
  for (let i = 1; i < pts.length - 1; i++) {
    const p = new Vector2(...pts[i])
    const a = new Vector2(...pts[i - 1]).sub(p)
    const b = new Vector2(...pts[i + 1]).sub(p)
    const k = Math.min(r, a.length() / 2, b.length() / 2)
    const p0 = p.clone().add(a.normalize().multiplyScalar(k))
    const p1 = p.clone().add(b.normalize().multiplyScalar(k))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      out.push(p0.clone().multiplyScalar((1 - t) ** 2).add(p.clone().multiplyScalar(2 * (1 - t) * t)).add(p1.clone().multiplyScalar(t * t)))
    }
  }
  out.push(new Vector2(...pts[pts.length - 1]))
  return out
}

/** A slot-shaped hole (rounded ends), centred at (x, y), in a Shape's coordinates. */
function slot(x: number, y: number, w: number, h: number) {
  const p = new Path()
  const r = w / 2
  p.moveTo(x - r, y - h / 2 + r)
  p.lineTo(x - r, y + h / 2 - r)
  p.absarc(x, y + h / 2 - r, r, Math.PI, 0, true)
  p.lineTo(x + r, y - h / 2 + r)
  p.absarc(x, y - h / 2 + r, r, 0, Math.PI, true)
  return p
}

/**
 * One US receptacle face (NEMA 5-15R): flat sides, arched top and bottom, the neutral (taller)
 * slot on the left, the hot on the right, the round-topped ground hole below: holes cut right
 * through. Built in XY with the ground hole toward -Y.
 */
export function receptacleShape() {
  const { w, h, slot: sl, ground: g } = O
  const s = new Shape()
  const sag = h / 2 - 12 // the straight sides' half height; the arches take the rest
  s.moveTo(-w / 2, -sag)
  s.lineTo(-w / 2, sag)
  s.quadraticCurveTo(-w / 2 + 2, h / 2 + 2, 0, h / 2)
  s.quadraticCurveTo(w / 2 - 2, h / 2 + 2, w / 2, sag)
  s.lineTo(w / 2, -sag)
  s.quadraticCurveTo(w / 2 - 2, -h / 2 - 2, 0, -h / 2)
  s.quadraticCurveTo(-w / 2 + 2, -h / 2 - 2, -w / 2, -sag)
  const sy = 4 // the slots' centre line, a little above the middle
  s.holes.push(slot(-sl.apart / 2, sy, sl.w, sl.neutral), slot(sl.apart / 2, sy, sl.w, sl.hot))
  const gy = sy - g.below
  const gh = new Path() // the ground hole: a half circle on a short square bottom
  gh.moveTo(-g.d / 2, gy - g.d * 0.35)
  gh.lineTo(-g.d / 2, gy)
  gh.absarc(0, gy, g.d / 2, Math.PI, 0, true)
  gh.lineTo(g.d / 2, gy - g.d * 0.35)
  gh.lineTo(-g.d / 2, gy - g.d * 0.35)
  s.holes.push(gh)
  return s
}

/**
 * What the lamp is to physics, in its own frame: the base as the drums of its steps (the rim, three
 * ridges, the top tier), the collar, a round pole to the spike, the arm as a chain of capsules and
 * the shade as a solid cone. Cables drape over it the way it looks.
 */
const STEPS: [number, number][] = [[B.r, 6], [B.r - 6, 13], [B.r - 13, 18], [B.r - 20, 23], [B.topR, B.top]] // radius, height
function LampColliders() {
  const { arm, shade } = useMemo(() => {
    const curve = new CatmullRomCurve3(armPoints(), false, 'centripetal')
    const n = 10
    const up = new Vector3(0, 1, 0)
    const arm = Array.from({ length: n }, (_, i) => {
      const a = curve.getPointAt(i / n)
      const b = curve.getPointAt((i + 1) / n)
      const dir = b.clone().sub(a)
      const q = new Quaternion().setFromUnitVectors(up, dir.clone().normalize())
      return { at: a.add(b).multiplyScalar(0.5), half: dir.length() / 2, rot: new Euler().setFromQuaternion(q) }
    })
    // the shade: its two rims, round the shade's axis
    const e1 = new Vector3(1, 0, 0)
    const e2 = new Vector3().crossVectors(F.axis, e1).normalize()
    const pts: number[] = []
    for (const [c, r] of [
      [F.top, S.rTop + 1],
      [F.bottom, S.rBottom + 1],
    ] as const)
      for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2
        const p = c.clone().addScaledVector(e1, Math.cos(t) * r).addScaledVector(e2, Math.sin(t) * r)
        pts.push(p.x, p.y, p.z)
      }
    return { arm, shade: new Float32Array(pts) }
  }, [])
  const spike = P.top + LAMP.finial.h
  return (
    <>
      {STEPS.map(([r, h]) => (
        <CylinderCollider key={r} args={[h / 2, r]} position={[0, h / 2, 0]} friction={0.8} />
      ))}
      <CylinderCollider args={[B.collar.h / 2, B.collar.r - 4]} position={[0, B.top + B.collar.h / 2, 0]} friction={0.8} />
      <CylinderCollider args={[(spike - B.top) / 2, P.r + 1]} position={[0, (spike + B.top) / 2, 0]} friction={0.8} />
      {arm.map((c, i) => (
        <CapsuleCollider key={i} args={[c.half, LAMP.arm.r + 0.5]} position={c.at} rotation={c.rot} friction={0.8} />
      ))}
      <ConvexHullCollider args={[shade]} friction={0.8} />
    </>
  )
}

const WARM = new Color('#ffb266') // a soft, warm incandescent
/**
 * How the shade glows, lit from inside: brightest around the bulb, low down, a little less to the
 * bottom rim and dimming toward the top under the cap (as in lamp-arm.webp). Up the lathe's v: 0 at
 * the bottom rim, 1 at the top.
 */
function glowMap() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 64, 0, 0) // (canvas y runs down; the texture's v runs up)
  grad.addColorStop(0, '#e8e8e8')
  grad.addColorStop(0.4, '#ffffff')
  grad.addColorStop(0.62, '#f2f2f2')
  grad.addColorStop(1, '#8c8c8c')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const GLOW = { fabric: 0.85, trim: 0.6 } // emissive at full: warm and soft (just a touch of bloom round it)
const BULB_OFF = new Color('#d9d3c6')
const BULB_ON = new Color('#fff1cf')
const LINING_ON = new Color('#fff0d2')
const LINING_OFF = new Color('#cdbf9f')
export function Lamp({ solid = true }: { solid?: boolean }) {
  const switched = useCozy().lamp // the rocker
  const powered = usePower().lamp // (read every render: a hook can't sit behind the &&)
  const on = switched && powered // lit only while it's plugged in too
  const glow = useRef({ x: on ? 1 : 0 })
  const spot = useRef<SpotLight>(null)
  const spill = useRef<PointLight>(null)
  const plug = useRef<Group>(null)
  const solidAt = useRef<Group>(null)

  const mat = useMemo(
    () => ({
      metal: new MeshStandardMaterial({ color: '#d9d3e4', roughness: 1, metalness: 0 }), // lilac-silver, matte
      fabric: new MeshStandardMaterial({ color: '#f6d67a', roughness: 1, side: FrontSide, emissive: '#ffb14f', emissiveMap: glowMap(), emissiveIntensity: 0 }), // butter yellow, glowing honey-warm
      trim: new MeshStandardMaterial({ color: '#eec35e', roughness: 1, emissive: '#ffae4a', emissiveIntensity: 0 }),
      lining: new MeshBasicMaterial({ color: LINING_ON, side: BackSide, toneMapped: false }),
      bulb: new MeshBasicMaterial({ color: BULB_ON, toneMapped: false }),
      black: new MeshStandardMaterial({ color: '#3d3656', roughness: 1 }), // outlet faces, rocker: deep plum, not harsh black
      hole: new MeshStandardMaterial({ color: '#1b1626', roughness: 1 }), // seen through the slots
      mark: new MeshStandardMaterial({ color: '#f4f1ea', roughness: 1 }),
    }),
    [],
  )

  const geo = useMemo(() => {
    const base = new LatheGeometry(
      filleted(
        [
          [0, 0],
          [B.r, 0],
          [B.r, 6],
          [B.r - 6, 9],
          [B.r - 6, 13], // three stepped ridges rising toward the middle
          [B.r - 13, 14],
          [B.r - 13, 18],
          [B.r - 20, 19],
          [B.r - 20, 23],
          [B.topR, B.top], // the flat top tier: the outlets and the switch are set into it
          [B.collar.r, B.top],
          [B.collar.r - 4, B.top + 6], // the collar where the pole stands
          [B.collar.r - 9, B.top + 12],
          [B.collar.r - 9, B.top + B.collar.h - 2],
          [P.r, B.top + B.collar.h],
          [0, B.top + B.collar.h],
        ],
        4.5, // soft, toy-like ridges
      ),
      96,
    )
    const pole = new LatheGeometry(
      filleted(
        [
          [0, B.top + 10],
          [P.r, B.top + 10],
          [P.r, P.ring],
          [P.r + 2.5, P.ring + 3], // the low ring
          [P.r + 2.5, P.ring + 9],
          [P.r, P.ring + 12],
          [P.r, P.top],
          [P.r + 3.5, P.top + 6], // the urn finial
          [P.r + 1.5, P.top + 16],
          [P.r + 4.5, P.top + 26],
          [4.5, P.top + 36], // the spike
          [0, P.top + LAMP.finial.h],
        ],
        2.5,
        4,
      ),
      32,
    )
    const collar = new LatheGeometry(filleted([[0, -10], [P.r + 4, -10], [P.r + 4, 10], [0, 10]], 3), 24)
    const arm = new TubeGeometry(new CatmullRomCurve3(armPoints(), false, 'centripetal'), 96, LAMP.arm.r, 14, false)
    // the domed cap on top of the shade (built upward from the shade's top, y = 0)
    const cap = new LatheGeometry(
      filleted([[LAMP.cap.r, 0], [LAMP.cap.r, 8], [LAMP.cap.r - 6, LAMP.cap.h - 5], [LAMP.arm.r + 3, LAMP.cap.h], [0, LAMP.cap.h]], 5),
      40,
    )
    const cone = (grow: number) => new LatheGeometry([new Vector2(S.rBottom + grow, -S.h), new Vector2(S.rTop + grow, 0)], 72)
    const rimTop = new TorusGeometry(S.rTop + 0.6, S.rimTop, 8, 72)
    const rimBottom = new TorusGeometry(S.rBottom + 0.6, S.rimBottom, 8, 96)
    const bulb = new LatheGeometry(filleted([[0, -34], [15, -30], [22, -18], [18, -4], [10, 4], [0, 6]], 5), 32)
    // one outlet: the raised face with its holes cut through, soft edges
    const face = new ExtrudeGeometry(receptacleShape(), { depth: 1.4, bevelEnabled: true, bevelThickness: 1.1, bevelSize: 1.1, bevelSegments: 3, curveSegments: 20 })
    return { base, pole, collar, arm, cap, outer: cone(0.8), lining: cone(0), rimTop, rimBottom, bulb, face }
  }, [])

  // the spot shines along the shade's axis, from the bulb
  const bulbAt = useMemo(() => F.top.clone().addScaledVector(F.axis, LAMP.bulbDepth), [])
  const target = useMemo(() => {
    const o = new Object3D()
    o.position.copy(bulbAt).addScaledVector(F.axis, 1000)
    return o
  }, [bulbAt])

  useFrame((_, dt) => {
    const g = glow.current
    g.x += ((on ? 1 : 0) - g.x) * (1 - Math.exp(-dt * 12)) // a quick warm fade, not a hard cut
    if (spot.current) spot.current.intensity = 1300 * g.x // decay 1: a gentle falloff, so the whole desk is evenly lit
    if (spill.current) spill.current.intensity = 340 * g.x // decay 1: a soft warm fill all round
    // (the page's toy look swaps in a copy of each material, userData.twin: drive both)
    for (const [m, k] of [[mat.fabric, GLOW.fabric], [mat.trim, GLOW.trim]] as const) {
      m.emissiveIntensity = k * g.x
      const twin = m.userData.twin as MeshStandardMaterial | undefined
      if (twin) twin.emissiveIntensity = k * g.x
    }
    mat.lining.color.copy(LINING_OFF).lerp(LINING_ON, g.x).multiplyScalar(0.4 + 0.75 * g.x)
    mat.bulb.color.copy(BULB_OFF).lerp(BULB_ON, g.x).multiplyScalar(0.6 + 1.5 * g.x)
    plug.current?.getWorldPosition(cozy.plug.position)
  })

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    cozy.toggle('lamp')
  }
  const hover = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => (document.body.style.cursor = 'auto'),
  }
  return (
    <group>
      <group onClick={click} {...hover}>
        <mesh geometry={geo.base} material={mat.metal} castShadow receiveShadow />
        {/* three outlets flat in the top tier, facing up, ground hole toward the rim */}
        {O.angles.map((a) => (
          <group key={a} rotation={[0, a, 0]}>
            <group position={[0, B.top, B.ring]} rotation={[-Math.PI / 2, 0, 0]}>
              {/* the black well under the face, seen through the slots */}
              <mesh position={[0, 0, -0.4]} material={mat.hole}>
                <planeGeometry args={[O.w - 4, O.h - 4]} />
              </mesh>
              <mesh geometry={geo.face} material={mat.black} castShadow receiveShadow />
            </group>
          </group>
        ))}
        {/* the small black rocker at the front, lying east-west: O on the left, I on the right */}
        <Rocker on={switched} mat={mat} />
        {/* the back outlet, where the charger stands (the room's string lights take their power from here) */}
        <group ref={plug} position={[0, B.top, -B.ring]} />
        <mesh geometry={geo.pole} material={mat.metal} castShadow />
        <mesh geometry={geo.collar} material={mat.metal} position={[0, LAMP.arm.collarY, 0]} castShadow />
        <mesh geometry={geo.arm} material={mat.metal} castShadow />
        <group position={F.top} rotation={[TILT, 0, 0]}>
          <mesh geometry={geo.cap} material={mat.metal} castShadow />
          <mesh geometry={geo.outer} material={mat.fabric} castShadow />
          <mesh geometry={geo.lining} material={mat.lining} />
          <mesh geometry={geo.rimTop} material={mat.trim} rotation={[Math.PI / 2, 0, 0]} castShadow />
          <mesh geometry={geo.rimBottom} material={mat.trim} position={[0, -S.h, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow />
          <mesh geometry={geo.bulb} material={mat.bulb} position={[0, -LAMP.bulbDepth + 12, 0]} />
        </group>
      </group>
      <group ref={solidAt} />
      {solid && (
        <FollowCollider target={solidAt}>
          <LampColliders />
        </FollowCollider>
      )}
      <primitive object={target} />
      <spotLight
        ref={spot}
        userData={{ bakeLampLight: true }}
        position={bulbAt}
        target={target}
        color={WARM}
        decay={1}
        distance={0}
        angle={1.15} // wide: the shade's rim shapes the pool
        penumbra={1} // the softest edge
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0008}
        shadow-normalBias={4}
        shadow-radius={4}
        shadow-camera-near={30}
        shadow-camera-far={4000}
      />
      <pointLight ref={spill} position={bulbAt} color="#ffb470" decay={1} distance={0} />
    </group>
  )
}

type Mats = { black: MeshStandardMaterial; mark: MeshStandardMaterial }

/** The small black rocker set flat in the top at the front, lying east-west: O left, I right. */
function Rocker({ on, mat }: { on: boolean; mat: Mats }) {
  const R = LAMP.rocker
  return (
    <group position={[0, B.top, B.ring + 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <RoundedBox args={[R.w, R.d, 2.4]} radius={1.1} smoothness={2} position={[0, 0, 0.6]} material={mat.black} />
      {/* the rocker tips about the north-south axis: the I end down when on */}
      <group position={[0, 0, 1.8]} rotation={[0, on ? 0.16 : -0.16, 0]}>
        <RoundedBox args={[R.rocker[0], R.rocker[1], 3]} radius={1} smoothness={2} position={[0, 0, 1]} material={mat.black} />
        <mesh position={[3.8, 0, 2.6]} material={mat.mark}>
          <boxGeometry args={[0.9, 3.6, 0.3]} />
        </mesh>
        <mesh position={[-3.8, 0, 2.6]} material={mat.mark}>
          <torusGeometry args={[1.4, 0.35, 6, 14]} />
        </mesh>
      </group>
    </group>
  )
}
