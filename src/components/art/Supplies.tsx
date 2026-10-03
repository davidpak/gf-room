import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, CircleGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3, type Material } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from '../picnic/paint'
import { LooseBrush } from './Easel'
import { CRANE, HOOP, PENCIL_COLORS, PENCILS, POT, SKETCHBOOK, WATERCOLOR } from './spec'

/**
 * What's on the art blanket (./spec), real mm, toy style:
 *
 *   <Sketchbook>   open flat, spiral-bound, pencil sketches on its pages: click its right page to turn on, its
 *                  left to turn back (the leaf swings over on the spiral)
 *   <PencilTin>    a tin of coloured pencils, open, the pencils in a row, sharpened
 *   <Pencil>       one of them, loose
 *   <Watercolors>  a travel box of half pans, its lid opened out flat beside it (a mixing palette)
 *   <Hoop>         an embroidery hoop, a flower half stitched in it, the needle left in, thread trailing
 *   <Crane>        an origami crane
 *   <Succulent>    an echeveria in a terracotta pot
 *
 * Each lies on the ground (y 0 its underside), its middle at the origin.
 */
const PAPER_EDGE = bruno({ color: '#f4efe4', shade: '#a59bb4' })
const KRAFT = bruno({ color: '#c9a77c', shade: '#7e6a6a' })
const WIRE = bruno({ color: '#cfccd6', shade: '#76728a', sheen: 0.4 })
const WOOD = bruno({ color: '#e7c9a0', shade: '#8f7a72' })
const RBOX = new BoxGeometry(1, 1, 1)
const BRASS = bruno({ color: '#d7b45e', shade: '#86704e', sheen: 0.5 })

// ---- the sketchbook
const PW = SKETCHBOOK.w
const PH = SKETCHBOOK.h
const PX = 2 // (px a mm on a page)
const pencil = (g: CanvasRenderingContext2D, r: () => number, path: (g: CanvasRenderingContext2D) => void, w = 2.2) => {
  // a pencil line: drawn twice, the second a hair off and fainter (it's sketched, not inked)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const [a, off, lw] of [
    [0.7, 0, w],
    [0.3, 1.2, w * 0.7],
  ] as const) {
    g.strokeStyle = `rgba(58,54,70,${a})`
    g.lineWidth = lw
    g.save()
    g.translate(off * (r() - 0.5), off * (r() - 0.5))
    g.beginPath()
    path(g)
    g.stroke()
    g.restore()
  }
}
const hatch = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, n = 9) => {
  g.strokeStyle = 'rgba(58,54,70,0.25)'
  g.lineWidth = 1.4
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    g.moveTo(x + t * w, y + h)
    g.lineTo(x + t * w + w * 0.25, y)
  }
  g.stroke()
}
/** the sketches, a page each */
const SKETCHES: ((g: CanvasRenderingContext2D, W: number, H: number, r: () => number) => void)[] = [
  // a cherry branch in blossom
  (g, W, H, r) => {
    pencil(g, r, (g) => (g.moveTo(W * 0.1, H * 0.85), g.bezierCurveTo(W * 0.35, H * 0.6, W * 0.5, H * 0.45, W * 0.88, H * 0.18)), 3)
    pencil(g, r, (g) => (g.moveTo(W * 0.42, H * 0.56), g.quadraticCurveTo(W * 0.5, H * 0.7, W * 0.7, H * 0.72)))
    for (const [x, y, s] of [[0.3, 0.62, 1], [0.52, 0.42, 1.2], [0.7, 0.3, 0.9], [0.62, 0.7, 1], [0.84, 0.2, 0.8], [0.2, 0.74, 0.7]] as const) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        pencil(g, r, (g) => g.ellipse(W * x + Math.cos(a) * 14 * s, H * y + Math.sin(a) * 14 * s, 12 * s, 8 * s, a, 0, Math.PI * 2), 1.6)
      }
      g.fillStyle = 'rgba(58,54,70,0.5)'
      g.beginPath()
      g.arc(W * x, H * y, 3 * s, 0, Math.PI * 2)
      g.fill()
    }
  },
  // a duck on the water
  (g, W, H, r) => {
    pencil(g, r, (g) => g.ellipse(W * 0.48, H * 0.55, W * 0.28, H * 0.12, -0.05, 0, Math.PI * 2), 2.6)
    pencil(g, r, (g) => g.arc(W * 0.7, H * 0.36, W * 0.1, 0, Math.PI * 2), 2.6)
    pencil(g, r, (g) => (g.moveTo(W * 0.78, H * 0.37), g.lineTo(W * 0.9, H * 0.39), g.lineTo(W * 0.79, H * 0.41)))
    pencil(g, r, (g) => (g.moveTo(W * 0.3, H * 0.52), g.quadraticCurveTo(W * 0.45, H * 0.44, W * 0.6, H * 0.53)))
    g.fillStyle = 'rgba(58,54,70,0.8)'
    g.beginPath()
    g.arc(W * 0.72, H * 0.34, 4, 0, Math.PI * 2)
    g.fill()
    for (let i = 0; i < 4; i++) pencil(g, r, (g) => (g.moveTo(W * (0.1 + i * 0.06), H * (0.72 + i * 0.04)), g.quadraticCurveTo(W * 0.5, H * (0.69 + i * 0.04), W * (0.9 - i * 0.05), H * (0.72 + i * 0.04))), 1.4)
  },
  // a cup of coffee
  (g, W, H, r) => {
    pencil(g, r, (g) => g.ellipse(W * 0.5, H * 0.42, W * 0.25, H * 0.05, 0, 0, Math.PI * 2), 2.4)
    pencil(g, r, (g) => (g.moveTo(W * 0.25, H * 0.42), g.bezierCurveTo(W * 0.26, H * 0.65, W * 0.36, H * 0.72, W * 0.5, H * 0.72), g.bezierCurveTo(W * 0.64, H * 0.72, W * 0.74, H * 0.65, W * 0.75, H * 0.42)), 2.4)
    pencil(g, r, (g) => g.ellipse(W * 0.82, H * 0.53, W * 0.07, H * 0.06, 0, -1.8, 1.8))
    pencil(g, r, (g) => g.ellipse(W * 0.5, H * 0.76, W * 0.38, H * 0.06, 0, 0, Math.PI * 2))
    for (const x of [0.42, 0.52, 0.6]) pencil(g, r, (g) => (g.moveTo(W * x, H * 0.36), g.bezierCurveTo(W * (x - 0.05), H * 0.3, W * (x + 0.05), H * 0.24, W * x, H * 0.16)), 1.6)
    hatch(g, W * 0.3, H * 0.5, W * 0.12, H * 0.16)
  },
  // a cat, curled up asleep
  (g, W, H, r) => {
    pencil(g, r, (g) => g.ellipse(W * 0.5, H * 0.58, W * 0.32, H * 0.15, 0, 0, Math.PI * 2), 2.6)
    pencil(g, r, (g) => g.arc(W * 0.3, H * 0.5, W * 0.12, 0, Math.PI * 2), 2.4)
    pencil(g, r, (g) => (g.moveTo(W * 0.21, H * 0.43), g.lineTo(W * 0.22, H * 0.34), g.lineTo(W * 0.28, H * 0.4), g.moveTo(W * 0.33, H * 0.39), g.lineTo(W * 0.38, H * 0.31), g.lineTo(W * 0.4, H * 0.42)))
    pencil(g, r, (g) => (g.moveTo(W * 0.25, H * 0.5), g.quadraticCurveTo(W * 0.27, H * 0.52, W * 0.29, H * 0.5), g.moveTo(W * 0.32, H * 0.5), g.quadraticCurveTo(W * 0.34, H * 0.52, W * 0.36, H * 0.5)), 1.6)
    pencil(g, r, (g) => (g.moveTo(W * 0.8, H * 0.62), g.bezierCurveTo(W * 0.9, H * 0.72, W * 0.6, H * 0.8, W * 0.36, H * 0.68)), 2.2)
    hatch(g, W * 0.5, H * 0.48, W * 0.2, H * 0.12, 7)
    g.font = `${H * 0.05}px 'Gaegu', cursive`
    g.fillStyle = 'rgba(58,54,70,0.6)'
    g.fillText('z z z', W * 0.48, H * 0.36)
  },
  // tulips in a jar
  (g, W, H, r) => {
    pencil(g, r, (g) => (g.moveTo(W * 0.36, H * 0.52), g.lineTo(W * 0.34, H * 0.85), g.lineTo(W * 0.66, H * 0.85), g.lineTo(W * 0.64, H * 0.52)), 2.4)
    pencil(g, r, (g) => g.ellipse(W * 0.5, H * 0.52, W * 0.14, H * 0.025, 0, 0, Math.PI * 2))
    for (const [x, y] of [[0.38, 0.2], [0.52, 0.14], [0.66, 0.22]] as const) {
      pencil(g, r, (g) => (g.moveTo(W * 0.5, H * 0.6), g.quadraticCurveTo(W * ((x + 0.5) / 2), H * 0.4, W * x, H * (y + 0.08))))
      pencil(g, r, (g) => (g.moveTo(W * x - 22, H * y), g.quadraticCurveTo(W * x - 26, H * (y + 0.09), W * x, H * (y + 0.09)), g.quadraticCurveTo(W * x + 26, H * (y + 0.09), W * x + 22, H * y), g.lineTo(W * x + 8, H * (y + 0.03)), g.lineTo(W * x, H * (y - 0.01)), g.lineTo(W * x - 8, H * (y + 0.03)), g.closePath()), 2)
    }
    pencil(g, r, (g) => (g.moveTo(W * 0.5, H * 0.62), g.quadraticCurveTo(W * 0.3, H * 0.45, W * 0.26, H * 0.46)), 1.6)
  },
  // the hall on the Quad, its gables and windows
  (g, W, H, r) => {
    pencil(g, r, (g) => (g.moveTo(W * 0.08, H * 0.7), g.lineTo(W * 0.08, H * 0.4), g.lineTo(W * 0.3, H * 0.24), g.lineTo(W * 0.52, H * 0.4), g.lineTo(W * 0.52, H * 0.7), g.moveTo(W * 0.52, H * 0.46), g.lineTo(W * 0.92, H * 0.46), g.lineTo(W * 0.92, H * 0.7), g.lineTo(W * 0.08, H * 0.7)), 2.4)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) pencil(g, r, (g) => g.rect(W * (0.14 + i * 0.12), H * (0.45 + j * 0.12), W * 0.06, H * 0.07), 1.5)
    for (let i = 0; i < 5; i++) pencil(g, r, (g) => g.rect(W * (0.57 + i * 0.07), H * 0.52, W * 0.04, H * 0.09), 1.5)
    pencil(g, r, (g) => g.arc(W * 0.3, H * 0.34, W * 0.04, 0, Math.PI * 2), 1.5)
    for (const x of [0.12, 0.85]) pencil(g, r, (g) => (g.moveTo(W * x, H * 0.82), g.bezierCurveTo(W * (x - 0.08), H * 0.72, W * (x + 0.08), H * 0.66, W * x, H * 0.62)), 1.4)
    hatch(g, W * 0.52, H * 0.46, W * 0.4, H * 0.04, 14)
  },
  // a moon and stars
  (g, W, H, r) => {
    pencil(g, r, (g) => (g.arc(W * 0.42, H * 0.4, W * 0.2, 0.9, 5.4), g.arc(W * 0.5, H * 0.36, W * 0.16, 5.0, 1.3, true)), 2.6)
    for (const [x, y, s] of [[0.75, 0.2, 1], [0.82, 0.48, 0.7], [0.2, 0.75, 0.8], [0.62, 0.72, 1.1], [0.3, 0.14, 0.6]] as const)
      pencil(g, r, (g) => {
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5
          const px = W * x + Math.cos(a) * 18 * s
          const py = H * y + Math.sin(a) * 18 * s
          if (k) g.lineTo(px, py)
          else g.moveTo(px, py)
        }
        g.closePath()
      }, 1.6)
  },
  // for her
  (g, W, H, r) => {
    g.font = `${H * 0.11}px 'Gaegu', cursive`
    g.fillStyle = 'rgba(58,54,70,0.75)'
    g.textAlign = 'center'
    g.fillText('for Rina', W * 0.5, H * 0.46)
    const heart = (x: number, y: number, s: number) =>
      pencil(g, r, (g) => (g.moveTo(x, y + 12 * s), g.bezierCurveTo(x - 26 * s, y - 6 * s, x - 10 * s, y - 22 * s, x, y - 8 * s), g.bezierCurveTo(x + 10 * s, y - 22 * s, x + 26 * s, y - 6 * s, x, y + 12 * s)), 2)
    heart(W * 0.5, H * 0.6, 1.6)
    heart(W * 0.28, H * 0.68, 0.8)
    heart(W * 0.74, H * 0.7, 0.9)
  },
]
const SPREADS = SKETCHES.length / 2
const pageTex = (n: number) =>
  paint(PW * PX, PH * PX, (g) => {
    const r = rng(100 + n)
    g.fillStyle = '#fbf8f0'
    g.fillRect(0, 0, PW * PX, PH * PX)
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(120,110,100,${0.03 + r() * 0.03})`
      g.fillRect(r() * PW * PX, r() * PH * PX, 1.5, 1.5)
    }
    SKETCHES[n](g, PW * PX, PH * PX, r)
  })
const texs: ReturnType<typeof pageTex>[] = []
const tex = (n: number) => (texs[n] ??= pageTex(n))
const fronts: Material[] = []
const backs: Material[] = []
/** a page, face up (none past either end: a plain leaf) */
const pageMat = (n: number) => (n < 0 || n >= SKETCHES.length ? PAPER_EDGE : (fronts[n] ??= bruno({ map: tex(n) ?? undefined, color: '#ffffff', shade: '#b0a6c2' })))
/** a page seen from behind (the turning leaf's other side) */
const pageBack = (n: number) => (n < 0 || n >= SKETCHES.length ? PAPER_EDGE : (backs[n] ??= bruno({ map: tex(n) ?? undefined, color: '#ffffff', shade: '#b0a6c2', side: BackSide })))

export function Sketchbook() {
  const { board, leaves, rings, ring } = SKETCHBOOK
  const stack = leaves * 0.5 // (each side's leaves, thick: the toy look)
  const top = board + stack
  const g = useMemo(() => {
    const leaf = new PlaneGeometry(PW, PH)
    leaf.rotateX(-Math.PI / 2)
    leaf.translate(PW / 2 + ring, 0, 0) // (its inner edge at the spiral)
    // (its back the right way round once it's over: the same plane, its u mirrored)
    const back = leaf.clone()
    const uv = back.attributes.uv as BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i))
    return { leaf, back, side: new BoxGeometry(PW, stack, PH), ring: new TorusGeometry(ring, 0.9, 6, 18) }
  }, [ring, stack])
  const [spread, setSpread] = useState(0)
  const turning = useRef<{ dir: 1 | -1; t: number } | null>(null)
  const [turn, setTurn] = useState<1 | -1 | null>(null)
  const leafRef = useRef<Group>(null)
  useFrame((_, dt) => {
    const tr = turning.current
    if (!tr || !leafRef.current) return
    tr.t = Math.min(1, tr.t + dt * 1.8)
    const e = tr.t * tr.t * (3 - 2 * tr.t)
    leafRef.current.rotation.z = (tr.dir > 0 ? e : 1 - e) * Math.PI
    if (tr.t >= 1) {
      turning.current = null
      setSpread((s) => s + tr.dir)
      setTurn(null)
    }
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (turning.current) return
    const dir = (e.eventObject.worldToLocal(e.point.clone()).x > 0 ? 1 : -1) as 1 | -1
    if ((dir > 0 && spread >= SPREADS - 1) || (dir < 0 && spread <= 0)) return
    turning.current = { dir, t: 0 }
    setTurn(dir)
  }
  // what shows: turning on, the leaf carries the right page over (its back the next left), the next right below;
  // turning back, the leaf carries the left page back (its back the last right), the last left below
  const left = turn === -1 ? 2 * spread - 2 : 2 * spread
  const right = turn === 1 ? 2 * spread + 3 : 2 * spread + 1
  const leafFront = turn === 1 ? 2 * spread + 1 : 2 * spread - 1
  const leafBack = turn === 1 ? 2 * spread + 2 : 2 * spread
  const sideMats = (n: number) => [PAPER_EDGE, PAPER_EDGE, pageMat(n), PAPER_EDGE, PAPER_EDGE, PAPER_EDGE]
  return (
    <group onClick={click} onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))} onPointerOut={() => (document.body.style.cursor = '')}>
      {/* the kraft back board under both sides */}
      <mesh geometry={RBOX} material={KRAFT} position={[0, board / 2, 0]} scale={[PW * 2 + ring * 2 + 8, board, PH + 6]} castShadow receiveShadow />
      {/* each side's leaves, the page open on top */}
      <mesh geometry={g.side} material={sideMats(left)} position={[-(PW / 2 + ring), board + stack / 2, 0]} receiveShadow castShadow />
      <mesh geometry={g.side} material={sideMats(right)} position={[PW / 2 + ring, board + stack / 2, 0]} receiveShadow castShadow />
      {/* the spiral */}
      {Array.from({ length: rings }, (_, i) => (
        <mesh key={i} geometry={g.ring} material={WIRE} position={[0, top, -PH / 2 + ((i + 0.5) * PH) / rings]} />
      ))}
      {/* the leaf turning over */}
      {turn && (
        <group ref={leafRef} position={[0, top + 0.6, 0]} rotation={[0, 0, turn > 0 ? 0 : Math.PI]} userData={{ live: true }}>
          <mesh geometry={g.leaf} material={pageMat(leafFront)} />
          <mesh geometry={g.back} material={pageBack(leafBack)} />
        </group>
      )}
    </group>
  )
}

// ---- the pencils
const HEX = new CylinderGeometry(1, 1, 1, 6)
const CONE = new CylinderGeometry(0.001, 1, 1, 6)
const pencilMats = PENCIL_COLORS.map((c) => bruno({ color: c }))
const TIN = bruno({ color: '#8fb3d9', shade: '#5b6890', sheen: 0.4 })
const TIN_IN = bruno({ color: '#e9eef4', shade: '#8d91a8' })
/** a pencil lying along x, its point at +x */
export function Pencil({ i = 0, len = PENCILS.len }: { i?: number; len?: number }) {
  const r = PENCILS.r
  const body = len - 22
  return (
    <group position={[0, r, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <mesh geometry={HEX} material={pencilMats[i % pencilMats.length]} position={[0, -len / 2 + body / 2, 0]} scale={[r, body, r]} castShadow />
      <mesh geometry={CONE} material={WOOD} position={[0, -len / 2 + body + 8, 0]} scale={[r, 16, r]} />
      <mesh geometry={CONE} material={pencilMats[i % pencilMats.length]} position={[0, -len / 2 + body + 18, 0]} scale={[r * 0.38, 5, r * 0.38]} />
    </group>
  )
}
export function PencilTin() {
  const { tin } = PENCILS
  return (
    <group>
      <mesh geometry={RBOX} material={TIN} position={[0, 1, 0]} scale={[tin.w, 2, tin.d]} castShadow receiveShadow />
      <mesh geometry={RBOX} material={TIN_IN} position={[0, 2.2, 0]} scale={[tin.w - 6, 0.6, tin.d - 6]} receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={RBOX} material={TIN} position={[0, tin.h / 2, (s * tin.d) / 2]} scale={[tin.w, tin.h, 2]} castShadow />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`e${s}`} geometry={RBOX} material={TIN} position={[(s * tin.w) / 2, tin.h / 2, 0]} scale={[2, tin.h, tin.d]} castShadow />
      ))}
      {/* the pencils in a row, a colour wheel */}
      {PENCIL_COLORS.map((_, i) => (
        <group key={i} position={[-2, 2.5, -tin.d / 2 + 7 + i * ((tin.d - 14) / (PENCIL_COLORS.length - 1))]}>
          <Pencil i={i} len={tin.w - 12} />
        </group>
      ))}
    </group>
  )
}

// ---- the watercolours
const ENAMEL = bruno({ color: '#2f2a3a', shade: '#1d1a26' })
const WHITE = bruno({ color: '#f7f4ee', shade: '#a59bb4' })
const PAN_COLORS = ['#d9473f', '#ef8a3a', '#f3cf3f', '#9bc34f', '#3c8a52', '#2f6f6a', '#4aa6d8', '#2f4aa3', '#7b4fb0', '#d76aa0', '#8a5a3c', '#2f2a3a']
const panMats = PAN_COLORS.map((c) => bruno({ color: c, sheen: 0.3 }))
export function Watercolors() {
  const { w, d, h, pan } = WATERCOLOR
  return (
    <group>
      <mesh geometry={RBOX} material={ENAMEL} position={[0, h / 2, 0]} scale={[w, h, d]} castShadow receiveShadow />
      {PAN_COLORS.map((_, i) => {
        const col = i % 6
        const row = Math.floor(i / 6)
        const x = -w / 2 + 10 + pan.w / 2 + col * (pan.w + 2)
        const z = (row - 0.5) * (pan.d + 4)
        return (
          <group key={i} position={[x, h, z]}>
            <mesh geometry={RBOX} material={WHITE} position={[0, 0.6, 0]} scale={[pan.w, 1.2, pan.d]} />
            <mesh geometry={RBOX} material={panMats[i]} position={[0, 1.4, 0]} scale={[pan.w - 3, 0.8, pan.d - 3]} />
          </group>
        )
      })}
      {/* the lid, opened out flat beside it: white inside, a few washes mixed on it */}
      <mesh geometry={RBOX} material={ENAMEL} position={[w + 2, 1, 0]} scale={[w, 2, d]} castShadow receiveShadow />
      <mesh geometry={RBOX} material={WHITE} position={[w + 2, 2.2, 0]} scale={[w - 6, 0.6, d - 6]} />
      {[
        [0.75 * w, -10, 0, 9],
        [1.1 * w, 8, 7, 11],
        [1.3 * w, -6, 2, 8],
      ].map(([x, z, c, s], i) => (
        <mesh key={i} geometry={DISC} material={panMats[c]} position={[x, 2.6, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[s, s * 0.8, 1]} />
      ))}
    </group>
  )
}
const DISC = new CircleGeometry(1, 20)
/** the water cup: a little yellow ceramic cup (turned from its section: a real wall, the rim rounded over, a floor
 *  inside), cloudy rinse water in it, a brush left standing in it tip down, its handle resting on the rim */
const CUP = bruno({ color: '#f2cf6a', shade: '#9a7a62', side: DoubleSide })
const CUP_IN = bruno({ color: '#e3b94e', shade: '#8a6a52', side: DoubleSide })
const WATER = bruno({ color: '#b9b2c9', shade: '#7d7a96', sheen: 0.4 })
const CUPS = { top: 34, foot: 28, h: 62, wall: 4.5, water: 44 }
export function WaterCup() {
  const { top, foot, h, wall, water } = CUPS
  const geo = useMemo(() => {
    const outer = [new Vector2(0, 0), new Vector2(foot - 3, 0), new Vector2(foot, 3), new Vector2(top, h - 2.5), new Vector2(top - wall * 0.2, h - 0.4), new Vector2(top - wall * 0.5, h)]
    const inner = [new Vector2(top - wall * 0.8, h - 0.4), new Vector2(top - wall, h - 2.5), new Vector2(foot - wall, wall + 3), new Vector2(foot - wall - 3, wall), new Vector2(0, wall)]
    return { out: new LatheGeometry(outer, 40), in: new LatheGeometry(inner, 40) }
  }, [top, foot, h, wall])
  const inner = foot - wall + ((top - foot) * water) / h // (the water's edge: the inside's radius at that height)
  return (
    <group>
      <mesh geometry={geo.out} material={CUP} castShadow receiveShadow />
      <mesh geometry={geo.in} material={CUP_IN} receiveShadow />
      <mesh geometry={DISC} material={WATER} position={[0, water, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[inner, inner, 1]} />
      {/* the brush, tip down in the water, its handle out over the rim */}
      <group position={[128, 172, 0]} rotation={[0, 0, Math.PI - 0.74]}>
        <LooseBrush i={2} />
      </group>
    </group>
  )
}

// ---- the embroidery hoop
const linenTex = paint(512, 512, (g) => {
  const r = rng(61)
  g.fillStyle = '#efe6d2'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 512; i += 3) {
    g.fillStyle = `rgba(140,120,90,${0.05 + r() * 0.05})`
    g.fillRect(i, 0, 1, 512)
    g.fillRect(0, i, 512, 1)
  }
  const c = 256
  // the flower: five petals, three of them satin-stitched, two only drawn on in blue transfer pen
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2
    const x = c + Math.cos(a) * 64
    const y = c + Math.sin(a) * 64
    if (k < 3) {
      g.save()
      g.translate(x, y)
      g.rotate(a)
      g.beginPath()
      g.ellipse(0, 0, 56, 34, 0, 0, Math.PI * 2)
      g.clip()
      for (let s = -60; s < 60; s += 4) {
        g.strokeStyle = s % 8 ? '#e7839f' : '#d96d8c'
        g.lineWidth = 3.2
        g.beginPath()
        g.moveTo(s, -40)
        g.lineTo(s + 18, 40)
        g.stroke()
      }
      g.restore()
    } else {
      g.strokeStyle = 'rgba(70,110,200,0.7)'
      g.lineWidth = 2.5
      g.setLineDash([8, 6])
      g.beginPath()
      g.ellipse(x, y, 56, 34, a, 0, Math.PI * 2)
      g.stroke()
      g.setLineDash([])
    }
  }
  // its middle, French knots
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * 24
    g.fillStyle = r() > 0.5 ? '#f4c84a' : '#e2a832'
    g.beginPath()
    g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 5, 0, Math.PI * 2)
    g.fill()
  }
  // a stem and a leaf in chain stitch
  g.strokeStyle = '#5f9e6e'
  g.lineWidth = 5
  g.setLineDash([9, 4])
  g.beginPath()
  g.moveTo(c + 20, c + 110)
  g.quadraticCurveTo(c + 50, c + 170, c + 30, c + 230)
  g.stroke()
  g.setLineDash([])
})
const LINEN = bruno({ map: linenTex ?? undefined, color: '#ffffff', shade: '#a59bb4' })
const FLOSS = bruno({ color: '#e7839f' })
export function Hoop() {
  const { r, ring, h } = HOOP
  const band = useMemo(() => {
    // a ring's band: its section a rounded rectangle, turned round
    const pts = [new Vector2(r - ring / 2, 0), new Vector2(r + ring / 2, 0), new Vector2(r + ring / 2 + 0.8, h * 0.5), new Vector2(r + ring / 2, h), new Vector2(r - ring / 2, h), new Vector2(r - ring / 2 - 0.8, h * 0.5)]
    pts.push(pts[0].clone())
    return new LatheGeometry(pts, 64)
  }, [r, ring, h])
  const inner = useMemo(() => band.clone().scale((r - ring) / r, 0.9, (r - ring) / r), [band, r, ring])
  const cloth = useMemo(() => new CircleGeometry(r - ring * 0.6, 48), [r, ring])
  const thread = useMemo(() => {
    // from the needle, up over the hoop's edge, trailing out on the blanket
    const p = [
      [18, h * 0.6 + 1, -10],
      [40, h + 6, -40],
      [r * 0.9, h + 5, -r * 0.5],
      [r * 1.2, 2, -r * 0.3],
      [r * 1.5, 1, 0],
    ].map(([x, y, z]) => new Vector3(x, y, z))
    return new TubeGeometry(new CatmullRomCurve3(p), 60, 0.7, 5)
  }, [r, h])
  return (
    <group>
      <mesh geometry={band} material={WOOD} castShadow receiveShadow />
      <mesh geometry={inner} material={WOOD} position={[0, 1, 0]} />
      <mesh geometry={cloth} material={LINEN} position={[0, h * 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      {/* the clasp: its brass block and screw */}
      <mesh geometry={RBOX} material={BRASS} position={[0, h / 2, r + ring / 2 + 5]} scale={[22, h, 8]} castShadow />
      <mesh geometry={HEX} material={BRASS} position={[0, h / 2, r + ring / 2 + 12]} rotation={[0, 0, Math.PI / 2]} scale={[3, 34, 3]} />
      {/* the needle, left in, its thread out over the edge */}
      <mesh geometry={HEX} material={WIRE} position={[18, h * 0.6 + 1, -10]} rotation={[0, 0.5, Math.PI / 2]} scale={[0.7, 42, 0.7]} />
      <mesh geometry={thread} material={FLOSS} castShadow />
      {/* a skein of floss beside it */}
      <group position={[r + 70, 0, r * 0.4]} rotation={[0, 0.6, 0]}>
        <mesh geometry={HEX} material={FLOSS} position={[0, 5, 0]} rotation={[0, 0, Math.PI / 2]} scale={[5, 70, 5]} castShadow />
        <mesh geometry={RBOX} material={WHITE} position={[0, 5, 0]} scale={[16, 11, 11]} />
      </group>
    </group>
  )
}

// ---- an origami crane
const craneGeo = (() => {
  const { span, len, h } = CRANE
  const s = span / 2
  const L = len / 2
  // its triangles (x forward, y up, z across): the body's two sides, the wings, the neck and head, the tail
  const tri = [
    // body
    [-L * 0.5, h * 0.15, 0, L * 0.5, h * 0.15, 0, 0, h * 0.5, -12],
    [L * 0.5, h * 0.15, 0, -L * 0.5, h * 0.15, 0, 0, h * 0.5, 12],
    [-L * 0.5, h * 0.15, 0, 0, 0, 0, L * 0.5, h * 0.15, 0],
    // wings, raised a little
    [L * 0.15, h * 0.48, -4, -L * 0.3, h * 0.48, -4, -L * 0.05, h * 0.8, -s],
    [-L * 0.3, h * 0.48, 4, L * 0.15, h * 0.48, 4, -L * 0.05, h * 0.8, s],
    // neck and head
    [L * 0.4, h * 0.12, -3, L * 0.4, h * 0.12, 3, L * 0.95, h, 0],
    [L * 0.95, h, -1.5, L * 0.95, h, 1.5, L * 1.12, h * 0.85, 0],
    // tail
    [-L * 0.4, h * 0.12, 3, -L * 0.4, h * 0.12, -3, -L, h * 1.05, 0],
  ]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(tri.flat()), 3))
  g.computeVertexNormals()
  return g
})()
const craneMats = new Map<string, Material>()
export function Crane({ color = '#f6c1cf' }: { color?: string }) {
  if (!craneMats.has(color)) craneMats.set(color, bruno({ color, side: DoubleSide, flatShading: true }))
  return <mesh geometry={craneGeo} material={craneMats.get(color)!} castShadow receiveShadow />
}

// ---- the succulent
const CLAY = bruno({ color: '#cf7a55', shade: '#7d4e4e' })
const SOIL = bruno({ color: '#5a4038', shade: '#3a2a2a' })
const LEAF = bruno({ color: '#9fc4ae', shade: '#5f7a8a', sheen: 0.2 })
const LEAF_GEO = new SphereGeometry(1, 12, 8)
export function Succulent() {
  const { r, h, rim } = POT
  const pot = useMemo(() => new LatheGeometry([new Vector2(0, 0), new Vector2(r * 0.72, 0), new Vector2(r * 0.86, h - rim), new Vector2(r, h - rim), new Vector2(r, h), new Vector2(r * 0.84, h), new Vector2(r * 0.8, h - rim)], 40), [r, h, rim])
  const leaves = useMemo(() => {
    const out: { p: [number, number, number]; rot: [number, number, number]; s: [number, number, number] }[] = []
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996
      const k = i / 27
      const tilt = 0.25 + k * 1.15 // (upright in the middle, lying out round the edge)
      const L = 14 + k * 20
      out.push({ p: [Math.cos(a) * (3 + k * 14), h - 6 + Math.cos(tilt) * L * 0.5, Math.sin(a) * (3 + k * 14)], rot: [0, -a, -tilt], s: [L * 0.32, L * 0.55, L * 0.16] })
    }
    return out
  }, [h])
  return (
    <group>
      <mesh geometry={pot} material={CLAY} castShadow receiveShadow />
      <mesh geometry={DISC} material={SOIL} position={[0, h - 8, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[r * 0.82, r * 0.82, 1]} />
      {leaves.map((l, i) => (
        <group key={i} position={l.p} rotation={l.rot}>
          <mesh geometry={LEAF_GEO} material={LEAF} position={[0, l.s[1] * 0.6, 0]} scale={l.s} castShadow />
        </group>
      ))}
    </group>
  )
}
