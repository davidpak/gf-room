import { useMemo, useRef } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, BufferGeometry, type Mesh } from 'three'
import { createFabricMaterial, PLUSH_MM, useDivots, type DivotConfig } from '../../lib/fabric'
import { fastHits } from '../../lib/render/fastHits'
import { BED } from './spec'

/**
 * Rina's two-sided blanket, modelled (no simulation): it lies over the foot end of the bed,
 * rolls over the mattress's rounded edges and hangs down the sides and the foot in soft folds,
 * with its head end turned down like a made bed. Thick, with a rounded hem.
 *
 *   outside  smooth, darker micro-fleece (and the hem)
 *   inside   lighter sherpa pile (lib/fabric getPlushMaps): it shows where the head end turns down
 *
 *   click  a soft divot where you pressed, like the sheet
 *
 * Shape is a formula, the same way the cover is made (./BedSheet.tsx). Every point of the flat
 * blanket (s along, t across) goes through:
 *   1 round corners   the flat blanket's corners are rounded, like a hemmed blanket
 *   2 turn-down       past the crease the blanket rolls over a half circle and lies back on top
 *   3 drape           over the cover's rounded top edge, then hanging straight down
 *   4 life            outward folds that grow toward the hem, a wavy hem, corner tails that kick
 *                     out, gentle lumps on top
 * Then the mid-surface gets a real thickness: two shells and a rounded hem joining them.
 *
 * Bed-local frame (X along the bed, foot at -X), millimetres. Symmetric across the bed, so the
 * room's mirrored bed needs nothing special.
 */
const B = BED.blanket
const M = BED.mattress
const T = B.thickness
const GRID = 15 // mm between vertices
const DIVOT: DivotConfig = { count: 8, radius: 85, depth: 13, crease: 1.5, sinkIn: 0.6, hold: 1.2, relax: 6 }

// the cover (./BedSheet.tsx): a rounded box, radius 50, 5 mm proud of the mattress
const COVER_R = M.radius + 5
const COVER_TOP = BED.deck + M.h + 5
const INNER = { x: M.len / 2 + 5 - COVER_R, z: M.w / 2 + 5 - COVER_R, y: COVER_TOP - COVER_R }
const R = COVER_R + T / 2 + 1 // the blanket's mid-surface rolls over the edge at this radius
const FOLD_R = T / 2 + 3 // radius of the turn-down roll (layers sit a hair apart: lofty)
const X_FOOT = -(INNER.x + B.footHang + (Math.PI * R) / 2) // where the flat blanket's foot edge lies
const S_CREASE = B.crease - X_FOOT

/** Mid-surface point for flat blanket coordinates (s along from the foot, t across). */
function midPoint(s0: number, t0: number, out: number[]) {
  // 1 round the corners: map each corner square onto a quarter disc
  let s = s0
  let t = t0
  const rc = B.cornerRound
  const cs = s < rc ? rc - s : s > B.along - rc ? s - (B.along - rc) : 0
  const ct = Math.abs(t) > B.across / 2 - rc ? Math.abs(t) - (B.across / 2 - rc) : 0
  if (cs > 0 && ct > 0) {
    const k = Math.max(cs, ct) / Math.hypot(cs, ct)
    s = s < rc ? rc - cs * k : B.along - rc + cs * k
    t = Math.sign(t) * (B.across / 2 - rc + ct * k)
  }

  // 2 the turn-down: past the crease, roll over a half circle and come back on top
  let x = X_FOOT + s
  let lift = 0
  const a = s - S_CREASE
  if (a > 0) {
    const arc = Math.PI * FOLD_R
    if (a < arc) {
      x = B.crease + FOLD_R * Math.sin(a / FOLD_R)
      lift = FOLD_R * (1 - Math.cos(a / FOLD_R))
    } else {
      x = B.crease - (a - arc)
      lift = 2 * FOLD_R
    }
  }
  let z = t

  // gentle lumps on top: the same field for both layers, so they stay parallel
  const lump = 3.5 * Math.sin(x * 0.0043 + 1.3) * Math.sin(z * 0.0051 + 0.2) + 2 * Math.sin(x * 0.011 + z * 0.0083 + 0.7)

  // 3 drape over the cover's rounded top edge (radius grows with the lift: the top layer rolls outside)
  const qx = Math.max(-INNER.x, Math.min(INNER.x, x))
  const qz = Math.max(-INNER.z, Math.min(INNER.z, z))
  const dx = x - qx
  const dz = z - qz
  const d = Math.hypot(dx, dz)
  const r = R + lift
  if (d < 1e-6) {
    out[0] = x
    out[1] = INNER.y + r + lump
    out[2] = z
    return
  }
  const ux = dx / d
  const uz = dz / d
  // position along the edge (for folds): x on the long sides, z at the foot
  const along = qx * Math.abs(uz) + qz * Math.abs(ux)
  // wavy hem: the hanging length varies a little
  const dd = d + 9 * Math.sin(along * 0.021 + 0.8) * Math.min(1, d / 200)
  const quarter = (Math.PI * r) / 2
  let horiz: number
  let y: number
  if (dd < quarter) {
    const th = dd / r
    horiz = r * Math.sin(th)
    y = INNER.y + r * Math.cos(th) + lump * Math.cos(th)
  } else {
    horiz = r
    y = INNER.y - (dd - quarter)
  }
  // 4 hanging folds: bulge outward only (never into the mattress), deeper toward the hem.
  // A function of height, so both layers of the turn-down bulge together
  const depth = Math.max(0, INNER.y - y)
  const grow = Math.min(1, depth / 170)
  const folds = 0.55 + 0.45 * (0.6 * Math.sin(along * 0.0196 + 1.1) + 0.4 * Math.sin(along * 0.037 + 2.9))
  horiz += 16 * grow * grow * folds
  // corner tails: where it hangs diagonally, the spare fabric kicks out and flutes
  const corner = (2 * ux * uz) ** 2
  const phi = Math.atan2(Math.abs(uz), Math.abs(ux))
  horiz += corner * Math.max(0, depth - 30) * (0.42 + 0.12 * Math.sin(phi * 9))
  out[0] = qx + ux * horiz
  out[1] = y
  out[2] = qz + uz * horiz
}

/** The solid blanket: top shell, bottom shell, and a rounded hem around the edge. */
function makeBlanketGeometry() {
  const ns = Math.round(B.along / GRID)
  const nt = Math.round(B.across / GRID)
  const nx = ns + 1
  const nz = nt + 1
  const N = nx * nz
  const mid = new Float32Array(N * 3)
  const p = [0, 0, 0]
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      midPoint((i / ns) * B.along, (j / nt - 0.5) * B.across, p)
      mid.set(p, (j * nx + i) * 3)
    }
  // mid-surface normals by central differences on the grid
  const nrm = new Float32Array(N * 3)
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const l = (j * nx + Math.max(i - 1, 0)) * 3
      const r = (j * nx + Math.min(i + 1, ns)) * 3
      const dn = (Math.max(j - 1, 0) * nx + i) * 3
      const up = (Math.min(j + 1, nt) * nx + i) * 3
      const ax = mid[r] - mid[l]
      const ay = mid[r + 1] - mid[l + 1]
      const az = mid[r + 2] - mid[l + 2]
      const bx = mid[up] - mid[dn]
      const by = mid[up + 1] - mid[dn + 1]
      const bz = mid[up + 2] - mid[dn + 2]
      // (along × across) points down on the bottom layer: flip it so +normal is "up" there
      let cx = ay * bz - az * by
      let cy = az * bx - ax * bz
      let cz = ax * by - ay * bx
      const len = Math.hypot(cx, cy, cz) || 1
      cx /= len
      cy /= len
      cz /= len
      nrm.set([-cx, -cy, -cz], (j * nx + i) * 3)
    }
  // boundary loop and the outward (in-surface) direction at each boundary vertex
  const loop: number[] = []
  for (let i = 0; i < nx; i++) loop.push(i)
  for (let j = 1; j < nz; j++) loop.push(j * nx + ns)
  for (let i = ns - 1; i >= 0; i--) loop.push(nt * nx + i)
  for (let j = nt - 1; j > 0; j--) loop.push(j * nx)
  const HEM = 6 // segments around the rounded hem
  const h = T / 2
  const total = 2 * N + loop.length * (HEM - 1)
  const pos = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  const UV_MM = PLUSH_MM
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const n = j * nx + i
      for (let c = 0; c < 3; c++) {
        pos[n * 3 + c] = mid[n * 3 + c] + nrm[n * 3 + c] * h
        pos[(N + n) * 3 + c] = mid[n * 3 + c] - nrm[n * 3 + c] * h
      }
      const u = ((i / ns) * B.along) / UV_MM
      const v = ((j / nt) * B.across) / UV_MM
      uv.set([u, v], n * 2)
      uv.set([u, v], (N + n) * 2)
    }
  // hem rings: half circles from the top shell, out past the edge, round to the bottom shell
  const ringStart = 2 * N
  loop.forEach((b, k) => {
    const i = b % nx
    const j = Math.floor(b / nx)
    const ii = Math.min(Math.max(i, 1), ns - 1)
    const jj = Math.min(Math.max(j, 1), nt - 1)
    const inward = jj * nx + ii
    let ox = mid[b * 3] - mid[inward * 3]
    let oy = mid[b * 3 + 1] - mid[inward * 3 + 1]
    let oz = mid[b * 3 + 2] - mid[inward * 3 + 2]
    const nx_ = nrm[b * 3]
    const ny_ = nrm[b * 3 + 1]
    const nz_ = nrm[b * 3 + 2]
    const dot = ox * nx_ + oy * ny_ + oz * nz_
    ox -= dot * nx_
    oy -= dot * ny_
    oz -= dot * nz_
    const ol = Math.hypot(ox, oy, oz) || 1
    ox /= ol
    oy /= ol
    oz /= ol
    for (let s = 1; s < HEM; s++) {
      const a = (s / HEM) * Math.PI
      const v = ringStart + k * (HEM - 1) + (s - 1)
      const cn = Math.cos(a) * h
      const so = Math.sin(a) * h * 1.1 // a touch fuller than round: a stitched, stuffed edge
      pos[v * 3] = mid[b * 3] + nx_ * cn + ox * so
      pos[v * 3 + 1] = mid[b * 3 + 1] + ny_ * cn + oy * so
      pos[v * 3 + 2] = mid[b * 3 + 2] + nz_ * cn + oz * so
      uv[v * 2] = uv[b * 2] + (ox * so) / UV_MM
      uv[v * 2 + 1] = uv[b * 2 + 1] + (oz * so) / UV_MM + (s * h) / HEM / UV_MM
    }
  })
  const top: number[] = []
  const bottom: number[] = []
  const hem: number[] = []
  for (let j = 0; j < nt; j++)
    for (let i = 0; i < ns; i++) {
      const a = j * nx + i
      const b = a + 1
      const c = a + nx
      const d = c + 1
      top.push(a, c, b, b, c, d) // outside face (+normal: up on the bed, down in the turn-down)
      bottom.push(N + a, N + b, N + c, N + b, N + d, N + c) // inside face, flipped
    }
  // hem strips: ring vertex 0 = top shell vertex, HEM = bottom shell vertex
  const ring = (k: number, s: number) => {
    const b = loop[k % loop.length]
    if (s === 0) return b
    if (s === HEM) return N + b
    return ringStart + (k % loop.length) * (HEM - 1) + (s - 1)
  }
  for (let k = 0; k < loop.length; k++)
    for (let s = 0; s < HEM; s++) {
      const a0 = ring(k, s)
      const a1 = ring(k, s + 1)
      const b0 = ring(k + 1, s)
      const b1 = ring(k + 1, s + 1)
      hem.push(a0, b0, a1, b0, b1, a1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  // group 0 = outside + hem (outside material), group 1 = inside (sherpa)
  g.setIndex([...top, ...hem, ...bottom])
  g.addGroup(0, top.length + hem.length, 0)
  g.addGroup(top.length + hem.length, bottom.length, 1)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export function Blanket() {
  const geo = useMemo(() => fastHits(makeBlanketGeometry()), []) // 140k triangles: hit-test through a bounds tree
  const { materials, uniforms } = useMemo(() => {
    const out = createFabricMaterial({ key: 'blanket-out', fabric: 'fleece', color: B.outside.color, sheenColor: B.outside.sheen, divot: DIVOT, undulation: 0.5, sides: 0 })
    const inn = createFabricMaterial({ key: 'blanket-in', fabric: 'plush', color: B.inside.color, sheenColor: B.inside.sheen, divot: DIVOT, undulation: 0.5, sides: 0, shareDivots: out.uniforms })
    return { materials: [out.material, inn.material], uniforms: out.uniforms }
  }, [])
  const press = useDivots(uniforms, DIVOT)
  const mesh = useRef<Mesh>(null)

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (mesh.current) press(mesh.current.worldToLocal(e.point.clone()))
  }

  // so a pillow dropped on the blanket rests on it instead of sinking in
  const topX0 = -(M.len / 2 + 5)
  const bandX0 = B.crease - (B.along - S_CREASE - Math.PI * FOLD_R)
  return (
    <group>
      <mesh
        ref={mesh}
        geometry={geo}
        material={materials}
        castShadow
        receiveShadow
        onPointerDown={onDown}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      />
      <RigidBody type="fixed" colliders={false}>
        {/* the draped sides and foot: out to the hanging fabric, from its hem up to the top */}
        <CuboidCollider
          args={[(B.crease + 20 + INNER.x + R + T / 2) / 2, (COVER_TOP - 455) / 2, INNER.z + R + T / 2]}
          position={[(B.crease + 20 - INNER.x - R - T / 2) / 2, (COVER_TOP + 455) / 2, 0]}
          friction={1}
        />
        <CuboidCollider args={[(B.crease - topX0) / 2, T / 2, M.w / 2 + 5]} position={[(B.crease + topX0) / 2, COVER_TOP + T / 2, 0]} friction={1} />
        <CuboidCollider
          args={[(B.crease + FOLD_R - bandX0) / 2, T / 2, M.w / 2 + 5]}
          position={[(B.crease + FOLD_R + bandX0) / 2, COVER_TOP + 2 * FOLD_R + T / 2, 0]}
          friction={1}
        />
      </RigidBody>
    </group>
  )
}
