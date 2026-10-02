import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, ExtrudeGeometry, Path, RepeatWrapping, SRGBColorSpace, Shape, type Group } from 'three'
import { bruno } from '../quad/bruno'
import { Jacket, useArt } from './Record'
import { LP, type Pressing } from './vinyl'

/**
 * The crate her records live in: pine, open-topped, low at the front so the covers show, a hand-hole in each end.
 * Our own (no one crate it copies), sized round a 12" jacket the way record crates are: [LP] the jacket's 314 mm
 * across, a finger's room each side; 200 tall, so the records stand well out of it.
 *
 * The records stand in it covers forward, leaning back a little, front to back. Hover one: it lifts out of the
 * crate, its record sliding half out of the jacket. Click it: `onPick` (it's put on the turntable).
 * Its frame: its middle, its floor's underside at y 0, the low front toward +z.
 */
export const CRATE = {
  in: { w: LP.sleeve + 16, d: 250 }, // inside
  wall: 14,
  floor: 12,
  h: 200, // ends and back
  front: 120, // the low front
  hole: { w: 90, h: 30, y: 150 }, // the hand-holes in the ends
  lean: 0.1, // radians back
  colors: { pine: '#e3bf8c', pineShade: '#9a7f9a' },
}
const C = CRATE

/** an end: the board with its hand-hole cut through (its faces' uv in mm, the grain's texture repeated to suit) */
function endBoard() {
  const D = C.in.d + 2 * C.wall
  const s = new Shape()
  s.moveTo(-D / 2, 0)
  s.lineTo(D / 2, 0)
  s.lineTo(D / 2, C.h)
  s.lineTo(-D / 2, C.h)
  s.closePath()
  const { w, h, y } = C.hole
  const hole = new Path()
  hole.absarc(-w / 2 + h / 2, y, h / 2, Math.PI / 2, (Math.PI * 3) / 2, false)
  hole.lineTo(w / 2 - h / 2, y - h / 2)
  hole.absarc(w / 2 - h / 2, y, h / 2, -Math.PI / 2, Math.PI / 2, false)
  hole.closePath()
  s.holes.push(hole)
  // (drawn in z, y; stood across x, its thickness the wall's)
  return new ExtrudeGeometry(s, { depth: C.wall, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -C.wall / 2).rotateY(Math.PI / 2)
}

function pine() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = C.colors.pine
  g.fillRect(0, 0, 512, 512)
  // pine's grain: wavy lines along the board, a knot or two
  for (let i = 0; i < 46; i++) {
    const y0 = (i * 11.3) % 512
    g.strokeStyle = `rgba(150, 95, 40, ${0.08 + (i % 5) * 0.025})`
    g.lineWidth = 1 + (i % 3)
    g.beginPath()
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.02 + i) * 3)
    g.stroke()
  }
  ;[
    [140, 300],
    [400, 120],
  ].forEach(([x, y]) => {
    g.fillStyle = 'rgba(140, 85, 35, 0.35)'
    g.beginPath()
    g.ellipse(x, y, 9, 6, 0, 0, Math.PI * 2)
    g.fill()
  })
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

function Record({ p, i, z, lifted, onOver, onOut, onPick }: { p: Pressing; i: number; z: number; lifted: boolean; onOver: () => void; onOut: () => void; onPick: () => void }) {
  const art = useArt(p)
  const g = useRef<Group>(null)
  const peek = useRef(0)
  const [shown, setShown] = useState(0)
  useFrame((_, dt) => {
    const o = g.current
    if (!o) return
    const k = Math.min(1, Math.min(dt, 0.05) * 9)
    o.position.y += ((lifted ? 150 : 0) + C.floor - o.position.y) * k
    peek.current += ((lifted ? 0.42 : 0) - peek.current) * k
    // (the record's slide out of its jacket, in steps fine enough to look smooth)
    const q = Math.round(peek.current * 60) / 60
    if (q !== shown) setShown(q)
  })
  if (!art) return null
  const h = (f: () => void) => (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    e.stopPropagation()
    f()
  }
  void i
  return (
    <group ref={g} position={[0, C.floor, z]} rotation={[-C.lean, 0, 0]}>
      <group
        onPointerOver={h(() => {
          document.body.style.cursor = 'pointer'
          onOver()
        })}
        onPointerOut={h(() => {
          document.body.style.cursor = ''
          onOut()
        })}
        onClick={h(onPick)}
      >
        <Jacket p={p} art={art} peek={shown} />
      </group>
    </group>
  )
}

export function Crate({ records, onPick, playing }: { records: Pressing[]; onPick: (p: Pressing) => void; playing?: string }) {
  const m = useMemo(() => bruno({ map: pine(), shade: C.colors.pineShade }), [])
  const mEnd = useMemo(() => {
    const t = pine()
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(1 / 300, 1 / 300)
    return bruno({ map: t, shade: C.colors.pineShade })
  }, [])
  const g = useMemo(() => {
    const W = C.in.w + 2 * C.wall
    return {
      end: endBoard(),
      back: new BoxGeometry(C.in.w, C.h, C.wall),
      front: new BoxGeometry(C.in.w, C.front, C.wall),
      floor: new BoxGeometry(W, C.floor, C.in.d + 2 * C.wall),
    }
  }, [])
  const [over, setOver] = useState<number | null>(null)
  const n = records.length
  const gap = Math.min(28, (C.in.d - 50) / Math.max(1, n - 1))
  return (
    <group>
      <mesh geometry={g.floor} material={m} position={[0, C.floor / 2, 0]} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={g.end} material={mEnd} position={[s * (C.in.w / 2 + C.wall / 2), 0, 0]} castShadow receiveShadow />
      ))}
      <mesh geometry={g.back} material={m} position={[0, C.h / 2, -C.in.d / 2 - C.wall / 2]} castShadow receiveShadow />
      <mesh geometry={g.front} material={m} position={[0, C.front / 2, C.in.d / 2 + C.wall / 2]} castShadow receiveShadow />
      {records.map((p, i) => (
        <Record
          key={p.uri}
          p={p}
          i={i}
          z={C.in.d / 2 - 30 - i * gap}
          lifted={over === i && playing !== p.uri}
          onOver={() => setOver(i)}
          onOut={() => setOver((o) => (o === i ? null : o))}
          onPick={() => onPick(p)}
        />
      ))}
    </group>
  )
}
