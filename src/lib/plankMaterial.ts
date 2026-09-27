import { MeshStandardMaterial } from 'three'

/**
 * Laminate plank floor, procedural like the maple (no texture files), in the room's flat style:
 * the plank shapes stay, the wood grain goes.
 *   planks   rows `w` wide running along the board axis, ends staggered at random per row
 *   seams    thin dark joints (anti-aliased with fwidth), with a very soft bevel shade either
 *            side, like the rounded edge of a real board dipping into the joint
 *   tone     every plank a slightly different shade of the one colour (about 4 percent lighter
 *            or darker, no hue shift), so it reads as boards, not a sheet
 * No streaks, arcs or noise: inside a plank the colour is flat.
 *
 * Works in OBJECT space millimetres on a PlaneGeometry (XY): local Y runs along the planks.
 */
export function createPlankMaterial(color: string, plank: { w: number; len: number }) {
  const m = new MeshStandardMaterial({ color, roughness: 0.62 })
  m.customProgramCacheKey = () => `plank-${plank.w}-${plank.len}`
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPlankPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlankPos = position.xy;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vPlankPos;
float pkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float W = ${plank.w.toFixed(1)};
  float L = ${plank.len.toFixed(1)};
  float across = vPlankPos.x;
  float row = floor(across / W);
  float along = vPlankPos.y + pkHash(vec2(row, 7.0)) * L; // stagger the ends per row
  float seg = floor(along / L);
  vec2 id = vec2(row, seg);
  // distance to the nearest joint, in mm
  float ea = min(fract(across / W), 1.0 - fract(across / W)) * W;
  float el = min(fract(along / L), 1.0 - fract(along / L)) * L;
  float e = min(ea, el);
  float aa = fwidth(e);
  float joint = 1.0 - smoothstep(0.6, 0.6 + aa + 0.5, e);
  float bevel = 1.0 - smoothstep(1.0, 4.0 + aa, e);
  // per-plank tone: the same colour, a touch lighter or darker
  vec3 c = diffuseColor.rgb * mix(0.96, 1.04, pkHash(id));
  c *= 1.0 - 0.06 * bevel - 0.32 * joint;
  diffuseColor.rgb = c;
}`,
      )
  }
  return m
}
