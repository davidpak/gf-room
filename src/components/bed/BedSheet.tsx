import { useMemo, useRef } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, Vector3, type Mesh } from 'three'
import { createFabricMaterial, useDivots, WEAVE_MM, type DivotConfig } from '../../lib/fabric'
import { fastHits } from '../../lib/render/fastHits'
import { BED } from './spec'

/**
 * The sheet-covered mattress: one smooth fabric surface over the top, all four sides and
 * wrapping under at the bottom. No hem, no lip. The look and the click divots come from the
 * shared fabric material (src/lib/fabric.ts).
 *
 *   click  leaves a little divot with a few radiating creases, like where someone just sat
 *
 * Bed-local frame (X along the bed), millimetres.
 */
const M = BED.mattress
const PUFF = 5 // the cover sits just proud of the mattress
const HALF = new Vector3(M.len / 2 + PUFF, M.h / 2 + PUFF, M.w / 2 + PUFF)
const RADIUS = M.radius + PUFF
const DIVOT: DivotConfig = { count: 8, radius: 72, depth: 14, crease: 4.5, sinkIn: 0.55, hold: 1.4, relax: 7 }

/**
 * A finely subdivided box pushed out into a rounded box, with world-scale UVs (so the weave
 * is the same size everywhere) and exact normals.
 */
function makeCoverGeometry() {
  const g = new BoxGeometry(HALF.x * 2, HALF.y * 2, HALF.z * 2, 190, 28, 137)
  const pos = g.getAttribute('position')
  const nrm = g.getAttribute('normal')
  const uv = g.getAttribute('uv')
  const inner = HALF.clone().subScalar(RADIUS)
  const p = new Vector3()
  const c = new Vector3()
  const d = new Vector3()
  const n = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    c.set(Math.max(-inner.x, Math.min(inner.x, p.x)), Math.max(-inner.y, Math.min(inner.y, p.y)), Math.max(-inner.z, Math.min(inner.z, p.z)))
    d.subVectors(p, c)
    if (d.lengthSq() > 1e-9) {
      d.normalize()
      p.copy(c).addScaledVector(d, RADIUS)
      nrm.setXYZ(i, d.x, d.y, d.z)
    }
    pos.setXYZ(i, p.x, p.y, p.z)
    n.fromBufferAttribute(nrm, i)
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)
    if (ay >= ax && ay >= az) uv.setXY(i, p.x / WEAVE_MM, p.z / WEAVE_MM)
    else if (ax >= az) uv.setXY(i, p.z / WEAVE_MM, p.y / WEAVE_MM)
    else uv.setXY(i, p.x / WEAVE_MM, p.y / WEAVE_MM)
  }
  g.translate(0, BED.deck + M.h / 2, 0)
  return g
}

export function BedSheet() {
  const geo = useMemo(() => fastHits(makeCoverGeometry()), []) // 76k triangles: hit-test through a bounds tree
  const { material, uniforms } = useMemo(() => createFabricMaterial({ key: 'cover', divot: DIVOT }), [])
  const press = useDivots(uniforms, DIVOT)
  const mesh = useRef<Mesh>(null)

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (mesh.current) press(mesh.current.worldToLocal(e.point.clone()))
  }

  return (
    <mesh
      ref={mesh}
      geometry={geo}
      material={material}
      castShadow
      receiveShadow
      onPointerDown={onDown}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    />
  )
}
