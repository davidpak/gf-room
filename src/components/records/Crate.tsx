import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, ExtrudeGeometry, Path, RepeatWrapping, SRGBColorSpace, Shape, type Group, type Object3D } from 'three'
import { bruno } from '../quad/bruno'
import { useLook } from '../quad/look'
import { crateRefs, lookMoved, openCrate, takeOut, useBrowse } from './browse'
import type { CrateId } from './library'
import { useShelf } from './shelf'
import { Disc, Jacket, discThick, useArt } from './Record'
import { LP, sizeOf, type Pressing } from './vinyl'

/**
 * The crate her records live in: pine, open-topped, low at the front so the covers show, a hand-hole cut through each
 * end. Our own (no one crate it copies), sized round a 12" jacket the way record crates are: [LP] the jacket's 314 mm
 * across, a finger's room each side; 200 tall, so the records stand well out of it.
 *
 * The records stand in it covers forward, leaning back a little, front to back. Going through it (./browse): the
 * record up rises clear of the crate; taken out, it comes up in front of the crate, upright, its record (both, for a
 * double album) sliding out of its open edge, fanned; a click on one (`onTake`) takes it out for real (./Loose).
 * Its label's chalked on a slate card on its front board (painted into the board: no card stuck on).
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

/** the front board, its grain, and the slate card chalked with the crate's name, painted into it */
function frontArt(label: string, empty: string) {
  const W = 1024
  const H = Math.round((W * C.front) / C.in.w)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.drawImage(pine().image as HTMLCanvasElement, 0, 0, W, H)
  // the slate, a little crooked
  g.save()
  g.translate(W / 2, H / 2)
  g.rotate(-0.025)
  const cw = W * 0.5
  const ch = H * 0.56
  g.fillStyle = '#7a5530'
  g.beginPath()
  g.roundRect(-cw / 2 - 10, -ch / 2 - 10, cw + 20, ch + 20, 14)
  g.fill()
  g.fillStyle = '#2f3a36'
  g.beginPath()
  g.roundRect(-cw / 2, -ch / 2, cw, ch, 8)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i < 40; i++) g.fillRect(-cw / 2 + ((i * 97) % cw), -ch / 2 + ((i * 53) % ch), 30, 2)
  g.fillStyle = '#f4efe6'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `700 ${ch * 0.5}px 'Gaegu', 'Nunito', cursive`
  g.fillText(label, 0, empty ? -ch * 0.12 : 0, cw * 0.9)
  if (empty) {
    g.font = `400 ${ch * 0.2}px 'Gaegu', 'Nunito', cursive`
    g.globalAlpha = 0.8
    g.fillText(empty, 0, ch * 0.28, cw * 0.9)
  }
  g.restore()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

function Record({ p, z, pose, onPick, onTake }: { p: Pressing; z: number; pose: 'rest' | 'hover' | 'up' | 'out'; onPick: () => void; onTake: (disc: number, at: Object3D) => void }) {
  const art = useArt(p)
  const S = sizeOf(p)
  const g = useRef<Group>(null)
  const slides = useRef<(Group | null)[]>([])
  const outT = useRef(0)
  const [over, setOver] = useState<number | null>(null)
  // (its records only made while it's out, or going back in: a crate full of albums costs only their jackets)
  const [discsOn, setDiscsOn] = useState(false)
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
    if (out !== discsOn && (out || outT.current === 0)) setDiscsOn(out)
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
      {discsOn &&
        Array.from({ length: discs }, (_, j) => (
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
                // (its pose now: the loose record starts just where this one is)
                const at = e.eventObject.children[0]
                if (at) onTake(j, at)
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

/**
 * A crate of records: `id` which (./library), `label` its name on its card. `onTake` a record clicked out of its
 * jacket (the pressing, which disc, the disc's place in the world). `onCard`: its card clicked (the Dig crate: what
 * to look for); `empty` written small on the card while it's empty.
 */
export function Crate({ id, label, onTake, onCard, empty = '' }: { id: CrateId; label: string; onTake: (p: Pressing, disc: number, at: Object3D) => void; onCard?: () => void; empty?: string }) {
  const records = useShelf().crates[id] ?? []
  const m = useMemo(() => bruno({ map: pine(), shade: C.colors.pineShade }), [])
  const mEnd = useMemo(() => {
    const t = pine()
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(1 / 300, 1 / 300)
    return bruno({ map: t, shade: C.colors.pineShade })
  }, [])
  const showEmpty = records.length ? '' : empty
  const mFront = useMemo(() => {
    const f = bruno({ map: frontArt(label, showEmpty), shade: C.colors.pineShade })
    return [m, m, m, m, f, m]
  }, [label, showEmpty, m])
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
  const look = useLook()
  useEffect(() => lookMoved(), [look])
  const mine = b.crate === id && b.mode !== 'none'
  const [over, setOver] = useState<number | null>(null)
  const refs = useRef({ crate: null as Object3D | null, out: null as Object3D | null })
  useEffect(() => {
    crateRefs.set(id, refs.current)
    return () => void crateRefs.delete(id)
  }, [id])
  const n = records.length
  const gap = Math.min(28, (C.in.d - 50) / Math.max(1, n - 1))
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!records.length) return onCard?.()
    if (!mine) openCrate(id)
  }
  return (
    <group ref={(o) => void (refs.current.crate = o)}>
      <group onClick={open} onPointerOver={(e) => (e.stopPropagation(), !mine && (document.body.style.cursor = 'pointer'))} onPointerOut={() => (document.body.style.cursor = '')}>
        <mesh geometry={g.floor} material={m} position={[0, C.floor / 2, 0]} castShadow receiveShadow />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={g.end} material={mEnd} position={[s * (C.in.w / 2 + C.wall / 2), 0, 0]} castShadow receiveShadow />
        ))}
        <mesh geometry={g.back} material={m} position={[0, C.h / 2, -C.in.d / 2 - C.wall / 2]} castShadow receiveShadow />
      </group>
      {/* the front board, its card: the crate's name (the Dig crate: click it to say what to look for) */}
      <mesh
        geometry={g.front}
        material={mFront}
        position={[0, C.front / 2, C.in.d / 2 + C.wall / 2]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          if (onCard) onCard()
          else if (records.length && !mine) openCrate(id)
        }}
        onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      {/* (where a record taken out is: the camera frames it) */}
      <object3D ref={(o) => void (refs.current.out = o)} position={[0, OUT.y + LP.sleeve / 2, OUT.z]} />
      {records.map((p, i) => {
        const pose = mine && b.mode === 'out' && b.i === i ? 'out' : mine && b.i === i ? 'up' : !mine && over === i ? 'hover' : 'rest'
        return (
          <group key={p.uri} onPointerOver={() => setOver(i)} onPointerOut={() => setOver((o) => (o === i ? null : o))}>
            <Record
              p={p}
              z={C.in.d / 2 - 30 - i * gap}
              pose={pose}
              onPick={() => (!mine ? openCrate(id, i) : b.mode === 'crate' && b.i === i ? takeOut(i) : openCrate(id, i))}
              onTake={(disc, at) => onTake(p, disc, at)}
            />
          </group>
        )
      })}
    </group>
  )
}
