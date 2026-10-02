import { typing, worldInput } from '../inputLock'
import { useEffect, useRef, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { Box3, Matrix4, Plane, Quaternion, Ray, Vector3, type Mesh, type Object3D } from 'three'
import { GROUP, groups } from './rope'
import { thump } from '../sound/thump'
import '../render/fastHits' // every stage with a hand hit-tests through bounds trees where they exist

/** what a thing being turned rests on (its clearance): everything but cables and plugs */
const SUPPORT = groups(0xffff, 0xffff & ~GROUP.rope & ~GROUP.plug)

/**
 * The hand: one way to pick things up for the whole world, the way the pillows carry (Grabbable):
 * what you hold moves over a flat plane a little above where you picked it up, drifting after the
 * cursor on a soft spring. It is simply in your hand: it keeps the way up it had when you picked it
 * up (its rotation is locked while carried, no swinging). Its own shadow shows
 * where it will land, and when you let go it floats down gently (light gravity and air until it
 * settles).
 *
 * Every <World> has the hand built in. Items use <Holdable>, or for hand-made bodies (rope links,
 * plugs) spread grabbable(spec) onto their group: the item listens for itself (only grabbable
 * things are hit-tested, never the whole scene), and body(point) returns the body to carry.
 *
 *   click             stays a click (the object's own onClick fires): nothing is picked up until the
 *                     pointer moves 5 px, so small parts (prongs, switches) keep working
 *   left-drag         carry it: it rises `lift` mm and follows the cursor across the plane
 *   right-drag        turn it where it is (sideways: round the vertical, up / down: tipping toward /
 *                     away from you); it rises only as far as the angle needs to clear what it rests
 *                     on, and turns under physics, so it bumps rather than passes through
 *   left + right      while carrying, hold right too: it stops and the mouse turns it; let go of right
 *                     and you're carrying it again, at its new angle (and the other way round)
 *   the cursor        hides while you hold something (it reappears on the item when you let go);
 *                     turning locks the pointer, so you can keep turning without running out of
 *                     screen, and the cursor comes back where you pressed (on the item)
 *   mouse wheel       carrying: straight up / down (along gravity); turning: tilts it left / right
 *                     (round the line of sight, like a steering wheel)
 *   keys, any time    turn it while you carry it: Q / E spin it round the vertical, R / F tip it away /
 *   it's held         toward you, Z / C tilt it left / right. Every key clicks into each quarter turn
 *                     round its own axis (four stops a turn, whatever way up the thing is) and holds
 *                     there a moment, so it's easy to let go of it exactly square
 *   let go            it floats down; `onRelease` can snap it somewhere
 */
export type GrabSpec = {
  body: (point: Vector3) => RapierRigidBody | null | undefined
  /** how far it rises above where you grabbed it (mm): the pillows use 120, small things less */
  lift?: number
  /** the mass the spring pulls as (kg), when the body drags more than itself (a rope link hauls the rope) */
  pull?: number
  /** checked every frame while held: false makes the hand let go (a plug that has found its port) */
  keep?: () => boolean
  /** picked up even while the page says things aren't (a record taken out, to carry to the player in a close look) */
  whileLooking?: boolean
  /** false: it can't be turned; right-drag over it pans the camera instead */
  turn?: boolean
  /** carried loose, not held at its angle: it hangs and swings from where you grabbed it (a cable) */
  free?: boolean
  /** its own box (in its body's frame) when the grabbed meshes don't describe the body (one link of a cable) */
  box?: Box3
  /** things riding inside it (the mints in their tin): not what it rests on, when it's turned */
  ignore?: (collider: RapierCollider) => boolean
  /** how far its lowest point is below its centre, turned to `q` (a round thing: its box's corners
   *  would lift it clear of the surface, and bob it up and down as it spins) */
  lowest?: (q: Quaternion) => number
  /** kg the hand lends it while held (GRIP unless given): light for cable pieces, whose neighbours
   *  weigh grams (a heavy link among light ones stretches the chain) */
  grip?: number
  /** the carry spring (k 1/s², c 1/s): softer = laggier, swingier (a pillow) */
  spring?: { k: number; c: number }
  /** picked up: the body, where it was grabbed (world) and the mesh that was pressed */
  onGrab?: (body: RapierRigidBody, point: Vector3, object: Object3D) => void
  onRelease?: (body: RapierRigidBody) => void
  /** tethered (a plug on a cable whose other end is held fast): the grabbed point can't be carried
   *  further than `length` from `from`, so a taut cable is never torn through what it lies on.
   *  Read every frame; null = free */
  leash?: () => { from: Vector3; length: number } | null
}

/** the hand's press handler (set while a <Hand> is mounted) */
let press: ((e: ThreeEvent<PointerEvent>, spec: GrabSpec) => void) | null = null
/** whether a thing may be picked up now (a page sets it: the Quad lets nothing be, while the camera's in close on
 *  something, but what says `whileLooking`) */
export const grabRules = { allow: (spec: GrabSpec): boolean => (void spec, true) }

/**
 * Makes something grabbable: spread it onto its group, `<group {...grabbable({ body: ... })}>`. The
 * item listens for itself, so the pointer is only tested against things you can pick up, never the
 * whole scene (a heavy scene stays fast), and hands presses to the <Hand>.
 */
export const grabbable = (spec: GrabSpec) => ({
  userData: { grab: spec },
  onPointerDown: (e: ThreeEvent<PointerEvent>) => press?.(e, spec),
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!holding) document.body.style.cursor = 'grab'
  },
  onPointerOut: () => {
    if (!holding) document.body.style.cursor = 'auto'
  },
})

let holding = false
/** is the hand carrying something right now (things stay awake while it is) */
export const isHolding = () => holding

const SPRING = { k: 70, c: 15 } // the pillows' spring: stiff enough to carry, damped enough not to wobble
/** kg the hand lends what it holds: a held thing wins against whatever it's tied to (a cable tugging
 *  a plug, a cable tugging the charger), as if really gripped; given back when you let go */
const GRIP = 0.25
const LANDING = { gravity: 0.35, drag: 2.2, time: 1.4 } // the soft landing after letting go
const TURN = 0.016 // radians per pixel of turning drag (a quarter turn in about 100 px)
const TILT = Math.PI / 12 // radians per wheel notch while turning (15°)
const SPIN = 2.2 // rad/s while a turning key is held
/** turning keys: which axis (up, the camera's right, its line of sight) and which way */
const KEYS: Record<string, ['up' | 'right' | 'sight', number]> = {
  q: ['up', -1],
  e: ['up', 1],
  r: ['right', -1],
  f: ['right', 1],
  z: ['sight', -1],
  c: ['sight', 1],
}
const _spin = new Vector3()

/** the key turning's snap points: it holds at each square angle this long (s), and they re-arm once
 *  it's this far past (radians) */
const DETENT = { hold: 0.5, rearm: (5 * Math.PI) / 180 }
const QUARTER = Math.PI / 2
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
const _a = new Vector3()
const _align = new Quaternion()
const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x))
/** the room's level axis (±X or ±Z) nearest a direction */
function nearestLevelAxis(v: Vector3) {
  return Math.abs(v.x) >= Math.abs(v.z) ? v.set(Math.sign(v.x) || 1, 0, 0) : v.set(0, 0, Math.sign(v.z) || 1)
}
/** a world axis the keys turn round, and the two square directions across it (angle 0 and a quarter) */
type Axis = 'x' | 'y' | 'z'
const ROUND: Record<Axis, { a: Vector3; u: Vector3; w: Vector3 }> = {
  x: { a: new Vector3(1, 0, 0), u: new Vector3(0, 1, 0), w: new Vector3(0, 0, 1) },
  y: { a: new Vector3(0, 1, 0), u: new Vector3(1, 0, 0), w: new Vector3(0, 0, 1) },
  z: { a: new Vector3(0, 0, 1), u: new Vector3(1, 0, 0), w: new Vector3(0, 1, 0) },
}
/** of its own three axes, the one lying most across a world axis (turning round that axis never
 *  changes which one it is: each keeps its angle to the axis) */
function across(q: Quaternion, ax: Axis) {
  let idx = 0
  let best = Infinity
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(_a.copy(AXES[i]).applyQuaternion(q).dot(ROUND[ax].a))
    if (d < best) {
      best = d
      idx = i
    }
  }
  return idx
}
/** how far round a world axis it's turned: the angle of its axis `idx` across it, from square */
function angleRound(q: Quaternion, ax: Axis, idx: number) {
  const v = _a.copy(AXES[idx]).applyQuaternion(q)
  return Math.atan2(v.dot(ROUND[ax].w), v.dot(ROUND[ax].u))
}
const quarterOf = (x: number) => (((Math.round(x / QUARTER) % 4) + 4) % 4) // which of the four stops
const _v = new Vector3()
const _q = new Quaternion()
const _target = new Vector3()
const _box = new Box3()
const _m = new Matrix4()
const UP = new Vector3(0, 1, 0)
const _turn = new Quaternion()
const _err = new Quaternion()

/** the object's box in its own frame (the grab root's), from its meshes' geometry */
function localBox(root: Object3D) {
  const inv = new Matrix4().copy(root.matrixWorld).invert()
  const box = new Box3()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    box.union(_box.copy(mesh.geometry.boundingBox!).applyMatrix4(_m.multiplyMatrices(inv, mesh.matrixWorld)))
  })
  return box
}
/** while holding, the cursor is hidden, whatever else (a hovered bed, a blanket) tries to set it */
if (typeof document !== 'undefined' && !document.getElementById('hand-holding-style')) {
  const s = document.createElement('style')
  s.id = 'hand-holding-style'
  s.textContent = '.hand-holding, .hand-holding * { cursor: none !important; }'
  document.head.appendChild(s)
}
const hideCursor = (on: boolean) => document.body.classList.toggle('hand-holding', on)

const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1, (i >> 1) & 1, (i >> 2) & 1])

type Rest = { damping: [number, number]; gravity: number } // what to give back on letting go
type Held = {
  spec: GrabSpec
  body: RapierRigidBody
  root: Object3D
  carry: boolean // the left button is down
  turn: boolean // the right button is down
  local: Vector3 // the grabbed point, in the body's frame
  plane: Plane // carrying: the flat plane it moves over (the wheel raises / lowers it)
  off: Vector3 // carrying: offset from the cursor's point on the plane (keeps it where it is when you start carrying, and the wheel purely vertical)
  ray: Ray // the cursor's last ray
  anchor: Vector3 // turning: where it stays (the wheel lifts it)
  qT: Quaternion // turning: the orientation it is being turned to
  last: [number, number] // the pointer last event
  box: Box3 // its own box, to know how low its lowest corner reaches at an angle
  spinning: boolean // carrying: turning with the keys (its rotation unlocked meanwhile)
  keyed: boolean // a turning key was held last frame
  pause: number // holding at a square angle (s left)
  at: Partial<Record<Axis, number | null>> // per key axis: the stop it last clicked into (null once it has moved on; missing until that axis is turned)
  rise: number // carrying: how far above the carry plane it's held (the lift, then the wheel)
  rest: Rest
}
type Landing = { body: RapierRigidBody; t: number; rest: Rest }

export function Hand({ children }: { children: ReactNode }) {
  const { camera, raycaster, controls, gl } = useThree()
  const { world, rapier } = useRapier()
  const pending = useRef<{ spec: GrabSpec; root: Object3D; object: Object3D; point: Vector3; x: number; y: number; button: number; moved: number } | null>(null)
  const held = useRef<Held | null>(null)
  const keys = useRef(new Set<string>())
  const landing = useRef<Landing[]>([])
  // turning locks the pointer (endless turning, the cursor comes back where it was); only from a real
  // button press, which the browser requires; without it turning still works, just screen-bound
  const locked = () => document.pointerLockElement === gl.domElement
  const lock = () => {
    try {
      const r = gl.domElement.requestPointerLock() as unknown as Promise<void> | undefined
      r?.catch?.(() => {})
    } catch {
      // not allowed here (no user gesture): fine
    }
  }
  const unlock = () => {
    if (locked()) document.exitPointerLock()
  }
  const orbit = (on: boolean) => {
    if (controls) (controls as unknown as { enabled: boolean }).enabled = on
  }
  const restore = (b: RapierRigidBody, rest: Rest) => {
    b.setLinearDamping(rest.damping[0])
    b.setAngularDamping(rest.damping[1])
    b.setGravityScale(rest.gravity, true)
  }
  const letGo = (h: Held) => {
    held.current = null
    unlock()
    h.body.lockRotations(false, true)
    h.body.setAdditionalMass(0, true)
    holding = false
    hideCursor(false)
    document.body.style.cursor = 'auto'
    orbit(true)
    const b = h.body
    if (b.isDynamic()) {
      // float down: light gravity, a little air, until it has settled (then it's itself again)
      b.setGravityScale(h.rest.gravity * LANDING.gravity, true)
      b.setLinearDamping(Math.max(h.rest.damping[0], LANDING.drag))
      b.setAngularDamping(Math.max(h.rest.damping[1], 2))
      landing.current.push({ body: b, t: 0, rest: h.rest })
    } else restore(b, h.rest)
    h.spec.onRelease?.(b)
  }

  /** the height of what's straight below, by the physics' own fast ray (not the meshes): not the
   *  held thing, nor what rides inside it, not cables or plugs */
  const groundBelow = (t: { x: number; y: number; z: number }, b: RapierRigidBody, spec?: GrabSpec) => {
    const skip = spec?.ignore
    const hit = world.castRay(new rapier.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }), 5000, true, undefined, SUPPORT, undefined, b, skip ? (c) => !skip(c) : undefined)
    return hit ? t.y - hit.timeOfImpact : null
  }

  /** starting to turn with the keys: each axis arms when it's first turned (a stop it already sits at doesn't hold it up) */
  const armDetents = (h: Held) => {
    h.at = {}
    h.pause = 0
  }
  /** which world axes the keys held now turn round */
  const keyAxes = () => {
    const out = new Set<Axis>()
    for (const k of keys.current) {
      const [axis] = KEYS[k]
      if (axis === 'up') out.add('y')
      else {
        const v = nearestLevelAxis(axis === 'right' ? _v.setFromMatrixColumn(camera.matrixWorld, 0) : camera.getWorldDirection(_v))
        out.add(v.x !== 0 ? 'x' : 'z')
      }
    }
    return out
  }
  /** turn qT by the keys' spin (_spin) for this frame, clicking into every quarter turn round each
   *  key's axis on the way; leaves in _spin the spin actually applied (none while it holds at one) */
  const keyTurn = (h: Held, dtc: number) => {
    if (h.pause > 0) {
      h.pause -= dtc
      _spin.set(0, 0, 0)
      return
    }
    const axes = keyAxes()
    for (const ax of Object.keys(h.at) as Axis[]) if (!axes.has(ax)) delete h.at[ax] // let go of that key: it re-arms
    const before = _q.copy(h.qT)
    const idx: Partial<Record<Axis, number>> = {}
    const a0: Partial<Record<Axis, number>> = {}
    for (const ax of axes) {
      idx[ax] = across(before, ax)
      a0[ax] = angleRound(before, ax, idx[ax]!)
      if (!(ax in h.at)) {
        // first turned: a stop it already sits at doesn't count
        const off = wrap(a0[ax]! - Math.round(a0[ax]! / QUARTER) * QUARTER)
        h.at[ax] = Math.abs(off) < DETENT.rearm ? quarterOf(a0[ax]!) : null
      }
    }
    h.qT.premultiply(_turn.setFromAxisAngle(_v.copy(_spin).normalize(), _spin.length() * dtc)).normalize()
    let clicked = false
    for (const ax of axes) {
      const a1 = angleRound(h.qT, ax, idx[ax]!)
      const n = Math.round(a1 / QUARTER)
      const off = wrap(a1 - n * QUARTER)
      if (h.at[ax] === quarterOf(a1)) {
        if (Math.abs(off) > DETENT.rearm) h.at[ax] = null // moved on past it
        continue
      }
      const off0 = wrap(a0[ax]! - n * QUARTER)
      if (clicked || !(Math.abs(off) < 1e-4 || (Math.sign(off) !== Math.sign(off0) && Math.abs(off - off0) < QUARTER))) continue
      // reached or passed a quarter this frame: stop exactly on it (turn its axis across onto the square direction)
      const R = ROUND[ax]
      const v = _a.copy(AXES[idx[ax]!]).applyQuaternion(h.qT)
      v.addScaledVector(R.a, -v.dot(R.a)).normalize()
      const t = _v.copy(R.u).multiplyScalar(Math.cos(n * QUARTER)).addScaledVector(R.w, Math.sin(n * QUARTER))
      h.qT.premultiply(_align.setFromUnitVectors(v, t)).normalize()
      h.at[ax] = quarterOf(a1)
      clicked = true
    }
    if (clicked) {
      h.pause = DETENT.hold
      _spin.set(0, 0, 0)
      thump(0.12, 'hard') // a soft click
    }
  }

  /** carrying: the plane through the grabbed point where it is now, the offset keeping it under the cursor as it is */
  const startCarry = (h: Held, lift: number) => {
    const t = h.body.translation()
    const r = h.body.rotation()
    const g = _v.copy(h.local).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_target.set(t.x, t.y, t.z))
    // the plane through where it's held (the cursor moves it across that), and the lift on top: the
    // wheel changes only the lift, so it can go as high as you like without the plane running away
    // from the cursor near the camera's height
    h.plane.set(UP, -g.y)
    h.rise = lift
    const at = new Vector3()
    h.off.set(0, 0, 0)
    if (h.ray.intersectPlane(h.plane, at)) h.off.set(g.x - at.x, 0, g.z - at.z)
    h.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    h.body.lockRotations(!h.spec.free, true) // in your hand: it keeps the way up it has now, no swinging (loose things hang)
    h.spinning = false
    h.body.setGravityScale(h.rest.gravity, true)
    hideCursor(true) // it's in your hand: no cursor, it comes back on the item
  }
  /** turning: it stays where it is and turns toward qT */
  const startTurn = (h: Held) => {
    const t = h.body.translation()
    const r = h.body.rotation()
    h.anchor.set(t.x, t.y, t.z)
    h.qT.set(r.x, r.y, r.z, r.w)
    h.body.lockRotations(false, true)
    h.body.setGravityScale(0, true) // it hovers where it is while you turn it
    hideCursor(true)
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const hd = held.current
      if (hd) {
        if (hd.turn) {
          // sideways turns it round the vertical, up / down tips it toward / away from you
          const dx = locked() ? e.movementX : e.clientX - hd.last[0]
          const dy = locked() ? e.movementY : e.clientY - hd.last[1]
          const right = _v.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
          hd.qT.premultiply(_turn.setFromAxisAngle(UP, dx * TURN)).premultiply(_turn.setFromAxisAngle(right, dy * TURN)).normalize()
        }
        hd.last = [e.clientX, e.clientY]
        return
      }
      const p = pending.current
      if (!p) return
      if (locked()) p.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
      else p.moved = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (p.moved < 5) return
      pending.current = null
      const body = p.spec.body(p.point)
      if (!body) return
      // picking up something still landing: it's yours again, as it was
      const was = landing.current.find((l) => l.body === body)
      landing.current = landing.current.filter((l) => l.body !== body)
      const rest: Rest = was?.rest ?? { damping: [body.linearDamping(), body.angularDamping()], gravity: body.gravityScale() }
      restore(body, rest)
      p.spec.onGrab?.(body, p.point, p.object)
      const t = body.translation()
      const r = body.rotation()
      const local = new Vector3(p.point.x - t.x, p.point.y - t.y, p.point.z - t.z).applyQuaternion(_q.set(r.x, r.y, r.z, r.w).invert())
      p.root.updateWorldMatrix(true, true)
      const box = p.spec.box ?? localBox(p.root)
      const h: Held = {
        spec: p.spec,
        body,
        root: p.root,
        carry: p.button === 0,
        turn: p.button === 2,
        local,
        plane: new Plane(),
        off: new Vector3(),
        ray: raycaster.ray.clone(),
        anchor: new Vector3(),
        qT: new Quaternion(),
        last: [e.clientX, e.clientY],
        box,
        spinning: false,
        keyed: false,
        pause: 0,
        at: {},
        rise: 0,
        rest,
      }
      held.current = h
      holding = true
      body.setAdditionalMass(p.spec.grip ?? GRIP, true)
      body.setLinearDamping(1.5)
      body.setAngularDamping(3)
      body.wakeUp()
      if (h.turn) startTurn(h)
      else startCarry(h, p.spec.lift ?? 40)
    }
    // the buttons, one by one (a second button during a drag only reaches mousedown / mouseup)
    const buttonDown = (e: MouseEvent) => {
      const p = pending.current
      if (p && !held.current) {
        orbit(false)
        if (p.button === 2) lock()
      }
      const h = held.current
      if (!h) return
      if (e.button === 2 && !h.turn && h.spec.turn !== false) {
        lock()
        h.turn = true
        startTurn(h)
      } else if (e.button === 0 && !h.carry) {
        h.carry = true
        if (!h.turn) startCarry(h, 0)
      }
    }
    const buttonUp = (e: MouseEvent) => {
      if (e.button === 2) unlock() // the cursor comes back where right was pressed
      const h = held.current
      if (!h) {
        if (e.button === 0 || e.button === 2) pending.current = null
        orbit(true)
        return
      }
      if (e.button === 2) h.turn = false
      if (e.button === 0) h.carry = false
      if (!h.carry && !h.turn) letGo(h)
      else if (e.button === 2 && h.carry) startCarry(h, 0) // back to carrying, at its new angle
      else if (e.button === 0 && h.turn) startTurn(h) // keep turning, right here
    }
    // all buttons up (whatever the per-button events saw): let go
    const allUp = (e: PointerEvent) => {
      if (e.buttons !== 0) return
      pending.current = null
      orbit(true)
      if (held.current) letGo(held.current)
    }
    const cancel = () => {
      pending.current = null
      orbit(true)
      if (held.current) letGo(held.current)
    }
    const wheel = (e: WheelEvent) => {
      const h = held.current
      if (!h) return
      if (h.turn) {
        // turning: the wheel tilts it left / right, round the line of sight
        const sight = camera.getWorldDirection(new Vector3())
        h.qT.premultiply(_turn.setFromAxisAngle(sight, Math.sign(e.deltaY) * TILT)).normalize()
        return
      }
      // carrying: straight up / down. A notch moves it about 3% of its distance from the camera (the
      // same on screen, near or far); a trackpad's small scrolls move it a little at a time
      const t = h.body.translation()
      const dist = camera.position.distanceTo(_v.set(t.x, t.y, t.z))
      const notch = e.deltaMode === 0 ? Math.min(Math.abs(e.deltaY) / 100, 1.5) : 1
      h.rise -= Math.sign(e.deltaY) * notch * Math.min(80, Math.max(10, dist * 0.03))
    }
    // no browser menu on right-click over the world: the right button turns things (the camera's own
    // guard against it switches off while the hand has paused the camera)
    const noMenu = (e: Event) => e.preventDefault()
    const canvas = gl.domElement
    canvas.addEventListener('contextmenu', noMenu)
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (!(k in KEYS) || typing(e)) return
      if (e.type === 'keydown') keys.current.add(k)
      else keys.current.delete(k)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    window.addEventListener('pointermove', move)
    window.addEventListener('mousedown', buttonDown)
    window.addEventListener('mouseup', buttonUp)
    window.addEventListener('pointerup', allUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('wheel', wheel, { passive: true })
    return () => {
      canvas.removeEventListener('contextmenu', noMenu)
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('mousedown', buttonDown)
      window.removeEventListener('mouseup', buttonUp)
      window.removeEventListener('pointerup', allUp)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('wheel', wheel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, camera, gl])

  useFrame((state, dt) => {
    const dtc = Math.min(dt, 1 / 30)
    // soft landings: once it has settled (or had its time), it's itself again
    if (landing.current.length) {
      landing.current = landing.current.filter((l) => {
        l.t += dtc
        const v = l.body.linvel()
        const done = l.t > LANDING.time || (l.t > 0.25 && Math.hypot(v.x, v.y, v.z) < 15) || l.body.isSleeping() || !l.body.isDynamic()
        if (done) restore(l.body, l.rest)
        return !done
      })
    }

    const h = held.current
    if (!h) return
    if (h.spec.keep && !h.spec.keep()) {
      letGo(h)
      return
    }
    const b = h.body
    raycaster.setFromCamera(state.pointer, camera)
    h.ray.copy(raycaster.ray)
    if (!b.isDynamic()) return
    const t = b.translation()
    // the turning keys, as a spin (rad/s) about the world axes they stand for
    _spin.set(0, 0, 0)
    for (const k of keys.current) {
      const [axis, sign] = KEYS[k]
      if (axis === 'up') _spin.y += sign * SPIN
      // tipping / tilting go round the room's own level axis nearest your view (not the camera's
      // exact one): an item facing a quarter turn then tips over its own edge and lands square
      else if (axis === 'right') _spin.addScaledVector(nearestLevelAxis(_v.setFromMatrixColumn(camera.matrixWorld, 0)), sign * SPIN)
      else _spin.addScaledVector(nearestLevelAxis(camera.getWorldDirection(_v)), sign * SPIN)
    }
    const spin = _spin.lengthSq() > 0

    if (h.turn && spin) {
      if (!h.keyed) armDetents(h)
      keyTurn(h, dtc)
    }
    if (!h.turn) {
      // carrying: the keys turn it (rotation unlocked while they're held, locked again after). It
      // steers to a target angle only the keys move, so a tug from a cable can't tip it meanwhile
      if (spin) {
        const r = b.rotation()
        if (!h.spinning) {
          b.lockRotations(false, true)
          h.spinning = true
          h.qT.set(r.x, r.y, r.z, r.w)
        }
        if (!h.keyed) armDetents(h)
        keyTurn(h, dtc)
        _err.copy(h.qT).multiply(_q.set(r.x, r.y, r.z, r.w).invert())
        if (_err.w < 0) _err.set(-_err.x, -_err.y, -_err.z, -_err.w)
        const s = Math.sqrt(Math.max(1e-9, 1 - _err.w * _err.w))
        const rate = (2 * Math.acos(Math.min(1, _err.w)) * 20) / s
        b.setAngvel({ x: _spin.x + _err.x * rate, y: _spin.y + _err.y * rate, z: _spin.z + _err.z * rate }, true)
      } else if (h.spinning) {
        // keys let go: settle exactly on the angle it was turned to (square, if it had clicked into one)
        b.setRotation({ x: h.qT.x, y: h.qT.y, z: h.qT.z, w: h.qT.w }, true)
        b.setAngvel({ x: 0, y: 0, z: 0 }, true)
        if (!h.spec.free) b.lockRotations(true, true)
        h.spinning = false
      }
    }

    h.keyed = spin

    if (h.turn) {
      // stay put and turn toward qT, both eased, under physics. It rises only as far as the angle
      // needs: its lowest corner (at the angle it's turning to) just clears what it rests on
      const below = groundBelow(t, b, h.spec)
      let y = h.anchor.y
      if (below !== null) {
        let lowest = Infinity
        if (h.spec.lowest) lowest = -h.spec.lowest(h.qT)
        else
          for (const [i, j, k] of CORNERS) {
            _v.set(i ? h.box.max.x : h.box.min.x, j ? h.box.max.y : h.box.min.y, k ? h.box.max.z : h.box.min.z).applyQuaternion(h.qT)
            lowest = Math.min(lowest, _v.y)
          }
        y = Math.max(y, below - lowest + 1)
      }
      const lv = b.linvel()
      const tx = (h.anchor.x - t.x) * 14
      const ty = (y - t.y) * 14
      const tz = (h.anchor.z - t.z) * 14
      b.setLinvel({ x: lv.x + (tx - lv.x) * 0.5, y: lv.y + (ty - lv.y) * 0.5, z: lv.z + (tz - lv.z) * 0.5 }, true)
      const r = b.rotation()
      _err.copy(h.qT).multiply(_q.set(r.x, r.y, r.z, r.w).invert())
      if (_err.w < 0) _err.set(-_err.x, -_err.y, -_err.z, -_err.w)
      const angle = 2 * Math.acos(Math.min(1, _err.w))
      const s = Math.sqrt(Math.max(1e-9, 1 - _err.w * _err.w))
      const rate = Math.min(14, angle * 14) / s
      b.setAngvel({ x: _err.x * rate, y: _err.y * rate, z: _err.z * rate }, true)
    } else {
      // carrying, the pillows' way: a soft spring draws it after the cursor on the plane (rotation locked)
      if (!raycaster.ray.intersectPlane(h.plane, _target)) return
      _target.add(h.off)
      _target.y += h.rise
      const leash = h.spec.leash?.()
      if (leash) {
        const d = _target.sub(leash.from)
        if (d.length() > leash.length) d.setLength(leash.length)
        _target.add(leash.from)
      }
      const r = b.rotation()
      const arm = _v.copy(h.local).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)) // centre -> grabbed point, world
      const ax = t.x + arm.x
      const ay = t.y + arm.y
      const az = t.z + arm.z
      const lv = b.linvel()
      const m = Math.max(h.spec.pull ?? 0, b.mass())
      const md = Math.min(m, 4 * b.mass()) // damping stays gentle on a light body, or it would jitter
      const g = -world.gravity.y * b.gravityScale() // + hold its own weight up
      const { k, c } = h.spec.spring ?? SPRING
      if (h.spec.free && !h.spinning) {
        // loose: pulled at the grabbed point, so it hangs and swings from there
        const av = b.angvel()
        const vx = lv.x + av.y * arm.z - av.z * arm.y
        const vy = lv.y + av.z * arm.x - av.x * arm.z
        const vz = lv.z + av.x * arm.y - av.y * arm.x
        b.applyImpulseAtPoint(
          {
            x: (k * (_target.x - ax) * m - c * vx * md) * dtc,
            y: (k * (_target.y - ay) * m - c * vy * md + g * b.mass()) * dtc,
            z: (k * (_target.z - az) * m - c * vz * md) * dtc,
          },
          { x: ax, y: ay, z: az },
          true,
        )
      } else {
        // through its centre: it's held, not swung (an off-centre pull would twist it while the keys turn it)
        b.applyImpulse(
          {
            x: (k * (_target.x - ax) * m - c * lv.x * md) * dtc,
            y: (k * (_target.y - ay) * m - c * lv.y * md + g * b.mass()) * dtc,
            z: (k * (_target.z - az) * m - c * lv.z * md) * dtc,
          },
          true,
        )
      }
    }

  })

  // presses come from the items themselves (grabbable), not a wrapper round the whole scene
  useEffect(() => {
    press = (e, spec) => {
      if (worldInput.locked) return // (the laptop's screen has the pointer)
      if (!grabRules.allow(spec)) return // (the page says not now: on the Quad, while the camera's in close)
      // left carries, right turns; the middle button is the camera's
      const button = e.nativeEvent.button
      if (button !== 0 && button !== 2) return
      if (button === 2 && spec.turn === false) return
      e.stopPropagation()
      pending.current = { spec, root: e.eventObject, object: e.object, point: e.point.clone(), x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, button, moved: 0 }
    }
    return () => {
      press = null
    }
  }, [])
  return (
    <>
      {children}
    </>
  )
}
