import { useMemo } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, CylinderGeometry, DoubleSide, Euler, Matrix4, Quaternion, SRGBColorSpace, Shape, ShapeGeometry, SphereGeometry, TorusGeometry, Vector3, type Group } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { StillSleeves } from '../records/Sleeves'
import { LP, type Pressing } from '../records/vinyl'
import { DARK, HAND, WOOD } from './CookieStand'
import { bruno } from './bruno'

/**
 * The record stand's corner of the lawn, furnished (real mm; ./QuadMusic places it all at the toy scale; its speakers
 * are ../speaker's): on the stand's top, the Dig box
 * (a recipe box of index cards: click it, write what to dig for), a succulent and a few records lying about; under
 * it, the back stock (records stood spine out, two stacks lying flat, a basket of rolled-up posters); out front, a
 * listening corner: a round coffee table (a mug, a pair of headphones, a record) and two poufs; big leafy plants in
 * pots in the canopy's back corners.
 *
 * Cheap to draw: plain colours (one texture: the Dig box's front), each piece's parts merged by <Static> where
 * ./QuadMusic puts them (a material a draw), the records all from the cover sheet (../records/covers: one draw a
 * group, their real covers).
 */
const CREAM = bruno({ color: '#fdf2e4', shade: '#b4a0c4' })
const TERRACOTTA = bruno({ color: '#e0906c', shade: '#a77a9a' })
const SOIL = bruno({ color: '#5d4a3c' })
const LEAF = bruno({ color: '#7cc08e', shade: '#6a8fa8', side: DoubleSide, sway: 5, swayFrom: 300 })
const SUCCULENT = bruno({ color: '#a9d8b8', shade: '#7f9fb8' })
const MINT = bruno({ color: '#bfe8d6', shade: '#8fb0c0' })
const PINK = bruno({ color: '#f5b3c6', shade: '#b48cb4' })
const KNIT = bruno({ color: '#e6cdf2', shade: '#a68fc4' })
const KNIT2 = bruno({ color: '#c8ead9', shade: '#8fb0c0' })

const rbox = (w: number, h: number, d: number, r = 8) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 0.01))
const cyl = (r0: number, r1: number, h: number, seg = 24) => new CylinderGeometry(r0, r1, h, seg)

// ---- the Dig box: a mint recipe box of index cards, its lid propped open, "dig" lettered on its front
export const DIGBOX = { w: 190, h: 120, d: 150, t: 8 }
function digFront() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const g = c.getContext('2d')!
  g.fillStyle = '#bfe8d6'
  g.fillRect(0, 0, 512, 320)
  // a cream label, a little crooked, lettered by hand
  g.save()
  g.translate(256, 170)
  g.rotate(-0.03)
  g.fillStyle = '#fdf6ea'
  g.beginPath()
  g.roundRect(-190, -80, 380, 160, 18)
  g.fill()
  g.strokeStyle = '#e8a4b8'
  g.lineWidth = 6
  g.stroke()
  g.fillStyle = '#5a3d6e'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `700 104px ${HAND}`
  g.fillText('⛏ dig', 0, 0)
  g.restore()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
const DB = (() => {
  const { w, h, d, t } = DIGBOX
  return { side: rbox(t, h, d, 2), back: rbox(w, h, t, 2), front: rbox(w, h, t, 2), floor: rbox(w, t, d, 2), lid: rbox(w + 6, t, d + 6, 3), card: rbox(w - 26, h + 10, 2, 0.8), tab: rbox(44, 22, 2.2, 0.8) }
})()
/** the box, its bottom middle at y 0, its front toward +z; `onClick`: write what to dig for */
export function DigBox({ onClick }: { onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { w, h, d, t } = DIGBOX
  const front = useMemo(() => bruno({ map: digFront(), shade: '#8fb0c0' }), [])
  const tabs = [PINK, KNIT, MINT, PINK, CREAM]
  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <mesh geometry={DB.floor} material={MINT} position={[0, t / 2, 0]} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={DB.side} material={MINT} position={[s * (w / 2 - t / 2), h / 2, 0]} castShadow />
      ))}
      <mesh geometry={DB.back} material={MINT} position={[0, h / 2, -d / 2 + t / 2]} castShadow />
      <mesh geometry={DB.front} material={front} position={[0, h / 2, d / 2 - t / 2]} castShadow />
      {/* the lid, propped open back on its hinge */}
      <mesh geometry={DB.lid} material={MINT} position={[0, h + Math.sin(1.9) * (d / 2), -d / 2 + Math.cos(1.9) * (d / 2)]} rotation={[-1.9, 0, 0]} castShadow />
      {/* the cards, leaning back, a few with coloured tabs */}
      {Array.from({ length: 9 }, (_, i) => (
        <group key={i} position={[0, t, d / 2 - 22 - i * 12]} rotation={[-0.12, 0, 0]}>
          <mesh geometry={DB.card} material={CREAM} position={[0, (h + 10) / 2, 0]} />
          {i % 2 === 0 && <mesh geometry={DB.tab} material={tabs[(i / 2) % tabs.length]} position={[((i * 37) % 90) - 45, h + 16, 0]} />}
        </group>
      ))}
    </group>
  )
}

// ---- a succulent in a little pot (for the stand's top)
const SUC = { pot: cyl(52, 40, 74, 20), rim: cyl(56, 56, 12, 20), soil: cyl(48, 48, 4, 16), leaf: new SphereGeometry(1, 10, 8) }
export function Succulent() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => {
        const a = i * 2.4
        const ring = i < 6 ? 1 : 0.5
        return { a, ring, tilt: i < 6 ? 0.9 : 0.35 }
      }),
    [],
  )
  return (
    <group>
      <mesh geometry={SUC.pot} material={TERRACOTTA} position={[0, 37, 0]} castShadow />
      <mesh geometry={SUC.rim} material={TERRACOTTA} position={[0, 74, 0]} />
      <mesh geometry={SUC.soil} material={SOIL} position={[0, 78, 0]} />
      {leaves.map((l, i) => (
        <group key={i} position={[0, 82, 0]} rotation={[0, l.a, 0]}>
          <mesh geometry={SUC.leaf} material={SUCCULENT} position={[0, 16, 22 * l.ring]} rotation={[l.tilt, 0, 0]} scale={[16, 34, 9]} />
        </group>
      ))}
    </group>
  )
}

// ---- a big leafy plant in a pot (the canopy's back corners)
function leafShape() {
  const s = new Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(90, 40, 110, 200, 0, 300)
  s.bezierCurveTo(-110, 200, -90, 40, 0, 0)
  return new ShapeGeometry(s, 10)
}
const PL = { pot: cyl(170, 130, 340, 28), rim: cyl(182, 182, 34, 28), soil: cyl(160, 160, 8, 24), stem: cyl(7, 9, 1, 6), leaf: leafShape() }
/** `seed` turns its leaves this way or that */
export function Plant({ seed = 0 }: { seed?: number }) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = i * 2.39996 + seed
        const up = 520 + ((i * 131 + seed * 97) % 520)
        const out = 120 + ((i * 53) % 140)
        return { a, up, out, droop: 0.5 + ((i * 7) % 5) * 0.12, s: 0.95 + ((i * 3) % 4) * 0.15 }
      }),
    [seed],
  )
  return (
    <group>
      <mesh geometry={PL.pot} material={TERRACOTTA} position={[0, 170, 0]} castShadow receiveShadow />
      <mesh geometry={PL.rim} material={TERRACOTTA} position={[0, 340, 0]} castShadow />
      <mesh geometry={PL.soil} material={SOIL} position={[0, 352, 0]} />
      {leaves.map((l, i) => {
        // (a stem from the soil out and up to where the leaf hangs off it)
        const top = new Vector3(Math.sin(l.a) * l.out, 352 + l.up, Math.cos(l.a) * l.out)
        const base = new Vector3(Math.sin(l.a) * 20, 352, Math.cos(l.a) * 20)
        const mid = base.clone().lerp(top, 0.5)
        const len = base.distanceTo(top)
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), top.clone().sub(base).normalize())
        return (
          <group key={i}>
            <mesh geometry={PL.stem} material={LEAF} position={mid} quaternion={q} scale={[1, len, 1]} />
            <group position={top} rotation={[0, l.a, 0]}>
              <mesh geometry={PL.leaf} material={LEAF} rotation={[l.droop, 0, 0]} scale={l.s} castShadow />
            </group>
          </group>
        )
      })}
    </group>
  )
}

// ---- the listening corner: a round coffee table, a mug, headphones, a record; poufs to sit on
export const TABLE = { r: 290, h: 430 }
const TB = { top: cyl(TABLE.r, TABLE.r - 10, 36, 40), leg: cyl(20, 14, TABLE.h - 36, 10), mug: cyl(42, 38, 96, 20), coffee: cyl(36, 36, 4, 16), handle: new TorusGeometry(26, 8, 8, 16, Math.PI), band: new TorusGeometry(95, 10, 8, 24, Math.PI), cup: cyl(46, 46, 32, 20), pad: cyl(40, 40, 14, 20) }
export function CoffeeTable() {
  const { h } = TABLE
  return (
    <group>
      <mesh geometry={TB.top} material={WOOD} position={[0, h - 18, 0]} castShadow receiveShadow />
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.4
        return <mesh key={i} geometry={TB.leg} material={WOOD} position={[Math.sin(a) * 180, (h - 36) / 2, Math.cos(a) * 180]} rotation={[Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12]} castShadow />
      })}
      {/* the mug, the coffee in it */}
      <group position={[150, h, 60]}>
        <mesh geometry={TB.mug} material={PINK} position={[0, 48, 0]} castShadow />
        <mesh geometry={TB.coffee} material={DARK} position={[0, 92, 0]} />
        <mesh geometry={TB.handle} material={PINK} position={[44, 50, 0]} rotation={[0, 0, -Math.PI / 2]} />
      </group>
      {/* the headphones, lying folded */}
      <group position={[-110, h + 14, 110]} rotation={[0, 0.6, 0]}>
        <mesh geometry={TB.band} material={KNIT} rotation={[-Math.PI / 2, 0, 0]} />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 95, 6, 0]}>
            <mesh geometry={TB.cup} material={KNIT} />
            <mesh geometry={TB.pad} material={CREAM} position={[0, 20, 0]} />
          </group>
        ))}
      </group>
    </group>
  )
}
const POUF = new SphereGeometry(1, 28, 16)
/** a knitted pouf, its bottom at y 0 */
export function Pouf({ mint = false }: { mint?: boolean }) {
  return <mesh geometry={POUF} material={mint ? KNIT2 : KNIT} position={[0, 150, 0]} scale={[240, 150, 240]} castShadow receiveShadow />
}

// ---- records lying about, and the back stock: all from the cover sheet
const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _one = new Vector3(1, 1, 1)
const _r = new Matrix4()
/**
 * Records stood spine out in a row along x from `x0` (their spines toward +z), then stacks lying flat covers up
 * (`stacks`: where, how many, turned how far): her saved ones, round again if there are few.
 */
export function Stock({ records, row, stacks, who }: { records: Pressing[]; row: { x0: number; n: number; z: number }; stacks: { x: number; z: number; n: number; turn: number }[]; who: string }) {
  const all = records.length ? records : []
  const total = row.n + stacks.reduce((k, s) => k + s.n, 0)
  const list = useMemo(() => (all.length ? Array.from({ length: total }, (_, i) => all[(i * 7) % all.length]) : []), [all, total])
  const place = useMemo(
    () => (i: number, m: Matrix4) => {
      if (i < row.n) {
        // (stood on its edge, its cover toward +x: its spine faces out)
        _e.set(0, Math.PI / 2, 0)
        return m.compose(_p.set(row.x0 + i * (LP.sleeveT + 1.2), 0, row.z), _q.setFromEuler(_e), _one)
      }
      let k = i - row.n
      for (const s of stacks) {
        if (k < s.n) {
          // (flat, cover up, a little askew one on another: turned about its middle)
          const turn = s.turn + ((k * 37) % 9) * 0.015 - 0.06
          _e.set(-Math.PI / 2, 0, 0)
          m.compose(_p.set(0, 0, LP.sleeve / 2), _q.setFromEuler(_e), _one)
          return m.premultiply(_r.makeRotationY(turn).setPosition(s.x, LP.sleeveT * (k + 0.5), s.z))
        }
        k -= s.n
      }
      return m.identity()
    },
    [row, stacks],
  )
  return <StillSleeves records={list} place={place} who={who} />
}

// ---- a basket of rolled-up posters (the shelf's end)
const BK = { body: cyl(130, 110, 200, 24), rim: new TorusGeometry(130, 12, 8, 28), roll: cyl(28, 28, 1, 14) }
export function Basket() {
  return (
    <group>
      <mesh geometry={BK.body} material={WOOD} position={[0, 100, 0]} castShadow />
      <mesh geometry={BK.rim} material={WOOD} position={[0, 200, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {[
        [-50, 20, 380, PINK, 0.12],
        [30, -40, 430, CREAM, -0.08],
        [45, 45, 340, KNIT, 0.18],
      ].map(([x, z, len, mat, tilt], i) => (
        <mesh key={i} geometry={BK.roll} material={mat as typeof PINK} position={[x as number, (len as number) / 2 + 10, z as number]} rotation={[tilt as number, 0, (tilt as number) * 0.6]} scale={[1, len as number, 1]} />
      ))}
    </group>
  )
}
