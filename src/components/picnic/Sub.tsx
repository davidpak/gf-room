import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Shape, ShapeGeometry, Vector2, Vector3 } from 'three'
import { bruno } from '../quad/bruno'
import { loft, orient, type Ring } from './loft'
import { paint, rng } from './paint'

/**
 * A sub half wrapped in deli paper (../spec [D]), in real millimetres: a soft sub roll (golden crust, darker on
 * its crown, pale underneath), split along one side and filled (cheese, turkey folded in, tomato, greens), cut
 * across on the bias; its cut face shows the crumb and the fillings in their layers, the greens and the turkey
 * spill out of the split along its side. White paper is wrapped round its bottom and up its sides, open at the
 * cut, folded over its end, crinkled.
 *
 * Its frame: lying on its bottom (y up), its length along x from its rounded end (x = -L) to its cut (round
 * x = 0, slanting across with z), its split open toward +z. `v` varies the bread and the paper a little.
 */
export const SUB = { l: 150, w: 72, h: 56, bias: 0.6, split: 22, gap: [9, 25] as [number, number] } // [D]
const { l: L, w: W, h: H, bias: BIAS, split: YC } = SUB
const TAN = Math.tan(BIAS)
const TIP = 38 // (its rounded end)
const HW = W / 2
const Y_TOP = H - YC // (the crown above the split)
/** how open the split is across it (z): pinched at the hinge, wide at the open side; closed toward the end */
const gap = (z: number, x0: number) => {
  const f = Math.max(0, Math.min(1, (z / HW + 1) / 2))
  const open = SUB.gap[0] + (SUB.gap[1] - SUB.gap[0]) * Math.pow(f, 1.3)
  const along = Math.max(0, Math.min(1, (x0 + L - 20) / 70))
  return open * along * along * (3 - 2 * along)
}
/** how full the roll is along its length (x0 = its middle line's x): rounded off at its end */
const fullness = (x0: number) => {
  const d = x0 + L
  return d >= TIP ? 1 : Math.sqrt(Math.max(0, 1 - (1 - d / TIP) ** 2))
}
/** the loaf's section round θ (0 at +z, π/2 its crown): [z, y] before the split opens */
const loaf = (t: number): [number, number] => {
  const c = Math.cos(t)
  const s = Math.sin(t)
  const z = HW * Math.sign(c) * Math.pow(Math.abs(c), 0.75)
  const y = s >= 0 ? YC + Y_TOP * Math.pow(s, 0.9) : YC - YC * Math.pow(-s, 0.35)
  return [z, y]
}

// ---- its looks
const PAPER = bruno({ color: '#f8f5ef', shade: '#d3c6cc', side: DoubleSide })
const CRUST = bruno({ vertexColors: true, color: '#ffffff', shade: '#8f6a82' })
const FILL = {
  turkey: bruno({ color: '#efcdb8', shade: '#b48d9c', side: DoubleSide }),
  greens: bruno({ color: '#6aa84a', shade: '#46745e', side: DoubleSide }),
  greensLight: bruno({ color: '#9fd06b', shade: '#5f8a6a', side: DoubleSide }),
  cheese: bruno({ color: '#f6c445', shade: '#b39184', side: DoubleSide }),
}
const CRUMB_HEX = '#f8ead0'

/** its cut face, painted in its own (z, y) mm: crumb and crust above and below, the fillings between */
const PX = 5
const Z0 = -44
const Y0 = -4
const FW = 88
const FH = 96
function cutTex(v: number) {
  const r = rng(71 + v)
  return paint(FW * PX, FH * PX, (g) => {
    const X = (z: number) => (z - Z0) * PX
    const Y = (y: number) => (FH + Y0 - y) * PX
    g.fillStyle = CRUMB_HEX
    g.fillRect(0, 0, FW * PX, FH * PX)
    // the crumb: open and soft, its holes and their shadows
    for (let i = 0; i < 1400; i++) {
      const x = r() * FW * PX
      const y = r() * FH * PX
      const s = (0.4 + r() * 1.2) * PX
      g.fillStyle = r() < 0.5 ? `rgba(214,172,118,${0.12 + r() * 0.18})` : `rgba(255,253,244,${0.35 + r() * 0.4})`
      g.beginPath()
      g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2)
      g.fill()
    }
    // the fillings, layer on layer in the split (bottom up): cheese, turkey folded over and over, tomato, greens
    const band = (f: number, z: number, k: number) => YC + gap(z, 0) * (f + 0.035 * Math.sin(z * 0.45 + k * 1.7))
    const layer = (f0: number, f1: number, k: number, fill: string, from = -HW - 2, to = HW + 2) => {
      g.fillStyle = fill
      g.beginPath()
      for (let z = from; z <= to; z += 1) g.lineTo(X(z), Y(band(f0, z, k)))
      for (let z = to; z >= from; z -= 1) g.lineTo(X(z), Y(band(f1, z, k + 1)))
      g.closePath()
      g.fill()
    }
    layer(-0.05, 0.16, 0, '#f6c445')
    layer(0.16, 0.56, 1, '#efc6ae')
    // (the turkey's folds: darker lines where it's turned over on itself)
    g.strokeStyle = 'rgba(205,140,120,0.7)'
    g.lineWidth = 0.6 * PX
    for (const f of [0.26, 0.36, 0.47]) {
      g.beginPath()
      for (let z = -HW; z <= HW; z += 1) g.lineTo(X(z), Y(band(f, z, 2) + Math.sin(z * 0.7 + f * 20) * 0.6))
      g.stroke()
    }
    layer(0.56, 0.62, 3, '#fbf3df') // (a little mayo)
    layer(0.6, 0.76, 4, '#d9432f', -HW + 8, HW - 12)
    layer(0.63, 0.73, 5, '#f07a62', -HW + 11, HW - 15)
    layer(0.74, 1.05, 6, '#4f8f3a')
    g.strokeStyle = '#93c965'
    g.lineWidth = 0.8 * PX
    g.beginPath()
    for (let z = -HW; z <= HW; z += 1) g.lineTo(X(z), Y(band(0.8, z, 7) + Math.sin(z * 1.3) * 0.8))
    g.stroke()
    // the crust's rim round the outside (not across the split)
    const rim = (top: boolean) => {
      g.beginPath()
      for (let i = 0; i <= 60; i++) {
        const t = top ? (i / 60) * Math.PI : Math.PI + (i / 60) * Math.PI
        const [z, y] = loaf(t)
        g.lineTo(X(z), Y(top ? y + gap(z, 0) : y))
      }
      g.stroke()
    }
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = 'rgba(214,170,110,0.7)'
    g.lineWidth = 5 * PX
    rim(true)
    rim(false)
    g.strokeStyle = '#bd7d3f'
    g.lineWidth = 2.6 * PX
    rim(true)
    rim(false)
  })
}

const made: Record<number, ReturnType<typeof build>> = {}
function build(v: number) {
  const r = rng(13 + v * 7)
  // ---- the bread: its two halves lofted end to end, the crust coloured, the crumb in the split pale
  const along: number[] = []
  for (let j = 0; j <= 14; j++) along.push(-L + TIP * (1 - Math.cos((Math.PI / 2) * (j / 14))))
  for (let j = 1; j <= 34; j++) along.push(-L + TIP + ((L - TIP) * j) / 34)
  const crustCol = (y: number, top: boolean, t: number) => {
    // pale underneath, golden up its sides, deeper on its crown, flecked
    const k = top ? Math.pow(Math.sin(t), 2) : 0
    const c = top ? new Color('#d6a062').lerp(new Color('#b2733a'), k) : new Color('#ead0a0').lerp(new Color('#ddb27a'), Math.min(1, y / YC))
    return c.multiplyScalar(0.94 + r() * 0.1)
  }
  const crumb = new Color(CRUMB_HEX)
  const half = (top: boolean) => {
    const M = 26
    const rings: Ring[] = along.map((x0) => {
      const s = fullness(x0)
      const sy = Math.pow(s, 0.6)
      const p: Vector3[] = []
      const c: Color[] = []
      const at = (z: number, y: number) => {
        // (its end rounded off: drawn in toward its middle; the cut slanting across)
        const zz = z * s
        const yy = top ? YC + gap(z, x0) + (y - YC) * sy : YC - (YC - y) * sy
        const x = x0 + ((x0 + L) / L) * zz * TAN
        return new Vector3(x, yy, zz)
      }
      for (let i = 0; i <= M; i++) {
        const t = top ? (i / M) * Math.PI : Math.PI + (i / M) * Math.PI
        const [z, y] = loaf(t)
        p.push(at(z, y))
        c.push(crustCol(y, top, t))
      }
      // across the split (the crumb), back to where it began
      for (let i = 0; i <= 6; i++) {
        const z = top ? -HW + (2 * HW * i) / 6 : HW - (2 * HW * i) / 6
        p.push(at(z, YC))
        c.push(crumb)
      }
      return { p, c }
    })
    return orient(loft(rings), (m) => new Vector3(m.x, top ? YC + 20 : YC * 0.5, 0))
  }
  const bottom = half(false)
  const top = half(true)
  // ---- its cut face: one outline round both halves and the split between
  const outline: Vector2[] = []
  for (let i = 0; i <= 40; i++) {
    const [z, y] = loaf(Math.PI + (i / 40) * Math.PI)
    outline.push(new Vector2(z, y))
  }
  for (let i = 0; i <= 40; i++) {
    const [z, y] = loaf((i / 40) * Math.PI)
    outline.push(new Vector2(z, y + gap(z, 0)))
  }
  const face = new ShapeGeometry(new Shape(outline))
  {
    const p = face.attributes.position
    const uv = face.attributes.uv
    for (let i = 0; i < p.count; i++) {
      const z = p.getX(i)
      const y = p.getY(i)
      p.setXYZ(i, z * TAN + 0.3, y, z)
      uv.setXY(i, (z - Z0) / FW, (y - Y0) / FH)
    }
    orient(face, (m) => new Vector3(m.x - 30, m.y, m.z))
  }
  const faceMat = bruno({ map: cutTex(v) ?? undefined, color: '#ffffff', shade: '#e2c8b4' })
  // ---- the fillings spilling out of the split along its sides: cheese, turkey, greens
  const spill = (side: 1 | -1, f: number, out: [number, number], wave: number, seed: number, from = -L + 55) => {
    const rr = rng(seed)
    const ph = rr() * 6
    const pos: number[] = []
    const n = 40
    for (let i = 0; i <= n; i++) {
      const x0 = from + ((0 - from) * i) / n
      const s = fullness(x0)
      const zEdge = side * HW * s
      const o = out[0] + (out[1] - out[0]) * (0.5 + 0.5 * Math.sin(x0 * 0.11 + ph)) + 1.4 * Math.sin(x0 * 0.37 + ph * 2)
      const y = YC + gap(zEdge, x0) * f
      const zi = zEdge - side * 6
      const zo = zEdge + side * o
      const xi = x0 + ((x0 + L) / L) * zi * TAN
      const xo = x0 + ((x0 + L) / L) * zo * TAN + 1.5
      pos.push(xi, y, zi, xo, y + wave * Math.sin(x0 * 0.5 + ph) - wave * 0.6, zo)
    }
    const idx: number[] = []
    for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }
  const n = new Vector3(1, 0, -TAN).normalize() // (out of the cut face)
  const frill = (f: number, out: [number, number], droop: [number, number], wave: number, seed: number, z0 = -HW * 0.92, z1 = HW * 0.96) => {
    const rr = rng(seed)
    const ph = rr() * 6
    const pos: number[] = []
    const k = Math.ceil((z1 - z0) / 1.5)
    for (let i = 0; i <= k; i++) {
      const z = z0 + ((z1 - z0) * i) / k
      const y = YC + gap(z, 0) * f
      const o = out[0] + (out[1] - out[0]) * (0.5 + 0.5 * Math.sin(z * 0.23 + ph))
      const d = droop[0] + (droop[1] - droop[0]) * (0.5 + 0.5 * Math.sin(z * 0.17 + ph * 1.7))
      const inner = new Vector3(z * TAN, y, z).addScaledVector(n, -2)
      const outer = new Vector3(z * TAN, y - d + wave * Math.sin(z * 0.9 + ph), z).addScaledVector(n, o)
      pos.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z)
    }
    const idx: number[] = []
    for (let i = 0; i < k; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }
  const spills = [
    { g: frill(0.08, [1.5, 3], [0.5, 2], 0.3, 3 + v), m: FILL.cheese },
    { g: frill(0.36, [3, 9], [2, 9], 1.2, 5 + v), m: FILL.turkey },
    { g: frill(0.52, [2, 6], [1, 5], 1, 15 + v, -HW * 0.6, HW * 0.8), m: FILL.turkey },
    { g: frill(0.86, [2, 7], [0, 3], 1.8, 7 + v), m: FILL.greens },
    { g: frill(0.94, [1, 4], [-1, 1], 1.4, 9 + v, -HW * 0.5, HW * 0.9), m: FILL.greensLight },
    { g: spill(1, 0.85, [3, 9], 2.4, 11 + v, -60), m: FILL.greens },
    { g: spill(1, 0.4, [1, 4], 1, 13 + v, -40), m: FILL.turkey },
  ]
  // ---- the paper: round its bottom and up its sides, folded over its end, open at the cut, crinkled
  const pr = rng(91 + v)
  const ph = [pr() * 6, pr() * 6, pr() * 6]
  const paperRings: Ring[] = []
  const N = 40
  for (let j = 0; j <= 46; j++) {
    const x0 = j <= 14 ? -L - 5 + (TIP + 5) * (1 - Math.cos((Math.PI / 2) * (j / 14))) : -L + TIP + ((L - TIP + 9) * (j - 14)) / 32
    const d = x0 + L + 5
    const s = d >= TIP + 5 ? 1 : Math.sqrt(Math.max(0, 1 - (1 - d / (TIP + 5)) ** 2))
    const flare = Math.max(0, (x0 + 14) / 23) // (opening out past the cut)
    const p: Vector3[] = []
    // its top edge, uneven: lower on the hinge side, higher on the open side where the greens push it out
    const a0 = 1.42 + 0.09 * Math.sin(x0 * 0.06 + ph[0]) + 0.03 * Math.sin(x0 * 0.17 + ph[1])
    const a1 = 1.3 + 0.08 * Math.sin(x0 * 0.05 + ph[2]) + 0.03 * Math.sin(x0 * 0.15 + ph[0])
    for (let i = 0; i <= N; i++) {
      const a = a0 + ((2 * Math.PI - a1 - a0) * i) / N // (round from the open side's top edge, under, up the hinge side)
      const sa = Math.sin(a)
      const ca = Math.cos(a)
      const crinkle = 0.9 * Math.sin(x0 * 0.13 + a * 4.1 + ph[1]) + 0.6 * Math.sin(x0 * 0.29 - a * 7.3 + ph[2]) + 0.3 * Math.sin(a * 11 + x0 * 0.4)
      const k = (1 + flare * 0.1) * (1 + (crinkle + 1.5) * 0.012)
      const z = (HW + 5) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.55) * s * k
      const y0 = ca >= 0 ? 28 + 36 * Math.pow(ca, 0.9) : 28 - 30.5 * Math.pow(-ca, 0.35)
      const y = 28 + (y0 - 28) * Math.pow(s, 0.6) * (ca < 0 ? 1 : k) + (ca < 0 ? 0 : flare * 3)
      const x = x0 + ((x0 + L) / L) * z * TAN + flare * 2
      p.push(new Vector3(x, Math.max(-2.5, y), z))
    }
    paperRings.push({ p })
  }
  const paper = orient(loft(paperRings, false), (m) => new Vector3(m.x, 28, 0))
  return { bottom, top, face, faceMat, spills, paper }
}

export function Sub({ v = 0 }: { v?: number }) {
  const s = useMemo(() => (made[v] ??= build(v)), [v])
  return (
    <group>
      <mesh geometry={s.bottom} material={CRUST} castShadow receiveShadow />
      <mesh geometry={s.top} material={CRUST} castShadow receiveShadow />
      <mesh geometry={s.face} material={s.faceMat} receiveShadow />
      {s.spills.map((f, i) => (
        <mesh key={i} geometry={f.g} material={f.m} castShadow />
      ))}
      <mesh geometry={s.paper} material={PAPER} castShadow receiveShadow />
    </group>
  )
}
/** its box, for a collider (its frame): half sizes and middle */
export const SUB_BOX = { half: [L / 2 + 4, 36, HW + 6] as [number, number, number], at: [-L / 2 + 4, 34, 0] as [number, number, number] }
