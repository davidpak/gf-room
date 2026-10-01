import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { Vector3 } from 'three'
import { BrushJar, Easel, Palette, Stool, Tube } from '../art/Easel'
import { Throw } from '../art/Throw'
import { Crane, Hoop, Pencil, PencilTin, Sketchbook, Succulent, WaterCup, Watercolors } from '../art/Supplies'
import { PaperSheet } from '../art/plane/PaperSheet'
import { CANVAS, EASEL, HOOP, JAR, PAINTS, PAPER_COLORS, PENCILS, POT, SKETCHBOOK, STOOL, THROW, TUBE, WATERCOLOR } from '../art/spec'
import { LiveProp } from './Physical'
import { clickSpot, frameAround, useLook, type Spot } from './look'
import { onReset } from './reset'
import { SET } from './set'
import type { CarState } from './Car'
import { Static } from '../../lib/render/Static'

/**
 * The art corner on the Quad (../art): the art blanket on the lawn in the V's south end, the easel at its far end
 * facing out, the stool by it with the palette on it; on the blanket the sketchbook, the pencils, the watercolours,
 * the hoop, the cranes, the succulent, and four sheets of paper. At the benches' toy scale (0.24).
 *
 *   the easel    click it: the camera goes in square to the canvas, the paint box comes up, and you paint (../art
 *                painting: the same painting as its own page's, kept in this browser). Esc steps back. It and the
 *                stool stand fast (the car bumps off them; the painting's always there to paint)
 *   the things   loose, like the picnic's: the car shoves them, the hand carries them; the sketchbook's pages turn
 *   the paper    four sheets to fold into darts and throw (../art/plane/PaperSheet)
 *   R            all of it back as it was, the paper flat again
 */
const K = 0.24
const LAWN = 4
const A = SET.art
const cos = Math.cos(A.rot)
const sin = Math.sin(A.rot)
/** the corner's own frame (real mm, the blanket's middle at its origin) to the Quad's */
const world = (lx: number, ly: number, lz: number) => new Vector3(A.x + (lx * cos + lz * sin) * K, LAWN + ly * K, A.z + (-lx * sin + lz * cos) * K)
/** a thing out on the blanket at (lx, lz), turned by rot: where it sits on the Quad */
const on = (lx: number, lz: number, rot = 0) => {
  const p = world(lx, lz > -THROW.l / 2 && lz < THROW.l / 2 ? THROW.t + 4 + 3.8 : 0, lz) // (on the blanket's top, or the grass)
  return { x: p.x, y: p.y, z: p.z, rot: A.rot + rot }
}
/** where the easel stands (the corner's frame), and the canvas on it: its middle and which way it faces */
const EZ = -THROW.l / 2 - 260
const STOOL_AT = { x: 560, z: EZ + 120 }
const CANVAS_MID = (() => {
  const l = EASEL.lean
  const y = EASEL.tray.y + EASEL.tray.t / 2 + CANVAS.h / 2
  const z = EASEL.mast.d / 2 + CANVAS.d / 2 + 4
  return world(0, y * Math.cos(l) + z * Math.sin(l) - CANVAS.h * 0.32, EZ - y * Math.sin(l) + z * Math.cos(l)) // (low: the canvas up in the frame, the paint box under it)
})()
const CANVAS_FACES = new Vector3(Math.sin(A.rot) * Math.cos(EASEL.lean), Math.sin(EASEL.lean), Math.cos(A.rot) * Math.cos(EASEL.lean))

/** the corner's fixed things, as the car feels them (./QuadStage): the easel, the stool */
export const ART_OBSTACLES = [
  { kind: 'circle' as const, ...xz(world(0, 0, EZ - 150)), r: 360 * K },
  { kind: 'circle' as const, ...xz(world(STOOL_AT.x, 0, STOOL_AT.z)), r: STOOL.splay * K + 10 },
]
function xz(p: Vector3) {
  return { x: p.x, z: p.z }
}

/** a loose thing of the corner's: its model at the toy's scale, a simple body */
function Thing({ id, at, car, feelR, children, body }: { id: string; at: { x: number; y: number; z: number; rot: number }; car: { current: CarState }; feelR: number; children: ReactNode; body: ReactNode }) {
  return (
    <LiveProp id={`art${id}`} label="" set="art" at={at} car={car} lift={0} feelAlong={[0]} feelR={feelR}>
      <group scale={K}>{children}</group>
      {body}
    </LiveProp>
  )
}

export function QuadArt({ car }: { car: { current: CarState } }) {
  const look = useLook()
  const painting = look?.spot.key === 'easel'
  const spot = useMemo<Spot>(
    () => ({
      key: 'easel',
      items: [],
      frame: (pos, at, aspect) => frameAround(pos, at, aspect, CANVAS_MID, CANVAS.w * K * 1.3, CANVAS.h * K * 1.9, CANVAS_FACES),
      hint: 'pick a paint and a brush below · press and drag on the canvas to paint',
    }),
    [],
  )
  if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __art: { paint: () => clickSpot(spot) } }) // (for trying it from the console)
  const zoom = (e: ThreeEvent<MouseEvent>) => {
    if (painting) return
    e.stopPropagation()
    clickSpot(spot)
  }
  const pointer = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!painting) document.body.style.cursor = 'pointer'
  }
  // R: the paper flat again (the loose things go home on their own)
  const [round, setRound] = useState(0)
  useEffect(() => onReset(() => setRound((r) => r + 1)), [])

  const S = (r: number) => (r * K) / 2 // (a half-size, real mm to the toy's)
  const t = (lx: number, lz: number, rot = 0) => on(lx, lz, rot)
  return (
    <>
      {/* the blanket, and the easel and stool standing fast at its far end */}
      <group position={[A.x, LAWN, A.z]} rotation={[0, A.rot, 0]}>
        <group scale={K}>
          <Static>
            <Throw />
          </Static>
          <group position={[0, 0, EZ]} onClick={zoom} onPointerOver={pointer} onPointerOut={() => (document.body.style.cursor = '')}>
            <Easel paintable={painting} />
          </group>
          <group position={[STOOL_AT.x, 0, STOOL_AT.z]} rotation={[0, -0.5, 0]}>
            <Static>
              <Stool />
              <group position={[0, STOOL.h + 2, 0]} rotation={[0, 0.4, 0]}>
                <Palette />
              </group>
            </Static>
          </group>
        </group>
        <RigidBody type="fixed" colliders={false}>
          {/* (the blanket's top, for what's on it to lie on: it's drawn a little above the lawn; at its swell's highest, so nothing sinks into it. Deep, down into the ground, so the car can't shove a thing under it) */}
          <CuboidCollider args={[S(THROW.w), 20, S(THROW.l)]} position={[0, (THROW.t + 4 + 3.8) * K - 20, 0]} friction={0.9} />
          <CuboidCollider args={[EASEL.leg.spread * K, 820 * K, 330 * K]} position={[0, 820 * K, (EZ - 150) * K]} />
          <CylinderCollider args={[S(STOOL.h), STOOL.splay * K]} position={[STOOL_AT.x * K, S(STOOL.h), STOOL_AT.z * K]} />
        </RigidBody>
      </group>

      {/* the things on the blanket, loose */}
      <Thing car={car} id="jar" at={on(-460, EZ + 140)} feelR={S(JAR.r * 2) + 2} body={<CylinderCollider args={[S(JAR.h), JAR.r * K]} position={[0, S(JAR.h), 0]} mass={0.3} friction={0.8} />}>
        <BrushJar />
      </Thing>
      <Thing car={car} id="sketchbook" at={t(-250, 160, 0.12)} feelR={S(SKETCHBOOK.h)} body={<CuboidCollider args={[(SKETCHBOOK.w + SKETCHBOOK.ring) * K, S(8), S(SKETCHBOOK.h)]} position={[0, S(8), 0]} mass={0.3} friction={0.9} />}>
        <Sketchbook />
      </Thing>
      <Thing car={car} id="pencils" at={t(300, 300, -0.35)} feelR={S(PENCILS.tin.w)} body={<CuboidCollider args={[S(PENCILS.tin.w), S(PENCILS.tin.h), S(PENCILS.tin.d)]} position={[0, S(PENCILS.tin.h), 0]} mass={0.2} friction={0.8} />}>
        <PencilTin />
      </Thing>
      {[
        [300, 480, 0.5, 0, PENCILS.len],
        [420, 560, -0.9, 6, 130],
      ].map(([x, z, r, i, len], n) => (
        <Thing car={car} key={n} id={`pencil${n}`} at={t(x, z, r)} feelR={S(len)} body={<CuboidCollider args={[S(len), PENCILS.r * K, PENCILS.r * K]} position={[0, PENCILS.r * K, 0]} mass={0.02} friction={0.6} />}>
          <Pencil i={i} len={len} />
        </Thing>
      ))}
      <Thing car={car} id="watercolors" at={t(230, -260, 0.25)} feelR={S(WATERCOLOR.w * 2)} body={<CuboidCollider args={[WATERCOLOR.w * K, S(WATERCOLOR.h), S(WATERCOLOR.d)]} position={[S(WATERCOLOR.w), S(WATERCOLOR.h), 0]} mass={0.2} friction={0.8} />}>
        <Watercolors />
      </Thing>
      <Thing car={car} id="cup" at={t(460, -420)} feelR={34 * K + 2} body={<CylinderCollider args={[S(62), 34 * K]} position={[0, S(62), 0]} mass={0.15} friction={0.8} />}>
        <WaterCup />
      </Thing>
      {[5, 9, 2].map((i, n) => (
        <Thing car={car} key={i} id={`tube${n}`} at={t(-60 + n * 60, -420 + n * 30, 0.4 + n * 0.7)} feelR={S(TUBE.len)} body={<CuboidCollider args={[S(TUBE.len + TUBE.cap), TUBE.r * K, TUBE.r * K]} position={[0, TUBE.r * K, 0]} mass={0.03} friction={0.7} />}>
          <Tube color={PAINTS[i].hex} />
        </Thing>
      ))}
      <Thing car={car} id="hoop" at={t(-360, -330, 0.3)} feelR={HOOP.r * K + 4} body={<CylinderCollider args={[S(HOOP.h), (HOOP.r + HOOP.ring) * K]} position={[0, S(HOOP.h), 0]} mass={0.1} friction={0.8} />}>
        <Hoop />
      </Thing>
      {(
        [
          [-70, 590, 0.4, '#f6c1cf'],
          [130, 650, 2.2, '#a6dbb0'],
          [470, 60, -1.2, '#b9a0e2'],
        ] as const
      ).map(([x, z, r, c], n) => (
        <Thing car={car} key={n} id={`crane${n}`} at={t(x, z, r)} feelR={18} body={<CuboidCollider args={[55 * K, 30 * K, 40 * K]} position={[0, 30 * K, 0]} mass={0.01} friction={0.6} />}>
          <Crane color={c} />
        </Thing>
      ))}
      <Thing car={car} id="succulent" at={t(-480, 560)} feelR={POT.r * K + 4} body={<CylinderCollider args={[S(POT.h + 30), POT.r * K]} position={[0, S(POT.h + 30), 0]} mass={0.3} friction={0.8} />}>
        <Succulent />
      </Thing>

      {/* the paper, four sheets on the blanket */}
      {PAPER_COLORS.map((c, i) => {
        const p = world(60 + i * 4, THROW.t + 4 + 3.8 + 2 + i * 3, 430 - i * 3)
        return <PaperSheet key={i} reset={round} at={[p.x, p.y, p.z]} rot={A.rot + Math.sin(i * 2.1) * 0.08} color={c} k={K} />
      })}
    </>
  )
}
