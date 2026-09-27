import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferGeometry, Color, Vector3, MeshBasicMaterial, SRGBColorSpace, TextureLoader, type Material, type Mesh, type Object3D, type Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { cozy } from '../cozy'

/**
 * Shows the room with its light baked in Blender (blender/bake_room.py), like Bruno's "My Room in 3D".
 *
 * For every baked mesh it swaps in the geometry from public/bake/room.glb (same shape, plus
 * lightmap UVs) and a flat material: the surface's own colour (and its maple grain or plank
 * pattern) times the baked light. Three baked maps are mixed live:
 *
 *   base    blue hour: the sky through the window, bounced around the room
 *   lamp    the desk lamp, faded in and out with its switch
 *   fairy   the string lights, faded with theirs
 *
 * Baked surfaces ignore the live lights (their light is already in the maps). Things that move
 * (the doll, pillows, bedding, blinds) keep live lighting. No bake on disk, or ?live in the URL:
 * nothing changes and the room stays live-lit.
 */
type Manifest = { size: number; scales: Record<'base' | 'lamp' | 'fairy', number>; paths: Record<string, string> }

/** How strongly each baked map shows (the art-direction knobs). */
export const BAKE_MIX = { base: 1.0, lamp: 1.0, fairy: 1.0, exposure: 1.0 }

const uniforms = {
  lmBase: { value: null as Texture | null },
  lmLamp: { value: null as Texture | null },
  lmFairy: { value: null as Texture | null },
  kBase: { value: 1 },
  kLamp: { value: 1 },
  kFairy: { value: 1 },
}

type Patch = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void

function bakedMaterial(src: Material): MeshBasicMaterial {
  const s = src as Material & { color?: Color; map?: Texture | null; onBeforeCompile: Patch; customProgramCacheKey: () => string }
  const m = new MeshBasicMaterial({ color: s.color?.clone() ?? new Color(1, 1, 1), map: s.map ?? null, side: s.side })
  const patch = s.onBeforeCompile
  const key = s.customProgramCacheKey?.() ?? ''
  m.onBeforeCompile = (shader, renderer) => {
    patch?.call(s, shader, renderer) // maple grain, plank pattern...
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 uvBake;\nvarying vec2 vUvBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUvBake = uvBake;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vUvBake;
uniform sampler2D lmBase;
uniform sampler2D lmLamp;
uniform sampler2D lmFairy;
uniform float kBase;
uniform float kLamp;
uniform float kFairy;`,
      )
      .replace(
        '#include <aomap_fragment>',
        `reflectedLight.indirectDiffuse = texture2D(lmBase, vUvBake).rgb * kBase
      + texture2D(lmLamp, vUvBake).rgb * kLamp
      + texture2D(lmFairy, vUvBake).rgb * kFairy;
    // faces the bake's light never reaches (the cut wall tops, the outsides) get a soft dusk floor, not black
    reflectedLight.indirectDiffuse = max(reflectedLight.indirectDiffuse, vec3(0.16, 0.15, 0.22));
#include <aomap_fragment>`,
      )
  }
  m.customProgramCacheKey = () => 'baked|' + key
  return m
}

/** A geometry's local bounding box, rounded to 0.5 mm: the same before and after Blender. */
function boxKey(g: BufferGeometry) {
  g.computeBoundingBox()
  const b = g.boundingBox!
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => Math.round(v * 2)).join(',')
}

/** One geometry from a glTF node (a mesh, or a group of per-material meshes), lightmap UV as uvBake. */
function geometryOf(node: Object3D): BufferGeometry | null {
  const parts: BufferGeometry[] = []
  if ((node as Mesh).isMesh) parts.push((node as Mesh).geometry)
  else for (const c of node.children) if ((c as Mesh).isMesh) parts.push((c as Mesh).geometry)
  if (!parts.length) return null
  const clean = parts.map((g) => {
    const out = new BufferGeometry()
    out.setAttribute('position', g.getAttribute('position'))
    if (g.getAttribute('normal')) out.setAttribute('normal', g.getAttribute('normal'))
    out.setAttribute('uvBake', g.getAttribute('uv'))
    if (g.index) out.setIndex(g.index)
    return out
  })
  return clean.length === 1 ? clean[0] : mergeGeometries(clean, true)
}

export function Baked() {
  const scene = useThree((s) => s.scene)
  const ready = useRef(false)
  const glow = useRef({ lamp: 1, strings: 1 })

  useEffect(() => {
    if (new URLSearchParams(location.search).has('live')) return
    let cancelled = false
    ;(async () => {
      const res = await fetch('/bake/room.json')
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return
      const man = (await res.json()) as Manifest
      const tl = new TextureLoader()
      const tex = async (n: string) => {
        const t = await tl.loadAsync(`/bake/${n}.png`)
        t.colorSpace = SRGBColorSpace // light / scale, stored sRGB: decoded to linear for free
        t.flipY = false
        return t
      }
      const [gltf, base, lamp, fairy] = await Promise.all([new GLTFLoader().loadAsync('/bake/room.glb'), tex('base'), tex('lamp'), tex('fairy')])
      if (cancelled) return
      uniforms.lmBase.value = base
      uniforms.lmLamp.value = lamp
      uniforms.lmFairy.value = fairy
      scales.current = man.scales
      const cache = new Map<Material, MeshBasicMaterial>()
      const swap = (m: Material) => {
        if (!cache.has(m)) cache.set(m, bakedMaterial(m))
        return cache.get(m)!
      }
      // Each baked mesh is matched to the live one by shape and place (its local bounding box and
      // where it sits in the room), not by scene-graph order, which shifts when e.g. the closet grows
      // its own back. Some furniture loads a little later (Suspense): keep trying until all are found.
      gltf.scene.updateMatrixWorld(true)
      const todo = new Map<string, Object3D>()
      gltf.scene.traverse((node) => {
        if (man.paths[node.name] !== undefined) todo.set(node.name, node)
      })
      const total = todo.size
      const used = new Set<Mesh>()
      for (let tries = 0; tries < 40 && todo.size && !cancelled; tries++) {
        const live: { mesh: Mesh; box: string; pos: Vector3 }[] = []
        scene.updateMatrixWorld(true)
        scene.traverse((o) => {
          const m = o as Mesh
          if (!m.isMesh || used.has(m) || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh || !m.geometry) return
          live.push({ mesh: m, box: boxKey(m.geometry), pos: m.getWorldPosition(new Vector3()) })
        })
        for (const [name, node] of todo) {
          const geo = geometryOf(node)
          if (!geo) continue
          const key = boxKey(geo)
          const where = node.getWorldPosition(new Vector3()).multiplyScalar(1000) // metres -> mm
          let target: Mesh | undefined
          let best = 8 // mm
          for (const c of live) {
            if (c.box !== key || used.has(c.mesh)) continue
            const dd = c.pos.distanceTo(where)
            if (dd < best) {
              best = dd
              target = c.mesh
            }
          }
          if (!target) continue
          used.add(target)
          // Blender hands back one piece: a multi-material mesh (the desk top + its edge band) draws as its first material
          if (Array.isArray(target.material) && !geo.groups.length) geo.addGroup(0, Infinity, 0)
          target.geometry = geo
          target.material = Array.isArray(target.material) ? target.material.map(swap) : swap(target.material)
          target.receiveShadow = false
          todo.delete(name)
        }
        ready.current = true
        if (todo.size) await new Promise((r) => setTimeout(r, 250))
      }
      console.info(`[bake] ${total - todo.size} of ${total} meshes lit by the bake`)
    })().catch((e) => console.warn('[bake] not loaded', e))
    return () => {
      cancelled = true
    }
  }, [scene])

  const scales = useRef<Manifest['scales']>({ base: 1, lamp: 1, fairy: 1 })
  useFrame((_, dt) => {
    if (!ready.current) return
    const c = cozy.get()
    const g = glow.current
    const k = 1 - Math.exp(-dt * 12)
    g.lamp += ((c.lamp ? 1 : 0) - g.lamp) * k
    g.strings += ((c.strings ? 1 : 0) - g.strings) * k
    const s = scales.current
    const e = BAKE_MIX.exposure
    uniforms.kBase.value = s.base * BAKE_MIX.base * e
    uniforms.kLamp.value = s.lamp * BAKE_MIX.lamp * g.lamp * e
    uniforms.kFairy.value = s.fairy * BAKE_MIX.fairy * g.strings * e
  })
  return null
}
