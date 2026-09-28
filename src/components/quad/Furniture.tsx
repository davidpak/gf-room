import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, Color, ExtrudeGeometry, MeshBasicMaterial, Shape, SpriteMaterial, Vector3, type Group } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno, shared } from './bruno'

/**
 * The Quad's furniture, from the photos: the park bench (all weathered teak, slatted, flat arms on
 * square posts) and the black lamp post (a stepped foot, a fluted
 * column, a lantern of warm glass under a little roof), which lights the blossom round it.
 */
/** weathered teak, the one wood all through, gone a light grey-brown */
const TEAK = bruno({ color: '#aa9c8b' })

type Part = { p: [number, number, number]; s: [number, number, number]; r?: number }
/** the UW bench, all wood (from the photos): square posts, the front ones up to flat arms with a
 *  rounded end, the back ones raked back up to a thick top rail; seat slats along its length; a back
 *  of close upright slats between two rails; side rails and a low stretcher at each end */
function benchParts(L: number): Part[] {
  const parts: Part[] = []
  const ends = [-1, 1].map((e) => e * (L / 2 - 12))
  const SEAT = 92
  for (const x of ends) {
    parts.push({ p: [x, 75, 52], s: [16, 150, 16] }) // front post, up to the arm
    parts.push({ p: [x, SEAT / 2, -50], s: [16, SEAT, 16] }) // back post, to the seat
    parts.push({ p: [x + Math.sign(x) * 2, 152, 2], s: [20, 12, 140] }) // the arm
    parts.push({ p: [x, SEAT - 16, 0], s: [14, 22, 110] }) // side rail under the seat
    parts.push({ p: [x, 20, 0], s: [12, 12, 104] }) // low stretcher
  }
  // the seat: slats along it, and the rail under its front
  for (let k = 0; k < 5; k++) parts.push({ p: [0, SEAT, -38 + k * 20], s: [L - 20, 8, 16] })
  parts.push({ p: [0, SEAT - 18, 50], s: [L - 30, 18, 12] })
  return parts
}
/** the back, in its own frame (raked back from the seat's back edge): posts, two rails, upright slats */
function backParts(L: number): Part[] {
  const parts: Part[] = []
  for (const x of [-1, 1].map((e) => e * (L / 2 - 12))) parts.push({ p: [x, 70, 0], s: [16, 140, 16] })
  parts.push({ p: [0, 18, 0], s: [L - 20, 14, 12] }) // the low rail
  parts.push({ p: [0, 132, 1], s: [L - 8, 22, 18] }) // the thick top rail
  const n = 15
  for (let k = 0; k < n; k++) parts.push({ p: [-(L - 60) / 2 + (k * (L - 60)) / (n - 1), 75, 0], s: [11, 100, 6] })
  return parts
}

/** the bench's size, for its colliders: its length, its seat's height */
export const BENCH = { L: 440, seat: 92 }

export function Bench({ position = [0, 0, 0] as [number, number, number], rotation = 0 }) {
  const L = 440
  const box = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.2), [])
  const parts = useMemo(() => benchParts(L), [])
  const back = useMemo(() => backParts(L), [])
  const mesh = (b: Part, i: number) => <mesh key={i} geometry={box} material={TEAK} position={b.p} scale={b.s} castShadow receiveShadow />
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group>
        {parts.map(mesh)}
        {/* (the back raked back from the seat, about the back posts' tops) */}
        <group position={[0, 92, -50]} rotation={[-0.16, 0, 0]}>
          {back.map(mesh)}
        </group>
      </group>
    </group>
  )
}

// ---- the lamp post
const BLACK = bruno({ color: '#262129' })
const GLASS = new MeshBasicMaterial({ color: new Color('#ffbb6e').multiplyScalar(1.2), toneMapped: false })
function halo() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,196,118,0.85)')
  r.addColorStop(0.25, 'rgba(255,156,74,0.4)')
  r.addColorStop(1, 'rgba(255,128,60,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}
const HALO = typeof document !== 'undefined' ? new SpriteMaterial({ map: halo(), blending: AdditiveBlending, depthWrite: false, transparent: true }) : null

export function LampPost({ position = [0, 0, 0] as [number, number, number], slot = 0 }) {
  const glass = useRef<Group>(null)
  // its light, for the shading's warm pools (world position of the lantern)
  useEffect(() => {
    const g = glass.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    shared.lamps.value[slot] = g.getWorldPosition(new Vector3())
    return () => void (shared.lamps.value[slot] = new Vector3(1e9, 0, 0))
  }, [slot])
  const flicker = useRef<Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (flicker.current) flicker.current.scale.setScalar(1 + Math.sin(t * 2.1) * 0.03 + Math.sin(t * 7.3) * 0.015)
  })
  const H = 700
  return (
    <group position={position}>
      {/* the stepped foot */}
      <mesh material={BLACK} position={[0, 20, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[40, 46, 40, 8]} />
      </mesh>
      <mesh material={BLACK} position={[0, 58, 0]} castShadow>
        <cylinderGeometry args={[28, 36, 36, 8]} />
      </mesh>
      {/* the fluted column, a collar */}
      <mesh material={BLACK} position={[0, 76 + (H - 76) / 2, 0]} castShadow>
        <cylinderGeometry args={[11, 15, H - 76, 8]} />
      </mesh>
      <mesh material={BLACK} position={[0, H, 0]} castShadow>
        <cylinderGeometry args={[20, 16, 16, 12]} />
      </mesh>
      {/* the lantern: warm glass, four thin posts, a little roof, a finial */}
      <group position={[0, H + 8, 0]}>
        <group ref={glass} position={[0, 52, 0]}>
          <mesh material={GLASS}>
            <cylinderGeometry args={[34, 22, 92, 8]} />
          </mesh>
        </group>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          return (
            <mesh key={i} material={BLACK} position={[Math.cos(a) * 29, 52, Math.sin(a) * 29]} rotation={[Math.sin(a) * 0.13, 0, -Math.cos(a) * 0.13]} castShadow>
              <boxGeometry args={[5, 96, 5]} />
            </mesh>
          )
        })}
        <mesh material={BLACK} position={[0, 106, 0]} castShadow>
          <coneGeometry args={[50, 40, 8]} />
        </mesh>
        <mesh material={BLACK} position={[0, 134, 0]} castShadow>
          <sphereGeometry args={[7, 12, 8]} />
        </mesh>
        {HALO && (
          <group ref={flicker} position={[0, 52, 0]}>
            <sprite material={HALO} scale={[420, 420, 1]} />
          </group>
        )}
      </group>
    </group>
  )
}
