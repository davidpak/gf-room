import { useEffect, useMemo, useState } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { ConvexHullCollider } from '@react-three/rapier'
import { CanvasTexture, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, SRGBColorSpace, Vector3, type BufferGeometry, type Matrix4 } from 'three'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedRect } from '../../lib/shapes'
import { Prompts } from '../prompt/Prompts'
import { CHIN, FOOT, HEIGHT, MONITOR, PIVOT, STAND_LEN, panelAt } from './spec'

/**
 * Rina's portable monitor (./spec): the thin black panel leaning back on the kickstand folded out of its back.
 *
 *   the face     one surface: the black bezel, "AMN" on the chin and the screen are painted into its own texture
 *                (the screen lit there too, its emissive map); on, it shows her lecture notes open in OneNote
 *   the screen   click it to turn it off (dark glass) and on again
 *
 * Frame: ./spec (the footprint's middle, its bottom on y 0, the screen toward +z).
 */
const M = MONITOR
const S = M.stand
const PX = 6 // the screen's light: pixels a mm
const FACE_PX = 3 // the face's picture (black, the logo)
const SX = (M.w - M.screen.w) / 2 // the screen's left edge

// ---- the shapes (made once)
/** a rounded slab of a w × h outline, t thick, its back at z 0 and its front at z t; uv 0..1 over the outline, the
 *  caps split into their own groups: 0 the back, 1 the sides, 2 the front (the face) */
function slab(w: number, h: number, r: number, t: number, b: number) {
  const g = new ExtrudeGeometry(roundedRect(w, h, r), { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 4, curveSegments: 8 })
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h)
  // (the caps come first: the back's triangles, then the front's, as many of each)
  const cap = g.groups.find((x) => x.materialIndex === 0)!
  const rest = g.groups.filter((x) => x !== cap)
  g.clearGroups()
  g.addGroup(cap.start, cap.count / 2, 0)
  g.addGroup(cap.start + cap.count / 2, cap.count / 2, 2)
  for (const x of rest) g.addGroup(x.start, x.count, x.materialIndex)
  g.translate(0, 0, b)
  return g
}
let SHAPES: { panel: BufferGeometry; stand: BufferGeometry; hinge: BufferGeometry; hull: Float32Array } | null = null
const shapes = () =>
  (SHAPES ??= {
    // the panel in its own frame: x across, y up from its foot, z through it from the back
    panel: slab(M.w, M.h, M.r, M.t, M.edge).translate(0, M.h / 2, 0),
    // the kickstand plate, hanging from its hinge (y 0) down its length, lying behind it (z -t..0)
    stand: slab(S.w, STAND_LEN, S.r, S.t, 0.8).translate(0, -STAND_LEN / 2, -S.t),
    hinge: new CylinderGeometry(S.hinge, S.hinge, S.w + 6, 16).rotateZ(Math.PI / 2),
    // its solid: the panel's corners and the stand's foot
    hull: new Float32Array(
      [
        ...[0, M.h].flatMap((v) => [0, M.t].map((u) => panelAt(v, u))),
        FOOT,
      ].flatMap(([z, y]) => [-M.w / 2, y, z, M.w / 2, y, z]),
    ),
  })

// ---- the face
const FONT = "Calibri, 'Segoe UI', Arial, sans-serif"
const UI = {
  purple: '#7719aa',
  ribbon: '#f4f0f8',
  tools: '#fbfafc',
  pane: '#efe7f5',
  pages: '#f9f6fb',
  sel: '#dfcdec',
  ink: '#262428',
  grey: '#7a7580',
  line: '#ddd6e3',
  icon: '#cbc3d4',
  hl: { yellow: '#fff04a', cyan: '#78e6f2' },
}
type Line = { t: string; lvl?: 0 | 1; h?: 'yellow' | 'cyan' }
/** her notes (a biochem lecture): headings highlighted the way she does, bullets under them */
const NOTES: Line[] = [
  { t: 'Cholesterol synthesis', h: 'yellow' },
  { t: 'made in the liver (+ gut, adrenal) from acetyl-CoA, in the cytosol' },
  { t: '3 acetyl-CoA → HMG-CoA (HMG-CoA synthase)' },
  { t: 'HMG-CoA → mevalonate: HMG-CoA reductase (HMGR)', lvl: 1 },
  { t: 'rate-limiting step, uses 2 NADPH, sits in the ER membrane', lvl: 1 },
  { t: 'mevalonate → IPP → squalene → lanosterol → cholesterol' },
  { t: '' },
  { t: 'Regulation', h: 'cyan' },
  { t: 'low sterol: SCAP escorts SREBP-2 from the ER to the Golgi, cleaved' },
  { t: '↑ transcription of HMGR and the LDL receptor', lvl: 1 },
  { t: 'high sterol: INSIG holds SCAP/SREBP in the ER' },
  { t: 'HMGR degraded (its sterol-sensing domain)', lvl: 1 },
  { t: 'insulin ↑ (dephosphorylates HMGR), glucagon ↓ (AMPK)' },
  { t: '' },
  { t: 'Statins', h: 'yellow' },
  { t: 'competitive inhibitors of HMG-CoA reductase' },
  { t: '↓ cell cholesterol → ↑ LDL receptors → ↓ plasma LDL', lvl: 1 },
  { t: 'side effects: myopathy, ↑ liver enzymes' },
  { t: '' },
  { t: 'Familial hypercholesterolemia', h: 'cyan' },
  { t: 'LDL receptor defect: LDL can’t be taken up, stays high in the blood' },
  { t: 'xanthomas, early heart disease', lvl: 1 },
]
const SECTIONS = ['Lectures', 'Discussion', 'Practice exams', 'Problem sets', 'Lab', 'Readings', 'MCAT']
const TABS = ['#e8a0b4', '#9cc7ef', '#f2c97d', '#a7dba0', '#c6a8ea', '#f4a988', '#8fd3cf']
const PAGES = ['Lec 13 Gluconeogenesis', 'Lec 14 Glycogen', 'Lec 15 Pentose phosphate', 'Lec 16 FA oxidation', 'Lec 17 FA synthesis', 'Lec 18 Cholesterol', 'Lec 19 Lipoproteins', 'Lec 20 Amino acids', 'Review: lipids']

/** OneNote, W × H mm from its top left */
function oneNote(g: CanvasRenderingContext2D, W: number, H: number) {
  const text = (s: string, x: number, y: number, size: number, color: string, weight = 400, align: CanvasTextAlign = 'left') => {
    g.font = `${weight} ${size}px ${FONT}`
    g.fillStyle = color
    g.textAlign = align
    g.fillText(s, x, y)
  }
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color
    g.fillRect(x, y, w, h)
  }
  g.textBaseline = 'alphabetic'
  // the title bar, her purple
  rect(0, 0, W, 7, UI.purple)
  text('Lec 18 Cholesterol - OneNote', W / 2, 4.7, 2.5, '#ffffff', 400, 'center')
  text('—', W - 19, 4.6, 2.4, '#ffffff', 400, 'center')
  text('☐', W - 11.5, 4.7, 2.4, '#ffffff', 400, 'center')
  text('✕', W - 4, 4.7, 2.4, '#ffffff', 400, 'center')
  rect(3, 2.2, 2.6, 2.6, '#ffffff')
  text('N', 4.3, 4.4, 2.2, UI.purple, 700, 'center')
  // the ribbon: its tabs, then its tools
  rect(0, 7, W, 5.6, UI.ribbon)
  ;['File', 'Home', 'Insert', 'Draw', 'View', 'Help'].forEach((s, i) => {
    const x = 5 + i * 13
    text(s, x, 11, 2.4, i === 1 ? UI.purple : UI.ink, i === 1 ? 700 : 400)
    if (i === 1) rect(x, 11.9, 7.5, 0.5, UI.purple)
  })
  rect(0, 12.6, W, 11.4, UI.tools)
  for (let i = 0; i < 14; i++) {
    const x = 5 + i * 5.2 + (i > 5 ? 4 : 0)
    g.fillStyle = UI.icon
    g.beginPath()
    g.roundRect(x, 14.5 + (i % 2) * 4.4, 3.4, 3.2, 0.6)
    g.fill()
  }
  // the styles box and the tags
  g.strokeStyle = UI.line
  g.lineWidth = 0.3
  g.strokeRect(86, 14, 40, 8.6)
  text('Heading 1', 88, 17.4, 2.4, '#2f5597', 700)
  text('Heading 2', 88, 21.2, 2.1, '#2f5597', 400)
  g.strokeRect(131, 14, 34, 8.6)
  g.strokeRect(133, 15.2, 2, 2)
  text('To Do', 137, 17.2, 2.1, UI.ink)
  text('★', 134, 21.2, 2.1, '#f2b705', 400, 'center')
  text('Important', 137, 21.1, 2.1, UI.ink)
  rect(0, 24, W, 0.3, UI.line)
  // the notebook's sections
  rect(0, 24.3, 40, H, UI.pane)
  rect(3, 26.5, 2.6, 3.4, UI.purple)
  text('BIOC 405', 7, 29.4, 2.7, UI.ink, 700)
  SECTIONS.forEach((s, i) => {
    const y = 36 + i * 5.6
    if (i === 0) rect(0, y - 3.6, 40, 5.2, UI.sel)
    rect(3, y - 2.6, 1.4, 3.2, TABS[i])
    text(s, 6.5, y, 2.4, UI.ink, i === 0 ? 700 : 400)
  })
  text('+ Add section', 3, H - 3, 2.2, UI.grey)
  // the section's pages
  rect(40, 24.3, 46, H, UI.pages)
  rect(40, 24.3, 0.25, H, UI.line)
  rect(86, 24.3, 0.25, H, UI.line)
  PAGES.forEach((s, i) => {
    const y = 30 + i * 5.6
    if (i === 5) {
      rect(40.3, y - 3.6, 45.7, 5.2, UI.sel)
      rect(40.3, y - 3.6, 0.8, 5.2, UI.purple)
    }
    text(s, 43, y, 2.4, UI.ink, i === 5 ? 700 : 400)
  })
  text('+ Add page', 43, H - 3, 2.2, UI.grey)
  // the page
  rect(86.25, 24.3, W, H, '#ffffff')
  const x0 = 96
  text('Lec 18: Cholesterol synthesis', x0, 34, 5.6, UI.ink)
  rect(x0, 36, 130, 0.3, '#c9c2d0')
  text('Monday, December 8, 2025      10:14 AM', x0, 40, 2.1, UI.grey)
  let y = 49
  for (const l of NOTES) {
    if (!l.t) {
      y += 2.6
      continue
    }
    if (l.h) {
      g.font = `700 3.6px ${FONT}`
      rect(x0 - 0.7, y - 3.2, g.measureText(l.t).width + 1.4, 4.3, UI.hl[l.h])
      text(l.t, x0, y, 3.6, UI.ink, 700)
    } else {
      const x = x0 + 3 + (l.lvl ?? 0) * 6
      text(l.lvl ? '◦' : '•', x, y, 3.2, UI.ink, 400, 'center')
      text(l.t, x + 3.5, y, 3.2, UI.ink)
    }
    y += 5.3
  }
  // the scrollbar
  g.fillStyle = '#d4cdd9'
  g.beginPath()
  g.roundRect(W - 2.2, 30, 1.2, 60, 0.6)
  g.fill()
}

/** the face's picture: the bezel, the logo on the chin, the screen dark glass (lit, its picture's the emissive one) */
function paintFace(g: CanvasRenderingContext2D) {
  g.setTransform(FACE_PX, 0, 0, FACE_PX, 0, 0)
  g.fillStyle = '#141418'
  g.fillRect(0, 0, M.w, M.h)
  // "AMN", spaced wide
  g.font = `600 ${M.logo.h}px Nunito, ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = M.colors.logo
  const cy = M.screen.top + M.screen.h + CHIN / 2
  M.logo.text.split('').forEach((ch, i) => g.fillText(ch, M.w / 2 + (i - 1) * 6.4, cy))
  const k = g.createLinearGradient(SX, M.screen.top, SX + M.screen.w, M.screen.top + M.screen.h)
  k.addColorStop(0, '#24262e')
  k.addColorStop(0.55, M.colors.glass)
  k.addColorStop(1, '#0b0c10')
  g.fillStyle = k
  g.fillRect(SX, M.screen.top, M.screen.w, M.screen.h)
}
/** the screen's light: OneNote on, black off (and black round it) */
function paintLit(g: CanvasRenderingContext2D, on: boolean) {
  g.setTransform(PX, 0, 0, PX, 0, 0)
  g.fillStyle = '#000000'
  g.fillRect(0, 0, M.w, M.h)
  if (!on) return
  g.save()
  g.translate(SX, M.screen.top)
  g.beginPath()
  g.rect(0, 0, M.screen.w, M.screen.h)
  g.clip()
  oneNote(g, M.screen.w, M.screen.h)
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

/** the monitor, drawn: its screen on or off; `onScreen` when the screen's clicked */
export function MonitorModel({ on = true, onScreen }: { on?: boolean; onScreen?: () => void }) {
  const s = shapes()
  const face = useMemo(() => ({ map: canvasTexture(M.w * FACE_PX, M.h * FACE_PX), lit: canvasTexture(M.w * PX, M.h * PX) }), [])
  useEffect(() => {
    const draw = () => {
      paintFace(face.map.g)
      face.map.t.needsUpdate = true
    }
    draw()
    let live = true
    document.fonts.load(`600 40px Nunito`).finally(() => live && draw())
    return () => void (live = false)
  }, [face])
  useEffect(() => {
    paintLit(face.lit.g, on)
    face.lit.t.needsUpdate = true
  }, [face, on])
  const mat = useMemo(() => {
    const body = new MeshStandardMaterial({ color: M.colors.body, roughness: 0.55 })
    return {
      body,
      stand: new MeshStandardMaterial({ color: M.colors.stand, roughness: 0.6 }),
      panel: [body, body, new MeshStandardMaterial({ map: face.map.t, emissiveMap: face.lit.t, emissive: '#ffffff', emissiveIntensity: 0.95, roughness: 0.3 })],
    }
  }, [face])
  const click = (e: ThreeEvent<MouseEvent>) => {
    // the screen only (the face's group, inside the bezel)
    if (e.face?.materialIndex !== 2 || !e.uv) return
    const x = e.uv.x * M.w
    const y = (1 - e.uv.y) * M.h
    if (x < SX || x > SX + M.screen.w || y < M.screen.top || y > M.screen.top + M.screen.h) return
    e.stopPropagation()
    onScreen?.()
  }
  return (
    <group position={[0, PIVOT[1], PIVOT[0]]} rotation={[-M.lean, 0, 0]}>
      <mesh geometry={s.panel} material={mat.panel} castShadow receiveShadow onClick={click} />
      {/* the kickstand, swung out from its hinge on the back */}
      <group position={[0, S.at, 0]} rotation={[S.angle + M.lean, 0, 0]}>
        <mesh geometry={s.stand} material={mat.stand} castShadow receiveShadow />
        <mesh geometry={s.hinge} material={mat.stand} position={[0, 0, -S.hinge * 0.6]} castShadow />
      </group>
    </group>
  )
}

const ITEM = groups(GROUP.item, 0xffff)

/** the monitor on the desk: to pick up, turn, put back ("Return monitor"), and switch off and on */
export function LiveMonitor({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const [on, setOn] = useState(true)
  const perch = usePerch({
    key: 'monitor',
    label: 'Return monitor',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0, // (it stays where it's put)
    away: 150,
    lift: HEIGHT + 40,
  })
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <MonitorModel on={on} onScreen={() => setOn((o) => !o)} />
        </group>
        <ConvexHullCollider args={[shapes().hull]} mass={M.mass} friction={0.8} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
