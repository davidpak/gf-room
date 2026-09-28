import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, Color, ExtrudeGeometry, MeshBasicMaterial, Shape, SpriteMaterial, Vector3, type Group } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno, shared } from './bruno'

/**
 * The Quad's furniture, from the photos: the park bench (weathered wooden slats on dark green cast-
 * iron ends, the arms rolled over in a scroll) and the black lamp post (a stepped foot, a fluted
 * column, a lantern of warm glass under a little roof), which lights the blossom round it.
 */
const IRON = bruno({ color: '#22382e' })
const WOOD = ['#b9824f', '#a9713f', '#c28c5a', '#b27a47'].map((c) => bruno({ color: c }))

/** a bench end in profile (z forward, y up): front leg, the seat rail, the back rising and leaning,
 *  the arm over the top rolled into a scroll at the front */
function benchEnd() {
  const s = new Shape()
  s.moveTo(46, 0)
  s.lineTo(58, 0)
  s.lineTo(54, 92)
  s.lineTo(60, 150)
  s.bezierCurveTo(64, 172, 44, 180, 38, 166)
  s.bezierCurveTo(34, 156, 46, 150, 50, 158) // (the scroll)
  s.lineTo(46, 150)
  s.lineTo(-40, 152)
  s.lineTo(-58, 236)
  s.bezierCurveTo(-62, 246, -76, 246, -74, 234)
  s.lineTo(-58, 150)
  s.lineTo(-66, 0)
  s.lineTo(-54, 0)
  s.lineTo(-46, 86)
  s.lineTo(40, 86)
  s.lineTo(46, 0)
  const g = new ExtrudeGeometry(s, { depth: 12, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 2, curveSegments: 10 })
  g.translate(0, 0, -6)
  g.rotateY(Math.PI / 2) // (the profile's x → the bench's z, its thickness along x)
  return g
}

export function Bench({ position = [0, 0, 0] as [number, number, number], rotation = 0 }) {
  const L = 440
  const end = useMemo(benchEnd, [])
  const slat = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.18), [])
  const seat = [-38, -12, 14, 40].map((z, i) => ({ z, y: 94, w: 22, t: 9, tilt: 0, m: WOOD[i % 4] }))
  const back = [0, 1, 2].map((i) => ({ z: -47 - i * 7.5, y: 150 + i * 30, w: 22, t: 9, tilt: -0.24, m: WOOD[(i + 2) % 4] }))
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={end} material={IRON} position={[s * (L / 2 - 30), 4, 0]} castShadow receiveShadow />
      ))}
      {[...seat, ...back].map((b, i) => (
        <mesh key={i} geometry={slat} material={b.m} position={[0, 4 + b.y, b.z]} rotation={[b.tilt, 0, 0]} scale={[L, b.t, b.w]} castShadow receiveShadow />
      ))}
    </group>
  )
}

// ---- the lamp post
const BLACK = bruno({ color: '#262129' })
const GLASS = new MeshBasicMaterial({ color: new Color('#ffd79a').multiplyScalar(1.25), toneMapped: false })
function halo() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,214,150,0.85)')
  r.addColorStop(0.25, 'rgba(255,184,120,0.35)')
  r.addColorStop(1, 'rgba(255,160,110,0)')
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
