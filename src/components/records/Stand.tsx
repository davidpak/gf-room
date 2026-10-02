import { useMemo } from 'react'
import { RepeatWrapping } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { pineTexture } from './Crate'
import { CRATE, STAND } from './rack'

/**
 * The record stand: a two-tier pine table, the Victrola on top at the left, the crate beside it, the Dig box; the
 * back stock on the shelf below. Our own design, sized round what it holds: [EW] the player 322 × 312; [CRATE] the
 * crate 358 wide outside. mm; its frame: its middle, its feet at y 0, its front toward +z.
 */
const S = STAND

/** the table: top, shelf, legs, aprons (one material: pine; to be wrapped in <Static>) */
export function Stand() {
  const m = useMemo(() => {
    const t = pineTexture()
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(2.5, 1)
    return bruno({ map: t, shade: CRATE.colors.pineShade })
  }, [])
  const g = useMemo(() => {
    const legH = S.h - S.top
    return {
      top: new RoundedBoxGeometry(S.w, S.top, S.d, 2, 6),
      shelf: new RoundedBoxGeometry(S.w - 2 * S.leg.inset, S.shelf.t, S.d - 2 * S.shelf.inset, 2, 4),
      leg: new RoundedBoxGeometry(S.leg.s, legH, S.leg.s, 2, 6),
      apronX: new RoundedBoxGeometry(S.w - 2 * S.leg.inset - 2 * S.leg.s, S.apron.h, S.apron.t, 1, 3),
      apronZ: new RoundedBoxGeometry(S.apron.t, S.apron.h, S.d - 2 * S.leg.inset - 2 * S.leg.s, 1, 3),
      legH,
    }
  }, [])
  const lx = S.w / 2 - S.leg.inset - S.leg.s / 2
  const lz = S.d / 2 - S.leg.inset - S.leg.s / 2
  const apronY = S.h - S.top - S.apron.h / 2
  return (
    <group>
      <mesh geometry={g.top} material={m} position={[0, S.h - S.top / 2, 0]} castShadow receiveShadow />
      <mesh geometry={g.shelf} material={m} position={[0, S.shelf.y + S.shelf.t / 2, 0]} castShadow receiveShadow />
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} geometry={g.leg} material={m} position={[sx * lx, g.legH / 2, sz * lz]} castShadow receiveShadow />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`x${s}`} geometry={g.apronX} material={m} position={[0, apronY, s * (lz + S.leg.s / 2 - S.apron.t / 2)]} castShadow />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`z${s}`} geometry={g.apronZ} material={m} position={[s * (lx + S.leg.s / 2 - S.apron.t / 2), apronY, 0]} castShadow />
      ))}
    </group>
  )
}
