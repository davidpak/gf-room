import { useMemo, type ReactNode } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { BoxGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Shape, SphereGeometry, Vector2, type Material } from 'three'
import { bruno } from '../quad/bruno'
import { paint, rng } from './paint'

/**
 * A grazing board (./spec [C]), in real millimetres: a round bamboo board (its strips of cane glued edge to
 * edge, a nodes here and there, a rounded edge), laid out: crustless white triangles of ham and jam leant one
 * on the next, brown bread squares of cheese and ham, white fingers of chocolate spread and marshmallow stood
 * on their sides, a fan of salami and two slices folded, cubes of feta, and two teaspoons, one of jam, one of
 * chocolate spread, laid at its edge. Click any of it to eat it (`eaten`, by index; `onEat`).
 *
 * Its frame: standing on y = 0, its middle at the origin.
 */
export const BOARD = { r: 203, t: 20 } // [C] a 16" board
const { r: BR, t: BT } = BOARD

// ---- its looks
const bambooTex = paint(512, 512, (g) => {
  const r = rng(12)
  for (let x = 0; x < 512; x += 22) {
    const tone = 0.92 + r() * 0.12
    g.fillStyle = `rgb(${232 * tone},${190 * tone},${128 * tone})`
    g.fillRect(x, 0, 22, 512)
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(170,120,60,${0.08 + r() * 0.1})`
      g.fillRect(x + r() * 22, 0, 1, 512)
    }
    g.fillStyle = 'rgba(140,96,48,0.35)'
    g.fillRect(x, 0, 1.5, 512)
    // a node across the strip, here and there
    for (let k = 0; k < 2; k++) {
      const y = r() * 512
      g.fillStyle = 'rgba(150,100,50,0.4)'
      g.fillRect(x + 1, y, 21, 3)
    }
  }
})
const BAMBOO = bruno({ map: bambooTex ?? undefined, color: '#ffffff', shade: '#9a7a78' })
const EDGE = bruno({ color: '#d9ab6a', shade: '#8f6f6c' })
const salamiTex = paint(128, 128, (g) => {
  const r = rng(4)
  g.fillStyle = '#a72a3a'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 90; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(250,236,226,0.95)' : 'rgba(120,20,36,0.7)'
    g.beginPath()
    g.ellipse(r() * 128, r() * 128, 1.5 + r() * 2.5, 1.2 + r() * 2, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  // its skin round the edge
  g.strokeStyle = '#6e2a2e'
  g.lineWidth = 5
  g.beginPath()
  g.arc(64, 64, 62, 0, Math.PI * 2)
  g.stroke()
})
const M = {
  white: bruno({ color: '#f8f1e3', shade: '#c9b6b0' }),
  ham: bruno({ color: '#ee9aa4', shade: '#a77894' }),
  jam: bruno({ color: '#c62a3d', shade: '#7c2846' }),
  wholemeal: bruno({ color: '#d6ad7c', shade: '#957474' }),
  crust: bruno({ color: '#8c5a33', shade: '#5c4048' }),
  cheese: bruno({ color: '#f2a93c', shade: '#a67c6c' }),
  choc: bruno({ color: '#5b3524', shade: '#3a2630' }),
  marsh: bruno({ color: '#fffaf2', shade: '#cfc4c8' }),
  salami: bruno({ map: salamiTex ?? undefined, color: '#ffffff', shade: '#6e3048' }),
  salamiSide: bruno({ color: '#7c2a33', shade: '#4c2036' }),
  feta: bruno({ color: '#fbf8f0', shade: '#cbc4c6' }),
  steel: bruno({ color: '#dfe2e6', shade: '#8c93a2', sheen: 0.7 }),
}

let made: ReturnType<typeof build> | null = null
function build() {
  // the board: a rounded edge, its top the bamboo
  const prof: Vector2[] = [new Vector2(0, 0), new Vector2(BR - 5, 0)]
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI
    prof.push(new Vector2(BR - 5 + Math.cos(a) * 5, BT / 2 + Math.sin(a) * (BT / 2)))
  }
  prof.push(new Vector2(BR - 5, BT), new Vector2(0, BT))
  const side = new LatheGeometry(prof, 96)
  const top = new CircleGeometry(BR - 4, 96)
  top.rotateX(-Math.PI / 2)
  // a tea sandwich triangle, its layers: white bread, ham, jam, white bread (lying flat, its long edge on x)
  const tri = (h: number) => {
    const s = new Shape()
    s.moveTo(-50, 0)
    s.lineTo(50, 0)
    s.lineTo(0, 48)
    s.closePath()
    const g = new ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 2 })
    g.rotateX(Math.PI / 2)
    g.translate(0, h, 0)
    return g
  }
  return {
    side,
    top,
    bread: tri(8),
    ham: tri(3),
    jam: tri(1.5),
    square: new BoxGeometry(50, 8, 50),
    squareFill: new BoxGeometry(51, 3, 51),
    finger: new BoxGeometry(9, 28, 88),
    fingerFill: new BoxGeometry(4, 27, 87),
    salami: new CylinderGeometry(22, 22, 2.5, 28),
    fold: new CylinderGeometry(22, 22, 2.5, 28, 1, false, 0, Math.PI),
    dot: new SphereGeometry(2.2, 6, 5),
    handle: new BoxGeometry(80, 2, 9),
    bowl: new SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    dollop: new SphereGeometry(1, 12, 8),
  }
}

/** one thing on it to eat: where it is, and what it is */
type Piece = { at: [number, number, number]; rot: [number, number, number]; node: (g: ReturnType<typeof build>) => ReactNode; /** (not to eat) */ keep?: boolean }
const tea = (fill: Material): Piece['node'] => (g) => (
  <>
    <mesh geometry={g.bread} material={M.white} castShadow />
    <mesh geometry={g.ham} material={fill} position={[0, 8, 0]} />
    <mesh geometry={g.jam} material={M.jam} position={[0, 11, 0]} />
    <mesh geometry={g.bread} material={M.white} position={[0, 12.5, 0]} castShadow />
  </>
)
const square: Piece['node'] = (g) => (
  <>
    <mesh geometry={g.square} material={[M.crust, M.crust, M.wholemeal, M.wholemeal, M.crust, M.wholemeal]} position={[0, 4, 0]} castShadow />
    <mesh geometry={g.squareFill} material={M.cheese} position={[0, 9.5, 0]} />
    <mesh geometry={g.squareFill} material={M.ham} position={[0, 12.5, 0]} scale={[0.98, 1, 0.97]} />
    <mesh geometry={g.square} material={[M.crust, M.crust, M.wholemeal, M.wholemeal, M.crust, M.wholemeal]} position={[0, 18, 0]} castShadow />
  </>
)
const finger: Piece['node'] = (g) => (
  <>
    <mesh geometry={g.finger} material={M.white} position={[-6.5, 14, 0]} castShadow />
    <mesh geometry={g.fingerFill} material={M.choc} position={[0, 14, 0]} />
    <mesh geometry={g.finger} material={M.white} position={[6.5, 14, 0]} castShadow />
    {[-30, -8, 18, 34].map((z, i) => (
      <mesh key={i} geometry={g.dot} material={M.marsh} position={[0, 26 + (i % 2), z]} scale={[0.9, 0.7, 1.2]} />
    ))}
  </>
)
const salami: Piece['node'] = (g) => (
  <mesh geometry={g.salami} material={[M.salamiSide, M.salami, M.salami]} position={[0, 1.25, 0]} castShadow />
)
const folded: Piece['node'] = (g) => (
  <group rotation={[0, 0, 0]}>
    <mesh geometry={g.fold} material={[M.salamiSide, M.salami, M.salami]} position={[0, 1.25, 0]} />
    <mesh geometry={g.fold} material={[M.salamiSide, M.salami, M.salami]} position={[0, 4, 0]} rotation={[0, 0, 0.12]} />
  </group>
)
const feta: Piece['node'] = () => <RoundedBox args={[17, 15, 17]} radius={2.5} smoothness={2} material={M.feta} position={[0, 7.5, 0]} castShadow />
const spoon = (dollop: Material): Piece['node'] => (g) => (
  <>
    <mesh geometry={g.handle} material={M.steel} position={[-48, 2, 0]} castShadow />
    <mesh geometry={g.bowl} material={M.steel} position={[0, 7, 0]} scale={[18, 6, 13]} />
    <mesh geometry={g.dollop} material={dollop} position={[1, 7, 0]} scale={[12, 6, 9]} castShadow />
  </>
)
/** what's laid out on it (its frame, its top at y = 0 here) */
const PIECES: Piece[] = [
  // the triangles leant one on the next, round the back left
  ...[0, 1, 2, 3, 4].map((i): Piece => ({ at: [-140 + i * 24, 4 + (i ? 14 : 0), -95 - i * 14], rot: [i ? -0.45 : 0, 0.6 + i * 0.05, 0], node: tea(M.ham) })),
  // the brown squares, two by two, front left
  { at: [-110, 0, 40], rot: [0, 0.2, 0], node: square },
  { at: [-55, 0, 52], rot: [0, -0.15, 0], node: square },
  { at: [-118, 0, 98], rot: [0, 0.35, 0], node: square },
  { at: [-62, 0, 108], rot: [0, 0.05, 0], node: square },
  // the fingers, stood on their sides in a row across the middle
  ...[0, 1, 2, 3].map((i): Piece => ({ at: [-8 + i * 27, 0, -10], rot: [0, 0.05 * (i - 1.5), 0], node: finger })),
  // the salami fanned round the back right, two slices folded
  ...[0, 1, 2, 3, 4, 5].map((i): Piece => {
    const a = -1.2 + i * 0.32
    return { at: [130 + Math.cos(a) * 34, i * 1.2, -60 + Math.sin(a) * 34], rot: [0.06, a, 0.05], node: salami }
  }),
  { at: [150, 0, 50], rot: [0, 0.8, 0], node: folded },
  { at: [118, 0, 92], rot: [0, -0.4, 0], node: folded },
  // the feta, front right
  ...[0, 1, 2, 3].map((i): Piece => ({ at: [60 + (i % 2) * 22, 0, 70 + Math.floor(i / 2) * 22], rot: [0, i * 0.4, 0], node: feta })),
  // the spoons at its front edge, their handles out over it
  { at: [-10, 0, 160], rot: [0, -1.9, 0], node: spoon(M.jam), keep: true },
  { at: [40, 0, 150], rot: [0, -1.4, 0], node: spoon(M.choc), keep: true },
]
export const boardPieces = PIECES.filter((p) => !p.keep).length

export function Board({ eaten, onEat }: { eaten?: Set<number>; onEat?: (i: number, e: ThreeEvent<MouseEvent>) => void }) {
  const g = useMemo(() => (made ??= build()), [])
  return (
    <group>
      <mesh geometry={g.side} material={EDGE} castShadow receiveShadow />
      <mesh geometry={g.top} material={BAMBOO} position={[0, BT + 0.2, 0]} receiveShadow />
      {PIECES.map((p, i) =>
        eaten?.has(i) ? null : (
          <group key={i} position={[p.at[0], BT + p.at[1], p.at[2]]} rotation={p.rot} onClick={onEat && !p.keep ? (e) => (e.stopPropagation(), onEat(i, e)) : undefined}>
            {p.node(g)}
          </group>
        ),
      )}
    </group>
  )
}
