import { Color, MeshLambertMaterial, Vector3, type MeshLambertMaterialParameters, type WebGLProgramParametersWithUniforms } from 'three'

/**
 * The Quad's shading: Bruno Simon's folio-2025 formula (sources/Game/Materials/MeshDefaultMaterial.js),
 * tuned warm for a spring evening under the cherries:
 *
 *   lit     albedo × the light's colour
 *   shadow  albedo × a deep coloured shadow (never grey): lit and shadow are MIXED, not added, by how
 *           much the surface is turned from the sun and whether something shades it (its cast shadow)
 *   bounce  a violet glow up from the ground on faces turned down, low down
 *   lamps   warm pools round the lamp posts, on whatever's near them
 *
 *   see-through  (materials with SEE_THROUGH: the trees) whatever is between the camera and the car
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
  lamp: new Color('#ffb46b'),
  sky: ['#34357a', '#9a6fb3', '#f2a0ae', '#ffcfa3'], // top to horizon
  fog: new Color('#e8a7b8'),
}

/** shared by every material: the lamps' positions (world, mm), the time (s) */
export const shared = {
  lamps: { value: [new Vector3(1e9, 0, 0), new Vector3(1e9, 0, 0), new Vector3(1e9, 0, 0), new Vector3(1e9, 0, 0)] },
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
}

export function bruno(o: Opts = {}) {
  const { shade, lit = 1, sway = 0, swayFrom = 0, warm = 1, ...params } = o
  const m = new MeshLambertMaterial(params)
  const u = {
    uLight: { value: LOOK.light.clone().multiplyScalar(LOOK.intensity * lit) },
    uSun: { value: LOOK.light.clone().multiplyScalar(LOOK.intensity) }, // (the sun as it really shines: to read the Lambert pass back)
    uShadow: { value: new Color(shade ?? LOOK.shadow) },
    uBounce: { value: LOOK.bounce },
    uLamp: { value: LOOK.lamp },
    uWarm: { value: warm },
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
uniform vec3 uLight;
uniform vec3 uSun;
uniform vec3 uShadow;
uniform vec3 uBounce;
uniform vec3 uLamp;
uniform float uWarm;
uniform vec3 uLamps[4];
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
  vec3 col = mix(albedo * uShadow, albedo * uLight, litK);
  // the bounce: faces turned down, near the ground
  float down = clamp(-vWNormal.y * 0.5 + 0.35, 0.0, 1.0) * (1.0 - smoothstep(0.0, 1400.0, vWPos.y));
  col = mix(col, albedo * uBounce * 1.4, down * 0.35 * (1.0 - litK * 0.6));
  // the lamps' warm pools
  float glow = 0.0;
  for (int i = 0; i < 4; i++) {
    vec3 d = uLamps[i] - vWPos;
    float r = length(d);
    float f = 1.0 - smoothstep(0.0, uLampRange, r);
    glow += f * f * (0.55 + 0.45 * max(0.0, dot(vWNormal, d / max(r, 1.0))));
  }
  col += albedo * uLamp * glow * 1.3 * uWarm;
  outgoingLight = col + totalEmissiveRadiance;
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
