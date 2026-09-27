import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshStandardMaterial, Vector4, type Material, type Vector3 } from 'three'

/**
 * Shared fabric for the bed: cotton (sheet cover, pillowcases), fleece (the blanket's outside)
 * and plush (its sherpa inside).
 *
 *   look     a flat colour. No weave, fibre or pile maps, no tone noise and no sheen: the room is
 *            stylized (flat colours, soft light, rounded forms), so fabric reads by its shape and
 *            the way light rolls over it, not by texture. The only surface variation left is a
 *            gentle large-scale undulation on the tops, which shades as a soft gradient.
 *   divots   click leaves a soft dent with 2-7 random radiating creases; it sinks in gently,
 *            holds a beat, then smooths out. The same displacement runs in both shaders:
 *            the vertex shader moves the surface, the fragment shader bends the normal per
 *            pixel, so creases shade smoothly.
 *
 * Performance: the divot code (8 divots × up to 7 creases, evaluated 5× per pixel) only exists in
 * a second shader variant (define FABRIC_DIVOTS) that useDivots switches on while a divot is
 * animating. Otherwise the shader is the cheap one: undulation with an analytic slope. (On
 * Windows, ANGLE tends to unroll loops and flatten branches, so "if inactive, skip" isn't enough.)
 *
 * Geometry needs object-space "up" = +Y, since dents and undulation act on upward-facing
 * surfaces. The shader works on object-space millimetres, so it never reads the UVs.
 */

/**
 * Tile sizes the bed geometry still divides its UVs by (sheet and pillows by WEAVE_MM, blanket by
 * PLUSH_MM). Nothing samples those UVs any more, since the weave and pile maps are gone, but the
 * geometry code imports these, so they stay.
 */
export const WEAVE_MM = 24
export const PLUSH_MM = 180

/**
 * How strong the top and side undulation is, relative to the old textured look. Halved: with a
 * flat colour it should read as a soft gradient across the bed, not as ripples.
 */
const UND_SOFT = 0.5

export type DivotConfig = {
  count: number
  radius: number // mm
  depth: number // mm
  crease: number // mm
  sinkIn: number // s
  hold: number // s
  relax: number // s
}

/** every material sharing a set of divot uniforms, so useDivots can switch their shader variant */
const materialsFor = new WeakMap<FabricUniforms, Material[]>()

export type FabricUniforms = {
  uDiv: { value: Vector4[] }
  uSeed: { value: number[] }
}

export function createFabricMaterial(opts: {
  key: string
  divot: DivotConfig
  color?: string
  undulation?: number // scale for the gentle top undulation (1 = the cover's)
  sides?: number // scale for the side undulation
  /** which fabric this is. All of them are a flat colour now; only the default colour differs */
  fabric?: 'cotton' | 'fleece' | 'plush'
  /**
   * Kept so callers compile unchanged, but unused: the room's Lambert shading (lib/stylize) has
   * no sheen, and the flat look doesn't want one.
   */
  sheenColor?: string
  /** share another fabric material's divots (two faces of one blanket dent together) */
  shareDivots?: FabricUniforms
}) {
  const D = opts.divot
  const und = (opts.undulation ?? 1) * UND_SOFT
  const sides = (opts.sides ?? 1) * UND_SOFT
  // a plain matte material: no map and no normalMap at all, so lib/stylize's Lambert twin gets
  // no texture or normal-map code, just the colour and the patch below
  const m = new MeshStandardMaterial({
    // plush defaults to a dusky blue, the rest to warm cream sheets and pillowcases
    color: opts.color ?? (opts.fabric === 'plush' ? '#5b7394' : '#fff0e3'),
    roughness: 1,
  })
  const uniforms: FabricUniforms = opts.shareDivots ?? {
    uDiv: { value: Array.from({ length: D.count }, () => new Vector4(0, 0, 0, 0)) },
    uSeed: { value: new Array(D.count).fill(0) as number[] },
  }
  const f = (n: number) => n.toFixed(3)
  const GLSL = `
uniform vec4 uDiv[${D.count}];
uniform float uSeed[${D.count}];
varying vec3 vFabPos;
varying vec3 vFabN;
varying vec3 vFabT1;
varying vec3 vFabT2;
float hsh(float x) { return fract(sin(x * 127.1) * 43758.5453); }
// gentle undulation along the normal (top and sides), and its exact slope in object space
float fabricUnd(vec3 p, vec3 n) {
  float top = smoothstep(0.3, 0.9, n.y);
  float side = 1.0 - top;
  return top * ${f(und)} * (3.2 * sin(p.x * 0.0041 + 1.7) * sin(p.z * 0.0053 + 0.4) + 1.6 * sin(p.x * 0.011 + p.z * 0.007))
       + side * ${f(sides)} * 1.2 * sin(p.x * 0.006 + p.y * 0.02) * sin(p.z * 0.006);
}
vec3 fabricUndGrad(vec3 p, vec3 n) {
  float top = smoothstep(0.3, 0.9, n.y) * ${f(und)};
  float side = (1.0 - smoothstep(0.3, 0.9, n.y)) * ${f(sides)} * 1.2;
  float c2 = 1.6 * cos(p.x * 0.011 + p.z * 0.007);
  float sa = sin(p.x * 0.0041 + 1.7), ca = cos(p.x * 0.0041 + 1.7);
  float sb = sin(p.z * 0.0053 + 0.4), cb = cos(p.z * 0.0053 + 0.4);
  float s3 = sin(p.x * 0.006 + p.y * 0.02), c3 = cos(p.x * 0.006 + p.y * 0.02);
  float s4 = sin(p.z * 0.006), c4 = cos(p.z * 0.006);
  return vec3(
    top * (3.2 * 0.0041 * ca * sb + 0.011 * c2) + side * 0.006 * c3 * s4,
    side * 0.02 * c3 * s4,
    top * (3.2 * 0.0053 * sa * cb + 0.007 * c2) + side * 0.006 * s3 * c4);
}
#ifdef FABRIC_DIVOTS
// every live divot: a dent and its radiating creases, along the normal
float fabricDiv(vec3 p, vec3 n) {
  float top = smoothstep(0.3, 0.9, n.y);
  float d = 0.0;
  for (int i = 0; i < ${D.count}; i++) {
    float a = uDiv[i].w;
    if (a <= 0.0) continue;
    float seed = uSeed[i];
    vec2 v = (p - uDiv[i].xyz).xz;
    float s = ${f(D.radius)} * mix(0.8, 1.2, hsh(seed * 3.1 + 0.3));
    float rot = hsh(seed * 5.7 + 0.9) * 6.2831;
    float stretch = mix(0.8, 1.25, hsh(seed * 9.3 + 1.7));
    vec2 e = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * v;
    e.x /= stretch;
    e.y *= stretch;
    float dent = -exp(-dot(e, e) / (s * s));
    float pr = length(v);
    float pa = atan(v.y, v.x);
    float crease = 0.0;
    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      float on = k < 2 ? 1.0 : step(hsh(seed * 13.0 + fk * 1.7), 0.7);
      float ang = hsh(seed * 17.0 + fk * 3.3) * 6.2831;
      float len = s * mix(0.9, 2.3, hsh(seed * 23.0 + fk * 5.1));
      float wid = mix(6.0, 13.0, hsh(seed * 29.0 + fk * 7.9));
      float amp = mix(0.35, 1.0, hsh(seed * 31.0 + fk * 2.3));
      float bend = mix(-0.6, 0.6, hsh(seed * 37.0 + fk * 4.7));
      float t = pr / len;
      float da = atan(sin(pa - ang - bend * t), cos(pa - ang - bend * t));
      float dist = abs(da) * pr;
      float along = smoothstep(0.12 * s, 0.4 * s, pr) * (1.0 - smoothstep(0.55, 1.0, t));
      crease += on * amp * exp(-(dist * dist) / (wid * wid)) * along;
    }
    d += a * top * (${f(D.depth)} * dent + ${f(D.crease)} * crease);
  }
  return d;
}
#endif
float fabricDisp(vec3 p, vec3 n) {
  float d = fabricUnd(p, n);
#ifdef FABRIC_DIVOTS
  d += fabricDiv(p, n);
#endif
  return d;
}`
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
float fabD = fabricDisp(position, objectNormal);
{
  vec3 t1 = normalize(abs(objectNormal.y) < 0.99 ? cross(objectNormal, vec3(0.0, 1.0, 0.0)) : cross(objectNormal, vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(objectNormal, t1);
  vFabPos = position;
  vFabN = objectNormal;
  vFabT1 = normalMatrix * t1;
  vFabT2 = normalMatrix * t2;
}`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * fabD;')
    // the normal is bent right after normal_fragment_maps: with no normal map that chunk does
    // nothing, but it is the point where the per-pixel normal is ready and lighting hasn't run
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 n0 = normalize(vFabN);
  vec3 t1 = normalize(abs(n0.y) < 0.99 ? cross(n0, vec3(0.0, 1.0, 0.0)) : cross(n0, vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n0, t1);
  vec3 gu = fabricUndGrad(vFabPos, n0);
  float g1 = dot(gu, t1);
  float g2 = dot(gu, t2);
#ifdef FABRIC_DIVOTS
  float e = 1.5;
  g1 += (fabricDiv(vFabPos + t1 * e, n0) - fabricDiv(vFabPos - t1 * e, n0)) / (2.0 * e);
  g2 += (fabricDiv(vFabPos + t2 * e, n0) - fabricDiv(vFabPos - t2 * e, n0)) / (2.0 * e);
#endif
  normal = normalize(normal - normalize(vFabT1) * g1 - normalize(vFabT2) * g2);
}`,
      )
  }
  m.customProgramCacheKey = () => `fabric-${opts.key}`
  materialsFor.set(uniforms, [...(materialsFor.get(uniforms) ?? []), m])
  return { material: m, uniforms }
}

/** Runs the divot timeline each frame. Returns `press(localPoint)` to start a new divot. */
export function useDivots(uniforms: FabricUniforms, D: DivotConfig) {
  const divots = useRef(Array.from({ length: D.count }, () => ({ t: -1e9 })))
  const next = useRef(0)
  const clock = useRef(0)
  const live = useRef(false)
  const { gl, scene, camera } = useThree()

  // switch every material on these uniforms to the divot shader variant (or back)
  const setVariant = (on: boolean) => {
    for (const orig of materialsFor.get(uniforms) ?? []) {
      // the original, and its Bruno-lit twin if the room converted it (lib/stylize)
      const twin = orig.userData.twin as Material | undefined
      for (const m of twin ? [orig, twin] : [orig]) {
        if (on) m.defines = { ...m.defines, FABRIC_DIVOTS: '' }
        else if (m.defines) delete m.defines.FABRIC_DIVOTS
        m.needsUpdate = true
      }
    }
  }
  // compile the divot variant in the background after load, so the first click doesn't hitch
  useEffect(() => {
    const id = setTimeout(() => {
      setVariant(true)
      gl.compileAsync(scene, camera).catch(() => {})
      setVariant(false)
    }, 2500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, uniforms])

  useFrame((_, dt) => {
    clock.current += dt
    const now = clock.current
    let any = false
    divots.current.forEach((dv, i) => {
      const age = now - dv.t
      let a = 0
      if (age >= 0 && age < D.relax) {
        any = true
        // sink in gently (ease-out, no overshoot), hold a beat, then fade out on a smooth curve
        const inT = Math.min(age / D.sinkIn, 1)
        const sink = 1 - Math.pow(1 - inT, 3)
        const f = Math.max(0, (age - D.hold) / (D.relax - D.hold))
        a = sink * (1 - f * f * (3 - 2 * f))
      }
      uniforms.uDiv.value[i].w = a
    })
    if (any !== live.current) {
      live.current = any
      setVariant(any)
    }
  })

  return useMemo(
    () => (local: Vector3) => {
      const i = next.current
      next.current = (i + 1) % D.count
      uniforms.uDiv.value[i].set(local.x, local.y, local.z, 0)
      uniforms.uSeed.value[i] = Math.random()
      divots.current[i].t = clock.current
    },
    [uniforms, D.count],
  )
}
