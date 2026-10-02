import { useCallback, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshLambertMaterial, ShaderChunk, type Material, type Mesh, type MeshStandardMaterial, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three'

/**
 * The room's shading: soft and toy-like, no physically based shine.
 *
 *   soft light     Lambert with a wide wrap: dot(n, l) smoothstepped from -0.35 to 1, so light
 *                  rolls softly around forms instead of cutting off at a hard terminator
 *   no specular    every Standard / Physical / Phong material becomes a Lambert one, keeping its
 *                  colour, maps (texture, normal, emissive, alpha) and any shader patch it had
 *                  (maple grain, planks, fabric divots...). Mirrors are left alone. No sparkles,
 *                  no white squares, and everything reacts to light the same way
 *
 * Lights add up like real light; the Effects' tone mapping rolls bright pools off softly
 * instead of clipping them. The ambient (hemisphere) is the colour of the room in shade.
 *
 * <Stylize /> converts whatever is in the scene (and whatever loads later). It also leaves the conversion on the
 * scene (scene.userData.prepare), so the loading screen's shader warm-up (../lib/render/Canvas) converts first and
 * compiles the Lambert versions: otherwise every shader is compiled twice, the second time in the first frames.
 */
ShaderChunk.lights_lambert_pars_fragment = ShaderChunk.lights_lambert_pars_fragment.replace(
  'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
  'float dotNL = smoothstep( -0.35, 1.0, dot( geometryNormal, directLight.direction ) );',
)

const converted = new WeakMap<Material, Material>()

type Patchable = Material & {
  onBeforeCompile: (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void
  customProgramCacheKey: () => string
}

/** The Lambert (Bruno-lit) version of a material. Cached, so shared materials stay shared. */
export function stylizeMaterial(m: Material): Material {
  if (converted.has(m)) return converted.get(m)!
  const src = m as MeshStandardMaterial & Patchable & { isMeshReflectorMaterial?: boolean; mirror?: number }
  const convertible =
    (src.type === 'MeshStandardMaterial' || src.type === 'MeshPhysicalMaterial' || src.type === 'MeshPhongMaterial') && src.mirror === undefined
  if (!convertible) {
    converted.set(m, m)
    return m
  }
  const out = new MeshLambertMaterial({
    name: src.name,
    color: src.color,
    map: src.map,
    normalMap: src.normalMap,
    normalScale: src.normalScale,
    emissive: src.emissive,
    emissiveMap: src.emissiveMap,
    emissiveIntensity: src.emissiveIntensity,
    alphaMap: src.alphaMap,
    alphaTest: src.alphaTest,
    transparent: src.transparent,
    opacity: src.opacity,
    side: src.side,
    vertexColors: src.vertexColors,
    polygonOffset: src.polygonOffset,
    polygonOffsetFactor: src.polygonOffsetFactor,
    polygonOffsetUnits: src.polygonOffsetUnits,
    depthWrite: src.depthWrite,
    flatShading: src.flatShading,
  }) as MeshLambertMaterial & Patchable
  // carry over shader patches (they hook chunks Lambert shares: common, begin_vertex,
  // beginnormal_vertex, color_fragment, normal_fragment_maps)
  const patch = src.onBeforeCompile
  const key = src.customProgramCacheKey()
  out.onBeforeCompile = (shader, renderer) => patch.call(src, shader, renderer)
  out.customProgramCacheKey = () => 'bruno|' + key
  if (src.defines?.FABRIC_DIVOTS !== undefined) out.defines = { FABRIC_DIVOTS: '' }
  src.userData.twin = out // so code driving the original (fabric divots) can drive this one too
  converted.set(m, out)
  return out
}

/** Converts every mesh in the scene to the Bruno look; rescans now and then for new meshes. */
export function Stylize() {
  const scene = useThree((s) => s.scene)
  const frame = useRef(0)
  const convert = useCallback(
    () =>
      scene.traverse((o) => {
        const mesh = o as Mesh
        if (!mesh.isMesh || !mesh.material) return
        if (Array.isArray(mesh.material)) {
          const next = mesh.material.map(stylizeMaterial)
          if (next.some((x, i) => x !== (mesh.material as Material[])[i])) mesh.material = next
        } else {
          const next = stylizeMaterial(mesh.material)
          if (next !== mesh.material) mesh.material = next
        }
    }),
    [scene],
  )
  useLayoutEffect(() => {
    scene.userData.prepare = convert
    return () => void delete scene.userData.prepare
  }, [scene, convert])
  useFrame(() => {
    if (frame.current++ % 20 === 0) convert()
  })
  return null
}
