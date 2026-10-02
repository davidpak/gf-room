import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry, TubeGeometry, Vector3, type Group, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { anchor, canvasTexture, capped, rrect } from './anchors'
import { Disc } from './Disc'
import { COLORS, CUBE } from './spec'
import { getCube, moveDisc, pressOpen, pressPower, pressReset, shutLid, useCube } from './state'

/**
 * The GameCube [G], toy style, its frame's origin under its middle on the ground, its front +z. Its faces painted (the
 * port panel and its ports, the vents, the buttons' rings and names: into the faces' own textures, nothing stuck on);
 * the lid its own part, hinged at the back, popping up on its spring; the buttons their own parts, each clicked:
 * POWER (its lamp lights green), OPEN (the lid pops), RESET; the lid clicked shut. The disc under the lid on its
 * spindle (./Disc; a click on it with the lid up takes it out to its case). The controllers' plugs in ports 1 and 2,
 * the AV plug in its back (./anchors: the cables leave from them).
 */
const { w: CW, h: CH, d: CD, feet: FEET, lid: L } = CUBE
const BODY = CH - FEET
const PX = 4 // (canvas pixels a millimetre)
const LID_Z = L.hingeZ + L.d / 2 // (the lid's middle)

/** a rounded rectangle, w × h, its corners r, about (cx, cy) */
export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

function faces() {
  const plain = bruno({ color: COLORS.indigo, shade: '#3a3070' })
  const under = bruno({ color: '#3a3274', shade: '#2a2350' })
  // the top: the lid's bed (darker) and the well in it under the lid, the buttons' rings and their names, the maker's name
  const top = canvasTexture(CW * PX, CD * PX, (g) => {
    const X = (x: number) => (x + CW / 2) * PX
    const Y = (z: number) => (z + CD / 2) * PX
    g.fillStyle = COLORS.indigo
    g.fillRect(0, 0, CW * PX, CD * PX)
    g.fillStyle = COLORS.indigoDark
    rrect(g, X(-L.w / 2 - 1), Y(L.hingeZ - 1), (L.w + 2) * PX, (L.d + 2) * PX, (L.r + 1) * PX)
    g.fill()
    g.fillStyle = '#29262f'
    g.beginPath()
    g.arc(X(0), Y(LID_Z), CUBE.well.r * PX, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#3b3746'
    g.lineWidth = 2 * PX
    g.beginPath()
    g.arc(X(0), Y(LID_Z), (CUBE.well.r - 7) * PX, 0, Math.PI * 2)
    g.stroke()
    for (const b of Object.values(CUBE.buttons)) {
      g.fillStyle = '#3e3588'
      g.beginPath()
      g.arc(X(b.x), Y(b.z), (b.r + 2.4) * PX, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#9a91e0'
    g.font = `bold ${3 * PX}px Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const { power, reset, open } = CUBE.buttons
    g.fillText('POWER', X(power.x + 1), Y(power.z + power.r + 6))
    g.fillText('RESET', X(reset.x + 1), Y(reset.z - reset.r - 5.5))
    g.fillText('OPEN', X(open.x - 1), Y(open.z - open.r - 5.5))
    g.strokeStyle = '#4b42a0'
    g.lineWidth = 0.8 * PX
    rrect(g, X(34), Y(-CD / 2 + 4), 34 * PX, 9 * PX, 4.5 * PX)
    g.stroke()
    g.fillStyle = '#4b42a0'
    g.font = `italic bold ${4.6 * PX}px Arial, sans-serif`
    g.fillText('Nintendo', X(51), Y(-CD / 2 + 8.6))
  })
  // the front: the silver panel, its four ports (their numbers in dots over them), the memory card slots
  const front = canvasTexture(CW * PX, BODY * PX, (g) => {
    const X = (x: number) => (x + CW / 2) * PX
    const Y = (y: number) => (CH - y) * PX
    g.fillStyle = COLORS.indigo
    g.fillRect(0, 0, CW * PX, BODY * PX)
    const p = CUBE.panel
    g.fillStyle = COLORS.silver
    rrect(g, X(p.x0), Y(p.y1), (p.x1 - p.x0) * PX, (p.y1 - p.y0) * PX, 5 * PX)
    g.fill()
    g.strokeStyle = '#a9aab6'
    g.lineWidth = 0.8 * PX
    g.stroke()
    CUBE.ports.xs.forEach((x, i) => {
      g.fillStyle = '#9fa1ad'
      g.beginPath()
      g.arc(X(x), Y(CUBE.ports.y), (CUBE.ports.r + 1.6) * PX, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#26242c'
      g.beginPath()
      g.arc(X(x), Y(CUBE.ports.y), CUBE.ports.r * PX, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#5b5a66'
      for (let k = 0; k <= i; k++) {
        g.beginPath()
        g.arc(X(x + (k - i / 2) * 2.6), Y(CUBE.ports.y + CUBE.ports.r + 4.5), 0.8 * PX, 0, Math.PI * 2)
        g.fill()
      }
    })
    for (const [i, x] of CUBE.slots.xs.entries()) {
      g.fillStyle = '#b7b8c4'
      rrect(g, X(x - CUBE.slots.w / 2 - 2), Y(CUBE.slots.y + CUBE.slots.h / 2 + 2), (CUBE.slots.w + 4) * PX, (CUBE.slots.h + 4) * PX, 2 * PX)
      g.fill()
      g.fillStyle = '#3a3842'
      rrect(g, X(x - CUBE.slots.w / 2), Y(CUBE.slots.y + CUBE.slots.h / 2), CUBE.slots.w * PX, CUBE.slots.h * PX, 1 * PX)
      g.fill()
      g.fillStyle = '#6d6c78'
      g.font = `bold ${2.6 * PX}px Arial, sans-serif`
      g.textAlign = 'center'
      g.fillText(i ? 'SLOT B' : 'SLOT A', X(x), Y(CUBE.slots.y - 7))
    }
  })
  // the right side: its vent grille
  const right = canvasTexture(CD * PX, BODY * PX, (g) => {
    g.fillStyle = COLORS.indigo
    g.fillRect(0, 0, CD * PX, BODY * PX)
    const X = (z: number) => (CD / 2 - z) * PX
    const Y = (y: number) => (CH - y) * PX
    g.fillStyle = '#2d2668'
    for (let z = 34; z > -62; z -= 6.2)
      for (let y = 30; y < 92; y += 6.2) {
        rrect(g, X(z), Y(y + 4.4), 4.4 * PX, 4.4 * PX, 1.2 * PX)
        g.fill()
      }
  })
  // the back: its sockets (power in, the AV out, the covered ports)
  const back = canvasTexture(CW * PX, BODY * PX, (g) => {
    g.fillStyle = COLORS.indigo
    g.fillRect(0, 0, CW * PX, BODY * PX)
    const X = (x: number) => (CW / 2 - x) * PX
    const Y = (y: number) => (CH - y) * PX
    g.fillStyle = '#2b2733'
    g.beginPath()
    g.arc(X(-48), Y(36), 5 * PX, 0, Math.PI * 2)
    g.fill()
    rrect(g, X(32), Y(44), 26 * PX, 10 * PX, 2 * PX)
    g.fill()
    g.fillStyle = '#4a419c'
    for (const x of [-20, 6, 46]) {
      rrect(g, X(x + 9), Y(70), 18 * PX, 12 * PX, 2 * PX)
      g.fill()
    }
  })
  return [bruno({ map: right }), plain, bruno({ map: top }), under, bruno({ map: front }), bruno({ map: back })]
}

function lidFaces() {
  const top = capped(
    canvasTexture(L.w * PX, L.d * PX, (g) => {
      const W = L.w * PX
      const H = L.d * PX
      g.fillStyle = '#6154c2'
      g.fillRect(0, 0, W, H)
      const cx = W / 2
      const cy = H / 2
      g.fillStyle = '#121016'
      g.beginPath()
      g.arc(cx, cy, L.window * PX, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#2b2833'
      g.lineWidth = 1.2 * PX
      g.beginPath()
      g.arc(cx, cy, (L.window - 1.5) * PX, 0, Math.PI * 2)
      g.stroke()
      // its name in the window, a little cube over it
      g.strokeStyle = '#b9b7c8'
      g.lineWidth = 0.5 * PX
      const s = 4.2 * PX
      const ex = cx - 21 * PX
      const ey = cy - 0.6 * PX
      g.beginPath()
      g.moveTo(ex, ey - s)
      g.lineTo(ex + s * 0.87, ey - s / 2)
      g.lineTo(ex + s * 0.87, ey + s / 2)
      g.lineTo(ex, ey + s)
      g.lineTo(ex - s * 0.87, ey + s / 2)
      g.lineTo(ex - s * 0.87, ey - s / 2)
      g.closePath()
      g.moveTo(ex, ey)
      g.lineTo(ex, ey + s)
      g.moveTo(ex, ey)
      g.lineTo(ex - s * 0.87, ey - s / 2)
      g.moveTo(ex, ey)
      g.lineTo(ex + s * 0.87, ey - s / 2)
      g.stroke()
      g.fillStyle = '#d9d8e4'
      g.font = `bold ${6 * PX}px Arial, sans-serif`
      g.textAlign = 'left'
      g.textBaseline = 'middle'
      g.fillText('GAMECUBE', cx - 15 * PX, cy + 0.4 * PX)
      g.font = `${2.4 * PX}px Arial, sans-serif`
      g.fillStyle = '#a9a7b8'
      g.fillText('N I N T E N D O', cx - 15 * PX, cy - 5.2 * PX)
    }),
    -L.w / 2,
    L.w / 2,
    -L.d / 2,
    L.d / 2,
  )
  return [bruno({ map: top }), bruno({ color: '#5a4dba', shade: '#3a3070' })]
}

const BODY_GEO = new RoundedBoxGeometry(CW, BODY, CD, 3, CUBE.r)
const LID_GEO = new ExtrudeGeometry(roundRect(L.w, L.d, L.r), { depth: L.t - 2, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2, curveSegments: 12 })
  .rotateX(-Math.PI / 2)
  .translate(0, 1, L.d / 2)
const HANDLE_GEO = (() => {
  const y = CUBE.handle.y
  const z0 = -CD / 2 + 3
  const z1 = -CD / 2 - CUBE.handle.back
  const pts = [
    [-56, z0],
    [-56, z1 + 9],
    [-47, z1],
    [47, z1],
    [56, z1 + 9],
    [56, z0],
  ].map(([x, z]) => new Vector3(x, y, z))
  return new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal', 0.1), 64, CUBE.handle.r, 10)
})()
const BUTTON = new CylinderGeometry(1, 1, 1, 32)
const LAMP = new SphereGeometry(1.7, 12, 8)
const FOOT = new CylinderGeometry(9, 9, FEET, 20)
const PLUG = new RoundedBoxGeometry(15, 12, 22, 2, 3)
const BOOT = new CylinderGeometry(3.6, 4.6, 12, 14).rotateX(Math.PI / 2)
const AVPLUG = new RoundedBoxGeometry(27, 11, 18, 2, 2.5)

const M = {
  grey: bruno({ color: '#dcdce4', shade: '#8e8ea0' }),
  button: bruno({ color: '#4a40a0', shade: '#2e2766' }),
  black: bruno({ color: '#25242b', shade: '#151419' }),
  rubber: bruno({ color: '#1e1d22', shade: '#121115' }),
  lampOff: bruno({ color: '#3c4a3e', shade: '#1e2620' }),
  lampOn: bruno({ color: '#7dff9a', emissive: '#48ff78', emissiveIntensity: 1.2 }),
  spindle: bruno({ color: '#4a4752', shade: '#2a2830' }),
  plug1: bruno({ color: COLORS.indigo, shade: '#3a3070' }),
  plug2: bruno({ color: COLORS.black, shade: '#18171c' }),
}

/** a button on top: clicked, it does its thing, and dips */
function Button({ k, at, r, h, m, act }: { k: string; at: { x: number; z: number }; r: number; h: number; m: ReturnType<typeof bruno>; act: () => void }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const o = ref.current
    if (!o) return
    const p = getCube().pressed[k] ?? -9
    const dip = performance.now() / 1000 - p < 0.16 ? 1.2 : 0
    o.position.y = CH + h / 2 - dip
  })
  return (
    <mesh
      ref={ref}
      geometry={BUTTON}
      material={m}
      position={[at.x, CH + h / 2, at.z]}
      scale={[r, h, r]}
      onClick={(e) => {
        e.stopPropagation()
        act()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    />
  )
}

export function GameCube({ onBody }: { onBody?: (e: ThreeEvent<MouseEvent>) => void }) {
  const c = useCube()
  const body = useMemo(faces, [])
  const lidMats = useMemo(lidFaces, [])
  // the lid on its spring: up with a bounce, shut with a snap
  const lid = useRef<Group>(null)
  const spring = useRef({ a: 0, v: 0 })
  useFrame((_, dt) => {
    const g = lid.current
    if (!g) return
    const s = spring.current
    const open = getCube().lid
    const target = open ? -L.open : 0
    const k = 320
    const damp = open ? 8 : 34
    const h = Math.min(dt, 1 / 30)
    for (let i = 0; i < 4; i++) {
      s.v += (-k * (s.a - target) - damp * s.v) * (h / 4)
      s.a += s.v * (h / 4)
    }
    if (!open && s.a > 0) {
      s.a = 0
      s.v = 0
    }
    g.rotation.x = s.a
  })
  const { power, reset, open } = CUBE.buttons
  return (
    <group>
      <mesh
        geometry={BODY_GEO}
        material={body}
        position={[0, FEET + BODY / 2, 0]}
        castShadow
        receiveShadow
        onClick={(e) => {
          if (!onBody) return
          e.stopPropagation()
          onBody(e)
        }}
      />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={FOOT} material={M.rubber} position={[sx * 52, FEET / 2, sz * 60]} />))}
      <mesh geometry={HANDLE_GEO} material={M.black} castShadow />
      {/* the lid, hinged at its back edge */}
      <group ref={lid} position={[0, CH + L.gap, L.hingeZ]} userData={{ live: true }}>
        <mesh
          geometry={LID_GEO}
          material={lidMats}
          castShadow
          onClick={(e) => {
            if (!getCube().lid) return
            e.stopPropagation()
            shutLid()
          }}
        />
      </group>
      {/* the disc on its spindle under the lid */}
      <mesh geometry={BUTTON} material={M.spindle} position={[0, CH + 0.5, LID_Z]} scale={[7, 1, 7]} />
      <group ref={anchor('seat-console')} position={[0, CH + 0.2, LID_Z]} userData={{ live: true }}>
        {c.disc === 'console' && <Disc onClick={() => c.lid && moveDisc()} />}
      </group>
      {/* the buttons, and the power lamp (live: they move, it changes) */}
      <group userData={{ live: true }}>
        <Button k="power" at={power} r={power.r} h={3} m={M.grey} act={pressPower} />
        <Button k="reset" at={reset} r={reset.r} h={2.4} m={M.button} act={pressReset} />
        <Button k="open" at={open} r={open.r} h={2.6} m={M.button} act={pressOpen} />
        <mesh geometry={LAMP} material={c.power ? M.lampOn : M.lampOff} position={[CUBE.lamp.x, CH + 0.4, CUBE.lamp.z]} />
      </group>
      {/* the controllers' plugs in ports 1 and 2, the AV plug in the back */}
      {[0, 1].map((i) => (
        <group key={i} position={[CUBE.ports.xs[i], CUBE.ports.y, CD / 2]}>
          <mesh geometry={PLUG} material={i ? M.plug2 : M.plug1} position={[0, 0, 7]} castShadow />
          <mesh geometry={BOOT} material={i ? M.plug2 : M.plug1} position={[0, 0, 22]} />
          <group ref={anchor(`port${i + 1}`)} position={[0, 0, 27]} />
        </group>
      ))}
      <group position={[20, 39, -CD / 2]}>
        <mesh geometry={AVPLUG} material={M.black} position={[0, 0, -7]} castShadow />
        <mesh geometry={BOOT} material={M.black} position={[0, 0, -20]} />
        <group ref={anchor('avout')} position={[0, 0, -25]} rotation={[0, Math.PI, 0]} />
      </group>
    </group>
  )
}
