import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, Euler, ExtrudeGeometry, Matrix4, Path, Quaternion, RepeatWrapping, SRGBColorSpace, Shape, Vector3, type Group, type InstancedMesh } from 'three'
import { bruno } from '../quad/bruno'
import { Static } from '../../lib/render/Static'
import { useLook } from '../quad/look'
import { crateRefs, getBrowse, lookMoved, openCrate, takeOut, useBrowse } from './browse'
import type { CrateId } from './library'
import { crateNote, useShelf } from './shelf'
import { useDeck } from './deck'
import { Disc, Jacket, artOf, discThick, useArt } from './Record'
import { bigCover, uploadSoon } from './covers'
import { SLEEVE, sleeveGeometry, useSleeveCovers } from './Sleeves'
import { LP, sizeOf, type Pressing } from './vinyl'
import { CRATE } from './rack'

/**
 * The crate her records live in: pine, open-topped, low at the front so the covers show, a hand-hole cut through each
 * end. Our own (no one crate it copies), sized round a 12" jacket the way record crates are: [LP] the jacket's 314 mm
 * across, a finger's room each side; 200 tall, so the records stand well out of it.
 *
 * The records stand in it covers forward, leaning back a little, front to back: all of them one draw (./Sleeves:
 * their covers squares of one shared picture, ./covers). Going through it (./browse): the ones in front of the
 * record up tip forward, as a hand flipping through does, and it rises clear of the crate (its own 640 cover put on
 * it, sharp, close up); taken out, it comes up in front of the crate, upright, its record (both, for a double album)
 * sliding out of its open edge, fanned; a click on one plays it (`onPlay`: onto the turntable).
 * Its label's chalked on a slate card on its front board (painted into the board: no card stuck on).
 * Its frame: its middle, its floor's underside at y 0, the low front toward +z.
 */
export { CRATE }
const C = CRATE

/** an end: the board with its hand-hole cut through (its faces' uv in mm, the grain's texture repeated to suit) */
function endBoard() {
  const D = C.in.d + 2 * C.wall
  const s = new Shape()
  s.moveTo(-D / 2, 0)
  s.lineTo(D / 2, 0)
  s.lineTo(D / 2, C.h)
  s.lineTo(-D / 2, C.h)
  s.closePath()
  const { w, h, y } = C.hole
  const hole = new Path()
  hole.absarc(-w / 2 + h / 2, y, h / 2, Math.PI / 2, (Math.PI * 3) / 2, false)
  hole.lineTo(w / 2 - h / 2, y - h / 2)
  hole.absarc(w / 2 - h / 2, y, h / 2, -Math.PI / 2, Math.PI / 2, false)
  hole.closePath()
  s.holes.push(hole)
  // (drawn in z, y; stood across x, its thickness the wall's)
  return new ExtrudeGeometry(s, { depth: C.wall, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -C.wall / 2).rotateY(Math.PI / 2)
}

/** pine boards' grain (the stand's too) */
export const pineTexture = () => pine()
function pine() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = C.colors.pine
  g.fillRect(0, 0, 512, 512)
  // pine's grain: wavy lines along the board, a knot or two
  for (let i = 0; i < 46; i++) {
    const y0 = (i * 11.3) % 512
    g.strokeStyle = `rgba(150, 95, 40, ${0.08 + (i % 5) * 0.025})`
    g.lineWidth = 1 + (i % 3)
    g.beginPath()
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.02 + i) * 3)
    g.stroke()
  }
  ;[
    [140, 300],
    [400, 120],
  ].forEach(([x, y]) => {
    g.fillStyle = 'rgba(140, 85, 35, 0.35)'
    g.beginPath()
    g.ellipse(x, y, 9, 6, 0, 0, Math.PI * 2)
    g.fill()
  })
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}

/** where a record taken out stands: up in front of the crate (its jacket's bottom middle; its records fan to +x) */
const OUT = { y: C.h + 30, z: C.in.d / 2 + 90 }
/** how far right of the jacket's middle the whole (jacket and fanned records) is centred */
const fanned = (p: Pressing) => {
  const S = sizeOf(p)
  const n = p.sides.length / 2
  return (S.sleeve / 2 + (0.6 + (n - 1) * 0.26) * 2 * S.r - S.sleeve / 2) / 2
}

/** the front board, its grain, and the slate card chalked with the crate's name, painted into it */
function frontArt(label: string, empty: string) {
  const W = 1024
  const H = Math.round((W * C.front) / C.in.w)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.drawImage(pine().image as HTMLCanvasElement, 0, 0, W, H)
  // the slate, a little crooked
  g.save()
  g.translate(W / 2, H / 2)
  g.rotate(-0.025)
  const cw = W * 0.5
  const ch = H * 0.56
  g.fillStyle = '#7a5530'
  g.beginPath()
  g.roundRect(-cw / 2 - 10, -ch / 2 - 10, cw + 20, ch + 20, 14)
  g.fill()
  g.fillStyle = '#2f3a36'
  g.beginPath()
  g.roundRect(-cw / 2, -ch / 2, cw, ch, 8)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i < 40; i++) g.fillRect(-cw / 2 + ((i * 97) % cw), -ch / 2 + ((i * 53) % ch), 30, 2)
  g.fillStyle = '#f4efe6'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `700 ${ch * 0.5}px 'Gaegu', 'Nunito', cursive`
  g.fillText(label, 0, empty ? -ch * 0.12 : 0, cw * 0.9)
  if (empty) {
    g.font = `400 ${ch * 0.2}px 'Gaegu', 'Nunito', cursive`
    g.globalAlpha = 0.8
    g.fillText(empty, 0, ch * 0.28, cw * 0.9)
  }
  g.restore()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** a record's place in the crate, and how it's leaned (its bottom middle; r: its turn about x) */
type Pose = { x: number; y: number; z: number; r: number; /** s still to wait, up out of sight, before it comes in */ wait?: number }
const MAX = 50 // (records the crate holds: a 4.5 mm jacket every 5 mm)

/**
 * The record up (or out), close up: its jacket with its own cover (sharp at this size, where the sheet's square
 * isn't), and, out, its records sliding out of the jacket's open edge, fanned. Placed by the crate, each frame,
 * where its jacket in the crate is; `ready` once its cover's in hand (till then the crate's own jacket shows).
 * Out, a right-drag turns it round (jacket and records together, about their middle), to see its back, its edges,
 * its records from behind; it turns back square as it goes back in.
 */
function Hero({ p, out, onUp, onPlay, ready, place }: { p: Pressing; out: boolean; onUp: () => void; onPlay: (disc: number) => void; ready: (on: boolean) => void; place: (g: Group | null) => void }) {
  const art = useArt(p)
  useEffect(() => {
    ready(!!art)
    return () => ready(false)
  }, [art, ready])
  const S = sizeOf(p)
  const slides = useRef<(Group | null)[]>([])
  const outT = useRef(0)
  const [over, setOver] = useState<number | null>(null)
  // (its records only made while it's out, or going back in)
  const [discsOn, setDiscsOn] = useState(false)
  // ---- turned round by a right-drag while it's out
  const dom = useThree((s) => s.gl.domElement)
  const spin = useRef<Group>(null)
  const turn = useRef({ yaw: 0, pitch: 0, from: null as { x: number; y: number } | null })
  useEffect(() => {
    if (!out) return
    const t = turn.current
    // (caught before anything else on the page sees it: the right button's this record's, while it's out)
    const down = (e: PointerEvent) => {
      if (e.button !== 2) return
      e.preventDefault()
      e.stopPropagation()
      t.from = { x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      if (!t.from) return
      t.yaw += (e.clientX - t.from.x) * 0.012
      t.pitch = Math.max(-1.35, Math.min(1.35, t.pitch + (e.clientY - t.from.y) * 0.012))
      t.from = { x: e.clientX, y: e.clientY }
    }
    const up = (e: PointerEvent) => void (e.button === 2 && (t.from = null))
    const menu = (e: Event) => e.preventDefault()
    dom.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    dom.addEventListener('contextmenu', menu)
    return () => {
      dom.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dom.removeEventListener('contextmenu', menu)
      t.from = null
      // (back square as it goes back in)
      t.yaw = 0
      t.pitch = 0
    }
  }, [out, dom])
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const sp = spin.current
    if (sp) {
      // (the shortest way round to where it's turned)
      const k = Math.min(1, dt * 14)
      sp.rotation.y += (turn.current.yaw - sp.rotation.y) * k
      sp.rotation.x += (turn.current.pitch - sp.rotation.x) * k
    }
    // its records slide out once it's out (one after the other), back in before it goes back
    outT.current = out ? outT.current + dt : Math.max(0, Math.min(outT.current, 0.9) - dt * 3)
    if (out !== discsOn && (out || outT.current === 0)) setDiscsOn(out)
    slides.current.forEach((d, j) => {
      if (!d) return
      const f = smooth((outT.current - 0.35 - j * 0.12) / 0.5)
      const to = 0.6 + j * 0.26 + (over === j ? 0.05 : 0)
      const x = (S.sleeve / 2 - S.r + to * 2 * S.r) * f
      d.position.x += (x - d.position.x) * Math.min(1, dt * 12)
      d.visible = d.position.x > 1
    })
  })
  const stop = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.stopPropagation()
  // (the record that's on the player isn't in its jacket)
  const d = useDeck()
  const away = d.on && d.on.p.uri === p.uri ? d.on.disc : -1
  const discs = p.sides.length / 2
  if (!art) return null
  // (turned about the middle of the whole: the jacket and its records fanned out of it)
  const cx = fanned(p)
  return (
    <group ref={place}>
      <group position={[cx, S.sleeve / 2, 0]}>
      <group ref={spin}>
      <group position={[-cx, -S.sleeve / 2, 0]}>
      <group
        onClick={(e) => {
          stop(e)
          if (!out) onUp()
        }}
        onPointerOver={(e) => {
          stop(e)
          document.body.style.cursor = out ? '' : 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        {/* (out, it can be turned round: its back printed, its spine; in the crate its cover's all that's seen) */}
        <Jacket p={p} art={art} shadow={false} lite={!out} />
      </group>
      {/* its records, behind the jacket, sliding out of its open edge (+x) when it's out: a click plays one */}
      {discsOn &&
        Array.from({ length: discs }, (_, j) => j).filter((j) => j !== away).map((j) => (
          <group key={j} ref={(d) => void (slides.current[j] = d)} position={[0, S.sleeve / 2, -S.sleeveT / 2 - 2 - j * (discThick(S) + 2)]} visible={false}>
            <group
              rotation={[Math.PI / 2, 0, 0]}
              onPointerOver={(e) => {
                stop(e)
                setOver(j)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setOver((o) => (o === j ? null : o))
                document.body.style.cursor = ''
              }}
              onClick={(e) => {
                stop(e)
                if (!out) return
                document.body.style.cursor = ''
                onPlay(j)
              }}
            >
              <group position={[0, -discThick(S) / 2, 0]}>
                <Disc p={p} art={art} disc={j} />
              </group>
            </group>
          </group>
        ))}
      </group>
      </group>
      </group>
    </group>
  )
}

/** a record's sides drawn and sent up while nothing's happening (it's up: it may well be taken out next) */
function warm(p: Pressing) {
  if (!p.sides.length) return
  const w = window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }
  const idle = (f: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(f, { timeout: 600 }) : setTimeout(f, 60))
  void artOf(p).then((a) => {
    // (one side at a time, then the jacket's back: each its own idle moment)
    const next = (k: number) => {
      if (k >= Math.min(2, p.sides.length)) return idle(() => uploadSoon(a.back()))
      idle(() => {
        const s = a.side(k)
        uploadSoon(s.label)
        uploadSoon(s.prof)
        next(k + 1)
      })
    }
    next(0)
  })
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()

/**
 * The crate of records: `id` which (./library), `label` its name on its card, `note` written small under it.
 * `onPlay`: a record clicked out of its jacket (the pressing, which disc). `gate`: asked first on a click (true: the
 * click's taken, the crate left alone: on the Quad, the first click on the stand takes in the whole stand).
 */
export function Crate({ id, label, note = '', onPlay, gate }: { id: CrateId; label: string; note?: string; onPlay: (p: Pressing, disc: number) => void; gate?: () => boolean }) {
  const shelf = useShelf()
  const all = shelf.crates[id]
  const records = useMemo(() => (all ?? []).slice(0, MAX), [all])
  const n = records.length
  const m = useMemo(() => bruno({ map: pine(), shade: C.colors.pineShade }), [])
  const mEnd = useMemo(() => {
    const t = pine()
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(1 / 300, 1 / 300)
    return bruno({ map: t, shade: C.colors.pineShade })
  }, [])
  // (empty: what it says while it loads, or why it couldn't; else what it's been given)
  const small = n ? note : crateNote(id, shelf) || note
  const mFront = useMemo(() => bruno({ map: frontArt(label, small), shade: C.colors.pineShade }), [label, small])
  const g = useMemo(() => {
    const W = C.in.w + 2 * C.wall
    return {
      end: endBoard(),
      back: new BoxGeometry(C.in.w, C.h, C.wall),
      front: new BoxGeometry(C.in.w, C.front, C.wall),
      floor: new BoxGeometry(W, C.floor, C.in.d + 2 * C.wall),
    }
  }, [])
  const b = useBrowse()
  const look = useLook()
  useEffect(() => lookMoved(), [look])
  const mine = b.crate === id && b.mode !== 'none'
  const refs = useRef({ crate: null as Group | null, out: null as Group | null })
  useEffect(() => {
    crateRefs.set(id, refs.current)
    return () => void crateRefs.delete(id)
  }, [id])

  // ---- the records: one instanced mesh, each one's pose eased toward where it's wanted
  const mesh = useRef<InstancedMesh>(null)
  const geo = useMemo(() => sleeveGeometry(Math.max(1, n)), [n])
  useEffect(() => () => geo.dispose(), [geo])
  useSleeveCovers(mesh, records, 'crate')
  const gap = Math.min(28, (C.in.d - 50) / Math.max(1, n - 1))
  const zOf = (i: number) => C.in.d / 2 - 30 - i * gap
  const poses = useRef(new Map<string, Pose>()) // (by record: one moved in the crate slides to its new place)
  const over = useRef<number | null>(null)
  const hero = useRef({ i: -1, ready: false, g: null as Group | null })
  const dirty = useRef(true)
  // (filled from empty, her records just in from Spotify: they come down into it one after another, the back ones
  // first, each lowered in from above as a hand would, not just there)
  const was = useRef(0)
  const arriving = useRef(false)
  useEffect(() => {
    dirty.current = true
    if (was.current === 0 && records.length) arriving.current = true
    was.current = records.length
  }, [records])
  const heroI = mine ? b.i : -1
  useEffect(() => {
    hero.current.i = heroI
    dirty.current = true
    // (the ones either side decoded ahead, and this one's sides drawn while nothing's happening)
    if (heroI < 0) return
    for (const k of [heroI - 1, heroI + 1, heroI + 2]) if (records[k]) void bigCover(records[k])
    if (records[heroI]) warm(records[heroI])
  }, [heroI, records])
  const want = (i: number, p: Pressing, o: Pose) => {
    const bb = getBrowse()
    const me = bb.crate === id && bb.mode !== 'none'
    if (me && bb.mode === 'out' && bb.i === i) return Object.assign(o, { x: -fanned(p), y: OUT.y, z: OUT.z, r: 0.04 })
    Object.assign(o, { x: 0, y: C.floor, z: zOf(i), r: -C.lean })
    if (me && bb.i === i) o.y += C.h + 15
    else if (me && bb.mode === 'crate' && i < bb.i) o.r = 0.22 // (the ones in front tipped forward)
    else if (!me && over.current === i) o.y += 40
    return o
  }
  const w: Pose = { x: 0, y: 0, z: 0, r: 0 }
  useFrame((_, dtRaw) => {
    const im = mesh.current
    if (!im) return
    const k = Math.min(1, Math.min(dtRaw, 0.05) * 8)
    let moved = dirty.current
    dirty.current = false
    for (let i = 0; i < n; i++) {
      want(i, records[i], w)
      let c = poses.current.get(records[i].uri)
      if (!c) {
        c = { ...w }
        if (arriving.current) Object.assign(c, { y: w.y + C.h + 520, r: w.r - 0.35, wait: 0.35 + (n - 1 - i) * 0.05 })
        poses.current.set(records[i].uri, c)
      }
      if (c.wait) {
        c.wait = Math.max(0, c.wait - Math.min(dtRaw, 0.05))
        moved = true
        if (c.wait) continue
      }
      const d = Math.abs(w.x - c.x) + Math.abs(w.y - c.y) + Math.abs(w.z - c.z) + Math.abs(w.r - c.r) * 300
      if (d < 0.02) continue
      moved = true
      c.x += (w.x - c.x) * k
      c.y += (w.y - c.y) * k
      c.z += (w.z - c.z) * k
      c.r += (w.r - c.r) * k
    }
    arriving.current = false
    const h = hero.current
    const hp = records[h.i] && poses.current.get(records[h.i].uri)
    if (h.g && hp) {
      h.g.position.set(hp.x, hp.y, hp.z)
      h.g.rotation.set(hp.r, 0, 0)
    }
    if (!moved) return
    for (let i = 0; i < n; i++) {
      const c = poses.current.get(records[i].uri)!
      const sc = sizeOf(records[i]).sleeve / LP.sleeve
      // (a 7" single: its own smaller, thinner jacket; the one up, once its sharp cover's on it, not drawn here)
      _s.set(sc, sc, sc < 1 ? 3 / LP.sleeveT : 1).multiplyScalar((h.i === i && h.ready) || c.wait ? 0 : 1)
      _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(c.r, 0, 0)), _s)
      im.setMatrixAt(i, _m)
    }
    im.instanceMatrix.needsUpdate = true
    im.computeBoundingSphere()
  })
  const pick = (i: number) => gate?.() || (!mine ? openCrate(id, i) : b.mode === 'crate' && b.i === i ? takeOut(i) : openCrate(id, i))
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (gate?.()) return
    if (n && !mine) openCrate(id)
  }
  const heroP = heroI >= 0 ? records[heroI] : null
  const ready = useMemo(
    () => (on: boolean) => {
      hero.current.ready = on
      dirty.current = true
    },
    [],
  )
  const place = useMemo(() => (o: Group | null) => void (hero.current.g = o), [])
  return (
    <group ref={(o) => void (refs.current.crate = o)}>
      {/* (its boards merged: a crate three draws, not eleven) */}
      <Static>
        <group onClick={open} onPointerOver={(e) => (e.stopPropagation(), !mine && (document.body.style.cursor = 'pointer'))} onPointerOut={() => (document.body.style.cursor = '')}>
          <mesh geometry={g.floor} material={m} position={[0, C.floor / 2, 0]} castShadow receiveShadow />
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={g.end} material={mEnd} position={[s * (C.in.w / 2 + C.wall / 2), 0, 0]} castShadow receiveShadow />
          ))}
          <mesh geometry={g.back} material={m} position={[0, C.h / 2, -C.in.d / 2 - C.wall / 2]} castShadow receiveShadow />
          {/* the front board, its card: the crate's name */}
          <mesh geometry={g.front} material={mFront} position={[0, C.front / 2, C.in.d / 2 + C.wall / 2]} castShadow receiveShadow />
        </group>
      </Static>
      {/* (where a record taken out is: the camera frames it) */}
      <group ref={(o) => void (refs.current.out = o)} position={[0, OUT.y + LP.sleeve / 2, OUT.z]} />
      {n > 0 && (
        <instancedMesh
          ref={mesh}
          args={[geo, SLEEVE, n]}
          receiveShadow
          onPointerMove={(e) => {
            e.stopPropagation()
            if (e.instanceId != null) over.current = e.instanceId
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            over.current = null
            document.body.style.cursor = ''
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (e.instanceId != null) pick(e.instanceId)
          }}
        />
      )}
      {heroP && <Hero key={heroP.uri + heroP.sides.length} p={heroP} out={b.mode === 'out'} onUp={() => pick(heroI)} onPlay={(disc) => onPlay(heroP, disc)} ready={ready} place={place} />}
    </group>
  )
}
