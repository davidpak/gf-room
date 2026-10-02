import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Hud, PerspectiveCamera } from '@react-three/drei'
import { type Group } from 'three'
import { LOOK } from '../quad/bruno'
import { Disc, Jacket, discThick, useArt } from './Record'
import { sizeOf, type Pressing } from './vinyl'

/**
 * A record taken out of the crate to look at, as a shop photographs one: the jacket up close, its record (both, for a
 * double album) slid out of its open edge behind it, fanned. Click a record: it's put on the turntable (that disc,
 * its first side up). Click anywhere else, or Esc: back in the crate.
 *
 * Drawn over the scene (drei's Hud: its own camera and light, the scene dimmed behind), so nothing in the world gets
 * in front of it. ./TurntableStage shows what's written about it (the album, its sides) in the page.
 */
let picked: Pressing | null = null
const subs = new Set<() => void>()
export const showRecord = (p: Pressing | null) => {
  picked = p
  subs.forEach((f) => f())
}
export const usePicked = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => picked)

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}

function Shown({ p, onPut }: { p: Pressing; onPut: (disc: number) => void }) {
  const art = useArt(p)
  const S = sizeOf(p)
  const discs = p.sides.length / 2
  const root = useRef<Group>(null)
  const slides = useRef<(Group | null)[]>([])
  const t = useRef(0)
  const [over, setOver] = useState<number | null>(null)
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05)
    const k = smooth(t.current / 0.45)
    const o = root.current
    if (o) {
      o.position.y = -80 * (1 - k)
      o.scale.setScalar(0.85 + 0.15 * k)
    }
    // the records slide out of the jacket's open edge, one after another
    slides.current.forEach((g, i) => {
      if (!g) return
      const out = smooth((t.current - 0.3 - i * 0.12) / 0.5)
      const to = 0.6 + i * 0.26 + (over === i ? 0.06 : 0)
      const want = (S.sleeve / 2 - S.r + to * 2 * S.r) * out
      g.position.x += (want - g.position.x) * Math.min(1, dt * 12)
    })
  })
  if (!art) return null
  const W = S.sleeve
  const span = W / 2 + (0.6 + (discs - 1) * 0.26) * 2 * S.r // (the jacket's middle to the last record's far edge)
  return (
    <group ref={root} position={[0, 0, 0]}>
      <group position={[-span / 2 + W / 4, 0, 0]}>
        {/* the jacket, in front */}
        <group position={[0, -W / 2, 0]}>
          <Jacket p={p} art={art} />
        </group>
        {Array.from({ length: discs }, (_, i) => (
          <group key={i} ref={(g) => void (slides.current[i] = g)} position={[0, 0, -S.sleeveT / 2 - 2 - i * (discThick(S) + 2)]}>
            {/* standing, its first side toward you */}
            <group
              rotation={[Math.PI / 2, 0, 0]}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation()
                setOver(i)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setOver((o) => (o === i ? null : o))
                document.body.style.cursor = ''
              }}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation()
                document.body.style.cursor = ''
                onPut(i)
              }}
            >
              <group position={[0, -discThick(S) / 2, 0]}>
                <Disc p={p} art={art} disc={i} />
              </group>
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}

export function Showcase({ onPut }: { onPut: (p: Pressing, disc: number) => void }) {
  const p = usePicked()
  const aspect = useThree((t) => t.size.width / t.size.height)
  useEffect(() => {
    if (!p) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && showRecord(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [p])
  if (!p) return null
  const S = sizeOf(p)
  const discs = p.sides.length / 2
  const span = S.sleeve / 2 + (0.6 + (discs - 1) * 0.26) * 2 * S.r + S.sleeve / 2
  // (far enough that it all fits, with room round it and under it for what the page writes about it)
  const tan = Math.tan((15 * Math.PI) / 180)
  const dist = Math.max((S.sleeve * 1.75) / (2 * tan), (span * 1.2) / (2 * tan * aspect))
  return (
    <Hud renderPriority={1}>
      <PerspectiveCamera makeDefault fov={30} near={10} far={20000} position={[0, -S.sleeve * 0.2, dist]} />
      <ambientLight intensity={0} />
      <directionalLight color={LOOK.light} intensity={LOOK.intensity} position={[-500, 700, 900]} />
      {/* the scene behind, dimmed; a click on it puts the record back */}
      <mesh position={[0, 0, -600]} onClick={() => showRecord(null)}>
        <planeGeometry args={[40000, 40000]} />
        <meshBasicMaterial color="#1b1530" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <Shown key={p.uri} p={p} onPut={(disc) => onPut(p, disc)} />
    </Hud>
  )
}
