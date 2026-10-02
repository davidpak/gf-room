import { Vector3, type Matrix4 } from 'three'
import { CuboidCollider } from '@react-three/rapier'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { Prompts } from '../prompt/Prompts'
import { SeatedDoll } from './SeatedDoll'

/**
 * David, crocheted, sitting on the desk as a real thing: pick him up and carry him (left-drag), turn him
 * (right-drag), set him down anywhere; "Return David" sits him back in his spot.
 *
 * His shape for the physics, in SeatedDoll's frame (his bottom on y 0, facing +z), mm, from ./spec: his body
 * and head above the hips (339 standing, less the 137 legs; the beanie 92 across, the arms out to ~60 a side),
 * his legs straight out in front (137 and the shoes, ~40 thick). A plush: about 150 g.
 */
const BODY = { half: [52, 112, 42] as const, at: [0, 112, -10] as const }
const LEGS = { half: [40, 20, 82] as const, at: [0, 20, 80] as const }
const MASS = 0.15
const ITEM = groups(GROUP.item, 0xffff)

export function LiveDoll({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
  const perch = usePerch({
    key: 'doll',
    label: 'Return David',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0, // (he stays where he's put)
    away: 150,
    lift: 60,
  })
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.8} angularDamping={1.5} hold={perch.hold}>
        <group {...perch.hover.bind}>
          <SeatedDoll />
        </group>
        <CuboidCollider args={[...BODY.half]} position={[...BODY.at]} mass={MASS * 0.75} friction={1} collisionGroups={ITEM} />
        <CuboidCollider args={[...LEGS.half]} position={[...LEGS.at]} mass={MASS * 0.25} friction={1} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}
