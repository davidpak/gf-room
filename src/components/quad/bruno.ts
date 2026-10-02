import { Color, MeshLambertMaterial, Vector3, Vector4, type MeshLambertMaterialParameters, type WebGLProgramParametersWithUniforms } from 'three'

/**
 * The Quad's shading: Bruno Simon's folio-2025 formula (sources/Game/Materials/MeshDefaultMaterial.js),
 * tuned warm for a spring evening under the cherries:
 *
 *   lit     albedo × the light's colour
 *   shadow  albedo × a deep coloured shadow (never grey): lit and shadow are MIXED, not added, by how
 *           much the surface is turned from the sun and whether something shades it (its cast shadow)
 *   bounce  a violet glow up from the ground on faces turned down, low down
 *   lamps   warm pools round the lamp posts, on whatever's near them
 *   sheen   (glossy paint only: the car) the sky caught along its edges and on its tops
 *
 *   see-through  (materials with SEE_THROUGH: the blossom only; trunks stay solid) whatever is between the camera and the car
 *           dissolves in a soft round hole, dithered, so the car is never lost behind a tree (Bruno's)
 *
 * No tone mapping (the Canvas is `flat`); the fog mixes in last. Every material on the page comes from
 * `bruno()` so it all sits in the one light. Foliage can have its own shadow colour (a rosier one:
 * light through petals), and a sway (wind in the vertices).
 */
export const LOOK = {
  sun: new Vector3(-0.55, 0.72, 0.42).normalize(), // (where the light comes from: low, warm, from the west)
  light: new Color('#ffd7bd'),
  intensity: 1.18,
  shadow: new Color('#9a82cf'), // (a soft lavender: things in shade stay readable)
  bounce: new Color('#9a4f8c'),
  lamp: new Color('#ff9c48'),
  sky: ['#34357a', '#9a6fb3', '#f2a0ae', '#ffcfa3'], // top to horizon
  fog: new Color('#e8a7b8'),
  sheen: new Color('#c9b3e3'), // (what glossy paint reflects: the lilac evening sky)
}

/** how many warm pools of light there can be (the lamp posts' four, then the night's: the trees' fairy lights, the
 *  canopies' string lights) */
export const LAMPS = 12
/**
 * shared by every material: the lamps (world mm; w how bright: the posts 1, the night's lights as dark as it is), the
 * time (s); and the time of day (./daylight sets them, or they stay the day as it's always been): the sun's light
 * (colour × intensity), a tint on every shadow colour, how strong the lamps' pools and the glowing things are
 */
export const shared = {
  lamps: { value: Array.from({ length: LAMPS }, () => new Vector4(1e9, 0, 0, 0)) },
  light: { value: LOOK.light.clone().multiplyScalar(LOOK.intensity) },
  shadowTint: { value: new Color(1, 1, 1) },
  lampK: { value: 1 },
  glowK: { value: 1 },
  lampRange: { value: 900 },
  time: { value: 0 },
  car: { value: new Vector3(1e9, 0, 0) }, // (the car and the camera, world: for the see-through)
  cam: { value: new Vector3(0, 0, 0) },
  seeR: { value: 420 },
}

type Opts = MeshLambertMaterialParameters & {
  /** the shadow colour for this one (foliage: rosier) */
  shade?: Color | string
  /** how much the lit side keeps of the light: 1 is full */
  lit?: number
  /** wind: how far the vertices sway (mm), scaled by how high they are over `swayFrom` */
  sway?: number
  swayFrom?: number
  /** how much the lamps warm it (0: none, emissive things) */
  warm?: number
  /** a glossy paint's sheen: the sky caught along its edges and on its top faces (0: matte) */
  sheen?: number
}

export function bruno(o: Opts = {}) {
  const { shade, lit = 1, sway = 0, swayFrom = 0, warm = 1, sheen = 0, ...params } = o
  const m = new MeshLambertMaterial(params)
  const u = {
    uLightBase: shared.light, // (the sun as it really shines: to read the Lambert pass back; uLight is it × uLit)
    uLit: { value: lit },
    uShadowTint: shared.shadowTint,
    uLampK: shared.lampK,
    uGlowK: shared.glowK,
    uShadow: { value: new Color(shade ?? LOOK.shadow) },
    uBounce: { value: LOOK.bounce },
    uLamp: { value: LOOK.lamp },
    uWarm: { value: warm },
    uSheen: { value: sheen },
    uSheenCol: { value: LOOK.sheen },
    uSway: { value: sway },
    uSwayFrom: { value: swayFrom },
    uLamps: shared.lamps,
    uLampRange: shared.lampRange,
    uTime: shared.time,
    uCar: shared.car,
    uCam: shared.cam,
    uSeeR: shared.seeR,
  }
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSway;
uniform float uSwayFrom;
uniform float uTime;
varying vec3 vWPos;
varying vec3 vWNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
if (uSway > 0.0) {
  // wind, in mm (after the instance's own size): a slow push and a quicker flutter, more the higher up
  vec3 wp0 = (modelMatrix * mvPosition).xyz;
  float h = max(0.0, wp0.y - uSwayFrom);
  float k = uSway * clamp(h / 600.0, 0.0, 1.0);
  vec2 w = vec2(sin(uTime * 0.9 + wp0.x * 0.002 + wp0.z * 0.001), cos(uTime * 1.1 + wp0.z * 0.002)) * 0.6
         + vec2(sin(uTime * 3.1 + wp0.x * 0.03), cos(uTime * 2.7 + wp0.z * 0.03)) * 0.25;
  mvPosition.xz += w * k;
}
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
{
  vec4 wp = vec4(transformed, 1.0);
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  wn = mat3(instanceMatrix) * wn;
  #endif
  vWPos = (modelMatrix * wp).xyz;
  vWNormal = normalize(mat3(modelMatrix) * wn);
}`,
      )
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uLightBase;
uniform float uLit;
#define uSun uLightBase
#define uLight (uLightBase * uLit)
uniform vec3 uShadow;
uniform vec3 uShadowTint;
uniform float uLampK;
uniform float uGlowK;
uniform vec3 uBounce;
uniform vec3 uLamp;
uniform float uWarm;
uniform float uSheen;
uniform vec3 uSheenCol;
uniform vec4 uLamps[${LAMPS}];
uniform float uLampRange;
uniform vec3 uCar;
uniform vec3 uCam;
uniform float uSeeR;
varying vec3 vWPos;
varying vec3 vWNormal;
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x) + int(q.y) * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
#ifdef SEE_THROUGH
{
  // between the camera and the car: a soft round hole (dithered: no sorting, still solid elsewhere)
  vec3 dir = uCar - uCam;
  float tc = length(dir);
  dir /= max(tc, 1.0);
  vec3 rel = vWPos - uCam;
  float t = dot(rel, dir);
  if (t < tc - 150.0) {
    float d = length(rel - dir * t);
    float keep = smoothstep(uSeeR * 0.55, uSeeR, d);
    if (keep < bayer4(gl_FragCoord.xy)) discard;
  }
}
#endif`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
#ifdef NO_FLIP
  normal = normalize(vNormal); // (a card seen from behind shades as its cluster does, not inside out)
#endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  // how lit it is by the sun, cast shadows and all (the Lambert pass worked it out: undo its albedo and light)
  vec3 albedo = diffuseColor.rgb;
  float full = dot(albedo * uSun * RECIPROCAL_PI, vec3(0.3333)) + 1e-5;
  float L = dot(reflectedLight.directDiffuse, vec3(0.3333)) / full;
  float litK = smoothstep(0.12, 0.5, L);
  vec3 col = mix(albedo * uShadow * uShadowTint, albedo * uLight, litK);
  // the bounce: faces turned down, near the ground
  float down = clamp(-vWNormal.y * 0.5 + 0.35, 0.0, 1.0) * (1.0 - smoothstep(0.0, 1400.0, vWPos.y));
  col = mix(col, albedo * uBounce * 1.4, down * 0.35 * (1.0 - litK * 0.6));
  // the lamps' warm pools
  float glow = 0.0;
  for (int i = 0; i < ${LAMPS}; i++) {
    vec3 d = uLamps[i].xyz - vWPos;
    float r = length(d);
    float f = 1.0 - smoothstep(0.0, uLampRange, r);
    glow += uLamps[i].w * f * f * (0.55 + 0.45 * max(0.0, dot(vWNormal, d / max(r, 1.0))));
  }
  col += albedo * uLamp * glow * 1.3 * uWarm * uLampK;
  // gloss: the evening sky caught along the edges as they turn away, softly on the faces turned up
  if (uSheen > 0.0) {
    vec3 V = normalize(cameraPosition - vWPos);
    float edge = pow(1.0 - clamp(abs(dot(vWNormal, V)), 0.0, 1.0), 2.5);
    col += uSheenCol * uSheen * (edge * 0.9 + clamp(vWNormal.y, 0.0, 1.0) * 0.3);
  }
  outgoingLight = col + totalEmissiveRadiance * uGlowK;
}
#include <opaque_fragment>`,
      )
  }
  m.customProgramCacheKey = () => `bruno-quad|${sway > 0 ? 'sway' : ''}`
  return m
}

/** everything under `root` in the Quad's light: its standard materials swapped for bruno ones (the
 *  same colour and glow), once each */
const swapped = new WeakMap<object, MeshLambertMaterial>()
export function brunoify(root: { traverse: (f: (o: unknown) => void) => void }) {
  root.traverse((o) => {
    const m = o as { isMesh?: boolean; material?: { type?: string; color?: Color; emissive?: Color; emissiveIntensity?: number } }
    if (!m.isMesh || !m.material || m.material.type !== 'MeshStandardMaterial') return
    const src = m.material
    if (!swapped.has(src)) swapped.set(src, bruno({ color: src.color, emissive: src.emissive, emissiveIntensity: src.emissiveIntensity }))
    ;(m as { material: unknown }).material = swapped.get(src)
  })
}
