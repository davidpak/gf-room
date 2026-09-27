import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, InstancedBufferAttribute, CatmullRomCurve3, Color, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, SphereGeometry, TubeGeometry, Vector3, type InstancedMesh, type Mesh, type PointLight } from 'three'
import { cozy, useCozy } from './cozy'
import { ROOM } from './spec'
import { PAL } from '../../lib/palette'

/**
 * Rina's string lights (public/reference/room-desk-night.jpg, room-desk-window-bed-night.png):
 * warm white mini bulbs on a white wire, running down the left edge of the window to the desk,
 * across the top of the window (sagging a little between clips), and along the top of the east
 * wall. Plugged into the outlet in the lamp's base.
 *
 *   click  on / off. On, the bulbs bloom, each throws a small warm glow on the wall behind it
 *          (the scalloped glow in the photos), and three soft warm washes spill into the room.
 *
 * Also the cords: the string's plug cord to the lamp base, and the lamp's own cord down behind the
 * desk to the wall outlet under the table. Both follow the lamp as the desk rises and falls.
 * Room frame, millimetres.
 */
const Z = -ROOM.d / 2 + 14 // on the north wall
const XE = ROOM.w / 2 - 14 // on the east wall
const Y = 2465 // just under the ceiling
const X0 = ROOM.window.x0 - 45 // down the window's left edge
const START_Y = 860 // the string's end, down by the desk: its plug cord hangs from here
const OUTLET = new Vector3(-700, 300, -ROOM.d / 2 + 8) // under the table (./Shell.tsx)
const BULB_ON = new Color(PAL.fairy)
const BULB_OFF = new Color('#cfc8b8')
const HALO = new Color('#ffa55c')

/** A soft round glow, bright in the middle and fading to nothing (for the wall glows). */
let haloTex: CanvasTexture | null = null
function haloTexture() {
  if (haloTex) return haloTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  r.addColorStop(0.6, 'rgba(255,255,255,0.14)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  haloTex = new CanvasTexture(c)
  return haloTex
}

/** The string's route: taped down the window edge, then clipped along the walls with small sags. */
function route() {
  const pts: Vector3[] = []
  for (let y = START_Y, k = 0; y < Y; y += 260, k++) pts.push(new Vector3(X0 + (k % 2 ? 6 : -6), y, Z))
  pts.push(new Vector3(X0, Y, Z))
  const sagRun = (a: Vector3, b: Vector3, clips: number) => {
    for (let i = 1; i <= clips; i++) {
      const p0 = a.clone().lerp(b, (i - 0.5) / clips)
      p0.y -= 38 // sag between clips
      pts.push(p0, a.clone().lerp(b, i / clips))
    }
  }
  const corner = new Vector3(XE - 30, Y, Z)
  sagRun(new Vector3(X0, Y, Z), corner, 5)
  sagRun(new Vector3(XE, Y, Z + 30), new Vector3(XE, Y, 450), 6)
  return new CatmullRomCurve3(pts, false, 'centripetal')
}

export function StringLights() {
  const on = useCozy().strings
  const glow = useRef({ x: on ? 1 : 0 })
  const bulbs = useRef<InstancedMesh>(null)
  const halos = useRef<InstancedMesh>(null)
  const lights = useRef<(PointLight | null)[]>([])
  const { wire, count, spots, hit, points } = useMemo(() => {
    const curve = route()
    const len = curve.getLength()
    const n = Math.floor(len / 100)
    const spots = [0.12, 0.45, 0.8].map((t) => curve.getPointAt(t))
    return {
      wire: new TubeGeometry(curve, Math.ceil(len / 15), 1.3, 5, false),
      hit: new TubeGeometry(curve, Math.ceil(len / 40), 22, 6, false), // an easy-to-click sleeve
      count: n,
      spots,
      points: Array.from({ length: n }, (_, i) => curve.getPointAt((i + 0.5) / n)),
    }
  }, [])
  const mat = useMemo(
    () => ({
      wire: new MeshLambertMaterial({ color: '#ebe6db' }),
      bulb: new MeshBasicMaterial({ color: BULB_ON, toneMapped: false }),
      hit: new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      bulbGeo: new SphereGeometry(6.5, 10, 8),
      halo: new MeshBasicMaterial({
        map: haloTexture(),
        color: HALO,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      haloGeo: new PlaneGeometry(1, 1),
    }),
    [],
  )
  useLayoutEffect(() => {
    const m = bulbs.current
    if (!m) return
    const o = new Object3D()
    points.forEach((p, i) => {
      o.position.copy(p)
      o.position.y -= 7 // each bulb hangs just below the wire
      o.position.z += p.z < 0 && Math.abs(p.z - Z) < 1 ? 6 : 0
      o.position.x -= Math.abs(p.x - XE) < 1 ? 6 : 0
      o.scale.set(1, 1.5, 1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    // the glows: flat on the wall behind each bulb, a little below it (light falls down the wall)
    const hm = halos.current
    if (hm) {
      points.forEach((p, i) => {
        const east = Math.abs(p.x - XE) < 1
        o.position.set(east ? ROOM.w / 2 - 3 : p.x, p.y - 30, east ? p.z : -ROOM.d / 2 + 3)
        o.rotation.set(0, east ? -Math.PI / 2 : 0, 0)
        const s = 400 + ((i * 37) % 5) * 18 // a little uneven, like real bulbs
        o.scale.set(s, s * 1.15, 1)
        o.updateMatrix()
        hm.setMatrixAt(i, o.matrix)
      })
      hm.instanceMatrix.needsUpdate = true
      hm.computeBoundingSphere()
    }
  }, [points])

  // each bulb twinkles faintly on its own slow rhythm (a per-instance brightness)
  const twinkle = useMemo(() => {
    const a = new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3)
    const phase = Float32Array.from({ length: count }, (_, i) => (i * 2.399) % (Math.PI * 2))
    const rate = Float32Array.from({ length: count }, (_, i) => 0.6 + ((i * 7919) % 100) / 100)
    return { a, phase, rate, t: 0, acc: 0 }
  }, [count])
  useLayoutEffect(() => {
    if (bulbs.current) bulbs.current.instanceColor = twinkle.a
  }, [twinkle])

  useFrame((_, dt) => {
    const g = glow.current
    g.x += ((on ? 1 : 0) - g.x) * (1 - Math.exp(-dt * 12))
    mat.bulb.color.copy(BULB_OFF).lerp(BULB_ON, g.x).multiplyScalar(0.7 + 3.6 * g.x) // well above white: they bloom
    // twinkle (updated at ~20 Hz: slow enough to be gentle, cheap)
    twinkle.t += dt
    twinkle.acc += dt
    if (twinkle.acc > 0.05 && g.x > 0.01) {
      twinkle.acc = 0
      const arr = twinkle.a.array as Float32Array
      for (let i = 0; i < count; i++) {
        const s = Math.sin(twinkle.t * twinkle.rate[i] + twinkle.phase[i])
        const v = 0.78 + 0.22 * s * s * s // mostly steady, now and then a soft dip or swell
        arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = v
      }
      twinkle.a.needsUpdate = true
    }
    mat.halo.opacity = 1.0 * g.x
    mat.halo.visible = g.x > 0.01
    lights.current.forEach((l) => {
      if (l) l.intensity = 24000 * g.x // decay 1.5: a soft local wash
    })
  })

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    cozy.toggle('strings')
  }
  const hover = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => (document.body.style.cursor = 'auto'),
  }
  return (
    <group>
      <mesh geometry={wire} material={mat.wire} castShadow />
      <instancedMesh ref={bulbs} args={[mat.bulbGeo, mat.bulb, count]} userData={{ bakeFairy: true }} />
      <instancedMesh ref={halos} args={[mat.haloGeo, mat.halo, count]} renderOrder={2} />
      <mesh geometry={hit} material={mat.hit} onClick={click} {...hover} />
      {spots.map((p, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lights.current[i] = l
          }}
          // down and out from the wall, so they warm the room rather than burn a spot on the ceiling
          position={[p.x + (Math.abs(p.x - XE) < 50 ? -320 : 0), p.y - 420, p.z + (Math.abs(p.z - Z) < 50 ? 320 : 0)]}
          color="#ffc585"
          decay={1.5}
          distance={0}
        />
      ))}
      {/* the string's plug cord, hanging to the outlet in the lamp's base */}
      <Cord points={(plug) => [new Vector3(X0, START_Y, Z), new Vector3(X0 - 20, START_Y - 90, Z + 20), plug]} />
      {/* the lamp's cord: over the back of the desk, down behind it, to the wall outlet under the table */}
      <Cord
        points={(plug) => [
          plug,
          new Vector3(plug.x - 20, plug.y - 8, Z + 24),
          new Vector3(plug.x - 60, plug.y * 0.5, Z + 18),
          new Vector3(plug.x - 120, 12, Z + 16),
          new Vector3(OUTLET.x + 60, 14, Z + 14),
          new Vector3(OUTLET.x, OUTLET.y - 30, OUTLET.z + 10),
        ]}
      />
    </group>
  )
}

/** A cord whose points depend on where the lamp's plug is; rebuilt only when the lamp moves. */
function Cord({ points }: { points: (plug: Vector3) => Vector3[] }) {
  const mesh = useRef<Mesh>(null)
  const last = useRef(new Vector3(1e9, 0, 0))
  const mat = useMemo(() => new MeshLambertMaterial({ color: '#efebe2' }), [])
  useFrame(() => {
    const p = cozy.plug.position
    if (!mesh.current || p.lengthSq() === 0 || p.distanceToSquared(last.current) < 4) return
    last.current.copy(p)
    mesh.current.geometry.dispose()
    mesh.current.geometry = new TubeGeometry(new CatmullRomCurve3(points(p.clone()), false, 'centripetal'), 64, 2, 6, false)
  })
  return <mesh ref={mesh} material={mat} castShadow />
}
