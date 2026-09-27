import { useMemo } from 'react'
import { EffectComposer, Bloom, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { Effect, ToneMappingMode } from 'postprocessing'
import { Color, Uniform } from 'three'
import { Quality } from '../../lib/render/Quality'

/**
 * The room's finishing, in order:
 *
 *   contact    ambient occlusion tinted a deep plum: darkening where the bed meets the floor, the
 *              desk legs touch down, walls meet. It is what makes things sit instead of float
 *   bloom      only on real light sources: the bulbs, the lamp's inner glow, the window. They are
 *              pushed well above white and the threshold is high, so it is a soft halo, not a haze
 *   AgX        tone mapping: bright warm light rolls off gracefully instead of blowing out orange
 *   grade      a gentle split tone: shadows lean cool (lavender-blue), highlights lean warm
 *   vignette   pulls the eye inward
 */
const SPLIT = /* glsl */ `
uniform vec3 cool;
uniform vec3 warm;
uniform float amount;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float sh = 1.0 - smoothstep(0.0, 0.45, l);   // how much this pixel is shadow
  float hi = smoothstep(0.45, 1.0, l);         // how much it is highlight
  // multiply-tint, keeping luminance roughly where it was
  vec3 coolT = c * mix(vec3(1.0), cool, sh * amount);
  vec3 warmT = coolT * mix(vec3(1.0), warm, hi * amount);
  outputColor = vec4(warmT, inputColor.a);
}
`

class SplitToneEffect extends Effect {
  constructor({ cool = '#9aa6ff', warm = '#ffd2a6', amount = 0.35 } = {}) {
    // cool and warm are normalised so they tint without darkening
    const norm = (hex: string) => {
      const c = new Color(hex)
      const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
      return c.multiplyScalar(1 / l)
    }
    super('SplitToneEffect', SPLIT, {
      uniforms: new Map<string, Uniform>([
        ['cool', new Uniform(norm(cool))],
        ['warm', new Uniform(norm(warm))],
        ['amount', new Uniform(amount)],
      ]),
    })
  }
}

export function RoomEffects() {
  const split = useMemo(() => new SplitToneEffect(), [])
  return (
    <>
      <Quality />
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={260} distanceFalloff={1.2} intensity={3} quality="high" color="#2e1b45" />
        <Bloom luminanceThreshold={1.35} luminanceSmoothing={0.25} intensity={0.85} mipmapBlur levels={6} radius={0.7} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <primitive object={split} />
        <Vignette eskil={false} offset={0.28} darkness={0.42} />
        <SMAA />
      </EffectComposer>
    </>
  )
}
