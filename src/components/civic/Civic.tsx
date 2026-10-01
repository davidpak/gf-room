import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal, useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { CanvasTexture, LatheGeometry, SRGBColorSpace, Vector2, type Group, type Material, type Mesh, type Object3D } from 'three'
import { bruno } from '../quad/bruno'
import { CIVIC, TOY } from './spec'
import { addShadowProxies, shadowProxiesReady, whenShadowProxiesReady } from './shadowProxy'
import { indexForPointer } from '../../lib/render/bvh'

/**
 * David's car, the 2016 Civic LX sedan, from a real model of it (scripts/civic.mjs makes
 * public/models/civic.glb: the body, the four doors, the trunk lid and the four rims, each its own
 * node at its hinge or axle, in real mm), in the Quad's light (./quad/bruno: its materials swapped by
 * name for the toy's), with its own tyres and its Washington plates, BTD2709, front and back.
 *
 * Click a door or the trunk to open it, again to shut it (`openings`; the car shuts its doors when it
 * drives off). Frame: +z forward, +y up, the ground at 0, the driver's side +x; scaled to the toy by
 * <Civic>.
 */
export const MODEL = '/models/civic.glb'
useGLTF.preload(MODEL)

// ---- the openings, shared (./quad/Car shuts the doors when it drives off)
export type Opening = 'door_fr' | 'door_fl' | 'door_rr' | 'door_rl' | 'trunk'
export const openings: Record<Opening, boolean> = { door_fr: false, door_fl: false, door_rr: false, door_rl: false, trunk: false }
export const shutDoors = () => void (['door_fr', 'door_fl', 'door_rr', 'door_rl'] as const).forEach((k) => (openings[k] = false))
/** the trunk's well (real mm, the car's frame): between the quarter panels, from under the parcel
 *  shelf back to the bumper; its floor, and the rim the lid shuts onto */
export const WELL = { x: 600, z0: -2150, z1: -1400, floor: 560, rim: 1000 }
/** how high the well's carpeted walls come (under the tail lights and the bumper's top, inside the body) */
const WALLS = { side: 700, back: 630 }
/** what's riding on the car (./quad/Physical), and whether it's in the trunk: while anything is, the
 *  lid won't shut on it */
export const stowed = new Map<string, boolean>()
const OPENS: Record<Opening, number> = { door_fr: 1.1, door_fl: 1.1, door_rr: 1.1, door_rl: 1.1, trunk: 1.2 } // (how far each swings, radians)
/** the part a mesh belongs to (walking up to its node), if it opens */
function openingOf(o: Object3D | null) {
  while (o && !(o.name in openings)) o = o.parent
  return (o?.name as Opening | undefined) ?? null
}

// ---- the toy's materials, by the model's names (Portuguese: pintura paint, vidros glass, cromado chrome…)
const MATS: Record<string, Material> = {
  Carro_Pintura: bruno({ color: '#26272f', shade: '#3b3758', sheen: 0.3 }), // (Crystal Black Pearl, lifted a touch, glossy)
  Carro_Plastico: bruno({ color: '#1c1c22', shade: '#2e2b44' }),
  Carro_Interno: bruno({ color: '#4d4955', shade: '#f0d4c8', lit: 0.9, warm: 0.4 }), // (inside: one soft even tone: its shade near its light, so no blotches)
  Carro_Espelhos: bruno({ color: '#b7c1d4', sheen: 0.5 }),
  Carro_Vidros: bruno({ color: '#5d6d92', transparent: true, opacity: 0.55, depthWrite: false, sheen: 0.7 }),
  Carro_Cromado: bruno({ color: '#e2e5ec', shade: '#a6a3bb', emissive: '#ffffff', emissiveIntensity: 0.1, sheen: 0.4 }),
  Carro_Refletor_Lanterna: bruno({ color: '#d7dce6', emissive: '#fff4e0', emissiveIntensity: 0.25, warm: 0 }),
  Carro_Vidro_Laranja: bruno({ color: '#f2a23c', emissive: '#ff9a30', emissiveIntensity: 0.35, warm: 0 }),
  Carro_Metal_Vermelho: bruno({ color: '#9e1b27', emissive: '#ff2a3a', emissiveIntensity: 0.25, warm: 0 }),
  Carro_Metal_Lanterna_Traseira: bruno({ color: '#4b1820' }),
  Carro_Vidro_Ré: bruno({ color: '#e9edf3', emissive: '#ffffff', emissiveIntensity: 0.15, warm: 0 }),
  Carro_Vidros_Vermelhos: bruno({ color: '#c01f31', emissive: '#ff3344', emissiveIntensity: 0.35, warm: 0, sheen: 0.4 }),
  Carro_Roda: bruno({ color: '#c3c7cf', shade: '#8e8ba2', sheen: 0.3 }),
  Placa_Branco: bruno({ color: '#eef0f4', emissive: '#ffffff', emissiveIntensity: 0.2, warm: 0 }),
}
const DARK = bruno({ color: '#1c1c22' })
const TYRE = bruno({ color: '#2a2830' })

// ---- the tyres (the model's are thousands of tread blocks: these are simple, round-shouldered)
export const TYRE_R = 337 // (215/55R16 at the model's size: its rims' middle stands 337 up)
const TYRE_GEO = (() => {
  const r = TYRE_R
  const w = CIVIC.tyre.w
  const sh = 45
  const pts: Vector2[] = [new Vector2(r * 0.74, -w / 2)]
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI
    pts.push(new Vector2(r - sh + Math.cos(a) * sh, (Math.sin(a) * w) / 2))
  }
  pts.push(new Vector2(r * 0.74, w / 2))
  const g = new LatheGeometry(pts, 36)
  g.rotateZ(Math.PI / 2) // (its axle across the car)
  return g
})()

// ---- the plates: Washington's, painted
function plateTexture() {
  const Wd = 610
  const Ht = 304
  const c = document.createElement('canvas')
  c.width = Wd
  c.height = Ht
  const g = c.getContext('2d')!
  g.fillStyle = '#f7f8fb'
  g.fillRect(0, 0, Wd, Ht)
  // Mt Rainier, pale blue, across its lower half
  g.fillStyle = '#bcd6ee'
  g.beginPath()
  g.moveTo(0, 250)
  g.lineTo(90, 200)
  g.lineTo(190, 170)
  g.lineTo(270, 118)
  g.lineTo(305, 104)
  g.lineTo(345, 122)
  g.lineTo(430, 170)
  g.lineTo(530, 196)
  g.lineTo(610, 215)
  g.lineTo(610, 304)
  g.lineTo(0, 304)
  g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(262, 124)
  g.lineTo(305, 104)
  g.lineTo(350, 125)
  g.lineTo(320, 135)
  g.lineTo(300, 128)
  g.lineTo(280, 138)
  g.fill()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#c8203a'
  g.font = '700 50px Georgia, "Times New Roman", serif'
  g.fillText('Washington', 250, 42)
  g.font = '700 30px Georgia, "Times New Roman", serif'
  g.fillText('EVERGREEN STATE', Wd / 2, 272)
  // the tabs: the month, the year
  g.fillStyle = '#d0453a'
  g.fillRect(470, 18, 52, 48)
  g.fillStyle = '#2f8a5a'
  g.fillRect(526, 18, 64, 48)
  g.fillStyle = '#ffffff'
  g.font = '700 28px Arial, sans-serif'
  g.fillText('9', 496, 43)
  g.font = '700 22px Arial, sans-serif'
  g.fillText('2026', 558, 43)
  // the number, deep blue
  g.fillStyle = '#1d2f7a'
  g.font = '800 150px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'
  g.save()
  g.translate(Wd / 2, 162)
  g.scale(0.82, 1)
  g.fillText(CIVIC.plate.text, 0, 0)
  g.restore()
  // the bolt holes, the pressed rim
  g.fillStyle = '#9aa0ab'
  for (const x of [150, 460]) {
    g.beginPath()
    g.arc(x, 24, 7, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = 'rgba(80,90,110,0.5)'
  g.lineWidth = 6
  g.strokeRect(6, 6, Wd - 12, Ht - 12)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
const PLATE = typeof document !== 'undefined' ? bruno({ map: plateTexture(), emissive: '#ffffff', emissiveIntensity: 0.15 }) : DARK
/** where the rear plate hangs: in the recess low on the lid (real mm, the car's frame) */
const PLATE_AT = { y: 748, z: -2236 } // (its bottom edge above the lid's, which comes down to 646)
function Plate({ at, back }: { at: [number, number, number]; back?: boolean }) {
  return (
    <mesh material={PLATE} position={at} rotation={[0, back ? Math.PI : 0, 0]}>
      <boxGeometry args={[CIVIC.plate.w, CIVIC.plate.h, 6]} />
    </mesh>
  )
}

/** the car, from the model: its materials swapped for the toy's, its tyres and plates added, its doors
 *  and trunk opening on a click. `onWheels` gets the wheel nodes (./quad/Car rolls and steers them) */
export function CivicModel({ onWheels }: { onWheels?: (w: { node: Object3D; front: boolean }[]) => void }) {
  const { scene } = useGLTF(MODEL)
  const car = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const name = (Array.isArray(m.material) ? m.material[0] : m.material).name
      m.material = MATS[name] ?? DARK
      // (the glass lets the light in, casting no shade; inside's lit evenly, not blotched by the roof's shadow)
      m.castShadow = name !== 'Carro_Vidros' && name !== 'Carro_Interno' // (nor the inside: the shell's shadow covers it)
      m.receiveShadow = name !== 'Carro_Interno'
    })
    // (found under the pointer quickly: ../../lib/render/bvh)
    const ms: Mesh[] = []
    c.traverse((o) => void ((o as Mesh).isMesh && ms.push(o as Mesh)))
    indexForPointer(ms)
    return c
  }, [scene])
  // its shadow cast by a simplified stand-in (./shadowProxy: 500k triangles drawn into the sun's map down to a
  // few percent of them)
  const [simplifier, setSimplifier] = useState(shadowProxiesReady)
  useEffect(() => void (simplifier || whenShadowProxiesReady.then(() => setSimplifier(true))), [simplifier])
  useMemo(() => {
    if (!simplifier) return
    const ms: Mesh[] = []
    car.traverse((o) => void ((o as Mesh).isMesh && ms.push(o as Mesh)))
    addShadowProxies(ms)
  }, [car, simplifier])
  const parts = useMemo(() => {
    const get = (n: string) => car.getObjectByName(n) as Group | undefined
    return {
      doors: (['door_fr', 'door_fl', 'door_rr', 'door_rl'] as const).map((k) => ({ k, node: get(k) })),
      trunk: get('trunk'),
      wheels: (['wheel_fr', 'wheel_fl', 'wheel_rr', 'wheel_rl'] as const).flatMap((k) => {
        const node = get(k)
        return node ? [{ node, front: k.startsWith('wheel_f') }] : []
      }),
    }
  }, [car])
  useEffect(() => onWheels?.(parts.wheels), [parts, onWheels])
  // each door and the lid swing toward open or shut
  const angle = useMemo<Record<Opening, number>>(() => ({ door_fr: 0, door_fl: 0, door_rr: 0, door_rl: 0, trunk: 0 }), [])
  useFrame((_, dt) => {
    for (const { k, node } of parts.doors) {
      if (!node) continue
      angle[k] += ((openings[k] ? 1 : 0) - angle[k]) * Math.min(1, dt * 5)
      node.rotation.y = -Math.sign(node.position.x) * angle[k] * OPENS[k] // (its back edge swings out)
    }
    if (parts.trunk) {
      angle.trunk += ((openings.trunk ? 1 : 0) - angle.trunk) * Math.min(1, dt * 4)
      parts.trunk.rotation.x = angle.trunk * OPENS.trunk // (its back edge lifts)
    }
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    const k = openingOf(e.object)
    if (!k) return
    e.stopPropagation()
    if (k === 'trunk' && openings.trunk && [...stowed.values()].some(Boolean)) return // (a load's in it: the lid stays up)
    openings[k] = !openings[k]
  }
  const over = (e: ThreeEvent<PointerEvent>) => void (document.body.style.cursor = openingOf(e.object) ? 'pointer' : '')
  const t = parts.trunk?.position
  return (
    <group>
      <primitive object={car} onClick={click} onPointerMove={over} onPointerOut={() => (document.body.style.cursor = '')} />
      {/* a tyre on each wheel (it rolls and steers with it) */}
      {parts.wheels.map(({ node }, i) => (
        <Fragment key={i}>{createPortal(<mesh geometry={TYRE_GEO} material={TYRE} castShadow />, node)}</Fragment>
      ))}
      {/* the plates: the rear on the lid (it lifts with it), the front on the bumper */}
      {parts.trunk && t && createPortal(<Plate at={[0, PLATE_AT.y - t.y, PLATE_AT.z - t.z]} back />, parts.trunk)}
      <Plate at={[0, 430, 2318]} />
      <Well />
    </group>
  )
}

/** the trunk's well, carpeted: its floor, its sides, its back, and the bulkhead under the parcel shelf */
const CARPET = bruno({ color: '#34323b' })
function Well() {
  const { x, z0, z1, floor, rim } = WELL
  const zc = (z0 + z1) / 2
  const len = z1 - z0
  return (
    <group>
      <mesh material={CARPET} position={[0, floor - 10, zc]} receiveShadow>
        <boxGeometry args={[x * 2, 20, len]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} material={CARPET} position={[sx * (x - 10), (floor + WALLS.side) / 2, zc]} receiveShadow>
          <boxGeometry args={[20, WALLS.side - floor, len]} />
        </mesh>
      ))}
      <mesh material={CARPET} position={[0, (floor + WALLS.back) / 2, z0 + 10]} receiveShadow>
        <boxGeometry args={[x * 2, WALLS.back - floor, 20]} />
      </mesh>
      <mesh material={CARPET} position={[0, (floor + 950) / 2, z1 - 10]} receiveShadow>
        <boxGeometry args={[x * 2, 950 - floor, 20]} />
      </mesh>
    </group>
  )
}

/** the whole car, the toy: scaled down */
export function Civic() {
  return (
    <group scale={TOY.k}>
      <CivicModel />
    </group>
  )
}

if (import.meta.env.DEV && typeof window !== "undefined") Object.assign(window, { __civic: { openings, stowed } }) // (for trying it from the console)
