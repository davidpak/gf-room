import { useEffect, useMemo, useState } from 'react'
import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, RingGeometry, SRGBColorSpace, Vector3, type Mesh, type Texture, type WebGLProgramParametersWithUniforms } from 'three'
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

const geo = new Map<string, { top: RingGeometry; under: RingGeometry; rim: CylinderGeometry }>()
const discGeo = (r: number, hole: number) => {
  const k = `${r}/${hole}`
  let g = geo.get(k)
  if (!g) {
    g = {
      top: new RingGeometry(hole, r, 160, 1).rotateX(-Math.PI / 2),
      // (seen from under, read the right way round: the ring turned over the other way, its uv mirrored)
      under: (() => {
        const u = new RingGeometry(hole, r, 160, 1)
        const uv = u.attributes.uv
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i))
        return u.rotateX(Math.PI / 2)
      })(),
      rim: new CylinderGeometry(r, r, 1, 160, 1, true),
    }
    geo.set(k, g)
  }
  return g
}
const RIM = bruno({ color: '#2a2a30', shade: '#4a4060' })

/** disc `disc` of the pressing (sides 2·disc and 2·disc + 1) */
export function Disc({ p, art, disc = 0 }: { p: Pressing; art: Art; disc?: number }) {
  const S = sizeOf(p)
  const g = discGeo(S.r, S.hole)
  const label = S.label
  const mats = useMemo(() => [vinyl(art.sides[2 * disc], label + 4, S.r - 1.5), vinyl(art.sides[2 * disc + 1], label + 4, S.r - 1.5)], [art, disc, label, S.r])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  // (the sheen turns round the disc's middle, wherever it's carried)
  const track = (m: ReturnType<typeof vinyl>) => (o: Mesh | null) => {
    if (o) o.onBeforeRender = () => o.getWorldPosition(m.userData.center.value)
  }
  return (
    <group>
      <mesh ref={track(mats[0])} geometry={g.top} material={mats[0]} position={[0, S.t, 0]} castShadow receiveShadow />
      <mesh ref={track(mats[1])} geometry={g.under} material={mats[1]} />
      <mesh geometry={g.rim} material={RIM} position={[0, S.t / 2, 0]} scale={[1, S.t, 1]} />
    </group>
  )
}

/** the jacket: the cover, the back, card edges in the cover's own colour */
const jackets = new Map<string, BoxGeometry>()
export function Jacket({ p, art }: { p: Pressing; art: Art }) {
  const S = sizeOf(p)
  const k = `${S.sleeve}`
  let box = jackets.get(k)
  if (!box) jackets.set(k, (box = new BoxGeometry(S.sleeve, S.sleeve, S.sleeveT)))
  const mats = useMemo(() => {
    const edge = bruno({ color: art.inks.spine })
    return [edge, edge, edge, edge, bruno({ map: art.cover }), bruno({ map: art.back })]
  }, [art])
  return <mesh geometry={box} material={mats} position={[0, S.sleeve / 2, 0]} castShadow receiveShadow />
}

/** paper inner sleeve: white, the record's middle showing through its round window */
export const INNER = bruno({ color: '#f7f2ea', side: DoubleSide })
