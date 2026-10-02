import { useEffect, useMemo, useState } from 'react'
import { BufferGeometry, CanvasTexture, Color, CylinderGeometry, DataTexture, Float32BufferAttribute, RGFormat, SRGBColorSpace, Vector3, type Mesh, type Texture, type WebGLProgramParametersWithUniforms } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import '../../lib/render/bvh'
import { LOOK, bruno } from '../quad/bruno'
import { drawBack, drawSide, inksOf, type Inks, type SideArt } from './art'
import { bigCover, inksFor } from './covers'
import { LP, sizeOf, type Pressing } from './vinyl'

/**
 * A record (./vinyl) and its jacket, made from a pressing: the disc, both faces pressed with its sides (./art), the
 * groove's sheen (the light caught across the grooves as a bright bow-tie, turning as the disc doesn't: worked out
 * from the groove's direction at each point, round the disc's middle); the jacket, its cover the album's own.
 *
 * Disc: lying in its frame's xz plane, its middle at the origin, side A up (its label's top toward -z), its bottom
 * at y 0. Jacket: standing in its xy plane, the cover toward +z, its bottom at y 0, its open edge at +x.
 */
export type Art = { cover: Texture; back: () => Texture; side: (k: number) => SideArt; inks: Inks }
const cache = new Map<string, Promise<Art>>()

/** the pressing's pictures (cached by album: drawn once however many times it's shown) */
export function artOf(p: Pressing): Promise<Art> {
  // (by album, and whether it's pressed yet: a jacket's back has no songs on it, its record's does)
  const key = `${p.uri}#${p.sides.length}`
  let a = cache.get(key)
  if (!a) {
    a = bigCover(p).then((cover) => {
      const inks = inksFor(p) ?? inksOf(cover.image as CanvasImageSource)
      // (each side drawn the first time its record's shown: a crate of albums costs only their jackets)
      const sides: SideArt[] = []
      const side = (k: number) => (sides[k] ??= drawSide(p, p.sides[k], inks))
      let back: Texture | null = null
      return { cover, back: () => (back ??= drawBack(p, inks)), side, inks }
    })
    cache.set(key, a)
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

/**
 * vinyl: bruno's light; its face put together from the side's two parts (../art drawSide): the grooves, from each
 * point's radius, read off the side's profile, and the label over them; and the grooves' sheen (Kajiya–Kay, the
 * groove running round the middle)
 */
function vinyl(a: SideArt, R: number, inner: number, outer: number) {
  const m = bruno({ map: a.label })
  const center = { value: new Vector3() }
  const base = m.onBeforeCompile
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms, r) => {
    base.call(m, s, r)
    s.uniforms.uCenter = center
    s.uniforms.uSunDir = { value: LOOK.sun }
    s.uniforms.uGroove = { value: [inner, outer] }
    s.uniforms.uProf = { value: a.prof }
    s.uniforms.uProfLen = { value: a.prof.image.width * 0.05 }
    s.uniforms.uBase = { value: a.base }
    s.uniforms.uR = { value: R }
    s.uniforms.uReach = { value: a.reach }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uCenter;
uniform vec3 uSunDir;
uniform vec2 uGroove;
uniform sampler2D uProf;
uniform float uProfLen;
uniform vec3 uBase;
uniform float uR;
uniform float uReach;`)
      .replace(
        '#include <map_fragment>',
        `vec2 q = (vMapUv - 0.5) * 2.0 * uR; // (mm from the middle: the face's uv spans its diameter)
  float rq = length(q);
  vec2 pr = texture2D(uProf, vec2(rq / uProfLen, 0.5)).rg;
  vec3 vin = uBase * pow(pr.r * 4.0, 2.2); // (the profile's lightness, as it was on the picture's bytes)
  vec4 lab = texture2D(map, q / (2.0 * uReach) + 0.5) * step(rq, uReach);
  diffuseColor.rgb = mix(vin, lab.rgb, lab.a);
  float gCut = pr.g * (1.0 - lab.a);`,
      )
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
    float on = smoothstep(uGroove.x, uGroove.x + 2.0, rr) * (1.0 - smoothstep(uGroove.y - 1.0, uGroove.y, rr)) * smoothstep(0.5, 0.9, gCut); // (none on the smooth gaps)
    col += uLight * spec * on * 0.4 * max(0.0, dot(N, uSunDir) + 0.25);
  }
  // gloss: the evening sky`,
      )
  }
  m.customProgramCacheKey = () => 'vinyl2'
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
  // (16k triangles a face: indexed, so the pointer passing over a record costs nothing: lib/render/bvh)
  g.computeBoundsTree()
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
  const mats = useMemo(() => [vinyl(art.side(2 * disc), S.r, label + 4, S.r - 3), vinyl(art.side(2 * disc + 1), S.r, label + 4, S.r - 3)], [art, disc, label, S.r])
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

/**
 * (Hidden: the vinyl's shaders compiled and the 12" record's shape made while the page loads (its warm-up draws
 * what's hidden too), not the moment the first record comes out of its jacket.)
 */
export function VinylWarm() {
  const w = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 4
    const label = new CanvasTexture(c)
    label.colorSpace = SRGBColorSpace
    const prof = new DataTexture(new Uint8Array(8), 4, 1, RGFormat)
    prof.needsUpdate = true
    return { g: discGeo(LP), m: vinyl({ label, prof, base: new Color('#1a1a1b'), reach: LP.label + 10 }, LP.r, LP.label + 4, LP.r - 3), rim: bruno({ color: '#2a2a30', shade: '#4a4060' }) }
  }, [])
  return (
    <group visible={false}>
      <mesh geometry={w.g.top} material={w.m} castShadow receiveShadow />
      <mesh geometry={w.g.under} material={w.m} />
      <mesh geometry={w.g.rim} material={w.rim} />
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
/** the same box, its faces in two groups: the cover (+z), then all the rest (a jacket seen in passing: two draws) */
const twoFaced = new Map<string, BufferGeometry>()
function twoFacedOf(box: RoundedBoxGeometry, k: string) {
  let g = twoFaced.get(k)
  if (!g) {
    g = box.clone()
    // (an index over its points in the new order: its own index's, or, unindexed, the points themselves)
    const idx = box.index?.array
    const cover = box.groups[4]
    const rest: number[] = []
    const front: number[] = []
    box.groups.forEach((gr, i) => {
      for (let j = gr.start; j < gr.start + gr.count; j++) (i === 4 ? front : rest).push(idx ? idx[j] : j)
    })
    g.setIndex([...front, ...rest])
    g.clearGroups()
    g.addGroup(0, cover.count, 0)
    g.addGroup(cover.count, rest.length, 1)
    twoFaced.set(k, g)
  }
  return g
}
/** `lite`: seen in passing: its cover, and the rest in its spine's colour (its printed spine and back left off) */
export function Jacket({ p, art, peek = 0, shadow = true, lite = false }: { p: Pressing; art: Art; peek?: number; shadow?: boolean; lite?: boolean }) {
  const S = sizeOf(p)
  const k = `${S.sleeve}`
  let box = jackets.get(k)
  if (!box) jackets.set(k, (box = new RoundedBoxGeometry(S.sleeve, S.sleeve, S.sleeveT, 2, Math.min(1.2, S.sleeveT / 2 - 0.1))))
  const mats = useMemo(() => {
    const edge = bruno({ color: art.inks.spine })
    if (lite) return [bruno({ map: art.cover }), edge]
    return [edge, bruno({ map: edgeArt(p, art, 'v') }), bruno({ map: edgeArt(p, art, 'u') }), edge, bruno({ map: art.cover }), bruno({ map: art.back() })]
  }, [art, p, lite])
  return (
    <group>
      <mesh geometry={lite ? twoFacedOf(box, k) : box} material={mats} position={[0, S.sleeve / 2, 0]} castShadow={shadow} receiveShadow />
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
