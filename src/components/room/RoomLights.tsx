import { useMemo } from 'react'
import { Object3D } from 'three'
import { PAL } from '../../lib/palette'
import { ROOM } from './spec'

/**
 * Rina's room at blue hour (public/reference/room-desk-night.jpg): late evening, studying. The
 * sky outside has gone deep blue, and the lamp and the fairy lights carry the room, the way cozy
 * games and Bruno's "My Room in 3D" do it: a dim, soft room and a few real light sources.
 *
 *   shade    the hemisphere: the colour of the room where no light lands. A cool lavender-blue
 *            from above (the twilight), a warm peach bounce from below (the lamp-lit desk and
 *            floor). Dim, never black. The cool lives here, in the light, not in the objects
 *   window   blue hour through the glass: a soft, cool light through the blinds, faint stripes
 *            across the pillows and the floor. The north wall blocks it everywhere but the window
 *   lamp     the hero: a warm pool on the desk and the wall behind it (./Lamp)
 *   strings  warm glows along the tops of the walls, twinkling faintly (./StringLights)
 */
export const SHADE = { sky: '#8f94e3', ground: '#e8b89c', intensity: 0.85 }
export const TWILIGHT = { color: PAL.twilight, intensity: 1.05 * 3600 * 3600 } // inverse-square from beyond the glass

const W = ROOM.window
const XC = (W.x0 + W.x1) / 2
const Z0 = -ROOM.d / 2

export function RoomLights() {
  const target = useMemo(() => {
    const o = new Object3D()
    o.position.set(XC + 150, 150, Z0 + 1700)
    return o
  }, [])
  return (
    <>
      <hemisphereLight args={[SHADE.sky, SHADE.ground, SHADE.intensity]} />
      <primitive object={target} />
      <spotLight
        position={[XC, 2350, Z0 - 2600]}
        target={target}
        color={TWILIGHT.color}
        intensity={TWILIGHT.intensity}
        decay={2}
        distance={0}
        angle={0.52}
        penumbra={0.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-radius={2.5}
        shadow-bias={-0.0004}
        shadow-normalBias={2}
        shadow-camera-near={600}
        shadow-camera-far={9000}
      />
    </>
  )
}
