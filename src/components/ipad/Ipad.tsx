import { useEffect, useMemo, useState } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { CanvasTexture, ExtrudeGeometry, LatheGeometry, MeshStandardMaterial, Path, SRGBColorSpace, Shape, Vector2, Vector3, type BufferGeometry, type Matrix4 } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedPolygon } from '../../lib/shapes'
import { Prompts } from '../prompt/Prompts'
import { CASE_LEN, CASE_W, FLOOR, GROOVE_X, IPAD, PAD_X, RIM } from './spec'

/**
 * Rina's iPad (./spec) lying flat in its tan folio case: the cover folded back under it, the case's rim round the
 * glass, the white Pencil in the groove down its right side.
 *
 *   the face     one surface: the black bezel and the screen painted into its own texture (the screen lit there,
 *                its emissive map); awake, her biochem notes in OneNote: a printout's typed text, her red and black
 *                handwriting beside it
 *   the screen   click it to put it to sleep (dark glass) and wake it
 *
 * Frame: ./spec (the footprint's middle, its bottom on y 0, screen up, the screen's top toward -z).
 */
const I = IPAD
const C = I.case
const PX = 7 // the screen's light: pixels a mm
const FACE_PX = 3 // the face's picture (black glass)
const SX = (I.pad.w - I.screen.w) / 2 // the screen's left edge, from the iPad's
const SY = (I.pad.len - I.screen.h) / 2 // its top edge

// ---- the shapes (made once), laid out in the plan (x, and y toward the top: -z), then laid flat
/** a rounded rectangle w × h round (cx, cy) in the plan */
const rr = <T extends Path>(cx: number, cy: number, w: number, h: number, r: number, target: T) =>
  roundedPolygon(
    [
      [cx - w / 2, cy - h / 2],
      [cx + w / 2, cy - h / 2],
      [cx + w / 2, cy + h / 2],
      [cx - w / 2, cy + h / 2],
    ],
    r,
    target,
  )
/** an outline made solid, from y0 to y1, lying flat; its edges rounded b */
function flat(shape: Shape, y0: number, y1: number, b: number) {
  const g = new ExtrudeGeometry(shape, b > 0 ? { depth: y1 - y0 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 4, curveSegments: 10 } : { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 })
  g.translate(0, 0, b)
  g.rotateX(-Math.PI / 2) // (the plan's y toward -z, its extrusion up)
  g.translate(0, y0, 0)
  return g
}
/** the iPad: a slab with its top (the glass) its own group (2), uv 0..1 over the outline */
function padGeometry() {
  const { w, len, r, t, edge: b } = I.pad
  const g = new ExtrudeGeometry(rr(0, 0, w, len, r, new Shape()), { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 12 })
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + len / 2) / len)
  // (the caps come first: the back's triangles, then the front's, as many of each)
  const cap = g.groups.find((x) => x.materialIndex === 0)!
  const rest = g.groups.filter((x) => x !== cap)
  g.clearGroups()
  g.addGroup(cap.start, cap.count / 2, 0)
  g.addGroup(cap.start + cap.count / 2, cap.count / 2, 2)
  for (const x of rest) g.addGroup(x.start, x.count, x.materialIndex)
  g.translate(0, 0, b)
  g.rotateX(-Math.PI / 2)
  g.translate(PAD_X, FLOOR, 0)
  return g
}
/** the Pencil, along y from its end (0) to its nib: the round body, the cone, the nib */
function pencilGeometry() {
  const { len, d, tip } = I.pencil
  const r = d / 2
  const body = new LatheGeometry(
    [new Vector2(0, 0), new Vector2(r - 1.6, 0), new Vector2(r - 0.4, 0.4), new Vector2(r, 1.6), new Vector2(r, len - tip), new Vector2(1.3, len - 3)],
    28,
  )
  const nib = new LatheGeometry([new Vector2(1.3, len - 3.4), new Vector2(1.25, len - 1.2), new Vector2(0.8, len - 0.3), new Vector2(0, len)], 16)
  const lay = (g: BufferGeometry) => g.rotateX(-Math.PI / 2).translate(GROOVE_X, FLOOR + r, I.pencil.at + len / 2) // (the nib toward the top, -z)
  return { body: lay(body), nib: lay(nib) }
}
const GROOVE_LEN = CASE_LEN - 2 * C.r - 4 // (clear of the corners' rounding)
let SHAPES: { cover: BufferGeometry; tray: BufferGeometry; floors: BufferGeometry[]; pad: BufferGeometry; pencil: { body: BufferGeometry; nib: BufferGeometry } } | null = null
const shapes = () =>
  (SHAPES ??= (() => {
    const tray = rr(0, 0, CASE_W, CASE_LEN, C.r, new Shape())
    tray.holes.push(rr(PAD_X, 0, I.pad.w + 0.4, I.pad.len + 0.4, I.pad.r, new Path()))
    tray.holes.push(rr(GROOVE_X, 0, C.groove, GROOVE_LEN, C.groove / 2 - 0.5, new Path()))
    return {
      // the cover folded back under the case, its edges well rounded (the fold)
      cover: flat(rr(0, 0, CASE_W - 1, CASE_LEN - 1, C.r, new Shape()), 0, C.cover, 1.3),
      tray: flat(tray, C.cover, RIM, 0.7),
      floors: [rr(PAD_X, 0, I.pad.w + 0.4, I.pad.len + 0.4, I.pad.r, new Shape()), rr(GROOVE_X, 0, C.groove, GROOVE_LEN, C.groove / 2 - 0.5, new Shape())].map((s) => flat(s, C.cover, FLOOR, 0)),
      pad: padGeometry(),
      pencil: pencilGeometry(),
    }
  })())

// ---- the face
const SANS = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"
const HAND = "'Caveat', 'Kalam', cursive"
const INK = { red: '#c4222c', black: '#1c1c22', purple: '#7719aa', grey: '#8a8590', box: '#c9c4cf' }

/** OneNote on the iPad, W × H mm from its top left (portrait) */
function notes(g: CanvasRenderingContext2D, W: number, H: number) {
  const text = (s: string, x: number, y: number, size: number, color: string, font = SANS, weight = 400, align: CanvasTextAlign = 'left') => {
    g.font = `${weight} ${size}px ${font}`
    g.fillStyle = color
    g.textAlign = align
    g.fillText(s, x, y)
  }
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  // the purple bar: the status line, the toolbar, the section tabs
  g.fillStyle = INK.purple
  g.fillRect(0, 0, W, 16)
  text('10:24 AM   Mon Dec 8', 4, 3.6, 2, '#ffffff', SANS, 600)
  text('87%', W - 12, 3.6, 2, '#ffffff', SANS, 600, 'right')
  g.strokeStyle = '#ffffff'
  g.lineWidth = 0.3
  g.strokeRect(W - 10.5, 1.6, 5.4, 2.4)
  g.fillStyle = '#ffffff'
  g.fillRect(W - 10, 2.1, 3.8, 1.4)
  ;['Home', 'Insert', 'Draw', 'View'].forEach((s, i) => {
    const x = W / 2 - 24 + i * 15
    text(s, x, 9, 2.3, '#ffffff', SANS, i === 2 ? 700 : 400, 'center')
    if (i === 2) g.fillRect(x - 4, 10, 8, 0.4)
  })
  // the toolbar's icons, simple strokes
  g.lineWidth = 0.4
  g.strokeRect(4, 6.6, 4, 3.2)
  g.beginPath()
  g.moveTo(14, 8.2)
  g.arc(16, 8.2, 2, Math.PI, Math.PI * 1.75)
  g.stroke()
  g.strokeRect(W - 8, 6.6, 3.2, 3.2)
  g.beginPath()
  g.arc(W - 14, 8.2, 1.4, 0, Math.PI * 2)
  g.stroke()
  // her section tabs along the bar's foot, the open one white into the page
  const TABS = ['#f3c6d3', '#c7def5', '#f7e1a6', '#cdebc6', '#ffffff', '#e2d2f5', '#f8cdb5', '#c4ebe8', '#f3c6d3']
  TABS.forEach((col, i) => {
    g.fillStyle = col
    g.beginPath()
    g.roundRect(5 + i * 16.5, 12.2, 14.5, 4.2, [1, 1, 0, 0])
    g.fill()
  })
  // the page: the date, the printout's boxes
  text('Monday, December 8, 2025   10:02 AM', 5, 21, 1.9, INK.grey)
  g.strokeStyle = INK.box
  g.lineWidth = 0.35
  g.strokeRect(3, 25, 74, 100)
  g.strokeRect(3, 131, 74, 88)
  g.strokeRect(80, 131, 74, 88)
  // the printout's typed lines
  const typed = [
    'Statins lower plasma',
    'LDL cholesterol.',
    'Patients with a defect in the LDL',
    'receptor were discovered that',
    'had higher levels than any other',
    'group. Doses are given based',
    'on how much HMGR is made in',
    'the endoplasmic reticulum.',
  ]
  typed.forEach((s, i) => text(s, 5.5, 33 + i * 5.8, 3.6, INK.black))
  // her ink: a red line under the point, the margin notes in red, a black arrow to HMGR
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const pen = (color: string, w: number, pts: [number, number][]) => {
    g.strokeStyle = color
    g.lineWidth = w
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  }
  pen(INK.red, 0.5, [[5.5, 40.2], [20, 39.7], [33, 40.3]])
  const hand = (s: string, x: number, y: number, size: number, color: string, tilt = -0.04) => {
    g.save()
    g.translate(x, y)
    g.rotate(tilt)
    text(s, 0, 0, size, color, HAND, 600)
    g.strokeStyle = color
    g.lineWidth = size * 0.035 // (a pen's line: a touch bolder than the font)
    g.strokeText(s, 0, 0)
    g.restore()
  }
  hand('↑LDL uptake', 82, 40, 5.8, INK.red)
  hand('↓LDL receptor synthesis', 86, 46.5, 4.5, INK.red, -0.03)
  pen(INK.black, 0.5, [[59, 66.5], [61, 70.5], [67, 70.2]])
  pen(INK.black, 0.5, [[65, 68.8], [67, 70.2], [65, 71.8]])
  hand('HMGR', 68.5, 71.5, 5, INK.black, -0.02)
  hand('cholesterol', 84, 70, 4.7, INK.red, -0.05)
  hand('binding cholesterol', 84, 76.5, 4.7, INK.red, -0.04)
  pen(INK.red, 0.45, [[86, 82], [95, 81.2]])
  pen(INK.red, 0.45, [[93, 79.8], [95, 81.2], [93.2, 82.7]])
  hand('to sterol-sensing domain', 97, 83, 4.4, INK.red, -0.05)
  hand('∘ even w/ ↑HMGR synthesis,', 84, 98, 4.6, INK.red, -0.04)
  hand('statins inhibit it', 89, 105, 4.6, INK.red, -0.04)
  pen(INK.red, 0.45, [[81.5, 92], [80.5, 99], [81.5, 107]])
  // the home bar
  g.fillStyle = '#2a2a2e'
  g.beginPath()
  g.roundRect(W / 2 - 22, H - 3.2, 44, 1.3, 0.65)
  g.fill()
}

/** the face's picture: the black bezel, the camera, the screen dark glass (lit, its picture's the emissive one) */
function paintFace(g: CanvasRenderingContext2D) {
  g.setTransform(FACE_PX, 0, 0, FACE_PX, 0, 0)
  g.fillStyle = I.colors.bezel
  g.fillRect(0, 0, I.pad.w, I.pad.len)
  // (the camera on the long side, as the Air's is: on its right here)
  g.fillStyle = '#26262c'
  g.beginPath()
  g.arc(I.pad.w - SX / 2, I.pad.len / 2, 1.2, 0, Math.PI * 2)
  g.fill()
  const k = g.createLinearGradient(SX, SY, SX + I.screen.w, SY + I.screen.h)
  k.addColorStop(0, '#22242c')
  k.addColorStop(0.5, '#121318')
  k.addColorStop(1, '#0b0c10')
  g.fillStyle = k
  g.beginPath()
  g.roundRect(SX, SY, I.screen.w, I.screen.h, I.screen.r)
  g.fill()
}
/** the screen's light: her notes awake, black asleep (and black round it) */
function paintLit(g: CanvasRenderingContext2D, awake: boolean) {
  g.setTransform(PX, 0, 0, PX, 0, 0)
  g.fillStyle = '#000000'
  g.fillRect(0, 0, I.pad.w, I.pad.len)
  if (!awake) return
  g.save()
  g.translate(SX, SY)
  g.beginPath()
  g.roundRect(0, 0, I.screen.w, I.screen.h, I.screen.r)
  g.clip()
  notes(g, I.screen.w, I.screen.h)
  g.restore()
}
const canvasTexture = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return { g: c.getContext('2d')!, t }
}

/** the iPad in its case with the Pencil, drawn: awake or asleep; `onScreen` when the screen's clicked */
export function IpadModel({ awake = true, onScreen }: { awake?: boolean; onScreen?: () => void }) {
  const s = shapes()
  const face = useMemo(() => ({ map: canvasTexture(I.pad.w * FACE_PX, I.pad.len * FACE_PX), lit: canvasTexture(I.pad.w * PX, I.pad.len * PX) }), [])
  useEffect(() => {
    paintFace(face.map.g)
    face.map.t.needsUpdate = true
  }, [face])
  useEffect(() => {
    const draw = () => {
      paintLit(face.lit.g, awake)
      face.lit.t.needsUpdate = true
    }
    draw()
    let live = true
    if (awake) document.fonts.load(`600 40px Caveat`).finally(() => live && draw())
    return () => void (live = false)
  }, [face, awake])
  const mat = useMemo(() => {
    const pad = new MeshStandardMaterial({ color: I.colors.pad, roughness: 0.4, metalness: 0.3 })
    return {
      case: new MeshStandardMaterial({ color: I.colors.case, roughness: 0.85 }),
      cover: new MeshStandardMaterial({ color: I.colors.cover, roughness: 0.9 }),
      pad: [pad, pad, new MeshStandardMaterial({ map: face.map.t, emissiveMap: face.lit.t, emissive: '#ffffff', emissiveIntensity: 0.95, roughness: 0.25 })],
      pencil: new MeshStandardMaterial({ color: I.colors.pencil, roughness: 0.5 }),
      nib: new MeshStandardMaterial({ color: I.colors.nib, roughness: 0.6 }),
    }
  }, [face])
  const click = (e: ThreeEvent<MouseEvent>) => {
    // the screen only (the glass's group, inside the bezel)
    if (e.face?.materialIndex !== 2 || !e.uv) return
    const x = e.uv.x * I.pad.w
    const y = (1 - e.uv.y) * I.pad.len
    if (x < SX || x > SX + I.screen.w || y < SY || y > SY + I.screen.h) return
    e.stopPropagation()
    onScreen?.()
  }
  return (
    <group>
      <mesh geometry={s.cover} material={mat.cover} castShadow receiveShadow />
      <mesh geometry={s.tray} material={mat.case} castShadow receiveShadow />
      {s.floors.map((f, i) => (
        <mesh key={i} geometry={f} material={mat.case} receiveShadow />
      ))}
      <mesh geometry={s.pad} material={mat.pad} receiveShadow onClick={click} />
      <mesh geometry={s.pencil.body} material={mat.pencil} castShadow receiveShadow />
      <mesh geometry={s.pencil.nib} material={mat.nib} castShadow />
    </group>
  )
}

const ITEM = groups(GROUP.item, 0xffff)

/** the iPad on the desk: to pick up, turn, put back ("Return iPad"), and wake and put to sleep */
export function LiveIpad({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const [awake, setAwake] = useState(true)
  const perch = usePerch({
    key: 'ipad',
    label: 'Return iPad',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0, // (it stays where it's put)
    away: 150,
    lift: RIM + 40,
  })
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <IpadModel awake={awake} onScreen={() => setAwake((a) => !a)} />
        </group>
        <CuboidCollider args={[CASE_W / 2, RIM / 2, CASE_LEN / 2]} position={[0, RIM / 2, 0]} mass={I.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
