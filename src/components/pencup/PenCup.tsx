import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CylinderCollider } from '@react-three/rapier'
import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, LatheGeometry, MeshStandardMaterial, Quaternion, TorusGeometry, TubeGeometry, Vector2, Vector3, type BufferGeometry, type Group, type Matrix4 } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { Prompts } from '../prompt/Prompts'
import { PENCUP, curlerPaths, lean, type Item, type Kind } from './spec'

/**
 * Rina's red pen cup (./spec): the fluted cup, and in it, leaning out to rest on its rim, three gel pens (two
 * black, one clear), two yellow highlighters and a green one with their caps up, a pencil point down; and hung on
 * its front, her black eyelash curler, its clamp hooked in over the rim, its handles down the outside.
 *
 *   click one     it comes up a little, as if drawn out (the curler off its rim), and drops back, bouncing once
 *
 * Each thing is built standing on its own foot (y up from its lower end) and stood in the cup by `lean()`.
 * Frame: ./spec (the cup's footprint middle, its bottom on y 0, the front toward +z).
 */
const P = PENCUP
const C = PENCUP.cup
const K = PENCUP.colors
const UP = new Vector3(0, 1, 0)

// ---- the shapes (made once)
const v = (r: number, y: number) => new Vector2(r, y)
/** points round a corner from angle a0 to a1 (radians, in (r, y)) */
const arc = (cr: number, cy: number, rad: number, a0: number, a1: number, n = 5) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return v(cr + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  })
const outerR = (y: number) => C.rFoot + ((C.rTop - C.rFoot) * y) / C.h
/** the cup: a lathe (foot, the tapered side in short steps, the rim rounded over, the inside down to the floor),
 *  then fluted: its outside pushed in between the ribs (round ribs, sharp grooves, as pressed glazeware has) */
function cupGeometry() {
  const pts: Vector2[] = [v(0, 0), ...arc(C.rFoot - C.foot, C.foot, C.foot, -Math.PI / 2, 0)]
  for (let y = C.foot + 4; y < C.h - C.rim; y += 4) pts.push(v(outerR(y), y))
  const rr = C.wall / 2 // (the rim's round: half the wall, so it's a full roll)
  pts.push(...arc(C.rTop - rr, C.h - rr, rr, 0, Math.PI, 6))
  for (let y = C.h - 2 * rr - 4; y > C.floor + 3; y -= 6) pts.push(v(outerR(y) - C.wall, y))
  pts.push(...arc(outerR(C.floor) - C.wall - 3, C.floor + 3, 3, Math.PI, 1.5 * Math.PI, 4), v(0, C.floor))
  let g: BufferGeometry = new LatheGeometry(pts, C.ribs.n * 6)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const pos = g.attributes.position
  const { n, depth, top, bottom } = C.ribs
  const ease = (x: number) => Math.min(1, Math.max(0, x)) ** 0.5
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    if (r < outerR(y) - 0.3 || y < C.foot) continue // (the outside only)
    const fade = ease((y - C.foot) / bottom) * ease((C.h - top - y) / 3)
    const k = 1 - (depth * fade * (1 - Math.abs(Math.sin((n * Math.atan2(z, x)) / 2)))) / r
    pos.setXYZ(i, x * k, y, z * k)
  }
  g.computeVertexNormals()
  return g
}
const lathe = (pts: [number, number][], seg = 20) => new LatheGeometry(pts.map(([r, y]) => v(r, y)), seg)
/** a hexagonal pencil's facets, flat */
const hex = (pts: [number, number][]) => {
  const g = lathe(pts, 6).toNonIndexed()
  g.computeVertexNormals()
  return g
}
/** a tube of radius r through points (rounded through them), its ends capped with balls */
function rod(pts: [number, number, number][], r: number) {
  const curve = new CatmullRomCurve3(pts.map((q) => new Vector3(...q)), false, 'centripetal')
  return [new TubeGeometry(curve, pts.length * 10, r, 10), ...[pts[0], pts[pts.length - 1]].map((q) => new LatheGeometry(arc(0, 0, r, -Math.PI / 2, Math.PI / 2, 4), 10).translate(...q))]
}
/** the curler (its frame: ./spec PENCUP.curler): the loops, the handles, the hinge, the arms bent over, the clamp and its pad */
function curlerParts(): Part[] {
  const Q = P.curler
  const L = curlerPaths()
  const t = Q.tube
  return [
    ...[-1, 1].map((sx) => ({ g: new TorusGeometry(Q.loop.r, t, 10, 28).translate(sx * Q.loop.x, Q.loop.y, 0), m: 'curler' })),
    ...[...L.handles, ...L.arms].flatMap((line) => rod(line, t).map((g) => ({ g, m: 'curler' }))),
    { g: new CylinderGeometry(4.2, 4.2, 2 * t + 2, 16).rotateX(Math.PI / 2).translate(0, Q.hinge, 0), m: 'curler' },
    ...rod(L.clamp, t).map((g) => ({ g, m: 'curler' })),
    ...rod(L.pad, t + 0.6).map((g) => ({ g, m: 'pad' })),
  ]
}
type Part = { g: BufferGeometry; m: string; at?: [number, number, number] }
function build(): Record<Kind, Part[]> {
  const pen = P.pen
  const hl = P.highlighter
  const L = P.pencil.len
  const clip = (w: number, len: number, t: number) => new BoxGeometry(w, len, t)
  return {
    // a G2: the metal point, the cone, the rubber grip, the barrel, its shoulder and the plunger, the clip outward
    pen: [
      { g: lathe([[0, 0], [0.7, 0.3], [0.9, 2.5], [1.5, 2.5]]), m: 'metal' },
      { g: lathe([[1.5, 2.5], [4.6, 12], [pen.grip, 14], [pen.grip, 44], [pen.r, 46], [0, 46]]), m: 'grip' },
      { g: lathe([[pen.r, 46], [pen.r, 126], [pen.r - 0.8, 129.5], [pen.plunger + 0.6, 130.5], [0, 130.5]]), m: 'barrel' },
      { g: lathe([[0, 130], [pen.plunger, 130], [pen.plunger, pen.len - 1], [pen.plunger - 1, pen.len], [0, pen.len]]), m: 'barrel' },
      { g: clip(pen.clip.w, pen.clip.len, pen.clip.t), m: 'metal', at: [0, 128 - pen.clip.len / 2, pen.r + pen.clip.t / 2 + 0.3] },
    ],
    // point down: the chisel nib, the body, the cap over its top with the clip
    highlighter: [
      { g: lathe([[0, 0], [2.6, 0.5], [3.2, 6], [4.4, 6]]), m: 'cap' },
      { g: lathe([[4.4, 6], [hl.r, 15], [hl.r, hl.len - hl.capLen + 2], [0, hl.len - hl.capLen + 2]]), m: 'body' },
      { g: lathe([[0, hl.len - hl.capLen], [hl.cap, hl.len - hl.capLen], [hl.cap, hl.len - 4], [hl.cap - 2, hl.len - 0.6], [hl.cap - 4, hl.len], [0, hl.len]]), m: 'cap' },
      { g: clip(4.5, hl.capLen - 8, 2.4), m: 'cap', at: [0, hl.len - hl.capLen / 2 - 2, hl.cap + 1.2] },
    ],
    // point down: the lead, the sharpened wood, the yellow facets, the ferrule and the eraser
    pencil: [
      { g: lathe([[0, 0], [1, 3.5], [0, 3.5]], 6), m: 'lead' },
      { g: hex([[1, 3.5], [P.pencil.r, 20], [0, 20]]), m: 'wood' },
      { g: hex([[P.pencil.r, 20], [P.pencil.r, L - 16], [0, L - 16]]), m: 'pencil' },
      { g: lathe([[0, L - 16], [P.pencil.r + 0.2, L - 16], [P.pencil.r + 0.2, L - 7], [0, L - 7]]), m: 'metal' },
      { g: lathe([[0, L - 7], [P.pencil.r - 0.3, L - 7], [P.pencil.r - 0.3, L - 2], [P.pencil.r - 2, L], [0, L]]), m: 'eraser' },
    ],
  }
}
let SHAPES: { cup: BufferGeometry; parts: Record<Kind, Part[]>; curler: Part[] } | null = null
const shapes = () => (SHAPES ??= { cup: cupGeometry(), parts: build(), curler: curlerParts() })

/** where each thing stands: its foot and its turn (its own y up its length, its x out toward the rim at spin 0) */
const STAND = P.items.map((it) => {
  const l = lean(it)
  const a = (it.toward * Math.PI) / 180
  const q = new Quaternion().setFromUnitVectors(UP, new Vector3(...l.axis)).multiply(new Quaternion().setFromAxisAngle(UP, -a + (it.spin * Math.PI) / 180 + Math.PI / 2))
  return { p: l.foot, q: [q.x, q.y, q.z, q.w] as [number, number, number, number] }
})
// (+ pi/2: the parts are built with their clip toward +z; that turn faces it out along +x first)

/** a thing's colours by name */
function palette(it: Item) {
  const black = it.color === 'black'
  const green = it.color === 'green'
  return {
    metal: K.metal,
    lead: K.lead,
    wood: K.wood,
    pencil: K.pencil,
    eraser: K.eraser,
    grip: black ? K.penGrip : K.penBlack,
    barrel: black ? K.penBlack : K.penClear,
    body: green ? K.hlGreen : K.hlYellow,
    cap: green ? K.hlGreenCap : K.hlYellowCap,
  } as Record<string, string>
}

type Lift = { mode: 'rest' | 'up' | 'fall'; t: number; s: number; v: number }
const RISE = 0.32 // s, drawn up
const HOLD = 0.12 // s, held there a moment
const G = 9810 * 0.7 // mm/s² (a touch slow: a toy's drop)

/** the cup and all in it; click a thing to lift it and let it drop back */
export function PenCupModel() {
  const s = shapes()
  const mats = useMemo(() => {
    const cache = new Map<string, MeshStandardMaterial>()
    const get = (hex: string, rough = 0.6) => {
      const key = `${hex}${rough}`
      if (!cache.has(key)) cache.set(key, new MeshStandardMaterial({ color: hex, roughness: rough }))
      return cache.get(key)!
    }
    return {
      cup: get(K.cup, 0.35),
      items: P.items.map((it) => Object.fromEntries(Object.entries(palette(it)).map(([k, c]) => [k, get(c)]))),
      curler: { curler: get(K.curler, 0.45), pad: get(K.pad, 0.8) } as Record<string, MeshStandardMaterial>,
    }
  }, [])
  // (one for each thing in it, and the curler last)
  const lifts = useRef<Lift[]>([...P.items, null].map(() => ({ mode: 'rest', t: 0, s: 0, v: 0 })))
  const refs = useRef<(Group | null)[]>([])
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30)
    lifts.current.forEach((L, i) => {
      if (L.mode === 'rest') return
      L.t += d
      if (L.mode === 'up') {
        L.s = P.lift * (1 - (1 - Math.min(1, L.t / RISE)) ** 3)
        if (L.t > RISE + HOLD) Object.assign(L, { mode: 'fall', v: 0 })
      } else {
        L.v -= G * d
        L.s += L.v * d
        if (L.s <= 0) {
          L.s = 0
          L.v = -L.v * 0.3 // (it knocks the floor and hops a little)
          if (L.v < 80) Object.assign(L, { mode: 'rest', v: 0 })
        }
      }
      const g = refs.current[i]
      if (g) g.position.y = L.s
    })
  })
  const click = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const L = lifts.current[i]
    if (L.mode === 'up') return
    Object.assign(L, { mode: 'up', t: 0 })
  }
  return (
    <group>
      <mesh geometry={s.cup} material={mats.cup} castShadow receiveShadow />
      {P.items.map((it, i) => (
        <group key={i} position={STAND[i].p} quaternion={STAND[i].q}>
          <group ref={(g) => void (refs.current[i] = g)} onClick={click(i)}>
            {s.parts[it.kind].map((part, j) => (
              <mesh key={j} geometry={part.g} material={mats.items[i][part.m]} position={part.at} castShadow receiveShadow />
            ))}
          </group>
        </group>
      ))}
      <group position={[P.curler.x, P.curler.y, P.curler.z]}>
        <group ref={(g) => void (refs.current[P.items.length] = g)} onClick={click(P.items.length)}>
          {s.curler.map((part, j) => (
            <mesh key={j} geometry={part.g} material={mats.curler[part.m]} castShadow receiveShadow />
          ))}
        </group>
      </group>
    </group>
  )
}

const ITEM = groups(GROUP.item, 0xffff)

/** the pen cup on the desk: to pick up, turn, put back ("Return pen cup"), and to take a pen up out of */
export function LivePenCup({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const perch = usePerch({
    key: 'pencup',
    label: 'Return pen cup',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0,
    away: 150,
    lift: C.h + 90,
  })
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <PenCupModel />
        </group>
        <CylinderCollider args={[C.h / 2, (C.rTop + C.rFoot) / 2]} position={[0, C.h / 2, 0]} mass={P.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
