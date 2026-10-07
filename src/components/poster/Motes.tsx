import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, ShaderMaterial } from 'three'
import { POSTER } from './spec'

/**
 * Dust in the air in front of the poster (./spec motes): a few specks drifting slowly, each wandering its own way,
 * rising and sinking a little, now and then turning so it catches the light and shows, then fading. Faint and slow
 * on purpose: the room alive the way the Quad's petals make it, not an effect over it.
 *
 * In the poster's frame (mm, its middle, its face toward +z): the air from its face out to `deep`, a little wider
 * and taller than it. All the motion's in the vertex shader (no per-frame work but the clock).
 */
const P = POSTER
const M = P.motes

/** a soft speck: bright in the middle, fading out */
function speckTexture() {
  const S = 32
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, S, S)
  return new CanvasTexture(c)
}

export function Motes() {
  const { geo, mat } = useMemo(() => {
    // where each starts (its home it wanders round), its own pace and phase, its size
    let seed = 7
    const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909)) >>> 0) / 4294967296
    const n = M.count
    const pos = new Float32Array(n * 3)
    const seedA = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      pos.set([(rand() - 0.5) * (P.w + 160), (rand() - 0.5) * (P.h + 120), 25 + rand() * (M.deep - 25)], i * 3)
      seedA.set([rand() * 100, 0.6 + rand() * 0.8, M.size[0] + rand() * (M.size[1] - M.size[0]), rand()], i * 4)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new BufferAttribute(seedA, 4))
    g.computeBoundingSphere()
    const m = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 500 }, uMap: { value: speckTexture() }, uColor: { value: new Color(M.color) } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; // phase, pace, size (mm), which way it drifts
        uniform float uTime;
        uniform float uScale;
        varying float vA;
        void main() {
          float t = uTime * aSeed.y + aSeed.x;
          vec3 p = position;
          // wandering round its home (slow, a few cm), and a slow rise or sink through the air, round again
          p.x += sin(t * 0.13) * 40.0 + sin(t * 0.31 + 1.7) * 14.0;
          p.z += sin(t * 0.17 + 0.6) * 30.0;
          float h = ${(P.h + 120).toFixed(1)};
          p.y = mod(p.y + h / 2.0 + (aSeed.w - 0.45) * uTime * ${M.drift.toFixed(2)} + sin(t * 0.21) * 20.0, h) - h / 2.0;
          // catching the light as it turns: mostly dim, now and then bright
          float turn = 0.5 + 0.5 * sin(t * 0.9 + aSeed.w * 6.28);
          vA = 0.3 + 0.7 * pow(turn, 4.0);
          // (and faded at the air's top and bottom, so it never pops in or out)
          vA *= smoothstep(0.0, 60.0, h / 2.0 - abs(p.y));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSeed.z * uScale / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vA * ${M.opacity.toFixed(3)};
          gl_FragColor = vec4(uColor, a); // (additive: its colour times its alpha, added)
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    return { geo: g, mat: m }
  }, [])
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat])
  useFrame(({ clock, camera, size, gl }) => {
    mat.uniforms.uTime.value = clock.elapsedTime
    // (a speck \`size\` mm across, at its distance, in pixels)
    mat.uniforms.uScale.value = (camera.projectionMatrix.elements[5] * size.height * gl.getPixelRatio()) / 2
  })
  return <points geometry={geo} material={mat} renderOrder={5} />
}
