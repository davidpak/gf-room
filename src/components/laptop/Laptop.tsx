import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider, useBeforePhysicsStep, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { CircleGeometry, CylinderGeometry, ExtrudeGeometry, MeshBasicMaterial, MeshStandardMaterial, Quaternion, ShapeGeometry, Vector3, type BufferGeometry, type Group, type Matrix4, type PerspectiveCamera } from 'three'
import { worldInput } from '../../lib/inputLock'
import { osMode, useOsMode } from '../rinaos/mode'
import { OS_H, OS_W, RinaOS } from '../rinaos/RinaOS'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedRect } from '../../lib/shapes'
import { Prompts } from '../prompt/Prompts'
import { LAPTOP, keyLayout, touchBar } from './spec'
import { CHARGER } from '../charger/spec'
import { KEY_AREA, deckTextures, faceTextures, heartsTexture, keysTexture } from './print'

/**
 * Rina's MacBook Pro in its heart case (./spec).
 *
 *   the laptop   an object like any other: carried, turned, put down anywhere (the shared hand); to the
 *                physics a slab and a lid, the lid's box following it as it opens. "Return laptop"
 *                once it's well away from its spot or knocked over
 *   the lid      click it to shut it or open it again; it swings on its hinge. Open, the screen's on
 *                (her notes, like the photos) and so is the Touch Bar; shut, they go dark
 *   the screen   click it (open) to use the laptop: the camera comes round in front of it and RinaOS
 *                (../rinaos) is on it for real, a web page laid exactly over the display; Esc, "Back
 *                to the room" or a click off the screen, and the camera goes back where it was
 */
const L = LAPTOP
const C = L.color
const B = L.base
const T = L.base.t
const ITEM = groups(GROUP.item, 0xffff)
const LID_T = L.lid.t + L.case.t // the lid in its shell
const SHELL_W = B.w + 2 * L.case.t
const SHELL_D = B.d + 2 * L.case.t
/** the hinge's axis in the laptop's frame; the lid's own frame sits on it (shut: its back edge at
 *  z = BACK, its underside GAP over the axis, on the base's top) */
const HINGE = new Vector3(0, T / 2 + L.hinge.y, -B.d / 2 + L.hinge.z)
const BACK = B.d - L.lid.len - L.hinge.z
const GAP = -L.hinge.y + 0.1
const BOTTOM = -T / 2 - L.case.t - L.case.feet // the lowest point (the case's feet)

/** a rounded slab: `w` × `d` in plan (corners `corner`), `h` tall from y = 0, its edges eased by
 *  `bevel`; `forward`: the outline's y runs to +z (for pictures laid on its caps). Its groups: the
 *  caps (0), the sides (1) */
function slab(w: number, d: number, h: number, corner: number, bevel: number, forward = false, y0 = -d / 2) {
  const s = roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(0.5, corner - bevel))
  const g = new ExtrudeGeometry(s, { depth: h - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 })
  g.translate(0, y0 + d / 2, bevel) // (the outline from y0: it's drawn round its middle)
  if (forward) {
    g.rotateX(Math.PI / 2) // outline y -> +z, the extrusion down
    g.translate(0, h, 0)
  } else {
    g.rotateX(-Math.PI / 2) // outline y -> -z, the extrusion up
  }
  return g
}

/** a slab's caps split in two: the top one keeps material 0, the bottom one gets material 2 (the
 *  caps come as two runs, one then the other) */
function splitCaps(g: BufferGeometry) {
  const caps = g.groups[0]
  const half = caps.count / 2
  const firstUp = g.attributes.normal.getY(caps.start) > 0
  g.groups = [
    { start: caps.start, count: half, materialIndex: firstUp ? 0 : 2 },
    { start: caps.start + half, count: half, materialIndex: firstUp ? 2 : 0 },
    ...g.groups.slice(1),
  ]
  return g
}

const SINK = 0.3
/** the keys (all one mesh): rounded caps standing up off the deck, the picture of the keyboard laid
 *  on them from above (the legends on their tops; their sides take the pink round them) */
function keysGeometry() {
  const parts: BufferGeometry[] = []
  for (const k of keyLayout()) {
    const g = new ExtrudeGeometry(roundedRect(k.w - 0.5, k.d - 0.5, Math.min(2.2, k.d / 3)), { depth: L.keys.rise - 0.5 + SINK, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, curveSegments: 4 })
    g.translate(0, 0, 0.25)
    g.rotateX(-Math.PI / 2)
    g.translate(k.x, T / 2 - SINK, k.z) // (sunk a little into the deck: no seam to sparkle where they meet it)
    parts.push(g)
  }
  const g = mergeGeometries(parts)!
  const pos = g.attributes.position
  const uv = g.attributes.uv
  const A = KEY_AREA
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - A.x0) / A.w, 1 - (pos.getZ(i) - A.z0) / A.d)
  uv.needsUpdate = true
  return g
}

/** on the base's side: drawn in front of it (no flicker zoomed out) */
const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }
const DECK_Y = T / 2 - 2 // the deck's aluminium, from here to the top; the case's shell under it
const PORT_Y = (DECK_Y + BOTTOM + L.case.feet) / 2 // the ports' middles, halfway up the case's side

/** the laptop. `angle`: how far the lid's open (0 shut, LAPTOP.lid.open wide); `onLid`: the lid clicked */
export function LaptopModel({ angle, onLid, onScreen, screen, screenRef }: { angle: { current: number }; onLid?: () => void; onScreen?: () => void; screen?: ReactNode; screenRef?: RefObject<Group | null> }) {
  const geo = useMemo(() => {
    const tb = touchBar()
    return {
      // the base: the case's dark shell, the deck on it, the same outline (flush: no rim to shimmer)
      shell: slab(SHELL_W, SHELL_D, DECK_Y - (-T / 2 - L.case.t), B.corner + L.case.t, 1.2),
      deck: slab(SHELL_W, SHELL_D, T / 2 - DECK_Y, B.corner + L.case.t, 0.6),
      keys: keysGeometry(),
      id: (() => {
        const g = new ExtrudeGeometry(roundedRect(tb.id.w - 0.5, tb.id.d - 0.5, 2), { depth: L.keys.rise - 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, curveSegments: 6 })
        g.translate(0, 0, 0.25)
        g.rotateX(-Math.PI / 2)
        g.translate(tb.id.x, T / 2, tb.id.z)
        return g
      })(),
      hinge: new CylinderGeometry(L.hinge.r, L.hinge.r, L.hinge.w, 20).rotateZ(Math.PI / 2),
      // the lid: the hearts on its back, the case's rim round it, its inside the face
      lid: splitCaps(slab(SHELL_W, L.lid.len, LID_T, B.corner + L.case.t, 1.2, true, 0)),
      foot: new CylinderGeometry(5, 5, L.case.feet, 16),
      port: new ShapeGeometry(roundedRect(L.port.w, L.port.h, L.port.h / 2), 6).rotateY(-Math.PI / 2),
      jack: new CircleGeometry(L.jack.r, 16).rotateY(Math.PI / 2),
    }
  }, [])
  const mat = useMemo(() => {
    const deck = deckTextures()
    const face = faceTextures()
    return {
      shell: new MeshStandardMaterial({ color: C.shell, roughness: 0.55 }),
      gray: new MeshStandardMaterial({ color: C.gray, roughness: 0.42, metalness: 0.15 }),
      // the deck's top: its picture, and the Touch Bar's keys lit on it while it's on
      deck: new MeshStandardMaterial({ map: deck.map, emissiveMap: deck.lit, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.42, metalness: 0.15 }),
      keys: new MeshStandardMaterial({ map: keysTexture(), roughness: 0.7 }),
      dark: new MeshStandardMaterial({ color: C.hinge, roughness: 0.5 }),
      touchId: new MeshStandardMaterial({ color: '#1b1b1e', roughness: 0.25 }),
      hearts: new MeshStandardMaterial({ map: heartsTexture(), roughness: 0.45 }),
      rim: new MeshStandardMaterial({ color: C.rim, roughness: 0.5 }),
      // the lid's inside: the black glass round the display, and the screen lit on it while it's on
      face: new MeshStandardMaterial({ map: face.map, emissiveMap: face.lit, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.22 }),
      port: new MeshBasicMaterial({ color: '#0b0b0d', ...DECAL }),
    }
  }, [])
  const lid = useRef<Group>(null)
  useFrame(() => {
    const l = lid.current
    if (!l) return
    l.rotation.x = -angle.current
    // on while it's open (it wakes as the lid comes up, sleeps as it comes down)
    const on = Math.min(1, Math.max(0, (angle.current - 0.5) / 0.4))
    mat.face.emissiveIntensity = on * 0.95
    mat.deck.emissiveIntensity = on * 0.9
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (worldInput.locked) return
    // the screen (the lid's inside, open): use it; anywhere else on the lid: shut it (or open it)
    if (e.face?.materialIndex === 2 && onScreen && angle.current > 1.2) onScreen()
    else onLid?.()
  }
  return (
    <group>
      <mesh geometry={geo.shell} material={mat.shell} position={[0, -T / 2 - L.case.t, 0]} castShadow receiveShadow />
      <mesh geometry={geo.deck} material={[mat.deck, mat.gray]} position={[0, DECK_Y, 0]} castShadow receiveShadow />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={geo.foot} material={mat.shell} position={[sx * (B.w / 2 - 25), BOTTOM + L.case.feet / 2, sz * (B.d / 2 - 25)]} />))}
      <mesh geometry={geo.keys} material={mat.keys} castShadow receiveShadow />
      <mesh geometry={geo.id} material={mat.touchId} castShadow />
      {/* the ports on the left, the jack on the right */}
      {L.port.z.map((z) => (
        <mesh key={z} geometry={geo.port} material={mat.port} position={[-SHELL_W / 2 - 0.15, PORT_Y, z]} />
      ))}
      <mesh geometry={geo.jack} material={mat.port} position={[SHELL_W / 2 + 0.15, PORT_Y, L.jack.z]} />
      <mesh geometry={geo.hinge} material={mat.dark} position={HINGE} castShadow />
      {/* the lid, on its hinge */}
      <group position={HINGE}>
        <group ref={lid} onClick={click}>
          <mesh geometry={geo.lid} material={[mat.hearts, mat.rim, mat.face]} position={[0, GAP, BACK]} castShadow receiveShadow />
          {/* the display's middle, facing out of it (+Z), its top up (+Y): what's on the screen goes here */}
          <group ref={screenRef} position={[0, GAP - 0.6, BACK + L.lid.len - L.display.top - L.display.h / 2]} rotation={[Math.PI / 2, 0, 0]}>
            {screen}
          </group>
        </group>
      </group>
    </group>
  )
}

const _q = new Quaternion()
const _v = new Vector3()
const X = new Vector3(1, 0, 0)
/** the lid's box in the laptop's frame, open to `a` */
function lidPose(a: number) {
  _q.setFromAxisAngle(X, -a)
  _v.set(0, GAP + LID_T / 2, BACK + L.lid.len / 2).applyQuaternion(_q).add(HINGE)
  return { p: _v, q: _q }
}

/** RinaOS's px to the display's mm (drei's Html: a px is distanceFactor / 400 world units) */
const SCREEN_DF = (L.display.w / OS_W) * 400
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Using the laptop: the camera glides round to face the screen, square on, near enough that the
 *  screen (and a little bezel) fills the view; the room's camera and hand stand still meanwhile;
 *  leaving, it glides back to where it was */
function UseCamera({ anchor }: { anchor: RefObject<Group | null> }) {
  const active = useOsMode()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean; target: Vector3; update: () => void } | null
  const tween = useRef<{ from: { p: Vector3; t: Vector3 }; to: { p: Vector3; t: Vector3 }; k: number; back: boolean } | null>(null)
  const saved = useRef<{ p: Vector3; t: Vector3 } | null>(null)
  useEffect(() => {
    const a = anchor.current
    if (!a || !controls) return
    const now = { p: camera.position.clone(), t: controls.target.clone() }
    if (active) {
      saved.current = now
      const c = a.getWorldPosition(new Vector3())
      const out = new Vector3(0, 0, 1).applyQuaternion(a.getWorldQuaternion(new Quaternion()))
      const tan = Math.tan((camera.fov * Math.PI) / 360)
      const d = Math.max((L.display.h * 1.1) / 2 / tan, (L.display.w * 1.08) / 2 / (tan * camera.aspect))
      tween.current = { from: now, to: { p: c.clone().addScaledVector(out, d), t: c }, k: 0, back: false }
      controls.enabled = false
      worldInput.locked = true
    } else if (saved.current) {
      tween.current = { from: now, to: saved.current, k: 0, back: true }
      saved.current = null
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const w = tween.current
    if (!w || !controls) return
    w.k = Math.min(1, w.k + Math.min(dt, 1 / 30) / 0.95)
    const k = ease(w.k)
    camera.position.lerpVectors(w.from.p, w.to.p, k)
    controls.target.lerpVectors(w.from.t, w.to.t, k)
    camera.lookAt(controls.target)
    if (w.k >= 1) {
      tween.current = null
      if (w.back) {
        controls.enabled = true
        worldInput.locked = false
      }
    }
  })
  return null
}

/** the laptop on the desk, to pick up and put back, its lid to open and shut, its screen to use */
export function LiveLaptop({ homeAt, spawn, bodyOut }: { homeAt: () => Matrix4 | null; spawn: [number, number, number]; bodyOut?: { current: RapierRigidBody | null } }) {
  const angle = useRef(L.lid.open)
  const target = useRef(L.lid.open)
  const lidBox = useRef<RapierCollider>(null)
  const perch = usePerch({
    key: 'laptop',
    label: 'Return laptop',
    perchAt: homeAt,
    approach: new Vector3(0, 1, 0),
    snap: 0, // (it stays where it's put)
    away: 200,
    lift: 170,
  })
  // the lid swings to where it's going, easing in at the end
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const d = target.current - angle.current
    if (Math.abs(d) < 1e-4) return
    angle.current += Math.sign(d) * Math.min(Math.abs(d), Math.max(0.35, Math.abs(d) * 5) * dt)
  })
  // its box follows it
  useBeforePhysicsStep(() => {
    if (bodyOut) bodyOut.current = perch.body.current // (for the charger's plug, going into its ports)
    const c = lidBox.current
    if (!c) return
    const { p, q } = lidPose(angle.current)
    c.setTranslationWrtParent(p)
    c.setRotationWrtParent(q)
  })
  const onLid = () => {
    target.current = target.current > 0 ? 0 : L.lid.open
    perch.body.current?.wakeUp()
  }
  // using it: RinaOS on the screen (booted the first time, kept after, so it's as she left it)
  const using = useOsMode()
  const [booted, setBooted] = useState(false)
  const screenAt = useRef<Group>(null)
  const onScreen = () => {
    setBooted(true)
    osMode.set(true)
  }
  useEffect(() => () => osMode.set(false), [])
  if (import.meta.env.DEV) Object.assign(window, { __laptop: { ...perch, angle, target, onScreen, osMode } })
  const start = lidPose(L.lid.open)
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={{ ...perch.hold, lift: 40 }}>
        <group {...perch.hover.bind}>
          <LaptopModel
            angle={angle}
            onLid={onLid}
            onScreen={onScreen}
            screenRef={screenAt}
            screen={
              booted && (
                <Html transform distanceFactor={SCREEN_DF} zIndexRange={[20, 10]} style={{ display: using ? 'block' : 'none' }}>
                  <RinaOS embedded={{ onExit: () => osMode.set(false) }} />
                </Html>
              )
            }
          />
        </group>
        <CuboidCollider args={[SHELL_W / 2, (T / 2 - BOTTOM) / 2, SHELL_D / 2]} position={[0, (T / 2 + BOTTOM) / 2, 0]} mass={L.mass * 0.7 + L.case.mass * 0.6} friction={0.7} collisionGroups={ITEM} />
        <CuboidCollider ref={lidBox} args={[SHELL_W / 2, LID_T / 2, L.lid.len / 2]} position={start.p.toArray()} quaternion={start.q.toArray() as [number, number, number, number]} mass={L.mass * 0.3 + L.case.mass * 0.4} friction={0.7} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
      <UseCamera anchor={screenAt} />
    </>
  )
}

/** A USB-C plug in each of the ports on the left, for the laptop at `m` (its world matrix): where
 *  the plug's body sits (its overmold against the case, the shell in the port; the plug's +X out of
 *  the port, its thin side up), as the charger's plugs are laid out (../charger). Port 0 is the back
 *  one, the one her charger's in */
const PLUG_OUT = 0.3 + CHARGER.plug.mold[2] / 2 // the plug body's middle, out from the port's mouth
const PLUG_Q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI) // (its +X along the laptop's -X)
export function laptopSockets(m: Matrix4) {
  const q = new Quaternion().setFromRotationMatrix(m)
  return L.port.z.map((z) => ({ p: new Vector3(-SHELL_W / 2 - PLUG_OUT, PORT_Y, z).applyMatrix4(m), q: q.clone().multiply(PLUG_Q) }))
}

/** where its lowest point is below its middle (for putting it on things) */
export const LAPTOP_BOTTOM = -BOTTOM
