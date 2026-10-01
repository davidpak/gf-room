import { CapsuleCollider, CuboidCollider } from '@react-three/rapier'
import { Baguette, BAGUETTE, BAGUETTE_R } from './Baguette'
import { Grapes, grapesBox } from './Grapes'
import { Sub, SUB_BOX } from './Sub'
import { Jam, JAM_BOX } from './Jam'
import { Strawberries, PUNNET_BOX } from './Strawberries'

/**
 * What's packed in the basket, and how each thing is drawn and held wherever it is (in the basket, lifted
 * out, lying on the blanket as a toy): the wrapped sub halves, a bunch of green grapes and one of red, the
 * baguette, a punnet of strawberries, a jar of jam. `state` is what's happened to it since: the grapes and
 * strawberries eaten, what's left of the baguette.
 */
export type FoodKind = 'sub' | 'grapes' | 'baguette' | 'strawberries' | 'jam'
export type Food = { key: string; kind: FoodKind; v: 0 | 1 | 2 }
export type FoodState = { eaten?: Set<number>; lo?: number; hi?: number }

export function FoodModel({ f, state }: { f: Food; state?: FoodState }) {
  if (f.kind === 'sub') return <Sub v={f.v} />
  if (f.kind === 'grapes') return <Grapes k={f.v as 0 | 1} eaten={state?.eaten} />
  if (f.kind === 'strawberries') return <Strawberries eaten={state?.eaten} />
  if (f.kind === 'jam') return <Jam />
  return <Baguette lo={state?.lo} hi={state?.hi} />
}

/** its collider, as a toy on the blanket (`k` the scale it's drawn at) */
export function FoodCollider({ f, state, k }: { f: Food; state?: FoodState; k: number }) {
  if (f.kind === 'baguette') {
    const lo = state?.lo ?? -BAGUETTE.l / 2
    const hi = state?.hi ?? BAGUETTE.l / 2
    const half = Math.max(1, (hi - lo) / 2 - BAGUETTE_R)
    return <CapsuleCollider args={[half * k, BAGUETTE_R * k]} position={[((lo + hi) / 2) * k, BAGUETTE_R * k, 0]} rotation={[0, 0, Math.PI / 2]} mass={0.04} friction={0.9} />
  }
  const box = f.kind === 'sub' ? SUB_BOX : f.kind === 'jam' ? JAM_BOX : f.kind === 'strawberries' ? PUNNET_BOX : grapesBox(f.v as 0 | 1)
  return <CuboidCollider args={[box.half[0] * k, box.half[1] * k, box.half[2] * k]} position={[box.at[0] * k, box.at[1] * k, box.at[2] * k]} mass={f.kind === 'jam' ? 0.12 : f.kind === 'sub' ? 0.05 : 0.03} friction={0.9} />
}
