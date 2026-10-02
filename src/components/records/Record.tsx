import { useEffect, useMemo, useState } from 'react'
import { BufferGeometry, CanvasTexture, CylinderGeometry, Float32BufferAttribute, SRGBColorSpace, Vector3, type Mesh, type Texture, type WebGLProgramParametersWithUniforms } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { LOOK, bruno } from '../quad/bruno'
import { drawBack, drawCover, drawSide, inksOf, loadCover, type Inks } from './art'
import { sizeOf, type Pressing } from './vinyl'

/**
 * A record (./vinyl) and its jacket, made from a pressing: the disc, both faces pressed with its sides (./art), the
 * groove's sheen (the light caught across the grooves as a bright bow-tie, turning as the disc doesn't: worked out
 * from the groove's direction at each point, round the disc's middle); the jacket, its cover the album's own.
 *
 * Disc: lying in its frame's xz plane, its middle at the origin, side A up (its label's top toward -z), its bottom
 * at y 0. Jacket: standing in its xy plane, the cover toward +z, its bottom at y 0, its open edge at +x.
 */
export type Art = { cover: Texture; back: Texture; sides: Texture[]; inks: Inks }
const cache = new Map<string, Promise<Art>>()

/** the pressing's pictures (cached by album: drawn once however many times it's shown) */
export function artOf(p: Pressing): Promise<Art> {
  let a = cache.get(p.uri)
  if (!a) {
    a = loadCover(p.cover).then((im) => {
      const src = im ?? drawCover(p.title, p.artist)
      const c = document.createElement('canvas')
      c.width = c.height = 640
      c.getContext('2d')!.drawImage(src, 0, 0, 640, 640)
      const cover = new CanvasTexture(c)
      cover.colorSpace = SRGBColorSpace
      cover.anisotropy = 8
      const inks = inksOf(c)
      // (the sides drawn as they're needed would hitch on show; they're quick enough: all at once)
      return { cover, back: drawBack(p, inks), sides: p.sides.map((s) => drawSide(p, s, inks, p.size === 'lp' ? 2048 : 1024)), inks }
    })
    cache.set(p.uri, a)
  }
  return a
}
export function useArt(p: Pressing | null) {
  const [art, set] = useState<Art | null>(null)
  useEffect(() => {
    let live = true
    set(null)
    if (p) artOf(p).then((a) => live && set(a))
    return () => void (live = false)
  }, [p])
  return art
}

/** vinyl: bruno's light, and the grooves' sheen (Kajiya–Kay, the groove running round the middle) */
function vinyl(map: Texture, inner: number, outer: number) {
  const m = bruno({ map })
  const center = { value: new Vector3() }
  const base = m.onBeforeCompile
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms, r) => {
    base.call(m, s, r)
    s.uniforms.uCenter = center
    s.uniforms.uSunDir = { value: LOOK.sun }
    s.uniforms.uGroove = { value: [inner, outer] }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uCenter;\nuniform vec3 uSunDir;\nuniform vec2 uGroove;`)
      .replace(
        '  // gloss: the evening sky',
        `  {
    // the grooves catch the light where they run across it: brightest along a line through the middle
    vec3 d = vWPos - uCenter;
    vec3 N = normalize(vWNormal);
    vec3 rad = d - N * dot(d, N);
    float rr = length(rad);
    vec3 T = cross(N, rad / max(rr, 1e-4));
    vec3 V = normalize(cameraPosition - vWPos);
    vec3 H = normalize(uSunDir + V);
    float th = dot(T, H);
    float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 420.0);
    float on = smoothstep(uGroove.x, uGroove.x + 2.0, rr) * (1.0 - smoothstep(uGroove.y - 1.0, uGroove.y, rr)) * smoothstep(0.75, 0.97, diffuseColor.a); // (none on the smooth gaps)
    col += uLight * spec * on * 0.4 * max(0.0, dot(N, uSunDir) + 0.25);
  }
  // gloss: the evening sky`,
      )
  }
  m.customProgramCacheKey = () => 'vinyl'
  m.userData.center = center
  return m
}

/**
 * The disc's shape, its faces planar-mapped (the side's picture straight on): flat across the grooves, the label's
 * area raised a little, a raised bead round the edge, rounded off (records rest on these two, the grooves clear).
 */
const BASE = 0.35 // (the bead's and the label's rise over the grooves, each face)
export const discThick = (S: { t: number }) => S.t + 2 * BASE
function bump(r: number, S: { r: number; label: number }) {
  if (r <= S.label + 1) return 0.3
  if (r <= S.label + 2.5) return 0.3 * (1 - (r - S.label - 1) / 1.5)
  if (r < S.r - 3) return 0
  if (r < S.r - 1.4) return BASE * ((r - (S.r - 3)) / 1.6) ** 0.7
  return BASE - (BASE - 0.12) * ((r - (S.r - 1.4)) / 1.4) ** 2
}
function face(S: { r: number; hole: number; label: number }, under: boolean) {
  const radii = [S.hole, S.label - 2, S.label + 1, S.label + 1.8, S.label + 2.5]
  for (let r = S.label + 8; r < S.r - 3; r += 8) radii.push(r)
  radii.push(S.r - 3, S.r - 2.4, S.r - 1.8, S.r - 1.4, S.r - 0.9, S.r - 0.4, S.r)
  const seg = 160
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  radii.forEach((r) => {
    const z = bump(r, S)
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2
      const x = r * Math.cos(th)
      const y = r * Math.sin(th)
      pos.push(x, y, z)
      uv.push((x / S.r + 1) / 2, (y / S.r + 1) / 2)
    }
  })
  for (let j = 0; j < radii.length - 1; j++)
    for (let i = 0; i < seg; i++) {
      const p = j * (seg + 1) + i
      const q = p + seg + 1
      idx.push(p, q, p + 1, q, q + 1, p + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  // (up for the top; for the face under, turned over the other way: seen from below, its picture reads the right way)
  g.rotateX(under ? Math.PI / 2 : -Math.PI / 2)
  g.computeVertexNormals()
  return g
}
const geo = new Map<string, { top: BufferGeometry; under: BufferGeometry; rim: CylinderGeometry }>()
const discGeo = (S: { r: number; hole: number; label: number }) => {
  const k = `${S.r}/${S.hole}`
  let g = geo.get(k)
  if (!g) geo.set(k, (g = { top: face(S, false), under: face(S, true), rim: new CylinderGeometry(S.r, S.r, 1, 160, 1, true) }))
  return g
}

/** disc `disc` of the pressing (sides 2·disc and 2·disc + 1); its lowest points (the bead, the label, under) at y 0 */
export function Disc({ p, art, disc = 0 }: { p: Pressing; art: Art; disc?: number }) {
  const S = sizeOf(p)
  const g = discGeo(S)
  const label = S.label
  const mats = useMemo(() => [vinyl(art.sides[2 * disc], label + 4, S.r - 3), vinyl(art.sides[2 * disc + 1], label + 4, S.r - 3)], [art, disc, label, S.r])
  const rim = useMemo(() => bruno({ color: art.inks.rim, shade: '#4a4060' }), [art])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  // (the sheen turns round the disc's middle, wherever it's carried)
  const track = (m: ReturnType<typeof vinyl>) => (o: Mesh | null) => {
    if (o) o.onBeforeRender = () => o.getWorldPosition(m.userData.center.value)
  }
  return (
    <group>
      <mesh ref={track(mats[0])} geometry={g.top} material={mats[0]} position={[0, BASE + S.t, 0]} castShadow receiveShadow />
      <mesh ref={track(mats[1])} geometry={g.under} material={mats[1]} position={[0, BASE, 0]} />
      <mesh geometry={g.rim} material={rim} position={[0, BASE + S.t / 2, 0]} scale={[1, S.t + 0.24, 1]} />
    </group>
  )
}

/** the jacket's spine and top edge, printed: the album and its artist along them */
function edgeArt(p: Pressing, art: Art, along: 'v' | 'u') {
  const c = document.createElement('canvas')
  const L = 1024
  const W = 40
  c.width = along === 'v' ? W : L
  c.height = along === 'v' ? L : W
  const g = c.getContext('2d')!
  g.fillStyle = art.inks.spine
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = art.inks.spineInk
  g.font = "700 26px 'Gaegu', 'Nunito', cursive"
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  const text = `${p.title}  ·  ${p.artist}`.toUpperCase()
  g.save()
  if (along === 'v') {
    g.translate(W / 2, L / 2)
    g.rotate(-Math.PI / 2)
  } else g.translate(L / 2, W / 2)
  let t = text
  while (g.measureText(t).width > L * 0.92 && t.length > 4) t = t.slice(0, -2)
  g.fillText(t === text ? t : t + '…', 0, 1)
  g.restore()
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/**
 * The jacket: the cover, the back, card edges in the cover's own colour, the spine (and top) printed; rounded a
 * touch at its corners. `peek` (0..1): how far its record's slid out of its open edge (+x), standing in it.
 */
const jackets = new Map<string, RoundedBoxGeometry>()
export function Jacket({ p, art, peek = 0 }: { p: Pressing; art: Art; peek?: number }) {
  const S = sizeOf(p)
  const k = `${S.sleeve}`
  let box = jackets.get(k)
  if (!box) jackets.set(k, (box = new RoundedBoxGeometry(S.sleeve, S.sleeve, S.sleeveT, 2, Math.min(1.2, S.sleeveT / 2 - 0.1))))
  const mats = useMemo(() => {
    const edge = bruno({ color: art.inks.spine })
    return [edge, bruno({ map: edgeArt(p, art, 'v') }), bruno({ map: edgeArt(p, art, 'u') }), edge, bruno({ map: art.cover }), bruno({ map: art.back })]
  }, [art, p])
  return (
    <group>
      <mesh geometry={box} material={mats} position={[0, S.sleeve / 2, 0]} castShadow receiveShadow />
      {peek > 0 && (
        // (standing in the jacket's plane, side A toward the cover; slid out of the open edge by peek of its width)
        <group position={[S.sleeve / 2 + peek * 2 * S.r - S.r, S.sleeve / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <group position={[0, -discThick(S) / 2, 0]}>
            <Disc p={p} art={art} />
          </group>
        </group>
      )}
    </group>
  )
}
