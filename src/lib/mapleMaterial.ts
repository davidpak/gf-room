import { MeshStandardMaterial } from 'three'

/**
 * Stylized maple: flat base colour + procedural grain, no texture files.
 *
 * Keeps the Bruno look by staying graphic rather than photographic:
 *   - thin, crisp grain lines (anti-aliased with fwidth) that bow like flat-sawn
 *     "cathedral" grain, driven by low-frequency noise
 *   - very faint long streaks along the board
 *   - soft tonal patches so the top doesn't read as one flat slab
 * Everything is multiplied into the base colour, so the palette colour still rules.
 *
 * Works in OBJECT space millimetres. `plane` picks which two axes the board lies in
 * (first = along the grain): 'xz' for a tabletop, 'xy' for a front-facing panel.
 * Pass `strength` 0..1 to dial the whole effect.
 */
export function createMapleMaterial(color = '#dcc09a', strength = 1, plane: 'xz' | 'xy' | 'zy' = 'xz') {
  const m = new MeshStandardMaterial({ color, roughness: 0.68 })
  m.customProgramCacheKey = () => `maple-${strength}-${plane}`
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGrain = { value: strength }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMaplePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMaplePos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vMaplePos;
uniform float uGrain;
float mapleHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mapleNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mapleHash(i), mapleHash(i + vec2(1.0, 0.0)), f.x),
             mix(mapleHash(i + vec2(0.0, 1.0)), mapleHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 p = vMaplePos.${plane};                             // mm: x along, y across the board
  // cathedral arcs: bands across the board, bowed by slow noise + a gentle wave
  float warp = mapleNoise(p * vec2(0.0022, 0.010)) * 70.0
             + sin(p.x * 0.0032 + mapleNoise(p * 0.0012) * 6.0) * 28.0;
  float g = (p.y + warp) * 0.042;
  float d = abs(fract(g) - 0.5);                           // 0 at band centre
  float aa = fwidth(g) * 1.2;
  float line = 1.0 - smoothstep(0.035, 0.035 + aa + 0.03, 0.5 - d); // thin line at band edges
  // fine long streaks along the board
  float streak = mapleNoise(p * vec2(0.006, 0.22));
  // soft tonal patches
  float patchy = mapleNoise(p * 0.0025);
  vec3 c = diffuseColor.rgb;
  c *= 1.0 - uGrain * (0.11 * line + 0.035 * streak);
  c = mix(c, c * vec3(1.05, 1.02, 0.96), uGrain * patchy * 0.6);
  diffuseColor.rgb = c;
}`,
      )
  }
  return m
}
