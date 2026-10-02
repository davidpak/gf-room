import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, SRGBColorSpace, Vector2, type Texture } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { Static } from '../../lib/render/Static'
import { EW, deckY } from './victrola'
import { getDeck, live, now } from './deck'
import { needle } from './play'

/**
 * The Victrola Eastwood (./victrola), built to its spec: bamboo sides and back, the black body with its mesh front
 * (VICTROLA in its corner), the top printed with the strip's labels, its display lit blue, the five buttons, the two
 * knobs; the silver-grey platter and spindle; the ribbed plate with the 45 adapter in its rest; the arm on its fixed
 * block, with its cue lever and rest; the clear lid, hinged at the back, open on the left.
 *
 * Its frame: the cabinet's middle, its feet at y 0, the grille toward +z. The moving parts follow `live` (./deck);
 * `on` the handlers for its parts (by name).
 */
const C = EW.colors
const T = EW.cab
const IN = EW.w / 2 - EW.side // 149: inside the sides
const FRONT = EW.d / 2 // 156
const BACK = -EW.d / 2 // -156

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** bamboo-printed board: fine straight grain along its length (u), the odd darker node */
function bamboo() {
  return canvas(512, 512, (g) => {
    g.fillStyle = C.bamboo
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 160; i++) {
      const y = (i * 97.13) % 512
      g.fillStyle = `rgba(150, 105, 50, ${0.05 + ((i * 37) % 10) / 120})`
      g.fillRect(0, y, 512, 0.8 + ((i * 13) % 3) * 0.6)
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = 'rgba(160, 110, 55, 0.12)'
      g.fillRect((i * 173) % 512, 0, 3, 512)
    }
  })
}

// the top: 4 px a mm, x to the right, its rows from the back (z -144) to the front (z 156)
const PX = 4
const TOP_Z0 = -144
const tx = (x: number) => (x + IN) * PX
const tz = (z: number) => (z - TOP_Z0) * PX
const segs: Record<string, number[]> = {
  // seven segments a b c d e f g
  H: [0, 1, 1, 0, 1, 1, 1], I: [0, 1, 1, 0, 0, 0, 0], P: [1, 1, 0, 0, 1, 1, 1], b: [0, 0, 1, 1, 1, 1, 1], t: [0, 0, 0, 1, 1, 1, 1],
  '0': [1, 1, 1, 1, 1, 1, 0], '1': [0, 1, 1, 0, 0, 0, 0], '2': [1, 1, 0, 1, 1, 0, 1], '3': [1, 1, 1, 1, 0, 0, 1], '4': [0, 1, 1, 0, 0, 1, 1],
  '5': [1, 0, 1, 1, 0, 1, 1], '6': [1, 0, 1, 1, 1, 1, 1], '7': [1, 1, 1, 0, 0, 0, 0], '8': [1, 1, 1, 1, 1, 1, 1], '9': [1, 1, 1, 1, 0, 1, 1], '-': [0, 0, 0, 0, 0, 0, 1], ' ': [0, 0, 0, 0, 0, 0, 0],
}
function seven(g: CanvasRenderingContext2D, ch: string, x: number, y: number, w: number, h: number, lit: string, unlit: string) {
  const s = segs[ch] ?? segs[' ']
  const t = w * 0.18
  const bars: [number, number, number, number][] = [
    [x + t, y, w - 2 * t, t], // a
    [x + w - t, y + t, t, h / 2 - 1.5 * t], // b
    [x + w - t, y + h / 2 + t / 2, t, h / 2 - 1.5 * t], // c
    [x + t, y + h - t, w - 2 * t, t], // d
    [x, y + h / 2 + t / 2, t, h / 2 - 1.5 * t], // e
    [x, y + t, t, h / 2 - 1.5 * t], // f
    [x + t, y + h / 2 - t / 2, w - 2 * t, t], // g
  ]
  bars.forEach((b, i) => {
    g.fillStyle = s[i] ? lit : unlit
    g.fillRect(b[0] + w * 0.08 * (1 - (b[1] - y) / h), b[1], b[2], b[3]) // (leaning a touch)
  })
}

/** the top's printing; and its glow (the display, the power symbol), redrawn when what they say changes */
function topArt() {
  const W = 2 * IN * PX
  const H = (FRONT - TOP_Z0) * PX
  const label = (g: CanvasRenderingContext2D, text: string, x: number, z: number, size = 2.2, color = '#d8d4de') => {
    g.fillStyle = color
    g.font = `600 ${size * PX}px 'Nunito', Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, tx(x), tz(z))
  }
  const map = canvas(W, H, (g) => {
    g.fillStyle = C.black
    g.fillRect(0, 0, W, H)
    // a faint brushed grain
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${0.012 + (i % 7) * 0.002})`
      g.fillRect(0, (i * 53.7) % H, W, 1)
    }
    // where the lid meets the strip
    g.fillStyle = 'rgba(0,0,0,0.45)'
    g.fillRect(0, tz(EW.deck.z1) - 2, W, 3)
    const k = EW.controls
    // buttons' names, behind each
    const names = ['⏻', 'BT OUT', '▶❚❚', '◀◀', '▶▶']
    k.buttons.xs.forEach((x, i) => label(g, names[i], x, k.z - 9, i === 1 ? 1.7 : 2.2, i === 0 ? '#e0453a' : '#d8d4de'))
    // the display's bezel and window
    g.fillStyle = '#121016'
    g.fillRect(tx(k.display.x0), tz(k.z - k.display.d / 2), (k.display.x1 - k.display.x0) * PX, k.display.d * PX)
    g.fillStyle = '#06070c'
    g.fillRect(tx(k.display.wx0), tz(k.z - 3.6), (k.display.wx1 - k.display.wx0) * PX, 7.2 * PX)
    // the earphone jack
    g.fillStyle = '#0b0a0e'
    g.beginPath()
    g.arc(tx(k.jack.x), tz(k.z), k.jack.r * PX, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#8d8a96'
    g.lineWidth = 0.8 * PX
    g.beginPath()
    g.arc(tx(k.jack.x), tz(k.z), (k.jack.r + 1) * PX, 0, Math.PI * 2)
    g.stroke()
    label(g, '🎧', k.jack.x, k.z - 9, 2.4)
    // the small knob: BT, PHONO either side; the big one's −/+ arc
    label(g, 'BT', k.knobs.small.x - 15, k.z - 8, 1.8)
    label(g, 'PHONO', k.knobs.small.x + 2, k.z - 15, 1.6)
    g.strokeStyle = '#d8d4de'
    g.lineWidth = 0.5 * PX
    g.beginPath()
    g.arc(tx(k.knobs.big.x), tz(k.z), (k.knobs.big.r + 4) * PX, Math.PI * 0.8, Math.PI * 2.2)
    g.stroke()
    label(g, '−', k.knobs.big.x - 17, k.z + 8, 2.6)
    label(g, '+', k.knobs.big.x + 17, k.z + 8, 2.6)
    // the slides by the arm: their slots and names
    EW.slides.z.forEach((z, i) => {
      g.fillStyle = '#0d0c10'
      g.fillRect(tx(EW.slides.x - 6), tz(z - 1.6), 12 * PX, 3.2 * PX)
      label(g, i ? 'AUTO STOP' : '33  45  78', EW.slides.x, z - 5, 1.6)
    })
    label(g, 'CUE', EW.cue.x, EW.cue.z - 9, 1.6)
  })
  const glow = canvas(W, H, (g) => {
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
  })
  /** what the display says (two characters; '' off), the power symbol lit */
  const show = (text: string) => {
    const c = glow.image as HTMLCanvasElement
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, c.width, c.height)
    const k = EW.controls
    const cw = 6 * PX
    const ch = 5.4 * PX
    const x0 = tx((k.display.wx0 + k.display.wx1) / 2) - cw - 1.5 * PX
    const y0 = tz(k.z) - ch / 2
    ;[...text.padEnd(2).slice(0, 2)].forEach((c2, i) => seven(g, c2, x0 + i * (cw + 3 * PX), y0, cw, ch, text ? C.display : '#000', text ? '#0a1a2c' : '#000'))
    if (text) {
      // the power symbol, red, lit
      g.fillStyle = '#ff4a3c'
      g.font = `600 ${2.2 * PX}px 'Nunito', Arial, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('⏻', tx(k.buttons.xs[0]), tz(k.z - 9))
    }
    glow.needsUpdate = true
  }
  return { map, glow, show }
}

/** the front: the black band over the mesh, the mesh, the badge (its rows from the top, y 85, down to y 9) */
function frontArt() {
  const W = 2 * IN * 4
  const H = (T - EW.grille.y0) * 4
  return canvas(W, H, (g) => {
    g.fillStyle = C.black
    g.fillRect(0, 0, W, H)
    const top = (T - EW.grille.y1) * 4
    g.fillStyle = C.mesh
    g.fillRect(0, top, W, H - top)
    // the woven mesh: tiny lighter dots on a grid
    for (let y = top + 2; y < H; y += 4)
      for (let x = ((y / 4) % 2) * 2; x < W; x += 4) {
        g.fillStyle = 'rgba(120,115,130,0.35)'
        g.fillRect(x, y, 1.6, 1.6)
      }
    g.fillStyle = 'rgba(0,0,0,0.5)'
    g.fillRect(0, top - 2, W, 3)
    // VICTROLA, white, its letters tall and narrow
    g.save()
    g.fillStyle = '#f2efe8'
    g.font = `700 ${7 * 4}px 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const bx = (EW.badge.x + IN) * 4
    const by = (T - EW.badge.y) * 4
    g.translate(bx, by)
    g.scale(0.82, 1)
    ;(g as unknown as { letterSpacing: string }).letterSpacing = `${1.2 * 4}px`
    g.fillText('VICTROLA', 0, 0)
    g.restore()
  })
}

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d)
/** a lathe from (r, y) pairs, bottom up (faces out) */
const lathe = (pts: [number, number][], n = 64) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), n)

export type Parts = 'power' | 'bt' | 'playpause' | 'prev' | 'next' | 'small' | 'big' | 'lid' | 'arm' | 'cue' | 'platter'
export function Eastwood({ on = {}, children }: { on?: Partial<Record<Parts, (e: ThreeEvent<PointerEvent>) => void>>; children?: React.ReactNode }) {
  const m = useMemo(() => {
    const wood = bamboo()
    const top = topArt()
    return {
      top,
      bamboo: bruno({ map: wood, shade: C.bambooShade }),
      bambooEnd: bruno({ map: wood, shade: C.bambooShade }),
      black: bruno({ color: C.black }),
      topMat: bruno({ map: top.map, emissive: new Color('#ffffff'), emissiveMap: top.glow, warm: 0.6 }),
      front: bruno({ map: frontArt() }),
      platter: bruno({ color: C.platter, sheen: 0.25 }),
      platterTop: bruno({ map: platterArt() }),
      silver: bruno({ color: C.silver, sheen: 0.4 }),
      knurl: bruno({ map: knurlArt(), sheen: 0.35 }),
      cart: bruno({ color: '#e9e8ec' }),
      lid: bruno({ color: '#e8f1fa', transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide, sheen: 0.55 }),
      hinge: bruno({ color: '#e8f1fa', transparent: true, opacity: 0.4, depthWrite: false, sheen: 0.4 }),
      ribs: bruno({ map: ribArt() }),
    }
  }, [])
  const g = useMemo(() => {
    const P = EW.platter
    const k = EW.controls
    return {
      side: new RoundedBoxGeometry(EW.side, T - EW.feet, EW.d, 2, 2.5),
      back: new RoundedBoxGeometry(2 * IN, T - EW.feet, EW.back, 2, 2),
      core: box(2 * IN, T - EW.grille.y0, FRONT - TOP_Z0),
      plinth: box(2 * IN - 8, EW.grille.y0 - EW.feet, FRONT - TOP_Z0 - 10),
      foot: new CylinderGeometry(8, 8, EW.feet, 16),
      platterRim: lathe([
        [P.r - 3, 0],
        [P.r, 2.5],
        [P.r, P.h - 1.2],
        [P.r - 1.2, P.h],
      ]),
      platterTop: new CircleGeometry(P.r - 1.2, 72).rotateX(-Math.PI / 2),
      spindle: lathe([
        [EW.platter.spindle, 0],
        [EW.platter.spindle, P.spindleH - 2],
        [EW.platter.spindle - 1, P.spindleH - 0.5],
        [1.2, P.spindleH],
        [0, P.spindleH],
      ], 20),
      button: lathe([
        [1, 0],
        [1, k.buttons.h - 0.6],
        [0.8, k.buttons.h],
        [0, k.buttons.h],
      ], 20),
      knob: lathe([
        [1, 0],
        [1, 0.88],
        [0.93, 1],
        [0, 1],
      ], 40),
      plate: box(EW.plate.x1 - EW.plate.x0, 1.6, EW.plate.z1 - EW.plate.z0),
      adapter: lathe([
        [19, 0],
        [19, 6],
        [17.5, 7.5],
        [4, 7.5],
        [4, 7.5],
      ], 40),
      block: new RoundedBoxGeometry(EW.arm.block.w, EW.arm.block.h, EW.arm.block.d, 2, 3),
      tube: new CylinderGeometry(EW.arm.tube, EW.arm.tube, 1, 16).rotateX(Math.PI / 2),
      head: box(EW.arm.head.w, 3, EW.arm.head.l),
      cart: box(10, 6, 16),
      stylus: new CylinderGeometry(0.2, 0.9, 0.8, 8),
      lift: box(2, 2, 12),
      rest: new CylinderGeometry(3, 4, 1, 12),
      cue: box(4, 10, 14),
      slide: box(4, 3, 3),
      lidTop: box(2 * EW.w / 2 - 2, EW.lid.t, EW.deck.z1 - BACK - 6),
      lidFront: box(2 * EW.w / 2 - 2, EW.h - T, EW.lid.t),
      lidSide: box(EW.lid.t, EW.h - T, EW.deck.z1 - BACK - 6),
      lidHinge: box(26, 14, 10),
    }
  }, [])
  // what the display says follows the deck
  const said = useRef('?')
  const platter = useRef<Group>(null)
  const arm = useRef<Group>(null)
  const armLift = useRef<Group>(null)
  const lid = useRef<Group>(null)
  const knobBig = useRef<Mesh>(null)
  const knobSmall = useRef<Mesh>(null)
  const buttons = useRef<(Mesh | null)[]>([])
  useFrame((_, dt) => {
    const d = getDeck()
    const t = now()
    // the display
    const text = !d.power ? '' : t - d.poweredAt < 1.2 ? 'HI' : d.mode === 'bt' ? 'bt' : needle.playing ? String(needle.band + 1).padStart(2, '0') : 'PH'
    if (text !== said.current) {
      said.current = text
      m.top.show(text)
    }
    if (platter.current) platter.current.rotation.y = -live.turn
    if (arm.current) arm.current.rotation.y = -live.a
    if (armLift.current) armLift.current.rotation.x = -live.lift * 0.14
    if (lid.current) lid.current.rotation.x = -live.lid * EW.lid.open
    if (knobBig.current) knobBig.current.rotation.y = -(d.volume - 0.5) * Math.PI * 1.4
    if (knobSmall.current) knobSmall.current.rotation.y = d.mode === 'bt' ? 0.9 : -0.9
    const names = ['power', 'bt', 'playpause', 'prev', 'next']
    buttons.current.forEach((b, i) => {
      if (!b) return
      const since = t - (d.pressed[names[i]] ?? -10)
      b.position.y = deckY - (since < 0.18 ? 1.2 : 0)
    })
    void dt
  })
  useEffect(() => () => Object.values(m).forEach((x) => (x as { dispose?: () => void }).dispose?.()), [m])
  const hand = (name: Parts) =>
    on[name]
      ? {
          onPointerDown: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            on[name]!(e)
          },
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            document.body.style.cursor = name === 'arm' ? 'grab' : 'pointer'
          },
          onPointerOut: () => (document.body.style.cursor = ''),
        }
      : {}
  const P = EW.platter
  const k = EW.controls
  const A = EW.arm
  const sideY = EW.feet + (T - EW.feet) / 2
  return (
    <Static>
    <group>
      {/* the cabinet */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={g.side} material={m.bamboo} position={[s * (EW.w / 2 - EW.side / 2), sideY, 0]} castShadow receiveShadow />
      ))}
      <mesh geometry={g.back} material={m.bambooEnd} position={[0, sideY, BACK + EW.back / 2]} castShadow receiveShadow />
      <mesh geometry={g.core} material={[m.black, m.black, m.topMat, m.black, m.front, m.black]} position={[0, (T + EW.grille.y0) / 2, (FRONT + TOP_Z0) / 2]} castShadow receiveShadow />
      <mesh geometry={g.plinth} material={m.black} position={[0, (EW.grille.y0 + EW.feet) / 2, (FRONT + TOP_Z0) / 2 - 4]} />
      {[
        [-140, -130],
        [140, -130],
        [-140, 140],
        [140, 140],
      ].map(([x, z], i) => (
        <mesh key={i} geometry={g.foot} material={m.black} position={[x, EW.feet / 2, z]} />
      ))}
      {/* the strip's buttons and knobs */}
      <group {...hand('power')} userData={{ live: true }}>
        <mesh ref={(o) => void (buttons.current[0] = o)} geometry={g.button} material={m.silver} position={[k.buttons.xs[0], deckY, k.z]} scale={[k.buttons.r[0], 1, k.buttons.r[0]]} />
      </group>
      {(['bt', 'playpause', 'prev', 'next'] as const).map((n, i) => (
        <group key={n} {...hand(n)} userData={{ live: true }}>
          <mesh ref={(o) => void (buttons.current[i + 1] = o)} geometry={g.button} material={m.silver} position={[k.buttons.xs[i + 1], deckY, k.z]} scale={[k.buttons.r[i + 1], 1, k.buttons.r[i + 1]]} />
        </group>
      ))}
      <group userData={{ live: true }}>
      <mesh ref={knobSmall} {...hand('small')} geometry={g.knob} material={m.knurl} position={[k.knobs.small.x, deckY, k.z]} scale={[k.knobs.small.r, k.knobs.small.h, k.knobs.small.r]} castShadow />
      <mesh ref={knobBig} {...hand('big')} geometry={g.knob} material={m.knurl} position={[k.knobs.big.x, deckY, k.z]} scale={[k.knobs.big.r, k.knobs.big.h, k.knobs.big.r]} castShadow />
      </group>
      {/* the platter, turning; what's on it turns with it */}
      <group position={[P.x, deckY, P.z]}>
        <group ref={platter} {...hand('platter')} userData={{ live: true }}>
          <mesh geometry={g.platterRim} material={m.platter} castShadow receiveShadow />
          <mesh geometry={g.platterTop} material={m.platterTop} position={[0, P.h, 0]} receiveShadow />
          <mesh geometry={g.spindle} material={m.silver} position={[0, P.h, 0]} />
          <group position={[0, P.h, 0]}>{children}</group>
        </group>
      </group>
      {/* the ribbed plate round the pivot, the 45 adapter in its rest */}
      <mesh geometry={g.plate} material={m.ribs} position={[(EW.plate.x0 + EW.plate.x1) / 2, deckY + 0.8, (EW.plate.z0 + EW.plate.z1) / 2]} receiveShadow />
      <mesh geometry={g.adapter} material={m.silver} position={[EW.adapter.x, deckY + 1.6, EW.adapter.z]} castShadow />
      {/* the slides and the cue lever */}
      {EW.slides.z.map((z, i) => (
        <mesh key={z} geometry={g.slide} material={m.silver} position={[EW.slides.x + (i ? 3 : -3), deckY + 1.5, z]} />
      ))}
      <mesh geometry={g.cue} material={m.black} position={[EW.cue.x, deckY + 5, EW.cue.z]} {...hand('cue')} castShadow />
      {/* the arm's rest */}
      <mesh geometry={g.rest} material={m.black} position={[A.pivot.x, deckY + (A.height - A.tube) / 2, A.pivot.z + A.L * 0.62]} scale={[1, A.height - A.tube, 1]} castShadow />
      {/* the arm: its fixed block, and the arm swinging out of it */}
      <mesh geometry={g.block} material={m.black} position={[A.pivot.x, deckY + A.block.h / 2, A.pivot.z - 8]} castShadow />
      <group position={[A.pivot.x, deckY + A.height, A.pivot.z]}>
        <group ref={arm} userData={{ live: true }}>
          <group ref={armLift} {...hand('arm')}>
            <mesh geometry={g.tube} material={m.silver} position={[0, 0, A.L / 2]} scale={[1, 1, A.L - 32]} castShadow />
            {/* the headshell, turned in toward the spindle, the cartridge under it, the finger lift out its side */}
            {/* (placed so the stylus, 14 along the turned-in head, is at (0, L): where ./victrola puts the needle) */}
            <group position={[14 * Math.sin(A.head.angle), 0, A.L - 14 * Math.cos(A.head.angle)]} rotation={[0, -A.head.angle, 0]}>
              <mesh geometry={g.head} material={m.black} position={[0, 1, 6]} castShadow />
              {/* (the stylus just touching a record on the platter, the arm down: 5.2 under the tube) */}
              <mesh geometry={g.cart} material={m.cart} position={[0, -1.4, 9]} castShadow />
              <mesh geometry={g.stylus} material={m.black} position={[0, -4.8, 14]} />
              <mesh geometry={g.lift} material={m.black} position={[9, 0.5, 4]} rotation={[0, 0.6, 0]} />
            </group>
          </group>
        </group>
      </group>
      {/* the lid, hinged at the back */}
      <group position={[0, deckY + EW.lid.hinge.y, EW.lid.hinge.z]}>
        <group ref={lid} {...hand('lid')} userData={{ live: true }}>
          <group position={[0, -EW.lid.hinge.y, -EW.lid.hinge.z]}>
            <mesh geometry={g.lidTop} material={m.lid} position={[0, EW.h - T - EW.lid.t / 2, (EW.deck.z1 + BACK + 6) / 2]} />
            <mesh geometry={g.lidFront} material={m.lid} position={[0, (EW.h - T) / 2, EW.deck.z1 - EW.lid.t / 2]} />
            <mesh geometry={g.lidFront} material={m.lid} position={[0, (EW.h - T) / 2, BACK + 6 + EW.lid.t / 2]} />
            <mesh geometry={g.lidSide} material={m.lid} position={[EW.w / 2 - 1 - EW.lid.t / 2, (EW.h - T) / 2, (EW.deck.z1 + BACK + 6) / 2]} />
          </group>
        </group>
        {EW.lid.hinge.xs.map((x) => (
          <mesh key={x} geometry={g.lidHinge} material={m.hinge} position={[x, 2, -3]} />
        ))}
      </group>
    </group>
    </Static>
  )
}

/** the platter's top: silver-grey, a ring round its middle, eight slots, two strobe dots */
function platterArt(): Texture {
  return canvas(512, 512, (g) => {
    const c = 256
    g.fillStyle = C.platter
    g.fillRect(0, 0, 512, 512)
    const k = 256 / (EW.platter.r - 1.2)
    g.strokeStyle = 'rgba(80,80,95,0.35)'
    g.lineWidth = 2
    ;[EW.platter.hub, EW.platter.hub - 3, 30, 22].forEach((r) => {
      g.beginPath()
      g.arc(c, c, r * k, 0, Math.PI * 2)
      g.stroke()
    })
    // the textured ring
    for (let r = EW.platter.hub + 5; r < EW.platter.r - 4; r += 1.4) {
      g.strokeStyle = `rgba(90,90,110,${0.06 + (r % 3) * 0.02})`
      g.lineWidth = 1
      g.beginPath()
      g.arc(c, c, r * k, 0, Math.PI * 2)
      g.stroke()
    }
    g.strokeStyle = 'rgba(60,60,75,0.6)'
    g.lineWidth = 5
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2
      const r0 = (i % 2 ? 55 : 62) * k
      const r1 = (i % 2 ? 75 : 85) * k
      g.beginPath()
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0)
      g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1)
      g.stroke()
    }
  })
}
/** the knobs' knurled sides (u round), their tops brushed (the lathe's top maps to the top rows) */
function knurlArt(): Texture {
  return canvas(256, 64, (g) => {
    g.fillStyle = C.silver
    g.fillRect(0, 0, 256, 64)
    for (let x = 0; x < 256; x += 4) {
      g.fillStyle = 'rgba(110,112,125,0.45)'
      g.fillRect(x, 0, 1.6, 64)
    }
  })
}
/** the ribbed plate: fine lines along x */
function ribArt(): Texture {
  return canvas(256, 128, (g) => {
    g.fillStyle = '#2c2931'
    g.fillRect(0, 0, 256, 128)
    for (let y = 0; y < 128; y += 5) {
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.fillRect(0, y, 256, 2)
    }
  })
}
