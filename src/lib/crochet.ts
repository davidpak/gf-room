import { BufferAttribute, BufferGeometry, CanvasTexture, MeshPhysicalMaterial, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector2, Vector3 } from 'three'

/**
 * Crochet (amigurumi) look, procedural like the fabrics:
 *
 *   getCrochetMaps   tileable single-crochet stitches: each stitch a "V" of two twisted yarn
 *                    loops, rows stacked like crochet rounds. Two maps from one height field:
 *                    normal (the bumps) and a greyscale colour multiplier (dark gaps, lit loops)
 *   yarnMaterial     matte yarn with a sheen in its own colour (the fuzzy halo real yarn has)
 *   lathe            revolve a [radius, y] profile. UVs are in STITCHES, so the rows run around
 *                    the rounds like real amigurumi and stitches are the same size on every part.
 *                    'patch' mode instead maps 0..1 over a region, for embroidery decals
 *   embroidery       draw backstitch / satin-stitch threads on a canvas, with raised relief
 */
export const TILE = 8 // stitches per texture tile, each way

let maps: { normal: CanvasTexture; tone: CanvasTexture } | null = null

export function getCrochetMaps() {
  if (maps) return maps
  const N = 256
  const C = N / TILE // px per stitch
  let seed = 31
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const jit = Array.from({ length: TILE * TILE }, () => [rnd() - 0.5, rnd() - 0.5, rnd()])
  const h = new Float32Array(N * N)
  const tone = new Float32Array(N * N)
  // one yarn loop: an ellipse leaning `lean` radians, with plies twisting across it
  const loop = (x: number, y: number, cx: number, cy: number, lean: number) => {
    const dx = x - cx
    const dy = y - cy
    const c = Math.cos(lean)
    const s = Math.sin(lean)
    const u = (dx * c - dy * s) / 0.2 // across the loop
    const v = (dx * s + dy * c) / 0.44 // along the loop
    const d = u * u + v * v
    if (d >= 1) return 0
    const dome = Math.pow(1 - d, 0.55)
    const ply = 0.12 * Math.sin((u * 2.2 + v * 3.4) * Math.PI) // twisted plies
    return dome * (0.9 + ply)
  }
  for (let py = 0; py < N; py++)
    for (let px = 0; px < N; px++) {
      const gx = px / C
      const gy = py / C
      let best = 0
      let bestTone = 1
      // look at this stitch and its neighbours (loops overlap a little)
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const sx = Math.floor(gx) + ox
          const sy = Math.floor(gy) + oy
          const j = jit[(((sy % TILE) + TILE) % TILE) * TILE + (((sx % TILE) + TILE) % TILE)]
          const cx = sx + 0.5 + j[0] * 0.08
          const cy = sy + 0.5 + j[1] * 0.08
          const lx = gx - cx
          const ly = gy - cy
          // the V: two loops meeting at the bottom, leaning apart
          const a = loop(lx, ly, -0.17, -0.02, 0.5)
          const b = loop(lx, ly, 0.17, -0.02, -0.5)
          const v = Math.max(a, b)
          if (v > best) {
            best = v
            bestTone = 0.93 + 0.14 * j[2]
          }
        }
      const k = py * N + px
      h[k] = best + (rnd() - 0.5) * 0.04 // fuzz
      tone[k] = (0.5 + 0.5 * Math.pow(best, 0.6)) * bestTone
    }
  const mk = (fill: (d: Uint8ClampedArray) => void, color: boolean) => {
    const c = document.createElement('canvas')
    c.width = c.height = N
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(N, N)
    fill(img.data)
    ctx.putImageData(img, 0, 0)
    const t = new CanvasTexture(c)
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = color ? SRGBColorSpace : NoColorSpace
    t.anisotropy = 8
    return t
  }
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)]
  const normal = mk((d) => {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 4
        const dy = (at(x, y + 1) - at(x, y - 1)) * 4
        const len = Math.hypot(dx, dy, 1)
        const k = (y * N + x) * 4
        d[k] = ((-dx / len) * 0.5 + 0.5) * 255
        d[k + 1] = ((-dy / len) * 0.5 + 0.5) * 255
        d[k + 2] = ((1 / len) * 0.5 + 0.5) * 255
        d[k + 3] = 255
      }
  }, false)
  const toneTex = mk((d) => {
    for (let i = 0; i < N * N; i++) {
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.min(1, tone[i]) * 255
      d[i * 4 + 3] = 255
    }
  }, true)
  maps = { normal, tone: toneTex }
  return maps
}

const yarnCache = new Map<string, MeshPhysicalMaterial>()

/** Matte yarn: stitch maps, no highlight, a sheen in the yarn's own (lighter) colour. */
export function yarnMaterial(color: string, sheen: string) {
  const key = color + sheen
  let m = yarnCache.get(key)
  if (m) return m
  const { normal, tone } = getCrochetMaps()
  m = new MeshPhysicalMaterial({
    color,
    map: tone,
    normalMap: normal,
    normalScale: new Vector2(1.1, 1.1),
    roughness: 1,
    specularIntensity: 0.12,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: sheen,
  })
  yarnCache.set(key, m)
  return m
}

export type LatheOptions = {
  stitch?: { w: number; h: number }
  segments?: number
  theta?: [number, number] // start, length (radians; 0 = +Z, increasing toward +X)
  yRange?: [number, number] // only the part of the profile between these heights
  offset?: number // push out along the surface normal (mm): layers, decals
  uv?: 'stitch' | 'patch'
  step?: number // mm between rows of vertices
  bend?: (p: Vector3) => void // reshape after revolving (e.g. the beanie's slouch)
}

/** Revolve a [radius, y] profile (bottom to top) around Y. */
export function lathe(profile: [number, number][], o: LatheOptions = {}) {
  const stitch = o.stitch ?? { w: 4.6, h: 4.0 }
  const seg = o.segments ?? 56
  const [t0, tl] = o.theta ?? [0, Math.PI * 2]
  const step = o.step ?? 2.5
  const off = o.offset ?? 0
  // resample the profile evenly by arc length, clipped to yRange
  const pts = clipProfile(profile, o.yRange)
  const arc = [0]
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = arc[arc.length - 1]
  const rows = Math.max(2, Math.ceil(total / step) + 1)
  const samp: { r: number; y: number; nr: number; ny: number; s: number }[] = []
  let k = 0
  for (let i = 0; i < rows; i++) {
    const s = (total * i) / (rows - 1)
    while (k < arc.length - 2 && arc[k + 1] < s) k++
    const f = arc[k + 1] > arc[k] ? (s - arc[k]) / (arc[k + 1] - arc[k]) : 0
    const r = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f
    const y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f
    const tr = pts[k + 1][0] - pts[k][0]
    const ty = pts[k + 1][1] - pts[k][1]
    const tlen = Math.hypot(tr, ty) || 1
    samp.push({ r, y, nr: ty / tlen, ny: -tr / tlen, s })
  }
  const rMax = Math.max(...pts.map((p) => p[0]))
  const around = Math.max(6, Math.round((2 * Math.PI * rMax) / stitch.w))
  const pos = new Float32Array(rows * (seg + 1) * 3)
  const uv = new Float32Array(rows * (seg + 1) * 2)
  const v3 = new Vector3()
  for (let i = 0; i < rows; i++) {
    const p = samp[i]
    const r = Math.max(0, p.r + p.nr * off)
    const y = p.y + p.ny * off
    for (let j = 0; j <= seg; j++) {
      const th = t0 + (tl * j) / seg
      v3.set(r * Math.sin(th), y, r * Math.cos(th))
      o.bend?.(v3)
      const n = i * (seg + 1) + j
      v3.toArray(pos, n * 3)
      if (o.uv === 'patch') {
        uv[n * 2] = j / seg
        uv[n * 2 + 1] = total > 0 ? p.s / total : 0
      } else {
        uv[n * 2] = ((th / (Math.PI * 2)) * around) / TILE
        uv[n * 2 + 1] = p.s / stitch.h / TILE
      }
    }
  }
  const idx: number[] = []
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j
      const b = a + 1
      const c = a + seg + 1
      const d = c + 1
      idx.push(a, b, c, b, d, c)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // the tips of the profile (radius 0) collapse to one point with no area around it, so they get
  // no normal: NaN in the lighting, which bloom smears into black squares. Point them along the axis
  const nrm = g.getAttribute('normal')
  for (let i = 0; i < rows; i++) {
    const p = samp[i]
    if (p.r + p.nr * off > 1e-3) continue
    const sy = p.ny >= 0 ? 1 : -1
    for (let j = 0; j <= seg; j++) nrm.setXYZ(i * (seg + 1) + j, 0, sy, 0)
  }
  for (let i = 0; i < nrm.count; i++) if (nrm.getX(i) ** 2 + nrm.getY(i) ** 2 + nrm.getZ(i) ** 2 < 1e-12) nrm.setXYZ(i, 0, 1, 0)
  return g
}

/** Profile points between two heights (interpolating the ends). */
function clipProfile(profile: [number, number][], range?: [number, number]) {
  if (!range) return profile
  const [y0, y1] = range
  const out: [number, number][] = []
  const lerp = (a: [number, number], b: [number, number], y: number): [number, number] => {
    const f = (y - a[1]) / (b[1] - a[1])
    return [a[0] + (b[0] - a[0]) * f, y]
  }
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]
    const inside = p[1] >= y0 && p[1] <= y1
    if (i > 0) {
      const q = profile[i - 1]
      for (const edge of [y0, y1])
        if ((q[1] - edge) * (p[1] - edge) < 0) out.push(lerp(q, p, edge))
    }
    if (inside) out.push(p)
  }
  return out
}

/** The radius of a profile at height y (for placing things on a lathe surface). */
export function radiusAt(profile: [number, number][], y: number) {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]
    const b = profile[i]
    if ((y - a[1]) * (y - b[1]) <= 0 && a[1] !== b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1])
  }
  return 0
}

export type Stitcher = {
  /** mm → px on this canvas (origin top-left of the decal) */
  mm: number
  /** running/back stitch along a path: dashes with tiny gaps, each a raised thread */
  backstitch: (draw: (ctx: CanvasRenderingContext2D) => void, color: string, widthMM?: number, stitchMM?: number) => void
  /** satin stitch: a filled shape covered in parallel threads, puffy */
  satin: (draw: (ctx: CanvasRenderingContext2D) => void, color: string, angle?: number) => void
}

/**
 * An embroidery decal: `draw` stitches threads onto a `wMM × hMM` canvas. Returns a material
 * (alpha-tested so only the threads show) with relief from a normal map.
 */
export function embroidery(wMM: number, hMM: number, draw: (s: Stitcher) => void, pxPerMM = 12) {
  const W = Math.ceil(wMM * pxPerMM)
  const H = Math.ceil(hMM * pxPerMM)
  const color = document.createElement('canvas')
  const height = document.createElement('canvas')
  color.width = height.width = W
  color.height = height.height = H
  const cc = color.getContext('2d')!
  const hc = height.getContext('2d')!
  hc.fillStyle = '#000'
  hc.fillRect(0, 0, W, H)
  const px = pxPerMM
  const setup = (ctx: CanvasRenderingContext2D) => {
    ctx.setTransform(px, 0, 0, px, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }
  const s: Stitcher = {
    mm: px,
    backstitch(path, col, width = 1.1, len = 2.6) {
      for (const [ctx, style] of [
        [cc, col],
        [hc, '#fff'],
      ] as const) {
        ctx.save()
        setup(ctx)
        ctx.setLineDash([len, 0.45])
        ctx.lineWidth = width
        ctx.strokeStyle = style
        ctx.beginPath()
        path(ctx)
        ctx.stroke()
        ctx.restore()
      }
    },
    satin(path, col, angle = 0.7) {
      // paint the shape (paths are filled; text drawn with fillText paints itself) on a scratch canvas
      const paint = (fill: string) => {
        const t = document.createElement('canvas')
        t.width = W
        t.height = H
        const tc = t.getContext('2d')!
        setup(tc)
        tc.fillStyle = fill
        tc.strokeStyle = fill
        tc.beginPath()
        path(tc)
        tc.fill()
        return { t, tc }
      }
      // colour: the fill, with fine parallel thread lines laid over it
      const { t, tc } = paint(col)
      tc.globalCompositeOperation = 'source-atop'
      tc.strokeStyle = 'rgba(0,0,0,0.18)'
      tc.lineWidth = 0.12
      const d = Math.max(wMM, hMM) * 2
      for (let k = -d; k < d; k += 0.55) {
        tc.beginPath()
        tc.moveTo(k * Math.cos(angle) - d * Math.sin(angle), k * Math.sin(angle) + d * Math.cos(angle))
        tc.lineTo(k * Math.cos(angle) + d * Math.sin(angle), k * Math.sin(angle) - d * Math.cos(angle))
        tc.stroke()
      }
      cc.drawImage(t, 0, 0)
      // height: puffy (a blurred copy of the shape)
      const hgt = paint('#fff')
      hc.save()
      hc.filter = `blur(${0.5 * px}px)`
      hc.drawImage(hgt.t, 0, 0)
      hc.restore()
    },
  }
  draw(s)
  // normal map from the height canvas
  const hd = hc.getImageData(0, 0, W, H).data
  const nc = document.createElement('canvas')
  nc.width = W
  nc.height = H
  const nctx = nc.getContext('2d')!
  const img = nctx.createImageData(W, H)
  const at = (x: number, y: number) => hd[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4] / 255
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3
      const len = Math.hypot(dx, dy, 1)
      const k = (y * W + x) * 4
      img.data[k] = ((-dx / len) * 0.5 + 0.5) * 255
      img.data[k + 1] = ((dy / len) * 0.5 + 0.5) * 255 // canvas y runs down, texture v runs up
      img.data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255
      img.data[k + 3] = 255
    }
  nctx.putImageData(img, 0, 0)
  const map = new CanvasTexture(color)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 8
  const normalMap = new CanvasTexture(nc)
  normalMap.colorSpace = NoColorSpace
  return new MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new Vector2(1.2, 1.2),
    alphaTest: 0.45,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
}
