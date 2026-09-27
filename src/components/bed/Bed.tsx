import { Suspense, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { ExtrudeGeometry, MeshStandardMaterial, Path, type Group } from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createMapleMaterial } from '../../lib/mapleMaterial'
import { roundedRect } from '../../lib/shapes'
import { stepSpring, type Spring } from '../../lib/spring'
import { BED, UNIT } from './spec'
import { BedSheet } from './BedSheet'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { FollowCollider } from '../../lib/physics/FollowCollider'
import { Pillow, PILLOW } from './Pillow'
import { Blanket } from './Blanket'

/**
 * Rina's bed: black square-tube platform frame, full mattress, and a maple
 * 2 × 2 drawer unit under the foot half of the room-facing side.
 *   drawers  hover to peek, click to slide open on a spring, click again to close
 *   pillows  two white pillows, real physics objects: grab, carry and drop them (./Pillow.tsx)
 *   blanket  thick blue fleece blanket over the foot end, head end turned down; click for a soft divot (./Blanket.tsx)
 *   cover    the sheet-covered mattress; click it for a little divot with creases (./BedSheet.tsx)
 */
const MAT = {
  frame: new MeshStandardMaterial({ color: '#3d3a5e', roughness: 0.45, metalness: 0.35 }), // deep dusky indigo, not black
  drawerFront: createMapleMaterial('#f4c48c', 0.4, 'xy'),
  carcass: new MeshStandardMaterial({ color: '#f0bb82', roughness: 0.7 }),
  drawerBox: new MeshStandardMaterial({ color: '#e8b27a', roughness: 0.75 }),
  liner: new MeshStandardMaterial({ color: '#4b2b44', roughness: 0.9 }),
}
const shadow = { castShadow: true, receiveShadow: true }

/**
 * Bevels: every hard edge is rounded, big enough to catch a thin line of light from across the
 * room (a 2-3 mm rounding vanishes at 2 to 8 m), never more than ~40% of a part's smallest side.
 *   tube     the 38 mm square steel tube
 *   panel    the 12 mm carcass panels
 *   divider  the 6 mm divider cross (recessed, only seen in the gaps)
 *   rail     the black base rail (25 deep)
 *   foot     the little feet (18 tall)
 *   box      the drawer boxes' 12 mm sides and bottom
 *   front    the drawer fronts' bevel (an extrusion, see useDrawerFront)
 * CREASE: extrusions come out faceted; smoothing normals between faces less than this far apart
 * (radians) makes a bevel shade as one soft curve while the flat faces stay flat.
 */
const R = { tube: 8, panel: 4.5, divider: 2, rail: 8, foot: 5, box: 4 }
const FRONT_BEVEL = 4
const CREASE = 0.5

const pointer = {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
  },
  onPointerOut: () => (document.body.style.cursor = 'auto'),
}

/**
 * `mirrored` flips only the drawer unit to the other long side (the room needs that). We never
 * mirror the whole bed with a negative scale: physics bodies can't live under one.
 * Needs a <Physics> ancestor (colliders + the pillows are physics objects).
 */
export function Bed({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <group>
      <Frame />
      <group scale={[1, 1, mirrored ? -1 : 1]}>
        <DrawerUnit />
      </group>
      <Suspense fallback={null}>
        <BedSheet />
      </Suspense>
      <BedColliders />
      <Pillows />
      {/* the blue fleece blanket: modelled, lying over the foot end with the head end turned down */}
      <Suspense fallback={null}>
        <Blanket />
      </Suspense>
    </group>
  )
}

/** Solid shapes for physics: the covered mattress and the frame block underneath it. */
function BedColliders() {
  const { mattress, deck } = BED
  const fr = BED.frame
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[mattress.len / 2 + 5, mattress.h / 2 + 5, mattress.w / 2 + 5]} position={[0, deck + mattress.h / 2, 0]} friction={1} />
      <CuboidCollider args={[fr.len / 2, deck / 2, fr.w / 2]} position={[0, deck / 2, 0]} friction={0.8} />
    </RigidBody>
  )
}

/**
 * Two pillows side by side at the head (+X), long sides across the bed, each case's open end
 * facing outward. A touch askew and leaning back toward the head, as if propped on the window.
 */
function Pillows() {
  const coverTop = BED.deck + BED.mattress.h + 5
  const x = BED.mattress.len / 2 - PILLOW.w / 2 - 35
  const z = PILLOW.len / 2 + 5 // side by side; physics nudges them together as they settle
  // dropped from just above the bed: they fall, land with a soft thump and settle
  return (
    <>
      <Pillow seed={1.3} position={[x, coverTop + 60, -z]} rotation={[0.03, Math.PI / 2 + 0.05, 0]} />
      <Pillow seed={4.7} position={[x - 15, coverTop + 110, z]} rotation={[-0.02, -Math.PI / 2 - 0.04, 0.02]} />
    </>
  )
}

/** Legs at the corners and middle, rails around the top, a centre rail under the mattress. */
function Frame() {
  const t = BED.tube
  const { len, w } = BED.frame
  const deck = BED.deck
  const tube = (args: [number, number, number], pos: [number, number, number], key: string) => (
    <RoundedBox key={key} args={args} radius={R.tube} smoothness={3} position={pos} material={MAT.frame} {...shadow} />
  )
  const legXs = [-(len / 2 - t / 2), 0, len / 2 - t / 2]
  const legZs = [-(w / 2 - t / 2), w / 2 - t / 2]
  return (
    <group>
      {legXs.flatMap((x) => legZs.map((z) => tube([t, deck, t], [x, deck / 2, z], `leg${x}${z}`)))}
      {tube([t, deck, t], [0, deck / 2, 0], 'legCentre')}
      {legZs.map((z) => tube([len, t, t], [0, deck - t / 2, z], `side${z}`))}
      {[-1, 1].map((s) => tube([t, t, w - 2 * t], [s * (len / 2 - t / 2), deck - t / 2, 0], `end${s}`))}
      {tube([len - 2 * t, t, t], [0, deck - t / 2, 0], 'centreRail')}
    </group>
  )
}

/**
 * Maple carcass with a black base rail, a divider cross, and four drawers.
 *
 * The drawer fronts overlap the carcass edges by the gap (6 mm) with their faces in the same
 * plane. That only works because the two bevels (FRONT_BEVEL + R.panel) add up to more than
 * the overlap: the flat faces never overlap, the rounded edges just cross in a clean crease.
 */
function DrawerUnit() {
  const { x0, width, cx, top, bottom, drawerW, drawerH, front, g } = UNIT
  const depth = BED.unit.depth
  const railY = BED.unit.railGap
  const panel = 12
  const back = front - depth
  const h = top - railY
  const cols = [0, 1].map((i) => x0 + g + drawerW / 2 + i * (drawerW + g))
  const rows = [0, 1].map((j) => bottom + g + drawerH / 2 + j * (drawerH + g))
  // The base rail's hidden top stops 4 mm inside the bottom panel and its ends 6 mm inside the
  // side panels, so none of its faces lies in the plane of a carcass face (no z-fighting). The
  // part you see, the recessed kick below the bottom panel, is unchanged.
  const railH = BED.unit.bottomRail - 4
  return (
    <group>
      {/* carcass */}
      <RoundedBox args={[width, panel, depth]} radius={R.panel} position={[cx, top - panel / 2, front - depth / 2]} material={MAT.carcass} {...shadow} />
      <RoundedBox args={[width, panel, depth]} radius={R.panel} position={[cx, bottom - panel / 2, front - depth / 2]} material={MAT.carcass} {...shadow} />
      {[x0 + panel / 2, x0 + width - panel / 2].map((x) => (
        <RoundedBox key={x} args={[panel, h, depth]} radius={R.panel} position={[x, railY + h / 2, front - depth / 2]} material={MAT.carcass} {...shadow} />
      ))}
      <RoundedBox args={[width, h, panel]} radius={R.panel} position={[cx, railY + h / 2, back + panel / 2]} material={MAT.carcass} {...shadow} />
      {/* divider cross between the four drawers */}
      <RoundedBox args={[g, top - bottom, depth - 20]} radius={R.divider} position={[cx, (top + bottom) / 2, front - depth / 2 - 10]} material={MAT.carcass} {...shadow} />
      <RoundedBox args={[width - 2 * panel, g, depth - 20]} radius={R.divider} position={[cx, (top + bottom) / 2, front - depth / 2 - 10]} material={MAT.carcass} {...shadow} />
      {/* black base rail (a recessed kick, so it never fights the drawer fronts) and little feet */}
      <RoundedBox args={[width - panel, railH, 25]} radius={R.rail} position={[cx, railY + railH / 2, front - 25]} material={MAT.frame} {...shadow} />
      {[x0 + 20, x0 + width - 20].flatMap((x) =>
        [front - 20, back + 20].map((z) => (
          <RoundedBox key={`${x}${z}`} args={[25, railY, 25]} radius={R.foot} position={[x, railY / 2, z]} material={MAT.frame} {...shadow} />
        )),
      )}
      {cols.flatMap((x) => rows.map((y) => <Drawer key={`${x}${y}`} x={x} y={y} z={front} />))}
    </group>
  )
}

/**
 * Front panel with a real finger-pull cutout (a hole in the shape, dark liner behind), rounded
 * all round by FRONT_BEVEL. The bevel grows the outline, so the shape is drawn FRONT_BEVEL
 * smaller: the finished front is exactly w by h by BED.drawer.front, as before.
 *
 * The bevel rounds the pull's rim too, and that narrows its throat by the bevel on each side.
 * So the smile is cut that much bigger at the face (lower edge lower, upper edge higher, ends
 * further out): the throat you look through stays `thick` tall in the middle, and the rim reads
 * as a soft rounded scoop.
 */
function useDrawerFront(w: number, h: number) {
  return useMemo(() => {
    const bevel = FRONT_BEVEL
    const s = roundedRect(w - 2 * bevel, h - 2 * bevel, 3)
    const { w: pw, dip, thick, fromTop } = BED.pull
    const y = h / 2 - fromTop
    const end = pw / 2 + bevel
    const lower = dip + bevel // how far each edge dips at the centre
    const upper = dip - thick - bevel
    const hole = new Path()
    hole.moveTo(-end, y)
    hole.quadraticCurveTo(0, y - 2 * lower, end, y) // lower edge of the smile
    hole.quadraticCurveTo(0, y - 2 * upper, -end, y) // upper edge
    s.holes.push(hole)
    const g = new ExtrudeGeometry(s, {
      depth: BED.drawer.front - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 16,
    })
    toCreasedNormals(g, CREASE)
    return g
  }, [w, h])
}

function Drawer({ x, y, z }: { x: number; y: number; z: number }) {
  const { drawerW: w, drawerH: h } = UNIT
  const { front: ft, box, travel, peek } = BED.drawer
  const group = useRef<Group>(null)
  const solid = useRef<Group>(null) // the drawer's collider follows this
  const slide = useRef<Spring>({ x: 0, v: 0 })
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const frontGeo = useDrawerFront(w, h)
  const depth = BED.unit.depth - 80
  const bw = w - 40
  const bh = h - 36
  const pullY = h / 2 - BED.pull.fromTop - BED.pull.dip * 0.6

  useFrame((_, dt) => {
    if (!group.current) return
    const target = open ? travel : hover ? peek : 0
    group.current.position.z = z + stepSpring(slide.current, target, dt, 120, 16)
  })

  return (
    <group
      ref={group}
      position={[x, y, z]}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((o) => !o)
      }}
      onPointerOver={(e) => {
        pointer.onPointerOver(e)
        setHover(true)
      }}
      onPointerOut={() => {
        pointer.onPointerOut()
        setHover(false)
      }}
    >
      <group ref={solid} position={[0, 0, -(ft + depth) / 2]} />
      <FollowCollider target={solid} half={[w / 2, h / 2, (ft + depth) / 2]} />
      <mesh geometry={frontGeo} material={MAT.drawerFront} position={[0, 0, -ft + FRONT_BEVEL]} {...shadow} />
      {/* dark liner visible through the finger pull */}
      <mesh position={[0, pullY, -ft - 1]} material={MAT.liner}>
        <planeGeometry args={[BED.pull.w + 30, 40]} />
      </mesh>
      {/* the drawer box behind the front */}
      <group position={[0, -h / 2 + 18 + bh / 2, -ft - depth / 2]}>
        <RoundedBox args={[bw, box, depth]} radius={R.box} position={[0, -bh / 2 + box / 2, 0]} material={MAT.drawerBox} {...shadow} />
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[box, bh, depth]} radius={R.box} position={[s * (bw / 2 - box / 2), 0, 0]} material={MAT.drawerBox} {...shadow} />
        ))}
        <RoundedBox args={[bw, bh, box]} radius={R.box} position={[0, 0, -depth / 2 + box / 2]} material={MAT.drawerBox} {...shadow} />
      </group>
    </group>
  )
}
