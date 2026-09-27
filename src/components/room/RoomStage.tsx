import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { CanvasTexture, MeshStandardMaterial, PCFShadowMap, SRGBColorSpace, Vector3 } from 'three'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useDeskMotor } from '../../lib/motor'
import { World } from '../../lib/physics/World'
import { RoomEffects } from './RoomEffects'
import { RoomLights } from './RoomLights'
import { Lamp } from './Lamp'
import { StringLights } from './StringLights'
import { Stylize } from '../../lib/stylize'
import { CheckSheet } from '../check/CheckSheet'
import { Bed } from '../bed/Bed'
import { BED } from '../bed/spec'
import { Desk } from '../desk/Desk'
import { DESK } from '../desk/spec'
import { Closet } from '../closet/Closet'
import { CLOSET } from '../closet/spec'
import { FreeCamera, VIEW } from './FreeCamera'
import { DustMotes } from './DustMotes'
import { Ambience } from './Ambience'
import { exportBake } from './bake/exportBake'
import { Baked } from './bake/Baked'
import { SeatedDoll, SEATED } from '../doll/SeatedDoll'
import { cutaway, useCutaway } from './cutaway'
import { SKY } from '../../lib/palette'
import { Shell } from './Shell'
import { ROOM } from './spec'

/**
 * Rina's room at true size (./spec.ts for the layout and every dimension):
 *   desk    north-west corner, against the north wall, you sit facing north
 *   bed     head against the north wall under the window, long side on the east wall,
 *           drawers facing west into the room
 *   closet  south-east, mirrored bypass doors facing the bed
 *   door    south wall near the west corner
 *
 *   doll    David, crocheted, sitting on the desk against the lamp
 *   camera  free, like Blender's viewport (./FreeCamera); outside the room, the near walls and the
 *           ceiling cut away and the room floats like a diorama (./Shell, ./cutaway)
 *   click   the lamp, the string lights, the blinds (tilt), the door (swing), the drawers, the
 *           closet mirrors, the keypad, the pillows...
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

const LAMP_AT: [number, number, number] = [DESK.top.w / 2 - 125, 0, -DESK.top.d / 2 + 125]
const LAMP_YAW = -0.6 // turned to face into the desk
const DOLL_YAW = -1.3 // on the desk side of the lamp, facing the room
const DOLL_R = 110 - SEATED.backZ - 4 // his back against the rim of the lamp's base

function DeskWithMotor() {
  const motor = useDeskMotor(false) // arrows/number keys drive the doll here; the keypad still works
  return (
    <Desk motor={motor}>
      {/* the lamp on the back-right corner of the desk, reaching out over it */}
      {/* live-lit (not baked): the lamp and the doll */}
      <group position={LAMP_AT} rotation={[0, LAMP_YAW, 0]} userData={{ bakeLive: true }}>
        <Lamp />
      </group>
      {/* David, crocheted, sitting against the lamp's base, turned a little toward the room */}
      <group
        position={[LAMP_AT[0] + Math.sin(DOLL_YAW) * DOLL_R, 0, LAMP_AT[2] + Math.cos(DOLL_YAW) * DOLL_R]}
        rotation={[0, DOLL_YAW, 0]}
        userData={{ bakeLive: true }}
      >
        <SeatedDoll />
      </group>
    </Desk>
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
      <group position={[deskX, 0, deskZ]}>
        <Suspense fallback={null}>
          <DeskWithMotor />
        </Suspense>
      </group>
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

const DUST: [number, number, number] = [-700, 1100, -1350]

/** Dev only: window.__bakeExport() writes the room out for the Blender lighting bake (./bake). */
function BakeExportHook() {
  const scene = useThree((st) => st.scene)
  const advance = useThree((st) => st.advance)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __bakeExport: () => Promise<unknown> }).__bakeExport = async () => {
      cutaway.showAll = true // every wall and the ceiling in place
      advance(performance.now())
      await new Promise((r) => setTimeout(r, 100)) // let React drop the closet's own back
      advance(performance.now())
      try {
        return await exportBake(scene)
      } finally {
        cutaway.showAll = false
      }
    }
  }, [scene, advance])
  return null
}

/** Blue hour around the diorama: a soft vertical gradient behind everything. */
function Backdrop() {
  const scene = useThree((st) => st.scene)
  useLayoutEffect(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, SKY.bgTop)
    grad.addColorStop(1, SKY.bgLow)
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 256)
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    const prev = scene.background
    scene.background = tex
    return () => {
      scene.background = prev
      tex.dispose()
    }
  }, [scene])
  return null
}

/** `play`: the main view, with the free camera. */
function Scene({ play = false, onReady }: { play?: boolean; onReady?: () => void }) {
  return (
    <>
      <Stylize />
      {/* everything, lights included, arrives together once the physics engine has loaded */}
      <World>
        <RoomLights />
        <StringLights />
        <Shell />
        <RoomCloset />
        <RoomColliders />
        <Furniture />
        {/* dust drifting in the lamp light, over the desk */}
        <DustMotes center={DUST} radius={800} />
        <Ready onReady={onReady} />
      </World>
      {play && <FreeCamera />}
      {play && <Backdrop />}
      <BakeExportHook />
    </>
  )
}

// a view from up in the south-west corner, under the ceiling, looking at the window wall
const HERO: [number, number, number] = [-1350, 2200, 1650]
const TARGET: [number, number, number] = [300, 500, -900]

/**
 * The room as a little diorama with a free camera (./FreeCamera). It fades up from a dusky plum
 * once everything has loaded, like the lights coming on.
 */
export function RoomStage() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas flat shadows={{ type: PCFShadowMap }} dpr={1.5} camera={{ position: [...VIEW.position], fov: VIEW.fov, near: 10, far: 60000 }} gl={{ antialias: false }}>
        <Scene play onReady={onReady} />
        <RoomEffects />
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
