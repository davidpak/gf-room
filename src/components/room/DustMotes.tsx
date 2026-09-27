import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3 } from 'three'

/**
 * Dust motes drifting in the lamp's light: a few hundred soft specks floating slowly in a volume
 * around the desk, brightest near the bulb and fading to nothing away from it, so they only show
 * where the light catches them. Stillness reads as a render; this reads as air.
 *
 * Safe for the eye: every mote is at least ~2.5 px across with a soft round falloff, and faint
 * (they never cross the bloom threshold), so nothing sparkles or flickers.
 * Room frame, millimetres. `center` is the lamp's bulb in room coordinates (roughly).
 */
const COUNT = 260
const VERT = /* glsl */ `
uniform float uTime;
uniform float uPx;       // pixels per world unit at distance 1 (viewport height / (2 tan(fov/2)))
uniform vec3 uCenter;
uniform float uRadius;
attribute vec3 seed;     // random 0..1 per mote
varying float vGlow;
void main() {
  vec3 p = position;
  float t = uTime * 0.08;
  // slow wandering drift, each mote on its own path, and a very slow fall that loops
  p += vec3(sin(t * 3.1 + seed.x * 40.0), 0.0, cos(t * 2.7 + seed.y * 40.0)) * 60.0;
  p.y += sin(t * 1.9 + seed.z * 40.0) * 40.0 - mod(uTime * 6.0 + seed.z * 600.0, 600.0) + 300.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = distance(p, uCenter) / uRadius;
  vGlow = (1.0 - smoothstep(0.15, 1.0, d)) * (0.55 + 0.45 * sin(uTime * 0.7 + seed.x * 20.0));
  float size = (2.2 + seed.y * 1.8) * uPx / -mv.z;   // 2-4 mm motes
  gl_PointSize = max(size, 2.5);
  vGlow *= clamp(size / 2.5, 0.25, 1.0);                  // tiny ones fade instead of shimmering
}
`
const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vGlow;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float a = (1.0 - r) * (1.0 - r) * vGlow;
  gl_FragColor = vec4(uColor * a, a);
}
`

export function DustMotes({ center, radius = 900 }: { center: [number, number, number]; radius?: number }) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT * 3)
    let h = 1
    const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < COUNT; i++) {
      // scattered in a soft ball around the light, flattened a little
      const u = rnd() * Math.PI * 2
      const v = Math.acos(2 * rnd() - 1)
      const r = radius * Math.cbrt(rnd())
      pos[i * 3] = center[0] + r * Math.sin(v) * Math.cos(u)
      pos[i * 3 + 1] = center[1] + r * Math.cos(v) * 0.7
      pos[i * 3 + 2] = center[2] + r * Math.sin(v) * Math.sin(u)
      seed[i * 3] = rnd()
      seed[i * 3 + 1] = rnd()
      seed[i * 3 + 2] = rnd()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('seed', new BufferAttribute(seed, 3))
    const m = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPx: { value: 1 },
        uCenter: { value: new Vector3(...center) },
        uRadius: { value: radius },
        uColor: { value: new Color('#ffd9a8').multiplyScalar(0.9) },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    return { geo: g, mat: m }
  }, [center, radius])

  useFrame(({ camera, clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime
    const fov = 'fov' in camera ? (camera as { fov: number }).fov : 40
    mat.uniforms.uPx.value = (size.height * dpr) / (2 * Math.tan((fov * Math.PI) / 360))
  })

  return <points geometry={geo} material={mat} frustumCulled={false} />
}
