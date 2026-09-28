import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, LatheGeometry, RepeatWrapping, SRGBColorSpace, Vector2, Vector3, type Group, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Holdable } from '../../lib/physics/Holdable'
import { Prompts, type PromptItem } from '../prompt/Prompts'
import { bruno } from './bruno'
import { addCookie, useCookieCount } from './cookies'
import type { CarState, Obstacle } from './Car'
import { SET } from './set'

/**
 * The cookie stand on the lawn (Bruno Simon's "accept cookie", a nod to Cookie Clicker): a pop-up
 * canopy in pink and cream stripes over a folding table with a gingham cloth, a little retro toaster
 * oven on it glowing warm, a cooling rack, a chalkboard out front. Drive up and take the prompt, or
 * click the oven: its window glows up, the door drops, and a warm cookie hops out onto the grass, a toy
 * like everything else (carry it, knock it about; they go after a while). The count of every cookie
 * handed out on a wooden plank on the canopy's peak (./cookies: this browser's, or everyone's once a
 * shared counter's set up).
 *
 * In REAL millimetres, at the toy scale K: a 3 × 3 m pop-up canopy (legs 2.1 m, peak 2.9 m), a 6 ft
 * folding table (1830 × 760, 740 high), a countertop oven (460 × 280 × 360). The cookies are toys: far
 * bigger than real, like Bruno's. The stand faces +z (toward the camera) at its spot (./set).
 */
const K = 0.16
const TABLE = { w: 1830, d: 760, h: 740 }
const CANOPY = { half: 1500, eave: 2100, peak: 2900, over: 60 }
const OVEN = { w: 460, h: 280, d: 360, x: -420 } // (on the table, left of middle)
const OVEN_TOY = 1.5 // (drawn half as big again: it's the star, it has to read from the car)
const COOKIE = { r: 30, t: 12 } // (toy mm, not real: chunky)

// ---- materials
const FRAME = bruno({ color: '#d7d9df', shade: '#9794ad', sheen: 0.3 })
const WOOD = bruno({ color: '#b98a5c', shade: '#8d7493' })
const MINT = bruno({ color: '#a9dcc8', shade: '#7f8fb8', sheen: 0.35 })
const CREAM = bruno({ color: '#fbf1e2', shade: '#b5a6c6' })
const CHROME = bruno({ color: '#e4e6ec', shade: '#a19eb8', sheen: 0.5 })
const DARK = bruno({ color: '#2c2830' })
const LAMP = bruno({ color: '#ff6a5c', emissive: '#ff4a3c', emissiveIntensity: 0.8, warm: 0 })
const DOUGH = bruno({ color: '#d99d5b', shade: '#9a7189' })
const CHIP = bruno({ color: '#4a2d24', shade: '#2e2233' })
const RBOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.2)
const TUBE = new CylinderGeometry(1, 1, 1, 10)

/** a rounded box, real mm */
function Block({ size, at, m, rot }: { size: [number, number, number]; at: [number, number, number]; m: Material; rot?: [number, number, number] }) {
  return <mesh geometry={RBOX} material={m} position={at} rotation={rot} scale={size} castShadow receiveShadow />
}

// ---- painted: the canopy's stripes (and its scalloped valance), the gingham, the chalkboard, the plank
const PINK = '#f5b3c6'
const CREAMY = '#fdf2e4'
function stripes(scallop: boolean) {
  const W = 512
  const H = scallop ? 96 : 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? CREAMY : PINK
    g.fillRect((i * W) / 8, 0, W / 8, H)
  }
  if (scallop) {
    // the valance's scalloped hem: cut round under each stripe (its alpha: kept where white)
    const a = document.createElement('canvas')
    a.width = W
    a.height = H
    const ga = a.getContext('2d')!
    ga.fillStyle = '#000'
    ga.fillRect(0, 0, W, H)
    ga.fillStyle = '#fff'
    ga.fillRect(0, 0, W, H * 0.55)
    for (let i = 0; i < 8; i++) {
      ga.beginPath()
      ga.arc(((i + 0.5) * W) / 8, H * 0.55, W / 16, 0, Math.PI)
      ga.fill()
    }
    // a darker line along the stitched hem
    g.fillStyle = 'rgba(120,60,80,0.18)'
    g.fillRect(0, H * 0.08, W, 3)
    const alpha = new CanvasTexture(a)
    const map = new CanvasTexture(c)
    map.colorSpace = SRGBColorSpace
    return { map, alpha }
  }
  const map = new CanvasTexture(c)
  map.colorSpace = SRGBColorSpace
  return { map, alpha: null }
}
function gingham() {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  g.fillStyle = '#fff8f4'
  g.fillRect(0, 0, N, N)
  g.fillStyle = 'rgba(236,120,150,0.45)'
  for (let i = 0; i < 8; i += 2) {
    g.fillRect((i * N) / 8, 0, N / 8, N)
    g.fillRect(0, (i * N) / 8, N, N / 8)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}
const HAND = "'Gaegu', 'Nunito', cursive"
function chalkboard() {
  const W = 256
  const H = 360
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#2f3a35'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2)
  }
  g.fillStyle = '#fbf7ef'
  g.textAlign = 'center'
  g.font = `700 54px ${HAND}`
  g.fillText('free', W / 2, 92)
  g.fillText('cookies', W / 2, 150)
  g.fillStyle = '#f7b9c9'
  g.font = `700 64px ${HAND}`
  g.fillText('♡', W / 2, 226)
  g.fillStyle = '#fbf7ef'
  g.font = `700 34px ${HAND}`
  g.fillText('take one!', W / 2, 300)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
/** the plank: the count in white on the wood, commas and all */
function drawPlank(c: HTMLCanvasElement, n: number) {
  const g = c.getContext('2d')!
  const W = c.width
  const H = c.height
  g.fillStyle = '#b98a5c'
  g.fillRect(0, 0, W, H)
  // the grain, the boards' seam
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(90,55,35,${0.06 + ((i * 37) % 10) / 100})`
    g.lineWidth = 2
    g.beginPath()
    const y = (i * H) / 40 + Math.sin(i) * 3
    g.moveTo(0, y)
    g.bezierCurveTo(W * 0.3, y + 6, W * 0.6, y - 6, W, y + 2)
    g.stroke()
  }
  g.fillStyle = 'rgba(70,40,25,0.35)'
  g.fillRect(0, H / 2 - 2, W, 4)
  g.fillStyle = '#fffaf2'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `700 ${Math.round(H * 0.72)}px ${HAND}`
  g.shadowColor = 'rgba(60,30,20,0.4)'
  g.shadowOffsetY = 4
  g.fillText(n.toLocaleString('en-US'), W / 2, H / 2 + 6)
  g.shadowColor = 'transparent'
}

// ---- the canopy's roof: a pyramid of four striped panels (stripes running up to the peak)
function roofGeometry() {
  const h = CANOPY.half + CANOPY.over
  const e = CANOPY.eave
  const corners: [number, number][] = [
    [-h, h],
    [h, h],
    [h, -h],
    [-h, -h],
  ]
  const pos: number[] = []
  const uv: number[] = []
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    pos.push(ax, e, az, bx, e, bz, 0, CANOPY.peak, 0)
    uv.push(0, 0, 1, 0, 0.5, 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.computeVertexNormals()
  return g
}

// ---- a cookie: round, its rim rounded, chocolate chips pushed into its top
const COOKIE_GEO = (() => {
  const { r, t } = COOKIE
  const pts: Vector2[] = [new Vector2(0, -t / 2)]
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI
    pts.push(new Vector2(r - t / 2 + (Math.cos(a) * t) / 2, (Math.sin(a) * t) / 2))
  }
  pts.push(new Vector2(0, t / 2))
  return new LatheGeometry(pts, 24)
})()
const CHIPS: [number, number, number][] = [
  [0.1, 0.2, 0],
  [-0.45, 0.1, 1],
  [0.5, -0.3, 2],
  [-0.2, -0.55, 3],
  [0.35, 0.6, 4],
  [-0.6, -0.1, 5],
  [0.0, -0.1, 6],
]
function Cookie() {
  return (
    <group>
      <mesh geometry={COOKIE_GEO} material={DOUGH} castShadow receiveShadow />
      {CHIPS.map(([u, v, k]) => (
        <mesh key={k} geometry={RBOX} material={CHIP} position={[u * COOKIE.r * 0.9, COOKIE.t / 2, v * COOKIE.r * 0.9]} rotation={[0.3 * k, k, 0.2]} scale={[7, 6, 6]} />
      ))}
    </group>
  )
}

// ---- the oven: retro, mint, its door dropping open; `baking` 0..1 through a bake
function Oven({ baking, onClick }: { baking: { current: number }; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const door = useRef<Group>(null)
  const glow = useMemo(() => bruno({ color: '#ffb35c', emissive: '#ff9a3c', emissiveIntensity: 0.6, warm: 0 }), []) // (its own: it glows up as it bakes)
  useFrame(() => {
    const b = baking.current
    // (it glows up, then the door drops open at the middle of the bake and shuts again)
    glow.emissiveIntensity = 0.6 + Math.sin(Math.min(1, b / 0.55) * Math.PI) * 1.1 + (b > 0 ? 0.3 : 0)
    const open = b < 0.5 ? 0 : b < 0.62 ? (b - 0.5) / 0.12 : b < 0.85 ? 1 : Math.max(0, 1 - (b - 0.85) / 0.15)
    if (door.current) door.current.rotation.x = open * 1.25
  })
  const { w, h, d } = OVEN
  return (
    <group onClick={onClick} onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))} onPointerOut={() => (document.body.style.cursor = '')}>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={TUBE} material={DARK} position={[(sx * w) / 2.6, 10, (sz * d) / 2.6]} scale={[14, 20, 14]} />),
      )}
      <Block size={[w, h, d]} at={[0, 20 + h / 2, 0]} m={MINT} />
      {/* the inside, dark and warm, seen with the door down */}
      <Block size={[w - 150, h - 70, 20]} at={[-40, 20 + h / 2, d / 2 - 8]} m={glow} />
      {/* the controls: a cream panel, two dials, the red lamp */}
      <Block size={[100, h - 40, 16]} at={[w / 2 - 60, 20 + h / 2, d / 2 + 4]} m={CREAM} />
      {[0, 1].map((i) => (
        <mesh key={i} geometry={TUBE} material={CHROME} position={[w / 2 - 60, 20 + h * 0.66 - i * 90, d / 2 + 16]} rotation={[Math.PI / 2, 0, 0]} scale={[26, 16, 26]} />
      ))}
      <mesh geometry={TUBE} material={LAMP} position={[w / 2 - 60, 20 + h * 0.18, d / 2 + 14]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 6, 8]} />
      {/* the door, hinged along its bottom: cream frame, the glowing window, the handle */}
      <group ref={door} position={[-40, 32, d / 2 + 8]}>
        <Block size={[w - 150, h - 40, 18]} at={[0, (h - 40) / 2, 0]} m={CREAM} />
        <Block size={[w - 210, h - 110, 8]} at={[0, (h - 40) / 2 - 6, 8]} m={glow} />
        <Block size={[w - 200, 16, 20]} at={[0, h - 60, 26]} m={CHROME} />
      </group>
    </group>
  )
}

// ---- the stand
export function CookieStand({ car }: { car: { current: CarState } }) {
  const at = SET.cookies
  const count = useCookieCount()
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null
    const roof = stripes(false)
    const val = stripes(true)
    const plankCanvas = document.createElement('canvas')
    plankCanvas.width = 1024
    plankCanvas.height = 256
    const plank = new CanvasTexture(plankCanvas)
    plank.colorSpace = SRGBColorSpace
    plank.anisotropy = 8
    const cloth = gingham()
    cloth.repeat.set(4, 2)
    return {
      roof: bruno({ map: roof.map, side: DoubleSide, shade: '#b89ac4' }),
      valance: bruno({ map: val.map, alphaMap: val.alpha!, alphaTest: 0.5, side: DoubleSide, shade: '#b89ac4' }),
      plankCanvas,
      plank,
      plankMat: bruno({ map: plank, shade: '#a58aa6' }),
      cloth: bruno({ map: cloth, shade: '#b8a2c8' }),
      chalk: bruno({ map: chalkboard(), shade: '#6f7699' }),
    }
  }, [])
  // the count, painted onto the plank (the font first)
  useEffect(() => {
    if (!tex) return
    document.fonts.load(`700 180px 'Gaegu'`).finally(() => {
      drawPlank(tex.plankCanvas, count)
      tex.plank.needsUpdate = true
    })
  }, [tex, count])
  const roof = useMemo(roofGeometry, [])

  // ---- baking: a bake takes ~1.6 s; the cookie hops out when the door's down
  const baking = useRef(0)
  const [cookies, setCookies] = useState<{ id: number; p: [number, number, number]; v: [number, number, number]; w: [number, number, number]; born: number }[]>([])
  const next = useRef(1)
  const bake = () => {
    if (baking.current > 0) return
    baking.current = 0.0001
  }
  const place = useMemo(() => {
    const c = Math.cos(at.rot)
    const s = Math.sin(at.rot)
    return (x: number, y: number, z: number) => new Vector3(at.x + (x * c + z * s) * K, y * K, at.z + (-x * s + z * c) * K)
  }, [at])
  useFrame((_, dt) => {
    if (baking.current <= 0) return
    const before = baking.current
    baking.current += dt / 1.6
    if (before < 0.6 && baking.current >= 0.6) {
      // out it pops: from the oven's mouth, forward and up, spinning
      const mouth = place(OVEN.x - 40 * OVEN_TOY, TABLE.h + (40 + OVEN.h / 2) * OVEN_TOY, -40 + (OVEN.d / 2 + 60) * OVEN_TOY)
      const fwd = new Vector3(Math.sin(at.rot), 0, Math.cos(at.rot))
      const id = next.current++
      setCookies((list) => [
        ...list.slice(-35),
        {
          id,
          p: [mouth.x, mouth.y, mouth.z],
          v: [fwd.x * 340 + (Math.random() - 0.5) * 140, 420, fwd.z * 340 + (Math.random() - 0.5) * 140],
          w: [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8],
          born: performance.now(),
        },
      ])
      addCookie()
    }
    if (baking.current >= 1) baking.current = 0
  })
  // cookies go after two minutes (a toy, not litter)
  useEffect(() => {
    const t = setInterval(() => setCookies((list) => list.filter((c) => performance.now() - c.born < 120000)), 5000)
    return () => clearInterval(t)
  }, [])
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    bake()
  }

  // the prompt: drive up and it offers a cookie
  const prompt: PromptItem = useMemo(
    () => ({
      key: 'cookie',
      label: 'Bake a cookie',
      icon: 'cookie',
      at: (out) => out.copy(place(OVEN.x, TABLE.h + OVEN.h * OVEN_TOY + 260, 0)),
      when: () => {
        const c = car.current
        return baking.current === 0 && Math.hypot(c.x - at.x, c.z - at.z) < 1100
      },
      run: bake,
    }),
    [car, at, place],
  )

  const { half, eave, peak } = CANOPY
  if (!tex) return null
  return (
    <>
      <group position={[at.x, 0, at.z]} rotation={[0, at.rot, 0]}>
        <group scale={K}>
          {/* the canopy: four legs, the rails round the top, the striped roof, its scalloped valance */}
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <group key={`${sx}${sz}`}>
                <mesh geometry={RBOX} material={FRAME} position={[sx * half, eave / 2, sz * half]} scale={[40, eave, 40]} castShadow />
                <mesh geometry={RBOX} material={FRAME} position={[sx * half, 30, sz * half]} scale={[120, 20, 120]} castShadow />
              </group>
            )),
          )}
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={RBOX} material={FRAME} position={[0, eave - 30, s * half]} scale={[half * 2, 36, 30]} />
              <mesh geometry={RBOX} material={FRAME} position={[s * half, eave - 30, 0]} scale={[30, 36, half * 2]} />
            </group>
          ))}
          <mesh geometry={roof} material={tex.roof} castShadow receiveShadow />
          {[0, 1, 2, 3].map((i) => {
            const a = (i * Math.PI) / 2
            const h = half + CANOPY.over
            return (
              <mesh key={i} material={tex.valance} position={[Math.sin(a) * h, eave - 130, Math.cos(a) * h]} rotation={[0, a, 0]}>
                <planeGeometry args={[h * 2, 260]} />
              </mesh>
            )
          })}
          {/* the count: a plank on a post up from the peak, facing out front */}
          <mesh geometry={RBOX} material={FRAME} position={[0, peak + 170, 0]} scale={[40, 340, 40]} />
          <group position={[0, peak + 440, 30]}>
            <Block size={[1500, 400, 60]} at={[0, 0, 0]} m={WOOD} />
            <mesh material={tex.plankMat} position={[0, 0, 31]}>
              <planeGeometry args={[1440, 360]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} geometry={TUBE} material={DARK} position={[s * 640, 120, 34]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 16]} />
            ))}
          </group>
          {/* the table under it: top, legs, the gingham cloth over it hanging down the front and sides */}
          <Block size={[TABLE.w, 40, TABLE.d]} at={[0, TABLE.h - 20, 0]} m={CREAM} />
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={RBOX} material={FRAME} position={[s * (TABLE.w / 2 - 120), TABLE.h / 2, 0]} scale={[30, TABLE.h, TABLE.d - 120]} />
          ))}
          <Block size={[TABLE.w + 40, 16, TABLE.d + 40]} at={[0, TABLE.h + 6, 0]} m={tex.cloth} />
          <Block size={[TABLE.w + 40, 360, 10]} at={[0, TABLE.h - 170, TABLE.d / 2 + 22]} m={tex.cloth} />
          {[-1, 1].map((s) => (
            <Block key={s} size={[10, 360, TABLE.d + 40]} at={[s * (TABLE.w / 2 + 22), TABLE.h - 170, 0]} m={tex.cloth} />
          ))}
          {/* the oven, the cooling rack with a few on it */}
          <group position={[OVEN.x, TABLE.h + 14, -40]} scale={OVEN_TOY}>
            <Oven baking={baking} onClick={click} />
          </group>
          <group position={[330, TABLE.h + 14, 20]}>
            <Block size={[420, 12, 300]} at={[0, 40, 0]} m={CHROME} />
            {[-1, 1].map((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={TUBE} material={CHROME} position={[sx * 190, 18, sz * 130]} scale={[6, 36, 6]} />))}
          </group>
          {/* the chalkboard out front, an A-frame on the grass */}
          <group position={[-TABLE.w / 2 - 250, 0, TABLE.d / 2 + 700]} rotation={[0, 0.35, 0]}>
            {[-1, 1].map((s) => (
              <group key={s} rotation={[s * 0.2, s > 0 ? 0 : Math.PI, 0]}>
                <Block size={[520, 760, 30]} at={[0, 380, 70]} m={WOOD} />
                <mesh material={tex.chalk} position={[0, 400, 86]}>
                  <planeGeometry args={[440, 620]} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
        {/* the cookies on the rack (just for looks: the oven's are the ones to take) */}
        {[
          [-90, -60],
          [70, -50],
          [-10, 70],
        ].map(([x, z], i) => (
          <group key={i} position={[(330 + x) * K, (TABLE.h + 14 + 48) * K + COOKIE.t / 2, (20 + z) * K]} rotation={[0, i, 0]}>
            <Cookie />
          </group>
        ))}
        {/* what's solid: the legs, the table, the chalkboard */}
        <RigidBody type="fixed" colliders={false}>
          {[-1, 1].map((sx) => [-1, 1].map((sz) => <CylinderCollider key={`${sx}${sz}`} args={[(eave / 2) * K, 30 * K]} position={[sx * half * K, (eave / 2) * K, sz * half * K]} />))}
          <CuboidCollider args={[(TABLE.w / 2 + 20) * K, (TABLE.h / 2) * K, (TABLE.d / 2 + 20) * K]} position={[0, (TABLE.h / 2) * K, 0]} />
          <CuboidCollider args={[(OVEN.w / 2) * OVEN_TOY * K, (OVEN.h / 2 + 20) * OVEN_TOY * K, (OVEN.d / 2) * OVEN_TOY * K]} position={[OVEN.x * K, (TABLE.h + 14 + (OVEN.h / 2 + 20) * OVEN_TOY) * K, -40 * K]} />
        </RigidBody>
      </group>
      {/* the cookies out of the oven: toys */}
      {cookies.map((c) => (
        <Holdable key={c.id} position={c.p} linearVelocity={c.v} angularVelocity={c.w} colliders={false} linearDamping={0.3} angularDamping={0.6} sound="none">
          <Cookie />
          <CylinderCollider args={[COOKIE.t / 2, COOKIE.r]} mass={0.05} friction={0.9} restitution={0.2} />
        </Holdable>
      ))}
      <Prompts items={[prompt]} far={9000} />
    </>
  )
}

/** what the car bumps into at the stand: the four legs, the table */
export function cookieStandObstacles(): Obstacle[] {
  const at = SET.cookies
  const c = Math.cos(at.rot)
  const s = Math.sin(at.rot)
  const pt = (x: number, z: number) => ({ x: at.x + (x * c + z * s) * K, z: at.z + (-x * s + z * c) * K })
  const h = CANOPY.half
  return [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ kind: 'circle' as const, ...pt(sx * h, sz * h), r: 12 }))),
    ...[-1, 0, 1].map((u) => ({ kind: 'circle' as const, ...pt(u * TABLE.w * 0.33, 0), r: (TABLE.d / 2) * K + 10 })),
  ]
}
