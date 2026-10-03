import { Waiting } from '../../lib/ready'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '../../lib/render/Canvas'
import { MeshStandardMaterial, PCFShadowMap, Vector3 } from 'three'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { World } from '../../lib/physics/World'
import { Stylize } from '../../lib/stylize'
import { CheckSheet } from '../check/CheckSheet'
import { Effects } from '../stage/StageLights'
import { ToyLights } from '../stage/ToyLights'
import { Bed } from '../bed/Bed'
import { BED } from '../bed/spec'
import { DeskSetup } from '../desk/DeskSetup'
import { DESK } from '../desk/spec'
import { Closet } from '../closet/Closet'
import { CLOSET } from '../closet/spec'
import { FirstPerson, START } from './FirstPerson'
import { Ambience } from './Ambience'
import { useCutaway } from './cutaway'
import { Shell } from './Shell'
import { ROOM } from './spec'
import { Poster, PosterCard } from '../poster/Poster'
import { useNotes } from '../poster/messages'
import { POSTER_AT } from '../poster/spec'

/**
 * Rina's room at true size (./spec.ts for the layout and every dimension):
 *   desk    north-west corner, against the north wall, you sit facing north
 *   bed     head against the north wall under the window, long side on the east wall,
 *           drawers facing west into the room
 *   closet  south-east, mirrored bypass doors facing the bed
 *   door    south wall near the west corner
 *
 *   on it   everything from the desk's page, live (../desk/DeskSetup): the lamp, David crocheted (to carry about),
 *           her laptop and charger, the mints, the tissues, the cords to the outlet on the wall behind
 *   camera  first person (./FirstPerson): standing at eye height, walking about inside the walls (the
 *           cutaway in ./Shell still works for the check sheet's views from outside)
 *   click   the lamp, the blinds (tilt), the door (swing), the drawers, the closet mirrors, the keypad,
 *           the pillows, everything on the desk...
 *   light   for now the gallery's plain toy light (../stage/ToyLights) and finishing (Effects): the room's
 *           own lighting is to be done again from scratch
 */
const { w, d, h, wall } = ROOM

/**
 * Closet in the SE corner, doors facing north toward the bed. The room's walls are its left side
 * (east) and its back (south); when the south wall is cut away it grows its own back, so from
 * outside you never look into it from behind.
 */
function RoomCloset() {
  const cut = useCutaway()
  const lid = useMemo(() => new MeshStandardMaterial({ color: ROOM.paint, roughness: 0.9 }), [])
  return (
    <group position={[w / 2 - CLOSET.opening.w / 2, 0, d / 2 - CLOSET.depth]} rotation={[0, Math.PI, 0]}>
      <Closet sides={{ left: false, right: true }} back={cut.south} />
      {/* its top, flush with the ceiling line: from above (ceiling cut away) you never look down into it */}
      <mesh position={[0, h - 15, -CLOSET.depth / 2 - 25]} material={lid}>
        <boxGeometry args={[CLOSET.opening.w + 2 * CLOSET.wall, 30, CLOSET.depth + 50]} />
      </mesh>
    </group>
  )
}

/** Solid walls, so nothing can be thrown out of the room. */
function RoomColliders() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[w / 2 + wall, h / 2, wall / 2]} position={[0, h / 2, -d / 2 - wall / 2]} />
      <CuboidCollider args={[w / 2 + wall, h / 2, wall / 2]} position={[0, h / 2, d / 2 + wall / 2]} />
      <CuboidCollider args={[wall / 2, h / 2, d / 2]} position={[w / 2 + wall / 2, h / 2, 0]} />
      <CuboidCollider args={[wall / 2, h / 2, d / 2]} position={[-w / 2 - wall / 2, h / 2, 0]} />
    </RigidBody>
  )
}

/** the "Rina" poster over the desk, her friends' notes round her name (../poster) */
function RoomPoster() {
  const notes = useNotes()
  return (
    <group position={[POSTER_AT.x, POSTER_AT.y, POSTER_AT.z]}>
      <Poster notes={notes} />
    </group>
  )
}

function Furniture() {
  const { bedToWall, deskToWall } = ROOM.gap
  // bed: model's long axis is X with the head at +X, drawers at +Z.
  // Rotate +90° about Y so the head points north; `mirrored` moves the drawers to face west.
  const bedX = w / 2 - BED.frame.w / 2 - bedToWall
  const bedZ = -d / 2 + BED.frame.len / 2 + bedToWall
  // desk: no rotation, its front (+Z) faces south into the room
  const deskX = -w / 2 + DESK.top.w / 2 + deskToWall
  const deskZ = -d / 2 + DESK.top.d / 2 + deskToWall
  return (
    <>
      <group position={[bedX, 0, bedZ]} rotation={[0, Math.PI / 2, 0]}>
        <Bed mirrored />
      </group>
      <Suspense fallback={<Waiting />}>
        {/* (the keys stay the camera's) */}
        <DeskSetup at={[deskX, deskZ]} wall={deskToWall} keys={false} />
      </Suspense>
    </>
  )
}

/** Tells the page the room has arrived (the physics engine and every model loaded). */
function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    // two frames later: the first frames compile every shader, which is the hitch the fade hides
    let a = 0
    let b = 0
    a = requestAnimationFrame(() => (b = requestAnimationFrame(() => onReady?.())))
    return () => {
      cancelAnimationFrame(a)
      cancelAnimationFrame(b)
    }
  }, [onReady])
  return null
}

/** `play`: the main view, with the free camera. */
function Scene({ play = false, onReady }: { play?: boolean; onReady?: () => void }) {
  return (
    <>
      {/* thin cables (4 mm) on the desk keep their shadows: a big map, small biases (as the desk's page) */}
      <ToyLights extent={2100} mapSize={4096} normalBias={0.5} bias={-0.00008} />
      <Stylize />
      {/* everything arrives together once the physics engine has loaded; 120 Hz, as the desk's page (the cables) */}
      <World timeStep={1 / 120}>
        <Shell />
        <RoomCloset />
        <RoomColliders />
        <Furniture />
        <RoomPoster />
        <Ready onReady={onReady} />
      </World>
      {play && <FirstPerson />}
    </>
  )
}

// a view from up in the south-west corner, under the ceiling, looking at the window wall
const HERO: [number, number, number] = [-1350, 2200, 1650]
const TARGET: [number, number, number] = [300, 500, -900]

/** Standing in the room, first person (./FirstPerson). It fades up once everything has loaded. */
export function RoomStage() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.25]} camera={{ position: [...START.position], fov: START.fov, near: 10, far: 15000 }} gl={{ antialias: false }}>
        <Scene play onReady={onReady} />
        <Effects aoRadius={40} />
      </Canvas>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 40% 35%, #4a3350 0%, #2a1f38 55%, #1c1629 100%)',
          opacity: ready ? 0 : 1,
          transition: 'opacity 1.2s ease 0.1s',
        }}
      />
      <Ambience />
      <PosterCard />
    </div>
  )
}

export function RoomCheck() {
  const c = new Vector3(0, h / 2, 0)
  return (
    <CheckSheet
      scene={() => <Scene />}
      views={[
        { kind: 'image', label: 'reference: desk, window (north)', src: '/reference/room-desk-wide.png' },
        { kind: 'image', label: 'reference: closet, door (south)', src: '/reference/room-closet-door.jpg' },
        { kind: 'hero', label: 'hero (drag)', position: HERO, target: TARGET, fov: 54 },
        // the room is closed now (walls, ceiling): elevations are taken from just inside the opposite wall
        { kind: 'ortho', label: 'north wall, from inside', from: new Vector3(0, h / 2, d / 2 - 60), at: c, zoom: 0.14 },
        { kind: 'ortho', label: 'south wall, from inside', from: new Vector3(0, h / 2, -d / 2 + 60), at: c, zoom: 0.14 },
        { kind: 'ortho', label: 'east wall, from inside', from: new Vector3(-w / 2 + 60, h / 2, 0), at: c, zoom: 0.14 },
      ]}
    />
  )
}
