import { useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, LatheGeometry, Path, Quaternion, Shape, SphereGeometry, Vector2, Vector3, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { painting } from './painting'
import { BRUSH, CANVAS, EASEL, JAR, PAINTS, PALETTE, STOOL, TUBE } from './spec'

/**
 * The art corner's things (./spec), real mm, toy style: chunky, matte, rounded.
 *
 *   <Easel>     the A-frame easel, leaning back, the canvas on its tray under the top clamp; `paintable`: a press on
 *               the canvas paints (./painting: the brush ./PaintBox picks), not turning the view or picking it up
 *   <Stool>     three legs splayed under a round seat
 *   <Palette>   the oval palette, its thumb hole, a dab of each paint round it
 *   <BrushJar>  a glazed jar of brushes, their tips in colours
 *   <Tube>      a paint tube, squeezed, its end crimped
 */
const WOOD = bruno({ color: '#d9b48a', shade: '#8a6a5a' })
const WOOD_DARK = bruno({ color: '#b98d62', shade: '#6e5048' })
const WRAP = bruno({ color: '#f3ece0', shade: '#a99aa8' }) // (the canvas round its edges, and its back)
const METAL = bruno({ color: '#c9c6cf', shade: '#77738a' })
const GLAZE = bruno({ color: '#a9cbe0', shade: '#6d7c9e', sheen: 0.3, side: DoubleSide })
const RBOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.18)
const UP = new Vector3(0, 1, 0)

/** a stick from a to b, its section w × d (a rounded box stretched along it) */
function Stick({ a, b, w, d, m = WOOD }: { a: Vector3; b: Vector3; w: number; d: number; m?: Material }) {
  const dir = b.clone().sub(a)
  const q = new Quaternion().setFromUnitVectors(UP, dir.clone().normalize())
  return <mesh geometry={RBOX} material={m} position={a.clone().add(b).multiplyScalar(0.5)} quaternion={q} scale={[w, dir.length(), d]} castShadow receiveShadow />
}

export function Easel({ paintable = false }: { paintable?: boolean }) {
  const p = useMemo(painting, [])
  const { mast, leg, back, tray, clamp, lean } = EASEL
  // where the canvas stands: on the tray, in front of the mast
  const z = mast.d / 2 + CANVAS.d / 2 + 4
  const y0 = tray.y + tray.t / 2
  const front = useMemo(() => {
    const m = bruno({ map: p.texture })
    return [WRAP, WRAP, WRAP, WRAP, m, WRAP]
  }, [p])
  const box = useMemo(() => new BoxGeometry(CANVAS.w, CANVAS.h, CANVAS.d), [])
  // the back leg, from up by the top (where it's hinged) down to its foot behind
  const hinge = new Vector3(0, leg.top + 40, -mast.d / 2).applyAxisAngle(new Vector3(1, 0, 0), -lean)
  // painting it
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const down = useRef(false)
  const press = (e: ThreeEvent<PointerEvent>) => {
    if (!paintable || e.button !== 0 || !e.uv) return
    e.stopPropagation()
    down.current = true
    if (controls) controls.enabled = false
    ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
    p.begin(e.uv.x, e.uv.y)
    const up = () => {
      down.current = false
      p.end()
      if (controls) controls.enabled = true
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointerup', up)
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!down.current || !e.uv) return
    e.stopPropagation()
    p.to(e.uv.x, e.uv.y)
  }
  return (
    <group>
      {/* the front: mast, legs, tray, canvas, clamp, leaning back together */}
      <group rotation={[-lean, 0, 0]}>
        <Stick a={new Vector3(0, 140, 0)} b={new Vector3(0, mast.h, 0)} w={mast.w} d={mast.d} />
        {[-1, 1].map((s) => (
          <Stick key={s} a={new Vector3((s * leg.apart) / 2, leg.top, -2)} b={new Vector3(s * leg.spread, 0, -2)} w={leg.w} d={leg.d} />
        ))}
        {/* the brace across low down, and the tray on its bracket */}
        <Stick a={new Vector3(-leg.spread * 0.8, 260, -2)} b={new Vector3(leg.spread * 0.8, 260, -2)} w={26} d={18} m={WOOD_DARK} />
        <mesh geometry={RBOX} material={WOOD} position={[0, tray.y, mast.d / 2 + tray.d / 2 - 6]} scale={[tray.w, tray.t, tray.d]} castShadow receiveShadow />
        <mesh geometry={RBOX} material={WOOD} position={[0, tray.y + tray.lip / 2, mast.d / 2 + tray.d - 8]} scale={[tray.w, tray.lip + tray.t, 12]} castShadow />
        <mesh geometry={RBOX} material={WOOD_DARK} position={[0, tray.y - 40, 0]} scale={[70, 90, mast.d + 16]} castShadow />
        {/* the canvas, the painting on its face; its stretcher bars behind */}
        <mesh geometry={box} material={front} position={[0, y0 + CANVAS.h / 2, z]} castShadow receiveShadow onPointerDown={press} onPointerMove={move} />
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh geometry={RBOX} material={WOOD} position={[(s * (CANVAS.w - CANVAS.bar)) / 2, y0 + CANVAS.h / 2, z - CANVAS.d / 2 - 2]} scale={[CANVAS.bar, CANVAS.h - 6, 4]} />
            <mesh geometry={RBOX} material={WOOD} position={[0, y0 + CANVAS.h / 2 + (s * (CANVAS.h - CANVAS.bar)) / 2, z - CANVAS.d / 2 - 2]} scale={[CANVAS.w - 6, CANVAS.bar, 4]} />
          </group>
        ))}
        {/* the top clamp, down on the canvas's top edge */}
        <mesh geometry={RBOX} material={WOOD_DARK} position={[0, y0 + CANVAS.h + clamp.h / 2, z - 6]} scale={[clamp.w, clamp.h, clamp.d]} castShadow />
        <mesh geometry={RBOX} material={WOOD} position={[0, y0 + CANVAS.h + clamp.h / 2, -mast.d / 2 - 8]} scale={[22, 22, 14]} />
      </group>
      {/* the back leg */}
      <Stick a={hinge} b={new Vector3(0, 0, back.foot)} w={back.w} d={back.d} />
    </group>
  )
}

export function Stool() {
  const seat = useMemo(() => new CylinderGeometry(STOOL.seat, STOOL.seat - 6, STOOL.t, 40), [])
  return (
    <group>
      <mesh geometry={seat} material={WOOD} position={[0, STOOL.h - STOOL.t / 2, 0]} castShadow receiveShadow />
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.5
        return <Stick key={i} a={new Vector3(Math.cos(a) * STOOL.seat * 0.55, STOOL.h - STOOL.t, Math.sin(a) * STOOL.seat * 0.55)} b={new Vector3(Math.cos(a) * STOOL.splay, 0, Math.sin(a) * STOOL.splay)} w={STOOL.leg} d={STOOL.leg} m={WOOD_DARK} />
      })}
      {/* a rung round the legs */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.5
        const b2 = ((i + 1) / 3) * Math.PI * 2 + 0.5
        const r = STOOL.splay * 0.62
        return <Stick key={`r${i}`} a={new Vector3(Math.cos(a) * r, 160, Math.sin(a) * r)} b={new Vector3(Math.cos(b2) * r, 160, Math.sin(b2) * r)} w={12} d={12} m={WOOD_DARK} />
      })}
    </group>
  )
}

/** the palette: lying flat, its thumb hole toward -x; a dab of each paint round it */
const DAB = new SphereGeometry(1, 14, 10)
export function Palette() {
  const geo = useMemo(() => {
    const s = new Shape()
    s.absellipse(0, 0, PALETTE.w / 2, PALETTE.d / 2, 0, Math.PI * 2, false, 0)
    const hole = new Path()
    hole.absarc(-PALETTE.w * 0.3, -PALETTE.d * 0.12, PALETTE.hole, 0, Math.PI * 2, true)
    s.holes.push(hole)
    const g = new ExtrudeGeometry(s, { depth: PALETTE.t, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 2, bevelSegments: 2, curveSegments: 40 })
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const dabs = useMemo(() => {
    const mats = PAINTS.map((c) => bruno({ color: c.hex, sheen: 0.4 }))
    return PAINTS.map((_, i) => {
      const a = -0.6 + (i / PAINTS.length) * Math.PI * 1.75
      return { m: mats[i], x: Math.cos(a) * PALETTE.w * 0.36, z: -Math.sin(a) * PALETTE.d * 0.34, s: 13 + ((i * 7) % 5) * 1.6 }
    })
  }, [])
  return (
    <group>
      <mesh geometry={geo} material={WOOD} castShadow receiveShadow />
      {dabs.map((d, i) => (
        <mesh key={i} geometry={DAB} material={d.m} position={[d.x, PALETTE.t + 3, d.z]} scale={[d.s, 5, d.s * 0.85]} castShadow />
      ))}
    </group>
  )
}

/** a brush: its handle, the ferrule, the bristles in a colour */
const HANDLE = new CylinderGeometry(1, 1, 1, 10)
const TIP = new SphereGeometry(1, 10, 8)
const HANDLES = [bruno({ color: '#c6503f' }), bruno({ color: '#2f2a3a' }), WOOD, bruno({ color: '#e6b84e' })]
function Brush({ tip, handle, at, tilt }: { tip: Material; handle: Material; at: [number, number, number]; tilt: [number, number, number] }) {
  return (
    <group position={at} rotation={tilt}>
      <mesh geometry={HANDLE} material={handle} position={[0, BRUSH.len * 0.4, 0]} scale={[BRUSH.handle, BRUSH.len * 0.8, BRUSH.handle]} castShadow />
      <mesh geometry={HANDLE} material={METAL} position={[0, BRUSH.len * 0.84, 0]} scale={[BRUSH.ferrule, BRUSH.len * 0.1, BRUSH.ferrule]} />
      <mesh geometry={TIP} material={tip} position={[0, BRUSH.len * 0.93, 0]} scale={[BRUSH.ferrule, 16, BRUSH.ferrule * 0.7]} />
    </group>
  )
}
/** the jar: turned from its section, a real wall (thick, glazed, the rim rounded over), a floor inside, darker within */
const GLAZE_IN = bruno({ color: '#7f9fbd', shade: '#4d5a7a', side: DoubleSide })
export function BrushJar() {
  const { r, h, wall } = JAR
  const geo = useMemo(() => {
    const o = r * 0.93 // (a little narrower at its foot)
    const outer = [new Vector2(0, 0), new Vector2(o - 3, 0), new Vector2(o, 3), new Vector2(r, h - 3), new Vector2(r - wall * 0.15, h - 0.6), new Vector2(r - wall * 0.5, h)]
    const inner = [new Vector2(r - wall * 0.85, h - 0.6), new Vector2(r - wall, h - 3), new Vector2(o - wall, wall + 3), new Vector2(o - wall - 3, wall), new Vector2(0, wall)]
    return { out: new LatheGeometry(outer, 48), in: new LatheGeometry(inner, 48) }
  }, [r, h, wall])
  const tips = useMemo(() => [2, 7, 4, 9, 0, 3].map((i) => bruno({ color: PAINTS[i].hex })), [])
  return (
    <group>
      <mesh geometry={geo.out} material={GLAZE} castShadow receiveShadow />
      <mesh geometry={geo.in} material={GLAZE_IN} receiveShadow />
      {/* the brushes stood in it, their feet near the middle, leaning out to rest on the rim (inside it, not through it) */}
      {tips.map((t, i) => {
        const a = (i / tips.length) * Math.PI * 2 + 0.3
        const lean = 0.17 + (i % 3) * 0.025
        return <Brush key={i} tip={t} handle={HANDLES[i % HANDLES.length]} at={[Math.cos(a) * 7, wall, Math.sin(a) * 7]} tilt={[Math.sin(a) * lean, 0, -Math.cos(a) * lean]} />
      })}
    </group>
  )
}

/** a paint tube, lying down along x: squeezed in the middle, its cap at +x, the far end crimped flat */
const TUBE_BODY = new CylinderGeometry(1, 1, 1, 18)
const CAP = new CylinderGeometry(1, 1, 1, 14)
export function Tube({ color }: { color: string }) {
  const m = useMemo(() => bruno({ color }), [color])
  const band = useMemo(() => bruno({ color: '#f3ece0' }), [])
  return (
    <group rotation={[0, 0, Math.PI / 2]} position={[0, TUBE.r * 0.8, 0]}>
      <mesh geometry={TUBE_BODY} material={band} scale={[TUBE.r, TUBE.len * 0.7, TUBE.r * 0.78]} castShadow />
      <mesh geometry={TUBE_BODY} material={m} position={[0, -TUBE.len * 0.05, 0]} scale={[TUBE.r * 1.01, TUBE.len * 0.3, TUBE.r * 0.79]} />
      {/* the crimp, flattened */}
      <mesh geometry={RBOX} material={METAL} position={[0, TUBE.len * 0.39, 0]} scale={[TUBE.r * 2.3, 10, 3]} />
      {/* the shoulder and cap */}
      <mesh geometry={CAP} material={METAL} position={[0, -TUBE.len * 0.38, 0]} scale={[TUBE.r * 0.6, 6, TUBE.r * 0.6]} />
      <mesh geometry={CAP} material={WOOD_DARK} position={[0, -TUBE.len * 0.38 - TUBE.cap / 2 - 3, 0]} scale={[TUBE.r * 0.55, TUBE.cap, TUBE.r * 0.55]} castShadow />
    </group>
  )
}
