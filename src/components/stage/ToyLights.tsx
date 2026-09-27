/**
 * Toy lighting (Bruno Simon's objects, "My Room in 3D"): everything is matte (pair with <Stylize />,
 * which turns every material into a soft-wrapped Lambert), lit by one soft warm key light that
 * casts gentle shadows, and a pastel ambient: lavender from above, warm peach bounce from below.
 * No reflections anywhere. `extent` is the half-size of the area that must receive shadows (mm).
 */
export const TOY = {
  bg: '#241f3a',
  floor: '#3a3152',
  sky: '#c9c2f2',
  ground: '#f1d0b4',
  key: '#fff1e2',
}

export function ToyLights({ extent = 600, mapSize = 2048, normalBias }: { extent?: number; mapSize?: number; normalBias?: number }) {
  const k = extent / 600
  return (
    <>
      <color attach="background" args={[TOY.bg]} />
      <hemisphereLight args={[TOY.sky, TOY.ground, 1.3]} />
      <directionalLight
        castShadow
        position={[-700 * k, 1300 * k, 900 * k]}
        intensity={1.9}
        color={TOY.key}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-radius={6}
        shadow-bias={-0.0004}
        shadow-normalBias={normalBias ?? 2 * k}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={10}
        shadow-camera-far={4000 * k}
      />
    </>
  )
}
