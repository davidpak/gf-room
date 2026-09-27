import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, HueSaturation, N8AO, SMAA, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Quality } from '../../lib/render/Quality'

/**
 * Shared lighting rig. World units are MILLIMETRES; `extent` is the half-size of the
 * area that must receive shadows (180 for the keypad, ~900 for the whole desk).
 *
 * One real key light casts the shadows (standard PCF shadow map + blur radius;
 * drei SoftShadows is broken since three r182). Colour rule from Bruno's world:
 * warm key, cool fill, pink rim, purple bounce. The Environment is built from
 * Lightformers so satin/metal parts have something soft to reflect. No HDR file.
 */
export const DUSK = {
  bg: '#1a1530',
  floor: '#3b2f57',
  key: '#ffe8d2',
  fill: '#8f86ff',
  rim: '#ff7aa8',
  sky: '#b9b0ff',
  ground: '#2a1a3f',
}

export function StageLights({ extent = 180, mapSize = 2048 }: { extent?: number; mapSize?: number }) {
  const k = extent / 180
  return (
    <>
      <color attach="background" args={[DUSK.bg]} />
      <hemisphereLight args={[DUSK.sky, DUSK.ground, 0.55]} />

      <directionalLight
        castShadow
        position={[-160 * k, 220 * k, 320 * k]}
        intensity={2.4}
        color={DUSK.key}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-radius={5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.8 * k}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={1}
        shadow-camera-far={1200 * k}
      />
      <directionalLight position={[260 * k, 40 * k, 160 * k]} intensity={0.55} color={DUSK.fill} />
      <directionalLight position={[180 * k, 120 * k, -320 * k]} intensity={0.55} color={DUSK.rim} />

      <Environment resolution={256} frames={1} near={1} far={3000 * k}>
        <Lightformer form="rect" intensity={2.2} color={DUSK.key} position={[-400 * k, 400 * k, 500 * k]} scale={[600 * k, 300 * k, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.0} color={DUSK.fill} position={[600 * k, 100 * k, 200 * k]} scale={[500 * k, 500 * k, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.8} color={DUSK.rim} position={[200 * k, 200 * k, -600 * k]} scale={[600 * k, 300 * k, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.35} color={DUSK.ground} position={[0, -600 * k, 0]} scale={[1200 * k, 1200 * k, 1]} target={[0, 0, 0]} />
      </Environment>
    </>
  )
}

/**
 * Post effects + the performance helpers (lib/render/Quality: adaptive resolution, shadows on
 * demand, ?perf overlay). AO radius is in world mm: ~8 for keypad-scale creases, ~40 for furniture.
 * Cheap on purpose: AO at half resolution (depth-aware upsampling keeps edges clean) and SMAA
 * instead of multisampling.
 */
export function Effects({
  aoRadius = 8,
  grade = false,
  ao = true,
  aoColor,
  tone = false,
}: {
  aoRadius?: number
  grade?: boolean
  ao?: boolean
  /** tint the ambient occlusion (a deep plum reads as soft shade, not grey dirt) */
  aoColor?: string
  /** neutral tone mapping: colours stay true, bright light pools roll off softly instead of clipping */
  tone?: boolean
}) {
  return (
    <>
      <Quality />
      <EffectComposer multisampling={0}>
        {ao && <N8AO aoRadius={aoRadius} distanceFalloff={2} intensity={2.4} quality="low" halfRes color={aoColor} />}
        {/* only things pushed above white (bulbs) glow */}
        <Bloom luminanceThreshold={tone ? 1.1 : 1} luminanceSmoothing={0.3} intensity={tone ? 0.7 : 0.9} mipmapBlur levels={6} />
        {tone && <ToneMapping mode={ToneMappingMode.NEUTRAL} />}
        {/* grade: a touch more colour and contrast, and a tilt-shift blur top and bottom (miniature) */}
        {grade && <HueSaturation saturation={0.06} />}
        {grade && <TiltShift2 blur={0.05} taper={0.75} start={[0, 0.5]} end={[1, 0.5]} samples={8} />}
        <Vignette eskil={false} offset={0.3} darkness={grade ? 0.35 : 0.5} />
        <SMAA />
      </EffectComposer>
    </>
  )
}
