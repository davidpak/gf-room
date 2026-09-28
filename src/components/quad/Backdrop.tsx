import { useMemo } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Quaternion, RepeatWrapping, SRGBColorSpace, Shape, Vector3, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from './bruno'
import { SET } from './set'

/**
 * What closes the quarter's north edge (./set): the building's face (the Quad's collegiate gothic:
 * tan brick, stone trim, tall windows, pointed ones under the eaves, some lit warm for the evening,
 * a copper-green roof), cut off where the island ends like a diorama; its wing stepping out toward
 * the walk, and the dark hedge in front of it; a few round bushes along the building's foot.
 * Windows are painted into the wall (map + emissiveMap), not stuck on.
 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

// ---- the building
const BAY = 400 // (mm: one window's bay)
const TILE_BAYS = 4
function facadeTextures(h: number) {
  const PX = 0.32 // (px a mm)
  const W = Math.round(BAY * TILE_BAYS * PX)
  const H = Math.round(h * PX)
  const col = document.createElement('canvas')
  const glow = document.createElement('canvas')
  col.width = glow.width = W
  col.height = glow.height = H
  const g = col.getContext('2d')!
  const e = glow.getContext('2d')!
  e.fillStyle = '#000'
  e.fillRect(0, 0, W, H)
  const rand = rng(3)
  // the wall: tan brick, courses faintly drawn, each brick a touch its own shade
  g.fillStyle = '#e4bb9f'
  g.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y += 4)
    for (let x = (y / 4) % 2 ? -4 : 0; x < W; x += 9) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '120,60,50' : '255,230,200'},${0.05 + rand() * 0.07})`
      g.fillRect(x, y, 8, 3)
    }
  const STONE = '#eedcc6'
  // the plinth, the string courses between the floors, the cornice under the roof
  const floors = 2
  const base = H * 0.1
  const fh = (H - base - H * 0.06) / floors
  g.fillStyle = STONE
  g.fillRect(0, H - base, W, base)
  g.fillStyle = 'rgba(120,80,70,0.25)'
  g.fillRect(0, H - base, W, 2)
  for (let f = 1; f < floors; f++) {
    g.fillStyle = STONE
    g.fillRect(0, H - base - f * fh - 3, W, 5)
  }
  g.fillStyle = STONE
  g.fillRect(0, 0, W, H * 0.06)
  g.fillStyle = 'rgba(120,80,70,0.25)'
  g.fillRect(0, H * 0.06, W, 2)
  // the windows: a column per bay, the top floor's pointed
  const bw = W / TILE_BAYS
  for (let b = 0; b < TILE_BAYS; b++)
    for (let f = 0; f < floors; f++) {
      const ww = bw * 0.44
      const wh = fh * 0.62
      const x = b * bw + (bw - ww) / 2
      const y = H - base - (f + 1) * fh + fh * 0.2
      const pointed = f === floors - 1
      const lit = rand() < 0.45
      const pane = (ctx: CanvasRenderingContext2D, grow: number) => {
        ctx.beginPath()
        if (pointed) {
          ctx.moveTo(x - grow, y + wh + grow)
          ctx.lineTo(x - grow, y + ww * 0.45)
          ctx.quadraticCurveTo(x - grow, y - grow, x + ww / 2, y - grow - ww * 0.15)
          ctx.quadraticCurveTo(x + ww + grow, y - grow, x + ww + grow, y + ww * 0.45)
          ctx.lineTo(x + ww + grow, y + wh + grow)
        } else ctx.rect(x - grow, y - grow, ww + grow * 2, wh + grow * 2)
        ctx.closePath()
        ctx.fill()
      }
      // the stone surround and sill, the glass, the mullion and transom
      g.fillStyle = STONE
      pane(g, 3)
      g.fillRect(x - 5, y + wh + 2, ww + 10, 4)
      g.fillStyle = lit ? '#ffcf8f' : '#4b4b7c'
      pane(g, 0)
      if (!lit) {
        // (a sky glint down the dark ones)
        g.fillStyle = 'rgba(210,160,200,0.35)'
        g.fillRect(x + ww * 0.12, y + wh * 0.25, ww * 0.18, wh * 0.6)
      }
      g.fillStyle = STONE
      g.fillRect(x + ww / 2 - 1.5, y, 3, wh)
      g.fillRect(x, y + wh * 0.62, ww, 3)
      if (lit) {
        e.fillStyle = '#ffb66e'
        pane(e, 0)
        e.fillStyle = '#000'
        e.fillRect(x + ww / 2 - 1.5, y, 3, wh)
        e.fillRect(x, y + wh * 0.62, ww, 3)
      }
    }
  const map = new CanvasTexture(col)
  map.colorSpace = SRGBColorSpace
  const emissiveMap = new CanvasTexture(glow)
  emissiveMap.colorSpace = SRGBColorSpace
  for (const t of [map, emissiveMap]) {
    t.wrapS = RepeatWrapping
    t.anisotropy = 8
  }
  return { map, emissiveMap }
}
const WALL_TEX = typeof document !== 'undefined' ? facadeTextures(SET.building.h) : null
/** the wall's material for a face `w` mm wide: the painted bays repeated across it */
function wall(w: number) {
  const map = WALL_TEX!.map.clone()
  const emissiveMap = WALL_TEX!.emissiveMap.clone()
  map.repeat.x = emissiveMap.repeat.x = w / (BAY * TILE_BAYS)
  map.needsUpdate = emissiveMap.needsUpdate = true
  return bruno({ map, emissiveMap, emissive: '#ffffff', emissiveIntensity: 0.9 })
}
const PLAIN = bruno({ color: '#e4bb9f' })
const ROOF = bruno({ color: '#78b9a9', shade: '#6d7fb8' })
const RIDGE = bruno({ color: '#5f9d90' })

/** a block of the building: its walls, and a mansard roof of copper along it */
function Block({ x0, x1, z0, z1 }: { x0: number; x1: number; z0: number; z1: number }) {
  const h = SET.building.h
  const w = x1 - x0
  const d = z1 - z0
  const { box, mats, roof } = useMemo(() => {
    const box = new BoxGeometry(w, h, d)
    // (+x, −x, top, bottom, +z the front, −z the back)
    const side = wall(d)
    const mats: Material[] = [side, side, PLAIN, PLAIN, wall(w), PLAIN]
    const s = new Shape()
    const eave = 30
    s.moveTo(-d / 2 - eave, 0)
    s.lineTo(d / 2 + eave, 0)
    s.lineTo(d / 2 - 90, 300)
    s.lineTo(-d / 2 + 90, 300)
    s.closePath()
    const roof = new ExtrudeGeometry(s, { depth: w + eave * 2, bevelEnabled: false })
    roof.rotateY(Math.PI / 2) // (the profile across z, run along x)
    roof.translate(-w / 2 - eave, 0, 0)
    return { box, mats, roof }
  }, [w, d, h])
  return (
    <group position={[(x0 + x1) / 2, 0, (z0 + z1) / 2]}>
      <mesh geometry={box} material={mats} position={[0, h / 2, 0]} castShadow receiveShadow />
      <mesh geometry={roof} material={ROOF} position={[0, h, 0]} castShadow receiveShadow />
      <mesh material={RIDGE} position={[0, h + 300, 0]}>
        <boxGeometry args={[w + 60, 24, Math.max(40, d - 180)]} />
      </mesh>
    </group>
  )
}

export function Building() {
  return (
    <group>
      {SET.building.blocks.map((b, i) => (
        <Block key={i} {...b} />
      ))}
    </group>
  )
}

// ---- the hedge and the bushes: Bruno's foliage, green, made the way the cherries' blossom is (cards
// through soft round shapes, their normals out of the shape so each reads as one soft mass), round
// a dark core so there are no holes to see through
function leafTextures() {
  const N = 256
  const col = document.createElement('canvas')
  const cut = document.createElement('canvas')
  col.width = col.height = cut.width = cut.height = N
  const g = col.getContext('2d')!
  const a = cut.getContext('2d')!
  a.fillStyle = '#000'
  a.fillRect(0, 0, N, N)
  g.fillStyle = '#6f9f5c'
  g.fillRect(0, 0, N, N)
  const rand = rng(12)
  // a clump of small round leaves (boxwood, laurel), thicker in the middle, ragged at its edge
  const GREENS = ['#86b86d', '#76a960', '#9ccb7f', '#689a57', '#8fc275', '#7db367']
  for (let i = 0; i < 70; i++) {
    const r = 11 + rand() * 9
    const d = Math.pow(rand(), 0.7) * (N / 2 - r - 6)
    const th = rand() * Math.PI * 2
    const x = N / 2 + Math.cos(th) * d
    const y = N / 2 + Math.sin(th) * d
    const rot = rand() * Math.PI * 2
    const fill = GREENS[Math.floor(rand() * GREENS.length)]
    for (const ctx of [a, g]) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.fillStyle = ctx === a ? '#fff' : fill
      // a leaf: round, a soft point
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.bezierCurveTo(r * 0.8, -r * 0.7, r * 0.75, r * 0.6, 0, r * 0.8)
      ctx.bezierCurveTo(-r * 0.75, r * 0.6, -r * 0.8, -r * 0.7, 0, -r)
      ctx.fill()
      if (ctx === g) {
        // lit along one side, a faint vein
        ctx.fillStyle = 'rgba(235,255,200,0.22)'
        ctx.beginPath()
        ctx.ellipse(-r * 0.2, -r * 0.2, r * 0.35, r * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(50,90,50,0.25)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(0, -r * 0.7)
        ctx.lineTo(0, r * 0.6)
        ctx.stroke()
      }
      ctx.restore()
    }
  }
  const map = new CanvasTexture(col)
  map.colorSpace = SRGBColorSpace
  return { map, alphaMap: new CanvasTexture(cut) }
}
const LEAF_TEX = typeof document !== 'undefined' ? leafTextures() : null
const LEAVES = bruno({ map: LEAF_TEX?.map, alphaMap: LEAF_TEX?.alphaMap, alphaTest: 0.5, vertexColors: true, side: DoubleSide, shade: '#5d6fae', sway: 5, swayFrom: 150 })
LEAVES.defines = { ...LEAVES.defines, NO_FLIP: '' }
const CORE = bruno({ color: '#40683f', shade: '#3c4a78' })

/** a soft shape for the leaves to fill: an ellipsoid (a bush's mound) or a rounded box (the clipped
 *  hedge); `surface` gives a point in it near its skin, and the way out of it there */
type Shape3 = { at: Vector3; size: Vector3; box: boolean }
function surface(s: Shape3, rand: () => number, p: Vector3, n: Vector3) {
  // a direction, then out to the skin (a superellipsoid: round, or squarish for the hedge)
  const e = s.box ? 4 : 2
  n.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()
  if (n.y < -0.3) n.y = -n.y * 0.5 // (hardly any underneath: it sits on the ground)
  const k = Math.pow(Math.pow(Math.abs(n.x), e) + Math.pow(Math.abs(n.y), e) + Math.pow(Math.abs(n.z), e), -1 / e)
  const depth = 0.72 + 0.28 * (1 - Math.pow(rand(), 2)) // (mostly in the outer shell)
  p.set(n.x * k * depth * s.size.x, n.y * k * depth * s.size.y, n.z * k * depth * s.size.z).add(s.at)
  // the way out: the superellipsoid's gradient there
  n.set(Math.sign(n.x) * Math.pow(Math.abs(n.x * k), e - 1) / s.size.x, Math.sign(n.y) * Math.pow(Math.abs(n.y * k), e - 1) / s.size.y, Math.sign(n.z) * Math.pow(Math.abs(n.z * k), e - 1) / s.size.z).normalize()
}

/** the leaf cards through the shapes: lighter on top where the sun gets them, cooler underneath */
function foliage(shapes: Shape3[], seed: number) {
  const rand = rng(seed)
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const q = new Quaternion()
  const m = new Matrix4()
  const v = new Vector3()
  const p = new Vector3()
  const out = new Vector3()
  const tint = new Color()
  const TOP = new Color('#fbffe6')
  const LOW = new Color('#b7c9b0')
  for (const s of shapes) {
    const area = s.size.x * s.size.z + (s.size.x + s.size.z) * s.size.y * 2
    const n = Math.round(area / 900)
    const size = Math.min(s.size.x, s.size.y, s.size.z) * 0.55 + 30
    for (let i = 0; i < n; i++) {
      surface(s, rand, p, out)
      q.setFromAxisAngle(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * Math.PI * 2)
      m.compose(p, q, new Vector3(size * (0.8 + rand() * 0.4), size * (0.8 + rand() * 0.4), 1))
      tint.copy(LOW).lerp(TOP, Math.min(1, Math.max(0, out.y * 0.7 + 0.45))).multiplyScalar(0.94 + rand() * 0.1)
      const base = pos.length / 3
      ;[
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ].forEach(([x, y], k) => {
        v.set(x, y, 0).applyMatrix4(m)
        pos.push(v.x, Math.max(v.y, 6), v.z)
        nor.push(out.x, out.y, out.z)
        uv.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 1)
        col.push(tint.r, tint.g, tint.b)
      })
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  return geo
}

/** the shapes: the hedge a clipped mound, long and squarish; each bush a round mound or two */
function shrubShapes() {
  const rand = rng(31)
  const out: Shape3[] = []
  for (const hd of SET.hedges) out.push({ at: new Vector3((hd.x0 + hd.x1) / 2, hd.h / 2, hd.z), size: new Vector3((hd.x1 - hd.x0) / 2, hd.h / 2, hd.d / 2), box: true })
  for (const b of SET.bushes) {
    out.push({ at: new Vector3(b.x, b.r * 0.62, b.z), size: new Vector3(b.r, b.r * 0.72, b.r * 0.9), box: false })
    out.push({ at: new Vector3(b.x + (rand() - 0.5) * b.r * 1.1, b.r * 0.42, b.z + (0.2 + rand() * 0.3) * b.r), size: new Vector3(b.r * 0.62, b.r * 0.48, b.r * 0.58), box: false })
  }
  return out
}

export function Hedges() {
  const { geo, cores } = useMemo(() => {
    const shapes = shrubShapes()
    return { geo: foliage(shapes, 8), cores: shapes }
  }, [])
  return (
    <group>
      <mesh geometry={geo} material={LEAVES} castShadow receiveShadow />
      {/* the dark cores, a little inside the leaves */}
      {cores.map((s, i) =>
        s.box ? (
          <mesh key={i} material={CORE} position={s.at} scale={s.size.clone().multiplyScalar(1.7)}>
            <primitive object={CORE_BOX} attach="geometry" />
          </mesh>
        ) : (
          <mesh key={i} material={CORE} position={s.at} scale={s.size.clone().multiplyScalar(0.8)}>
            <sphereGeometry args={[1, 16, 12]} />
          </mesh>
        ),
      )}
    </group>
  )
}
const CORE_BOX = new RoundedBoxGeometry(1, 1, 1, 3, 0.3)
