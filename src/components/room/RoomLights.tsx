import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CatmullRomCurve3, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import { LIGHT, ROOM } from './spec'

/**
 * The room's light at the end of the day (./spec LIGHT): warm, the lamp (./Lamp) the brightest thing, as in her night
 * photos. A dusky rose-lilac shade from above and a warm apricot bounce from below fill the dark; a soft warm light
 * from above gives everything its contact shadows; the sun going down outside comes in through the blinds in coral
 * stripes; and a strand of warm fairy lights runs up the window's left edge, across its top and on along the top of
 * the wall over her bed.
 */
const L = LIGHT
const { w, d } = ROOM
const W = ROOM.window

export function RoomLights() {
  return (
    <>
      <color attach="background" args={[L.dark]} />
      <hemisphereLight args={[L.shade.sky, L.shade.ground, L.shade.k]} />
      {/* the room's own warm light, soft from above: the shadows that set things down */}
      <directionalLight
        castShadow
        position={[-900, 3200, 1400]}
        intensity={L.warm.k}
        color={L.warm.color}
        shadow-mapSize={[4096, 4096]}
        shadow-radius={8}
        shadow-bias={-0.00008}
        shadow-normalBias={0.5}
        shadow-camera-left={-w / 2 - 200}
        shadow-camera-right={w / 2 + 200}
        shadow-camera-top={d / 2 + 200}
        shadow-camera-bottom={-d / 2 - 200}
        shadow-camera-near={10}
        shadow-camera-far={8000}
      />
      <Sunset />
      <StringLights />
    </>
  )
}

/** the sun going down: low, from outside the window (the north wall shades the rest: only the window lets it in, the
 *  blinds' slats striping it) */
function Sunset() {
  const { pos, target } = useMemo(() => {
    const dir = new Vector3(...L.sunset.dir).normalize()
    const target = new Object3D()
    target.position.set((W.x0 + W.x1) / 2 + 300, 500, -d / 2 + 900)
    return { pos: target.position.clone().addScaledVector(dir, -5000), target }
  }, [])
  return (
    <>
      <primitive object={target} />
      <directionalLight
        castShadow
        position={pos}
        target={target}
        intensity={L.sunset.k}
        color={L.sunset.color}
        shadow-mapSize={[2048, 2048]}
        shadow-radius={3}
        shadow-bias={-0.0002}
        shadow-normalBias={1}
        shadow-camera-left={-2600}
        shadow-camera-right={2600}
        shadow-camera-top={2600}
        shadow-camera-bottom={-2600}
        shadow-camera-near={100}
        shadow-camera-far={10000}
      />
    </>
  )
}

/** the fairy lights: a white wire up the window's left edge, across its top, into the corner and along the top of the
 *  wall over her bed, its end drooping; sagging a little between its hooks, a warm bulb every few cm (instanced, above
 *  white: they bloom), and a few real lights along it */
function StringLights() {
  const S = L.strings
  const z = -d / 2 + 6 // (on the north wall's face)
  const ex = w / 2 - 6 // (on the east wall's)
  const { tube, bulbs, lights } = useMemo(() => {
    // its hooks: up the left edge, across the top, into the corner, along the east wall, its end hanging lower
    const left = W.x0 - S.off
    const top = W.head + S.over
    const hooks: Vector3[] = []
    for (let y = W.sill + 150; y < top; y += S.hooks) hooks.push(new Vector3(left, y, z))
    for (let x = left; x < ex - 40; x += S.hooks) hooks.push(new Vector3(x, top, z))
    hooks.push(new Vector3(ex, top, z + 30))
    for (let k = S.hooks; k < S.bed.run; k += S.hooks) hooks.push(new Vector3(ex, top, z + k))
    hooks.push(new Vector3(ex, top - S.bed.droop, z + S.bed.run))
    // (which way is off the wall, there)
    const off = (p: Vector3) => (p.x > ex - 60 ? new Vector3(-1, 0, 0) : new Vector3(0, 0, 1))
    // between hooks it hangs: up the side it bows out from the wall a touch; across the top it sags
    const pts: Vector3[] = []
    for (let i = 0; i < hooks.length - 1; i++) {
      const a = hooks[i]
      const b = hooks[i + 1]
      const across = Math.abs(b.y - a.y) < 1
      for (let k = 0; k < 6; k++) {
        const t = k / 6
        const p = a.clone().lerp(b, t)
        const s = Math.sin(Math.PI * t)
        if (across) p.y -= S.sag * s
        else if (p.x < ex - 60) p.x -= S.sag * 0.4 * s
        p.addScaledVector(off(p), 8 * s)
        pts.push(p)
      }
    }
    pts.push(hooks[hooks.length - 1].clone())
    const curve = new CatmullRomCurve3(pts)
    const len = curve.getLength()
    const n = Math.floor(len / S.bulb.every)
    const at = Array.from({ length: n }, (_, i) => curve.getPointAt((i + 0.5) / n))
    const lights = Array.from({ length: S.lights }, (_, i) => curve.getPointAt((i + 0.5) / S.lights).add(new Vector3(0, -30, 60)))
    return { tube: new TubeGeometry(curve, Math.ceil(len / 25), S.wire, 5, false), bulbs: at.map((p) => ({ p, out: off(p) })), lights: lights.map((p, i) => (p.x > ex - 60 ? curve.getPointAt((i + 0.5) / S.lights).add(new Vector3(-60, -30, 0)) : p)) }
  }, [S, z, ex])
  const mats = useMemo(
    () => ({
      wire: new MeshStandardMaterial({ color: '#e8e2d6', roughness: 0.7 }),
      // (unlit, above white: a warm bead of light that blooms)
      bulb: new MeshBasicMaterial({ color: new Color(S.color).multiplyScalar(S.glow), toneMapped: false }),
      geo: new SphereGeometry(1, 10, 8).scale(S.bulb.r, S.bulb.len / 2, S.bulb.r),
    }),
    [S],
  )
  const inst = useMemo(() => {
    const m = new InstancedMesh(mats.geo, mats.bulb, bulbs.length)
    const o = new Object3D()
    bulbs.forEach(({ p, out }, i) => {
      // (each hangs off the wire at its own little angle)
      o.position.copy(p).add(new Vector3(0, -4, 0)).addScaledVector(out, 4)
      o.rotation.set(0.3 + Math.sin(i * 2.3) * 0.4, 0, Math.sin(i * 1.7) * 0.5)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    return m
  }, [bulbs, mats])
  // (steady, as fairy lights are: just the faintest shimmer, as a filament does)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    mats.bulb.color.set(S.color).multiplyScalar(S.glow * (0.97 + 0.03 * Math.sin(t * 1.3)))
  })
  return (
    <group>
      <mesh geometry={tube} material={mats.wire} />
      <primitive object={inst} />
      {lights.map((p, i) => (
        <pointLight key={i} position={p} color={S.color} intensity={S.k} decay={1} distance={S.reach} />
      ))}
    </group>
  )
}
