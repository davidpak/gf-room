import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, useBeforePhysicsStep, type RapierCollider } from '@react-three/rapier'
import { CircleGeometry, Color, CylinderGeometry, ExtrudeGeometry, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, ShapeGeometry, Vector3, type BufferGeometry, type Group, type Matrix4 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Holdable } from '../../lib/physics/Holdable'
import { usePerch } from '../../lib/physics/usePerch'
import { GROUP, groups } from '../../lib/physics/rope'
import { roundedRect } from '../../lib/shapes'
import { Prompts } from '../prompt/Prompts'
import { LAPTOP, keyLayout, rowZ, touchBar, FN_Z, KB_W } from './spec'
import { LEGEND_AREA, bezelTexture, grilleTexture, heartsTexture, legendsTexture, screenTexture, touchBarTexture } from './print'

/**
 * Rina's MacBook Pro in its heart case (./spec).
 *
 *   the laptop   an object like any other: carried, turned, put down anywhere (the shared hand); to the
 *                physics a slab and a lid, the lid's box following it as it opens. "Return laptop"
 *                once it's well away from its spot or knocked over
 *   the lid      click it to shut it or open it again; it swings on its hinge. Open, the screen's on
 *                (her notes, like the photos) and so is the Touch Bar; shut, they go dark
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
 *  `bevel`; `forward`: the outline's y runs to +z (for pictures laid on its caps) */
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

/** a flat rounded rectangle lying face up */
function flat(w: number, d: number, r: number) {
  return new ShapeGeometry(roundedRect(w, d, r), 8).rotateX(-Math.PI / 2)
}

/** the keys (all one mesh): rounded caps standing up off the deck */
function keysGeometry() {
  const parts: BufferGeometry[] = []
  for (const k of keyLayout()) {
    const g = new ExtrudeGeometry(roundedRect(k.w - 0.5, k.d - 0.5, Math.min(2.2, k.d / 3)), { depth: L.keys.rise - 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, curveSegments: 4 })
    g.translate(0, 0, 0.25)
    g.rotateX(-Math.PI / 2)
    g.translate(k.x, T / 2, k.z)
    parts.push(g)
  }
  return mergeGeometries(parts)!
}

const SCREEN_ON = new Color('#ffffff')
const SCREEN_OFF = new Color('#050506')

/** the laptop. `angle`: how far the lid's open (0 shut, LAPTOP.lid.open wide); `onLid`: the lid clicked */
export function LaptopModel({ angle, onLid }: { angle: { current: number }; onLid?: () => void }) {
  const geo = useMemo(() => {
    const tb = touchBar()
    const margin = (B.w - KB_W) / 2
    const kbD = rowZ(4) + L.keys.cap - FN_Z
    return {
      shell: slab(SHELL_W, SHELL_D, T - 1.3 + L.case.t, B.corner + L.case.t, 1.6),
      deck: slab(B.w, B.d, 2, B.corner, 0.7),
      keys: keysGeometry(),
      bar: tb.bar,
      barGeo: new PlaneGeometry(tb.bar.w, tb.bar.d).rotateX(-Math.PI / 2),
      id: (() => {
        const g = new ExtrudeGeometry(roundedRect(tb.id.w - 0.5, tb.id.d - 0.5, 2), { depth: L.keys.rise - 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, curveSegments: 6 })
        g.translate(0, 0, 0.25)
        g.rotateX(-Math.PI / 2)
        g.translate(tb.id.x, T / 2, tb.id.z)
        return g
      })(),
      legends: new PlaneGeometry(LEGEND_AREA.w, LEGEND_AREA.d).rotateX(-Math.PI / 2),
      trackpad: flat(L.trackpad.w, L.trackpad.d, 6),
      grille: new PlaneGeometry(L.speaker.w, kbD).rotateX(-Math.PI / 2),
      grilleX: KB_W / 2 + margin / 2,
      grilleZ: FN_Z + kbD / 2,
      hinge: new CylinderGeometry(L.hinge.r, L.hinge.r, L.hinge.w, 20).rotateZ(Math.PI / 2),
      lid: slab(SHELL_W, L.lid.len, LID_T, B.corner + L.case.t, 1.2, true, 0),
      bezel: (() => {
        const g = new ShapeGeometry(roundedRect(B.w, L.lid.len, B.corner), 8)
        g.translate(0, L.lid.len / 2, 0)
        g.rotateX(Math.PI / 2) // face down, outline y -> +z
        return g
      })(),
      display: new PlaneGeometry(L.display.w, L.display.h).rotateX(Math.PI / 2), // (face down, its top toward the lid's front edge)
      foot: new CylinderGeometry(5, 5, L.case.feet, 16),
      port: new ShapeGeometry(roundedRect(L.port.w, L.port.h, L.port.h / 2), 6).rotateY(-Math.PI / 2),
      jack: new CircleGeometry(L.jack.r, 16).rotateY(Math.PI / 2),
    }
  }, [])
  const tb = geo.bar
  const mat = useMemo(() => {
    const hearts = new MeshStandardMaterial({ map: heartsTexture(), roughness: 0.45 })
    return {
      shell: new MeshStandardMaterial({ color: C.shell, roughness: 0.55 }),
      gray: new MeshStandardMaterial({ color: C.gray, roughness: 0.42, metalness: 0.15 }),
      key: new MeshStandardMaterial({ color: C.key, roughness: 0.7 }),
      legends: new MeshBasicMaterial({ map: legendsTexture(), transparent: true, depthWrite: false }),
      trackpad: new MeshStandardMaterial({ color: C.trackpad, roughness: 0.3, metalness: 0.1 }),
      grille: new MeshStandardMaterial({ map: grilleTexture(L.speaker.w, 100), transparent: true, depthWrite: false, roughness: 0.6 }),
      dark: new MeshStandardMaterial({ color: C.hinge, roughness: 0.5 }),
      touchId: new MeshStandardMaterial({ color: '#1b1b1e', roughness: 0.25 }),
      bar: new MeshBasicMaterial({ map: touchBarTexture(tb.w, tb.d), color: SCREEN_OFF.clone() }),
      lid: [hearts, new MeshStandardMaterial({ color: C.rim, roughness: 0.5 })],
      bezel: new MeshStandardMaterial({ map: bezelTexture(), roughness: 0.2 }),
      screen: new MeshBasicMaterial({ map: screenTexture(), color: SCREEN_OFF.clone() }),
      port: new MeshBasicMaterial({ color: '#0b0b0d' }),
    }
  }, [tb])
  const lid = useRef<Group>(null)
  useFrame(() => {
    const l = lid.current
    if (!l) return
    l.rotation.x = -angle.current
    // on while it's open (it wakes as the lid comes up, sleeps as it comes down)
    const on = Math.min(1, Math.max(0, (angle.current - 0.5) / 0.4))
    mat.screen.color.copy(SCREEN_OFF).lerp(SCREEN_ON, on * 0.92)
    mat.bar.color.copy(SCREEN_OFF).lerp(SCREEN_ON, on)
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onLid?.()
  }
  const legendY = T / 2 + L.keys.rise + 0.03
  const sideY = (T / 2 - 1.3 + BOTTOM + L.case.feet) / 2 // (halfway up the case's side)
  return (
    <group>
      {/* the base: the case's dark bottom shell, the Space Gray deck over it */}
      <mesh geometry={geo.shell} material={mat.shell} position={[0, -T / 2 - L.case.t, 0]} castShadow receiveShadow />
      <mesh geometry={geo.deck} material={mat.gray} position={[0, T / 2 - 2, 0]} castShadow receiveShadow />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={geo.foot} material={mat.shell} position={[sx * (B.w / 2 - 25), BOTTOM + L.case.feet / 2, sz * (B.d / 2 - 25)]} />))}
      {/* the keys under their pink cover, the legends through it; the Touch Bar, Touch ID */}
      <mesh geometry={geo.keys} material={mat.key} castShadow receiveShadow />
      <mesh geometry={geo.legends} material={mat.legends} position={[LEGEND_AREA.x0 + LEGEND_AREA.w / 2, legendY, LEGEND_AREA.z0 + LEGEND_AREA.d / 2]} />
      <mesh geometry={geo.barGeo} material={mat.bar} position={[tb.x, T / 2 + 0.03, tb.z]} />
      <mesh geometry={geo.id} material={mat.touchId} castShadow />
      <mesh geometry={geo.trackpad} material={mat.trackpad} position={[0, T / 2 + 0.02, B.d / 2 - L.trackpad.front - L.trackpad.d / 2]} receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.grille} material={mat.grille} position={[s * geo.grilleX, T / 2 + 0.02, geo.grilleZ]} />
      ))}
      {/* the ports on the left, the jack on the right */}
      {L.port.z.map((z) => (
        <mesh key={z} geometry={geo.port} material={mat.port} position={[-SHELL_W / 2 - 0.02, sideY, z]} />
      ))}
      <mesh geometry={geo.jack} material={mat.port} position={[SHELL_W / 2 + 0.02, sideY, L.jack.z]} />
      <mesh geometry={geo.hinge} material={mat.dark} position={HINGE} castShadow />
      {/* the lid, on its hinge: the hearts outside, the display in its black glass inside */}
      <group position={HINGE}>
        <group ref={lid} onClick={click}>
          <group position={[0, GAP, BACK]}>
            <mesh geometry={geo.lid} material={mat.lid} castShadow receiveShadow />
            <mesh geometry={geo.bezel} material={mat.bezel} position={[0, -0.12, 0]} />
            <mesh geometry={geo.display} material={mat.screen} position={[0, -0.3, L.lid.len - L.display.top - L.display.h / 2]} />
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

/** the laptop on the desk, to pick up and put back, its lid to open and shut */
export function LiveLaptop({ homeAt, spawn }: { homeAt: () => Matrix4 | null; spawn: [number, number, number] }) {
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
  if (import.meta.env.DEV) Object.assign(window, { __laptop: { ...perch, angle, target } })
  const start = lidPose(L.lid.open)
  return (
    <>
      <Holdable bodyRef={perch.body} position={spawn} colliders={false} restitution={0.05} linearDamping={0.5} angularDamping={1} hold={{ ...perch.hold, lift: 40 }}>
        <group {...perch.hover.bind}>
          <LaptopModel angle={angle} onLid={onLid} />
        </group>
        <CuboidCollider args={[SHELL_W / 2, (T / 2 - BOTTOM) / 2, SHELL_D / 2]} position={[0, (T / 2 + BOTTOM) / 2, 0]} mass={L.mass * 0.7 + L.case.mass * 0.6} friction={0.7} collisionGroups={ITEM} />
        <CuboidCollider ref={lidBox} args={[SHELL_W / 2, LID_T / 2, L.lid.len / 2]} position={start.p.toArray()} quaternion={start.q.toArray() as [number, number, number, number]} mass={L.mass * 0.3 + L.case.mass * 0.4} friction={0.7} collisionGroups={ITEM} />
      </Holdable>
      <Prompts items={[perch.prompt]} />
    </>
  )
}

/** where its lowest point is below its middle (for putting it on things) */
export const LAPTOP_BOTTOM = -BOTTOM
