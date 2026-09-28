import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, CatmullRomCurve3, SRGBColorSpace, TubeGeometry, Vector3, type Group, type Material } from 'three'
import { bruno } from './bruno'
import { SET } from './set'
import type { CarState, Obstacle } from './Car'

/**
 * Their photos, out on the Quad (built by `npm run photos` into public/photos, see scripts/photos.mjs):
 *
 *   the bench photo     the two of them on a bench by the cherries: its polaroid propped on that very
 *                       bench's seat (it rides along if the bench is moved: ./Physical)
 *   the cherry shoot    pegged along two clotheslines strung between the trunks they stood under,
 *                       swaying a little, more when the car goes by
 *   the rest            in order, on little corkboards out on the lawn, a stretch of time each,
 *                       its months written on a paper tag
 *
 * Click a polaroid to look at it properly (the viewer: the photo big, its day under it, arrows through
 * the ones beside it). Photos are drawn into their polaroid's texture (card, photo, no stickers).
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

// ---- the viewer (drawn over the page by <PhotoViewer>, opened from inside the world)
let open: { list: Photo[]; i: number } | null = null
const vsubs = new Set<() => void>()
const setOpen = (o: typeof open) => {
  open = o
  vsubs.forEach((f) => f())
}
export const useViewerOpen = () => useSyncExternalStore((f) => (vsubs.add(f), () => void vsubs.delete(f)), () => open)

export function PhotoViewer() {
  const o = useViewerOpen()
  useEffect(() => {
    if (!o) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowRight') setOpen({ ...o, i: (o.i + 1) % o.list.length })
      else if (e.key === 'ArrowLeft') setOpen({ ...o, i: (o.i + o.list.length - 1) % o.list.length })
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [o])
  if (!o) return null
  const p = o.list[o.i]
  const go = (d: number) => (e: ReactMouseEvent) => {
    e.stopPropagation()
    setOpen({ ...o, i: (o.i + d + o.list.length) % o.list.length })
  }
  return (
    <div className="quad-viewer" onClick={() => setOpen(null)}>
      <figure key={p.id} onClick={(e) => e.stopPropagation()}>
        <img src={p.src} alt="" />
        <figcaption>{dayOf(p) || ' '}</figcaption>
      </figure>
      {o.list.length > 1 && (
        <div className="quad-viewer-nav">
          <button onClick={go(-1)} aria-label="Previous">
            ‹
          </button>
          <span>
            {o.i + 1} / {o.list.length}
          </span>
          <button onClick={go(1)} aria-label="Next">
            ›
          </button>
        </div>
      )}
    </div>
  )
}

// ---- a polaroid
const HAND = "'Gaegu', 'Nunito', cursive"
const BACK = bruno({ color: '#f4f0e8' })
/** its face: the white card, the photo in its square-ish window, a wider margin under it */
function useFace(p: Photo) {
  const [face, setFace] = useState<{ mat: Material; aspect: number } | null>(null)
  useEffect(() => {
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live) return
      const W = 320
      const side = 18
      const iw = W - 2 * side
      const ih = Math.round(iw / Math.max(0.72, Math.min(1.33, p.w / p.h)))
      const H = side + ih + 62
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const g = c.getContext('2d')!
      g.fillStyle = '#fbf8f2'
      g.fillRect(0, 0, W, H)
      const k = Math.max(iw / img.width, ih / img.height)
      g.save()
      g.beginPath()
      g.rect(side, side, iw, ih)
      g.clip()
      g.drawImage(img, side + (iw - img.width * k) / 2, side + (ih - img.height * k) / 2, img.width * k, img.height * k)
      g.restore()
      // (a faint inner shadow round the window, as the print sits a hair under the card)
      g.strokeStyle = 'rgba(90,70,80,0.18)'
      g.lineWidth = 2
      g.strokeRect(side, side, iw, ih)
      const t = new CanvasTexture(c)
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 8
      setFace({ mat: bruno({ map: t, shade: '#b9a8d6', warm: 0.6 }), aspect: H / W })
    }
    img.src = p.thumb
    return () => void (live = false)
  }, [p])
  return face
}

/** a polaroid `w` wide, its top edge at its origin (it hangs or is pinned from there); click to look */
function Polaroid({ p, w, list, i, pin }: { p: Photo; w: number; list: Photo[]; i: number; pin?: 'peg' | 'pin' }) {
  const face = useFace(p)
  const h = w * (face?.aspect ?? 1.2)
  const geo = useMemo(() => new BoxGeometry(w, h, 2.5), [w, h])
  const mats = useMemo(() => (face ? [BACK, BACK, BACK, BACK, face.mat, BACK] : BACK), [face])
  const down = (e: ThreeEvent<PointerEvent>) => e.stopPropagation() // (a click on it is for looking, not the hand)
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setOpen({ list, i })
  }
  return (
    <group>
      <mesh
        geometry={geo}
        material={mats}
        position={[0, -h / 2, 0]}
        castShadow
        receiveShadow
        onPointerDown={down}
        onClick={click}
        onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      {pin === 'peg' && (
        // a wooden clothes peg over the line
        <mesh material={PEG} position={[0, 2, 3]}>
          <boxGeometry args={[9, 26, 7]} />
        </mesh>
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
const PEG = bruno({ color: '#d9b58a' })
const PIN = bruno({ color: '#f08fae' })

// ---- the bench photo: on its bench's seat, leaning back (a child of the bench: see ./Physical)
export function BenchPhoto() {
  const list = usePhotos()
  const p = useMemo(() => (list ? byName(list, 'cherry', ['bench_photo']) : []), [list])
  if (!p.length) return null
  // (the left of the seat, where she sits in it; its top edge up against the back)
  return (
    <group position={[-105, 190, -38]} rotation={[-0.28, 0.12, 0.04]}>
      <Polaroid p={p[0]} w={128} list={p} i={0} />
    </group>
  )
}

// ---- the clotheslines between the trunks
const LINE = bruno({ color: '#efe6dc' })
function Clothesline({ from, to, h, photos: ps, car }: { from: number; to: number; h: number; photos: Photo[]; car: { current: CarState } }) {
  const [a, b] = [SET.trees[from], SET.trees[to]]
  const { tube, spots } = useMemo(() => {
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
    const spots = ps.map((_, k) => ({ at: at((k + 1) / (n + 1)), yaw: Math.atan2(-dir.z, dir.x) }))
    return { tube, spots }
  }, [a, b, h, ps])
  const swing = useRef<(Group | null)[]>([])
  const push = useRef(0)
  useFrame(({ clock }, dt) => {
    const c = car.current
    const near = spots.some((s) => Math.hypot(c.x - s.at.x, c.z - s.at.z) < 500)
    push.current += ((near ? Math.min(1, Math.abs(c.v) / 1200) : 0) - push.current) * Math.min(1, dt * 2)
    const t = clock.elapsedTime
    swing.current.forEach((g, k) => {
      if (!g) return
      g.rotation.x = Math.sin(t * 1.3 + k * 1.7) * (0.05 + push.current * 0.35)
      g.rotation.z = Math.sin(t * 0.9 + k) * 0.03
    })
  })
  return (
    <group>
      <mesh geometry={tube} material={LINE} castShadow />
      {spots.map((s, k) => (
        <group key={ps[k].id} position={s.at} rotation={[0, s.yaw, 0]}>
          <group ref={(r) => void (swing.current[k] = r)}>
            <Polaroid p={ps[k]} w={112} list={ps} i={k} pin="peg" />
          </group>
        </group>
      ))}
    </group>
  )
}

// ---- the corkboards
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
function Board({ at, photos: ps }: { at: { x: number; z: number; rot: number }; photos: Photo[] }) {
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
  return (
    <group position={[at.x, 0, at.z]} rotation={[0, at.rot, 0]}>
      {/* the board, leaning back a touch on its easel legs */}
      <group position={[0, mid, 0]} rotation={[-0.12, 0, 0]}>
        <mesh material={mats} castShadow receiveShadow>
          <boxGeometry args={[BOARD.w, BOARD.h, BOARD.t]} />
        </mesh>
        {slots.map((s, k) => (
          <group key={ps[k].id} position={[s.x, s.y, s.z]} rotation={[0, 0, s.tilt]}>
            <Polaroid p={ps[k]} w={112} list={ps} i={k} pin="pin" />
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

/** the boards' photos: everything that isn't the cherry shoot, oldest first, cut into the boards' counts */
function boardPhotos(list: Photo[]) {
  const rest = list.filter((p) => p.set !== 'cherry').sort((a, b) => (a.taken ?? '').localeCompare(b.taken ?? ''))
  const out: Photo[][] = []
  let k = 0
  SET.photos.boards.forEach((b, i) => {
    const n = i === SET.photos.boards.length - 1 ? rest.length - k : b.n
    out.push(rest.slice(k, k + n))
    k += n
  })
  return out
}

export function Photos({ car }: { car: { current: CarState } }) {
  const list = usePhotos()
  const lines = useMemo(() => (list ? SET.photos.lines.map((l) => byName(list, 'cherry', l.names)) : []), [list])
  const boards = useMemo(() => (list ? boardPhotos(list) : []), [list])
  if (!list) return null
  return (
    <>
      {SET.photos.lines.map((l, i) => lines[i].length > 0 && <Clothesline key={i} from={l.trees[0]} to={l.trees[1]} h={l.h} photos={lines[i]} car={car} />)}
      {SET.photos.boards.map((b, i) => boards[i]?.length > 0 && <Board key={i} at={b} photos={boards[i]} />)}
    </>
  )
}

/** the boards, for the car to bump into (three circles along each) */
export const boardObstacles = (): Obstacle[] =>
  SET.photos.boards.flatMap((b) => [-200, 0, 200].map((along) => ({ kind: 'circle' as const, x: b.x + Math.cos(b.rot) * along, z: b.z - Math.sin(b.rot) * along, r: 70 })))
