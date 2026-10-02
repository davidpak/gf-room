import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CylinderGeometry, ExtrudeGeometry, PlaneGeometry, ShapeGeometry, SphereGeometry, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { anchor, canvasTexture, capped } from './anchors'
import { roundRect } from './GameCube'
import { makeScreen } from './screen'
import { COLORS, TV } from './spec'
import { getCube, pressTv } from './state'

/**
 * The 20" CRT [T], toy style: its frame's origin on the ground under the middle of its front, the screen facing +z.
 * The bezel a thick frame round the screen (its front painted: the maker's name, the row of small buttons' labels,
 * the speaker's holes), the glass recessed in it and bowed out, showing what the game's showing (./screen: its map
 * and its glow); the tube's housing tapering back behind, a plinth under it. Its power switch (clicked: on, off)
 * and lamp, its little buttons, and the front AV jacks low on the right with the GameCube's plugs in them.
 */
const { w: TW, h: TH, bezel: BZ, d: TD, screen: S } = TV
const B = 4 // (the bezel's rounding over)
const PX = 2

/** the bezel: its outline, the screen's opening through it (rounded over by B, so drawn B in from both) */
function bezelGeometry() {
  const outer = roundRect(TW - 2 * B, TH - 2 * B, 20, 0, TH / 2)
  outer.holes.push(roundRect(S.w + 2 * B, S.h + 2 * B, 22, 0, S.y))
  return new ExtrudeGeometry(outer, { depth: BZ - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 3, curveSegments: 14 }).translate(0, 0, -BZ + B)
}

/** the housing: a rounded rectangle tapering from a to b over z0..z1 (its sides; the back's cap apart) */
function loft(a: { w: number; h: number; r: number; y: number }, b: { w: number; h: number; r: number; y: number }, z0: number, z1: number) {
  const ring = (q: typeof a) => roundRect(q.w, q.h, q.r).getSpacedPoints(96).slice(0, 96)
  const ra = ring(a)
  const rb = ring(b)
  const n = ra.length
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i < n; i++) pos.push(ra[i].x, ra[i].y + a.y, z0)
  for (let i = 0; i < n; i++) pos.push(rb[i].x, rb[i].y + b.y, z1)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    idx.push(i, n + i, j, j, n + i, n + j) // (facing out)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function frontTexture() {
  return capped(
    canvasTexture(TW * PX, TH * PX, (g) => {
      const X = (x: number) => (x + TW / 2) * PX
      const Y = (y: number) => (TH - y) * PX
      g.fillStyle = COLORS.tv
      g.fillRect(0, 0, TW * PX, TH * PX)
      // the maker's name, top left
      g.fillStyle = '#d9c99a'
      g.font = `bold ${11 * PX}px Arial, sans-serif`
      g.textAlign = 'left'
      g.textBaseline = 'middle'
      g.fillText('rina vision', X(-TW / 2 + 26), Y(TH - 22))
      // the strip under the screen: its small buttons' names, the little display
      g.fillStyle = COLORS.tvDark
      g.beginPath()
      g.roundRect(X(-150), Y(92), 300 * PX, 44 * PX, 8 * PX)
      g.fill()
      g.fillStyle = '#8f8a99'
      g.font = `${5.5 * PX}px Arial, sans-serif`
      g.textAlign = 'center'
      ;['VOL –', 'VOL +', 'CH ∨', 'CH ∧', 'MENU'].forEach((t, i) => g.fillText(t, X(-120 + i * 22), Y(56)))
      g.fillStyle = '#17151b'
      g.fillRect(X(-2), Y(82), 54 * PX, 18 * PX)
      g.fillStyle = '#ffb347'
      g.font = `bold ${11 * PX}px 'Courier New', monospace`
      g.fillText('AV 1', X(25), Y(73))
      g.fillStyle = '#8f8a99'
      g.font = `${5.5 * PX}px Arial, sans-serif`
      g.fillText('POWER', X(205), Y(56))
      g.fillText('VIDEO  L-AUDIO-R', X(212), Y(14))
      // the speaker's holes, left of the strip
      g.fillStyle = '#2f2c35'
      for (let x = -235; x <= -172; x += 7)
        for (let y = 30; y <= 96; y += 7) {
          g.beginPath()
          g.arc(X(x), Y(y), 2 * PX, 0, Math.PI * 2)
          g.fill()
        }
    }),
    -TW / 2,
    TW / 2,
    0,
    TH,
  )
}
function backTexture() {
  return capped(
    canvasTexture(TV.back.w * PX, TV.back.h * PX, (g) => {
      const W = TV.back.w * PX
      const H = TV.back.h * PX
      g.fillStyle = COLORS.tvDark
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#26232b'
      for (let i = 0; i < 18; i++) g.fillRect(W * 0.12 + i * W * 0.042, H * 0.12, W * 0.022, H * 0.42)
      g.fillStyle = '#e8e6ee'
      g.fillRect(W * 0.36, H * 0.66, W * 0.28, H * 0.16)
      g.fillStyle = '#4a4752'
      g.font = `bold ${5 * PX}px Arial, sans-serif`
      g.textAlign = 'center'
      g.fillText('rina vision  RV-20', W / 2, H * 0.72)
      g.font = `${3.5 * PX}px Arial, sans-serif`
      g.fillText('120V ~ 60Hz   85W', W / 2, H * 0.78)
    }),
    -TV.back.w / 2,
    TV.back.w / 2,
    -TV.back.h / 2,
    TV.back.h / 2,
  )
}

const GLASS = (() => {
  const g = new PlaneGeometry(S.w + 16, S.h + 16, 24, 18)
  const p = g.attributes.position as BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / ((S.w + 16) / 2)
    const y = p.getY(i) / ((S.h + 16) / 2)
    p.setZ(i, S.bow * (1 - x * x) * (1 - y * y))
  }
  g.computeVertexNormals()
  return g
})()
const HOUSING = loft({ w: TW - 24, h: TH - 30, r: 34, y: TH / 2 + 4 }, { ...TV.back, r: 28 }, -BZ + 2, -TD + 20)
const BACK = new ShapeGeometry(roundRect(TV.back.w, TV.back.h, 28), 10).rotateY(Math.PI).translate(0, TV.back.y, -TD + 20)
const PLINTH = new RoundedBoxGeometry(360, 26, 300, 2, 6)
const KEY = new RoundedBoxGeometry(14, 7, 4, 2, 1.5)
const SWITCH = new RoundedBoxGeometry(24, 14, 7, 2, 2.5)
const LAMP = new SphereGeometry(3, 12, 8)
const JACK = new CylinderGeometry(5.5, 5.5, 6, 18).rotateX(Math.PI / 2)
const RCA = new CylinderGeometry(5, 4.4, 20, 16).rotateX(Math.PI / 2)
const M = {
  side: bruno({ color: COLORS.tvDark, shade: '#1d1b22' }),
  body: bruno({ color: COLORS.tv, shade: '#25222b' }),
  key: bruno({ color: '#2a2830', shade: '#17151b' }),
  lampOn: bruno({ color: '#8dff9d', emissive: '#52ff70', emissiveIntensity: 1.3 }),
  lampOff: bruno({ color: '#ff6a5a', emissive: '#ff3a2a', emissiveIntensity: 0.9 }),
  yellow: bruno({ color: '#f4c63a', shade: '#8a6a1a' }),
  white: bruno({ color: '#f1f0f4', shade: '#8a8a9a' }),
  red: bruno({ color: '#e0453a', shade: '#7a2420' }),
}

export function Crt({ onBody, onScreen }: { onBody?: (e: ThreeEvent<MouseEvent>) => void; onScreen?: (e: ThreeEvent<MouseEvent>) => void }) {
  const bezel = useMemo(bezelGeometry, [])
  const front = useMemo(() => [bruno({ map: frontTexture() }), M.side], [])
  const back = useMemo(() => bruno({ map: backTexture() }), [])
  const screen = useMemo(makeScreen, [])
  const glass = useMemo(() => bruno({ map: screen.texture, emissiveMap: screen.texture, emissive: '#ffffff', emissiveIntensity: 0 }), [screen])
  const lamp = useRef<Mesh>(null)
  const sw = useRef<Mesh>(null)
  // the picture: drawn when it changes; the glass glowing while there's a picture on it
  useFrame(() => {
    const c = getCube()
    screen.update(c)
    const lit = c.tv || performance.now() / 1000 - c.tvAt < 0.4
    glass.emissiveIntensity = lit ? 1 : 0
    glass.color.set(lit ? '#2a2a2a' : '#ffffff')
    if (lamp.current) lamp.current.material = c.tv ? M.lampOn : M.lampOff
    if (sw.current) sw.current.position.z = 3 - (performance.now() / 1000 - (c.pressed.tv ?? -9) < 0.16 ? 2 : 0)
  })
  const body = (e: ThreeEvent<MouseEvent>) => {
    if (!onBody) return
    e.stopPropagation()
    onBody(e)
  }
  const hand = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => (document.body.style.cursor = ''),
  }
  return (
    <group>
      <mesh geometry={bezel} material={front} castShadow receiveShadow onClick={body} />
      <mesh
        geometry={GLASS}
        material={glass}
        position={[0, S.y, -30]}
        userData={{ live: true }}
        onClick={(e) => {
          if (!onScreen) return body(e)
          e.stopPropagation()
          onScreen(e)
        }}
      />
      <mesh geometry={HOUSING} material={M.body} castShadow receiveShadow onClick={body} />
      <mesh geometry={BACK} material={back} onClick={body} />
      <mesh geometry={PLINTH} material={M.side} position={[0, 13, -250]} castShadow />
      {/* the power switch and its lamp, the little buttons */}
      <mesh
        ref={sw}
        geometry={SWITCH}
        material={M.key}
        position={[205, 72, 3]}
        userData={{ live: true }}
        onClick={(e) => {
          e.stopPropagation()
          pressTv()
        }}
        {...hand}
      />
      <mesh ref={lamp} geometry={LAMP} material={M.lampOff} position={[176, 72, 1]} userData={{ live: true }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} geometry={KEY} material={M.key} position={[-120 + i * 22, 70, 2]} />
      ))}
      {/* the AV jacks, the GameCube's plugs in them */}
      {(
        [
          [196, M.yellow],
          [212, M.white],
          [228, M.red],
        ] as const
      ).map(([x, m], i) => (
        <group key={i} position={[x, 30, 0]}>
          <mesh geometry={JACK} material={M.key} position={[0, 0, 2]} />
          <mesh geometry={RCA} material={m} position={[0, 0, 13]} />
        </group>
      ))}
      <group ref={anchor('avin')} position={[212, 30, 24]} />
    </group>
  )
}
