import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BoxGeometry, Color, Float32BufferAttribute, InstancedBufferAttribute, Matrix4, type InstancedMesh, type WebGLProgramParametersWithUniforms } from 'three'
import { bruno } from '../quad/bruno'
import { sheet, sheetVersion, squareOf, useSheetRenderer, want } from './covers'
import { LP, type Pressing } from './vinyl'

/**
 * Jackets drawn from the cover sheet (./covers): any number of them one draw, one texture. Each is an instance of the
 * one box (a 12" jacket: 314.3 square, 4.5 thick, its bottom middle at its origin, the cover toward +z), told
 * which square of the sheet is its cover (`aTile`) and its spine's colour (`aSpine`); its back the cover again,
 * turned round and in shadow, its edges the spine's colour. A cover not come yet: the sheet's blank card.
 */
const BOX = (() => {
  const g = new BoxGeometry(LP.sleeve, LP.sleeve, LP.sleeveT).translate(0, LP.sleeve / 2, 0)
  // (each corner told which face it's on: +x, -x, +y, -y the edges (2), +z the cover (0), -z the back (1))
  const face = new Float32Array(g.attributes.position.count)
  g.groups.forEach((gr, k) => {
    for (let j = gr.start; j < gr.start + gr.count; j++) face[g.index!.getX(j)] = k === 4 ? 0 : k === 5 ? 1 : 2
  })
  g.setAttribute('aFace', new Float32BufferAttribute(face, 1))
  g.clearGroups()
  return g
})()

/** the jackets' material (one, shared): bruno's light, the cover from its square of the sheet */
export const SLEEVE = (() => {
  const m = bruno({ map: sheet, shade: '#9a7f9a' })
  const base = m.onBeforeCompile
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms, r) => {
    base.call(m, s, r)
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aTile;
attribute vec3 aSpine;
attribute float aFace;
varying vec3 vSpine;
varying float vFace;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
{
  // (the back: the cover turned round; a little in from the square's edge, clear of the next one's)
  vec2 f = aFace > 0.5 && aFace < 1.5 ? vec2(1.0 - uv.x, uv.y) : uv;
  f = 0.008 + f * 0.984;
  vMapUv = vec2(aTile.x + f.x * aTile.z, aTile.y + (1.0 - f.y) * aTile.z);
  vSpine = aSpine;
  vFace = aFace;
}`,
      )
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSpine;
varying float vFace;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
if (vFace > 1.5) diffuseColor.rgb = vSpine;
else if (vFace > 0.5) diffuseColor.rgb *= 0.6;`,
      )
  }
  m.customProgramCacheKey = () => 'sleeves'
  return m
})()

/** a fresh box for an instanced mesh of `n` (the instance attributes are the mesh's own) */
export function sleeveGeometry(n: number) {
  const g = BOX.clone()
  g.setAttribute('aTile', new InstancedBufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('aSpine', new InstancedBufferAttribute(new Float32Array(n * 3).fill(0.8), 3))
  return g
}

const _sq = { x: 0, y: 0, s: 0, spine: new Color() }
/** each instance's square and spine set from its record (again whenever the sheet's had a cover come) */
export function useSleeveCovers(mesh: { current: InstancedMesh | null }, records: Pressing[], who: string) {
  const gl = useThree((s) => s.gl)
  useSheetRenderer(gl)
  useEffect(() => want(who, records), [who, records])
  useEffect(() => () => want(who, []), [who])
  const seen = useRef(-1)
  useEffect(() => void (seen.current = -1), [records])
  useFrame(() => {
    const m = mesh.current
    if (!m || seen.current === sheetVersion()) return
    seen.current = sheetVersion()
    const tile = m.geometry.attributes.aTile as InstancedBufferAttribute
    const spine = m.geometry.attributes.aSpine as InstancedBufferAttribute
    records.forEach((p, i) => {
      if (i >= tile.count) return
      squareOf(p, _sq)
      tile.setXYZ(i, _sq.x, _sq.y, _sq.s)
      spine.setXYZ(i, _sq.spine.r, _sq.spine.g, _sq.spine.b)
    })
    tile.needsUpdate = spine.needsUpdate = true
  })
}

/** jackets standing still, each where `place` puts it (a matrix in the parent's frame): the picks rack's */
export function StillSleeves({ records, place, who }: { records: Pressing[]; place: (i: number, m: Matrix4) => void; who: string }) {
  const mesh = useRef<InstancedMesh>(null)
  const n = records.length
  const geo = useMemo(() => sleeveGeometry(Math.max(1, n)), [n])
  useEffect(() => () => geo.dispose(), [geo])
  useSleeveCovers(mesh, records, who)
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const at = new Matrix4()
    for (let i = 0; i < n; i++) {
      place(i, at)
      m.setMatrixAt(i, at)
    }
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [n, place, geo])
  if (!n) return null
  return <instancedMesh ref={mesh} args={[geo, SLEEVE, n]} castShadow receiveShadow />
}
