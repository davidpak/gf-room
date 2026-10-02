import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, CircleGeometry, DoubleSide, CanvasTexture, CylinderGeometry, Euler, LatheGeometry, Quaternion, SRGBColorSpace, SphereGeometry, TorusGeometry, Vector2, Vector3, type Group, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bruno } from '../quad/bruno'
import { needle } from '../records/play'
import { JS120, L100, onStand } from './spec'

/**
 * The JBL L100 Classic (./spec) on its JS-120 stand, in the toy look (matte, the walnut warm, the darks plum).
 *
 *   the cabinet   walnut veneer sides, top and bottom; the front and back black, the front's thin walnut edge painted
 *                 into its own picture (no strips stuck on)
 *   the baffle    bare (no grille: it's a speaker, its drivers on show): the 12" woofer (its cream pulp cone, dark
 *                 surround, the dust cap, its frame's screws), the 5¼" midrange beside the 5" port, the titanium dome
 *                 above toward the middle, the HF and MF knobs upper left, the JBL badge under the woofer
 *   the stand     square tube: the base frame on the floor, the uprights at the back, the platform tilted back 7° with
 *                 felt along its sides, the felt-faced backstop, four round feet
 *
 * While a record plays (../records/play) the woofer and midrange pump. All in mm; ./spec has the frames.
 */
const W = L100
const C = W.colors

// ---- pictures: the walnut's grain, the front's black with its walnut edge, the badge
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
/** walnut: straight grain along v (up the sides), its figure darker and lighter in long streaks */
function walnut(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = C.walnut
  g.fillRect(0, 0, w, h)
  let s = 7
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 90; i++) {
    const x = rand() * w
    g.strokeStyle = rand() < 0.5 ? `rgba(90, 52, 28, ${0.06 + rand() * 0.1})` : `rgba(210, 160, 110, ${0.05 + rand() * 0.08})`
    g.lineWidth = 1 + rand() * 4
    g.beginPath()
    for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.01 + i) * 3, y)
    g.stroke()
  }
}
const front = () =>
  canvas(390, 637, (g) => {
    walnut(g, 390, 637)
    g.fillStyle = C.baffle
    g.fillRect(W.edge, W.edge, 390 - 2 * W.edge, 637 - 2 * W.edge)
  })
const badgeTex = () =>
  canvas(256, 112, (g) => {
    // the JBL mark: the letters in orange on its silver plate, bold, a dot over the J's stem
    g.fillStyle = '#d9d6e0'
    g.fillRect(0, 0, 256, 112)
    g.fillStyle = '#ef7a2e'
    g.font = "900 78px 'Arial Black', 'Nunito', sans-serif"
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('JBL', 128, 62)
    g.fillRect(64, 8, 14, 14)
  })

// ---- the parts' shapes (built once)
/** the cone's dish: from the dust cap out to its rim, a shallow curve; its middle just off the baffle, its rim up
 *  (in front of the box's face: the box isn't cut, so nothing can sink into it) */
function cone(r: number, dust: number, depth: number) {
  const pts: Vector2[] = []
  for (let i = 0; i <= 8; i++) {
    const u = i / 8
    pts.push(new Vector2(dust + (r - dust) * u, 1 + depth * (1 - (1 - u) * (1 - u * 0.3))))
  }
  return new LatheGeometry(pts, 40).rotateX(Math.PI / 2)
}
/** the screws round a driver's frame: n domed heads on a circle of radius r, on the frame's face */
function screwRing(r: number, n: number, head: number) {
  return mergeGeometries(
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / n
      return new SphereGeometry(head, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.6).translate(Math.cos(a) * r, Math.sin(a) * r, 4)
    }),
  )!
}
/** a flat ring, r0 to r1, t thick, its back at z 0 */
function annulus(r0: number, r1: number, t: number) {
  return new LatheGeometry([new Vector2(r0, 0), new Vector2(r1, 0), new Vector2(r1, t), new Vector2(r0, t), new Vector2(r0, 0)], 48).rotateX(Math.PI / 2)
}
const SHAPES = (() => {
  const cab = new RoundedBoxGeometry(W.w, W.h, W.d, 3, W.round).translate(0, W.h / 2, 0)
  return {
    cab,
    badge: new RoundedBoxGeometry(W.badge.w, W.badge.h, 3, 1, 1),
    // the drivers (their faces toward +z, their backs at z 0)
    ring: (r: number, w: number, t: number) => new CylinderGeometry(r, r, t, 48).rotateX(Math.PI / 2).translate(0, 0, t / 2),
    surround: (r: number, tube: number) => new TorusGeometry(r, tube, 8, 48),
    cone,
    cap: (r: number, k: number) => new SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, k),
    knob: new CylinderGeometry(W.knobs.r, W.knobs.r, W.knobs.h, 24).rotateX(Math.PI / 2).translate(0, 0, W.knobs.h / 2),
    tick: new BoxGeometry(2.4, W.knobs.r * 0.8, 1),
  }
})()
/** (the port's lip and the tweeter's parts, made once) */
const MORE = {
  portLip: SHAPES.surround(W.port.r + W.port.flare / 2, W.port.flare / 2),
  tweetPlate: SHAPES.ring(W.tweeter.r, 0, 4),
  tweetRing: SHAPES.surround(W.tweeter.dome + 4, 2.5),
  dome: SHAPES.cap(W.tweeter.dome, 0.8),
}
const M_SILVER = bruno({ color: '#cfd2dc', shade: '#7d7a99' })
const M = (() => {
  const side = bruno({ map: canvas(256, 512, (g) => walnut(g, 256, 512)), shade: C.walnutShade })
  const black = bruno({ color: C.baffle })
  return {
    cab: [side, side, side, side, bruno({ map: front(), shade: C.walnutShade }), black] as Material[],
    black,
    cone: bruno({ color: C.cone, shade: '#9a8fb0', side: DoubleSide }),
    surround: bruno({ color: C.surround }),
    silver: bruno({ color: C.silver, shade: '#7d7a99', sheen: 0.25 }),
    knob: bruno({ color: '#4a4552' }),
    tick: bruno({ color: '#f4efe6' }),
    portIn: bruno({ color: '#15131a', lit: 0.4, side: DoubleSide }),
    badge: [M_SILVER, M_SILVER, M_SILVER, M_SILVER, bruno({ map: badgeTex(), shade: '#7d7a99' }), M_SILVER] as Material[],
    screw: bruno({ color: '#8c889a' }),
    backDisc: new CircleGeometry(1, 48),
  }
})()
/** a driver: its frame ring, surround, cone and dust cap, at (x, y) on the baffle; `pump` gets its moving parts */
function Driver({ d, pump }: { d: { r: number; cone: number; dust: number; x: number; y: number }; pump: (g: Group | null) => void }) {
  // (the frame a ring round it; the cone a dish 8 deep, the surround round its rim, the cap on its middle)
  const depth = Math.min(10, d.cone * 0.12)
  const g = useMemo(() => ({ screws: screwRing(d.r - (d.r - d.cone) * 0.12, d.r > 100 ? 8 : 4, d.r > 100 ? 3.2 : 2.2), frame: annulus(d.cone + (d.r - d.cone) * 0.75, d.r, 4), surround: SHAPES.surround(d.cone + (d.r - d.cone) * 0.35, (d.r - d.cone) * 0.3), cone: SHAPES.cone(d.cone, d.dust, depth), cap: SHAPES.cap(d.dust, 0.5) }), [d.r, d.cone, d.dust, depth])
  return (
    <group position={[d.x, d.y, W.d / 2]}>
      <mesh geometry={g.frame} material={M.black} />
      <mesh geometry={g.screws} material={M.screw} />
      <mesh geometry={M.backDisc} material={M.portIn} scale={[d.r, d.r, 1]} position={[0, 0, 0.3]} />
      <group ref={pump} userData={{ live: true }}>
        <mesh geometry={g.surround} material={M.surround} position={[0, 0, 1 + depth]} />
        <mesh geometry={g.cone} material={M.cone} />
        <mesh geometry={g.cap} material={M.cone} position={[0, 0, 1.5]} />
      </group>
    </group>
  )
}

/** the speaker (its frame: ./spec). `side` -1 / 1: which of the pair (mirror images: the tweeter toward the middle) */
export function L100Cabinet({ side = 1 }: { side?: -1 | 1 }) {
  const pumps = useRef<(Group | null)[]>([])
  useFrame(({ clock }) => {
    // (a thump on the beat while a record's playing: the woofer most, the midrange less)
    const t = clock.elapsedTime
    const k = needle.playing ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.9)), 8) : 0
    pumps.current.forEach((g, i) => g && (g.position.z = k * (i ? 1.5 : 4)))
  })
  const mx = (x: number) => x * side
  return (
    <group>
      <mesh geometry={SHAPES.cab} material={M.cab} castShadow receiveShadow />
      <Driver d={{ ...W.woofer, x: mx(W.woofer.x) }} pump={(g) => void (pumps.current[0] = g)} />
      <Driver d={{ ...W.mid, x: mx(W.mid.x) }} pump={(g) => void (pumps.current[1] = g)} />
      {/* the port: a flared mouth, dark inside */}
      <group position={[mx(W.port.x), W.port.y, W.d / 2]}>
        <mesh geometry={MORE.portLip} material={M.black} />
        <mesh geometry={M.backDisc} material={M.portIn} scale={[W.port.r, W.port.r, 1]} position={[0, 0, 0.3]} />
      </group>
      {/* the tweeter: its plate, a ring, the titanium dome */}
      <group position={[mx(W.tweeter.x), W.tweeter.y, W.d / 2]}>
        <mesh geometry={MORE.tweetPlate} material={M.black} />
        <mesh geometry={MORE.tweetRing} material={M.surround} position={[0, 0, 4]} />
        <mesh geometry={MORE.dome} material={M.silver} position={[0, 0, 4]} />
      </group>
      {/* the JBL badge, under the woofer */}
      <mesh geometry={SHAPES.badge} material={M.badge} position={[0, W.badge.y, W.d / 2 + 1.5]} />
      {/* the HF and MF attenuators, upper left (as you face it), at their marked 0 */}
      {W.knobs.xs.map((x) => (
        <group key={x} position={[x, W.knobs.y, W.d / 2]}>
          <mesh geometry={SHAPES.knob} material={M.knob} />
          <mesh geometry={SHAPES.tick} material={M.tick} position={[0, W.knobs.r * 0.45, W.knobs.h + 0.5]} />
        </group>
      ))}
    </group>
  )
}

/** the stand (./spec JS120): square tube, plum-dark, felt on its platform and backstop */
const ST = (() => {
  const S = JS120
  const t = S.tube
  const tube = (l: number) => new RoundedBoxGeometry(t, t, l, 1, 2)
  const geos: BufferGeometry[] = []
  const put = (g: BufferGeometry, p: [number, number, number], r?: [number, number, number]) => {
    if (r) g.applyQuaternion(new Quaternion().setFromEuler(new Euler(...r)))
    geos.push(g.translate(...p))
  }
  const fy = S.feet.h
  // the base frame on the floor (on its feet), its sides along z, its front and back along x
  const bx = S.w / 2 - t / 2
  const bz = S.d / 2 - t / 2
  put(tube(S.d), [-bx, fy + t / 2, 0])
  put(tube(S.d), [bx, fy + t / 2, 0])
  put(tube(S.w - 2 * t), [0, fy + t / 2, bz], [0, Math.PI / 2, 0])
  put(tube(S.w - 2 * t), [0, fy + t / 2, -bz], [0, Math.PI / 2, 0])
  // the uprights at the back, up to the platform's back
  const up = S.back - fy - t
  put(tube(up), [-bx, fy + t + up / 2, -bz], [Math.PI / 2, 0, 0])
  put(tube(up), [bx, fy + t + up / 2, -bz], [Math.PI / 2, 0, 0])
  // the platform: a frame tilted back (its front up), its back on the uprights
  const pd = S.platform.d
  const plat: BufferGeometry[] = [tube(pd).translate(-bx, 0, pd / 2), tube(pd).translate(bx, 0, pd / 2), tube(S.w - 2 * t).rotateY(Math.PI / 2).translate(0, 0, pd - t / 2), tube(S.w - 2 * t).rotateY(Math.PI / 2).translate(0, 0, t / 2)]
  const tilt = new Quaternion().setFromEuler(new Euler(-S.tilt, 0, 0))
  const platAt = new Vector3(0, S.back - S.felt.t - t / 2, -S.d / 2) // (its felt's top at the speaker's bottom)
  plat.forEach((g) => geos.push(g.applyQuaternion(tilt).translate(platAt.x, platAt.y, platAt.z)))
  // the backstop: a frame standing up off the platform's back, to the stand's full height
  const bh = S.h - S.back
  const bw = S.backstop.w
  const f = S.backstop.frame
  const stop = [new RoundedBoxGeometry(bw, f, f, 1, 2).translate(0, bh - f / 2, 0), new RoundedBoxGeometry(f, bh, f, 1, 2).translate(-bw / 2 + f / 2, bh / 2, 0), new RoundedBoxGeometry(f, bh, f, 1, 2).translate(bw / 2 - f / 2, bh / 2, 0)]
  stop.forEach((g) => geos.push(g.applyQuaternion(tilt).translate(0, S.back, -S.d / 2 + t / 2)))
  const frame = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)))!
  // the felt: strips along the platform's sides, a pad on the backstop's face
  const felts = [new BoxGeometry(S.felt.w, S.felt.t, pd - 2 * t).translate(-bx, t / 2 + S.felt.t / 2, pd / 2), new BoxGeometry(S.felt.w, S.felt.t, pd - 2 * t).translate(bx, t / 2 + S.felt.t / 2, pd / 2)].map((g) => g.applyQuaternion(tilt).translate(platAt.x, platAt.y, platAt.z))
  felts.push(new BoxGeometry(bw - 2, bh - 4, S.felt.t).translate(0, bh / 2, t / 2 + S.felt.t / 2).applyQuaternion(tilt).translate(0, S.back, -S.d / 2 + t / 2))
  const felt = mergeGeometries(felts.map((g) => (g.index ? g.toNonIndexed() : g)))!
  const feet = mergeGeometries([-1, 1].flatMap((sx) => [-1, 1].map((sz) => new CylinderGeometry(S.feet.r, S.feet.r, S.feet.h, 16).translate(sx * bx, S.feet.h / 2, sz * bz).toNonIndexed())))!
  return { frame, felt, feet }
})()
const STAND_M = { frame: bruno({ color: JS120.color }), felt: bruno({ color: JS120.feltColor }), feet: bruno({ color: '#25222a' }) }
export function JS120Stand() {
  return (
    <group>
      <mesh geometry={ST.frame} material={STAND_M.frame} castShadow receiveShadow />
      <mesh geometry={ST.felt} material={STAND_M.felt} receiveShadow />
      <mesh geometry={ST.feet} material={STAND_M.feet} />
    </group>
  )
}

/** the speaker on its stand (its frame: the stand's, its feet on y 0). `side`: which of the pair */
export function SpeakerOnStand({ side = 1 }: { side?: -1 | 1 }) {
  const o = useMemo(onStand, [])
  return (
    <group>
      <JS120Stand />
      <group position={[o.x, o.y, o.z]} rotation={[-o.tilt, 0, 0]}>
        <L100Cabinet side={side} />
      </group>
    </group>
  )
}
