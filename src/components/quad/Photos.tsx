import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, CatmullRomCurve3, Quaternion, SRGBColorSpace, TubeGeometry, Vector3, type Group, type Material, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from './bruno'
import { SET } from './set'
import type { CarState } from './Car'
import { clickSpot, frameAround, getLook, lookBack, stepLook, useLook, type Spot } from './look'

/**
 * Their photos, out on the Quad (built by `npm run photos` into public/photos, see scripts/photos.mjs):
 *
 *   the bench photo     the two of them on a bench by the cherries: its polaroid on a little easel
 *                       beside that very bench
 *   the cherry shoot    pegged along two clotheslines strung between the trunks they stood under,
 *                       swaying a little, more when the car goes by
 *
 * Only the Quad's own photos are out here; the rest wait for places of their own (a <Board> each
 * stretch of time, its months on a paper tag, is ready for them).
 *
 * Click the easel or a clothesline and the camera glides in to take the spot in; click a photo there
 * and it frames just that one, ← → along to the ones beside it; Esc goes back a step (./look, ./Car).
 * Photos are drawn into their polaroid's texture (card, photo, no stickers).
 */
export type Photo = { id: string; set: string; src: string; thumb: string; w: number; h: number; taken: string | null }

// ---- the photos, loaded once
let photos: Photo[] | null = null
const subs = new Set<() => void>()
if (typeof window !== 'undefined')
  fetch('/photos/manifest.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((list: Photo[]) => {
      photos = list
      subs.forEach((f) => f())
    })
const usePhotos = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => photos)
const byName = (list: Photo[], set: string, names: string[]) => names.map((n) => list.find((p) => p.id === `${set}/${n}`)).filter((p): p is Photo => !!p)

/** the day a photo was taken, as it was in Seattle */
const dayOf = (p: Photo) => (p.taken ? new Date(p.taken).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase() : '')
const MONTH = (p: Photo) => new Date(p.taken!).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short' }).toLowerCase()
const YEAR = (p: Photo) => new Date(p.taken!).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' })
/** a board's tag: the months its photos span ("sep – dec 2023", "april 2025") */
function monthsOf(ps: Photo[]) {
  const dated = ps.filter((p) => p.taken)
  if (!dated.length) return ''
  const [a, b] = [dated[0], dated[dated.length - 1]]
  if (MONTH(a) === MONTH(b) && YEAR(a) === YEAR(b)) return new Date(a.taken!).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', year: 'numeric' }).toLowerCase()
  return YEAR(a) === YEAR(b) ? `${MONTH(a)} – ${MONTH(b)} ${YEAR(a)}` : `${MONTH(a)} ${YEAR(a)} – ${MONTH(b)} ${YEAR(b)}`
}

// ---- looking at one: the keys, and a small hint (drawn over the page, outside the canvas)
export function LookControls() {
  const l = useLook()
  useEffect(() => {
    if (!l) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') lookBack()
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') stepLook(1)
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') stepLook(-1)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [l])
  return (
    <div className={'quad-near' + (l ? ' on' : '')}>
      {l && l.i === null && <>click a photo to look closer · </>}
      {l && l.i !== null && l.spot.items.length > 1 && (
        <>
          <kbd>←</kbd> <kbd>→</kbd> the others ·{' '}
        </>
      )}
      <kbd>esc</kbd> {l && l.i !== null ? 'back' : 'back to the car'}
    </div>
  )
}

// ---- a polaroid
const HAND = "'Gaegu', 'Nunito', cursive"
const INK = 'rgba(58,70,122,0.86)' // (a blue ballpoint)
const BACK = bruno({ color: '#f1ece2' })
/** a little number from a photo's id, the same every time (which doodle, how askew the writing sits) */
const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** the print, as instant film would have it: the blacks lifted a little, the shadows a touch cool, the
 *  highlights warm, a soft vignette, a fine grain (gentle: still their photo) */
function develop(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number) {
  const img = g.getImageData(x0, y0, w, h)
  const d = img.data
  let s = seed
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const u = x / w - 0.5
      const v = y / h - 0.5
      const vig = 1 - 0.34 * (u * u + v * v) * 1.6
      const grain = (rand() - 0.5) * 10
      let [r, gg, b] = [d[i], d[i + 1], d[i + 2]]
      const l = (0.3 * r + 0.59 * gg + 0.11 * b) / 255
      r = 14 + r * 0.93 + l * l * 8
      gg = 12 + gg * 0.93 + l * l * 3
      b = 20 + b * 0.9 + (1 - l) * 7 - l * l * 6
      d[i] = r * vig + grain
      d[i + 1] = gg * vig + grain
      d[i + 2] = b * vig + grain
    }
  g.putImageData(img, x0, y0)
}

/** a small pen doodle for a photo with no date to write under it: a heart, a blossom or a star */
function doodle(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: number) {
  g.save()
  g.translate(x, y)
  g.strokeStyle = INK
  g.lineWidth = r * 0.16
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  if (kind === 0) {
    // a heart, drawn in one go
    g.moveTo(0, r * 0.75)
    g.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.55, -r * 1.05, 0, -r * 0.35)
    g.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.3, -r * 0.1, 0, r * 0.75)
  } else if (kind === 1) {
    // a blossom: five loops round a dot
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 - Math.PI / 2
      g.moveTo(0, 0)
      g.quadraticCurveTo(Math.cos(a - 0.45) * r * 1.2, Math.sin(a - 0.45) * r * 1.2, Math.cos(a) * r, Math.sin(a) * r)
      g.quadraticCurveTo(Math.cos(a + 0.45) * r * 1.2, Math.sin(a + 0.45) * r * 1.2, 0, 0)
    }
  } else {
    // a little five-point star
    for (let p = 0; p <= 5; p++) {
      const a = ((p * 2) / 5) * Math.PI * 2 - Math.PI / 2
      p ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    }
  }
  g.stroke()
  g.restore()
}

/** its face: cream card with a paper grain, the print in its window (developed), the wider margin under
 *  it with the day written in pen, or a doodle when there's no day */
function useFace(p: Photo) {
  const [face, setFace] = useState<{ mat: Material; aspect: number } | null>(null)
  useEffect(() => {
    let live = true
    const img = new Image()
    img.onload = () =>
      document.fonts.load(`700 40px 'Gaegu'`).finally(() => {
        if (!live) return
        const W = 512
        const side = 28
        const iw = W - 2 * side
        const ih = Math.round(iw / Math.max(0.72, Math.min(1.33, p.w / p.h)))
        const H = side + ih + 104
        const c = document.createElement('canvas')
        c.width = W
        c.height = H
        const g = c.getContext('2d')!
        const seed = hashOf(p.id)
        let s = seed
        const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
        // the card: cream, a grain, a few fibres, a hair darker at its edges where it's been handled
        g.fillStyle = '#fbf7ee'
        g.fillRect(0, 0, W, H)
        for (let i = 0; i < W * H * 0.05; i++) {
          g.fillStyle = rand() < 0.5 ? 'rgba(120,100,80,0.06)' : 'rgba(255,255,255,0.5)'
          g.fillRect(rand() * W, rand() * H, 1.2, 1.2)
        }
        g.strokeStyle = 'rgba(150,130,110,0.08)'
        g.lineWidth = 1
        for (let i = 0; i < 30; i++) {
          const x = rand() * W
          const y = rand() * H
          const a = rand() * Math.PI
          g.beginPath()
          g.moveTo(x, y)
          g.quadraticCurveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8 + 3, x + Math.cos(a) * 16, y + Math.sin(a) * 16)
          g.stroke()
        }
        const edge = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75)
        edge.addColorStop(0, 'rgba(160,130,100,0)')
        edge.addColorStop(1, 'rgba(160,130,100,0.1)')
        g.fillStyle = edge
        g.fillRect(0, 0, W, H)
        // the print, developed
        const k = Math.max(iw / img.width, ih / img.height)
        g.save()
        g.beginPath()
        g.rect(side, side, iw, ih)
        g.clip()
        g.drawImage(img, side + (iw - img.width * k) / 2, side + (ih - img.height * k) / 2, img.width * k, img.height * k)
        g.restore()
        develop(g, side, side, iw, ih, seed)
        // (the print sits a hair under the card: a soft shadow along its top and left edges)
        const sh = g.createLinearGradient(0, side, 0, side + 6)
        sh.addColorStop(0, 'rgba(60,40,40,0.28)')
        sh.addColorStop(1, 'rgba(60,40,40,0)')
        g.fillStyle = sh
        g.fillRect(side, side, iw, 6)
        const sv = g.createLinearGradient(side, 0, side + 5, 0)
        sv.addColorStop(0, 'rgba(60,40,40,0.2)')
        sv.addColorStop(1, 'rgba(60,40,40,0)')
        g.fillStyle = sv
        g.fillRect(side, side, 5, ih)
        // the margin: the day in pen, a little askew, or a doodle
        const day = dayOf(p)
        const my = side + ih + 104 / 2 + 4
        g.save()
        g.translate(W / 2 + ((seed % 7) - 3) * 4, my)
        g.rotate((((seed >> 3) % 9) - 4) * 0.008)
        if (day) {
          g.fillStyle = INK
          g.font = `700 40px ${HAND}`
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(day, 0, 0)
        } else doodle(g, ((seed >> 5) % 2 ? 1 : -1) * (W / 2 - side - 34), 0, 17, (seed >> 7) % 3)
        g.restore()
        const t = new CanvasTexture(c)
        t.colorSpace = SRGBColorSpace
        t.anisotropy = 8
        // (a little of its own light, so a print keeps its colours in the evening glow)
        setFace({ mat: bruno({ map: t, shade: '#b9a8d6', warm: 0.3, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.32 }), aspect: H / W })
      })
    img.src = p.src // (the full photo: it holds up close)
    return () => void (live = false)
  }, [p])
  return face
}

/** the card's shape: a thin board with a slight curl, as a handled print has: cupped a touch across
 *  its width, its bottom corners lifting */
function cardGeometry(w: number, h: number) {
  const g = new BoxGeometry(w, h, 2.5, 8, 10, 1)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (w / 2)
    const y = pos.getY(i) / (h / 2)
    const lift = Math.max(0, Math.abs(x) - 0.55) * Math.max(0, -y - 0.45) * w * 0.05
    pos.setZ(i, pos.getZ(i) + x * x * w * 0.012 + lift)
  }
  g.computeVertexNormals()
  return g
}

/** a polaroid `w` wide, its top edge at its origin (it hangs or is pinned from there; `stand`: its
 *  bottom edge, it stands on a ledge). `group` holds its and its neighbours' meshes (the camera steps
 *  along them), `k` is its place there; a click on it goes to `spot` (./look clickSpot). Pointed at,
 *  it lifts toward you a touch */
function Polaroid({ p, w, pin, stand, group, k, spot }: { p: Photo; w: number; pin?: 'peg' | 'pin'; stand?: boolean; group: { current: (Mesh | null)[] }; k: number; spot: Spot }) {
  const face = useFace(p)
  const h = w * (face?.aspect ?? 1.2)
  const geo = useMemo(() => cardGeometry(w, h), [w, h])
  const mats = useMemo(() => (face ? [BACK, BACK, BACK, BACK, face.mat, BACK] : BACK), [face])
  const down = (e: ThreeEvent<PointerEvent>) => e.stopPropagation() // (a click on it is for looking, not the hand)
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    clickSpot(spot, k)
  }
  const hover = useRef(0)
  const over = useRef(false)
  const lift = useRef<Group>(null)
  useFrame((_, dt) => {
    hover.current += ((over.current ? 1 : 0) - hover.current) * Math.min(1, dt * 10)
    const l = lift.current
    if (!l) return
    const e = hover.current
    l.position.z = e * w * 0.06
    l.rotation.set(-e * 0.06, 0, e * 0.03 * (k % 2 ? 1 : -1))
  })
  return (
    <group>
      <group ref={lift}>
        <mesh
          ref={(m) => void (group.current[k] = m)}
          geometry={geo}
          material={mats}
          position={[0, stand ? h / 2 : -h / 2, 0]}
          castShadow
          receiveShadow
          onPointerDown={down}
          onClick={click}
          onPointerOver={(e) => {
            e.stopPropagation()
            over.current = true
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            over.current = false
            document.body.style.cursor = ''
          }}
        />
      </group>
      {pin === 'peg' && (
        // a wooden clothes peg over the line: its two halves, the little steel spring round them
        <group position={[0, 3, 2.5]}>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={PEG_HALF} material={PEG} position={[0, 0, s * 2.4]} rotation={[s * 0.06, 0, 0]} castShadow />
          ))}
          <mesh material={SPRING} position={[0, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[3.6, 0.9, 6, 12]} />
          </mesh>
        </group>
      )}
      {pin === 'pin' && (
        // a push pin, pink
        <mesh material={PIN} position={[0, -9, 4]}>
          <sphereGeometry args={[6, 12, 8]} />
        </mesh>
      )}
    </group>
  )
}
const PEG_HALF = new RoundedBoxGeometry(8, 30, 4.2, 2, 1.4)
const PEG = bruno({ color: '#dcb88c' })
const SPRING = bruno({ color: '#b7bcc6' })
const PIN = bruno({ color: '#f08fae' })

// ---- the bench photo: on a little easel beside the bench it was taken on
const EASEL = bruno({ color: '#c49a6c', shade: '#b09ecb' }) // (honey pine)
const STICK = new RoundedBoxGeometry(1, 1, 1, 2, 0.25)
const _up = new Vector3(0, 1, 0)
/** a length of wood `t` × `d` from one point to another */
function Stick({ from, to, t = 14, d = 12 }: { from: [number, number, number]; to: [number, number, number]; t?: number; d?: number }) {
  const { p, q, len } = useMemo(() => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const dir = b.clone().sub(a)
    return { p: a.clone().add(b).multiplyScalar(0.5), q: new Quaternion().setFromUnitVectors(_up, dir.clone().normalize()), len: dir.length() }
  }, [from, to])
  return <mesh geometry={STICK} material={EASEL} position={p} quaternion={q} scale={[t, len, d]} castShadow receiveShadow />
}
/** the bench spot: the bench from the photo and its easel, taken in from the walk */
const benchSpot = (group: { current: (Mesh | null)[] }): Spot => {
  const b = SET.benches[SET.photos.bench]
  const e = SET.photos.easel
  const centre = new Vector3((b.x + e.x) / 2 + 30, 150, (b.z + e.z) / 2)
  const dir = new Vector3(0.3, 0.42, 1).normalize()
  return { key: 'bench', items: [() => group.current[0]], frame: (pos, at, aspect) => frameAround(pos, at, aspect, centre, Math.abs(e.x - b.x) + 560, 360, dir) }
}
export function BenchEasel() {
  const list = usePhotos()
  const p = useMemo(() => (list ? byName(list, 'cherry', ['bench_photo']) : []), [list])
  const group = useRef<(Mesh | null)[]>([])
  const spot = useMemo(() => benchSpot(group), [])
  const at = SET.photos.easel
  // a small tripod easel, about the bench's back high: two front legs leaning back, a third behind, a
  // ledge with a lip for the photo, a brace low down, a cap where the legs meet
  const LEAN = 0.16
  const TOP = 262
  const LEDGE = 104
  const fz = (y: number) => 18 - y * Math.tan(LEAN) // (how far forward the front legs are at height y)
  return (
    <group
      position={[at.x, 5, at.z]}
      rotation={[0, at.rot, 0]}
      onClick={(ev) => (ev.stopPropagation(), clickSpot(spot))}
      onPointerOver={(ev) => (ev.stopPropagation(), (document.body.style.cursor = 'pointer'))}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {[-1, 1].map((s) => (
        <Stick key={s} from={[s * 78, 0, fz(0)]} to={[s * 30, TOP, fz(TOP)]} />
      ))}
      <Stick from={[0, 0, -110]} to={[0, TOP - 16, fz(TOP) - 10]} t={12} d={11} />
      <Stick from={[-40, TOP, fz(TOP)]} to={[40, TOP, fz(TOP)]} t={20} d={16} />
      <Stick from={[-60, 40, fz(40)]} to={[60, 40, fz(40)]} t={8} d={8} />
      {/* the ledge and its lip */}
      <mesh geometry={STICK} material={EASEL} position={[0, LEDGE, fz(LEDGE) + 14]} scale={[200, 10, 34]} castShadow receiveShadow />
      <mesh geometry={STICK} material={EASEL} position={[0, LEDGE + 10, fz(LEDGE) + 29]} scale={[200, 14, 5]} castShadow />
      {/* the photo, standing on the ledge, leaning back against the legs */}
      {p.length > 0 && (
        <group position={[0, LEDGE + 5, fz(LEDGE) + 16]} rotation={[-LEAN, 0, 0]}>
          <Polaroid p={p[0]} w={172} stand group={group} k={0} spot={spot} />
        </group>
      )}
    </group>
  )
}

// ---- the clotheslines between the trunks
const LINE = bruno({ color: '#efe6dc' })
function Clothesline({ from, to, h, photos: ps, car }: { from: number; to: number; h: number; photos: Photo[]; car: { current: CarState } }) {
  const [a, b] = [SET.trees[from], SET.trees[to]]
  const { tube, spots, frame } = useMemo(() => {
    const A = new Vector3(a.x, h, a.z)
    const B = new Vector3(b.x, h, b.z)
    const dir = B.clone().sub(A).normalize()
    // tied round each trunk, sagging between
    A.addScaledVector(dir, 70)
    B.addScaledVector(dir, -70)
    const len = A.distanceTo(B)
    const at = (t: number) => A.clone().lerp(B, t).add(new Vector3(0, -Math.sin(Math.PI * t) * len * 0.06, 0))
    const curve = new CatmullRomCurve3(Array.from({ length: 13 }, (_, k) => at(k / 12)))
    const tube = new TubeGeometry(curve, 40, 2.2, 5, false)
    const n = ps.length
    const yaw = Math.atan2(-dir.z, dir.x)
    const spots = ps.map((_, k) => ({ at: at((k + 1) / (n + 1)), yaw }))
    // (the whole line taken in from the lawn, a little above: its photos hang ~70 under it)
    const centre = at(0.5).add(new Vector3(0, -60, 0))
    const face = new Vector3(Math.sin(yaw), 0.4, Math.cos(yaw)).normalize()
    const frame = (pos: Vector3, at: Vector3, aspect: number) => frameAround(pos, at, aspect, centre, len + 160, 300, face)
    return { tube, spots, frame }
  }, [a, b, h, ps])
  const swing = useRef<(Group | null)[]>([])
  const group = useRef<(Mesh | null)[]>([])
  const key = `line${from}-${to}`
  const spot = useMemo<Spot>(() => ({ key, items: ps.map((_, k) => () => group.current[k]), frame }), [key, ps, frame])
  const push = useRef(0)
  const still = useRef(0)
  useFrame(({ clock }, dt) => {
    const c = car.current
    const near = spots.some((s) => Math.hypot(c.x - s.at.x, c.z - s.at.z) < 500)
    push.current += ((near ? Math.min(1, Math.abs(c.v) / 1200) : 0) - push.current) * Math.min(1, dt * 2)
    const t = clock.elapsedTime
    // (looked at, it settles still, so the camera isn't swinging with it)
    still.current += ((getLook()?.spot.key === key ? 1 : 0) - still.current) * Math.min(1, dt * 3)
    const k0 = 1 - still.current
    swing.current.forEach((g, k) => {
      if (!g) return
      g.rotation.x = Math.sin(t * 1.3 + k * 1.7) * (0.05 + push.current * 0.35) * k0
      g.rotation.z = Math.sin(t * 0.9 + k) * 0.03 * k0
    })
  })
  return (
    <group>
      <mesh geometry={tube} material={LINE} castShadow onClick={(e) => (e.stopPropagation(), clickSpot(spot))} />
      {spots.map((s, k) => (
        <group key={ps[k].id} position={s.at} rotation={[0, s.yaw, 0]}>
          <group ref={(r) => void (swing.current[k] = r)}>
            <Polaroid p={ps[k]} w={112} pin="peg" group={group} k={k} spot={spot} />
          </group>
        </group>
      ))}
    </group>
  )
}

// ---- the corkboards (not on the Quad: kept for their other photos' own places, later)
export const BOARD = { w: 560, h: 400, low: 140, t: 18 }
function corkTexture(tag: string) {
  const W = 560
  const H = 400
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#c99a6b'
  g.fillRect(0, 0, W, H)
  let s = 7
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(120,75,40,0.35)' : 'rgba(240,200,150,0.3)'
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2)
  }
  // the frame
  g.strokeStyle = '#8d6445'
  g.lineWidth = 22
  g.strokeRect(0, 0, W, H)
  // the paper tag, top middle, its months in handwriting
  g.save()
  g.translate(W / 2, 40)
  g.rotate(-0.025)
  g.fillStyle = '#fdf7ec'
  g.shadowColor = 'rgba(60,30,20,0.25)'
  g.shadowBlur = 6
  g.shadowOffsetY = 2
  g.fillRect(-120, -20, 240, 42)
  g.shadowColor = 'transparent'
  g.fillStyle = '#6b4f63'
  g.font = `700 30px ${HAND}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(tag, 0, 2)
  g.restore()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
const FRAME = bruno({ color: '#8d6445' })
export function Board({ at, photos: ps }: { at: { x: number; z: number; rot: number }; photos: Photo[] }) {
  const [tag, setTag] = useState('')
  useEffect(() => {
    // (the handwriting's font first, then the tag)
    document.fonts.load(`700 30px 'Gaegu'`).finally(() => setTag(monthsOf(ps) || ' '))
  }, [ps])
  const mats = useMemo(() => {
    if (!tag) return FRAME
    const face = bruno({ map: corkTexture(tag) })
    return [FRAME, FRAME, FRAME, FRAME, face, FRAME]
  }, [tag])
  // the polaroids pinned in two rows of up to four, each a little askew
  const slots = useMemo(() => {
    const cols = Math.min(4, Math.ceil(ps.length / 2))
    const rows = Math.ceil(ps.length / cols)
    return ps.map((_, k) => {
      const r = Math.floor(k / cols)
      const inRow = Math.min(cols, ps.length - r * cols)
      const col = k - r * cols
      const x = (col - (inRow - 1) / 2) * 128
      const y = BOARD.h / 2 - 78 - r * (rows > 1 ? 150 : 0) - (rows === 1 ? 50 : 0)
      return { x, y, z: BOARD.t / 2 + 2 + r * 1.5, tilt: Math.sin(k * 12.9898 + ps.length) * 0.08 }
    })
  }, [ps])
  const mid = BOARD.low + BOARD.h / 2
  const group = useRef<(Mesh | null)[]>([])
  const spot = useMemo<Spot>(() => {
    const centre = new Vector3(at.x, mid, at.z)
    const face = new Vector3(Math.sin(at.rot), 0.3, Math.cos(at.rot)).normalize()
    return { key: `board${at.x},${at.z}`, items: ps.map((_, k) => () => group.current[k]), frame: (pos, c, aspect) => frameAround(pos, c, aspect, centre, BOARD.w + 120, BOARD.h + 120, face) }
  }, [at, mid, ps])
  return (
    <group position={[at.x, 0, at.z]} rotation={[0, at.rot, 0]}>
      {/* the board, leaning back a touch on its easel legs */}
      <group position={[0, mid, 0]} rotation={[-0.12, 0, 0]}>
        <mesh material={mats} castShadow receiveShadow>
          <boxGeometry args={[BOARD.w, BOARD.h, BOARD.t]} />
        </mesh>
        {slots.map((s, k) => (
          <group key={ps[k].id} position={[s.x, s.y, s.z]} rotation={[0, 0, s.tilt]}>
            <Polaroid p={ps[k]} w={112} pin="pin" group={group} k={k} spot={spot} />
          </group>
        ))}
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} material={FRAME} position={[s * (BOARD.w / 2 - 50), mid / 2 + 10, 12]} rotation={[-0.12, 0, 0]} castShadow>
          <boxGeometry args={[22, mid + 40, 22]} />
        </mesh>
      ))}
      <mesh material={FRAME} position={[0, mid / 2, -110]} rotation={[0.32, 0, 0]} castShadow>
        <boxGeometry args={[20, mid + 60, 20]} />
      </mesh>
    </group>
  )
}

export function Photos({ car }: { car: { current: CarState } }) {
  const list = usePhotos()
  const lines = useMemo(() => (list ? SET.photos.lines.map((l) => byName(list, 'cherry', l.names)) : []), [list])
  if (!list) return null
  return (
    <>
      <BenchEasel />
      {SET.photos.lines.map((l, i) => lines[i].length > 0 && <Clothesline key={i} from={l.trees[0]} to={l.trees[1]} h={l.h} photos={lines[i]} car={car} />)}
    </>
  )
}
