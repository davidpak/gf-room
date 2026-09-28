import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, CanvasTexture, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, InstancedMesh, Object3D, RepeatWrapping, SRGBColorSpace, Shape } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from './bruno'
import { PADS, SET, inIsland, keepClear, onWalk, paveOwner, paveSdf, walkSdf } from './set'

/**
 * The ground of the Quad's quarter (./set): an island of earth with a grass lip, a mown lawn on it
 * (soft mowing stripes, a gentle wash of greens, bare trodden earth under the cherries), chunky tufts
 * only where grass gathers (round the trees' feet, the benches' and the lamps', along the walks'
 * edges and the island's rim), little white clover flowers, the brick walks across it and the benches'
 * pads off them as one paving, rounded where they meet (UW's red brick, laid in basketweave inside a
 * border course that follows the paving's edge all round, each brick its own shade and a hair proud or
 * sunk, mortar between), and the cherry petals: lying on the grass and the bricks, and a few falling.
 */
const _o = new Object3D()
const _c = new Color()
function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** the island's outline, `inset` in from its edge: a rectangle, its corners rounded (./set inIsland) */
function islandShape(inset = 0) {
  const { x0, x1, z0, z1, corner } = SET.island
  const [a, b, c, d] = [x0 + inset, x1 - inset, z0 + inset, z1 - inset]
  const r = Math.max(1, corner - inset)
  const s = new Shape()
  s.moveTo(a + r, c)
  s.lineTo(b - r, c)
  s.quadraticCurveTo(b, c, b, c + r)
  s.lineTo(b, d - r)
  s.quadraticCurveTo(b, d, b - r, d)
  s.lineTo(a + r, d)
  s.quadraticCurveTo(a, d, a, d - r)
  s.lineTo(a, c + r)
  s.quadraticCurveTo(a, c, a + r, c)
  return s
}
const ISLAND_W = SET.island.x1 - SET.island.x0
const ISLAND_D = SET.island.z1 - SET.island.z0

const EARTH = bruno({ vertexColors: true })
/** the mown lawn: a wash of greens, soft light and dark stripes where the mower went, the grass worn
 *  to bare earth under the cherries (1 px = 8 mm) */
function lawnTexture() {
  const W = Math.round(ISLAND_W / 8)
  const H = Math.round(ISLAND_D / 8)
  const X = (x: number) => (x - SET.island.x0) / 8
  const Y = (z: number) => (z - SET.island.z0) / 8
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#7fae57'
  g.fillRect(0, 0, W, H)
  const rand = rng(9)
  // the wash: big soft patches, a little yellower or bluer
  for (let i = 0; i < 70; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = 30 + rand() * 90
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    const col = rand() < 0.5 ? '160,196,96' : '96,150,82'
    gr.addColorStop(0, `rgba(${col},0.28)`)
    gr.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // the mowing stripes, along the walk
  for (let y = 0; y < H; y += 44) {
    g.fillStyle = (y / 44) % 2 ? 'rgba(255,255,220,0.07)' : 'rgba(30,70,30,0.06)'
    g.fillRect(0, y, W, 44)
  }
  // under the cherries: the grass shaded darker, worn through to earth round the trunks
  for (const t of SET.trees) {
    const x = X(t.x)
    const y = Y(t.z)
    let gr = g.createRadialGradient(x, y, 0, x, y, 120)
    gr.addColorStop(0, 'rgba(60,96,62,0.35)')
    gr.addColorStop(1, 'rgba(60,96,62,0)')
    g.fillStyle = gr
    g.fillRect(x - 120, y - 120, 240, 240)
    for (let k = 0; k < 7; k++) {
      const ex = x + (rand() - 0.5) * 70
      const ey = y + (rand() - 0.5) * 40
      const r = 22 + rand() * 30
      gr = g.createRadialGradient(ex, ey, 0, ex, ey, r)
      gr.addColorStop(0, 'rgba(122,88,66,0.75)')
      gr.addColorStop(0.6, 'rgba(122,88,66,0.45)')
      gr.addColorStop(1, 'rgba(122,88,66,0)')
      g.fillStyle = gr
      g.fillRect(ex - r, ey - r, r * 2, r * 2)
    }
  }
  // the mortar under the paving (it shows in the joints between the bricks)
  const img = g.getImageData(0, 0, W, H)
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const d = paveSdf(SET.island.x0 + (px + 0.5) * 8, SET.island.z0 + (py + 0.5) * 8)
      if (d > 4) continue
      const k = (py * W + px) * 4
      const a = Math.min(1, (4 - d) / 8)
      img.data[k] += (168 - img.data[k]) * a
      img.data[k + 1] += (128 - img.data[k + 1]) * a
      img.data[k + 2] += (116 - img.data[k + 2]) * a
    }
  g.putImageData(img, 0, 0)
  // a fine grain
  for (let i = 0; i < W * H * 0.03; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(210,230,140,0.18)' : 'rgba(40,90,40,0.16)'
    g.fillRect(rand() * W, rand() * H, 1.5, 1.5)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  // (the lawn's UVs are its outline's coordinates in mm: the picture over the whole island)
  t.repeat.set(1 / ISLAND_W, 1 / ISLAND_D)
  t.offset.set(-SET.island.x0 / ISLAND_W, -SET.island.z0 / ISLAND_D)
  t.flipY = false
  return t
}
const SOIL = bruno({ map: typeof document !== 'undefined' ? lawnTexture() : undefined })
export function Island() {
  const geo = useMemo(() => {
    const T = SET.island.t
    const g = new ExtrudeGeometry(islandShape(18), { depth: T - 36, bevelEnabled: true, bevelThickness: 18, bevelSize: 18, bevelSegments: 3 })
    g.translate(0, 0, 18)
    g.rotateX(Math.PI / 2) // (the outline's y → +z, extruded down)
    // coloured in bands down its side: the grass lip, then earth, darker further down
    const pos = g.attributes.position
    const col: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y > -14) _c.set('#5f9446')
      else if (y > -40) _c.set('#8a5e44')
      else _c.set('#6d4638').lerp(_c.clone().set('#4a2f33'), Math.min(1, (-y - 40) / T))
      col.push(_c.r, _c.g, _c.b)
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    return g
  }, [])
  const top = useMemo(() => {
    const g = new ExtrudeGeometry(islandShape(10), { depth: 2, bevelEnabled: false })
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  return (
    <group>
      <mesh geometry={geo} material={EARTH} position={[0, 0, 0]} castShadow receiveShadow />
      <mesh geometry={top} material={SOIL} position={[0, 4, 0]} receiveShadow />
    </group>
  )
}

// ---- the tufts
/** a tuft: five chunky blades fanned out from one root, round-tipped, dark at the root, sunlit at
 *  the tip; their normals up, so a tuft shades like the lawn it grows from */
function tuftGeometry() {
  const pos: number[] = []
  const nor: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const root = new Color('#4f7f43')
  const tip = new Color('#b9d77b')
  const blades = [
    [0, 1, 0],
    [-0.9, 0.78, 0.35],
    [0.95, 0.8, -0.3],
    [-0.35, 0.66, -0.9],
    [0.45, 0.7, 0.85],
  ]
  blades.forEach(([ax, h, az], b) => {
    const lean = 0.42
    const W = 0.2
    const base = pos.length / 3
    const dir = Math.atan2(az, ax)
    const px = -Math.sin(dir)
    const pz = Math.cos(dir)
    // a leaf-shaped blade: 3 rows up, the last a rounded point
    const rows = [
      [0, 1],
      [0.45, 0.9],
      [0.8, 0.55],
      [1, 0],
    ]
    rows.forEach(([t, w]) => {
      const cx = Math.cos(dir) * lean * t * t * (b ? 1 : 0.3)
      const cz = Math.sin(dir) * lean * t * t * (b ? 1 : 0.3)
      const c = root.clone().lerp(tip, t)
      for (const side of [-1, 1]) {
        pos.push(cx + px * side * W * w, t * h, cz + pz * side * W * w)
        nor.push(0, 1, 0)
        col.push(c.r, c.g, c.b)
      }
    })
    for (let i = 0; i < rows.length - 1; i++) {
      const a = base + i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  return g
}
const TUFT = bruno({ vertexColors: true, side: DoubleSide, sway: 30, swayFrom: 0 })
TUFT.defines = { ...TUFT.defines, NO_FLIP: '' }
const TINTS = ['#ffffff', '#f2ffd9', '#e9f6ff', '#fff4dc']

/** where grass gathers: rings round the tree's foot, the bench's and lamp's feet; along the walk's
 *  edges and the island's rim; a few loose ones out on the lawn */
function tuftSpots() {
  const rand = rng(11)
  const out: [number, number][] = []
  const ring = (cx: number, cz: number, r0: number, r1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const r = r0 + rand() * (r1 - r0)
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
    }
  }
  for (const t of SET.trees) ring(t.x, t.z, 120, 210, 30)
  for (const l of SET.lamps) ring(l.x, l.z, 48, 95, 10)
  for (const b of SET.benches)
    for (const lx of [-180, 180])
      for (const lz of [-55, 50]) ring(b.x + Math.cos(b.rot) * lx + Math.sin(b.rot) * lz, b.z - Math.sin(b.rot) * lx + Math.cos(b.rot) * lz, 8, 40, 3)
  for (const wk of SET.walks) {
    const [ax, az] = wk.a
    const len = Math.hypot(wk.b[0] - ax, wk.b[1] - az)
    const ux = (wk.b[0] - ax) / len
    const uz = (wk.b[1] - az) / len
    for (let d = 0; d < len; d += 55 + rand() * 90)
      for (const side of [-1, 1]) {
        if (rand() > 0.75) continue
        const o = side * (wk.w / 2 + 16 + rand() * 30)
        out.push([ax + ux * d - uz * o, az + uz * d + ux * o])
      }
  }
  const { x0, x1, z0, z1 } = SET.island
  for (let i = 0; i < 640; i++) {
    const inset = 40 + rand() * 50
    const u = rand()
    const side = Math.floor(rand() * 4)
    if (side < 2) out.push([x0 + (x1 - x0) * u, side ? z1 - inset : z0 + inset])
    else out.push([side === 2 ? x0 + inset : x1 - inset, z0 + (z1 - z0) * u])
  }
  for (let i = 0; i < 220; i++) out.push([x0 + rand() * (x1 - x0), z0 + rand() * (z1 - z0)])
  return out.filter(([x, z]) => inIsland(x, z, 28) && !onWalk(x, z, 10) && !keepClear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r * 0.8))
}

export function Grass() {
  const tuft = useMemo(tuftGeometry, [])
  const spots = useMemo(tuftSpots, [])
  const mesh = useRef<InstancedMesh>(null)
  const clover = useRef<InstancedMesh>(null)
  const clovers = useMemo(() => {
    const rand = rng(17)
    const out: [number, number][] = []
    while (out.length < 640) {
      const x = SET.island.x0 + rand() * ISLAND_W
      const z = SET.island.z0 + rand() * ISLAND_D
      if (inIsland(x, z, 40) && !onWalk(x, z, 30)) out.push([x, z])
    }
    return out
  }, [])
  useLayoutEffect(() => {
    const m = mesh.current!
    const rand = rng(5)
    spots.forEach(([x, z], i) => {
      const s = 22 + rand() * 16
      _o.position.set(x, 4, z)
      _o.rotation.set(0, rand() * Math.PI * 2, 0)
      _o.scale.set(s * (0.9 + rand() * 0.3), s, s * (0.9 + rand() * 0.3))
      _o.updateMatrix()
      m.setMatrixAt(i, _o.matrix)
      m.setColorAt(i, _c.set(TINTS[Math.floor(rand() * TINTS.length)]))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    const c = clover.current!
    clovers.forEach(([x, z], i) => {
      _o.position.set(x, 5, z)
      _o.rotation.set(0, rand() * 6.28, 0)
      _o.scale.setScalar(0.8 + rand() * 0.5)
      _o.updateMatrix()
      c.setMatrixAt(i, _o.matrix)
    })
    c.instanceMatrix.needsUpdate = true
  }, [spots, clovers])
  return (
    <group>
      <instancedMesh ref={mesh} args={[tuft, TUFT, spots.length]} castShadow receiveShadow />
      {/* white clover: a little puffball on the lawn */}
      <instancedMesh ref={clover} args={[undefined, CLOVER, clovers.length]} castShadow>
        <sphereGeometry args={[5, 8, 6]} />
      </instancedMesh>
    </group>
  )
}
const CLOVER = bruno({ color: '#fbf6ee' })

// ---- the brick walk
const BRICKS = ['#c8664f', '#b95a47', '#d27a5c', '#a9503f', '#cf8466', '#bd6450', '#d98b6c']
const BRICK = bruno({})
/** the paving's bricks (a brick 64 × 32: a basketweave square is two). The border course: a brick
 *  down each piece of the paving's edge, traced all round it (marching squares on its distance
 *  field), so it follows the rounded corners too. Inside it, each walk's and pad's basketweave in its
 *  own frame, a brick kept where it lies wholly inside the border and on its own shape's ground (./set
 *  paveOwner), else its halves where they fit: cut bricks, as a paver would */
type Brick = { x: number; z: number; w: number; d: number; a: number }
const B = 64
const BORDER = 34
/** a course of bricks along where `field` crosses 0 (marching squares on a 64 mm grid over the
 *  island), one brick a grid cell's worth of the line; `keep` picks which pieces of the line */
function course(field: (x: number, z: number) => number, keep: (x: number, z: number, ax: number, az: number, bx: number, bz: number) => boolean = () => true) {
  const out: Brick[] = []
  const { x0, x1, z0, z1 } = SET.island
  const C = 64
  const nx = Math.ceil((x1 - x0) / C)
  const nz = Math.ceil((z1 - z0) / C)
  const f: number[] = []
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) f.push(field(x0 + i * C, z0 + j * C))
  const at = (i: number, j: number) => f[j * (nx + 1) + i]
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]
      const p = [
        [x0 + i * C, z0 + j * C],
        [x0 + (i + 1) * C, z0 + j * C],
        [x0 + (i + 1) * C, z0 + (j + 1) * C],
        [x0 + i * C, z0 + (j + 1) * C],
      ]
      const cross: [number, number][] = []
      for (let e = 0; e < 4; e++) {
        const a = v[e]
        const b = v[(e + 1) % 4]
        if (a < 0 !== b < 0) {
          const t = a / (a - b)
          const [ax, az] = p[e]
          const [bx, bz] = p[(e + 1) % 4]
          cross.push([ax + (bx - ax) * t, az + (bz - az) * t])
        }
      }
      for (let k = 0; k + 1 < cross.length; k += 2) {
        const [[ax, az], [bx, bz]] = [cross[k], cross[k + 1]]
        const len = Math.hypot(bx - ax, bz - az)
        if (len < 14 || !keep((ax + bx) / 2, (az + bz) / 2, ax, az, bx, bz)) continue
        out.push({ x: (ax + bx) / 2, z: (az + bz) / 2, w: len - 3, d: 29, a: Math.atan2(-(bz - az), bx - ax) })
      }
    }
  return out
}
/** the border course, all round the paving's edge (its middle line 17 in) */
const borderBricks = () => course((x, z) => paveSdf(x, z) + 17)
/** the soldier course where a walk meets paving laid another way (a crossing walk, a bench's pad,
 *  the rounded corners): along the walk's own edge, just inside it, so each weave ends on a
 *  straight course of bricks, not ragged */
function seamBricks() {
  return SET.walks.flatMap((wk, k) =>
    course(
      (x, z) => walkSdf(wk, x, z) + 17,
      (x, z, ax, az, bx, bz) => {
        if (paveSdf(x, z) > -BORDER - 6 || paveOwner(x, z) !== k) return false
        // (just across the walk's edge: paved, and laid another way)
        let nx = -(bz - az)
        let nz = bx - ax
        const n = Math.hypot(nx, nz)
        ;[nx, nz] = [nx / n, nz / n]
        if (walkSdf(wk, x + nx, z + nz) < walkSdf(wk, x, z)) [nx, nz] = [-nx, -nz]
        const [ox, oz] = [x + nx * 40, z + nz * 40]
        return paveSdf(ox, oz) < -8 && paveOwner(ox, oz) !== k
      },
    ),
  )
}
/** a shape's frame: where it starts, which way it runs, how long and wide, and how far past its
 *  edges to lay weave (into the rounded corners) */
function frames() {
  return [
    ...SET.walks.map((wk) => {
      const len = Math.hypot(wk.b[0] - wk.a[0], wk.b[1] - wk.a[1])
      return { ax: wk.a[0], az: wk.a[1], ux: (wk.b[0] - wk.a[0]) / len, uz: (wk.b[1] - wk.a[1]) / len, len, w: wk.w, over: 260 }
    }),
    ...PADS.map((p) => ({ ax: p.x - p.w / 2, az: p.z, ux: 1, uz: 0, len: p.w, w: p.d, over: 40 })),
  ]
}
function weaveBricks() {
  const out: Brick[] = []
  frames().forEach((F, k) => {
    const a = Math.atan2(-F.uz, F.ux)
    const world = (s: number, t: number): [number, number] => [F.ax + F.ux * s - F.uz * t, F.az + F.uz * s + F.ux * t]
    const wk = k < SET.walks.length ? SET.walks[k] : null
    // whether a brick (along the frame: s, t its middle, ls × lt its size) lies inside the border, on
    // its own shape's ground, and (on a walk) off the soldier course along the walk's edge
    const inside = (x: number, z: number) => {
      if (paveSdf(x, z) > -BORDER + 2 || paveOwner(x, z) !== k) return false
      if (!wk) return true
      const d = walkSdf(wk, x, z)
      if (d < -BORDER + 2 || d > 0) return true
      // (in the band along the walk's edge: clear only where the soldier course lies, i.e. across
      // the edge is paving laid another way)
      const e = 4
      let gx = walkSdf(wk, x + e, z) - walkSdf(wk, x - e, z)
      let gz = walkSdf(wk, x, z + e) - walkSdf(wk, x, z - e)
      const g = Math.hypot(gx, gz) || 1
      ;[gx, gz] = [gx / g, gz / g]
      const [ox, oz] = [x + gx * (40 - d), z + gz * (40 - d)]
      return !(paveSdf(ox, oz) < -8 && paveOwner(ox, oz) !== k)
    }
    const fits = (s: number, t: number, ls: number, lt: number) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].every(([i, j]) => {
        const [x, z] = world(s + (i * ls) / 2, t + (j * lt) / 2)
        return inside(x, z)
      })
    // a brick that does not fit whole is cut: in eighths along its length, the runs of eighths that
    // fit laid as one piece each
    const put = (s: number, t: number, ls: number, lt: number) => {
      const long = ls >= lt
      const L = long ? ls : lt
      const pitch = (L + 3) / 8
      const piece = (i: number, j: number) => {
        const len = pitch * (j - i + 1) - 3
        const off = -(L + 3) / 2 + (pitch * (i + j + 1)) / 2
        return long ? { s: s + off, t, ls: len, lt } : { s, t: t + off, ls, lt: len }
      }
      if (fits(s, t, ls, lt)) return push(s, t, ls, lt)
      let run = -1
      for (let q = 0; q <= 8; q++) {
        const p = q < 8 ? piece(q, q) : null
        const ok = p ? fits(p.s, p.t, p.ls, p.lt) : false
        if (ok && run < 0) run = q
        if (!ok && run >= 0) {
          const r = piece(run, q - 1)
          push(r.s, r.t, r.ls, r.lt)
          run = -1
        }
      }
    }
    const push = (s: number, t: number, ls: number, lt: number) => {
      const [x, z] = world(s, t)
      out.push({ x, z, w: ls, d: lt, a })
    }
    const rows = Math.max(1, Math.floor((F.w - BORDER * 2) / B))
    const t0 = -(rows * B) / 2
    const extra = Math.ceil(F.over / B)
    for (let i = -extra; i * B < F.len + F.over; i++)
      for (let j = -extra; j < rows + extra; j++) {
        const along = (i + j) % 2 === 0
        for (const q of [0, 1]) {
          if (along) put(i * B + B / 2, t0 + j * B + 16 + q * 32, B - 3, 29)
          else put(i * B + 16 + q * 32, t0 + j * B + B / 2, 29, B - 3)
        }
      }
  })
  return out
}

export function Walks() {
  const brick = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.12), [])
  const bricks = useMemo(() => [...borderBricks(), ...seamBricks(), ...weaveBricks()].filter((b) => inIsland(b.x, b.z, 30)), [])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current!
    const rand = rng(21)
    bricks.forEach((b, i) => {
      const h = 20 + rand() * 3
      _o.position.set(b.x, 4 + h / 2 + (rand() - 0.5) * 1.5, b.z)
      _o.rotation.set((rand() - 0.5) * 0.03, b.a + (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.03)
      _o.scale.set(b.w, h, b.d)
      _o.updateMatrix()
      m.setMatrixAt(i, _o.matrix)
      m.setColorAt(i, _c.set(BRICKS[Math.floor(rand() * BRICKS.length)]))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [bricks])
  return <instancedMesh ref={mesh} args={[brick, BRICK, bricks.length]} castShadow receiveShadow />
}

// ---- the petals
const PETAL = bruno({ color: '#ffffff', vertexColors: false, side: DoubleSide })
PETAL.defines = { ...PETAL.defines, NO_FLIP: '' }
function petalGeometry() {
  const s = new Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(-5, 3, -6, 9, -1.4, 11)
  s.lineTo(0, 9.6)
  s.lineTo(1.4, 11)
  s.bezierCurveTo(6, 9, 5, 3, 0, 0)
  const g = new ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.computeVertexNormals()
  const n = g.attributes.normal
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0)
  return g
}
const PETAL_PINKS = ['#fde3ea', '#f9c6d4', '#fff1f4', '#f4b0c4']
export function Petals() {
  const geo = useMemo(petalGeometry, [])
  const fallen = useRef<InstancedMesh>(null)
  const falling = useRef<InstancedMesh>(null)
  const N = SET.petals.fallen
  useLayoutEffect(() => {
    const m = fallen.current!
    const rand = rng(33)
    let i = 0
    while (i < N) {
      // under every canopy, thinning out past it; some blown along the walk
      const tree = SET.trees[i % SET.trees.length]
      const [tx, tz] = [tree.x, tree.z]
      const r = Math.pow(rand(), 0.6) * 1100
      const a = rand() * Math.PI * 2
      const x = tx + Math.cos(a) * r + (rand() < 0.2 ? (rand() - 0.3) * 900 : 0)
      const z = tz + Math.sin(a) * r * 0.85
      if (!inIsland(x, z, 30)) continue
      const y = onWalk(x, z, 0) ? 26.5 : 7 + rand() * 12
      _o.position.set(x, y, z)
      _o.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5)
      _o.scale.setScalar(0.9 + rand() * 0.6)
      _o.updateMatrix()
      m.setMatrixAt(i, _o.matrix)
      m.setColorAt(i, _c.set(PETAL_PINKS[Math.floor(rand() * PETAL_PINKS.length)]))
      i++
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    const f = falling.current!
    for (let k = 0; k < SET.petals.falling; k++) f.setColorAt(k, _c.set(PETAL_PINKS[k % PETAL_PINKS.length]))
    if (f.instanceColor) f.instanceColor.needsUpdate = true
  }, [N])
  const drift = useMemo(() => {
    const rand = rng(44)
    return Array.from({ length: SET.petals.falling }, (_, k) => ({ tree: SET.trees[k % SET.trees.length], a: rand() * 6.28, r: rand() * 700, speed: 70 + rand() * 60, phase: rand() * 30, spin: 1 + rand() * 2 }))
  }, [])
  useFrame(({ clock }) => {
    const f = falling.current
    if (!f) return
    const t = clock.elapsedTime
    drift.forEach((p, k) => {
      const [tx, tz] = [p.tree.x, p.tree.z]
      const H = 1100
      const y = H - ((t * p.speed + p.phase * 60) % (H - 30))
      const fall = 1 - y / H
      _o.position.set(tx + Math.cos(p.a) * p.r + Math.sin(t * 0.8 + p.phase) * 50 + fall * 260, y, tz + Math.sin(p.a) * p.r + Math.cos(t * 0.6 + p.phase) * 40 + fall * 120)
      _o.rotation.set(t * p.spin + p.phase, t * p.spin * 0.6, p.phase)
      _o.scale.setScalar(1.2)
      _o.updateMatrix()
      f.setMatrixAt(k, _o.matrix)
    })
    f.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={fallen} args={[geo, PETAL, N]} receiveShadow />
      <instancedMesh ref={falling} args={[geo, PETAL, SET.petals.falling]} castShadow />
    </group>
  )
}
