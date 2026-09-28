import { useMemo } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Quaternion, RepeatWrapping, SRGBColorSpace, Shape, Vector3, type Material } from 'three'
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

// ---- the hedge and the bushes: Bruno's foliage, green (cards of leaves in clusters)
function leafTextures() {
  const N = 128
  const col = document.createElement('canvas')
  const cut = document.createElement('canvas')
  col.width = col.height = cut.width = cut.height = N
  const g = col.getContext('2d')!
  const a = cut.getContext('2d')!
  a.fillStyle = '#000'
  a.fillRect(0, 0, N, N)
  g.fillStyle = '#5d8a4c'
  g.fillRect(0, 0, N, N)
  const rand = rng(12)
  for (let i = 0; i < 11; i++) {
    const r = 18 + rand() * 10
    const d = rand() ** 0.8 * (N / 2 - r - 4)
    const th = rand() * Math.PI * 2
    const x = N / 2 + Math.cos(th) * d
    const y = N / 2 + Math.sin(th) * d
    const rot = rand() * Math.PI * 2
    for (const [ctx, fill] of [
      [a, '#fff'],
      [g, rand() < 0.5 ? '#6f9d55' : '#557f47'],
    ] as const) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.quadraticCurveTo(r * 0.62, 0, 0, r)
      ctx.quadraticCurveTo(-r * 0.62, 0, 0, -r)
      ctx.fill()
      if (ctx === g) {
        ctx.strokeStyle = 'rgba(210,235,160,0.35)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, -r * 0.8)
        ctx.lineTo(0, r * 0.8)
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
const LEAVES = bruno({ map: LEAF_TEX?.map, alphaMap: LEAF_TEX?.alphaMap, alphaTest: 0.5, vertexColors: true, side: DoubleSide, shade: '#4f5a93', sway: 6, swayFrom: 120 })
LEAVES.defines = { ...LEAVES.defines, NO_FLIP: '' }
const GREENS = ['#ffffff', '#e9f5dc', '#dcecd0', '#f2f7e4']

/** foliage: a cluster of leaf cards through a squashed ball per (centre, radius) */
function foliage(balls: { at: Vector3; r: number }[], seed: number) {
  const rand = rng(seed)
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const q = new Quaternion()
  const m = new Matrix4()
  const v = new Vector3()
  const out = new Vector3()
  const tint = new Color()
  for (const { at, r } of balls) {
    const n = Math.round(r * 0.28)
    const size = r * 0.62
    for (let i = 0; i < n; i++) {
      const dir = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()
      const p = at.clone().addScaledVector(dir, (1 - Math.pow(rand(), 3)) * r)
      p.y = Math.max(at.y + (p.y - at.y) * 0.8, 30)
      q.setFromAxisAngle(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * Math.PI * 2)
      m.compose(p, q, new Vector3(size * (0.8 + rand() * 0.4), size * (0.8 + rand() * 0.4), 1))
      out.copy(p).sub(at).normalize()
      out.y = out.y * 0.8 + 0.25
      out.normalize()
      tint.set(GREENS[Math.floor(rand() * GREENS.length)])
      if (out.y < 0) tint.multiplyScalar(0.8)
      const base = pos.length / 3
      ;[
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ].forEach(([x, y], k) => {
        v.set(x, y, 0).applyMatrix4(m)
        pos.push(v.x, v.y, v.z)
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

export function Hedges() {
  const geo = useMemo(() => {
    const rand = rng(31)
    const balls: { at: Vector3; r: number }[] = []
    // the hedge: a long clipped mound, balls along it overlapping
    for (const hd of SET.hedges)
      for (let x = hd.x0 + hd.d / 2; x <= hd.x1 - hd.d / 2; x += hd.d * 0.45)
        balls.push({ at: new Vector3(x, hd.h * 0.55, hd.z + (rand() - 0.5) * 30), r: hd.d * (0.55 + rand() * 0.08) })
    // the bushes: a round mound or two each
    for (const b of SET.bushes) {
      balls.push({ at: new Vector3(b.x, b.r * 0.7, b.z), r: b.r })
      balls.push({ at: new Vector3(b.x + (rand() - 0.5) * b.r, b.r * 0.5, b.z + (rand() - 0.2) * b.r * 0.6), r: b.r * 0.7 })
    }
    return foliage(balls, 8)
  }, [])
  return <mesh geometry={geo} material={LEAVES} castShadow receiveShadow />
}
