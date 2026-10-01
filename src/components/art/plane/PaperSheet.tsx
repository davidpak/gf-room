import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BallCollider, CuboidCollider, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { Group, Quaternion, Vector3 } from 'three'
import { Holdable } from '../../../lib/physics/Holdable'
import { crumpleSound, foldSound } from '../../../lib/sound/paper'
import { crease, fold, now, sheet, type Facet } from './fold'
import { BALL, ballGeometry, build, dashes, dist, FOLDS, H, KEEL, LAYER, LINE, LINE_ON, paperMat, W, type Bend, type Fold } from './paper'

/**
 * A sheet of paper, a thing like any other (../../../lib/physics/Holdable: carry it, turn it, put it down, knock it
 * about), that folds into a dart (./paper, ./fold) and flies.
 *
 *   folding    hover it and its folds show, dashed; hover one and it lights, click (a click, not a drag) and the paper
 *              swings over along it, wherever it's lying. The dart's order matters: a fold before its time and the
 *              sheet's crumpled into a ball. Its body changes with it: a sheet (thin, the size of what's folded), a
 *              plane (a slab of wing, a keel under it), a ball
 *   in the air let go of it moving and the air has it:
 *                a plane   lift on the square of its speed along its own up (capped), drag for a 5:1 glide; it turns its
 *                          nose into the wind and rolls its wings level, so however it's let go it straightens out and
 *                          flies nose first, wings up
 *                a sheet   flat-plate drag across its face (it floats down, drifting), a flutter
 *                a ball    a little drag
 *
 * `k` scales it (the Quad's toy scale); its frame: the paper's own (x across, y up, -z its nose).
 *
 * `zoom` (the Quad, where it's a toy and too small to fold from the car): a click on it takes the camera down onto it
 * (`open`), and only then do its folds show and take clicks; picked up, or done (a dart, a ball), the camera's let go
 * (`close`).
 */
type Zoom = { on: boolean; open: () => void; close: () => void }
const _v = new Vector3()
const _f = new Vector3()
const _u = new Vector3()
const _w = new Vector3()
const _q = new Quaternion()
const UP = new Vector3(0, 1, 0)

export function PaperSheet({ at, rot = 0, color, k = 1, reset = 0, zoom, bodyRef }: { at: [number, number, number]; rot?: number; color: string; k?: number; /** changed: it's laid back out where it started, flat (the same body: never one the hand might be holding swapped out) */ reset?: number; zoom?: Zoom; bodyRef?: RefObject<RapierRigidBody | null> }) {
  const own = useRef<RapierRigidBody>(null)
  const body = bodyRef ?? own
  const inner = useRef<Group>(null)
  const { world } = useRapier()
  const mat = paperMat(color)
  // the paper: its facets, what's folded, the bends after the flat folds
  const st = useRef({ facets: sheet(W, H), done: [] as number[], bend: null as Bend | null })
  const anim = useRef<null | { f: Fold; t: number; moving?: Facet[]; stayed?: Facet[]; next?: Facet[]; axis?: { p: Vector3; k: Vector3 } }>(null)
  const crumple = useRef(0)
  const held = useRef(false)
  const [geo, setGeo] = useState(() => build(st.current.facets, null))
  // laid back out, flat, where it started
  useEffect(() => {
    if (!reset) return
    st.current = { facets: sheet(W, H), done: [], bend: null }
    anim.current = null
    crumple.current = 0
    setGeo(build(st.current.facets, null))
    const b = body.current
    if (!b) return
    b.setTranslation({ x: at[0], y: at[1], z: at[2] }, true)
    _q.setFromAxisAngle(UP, rot)
    b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: 0 }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset])
  const [hover, setHover] = useState<number | null>(null)
  const [near, setNear] = useState(false) // (the pointer's over it: its folds show)
  const [, redraw] = useState(0)
  const done = st.current.done
  if (import.meta.env.DEV) ((window as unknown as { __paper: Record<string, unknown> }).__paper ??= {})[color] = { body, inner, st } // (for trying it from the console)
  const kind: 'sheet' | 'plane' | 'ball' = crumple.current >= 1 ? 'ball' : done.length === FOLDS.length ? 'plane' : 'sheet'
  const folding = zoom ? zoom.on : true // (its folds show and take clicks)
  // done (a dart, a ball) while looked at: a beat to see it, then the camera's let go
  const zoomed = !!zoom?.on
  const close = useRef(zoom?.close)
  close.current = zoom?.close
  useEffect(() => {
    if (!zoomed || kind === 'sheet') return
    const t = setTimeout(() => close.current?.(), 900)
    return () => clearTimeout(t)
  }, [zoomed, kind])

  const left = FOLDS.filter((f) => !done.includes(f.id))
  const ready = (f: Fold) => f.needs.every((n) => done.includes(n))
  const topRank = () => new Set(st.current.facets.map((f) => f.layer)).size

  const doFold = (f: Fold) => {
    if (anim.current || crumple.current) return
    if (!ready(f)) {
      crumple.current = 0.001
      crumpleSound()
      return
    }
    foldSound()
    const s = st.current
    if (f.flat) {
      const r = fold(s.facets, f.flat)
      // its axis (the fold line, on top of everything), turned so the moving side lifts up and over
      const h = 0.6 + topRank() * LAYER
      const p = new Vector3(f.flat.p[0], h, -f.flat.p[1])
      const ax = new Vector3(f.flat.d[0], 0, -f.flat.d[1]).normalize()
      const probe = new Vector3(f.flat.p[0] - f.flat.d[1], h, -(f.flat.p[1] + f.flat.d[0]))
      if (probe.clone().sub(p).applyAxisAngle(ax, 0.2).add(p).y < h) ax.negate()
      anim.current = { f, t: 0, moving: r.moved, stayed: r.stayed, next: r.facets, axis: { p, k: ax } }
    } else {
      if (!s.bend) {
        // (creased where it'll bend: down the middle, and where each wing meets the keel)
        let fs = s.facets
        for (const x of [0, -KEEL, KEEL]) fs = crease(fs, { p: [x, 0], d: [0, 1] })
        s.facets = fs
        s.bend = { a: 0, bL: 0, bR: 0 }
      }
      anim.current = { f, t: 0 }
    }
  }

  // folding, crumpling
  useFrame((_, dt) => {
    const s = st.current
    const a = anim.current
    if (a) {
      a.t = Math.min(1, a.t + dt * (a.f.flat ? 1.9 : 1.6))
      const e = a.t * a.t * (3 - 2 * a.t)
      if (a.f.flat && a.moving && a.axis) {
        setGeo(build(a.stayed!, s.bend, { facets: a.moving, axis: a.axis, th: e * Math.PI }))
        if (a.t >= 1) {
          s.facets = a.next!
          s.done = [...s.done, a.f.id]
          anim.current = null
          setGeo(build(s.facets, s.bend))
        }
      } else if (a.f.bend && s.bend) {
        s.bend[a.f.bend] = e
        setGeo(build(s.facets, s.bend))
        if (a.t >= 1) {
          s.done = [...s.done, a.f.id]
          anim.current = null
          redraw((n) => n + 1)
        }
      }
    }
    if (crumple.current > 0 && crumple.current < 1) {
      crumple.current = Math.min(1, crumple.current + dt * 2.6)
      redraw((n) => n + 1)
    }
  })

  // the air
  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b || held.current || anim.current || !b.isDynamic() || b.isSleeping()) return
    const lv = b.linvel()
    const v = _v.set(lv.x, lv.y, lv.z)
    const s = v.length()
    if (s < 40 * k) return
    const dt = world.timestep
    const G = -world.gravity.y
    const m = b.mass()
    const r = b.rotation()
    _q.set(r.x, r.y, r.z, r.w)
    const up = _u.set(0, 1, 0).applyQuaternion(_q)
    const imp = _w.set(0, 0, 0)
    // touching something (down on the ground, against a trunk): the air lets go, and it scuffs to a stop
    let touching = false
    for (let i = 0; i < b.numColliders() && !touching; i++) {
      const c = b.collider(i)
      world.contactPairsWith(c, (o) => {
        if (!touching && o.parent()?.handle !== b.handle) world.contactPair(c, o, (m) => void (touching ||= m.numContacts() > 0))
      })
    }
    if (touching) {
      imp.set(v.x, 0, v.z).multiplyScalar(-Math.min(1, 5 * dt) * m)
      b.applyImpulse({ x: imp.x, y: imp.y, z: imp.z }, true)
      return
    }
    if (kind === 'plane') {
      const vt = 2300 * Math.sqrt(k) // (the speed it glides at: lift equal to its weight)
      const cl = G / (vt * vt)
      const nose = _f.set(0, 0, -1).applyQuaternion(_q)
      const vh = v.clone().divideScalar(s)
      // lift: along its own up, square to the flight, only going nose first
      const lift = up.clone().addScaledVector(vh, -up.dot(vh))
      // (less of it while it's rolled over: it's righting itself, not driven into the ground)
      const level = Math.max(0.15, (up.y + 1) / 2)
      if (lift.lengthSq() > 1e-6) imp.addScaledVector(lift.normalize(), Math.min(1.5 * G, cl * s * s) * Math.max(0, nose.dot(vh)) * level * m * dt)
      imp.addScaledVector(v, -(cl / 5) * s * m * dt)
      // its nose turned into the wind, its wings rolled level (faster, the faster it goes)
      const av = b.angvel()
      const pace = Math.min(1.5, s / vt)
      const want = new Vector3().crossVectors(nose, vh).multiplyScalar(6 * pace)
      // (by how far it's rolled from wings level, all the way round: upside down it's rolled hardest, not left balanced)
      const roll = Math.atan2(new Vector3().crossVectors(up, UP).dot(nose), up.dot(UP))
      want.addScaledVector(nose, roll * 3.5 * pace)
      const blend = Math.min(1, dt * 8)
      b.setAngvel({ x: av.x + (want.x - av.x) * blend, y: av.y + (want.y - av.y) * blend, z: av.z + (want.z - av.z) * blend }, true)
    } else if (kind === 'sheet') {
      // a flat plate: drag across its face (it floats down), a little along it; a flutter
      const vn = v.dot(up)
      const cn = G / (500 * 500 * k)
      imp.addScaledVector(up, -cn * vn * Math.abs(vn) * m * dt)
      imp.addScaledVector(v.clone().addScaledVector(up, -vn), -0.0008 * s * m * dt)
      if (Math.random() < dt * 4) {
        const av = b.angvel()
        const kick = Math.min(1, s / 800) * 1.5
        b.setAngvel({ x: av.x + (Math.random() - 0.5) * kick, y: av.y, z: av.z + (Math.random() - 0.5) * kick }, true)
      }
    } else imp.addScaledVector(v, -0.0004 * s * m * dt)
    b.applyImpulse({ x: imp.x, y: imp.y, z: imp.z }, true)
  })

  // hovering and clicking it
  const local = (e: ThreeEvent<PointerEvent | MouseEvent>) => inner.current!.worldToLocal(e.point.clone())
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!near) setNear(true)
    if (!folding) {
      document.body.style.cursor = 'pointer'
      return
    }
    if (kind !== 'sheet' || anim.current || held.current) return
    const p = local(e)
    let f: Fold | null = null
    if (st.current.bend) f = left.find((l) => l.bend === (p.x < 0 ? 'bL' : 'bR')) ?? null
    else {
      let bd = 22
      for (const l of left) {
        const d = dist([p.x, -p.z], l.seg)
        if (d < bd) {
          bd = d
          f = l
        }
      }
    }
    const id = f?.id ?? null
    if (id !== hover) setHover(id)
    document.body.style.cursor = id ? 'pointer' : ''
  }
  const out = () => {
    setNear(false)
    setHover(null)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (zoom && !zoom.on) {
      if (held.current) return
      e.stopPropagation()
      zoom.open()
      return
    }
    if (kind !== 'sheet' || hover == null || held.current) return
    const b = body.current
    if (b) {
      const v = b.linvel()
      if (Math.hypot(v.x, v.y, v.z) > 120 * k) return // (not while it's moving)
    }
    e.stopPropagation()
    const f = FOLDS.find((x) => x.id === hover)
    if (f) doFold(f)
    setHover(null)
  }

  const lines = useMemo(() => {
    if (kind !== 'sheet' || !(zoom ? zoom.on : near) || anim.current) return []
    const rank = topRank()
    return left.map((f) => ({ id: f.id, geo: dashes(f.seg, rank, st.current.bend, f.id === hover ? 1.4 : 0.8) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, near, hover, geo, left.length, zoom?.on])
  const ball = useMemo(ballGeometry, [])

  // its body, as it is now
  const colliders = useMemo(() => {
    if (kind === 'ball') return <BallCollider key="ball" args={[BALL * 0.85 * k]} position={[0, BALL * k, 0]} mass={0.01} friction={0.8} />
    if (kind === 'plane')
      return (
        <>
          <CuboidCollider key="wing" args={[(W / 2 - KEEL) * k, 1.5 * k, (H / 2 - 5) * k]} position={[0, (KEEL + 1.5) * k, 0]} mass={0.006} friction={0.6} />
          <CuboidCollider key="keel" args={[3 * k, (KEEL / 2) * k, (H / 2 - 20) * k]} position={[0, (KEEL / 2) * k, 0]} mass={0.004} friction={0.6} />
        </>
      )
    if (st.current.bend) return <CuboidCollider key="bent" args={[12 * k, (W / 4) * k, (H / 2) * k]} position={[0, (W / 4) * k, 0]} mass={0.01} friction={0.8} /> // (folded in half: its halves standing up off the crease)
    // a sheet: the size of what's folded, its layers' thickness
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const f of st.current.facets)
      for (const [x, y] of now(f)) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
    const t = 1 + topRank() * LAYER
    return <CuboidCollider key={`sheet${done.length}`} args={[((x1 - x0) / 2) * k, (t / 2) * k, ((y1 - y0) / 2) * k]} position={[((x0 + x1) / 2) * k, (t / 2) * k, (-(y0 + y1) / 2) * k]} mass={0.01} friction={0.9} />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, done.length, k, !!st.current.bend])

  const c = crumple.current
  return (
    <Holdable
      bodyRef={body}
      position={at}
      rotation={[0, rot, 0]}
      colliders={false}
      ccd
      linearDamping={0}
      angularDamping={0.6}
      sound="none"
      hold={{
        lift: 40 * k,
        onGrab: () => {
          held.current = true
          out()
          if (zoom?.on) zoom.close() // (picked up: back to the car's view, to carry it and throw it from there)
        },
        onRelease: (b) => {
          held.current = false
          // (thrown: the air has it, not the hand's soft landing; a loose sheet keeps the landing, it floats anyway)
          if (kind !== 'sheet') {
            b.setGravityScale(1, true)
            b.setLinearDamping(0)
            b.setAngularDamping(0.6)
          }
        },
      }}
    >
      <group ref={inner} scale={k}>
        {c < 1 && (
          <group scale={1 - c * 0.85} rotation={[c * 1.3, c * 2, c * 0.7]}>
            <mesh geometry={geo} material={mat} castShadow onPointerMove={over} onPointerOut={out} onClick={click} />
            {lines.map((l) => (
              <mesh key={l.id} geometry={l.geo} material={l.id === hover ? LINE_ON : LINE} />
            ))}
          </group>
        )}
        {c > 0 && <mesh geometry={ball} material={mat} scale={Math.max(0.05, c)} position={[0, BALL * c, 0]} castShadow receiveShadow />}
      </group>
      {colliders}
    </Holdable>
  )
}
