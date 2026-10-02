import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, Float32BufferAttribute, Matrix4, MeshBasicMaterial, PointsMaterial, SRGBColorSpace, SphereGeometry, TubeGeometry, Vector3, type DirectionalLight, type Fog, type Group, type InstancedMesh } from 'three'
import { bruno, shared } from './bruno'
import { treeFrame } from './CherryTree'
import { DARK } from './CookieStand'
import { applyDay, clock, dayAt, now } from './daylight'
import { SET } from './set'

/**
 * The Quad's day going round (./daylight), and what lights it up at night:
 *
 *   DayCycle      the clock; each frame the day's light into the shared look, the sun's colour, the fog, the sky
 *                 (its gradient redrawn a few times a second, 4 × 256: nothing to it)
 *   TreeLights    warm fairy lights in every cherry: wound up its trunk, swagged round under its blossom; one draw
 *                 for all of them, their glow another (halos, one draw), a warm pool of light under each at night
 *   StringLights  a canopy's: a wire swagged along its eaves, a bulb every hand's breadth, their halos
 *   Sky           the stars and the moon, at night
 *
 * The halos are additive points (one draw a set, no post-processing): bulbs glow without bloom.
 */

// ---- the glow round a bulb: a soft round spot, added
function haloTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,214,150,0.9)')
  grad.addColorStop(0.25, 'rgba(255,190,120,0.45)')
  grad.addColorStop(1, 'rgba(255,170,110,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const HALO_TEX = typeof document !== 'undefined' ? haloTexture() : null
/** halos: one material for every set of them (so the night turns them all up at once) */
const haloMats: PointsMaterial[] = []
function haloMaterial(size: number) {
  const m = new PointsMaterial({ map: HALO_TEX, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0, fog: false })
  m.visible = false
  haloMats.push(m)
  return m
}
function Halos({ at, size }: { at: Vector3[]; size: number }) {
  const geo = useMemo(() => new BufferGeometry().setAttribute('position', new Float32BufferAttribute(at.flatMap((p) => [p.x, p.y, p.z]), 3)), [at])
  const mat = useMemo(() => haloMaterial(size), [size])
  useEffect(
    () => () => {
      geo.dispose()
      haloMats.splice(haloMats.indexOf(mat), 1)
    },
    [geo, mat],
  )
  return <points geometry={geo} material={mat} frustumCulled={false} />
}

// ---- the cherries' fairy lights
const TREE_BULB = new SphereGeometry(7, 8, 6)
const TREE_MAT = new MeshBasicMaterial({ color: '#ffffff' })
const DAY_BULB = new Color('#cfc6b8')
const NIGHT_BULB = new Color('#ffd796')
const TINTS = ['#ffffff', '#ffffff', '#ffffff', '#ffe2b0', '#ffc6d6'].map((c) => new Color(c))
/** each tree's bulbs (world), and the middle of them (for its pool of light) */
function treeBulbs() {
  const all: Vector3[] = []
  const pools: Vector3[] = []
  const m = new Matrix4()
  SET.trees.forEach((t) => {
    const f = treeFrame(t.model)
    m.makeRotationY(t.rot).scale(new Vector3(t.scale, t.scale, t.scale)).setPosition(t.x, 0, t.z)
    const add = (p: Vector3) => all.push(p.applyMatrix4(m))
    // wound up the trunk: five turns from knee height to where it splits, following its lean
    const turns = 5
    const n = 30
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1)
      const y = 80 + u * (f.top.y - 110)
      const a = u * turns * Math.PI * 2
      const r = 100 - 20 * u + 10
      add(new Vector3(f.lean.x * y + Math.cos(a) * r, y, f.lean.z * y + Math.sin(a) * r))
    }
    // swagged round under the blossom's edge: eight swags of six
    const R = 600 * f.w
    const y0 = f.top.y + 50 * f.tall
    for (let k = 0; k < 8; k++)
      for (let j = 0; j < 6; j++) {
        const u = (k + j / 6) / 8
        const w = j / 6
        const a = u * Math.PI * 2
        add(new Vector3(f.top.x + Math.cos(a) * R, y0 - 70 * 4 * w * (1 - w), f.top.z + Math.sin(a) * R))
      }
    pools.push(new Vector3(f.top.x, f.top.y * 0.6, f.top.z).applyMatrix4(m))
  })
  return { all, pools }
}
export function TreeLights() {
  const { all, pools } = useMemo(treeBulbs, [])
  const mesh = useRef<InstancedMesh>(null)
  useEffect(() => {
    const im = mesh.current
    if (!im) return
    const mm = new Matrix4()
    all.forEach((p, i) => {
      im.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z))
      im.setColorAt(i, TINTS[i % TINTS.length])
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
  }, [all])
  // (their pools of light: the lamp slots after the posts')
  useEffect(() => {
    pools.forEach((p, i) => shared.lamps.value[4 + i]?.set(p.x, p.y, p.z, 0))
    return () => pools.forEach((_, i) => shared.lamps.value[4 + i]?.set(1e9, 0, 0, 0))
  }, [pools])
  return (
    <>
      <instancedMesh ref={mesh} args={[TREE_BULB, TREE_MAT, all.length]} />
      <Halos at={all} size={46} />
    </>
  )
}

// ---- a canopy's string lights (its own frame, real mm: the stands are drawn at the toy scale round them)
const BULBS = [
  bruno({ color: '#fff3cf', emissive: '#ffcf7a', emissiveIntensity: 1.3, warm: 0 }),
  bruno({ color: '#ffe0ea', emissive: '#ffb3c8', emissiveIntensity: 1.2, warm: 0 }),
  bruno({ color: '#ece2ff', emissive: '#d4c0ff', emissiveIntensity: 1.2, warm: 0 }),
]
const BULB = new SphereGeometry(26, 12, 8).scale(1, 1.25, 1)
const CAP = new SphereGeometry(13, 8, 6).scale(1, 1.4, 1)
/** the wire swagged between the corners along the eaves (just under the valance's hem), a bulb every so often;
 *  `skip`: the sides without (0 front, 1 right, 2 back, 3 left) */
export function stringLights(hx: number, hz: number, y: number, skip: number[] = []) {
  const corners = [
    [-hx, hz],
    [hx, hz],
    [hx, -hz],
    [-hx, -hz],
  ]
  const wires: TubeGeometry[] = []
  const bulbs: Vector3[] = []
  for (let k = 0; k < 4; k++) {
    if (skip.includes(k)) continue
    const [ax, az] = corners[k]
    const [bx, bz] = corners[(k + 1) % 4]
    const len = Math.hypot(bx - ax, bz - az)
    const swags = Math.max(1, Math.round(len / 800))
    const pts: Vector3[] = []
    for (let i = 0; i <= swags * 12; i++) {
      const u = i / (swags * 12)
      const w = (u * swags) % 1
      pts.push(new Vector3(ax + (bx - ax) * u, y - 110 * 4 * w * (1 - w), az + (bz - az) * u))
    }
    wires.push(new TubeGeometry(new CatmullRomCurve3(pts), pts.length * 2, 5, 5, false))
    const n = Math.round(len / 170)
    for (let i = 1; i < n; i++) {
      const u = i / n
      const w = (u * swags) % 1
      bulbs.push(new Vector3(ax + (bx - ax) * u, y - 110 * 4 * w * (1 - w) - 34, az + (bz - az) * u))
    }
  }
  return { wires, bulbs }
}
/**
 * The lights themselves (put them in the canopy's <Static>: the wires and bulbs merge; the halos are a draw of their
 * own). `pool`: the lamp slot its warm pool of light under the canopy takes at night (./bruno shared.lamps).
 */
export function StringLights({ hx, hz, y, skip, halo = 40, pool }: { hx: number; hz: number; y: number; skip?: number[]; halo?: number; pool?: number }) {
  const g = useMemo(() => stringLights(hx, hz, y, skip), [hx, hz, y, skip])
  const at = useRef<Group>(null)
  useEffect(() => {
    const o = at.current
    if (pool == null || !o) return
    o.updateWorldMatrix(true, false)
    const p = o.getWorldPosition(new Vector3())
    shared.lamps.value[pool]?.set(p.x, p.y, p.z, 0)
    return () => void shared.lamps.value[pool]?.set(1e9, 0, 0, 0)
  }, [pool])
  return (
    <group>
      <group ref={at} position={[0, y * 0.6, 0]} />
      {g.wires.map((w, i) => (
        <mesh key={i} geometry={w} material={DARK} />
      ))}
      {g.bulbs.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={CAP} material={DARK} position={[0, 30, 0]} />
          <mesh geometry={BULB} material={BULBS[i % 3]} />
        </group>
      ))}
      <Halos at={g.bulbs} size={halo} />
    </group>
  )
}

// ---- the stars and the moon
function starGeometry() {
  const pos: number[] = []
  let s = 3
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 1100; i++) {
    const a = rand() * Math.PI * 2
    const y = 0.08 + rand() * 0.92 // (above the horizon)
    const r = Math.sqrt(1 - y * y)
    pos.push(Math.cos(a) * r * 30000, y * 30000, Math.sin(a) * r * 30000)
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3))
}
const STARS = new PointsMaterial({ color: '#f4efff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })
const MOON = new MeshBasicMaterial({ color: '#f6f0dc', transparent: true, opacity: 0, fog: false, depthWrite: false })
const MOON_GLOW = new PointsMaterial({ map: HALO_TEX, color: '#c9d4ff', size: 5200, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: AdditiveBlending })
const MOON_AT = new Vector3(0.35, 0.82, -0.25).normalize().multiplyScalar(29000)
export function Sky() {
  const stars = useMemo(starGeometry, [])
  const moonPt = useMemo(() => new BufferGeometry().setAttribute('position', new Float32BufferAttribute([MOON_AT.x, MOON_AT.y, MOON_AT.z], 3)), [])
  const g = useRef<Group>(null)
  // (round the camera: as far off wherever it is)
  useFrame(({ camera }) => void g.current?.position.set(camera.position.x, 0, camera.position.z))
  return (
    <group ref={g} renderOrder={-1}>
      <points geometry={stars} material={STARS} frustumCulled={false} />
      <mesh position={MOON_AT} material={MOON} frustumCulled={false}>
        <sphereGeometry args={[650, 24, 16]} />
      </mesh>
      <points geometry={moonPt} material={MOON_GLOW} frustumCulled={false} />
    </group>
  )
}

// ---- the clock, and the day put into everything
function skyCanvas() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return { c, t }
}
const _col = new Color()
export function DayCycle() {
  const scene = useThree((s) => s.scene)
  const sky = useMemo(skyCanvas, [])
  const sun = useRef<DirectionalLight | null>(null)
  const drawn = useRef(-99)
  useEffect(() => {
    const was = scene.background
    scene.background = sky.t
    if (import.meta.env.DEV) Object.assign(window, { __day: clock })
    return () => void (scene.background = was)
  }, [scene, sky])
  useFrame((_, dt) => {
    clock.hour = (clock.hour + (Math.min(dt, 0.1) * 24) / (clock.minutes * 60)) % 24
    const n = dayAt(clock.hour)
    applyDay(n)
    if (!sun.current) sun.current = scene.getObjectByName('sun') as DirectionalLight
    if (sun.current) {
      sun.current.color.copy(n.light)
      sun.current.intensity = n.intensity
    }
    ;(scene.fog as Fog | null)?.color.copy(n.fog)
    // the night's things
    const night = n.night
    for (const m of haloMats) {
      m.opacity = night * 0.85
      m.visible = night > 0.02
    }
    TREE_MAT.color.copy(DAY_BULB).lerp(NIGHT_BULB, night)
    STARS.opacity = Math.max(0, night * 1.2 - 0.2)
    MOON.opacity = night
    MOON_GLOW.opacity = night * 0.35
    STARS.visible = MOON.visible = MOON_GLOW.visible = night > 0.02
    for (let i = 4; i < shared.lamps.value.length; i++) {
      const l = shared.lamps.value[i]
      if (l.x < 1e8) l.w = night * 0.8
    }
    // the sky's gradient, again when it's changed enough to see (a few times a second at most)
    if (Math.abs(clock.hour - drawn.current) > 0.02) {
      drawn.current = clock.hour
      const g = sky.c.getContext('2d')!
      const grad = g.createLinearGradient(0, 0, 0, 256)
      n.sky.forEach((c, i) => grad.addColorStop(i / (n.sky.length - 1), '#' + _col.copy(c).getHexString()))
      g.fillStyle = grad
      g.fillRect(0, 0, 4, 256)
      sky.t.needsUpdate = true
    }
  })
  return null
}
