import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CapsuleCollider, CuboidCollider } from '@react-three/rapier'
import { CanvasTexture, CylinderGeometry, Euler, ExtrudeGeometry, Path, Quaternion, SRGBColorSpace, Shape, SphereGeometry, Vector3, type BufferGeometry, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from './bruno'
import { byName, usePhotos } from './Photos'
import { SET } from './set'

/**
 * A little photo shoot set up on the lawn between the cherries (the gap between the clotheslines, where
 * two people would stand to have their picture taken): the camera on its tripod, a softbox on a light
 * stand and a spotlight on a C-stand either side, both on, aimed in under the trees; two apple boxes, a
 * laptop on the lying one showing the last shot. No people: the Quad's busy without them.
 *
 * Each piece in REAL millimetres, from the kit itself, drawn at the set's toy scale (K):
 *   tripod     Manfrotto 290 Xtra: 3 legs of 3 sections (the top one with a foam grip), a centre column,
 *              a 3-way pan head with its long handle; working height ~1.6 m
 *   camera     Sony α7 III: body 127 × 96 × 74, the grip, the viewfinder hump; a 70–180-ish zoom, 81 across,
 *              150 long (Tamron 70-180 f/2.8)
 *   softbox    60 × 90 cm, 35 deep, its strobe behind, on a 3-leg light stand at ~2.1 m
 *   C-stand    40" (Avenger A2030D): the turtle base's three staggered legs, the riser, a grip head and
 *              arm, a spotlight in a silver reflector dish on its end; a sandbag on a leg
 *   apple box  full: 20 × 12 × 8 in (508 × 305 × 203), 19 mm pine, a hand hole in each end
 *   laptop     MacBook Pro 13: 304 × 212 × 15.6
 * Painted in the Quad's toy light (./bruno). Every piece a loose thing like the benches (./Physical):
 * knocked over by the car, carried with the hand, put back by its prompt.
 */
export const K = 0.16 // (real mm → the set's toy mm: a touch chunkier than the car's)

// ---- materials
const BLACK = bruno({ color: '#202027', shade: '#34304c', sheen: 0.25 })
const MATTE = bruno({ color: '#2a2a31', shade: '#393552' })
const FOAM = bruno({ color: '#303038', shade: '#3a3652' })
const SILVER = bruno({ color: '#c6c9d1', shade: '#8f8ca6', sheen: 0.35 })
const GLASS = bruno({ color: '#334272', sheen: 0.9 })
const DIFFUSER = bruno({ color: '#fbf8f2', emissive: '#fff6e6', emissiveIntensity: 0.75, warm: 0 })
const BULB = bruno({ color: '#ffffff', emissive: '#fff3dc', emissiveIntensity: 1.2, warm: 0 })
const PINE = bruno({ color: '#dcb487', shade: '#a98fa6' })
const PINE_END = bruno({ color: '#cfa577', shade: '#a08aa2' })
const SANDBAG = bruno({ color: '#e0813f', shade: '#9a6a8a' })
const ALU = bruno({ color: '#cfd1d7', shade: '#9794ad', sheen: 0.3 })
const KEYS = bruno({ color: '#2b2b31' })
const RBOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.18)
const TUBE = new CylinderGeometry(1, 1, 1, 12)
const BALL = new SphereGeometry(1, 16, 12)
const _up = new Vector3(0, 1, 0)
const THICK = 1.6 // (the tubes a good deal thicker than the real kit's: a toy's, read from a way off)

/** a tube of radius r from one point to another (real mm) */
function Rod({ from, to, r, m = BLACK }: { from: [number, number, number]; to: [number, number, number]; r: number; m?: Material }) {
  const { p, q, len } = useMemo(() => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const d = b.clone().sub(a)
    return { p: a.add(b).multiplyScalar(0.5), q: new Quaternion().setFromUnitVectors(_up, d.clone().normalize()), len: d.length() }
  }, [from, to])
  return <mesh geometry={TUBE} material={m} position={p} quaternion={q} scale={[r * THICK, len, r * THICK]} castShadow />
}
/** a rounded box, size and middle (real mm) */
function Block({ size, at, m = BLACK, rot }: { size: [number, number, number]; at: [number, number, number]; m?: Material; rot?: [number, number, number] }) {
  return <mesh geometry={RBOX} material={m} position={at} rotation={rot} scale={size} castShadow receiveShadow />
}
/** a point `t` of the way from a to b */
const lerp3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
type V3 = [number, number, number]
/** three legs round a column: from a collar at `top` (radius `r0` out) down to feet `spread` out on the ground */
const legs = (top: number, r0: number, spread: number, turn = 0) =>
  [0, 1, 2].map((i) => {
    const a = turn + (i / 3) * Math.PI * 2
    return { top: [Math.sin(a) * r0, top, Math.cos(a) * r0] as V3, foot: [Math.sin(a) * spread, 0, Math.cos(a) * spread] as V3 }
  })

// ---- the camera on its tripod (the lens along −z)
function Camera() {
  return (
    <group>
      {/* the body, its grip on the right, the viewfinder hump, the mode dials */}
      <Block size={[127, 80, 60]} at={[0, 40, 0]} m={BLACK} />
      <Block size={[34, 84, 70]} at={[52, 42, -8]} m={MATTE} />
      <Block size={[62, 34, 52]} at={[-6, 92, 4]} m={BLACK} />
      <Rod from={[36, 80, 8]} to={[36, 92, 8]} r={11} m={MATTE} />
      <Rod from={[-40, 80, 10]} to={[-40, 90, 10]} r={10} m={MATTE} />
      {/* the lens: its mount, the zoom ring, the focus ring, the front, the glass */}
      <Rod from={[0, 42, -30]} to={[0, 42, -44]} r={31} m={SILVER} />
      <Rod from={[0, 42, -44]} to={[0, 42, -120]} r={40} m={BLACK} />
      <Rod from={[0, 42, -70]} to={[0, 42, -105]} r={42} m={FOAM} />
      <Rod from={[0, 42, -120]} to={[0, 42, -196]} r={43} m={BLACK} />
      <Rod from={[0, 42, -196]} to={[0, 42, -200]} r={38} m={GLASS} />
    </group>
  )
}
export function TripodCamera() {
  const CROWN = 1290
  return (
    <group>
      {legs(CROWN - 20, 50, 560, 0.35).map(({ top, foot }, i) => (
        <group key={i}>
          {/* the upper section with its foam grip, the lower two thinner; the flip locks; the foot */}
          <Rod from={top} to={lerp3(top, foot, 0.5)} r={13} />
          <Rod from={lerp3(top, foot, 0.06)} to={lerp3(top, foot, 0.34)} r={18} m={FOAM} />
          <Rod from={lerp3(top, foot, 0.5)} to={lerp3(top, foot, 0.78)} r={10.5} />
          <Rod from={lerp3(top, foot, 0.78)} to={foot} r={8.5} />
          <Block size={[30, 34, 30]} at={lerp3(top, foot, 0.5)} m={MATTE} />
          <Block size={[26, 28, 26]} at={lerp3(top, foot, 0.78)} m={MATTE} />
          <Rod from={[foot[0], 0, foot[2]]} to={[foot[0], 26, foot[2]]} r={14} m={MATTE} />
        </group>
      ))}
      {/* the crown, the centre column (its hook below), the head, the handle out back */}
      <Rod from={[0, CROWN - 40, 0]} to={[0, CROWN + 20, 0]} r={52} />
      <Rod from={[0, 980, 0]} to={[0, CROWN + 150, 0]} r={14} m={MATTE} />
      <Rod from={[0, CROWN + 150, 0]} to={[0, CROWN + 180, 0]} r={40} />
      <Block size={[70, 90, 76]} at={[0, CROWN + 225, 0]} m={BLACK} />
      <Rod from={[-30, CROWN + 230, 30]} to={[-150, CROWN + 170, 330]} r={11} />
      <Rod from={[-110, CROWN + 190, 230]} to={[-150, CROWN + 170, 330]} r={16} m={FOAM} />
      <Block size={[64, 18, 110]} at={[0, CROWN + 280, 0]} m={MATTE} />
      <group position={[0, CROWN + 289, 10]} scale={1.4}>
        <Camera />
      </group>
    </group>
  )
}

// ---- the softbox on its light stand (it faces −z, tipped down)
const SOFTBOX = (() => {
  // a square frustum (four sides), stretched to 60 × 90: its big end the diffuser
  const g = new CylinderGeometry(Math.SQRT1_2, 0.2 * Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4)
  g.rotateX(-Math.PI / 2) // (its big end toward −z)
  g.scale(600, 900, 350)
  return g
})()
export function Softbox() {
  const TOP = 2100
  return (
    <group>
      {legs(460, 30, 560).map(({ top, foot }, i) => (
        <Rod key={i} from={top} to={foot} r={11} m={MATTE} />
      ))}
      <Rod from={[0, 420, 0]} to={[0, 520, 0]} r={26} />
      <Rod from={[0, 200, 0]} to={[0, 1150, 0]} r={18} />
      <Rod from={[0, 1150, 0]} to={[0, 1700, 0]} r={15} m={SILVER} />
      <Rod from={[0, 1700, 0]} to={[0, TOP, 0]} r={12} m={SILVER} />
      <Block size={[46, 50, 46]} at={[0, 1150, 0]} m={MATTE} />
      <Block size={[40, 44, 40]} at={[0, 1700, 0]} m={MATTE} />
      {/* the bracket, the strobe, the box: tipped down toward the pose */}
      <group position={[0, TOP + 60, 0]} rotation={[-0.32, 0, 0]}>
        <Block size={[60, 90, 60]} at={[0, 0, 0]} m={BLACK} />
        <Rod from={[0, 0, 220]} to={[0, 0, 40]} r={50} m={BLACK} />
        <mesh geometry={SOFTBOX} material={[MATTE, DIFFUSER, MATTE]} position={[0, 0, -175 + 40]} castShadow />
      </group>
    </group>
  )
}

// ---- the C-stand with the spotlight on its arm (the arm reaches out along −z)
const DISH = (() => {
  const g = new CylinderGeometry(120, 55, 130, 20, 1, true)
  g.rotateX(Math.PI / 2) // (its mouth toward −z)
  return g
})()
export function CStand() {
  const TOP = 2400
  return (
    <group>
      {/* the turtle base: three legs, each off the base at its own height */}
      {[0, 1, 2].map((i) => {
        const a = 0.4 + (i / 3) * Math.PI * 2
        const y = 330 - i * 70
        return <Rod key={i} from={[Math.sin(a) * 30, y, Math.cos(a) * 30]} to={[Math.sin(a) * 620, 12, Math.cos(a) * 620]} r={12} m={SILVER} />
      })}
      <Rod from={[0, 120, 0]} to={[0, 400, 0]} r={30} m={SILVER} />
      {/* the riser, its knuckles */}
      <Rod from={[0, 400, 0]} to={[0, 1500, 0]} r={18} m={SILVER} />
      <Rod from={[0, 1500, 0]} to={[0, 2050, 0]} r={15} m={SILVER} />
      <Rod from={[0, 2050, 0]} to={[0, TOP, 0]} r={12} m={SILVER} />
      {[1500, 2050].map((y) => (
        <group key={y}>
          <Block size={[48, 52, 48]} at={[0, y, 0]} m={MATTE} />
          <Rod from={[20, y, 0]} to={[70, y, 0]} r={9} m={MATTE} />
        </group>
      ))}
      {/* the grip head, the arm out and down a little, the light on its end */}
      <Block size={[70, 80, 60]} at={[0, TOP, 0]} m={BLACK} />
      <Rod from={[0, TOP, 200]} to={[0, TOP - 200, -900]} r={11} m={SILVER} />
      <group position={[0, TOP - 230, -960]} rotation={[-0.45, 0, 0]}>
        <Rod from={[0, 0, 170]} to={[0, 0, 0]} r={62} m={BLACK} />
        <mesh geometry={DISH} material={SILVER} position={[0, 0, -60]} castShadow />
        <mesh geometry={DISH} material={BLACK} position={[0, 0, -60]} scale={[1.02, 1.02, 1]} />
        <mesh geometry={BALL} material={BULB} position={[0, 0, -20]} scale={36} />
      </group>
      {/* a sandbag over the base, on the leg under the arm */}
      <Block size={[260, 110, 180]} at={[Math.sin(0.4) * 250, 150, Math.cos(0.4) * 250]} rot={[0, 0.4, 0.25]} m={SANDBAG} />
    </group>
  )
}

// ---- an apple box (full: lying flat, 508 long, 203 tall, 305 deep), hollow, a hand hole in each end
function endPanel() {
  const s = new Shape()
  const w = 305
  const h = 203
  s.moveTo(-w / 2, -h / 2)
  s.lineTo(w / 2, -h / 2)
  s.lineTo(w / 2, h / 2)
  s.lineTo(-w / 2, h / 2)
  s.closePath()
  // the hand hole: a long oval
  const hole = new Path()
  hole.absellipse(0, 20, 55, 22, 0, Math.PI * 2, false, 0)
  s.holes.push(hole)
  const g = new ExtrudeGeometry(s, { depth: 19, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 1 })
  g.translate(0, 0, -9.5)
  g.rotateY(Math.PI / 2) // (across the box's end)
  return g
}
const END: BufferGeometry = endPanel()
export function AppleBox() {
  const [L, H, D, T] = [508, 203, 305, 19]
  return (
    <group position={[0, H / 2, 0]}>
      <Block size={[L, T, D]} at={[0, H / 2 - T / 2, 0]} m={PINE} />
      <Block size={[L, T, D]} at={[0, -H / 2 + T / 2, 0]} m={PINE} />
      <Block size={[L - 2 * T, H - 2 * T, T]} at={[0, 0, D / 2 - T / 2]} m={PINE} />
      <Block size={[L - 2 * T, H - 2 * T, T]} at={[0, 0, -D / 2 + T / 2]} m={PINE} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={END} material={PINE_END} position={[s * (L / 2 - T / 2), 0, 0]} castShadow receiveShadow />
      ))}
    </group>
  )
}

// ---- the laptop, open, the last shot on its screen (tethered to the camera)
function useScreen() {
  const list = usePhotos()
  const [tex, setTex] = useState<CanvasTexture | null>(null)
  useEffect(() => {
    const p = list ? byName(list, 'cherry', ['IMG_8167'])[0] : null
    if (!p) return
    const img = new Image()
    img.onload = () => {
      // an editing app's dark window: the shot big, a film strip of thumbnails under it, panels either side
      const W = 512
      const H = 320
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const g = c.getContext('2d')!
      g.fillStyle = '#1e1e22'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#2a2a30'
      g.fillRect(0, 0, W, 16)
      g.fillRect(0, 16, 70, H - 16)
      g.fillRect(W - 90, 16, 90, H - 16)
      for (let i = 0; i < 8; i++) {
        g.fillStyle = '#3a3a42'
        g.fillRect(W - 82, 28 + i * 22, 74, 6)
        g.fillStyle = '#6a6a78'
        g.fillRect(W - 82 + ((i * 29) % 50), 26 + i * 22, 6, 10)
      }
      const [x0, y0, bw, bh] = [80, 24, W - 180, H - 90]
      const k = Math.min(bw / img.width, bh / img.height)
      g.drawImage(img, x0 + (bw - img.width * k) / 2, y0 + (bh - img.height * k) / 2, img.width * k, img.height * k)
      for (let i = 0; i < 6; i++) {
        g.drawImage(img, 84 + i * 56, H - 56, 48, 48 * (img.height / img.width))
        if (i === 2) {
          g.strokeStyle = '#f2b24a'
          g.lineWidth = 2
          g.strokeRect(84 + i * 56, H - 56, 48, 48 * (img.height / img.width))
        }
      }
      const t = new CanvasTexture(c)
      t.colorSpace = SRGBColorSpace
      setTex(t)
    }
    img.src = p.thumb
  }, [list])
  return useMemo(() => (tex ? bruno({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.85, warm: 0 }) : KEYS), [tex])
}
export function Laptop() {
  const screen = useScreen()
  const [W, D, T] = [304, 212, 7]
  return (
    <group>
      {/* the base, its keyboard sunk in it, the lid up at 110°, its screen */}
      <Block size={[W, T + 2, D]} at={[0, (T + 2) / 2, 0]} m={ALU} />
      <Block size={[W - 40, 2, D * 0.5]} at={[0, T + 1.6, -D * 0.12]} m={KEYS} />
      <Block size={[W * 0.36, 1.6, D * 0.26]} at={[0, T + 1.6, D * 0.3]} m={KEYS} />
      <group position={[0, T + 2, -D / 2 + 4]} rotation={[-0.35, 0, 0]}>
        <Block size={[W, D - 10, 6]} at={[0, (D - 10) / 2, -3]} m={ALU} />
        <mesh material={screen} position={[0, (D - 10) / 2 + 4, 0.8]}>
          <planeGeometry args={[W - 22, D - 38]} />
        </mesh>
      </group>
    </group>
  )
}

// ---- the set, as loose things for ./Physical (visual + colliders, in the set's toy mm)
export type ShootProp = { id: string; label: string; at: { x: number; y: number; z: number; rot: number }; lift: number; feelAlong: number[]; feelPts?: [number, number][]; feelR: number; node: ReactNode; colliders: ReactNode }
const box = (half: V3, at: V3, mass: number) => <CuboidCollider args={half.map((v) => v * K) as V3} position={at.map((v) => v * K) as V3} mass={mass} friction={0.8} />
/** a leg, solid: a capsule from its top down to its foot (real mm, the set's frame) */
function leg(top: V3, foot: V3, r: number, mass: number, key: number) {
  const a = new Vector3(...top).multiplyScalar(K)
  const b = new Vector3(...foot).multiplyScalar(K)
  b.y += r * K // (its round end resting on the ground)
  const d = b.clone().sub(a)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize())
  const e = new Euler().setFromQuaternion(q)
  return <CapsuleCollider key={key} args={[d.length() / 2, r * K]} position={a.clone().add(b).multiplyScalar(0.5).toArray()} rotation={[e.x, e.y, e.z]} mass={mass} friction={0.8} />
}
/** where the car feels a three-legged thing: its middle, each foot, halfway down each leg (world mm, its frame) */
const legFeel = (ls: { top: V3; foot: V3 }[]): [number, number][] => [[0, 0], ...ls.flatMap(({ top, foot }) => [[foot[0] * K, foot[2] * K] as [number, number], [((top[0] + foot[0]) / 2) * K, ((top[2] + foot[2]) / 2) * K] as [number, number]])]
const TRIPOD_LEGS = legs(1270, 50, 560, 0.35)
const SOFTBOX_LEGS = legs(460, 30, 560)
const CSTAND_LEGS = [0, 1, 2].map((i) => {
  const a = 0.4 + (i / 3) * Math.PI * 2
  return { top: [Math.sin(a) * 30, 330 - i * 70, Math.cos(a) * 30] as V3, foot: [Math.sin(a) * 620, 12, Math.cos(a) * 620] as V3 }
})
const scaled = (n: ReactNode) => <group scale={K}>{n}</group>
export function shootProps(): ShootProp[] {
  const S = SET.shoot
  const LAWN = 4
  return [
    {
      id: 'tripod',
      label: 'Set the camera back up',
      at: { ...S.camera, y: LAWN },
      lift: 1800 * K,
      feelAlong: [0],
      feelPts: legFeel(TRIPOD_LEGS),
      feelR: 14,
      node: scaled(<TripodCamera />),
      colliders: (
        <>
          {TRIPOD_LEGS.map((l, i) => leg(l.top, l.foot, 22, 0.4, i))}
          {box([40, 650, 40], [0, 700, 0], 0.4)}
          {box([80, 90, 130], [0, 1560, -40], 0.6)}
        </>
      ),
    },
    {
      id: 'softbox',
      label: 'Stand the light back up',
      at: { ...S.softbox, y: LAWN },
      lift: 2500 * K,
      feelAlong: [0],
      feelPts: legFeel(SOFTBOX_LEGS),
      feelR: 14,
      node: scaled(<Softbox />),
      colliders: (
        <>
          {SOFTBOX_LEGS.map((l, i) => leg(l.top, l.foot, 20, 0.4, i))}
          {box([30, 1000, 30], [0, 1080, 0], 0.4)}
          {box([300, 450, 200], [0, 2140, -120], 0.5)}
        </>
      ),
    },
    {
      id: 'cstand',
      label: 'Stand the C-stand back up',
      at: { ...S.cstand, y: LAWN },
      lift: 2700 * K,
      feelAlong: [0],
      feelPts: legFeel(CSTAND_LEGS),
      feelR: 14,
      node: scaled(<CStand />),
      colliders: (
        <>
          {CSTAND_LEGS.map((l, i) => leg(l.top, l.foot, 20, 0.7, i))}
          {box([30, 1200, 30], [0, 1200, 0], 0.5)}
          {box([130, 130, 500], [0, 2250, -600], 0.4)}
        </>
      ),
    },
    ...S.boxes.map((b, i) => ({
      id: `applebox${i}`,
      label: 'Put the apple box back',
      at: { x: b.x, y: LAWN, z: b.z, rot: b.rot },
      lift: 600 * K,
      feelAlong: [0],
      feelR: 50,
      // (standing on its end: turned up so its 508 is its height)
      node: scaled(
        b.onEnd ? (
          <group rotation={[0, 0, Math.PI / 2]} position={[203 / 2, 254, 0]}>
            <AppleBox />
          </group>
        ) : (
          <AppleBox />
        ),
      ),
      colliders: b.onEnd ? box([101, 254, 152], [0, 254, 0], 0.8) : box([254, 101, 152], [0, 101, 0], 0.8),
    })),
    {
      id: 'laptop',
      label: 'Put the laptop back',
      at: { ...S.laptop, y: LAWN + 203 * K }, // (on the lying apple box)
      lift: 300 * K,
      feelAlong: [0],
      feelR: 30,
      node: scaled(<Laptop />),
      colliders: box([152, 6, 106], [0, 6, 0], 0.3),
    },
  ]
}
