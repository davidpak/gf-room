import { createRef, useEffect, useMemo, useState, type ReactNode } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, HeightfieldCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Quaternion, Vector3 } from 'three'
import { BrushJar, Easel, Palette, Stool, Tube } from '../art/Easel'
import { Throw, throwTop } from '../art/Throw'
import { Crane, Hoop, Pencil, PencilTin, Sketchbook, Succulent, WaterCup, Watercolors } from '../art/Supplies'
import { PaperSheet } from '../art/plane/PaperSheet'
import { H as PAPER_H, W as PAPER_W } from '../art/plane/paper'
import { CANVAS, EASEL, HOOP, JAR, PAINTS, PALETTE, PAPER_COLORS, PENCILS, POT, SKETCHBOOK, STOOL, THROW, TUBE, WATERCOLOR } from '../art/spec'
import { LiveProp, liveBody } from './Physical'
import { clickSpot, frameAround, getLook, lookBack, useLook, type Spot } from './look'
import { onReset } from './reset'
import { SET } from './set'
import type { CarState } from './Car'
import { Static } from '../../lib/render/Static'

/**
 * The art corner on the Quad (../art): the art blanket on the open lawn between the picnic and the V's west walk, the
 * easel at its far end facing out, the stool by it with the palette on it; on the blanket the sketchbook, the pencils,
 * the watercolours, the hoop, the cranes, the succulent, and four sheets of paper. At the benches' toy scale (0.24).
 *
 *   the easel    click it: the camera goes in square to the canvas (wherever the easel's standing now), the paint box
 *                comes up, and you paint (../art painting: the same painting as its own page's, kept in this
 *                browser). Esc steps back
 *   the things   all of it loose, the easel and the stool too, like the picnic's: the car shoves them, the hand
 *                carries them; the sketchbook's pages turn
 *   the paper    four sheets: click one and the camera goes down onto it, its folds dashed on it; fold it into a dart
 *                (../art/plane/PaperSheet), and pick it up and throw it from the car's view
 *   R            all of it back as it was, the paper flat again
 */
const K = 0.24
const LAWN = 4
const A = SET.art
const cos = Math.cos(A.rot)
const sin = Math.sin(A.rot)
/** the corner's own frame (real mm, the blanket's middle at its origin) to the Quad's */
const world = (lx: number, ly: number, lz: number) => new Vector3(A.x + (lx * cos + lz * sin) * K, LAWN + ly * K, A.z + (-lx * sin + lz * cos) * K)
const onCloth = (lx: number, lz: number) => Math.abs(lx) < THROW.w / 2 && Math.abs(lz) < THROW.l / 2
/** the cloth's highest within r of (lx, lz) (so what's set down there starts clear of it, never in it: under the
 *  cloth's top it'd be pushed on down through it) */
const clothUnder = (lx: number, lz: number, rx: number, rz = rx) => {
  let h = 0
  for (let i = -4; i <= 4; i++)
    for (let j = -4; j <= 4; j++) {
      const x = lx + (i / 4) * rx
      const z = lz + (j / 4) * rz
      if (onCloth(x, z)) h = Math.max(h, throwTop(x, z))
    }
  return h
}
/** a thing out on the blanket at (lx, lz), turned by rot, about r across: where it's set on the Quad (on the cloth,
 *  clear of it, or the grass) */
const on = (lx: number, lz: number, rot = 0, up = 0, r = 60) => {
  const p = world(lx, clothUnder(lx, lz, r) + (onCloth(lx, lz) ? 0.6 : 0) + up, lz)
  return { x: p.x, y: p.y, z: p.z, rot: A.rot + rot }
}
/** where the easel stands (the corner's frame), the stool by it */
const EZ = -THROW.l / 2 - 260
const STOOL_AT = { x: 560, z: EZ + 120, rot: -0.5 }
/** the canvas in the easel's own frame (real mm): its middle (low: the canvas up in the frame, the paint box under
 *  it), and which way it faces */
const CANVAS_MID = (() => {
  const l = EASEL.lean
  const y = EASEL.tray.y + EASEL.tray.t / 2 + CANVAS.h / 2
  const z = EASEL.mast.d / 2 + CANVAS.d / 2 + 4
  return new Vector3(0, y * Math.cos(l) + z * Math.sin(l) - CANVAS.h * 0.32, -y * Math.sin(l) + z * Math.cos(l))
})()
const CANVAS_FACES = new Vector3(0, Math.sin(EASEL.lean), Math.cos(EASEL.lean))
/** the paper looked down on: from above, a little toward the camera */
const PAPER_LOOK = new Vector3(sin * 0.45, 1, cos * 0.45).normalize()

/** the cloth's top, for what's on it to lie on: its swell, sampled (so nothing sinks into its rises, nor floats over its dips) */
const FIELD = 24
const FIELD_HEIGHTS = (() => {
  const h: number[] = []
  // (column-major: down each column of z for each x)
  for (let j = 0; j <= FIELD; j++) for (let i = 0; i <= FIELD; i++) h.push(throwTop((j / FIELD - 0.5) * THROW.w, (i / FIELD - 0.5) * THROW.l) * K + 0.35) // (+: what rests on it settles in a hair)
  return h
})()
const CLOTH_LOW = (THROW.t + 4 - 3.8) * K // (its swell's lowest)

/** a loose thing of the corner's: its model at the toy's scale, a simple body */
function Thing({ id, at, car, feelR, feelPts, lift = 0, children, body }: { id: string; at: { x: number; y: number; z: number; rot: number }; car: { current: CarState }; feelR: number; feelPts?: [number, number][]; lift?: number; children: ReactNode; body: ReactNode }) {
  return (
    <LiveProp id={`art${id}`} label="" set="art" at={at} car={car} lift={lift} feelAlong={[0]} feelPts={feelPts} feelR={feelR}>
      <group scale={K}>{children}</group>
      {body}
    </LiveProp>
  )
}

const _q = new Quaternion()
const _c = new Vector3()
const _n = new Vector3()

export function QuadArt({ car }: { car: { current: CarState } }) {
  const look = useLook()
  const painting = look?.spot.key === 'easel'
  const spot = useMemo<Spot>(
    () => ({
      key: 'easel',
      items: [],
      // (the canvas wherever the easel is now)
      frame: (pos, at, aspect) => {
        const b = liveBody('arteasel')
        if (!b) return
        const t = b.translation()
        const r = b.rotation()
        _q.set(r.x, r.y, r.z, r.w)
        _c.copy(CANVAS_MID).multiplyScalar(K).applyQuaternion(_q).add(t as Vector3)
        _n.copy(CANVAS_FACES).applyQuaternion(_q)
        frameAround(pos, at, aspect, _c, CANVAS.w * K * 1.3, CANVAS.h * K * 1.9, _n)
      },
      hint: 'pick a paint and a brush below · press and drag on the canvas to paint',
    }),
    [],
  )
  const zoom = (e: ThreeEvent<MouseEvent>) => {
    if (painting) return
    e.stopPropagation()
    clickSpot(spot)
  }
  // the paper: each sheet its own close look, following it
  const sheets = useMemo(() => PAPER_COLORS.map(() => createRef<RapierRigidBody>()), [])
  const paperSpots = useMemo(
    () =>
      sheets.map(
        (ref, i): Spot => ({
          key: `paper${i}`,
          items: [],
          frame: (pos, at, aspect) => {
            const b = ref.current
            if (!b) return
            const t = b.translation()
            _c.set(t.x, t.y, t.z)
            frameAround(pos, at, aspect, _c, PAPER_W * K * 1.5, PAPER_H * K * 1.35, PAPER_LOOK)
          },
          hint: 'click a dashed line to fold along it · in the right order, or it crumples · then pick it up and throw it',
        }),
      ),
    [sheets],
  )
  if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __art: { paint: () => clickSpot(spot), paper: (i: number) => clickSpot(paperSpots[i]) } }) // (for trying it from the console)
  // R: the paper flat again (the loose things go home on their own)
  const [round, setRound] = useState(0)
  useEffect(() => onReset(() => setRound((r) => r + 1)), [])

  const S = (r: number) => (r * K) / 2 // (a half-size, real mm to the toy's)
  return (
    <>
      {/* the blanket */}
      <group position={[A.x, LAWN, A.z]} rotation={[0, A.rot, 0]}>
        <group scale={K}>
          <Static>
            <Throw />
          </Static>
        </group>
        <RigidBody type="fixed" colliders={false}>
          <HeightfieldCollider args={[FIELD, FIELD, FIELD_HEIGHTS, { x: THROW.w * K, y: 1, z: THROW.l * K }]} friction={0.9} />
          {/* (under it, deep into the ground: so the car can't shove a thing in under the cloth) */}
          <CuboidCollider args={[S(THROW.w), 20, S(THROW.l)]} position={[0, CLOTH_LOW - 0.3 - 20, 0]} friction={0.9} />
        </RigidBody>
      </group>

      {/* the easel, the stool and the palette on it: loose like the rest */}
      <Thing car={car} id="easel" at={on(0, EZ)} feelR={EASEL.leg.spread * K} feelPts={[[0, 0], [0, 0.6 * EASEL.back.foot * K]]} lift={150} body={<EaselBody />}>
        <group onClick={zoom}>
          <Easel paintable={painting} />
        </group>
      </Thing>
      <Thing car={car} id="stool" at={on(STOOL_AT.x, STOOL_AT.z, STOOL_AT.rot)} feelR={STOOL.splay * K + 6} lift={60} body={<CylinderCollider args={[S(STOOL.h), STOOL.seat * K]} position={[0, S(STOOL.h), 0]} mass={1.5} friction={0.8} />}>
        <Stool />
      </Thing>
      <Thing car={car} id="palette" at={on(STOOL_AT.x, STOOL_AT.z, STOOL_AT.rot + 0.4, STOOL.h + 2)} feelR={S(PALETTE.w)} body={<CuboidCollider args={[S(PALETTE.w) * 0.9, S(PALETTE.t), S(PALETTE.d) * 0.9]} position={[0, S(PALETTE.t), 0]} mass={0.15} friction={0.9} />}>
        <Palette />
      </Thing>

      {/* the things on the blanket, loose */}
      <Thing car={car} id="jar" at={on(-460, EZ + 140)} feelR={S(JAR.r * 2) + 2} body={<CylinderCollider args={[S(JAR.h), JAR.r * K]} position={[0, S(JAR.h), 0]} mass={0.3} friction={0.8} />}>
        <BrushJar />
      </Thing>
      <Thing car={car} id="sketchbook" at={on(-250, 160, 0.12, 0, 280)} feelR={S(SKETCHBOOK.h)} body={<CuboidCollider args={[(SKETCHBOOK.w + SKETCHBOOK.ring) * K, S(8), S(SKETCHBOOK.h)]} position={[0, S(8), 0]} mass={0.3} friction={0.9} />}>
        <Sketchbook />
      </Thing>
      <Thing car={car} id="pencils" at={on(330, 180, -0.35, 0, 100)} feelR={S(PENCILS.tin.w)} body={<CuboidCollider args={[S(PENCILS.tin.w), S(PENCILS.tin.h), S(PENCILS.tin.d)]} position={[0, S(PENCILS.tin.h), 0]} mass={0.2} friction={0.8} />}>
        <PencilTin />
      </Thing>
      {[
        [300, 300, 0.5, 0, PENCILS.len],
        [460, 260, -0.9, 6, 130],
      ].map(([x, z, r, i, len], n) => (
        <Thing car={car} key={n} id={`pencil${n}`} at={on(x, z, r, 0, 90)} feelR={S(len)} body={<CuboidCollider args={[S(len), PENCILS.r * K, PENCILS.r * K]} position={[0, PENCILS.r * K, 0]} mass={0.02} friction={0.6} />}>
          <Pencil i={i} len={len} />
        </Thing>
      ))}
      <Thing car={car} id="watercolors" at={on(230, -260, 0.25, 0, 240)} feelR={S(WATERCOLOR.w * 2)} body={<CuboidCollider args={[WATERCOLOR.w * K, S(WATERCOLOR.h), S(WATERCOLOR.d)]} position={[S(WATERCOLOR.w), S(WATERCOLOR.h), 0]} mass={0.2} friction={0.8} />}>
        <Watercolors />
      </Thing>
      <Thing car={car} id="cup" at={on(460, -420)} feelR={34 * K + 2} body={<CylinderCollider args={[S(62), 34 * K]} position={[0, S(62), 0]} mass={0.15} friction={0.8} />}>
        <WaterCup />
      </Thing>
      {[5, 9, 2].map((i, n) => (
        <Thing car={car} key={i} id={`tube${n}`} at={on(-60 + n * 60, -420 + n * 30, 0.4 + n * 0.7)} feelR={S(TUBE.len)} body={<CuboidCollider args={[S(TUBE.len + TUBE.cap), TUBE.r * K, TUBE.r * K]} position={[0, TUBE.r * K, 0]} mass={0.03} friction={0.7} />}>
          <Tube color={PAINTS[i].hex} />
        </Thing>
      ))}
      <Thing car={car} id="hoop" at={on(-360, -330, 0.3, 0, 90)} feelR={HOOP.r * K + 4} body={<CylinderCollider args={[S(HOOP.h), (HOOP.r + HOOP.ring) * K]} position={[0, S(HOOP.h), 0]} mass={0.1} friction={0.8} />}>
        <Hoop />
      </Thing>
      {(
        [
          [90, 290, 0.4, '#f6c1cf'],
          [-520, -120, 2.2, '#a6dbb0'],
          [470, 60, -1.2, '#b9a0e2'],
        ] as const
      ).map(([x, z, r, c], n) => (
        <Thing car={car} key={n} id={`crane${n}`} at={on(x, z, r, 0, 80)} feelR={18} body={<CuboidCollider args={[55 * K, 30 * K, 40 * K]} position={[0, 30 * K, 0]} mass={0.01} friction={0.6} />}>
          <Crane color={c} />
        </Thing>
      ))}
      <Thing car={car} id="succulent" at={on(-150, -120)} feelR={POT.r * K + 4} body={<CylinderCollider args={[S(POT.h + 30), POT.r * K]} position={[0, S(POT.h + 30), 0]} mass={0.3} friction={0.8} />}>
        <Succulent />
      </Thing>

      {/* the paper, four sheets laid out across the blanket's near end, apart */}
      {PAPER_COLORS.map((c, i) => {
        const lx = -405 + i * 270
        const lz = 500 + (i % 2) * 40
        const p = world(lx, clothUnder(lx, lz, 125, 155) + 2, lz)
        const key = `paper${i}`
        return (
          <PaperSheet
            key={i}
            reset={round}
            bodyRef={sheets[i]}
            at={[p.x, p.y, p.z]}
            rot={A.rot + Math.sin(i * 2.1) * 0.1}
            color={c}
            k={K}
            zoom={{ on: look?.spot.key === key, open: () => clickSpot(paperSpots[i]), close: () => getLook()?.spot.key === key && lookBack() }}
          />
        )
      })}
    </>
  )
}

/** the easel's body, in its own frame (feet at z 0, leaning back): its front (the legs, the mast, the tray and the
 *  canvas on it) a slab leaning back, its back leg a strut from the top back to its foot */
function EaselBody() {
  const l = EASEL.lean
  const h = EASEL.mast.h
  const top = new Vector3(0, h * Math.cos(l), -h * Math.sin(l))
  const foot = new Vector3(0, 0, EASEL.back.foot)
  const mid = top.clone().add(foot).multiplyScalar(0.5)
  const len = top.distanceTo(foot)
  const back = Math.atan2(top.z - foot.z, top.y - foot.y) // (the strut's tilt about x)
  return (
    <>
      <CuboidCollider args={[EASEL.leg.spread * K, (h / 2) * K, 40 * K]} position={[0, (h / 2) * Math.cos(l) * K, (-(h / 2) * Math.sin(l) + 30) * K]} rotation={[-l, 0, 0]} mass={2} friction={0.8} />
      <CuboidCollider args={[EASEL.back.w * K, (len / 2) * K, EASEL.back.d * K]} position={[0, mid.y * K, mid.z * K]} rotation={[back, 0, 0]} mass={0.5} friction={0.8} />
    </>
  )
}
