import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, ExtrudeGeometry, Path, RepeatWrapping, SRGBColorSpace, Shape, type Group } from 'three'
import { bruno } from '../quad/bruno'
import { browseRefs, openCrate, takeOut, useBrowse } from './browse'
import { Disc, Jacket, discThick, useArt } from './Record'
import { LP, sizeOf, type Pressing } from './vinyl'

/**
 * The crate her records live in: pine, open-topped, low at the front so the covers show, a hand-hole cut through each
 * end. Our own (no one crate it copies), sized round a 12" jacket the way record crates are: [LP] the jacket's 314 mm
 * across, a finger's room each side; 200 tall, so the records stand well out of it.
 *
 * The records stand in it covers forward, leaning back a little, front to back. Going through it (./browse): the
 * record up rises clear of the crate; taken out, it comes up in front of the crate, upright, its record (both, for a
 * double album) sliding out of its open edge, fanned, to be clicked (`onPut`).
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
const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}

/** where a record taken out stands: up in front of the crate (its jacket's bottom middle; its records fan to +x) */
const OUT = { y: C.h + 30, z: C.in.d / 2 + 90 }
/** how far right of the jacket's middle the whole (jacket and fanned records) is centred */
const fanned = (p: Pressing) => {
  const S = sizeOf(p)
  const n = p.sides.length / 2
  return (S.sleeve / 2 + (0.6 + (n - 1) * 0.26) * 2 * S.r - S.sleeve / 2) / 2
}

function Record({ p, i, z, pose, onPick, onPut }: { p: Pressing; i: number; z: number; pose: 'rest' | 'hover' | 'up' | 'out'; onPick: () => void; onPut: (disc: number) => void }) {
  const art = useArt(p)
  const S = sizeOf(p)
  const g = useRef<Group>(null)
  const slides = useRef<(Group | null)[]>([])
  const outT = useRef(0)
  const [over, setOver] = useState<number | null>(null)
  useFrame((_, dtRaw) => {
    const o = g.current
    if (!o) return
    const dt = Math.min(dtRaw, 0.05)
    const k = Math.min(1, dt * 7)
    const out = pose === 'out'
    // (out: in front of the crate, upright, the whole centred; else in its place, risen as it is)
    const want = out
      ? { x: -fanned(p), y: OUT.y, z: OUT.z, r: 0.04 }
      : { x: 0, y: C.floor + (pose === 'up' ? C.h + 15 : pose === 'hover' ? 40 : 0), z, r: -C.lean }
    o.position.x += (want.x - o.position.x) * k
    o.position.y += (want.y - o.position.y) * k
    o.position.z += (want.z - o.position.z) * k
    o.rotation.x += (want.r - o.rotation.x) * k
    // its records slide out once it's out (one after the other), back in before it goes back
    outT.current = out ? outT.current + dt : Math.max(0, Math.min(outT.current, 0.9) - dt * 3)
    slides.current.forEach((d, j) => {
      if (!d) return
      const f = smooth((outT.current - 0.35 - j * 0.12) / 0.5)
      const to = 0.6 + j * 0.26 + (over === j ? 0.05 : 0)
      const x = (S.sleeve / 2 - S.r + to * 2 * S.r) * f
      d.position.x += (x - d.position.x) * Math.min(1, dt * 12)
      d.visible = d.position.x > 1
    })
  })
  if (!art) return null
  const stop = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.stopPropagation()
  const discs = p.sides.length / 2
  return (
    <group ref={g} position={[0, C.floor, z]} rotation={[-C.lean, 0, 0]}>
      <group
        onClick={(e) => {
          stop(e)
          onPick()
        }}
        onPointerOver={(e) => {
          stop(e)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <Jacket p={p} art={art} />
      </group>
      {/* its records, behind the jacket, sliding out of its open edge (+x) when it's out */}
      {Array.from({ length: discs }, (_, j) => (
        <group key={j} ref={(d) => void (slides.current[j] = d)} position={[0, S.sleeve / 2, -S.sleeveT / 2 - 2 - j * (discThick(S) + 2)]} visible={false}>
          <group
            rotation={[Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              stop(e)
              setOver(j)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setOver((o) => (o === j ? null : o))
              document.body.style.cursor = ''
            }}
            onClick={(e) => {
              stop(e)
              if (pose !== 'out') return
              document.body.style.cursor = ''
              onPut(j)
            }}
          >
            <group position={[0, -discThick(S) / 2, 0]}>
              <Disc p={p} art={art} disc={j} />
            </group>
          </group>
        </group>
      ))}
    </group>
  )
}

export function Crate({ records, onPut, playing }: { records: Pressing[]; onPut: (p: Pressing, disc: number) => void; playing?: string }) {
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
  const b = useBrowse()
  const [over, setOver] = useState<number | null>(null)
  browseRefs.records = records
  const n = records.length
  const gap = Math.min(28, (C.in.d - 50) / Math.max(1, n - 1))
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (b.mode === 'none') openCrate(0)
  }
  return (
    <group ref={(o) => void (browseRefs.crate = o)}>
      <group onClick={open} onPointerOver={() => b.mode === 'none' && (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <mesh geometry={g.floor} material={m} position={[0, C.floor / 2, 0]} castShadow receiveShadow />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={g.end} material={mEnd} position={[s * (C.in.w / 2 + C.wall / 2), 0, 0]} castShadow receiveShadow />
        ))}
        <mesh geometry={g.back} material={m} position={[0, C.h / 2, -C.in.d / 2 - C.wall / 2]} castShadow receiveShadow />
        <mesh geometry={g.front} material={m} position={[0, C.front / 2, C.in.d / 2 + C.wall / 2]} castShadow receiveShadow />
      </group>
      {/* (where a record taken out is: the camera frames it) */}
      <object3D ref={(o) => void (browseRefs.out = o)} position={[0, OUT.y + LP.sleeve / 2, OUT.z]} />
      {records.map((p, i) => {
        const pose = b.mode === 'out' && b.i === i ? 'out' : b.mode !== 'none' && b.i === i ? 'up' : b.mode === 'none' && over === i ? 'hover' : 'rest'
        return (
          <group key={p.uri} onPointerOver={() => setOver(i)} onPointerOut={() => setOver((o) => (o === i ? null : o))}>
            <Record
              p={p}
              i={i}
              z={C.in.d / 2 - 30 - i * gap}
              pose={playing === p.uri && pose === 'rest' ? 'rest' : pose}
              onPick={() => (b.mode === 'none' ? openCrate(i) : b.mode === 'crate' && b.i === i ? takeOut(i) : openCrate(i))}
              onPut={(disc) => onPut(p, disc)}
            />
          </group>
        )
      })}
    </group>
  )
}
