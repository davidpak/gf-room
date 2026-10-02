import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, SphereGeometry, TubeGeometry, Vector3, type InstancedMesh, type Material } from 'three'
import { usePlayer } from '../../lib/spotify/player'
import { useDeck } from '../records/deck'
import { needle } from '../records/play'
import { Jacket, useArt } from '../records/Record'
import { StillSleeves } from '../records/Sleeves'
import { DARK, FRAME, HAND, RBOX, WOOD, slate, star, stripes } from './CookieStand'
import { bruno } from './bruno'
import { StringLights } from './NightLights'

/**
 * The record stand's dressing (real mm; ./QuadMusic places it at the toy scale), the cookie stand's cousin: a canopy
 * in lilac and cream stripes (a hip roof over the stand, its scalloped valance), a plank on its front saying whose
 * it is, warm string lights swagged along its eaves, a braided rug under it all, an A-frame chalkboard out front
 * that says what's spinning, a little easel beside the stand holding up the jacket of the record that's on, and,
 * while one plays, notes drifting up off the platter. And a record shop's things: a wall of records hung on strings
 * at the back, pennants along the sides, a tiered rack out front with her all-time favourites face out.
 */
export const CANOPY = { hx: 1150, hz: 720, over: 60, eave: 2050, peak: 2650 }
export const RUG = { w: 4000, d: 2200, t: 6 } // (under the stand, the canopy, the rack and the easel)
const LILAC = '#c9b6ec'
const CREAM = '#fdf2e4'

// ---- the canopy
/** a hip roof: front and back sloping up to a ridge along x, the ends to its ends (uv: u along the eave, v up) */
function roofGeometry() {
  const { hx, hz, over, eave, peak } = CANOPY
  const x = hx + over
  const z = hz + over
  const r = hx - hz // (the ridge's half length)
  const pos: number[] = []
  const uv: number[] = []
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => {
    pos.push(...a, ...b, ...c)
    uv.push(...ua, ...ub, ...uc)
  }
  const ru = 0.5 - (0.5 * r) / x
  for (const s of [1, -1]) {
    // front (s 1) and back: a trapezoid
    const a = [-x * s, eave, z * s]
    const b = [x * s, eave, z * s]
    const c = [r * s, peak, 0]
    const d = [-r * s, peak, 0]
    tri(a, b, c, [0, 0], [1, 0], [1 - ru, 1])
    tri(a, c, d, [0, 0], [1 - ru, 1], [ru, 1])
    // the ends: a triangle
    tri([x * s, eave, z * s], [x * s, eave, -z * s], [r * s, peak, 0], [0, 0], [1, 0], [0.5, 1])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.computeVertexNormals()
  return g
}

/** the plank on the canopy's front: cream, its name lettered in lilac between two little records */
function plankArt() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 220
  const g = c.getContext('2d')!
  g.fillStyle = '#fbf3e4'
  g.fillRect(0, 0, 1024, 220)
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(160,120,80,${0.04 + (i % 4) * 0.015})`
    g.fillRect(0, (i * 47) % 220, 1024, 2)
  }
  g.strokeStyle = '#8f78c4'
  g.lineWidth = 8
  g.strokeRect(14, 14, 996, 192)
  const record = (x: number) => {
    g.fillStyle = '#2b2538'
    g.beginPath()
    g.arc(x, 110, 62, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.12)'
    g.lineWidth = 2
    for (const r of [30, 40, 50]) {
      g.beginPath()
      g.arc(x, 110, r, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = '#f5b3c6'
    g.beginPath()
    g.arc(x, 110, 22, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#2b2538'
    g.beginPath()
    g.arc(x, 110, 4, 0, Math.PI * 2)
    g.fill()
  }
  record(110)
  record(914)
  g.fillStyle = '#6d55a8'
  g.font = `700 112px ${HAND}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('Rina\'s Records', 512, 104)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** the canopy: four posts, the rails round the eaves, the striped roof, the valance, the plank, the lights */
export function MusicCanopy() {
  const m = useMemo(() => {
    const roof = stripes(false, LILAC, CREAM)
    const val = stripes(true, LILAC, CREAM)
    const plank = plankArt()
    return {
      roof: bruno({ map: roof.map, side: DoubleSide, shade: '#a993c9' }),
      valance: bruno({ map: val.map, alphaMap: val.alpha!, alphaTest: 0.5, side: DoubleSide, shade: '#a993c9' }),
      plank: [WOOD, WOOD, WOOD, WOOD, bruno({ map: plank, emissiveMap: plank, emissive: '#ffffff', emissiveIntensity: 0.18, shade: '#a58aa6' }), WOOD] as Material[],
    }
  }, [])
  const g = useMemo(() => ({ roof: roofGeometry(), plank: new BoxGeometry(1700, 360, 60) }), [])
  const { hx, hz, over, eave, peak } = CANOPY
  return (
    <group>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <group key={sx * 3 + sz}>
            <mesh geometry={RBOX} material={FRAME} position={[sx * hx, eave / 2, sz * hz]} scale={[40, eave, 40]} castShadow />
            <mesh geometry={RBOX} material={FRAME} position={[sx * hx, 30, sz * hz]} scale={[120, 20, 120]} castShadow />
          </group>
        )),
      )}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={RBOX} material={FRAME} position={[0, eave - 30, s * hz]} scale={[hx * 2, 36, 30]} />
          <mesh geometry={RBOX} material={FRAME} position={[s * hx, eave - 30, 0]} scale={[30, 36, hz * 2]} />
        </group>
      ))}
      <mesh geometry={g.roof} material={m.roof} castShadow receiveShadow />
      {/* the valance, round all four sides */}
      {[
        [0, hz + over, 0, (hx + over) * 2],
        [0, -(hz + over), Math.PI, (hx + over) * 2],
        [hx + over, 0, Math.PI / 2, (hz + over) * 2],
        [-(hx + over), 0, -Math.PI / 2, (hz + over) * 2],
      ].map(([x, z, r, w], i) => (
        <mesh key={i} material={m.valance} position={[x, eave - 130, z]} rotation={[0, r, 0]}>
          <planeGeometry args={[w, 260]} />
        </mesh>
      ))}
      {/* the plank, up on the front of the roof */}
      <mesh geometry={g.plank} material={m.plank} position={[0, (eave + peak) / 2 + 60, hz + over - 230]} rotation={[-0.42, 0, 0]} castShadow />
      {/* the lights: the wire, and a bulb in a little cap every hand's breadth (none along the back: it faces the trees) */}
      <StringLights hx={hx + over - 30} hz={hz + over - 30} y={eave - 290} skip={[2]} pool={10} />
    </group>
  )
}

// ---- the rug: braided, an oval of pastel rounds
function rugArt() {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')!
  const cols = ['#f3d9e6', '#d9cdf2', '#fbf1e2', '#cfe6dc', '#f7d7c4']
  for (let i = 0; i < 26; i++) {
    const r = 512 - i * 19
    g.fillStyle = cols[i % cols.length]
    g.beginPath()
    g.arc(512, 512, r, 0, Math.PI * 2)
    g.fill()
    // (the braid: little slanted stitches round each round)
    g.strokeStyle = 'rgba(120,90,120,0.16)'
    g.lineWidth = 3
    const n = Math.max(12, Math.round(r / 6))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      g.beginPath()
      g.moveTo(512 + Math.cos(a) * (r - 16), 512 + Math.sin(a) * (r - 16))
      g.lineTo(512 + Math.cos(a + 0.06) * (r - 3), 512 + Math.sin(a + 0.06) * (r - 3))
      g.stroke()
    }
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
/** the oval it's cut to: the round picture stretched to the rug, kept inside the ellipse */
function ovalAlpha() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(128, 128, 127, 0, Math.PI * 2)
  g.fill()
  return new CanvasTexture(c)
}
const RUG_GEO = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2)
/** an oval rug lying on the ground, its top at RUG.t */
export function MusicRug() {
  const m = useMemo(() => bruno({ map: rugArt(), alphaMap: ovalAlpha(), alphaTest: 0.5, shade: '#a594bf' }), [])
  return <mesh geometry={RUG_GEO} material={m} position={[0, RUG.t, 0]} scale={[RUG.w, 1, RUG.d]} receiveShadow />
}

// ---- the chalkboard out front: what's spinning
function spinningArt(c: HTMLCanvasElement, song: string, artist: string) {
  const W = 760
  const H = 900
  slate(
    W,
    H,
    (g) => {
      g.fillStyle = '#fbf7ef'
      g.textAlign = 'center'
      g.font = `700 92px ${HAND}`
      g.fillText('Rina\'s', W / 2, 120)
      g.fillText('Records', W / 2, 210)
      g.fillStyle = '#d9c8ff'
      g.font = `700 54px ${HAND}`
      g.fillText('♪ now spinning ♪', W / 2, 330)
      g.fillStyle = '#fbf7ef'
      const wrap = (text: string, y: number, size: number, max: number) => {
        g.font = `700 ${size}px ${HAND}`
        const words = text.split(/\s+/)
        const lines: string[] = []
        let cur = ''
        for (const w of words) {
          const t = cur ? cur + ' ' + w : w
          if (g.measureText(t).width > W - 140 && cur) {
            lines.push(cur)
            cur = w
          } else cur = t
        }
        if (cur) lines.push(cur)
        lines.slice(0, max).forEach((l, i) => g.fillText(l, W / 2, y + i * size * 1.05))
        return Math.min(lines.length, max)
      }
      if (song) {
        const n = wrap(song, 440, 72, 3)
        g.fillStyle = '#f5b3c6'
        wrap(artist, 450 + n * 76, 50, 2)
      } else {
        g.font = `400 54px ${HAND}`
        g.fillText('nothing yet:', W / 2, 450)
        g.fillText('pick a record', W / 2, 520)
        g.fillText('from a crate', W / 2, 590)
      }
      star(g, 120, 780, 18, '#f5b3c6')
      star(g, W - 120, 780, 18, '#d9c8ff')
      g.fillStyle = '#fbf7ef'
      g.font = `400 44px ${HAND}`
      g.fillText('free listening ✿', W / 2, 790)
    },
    c,
  )
}
/** the chalkboard's face, kept up to date with what's playing */
export function useSpinningFace() {
  const p = usePlayer()
  const d = useDeck()
  const face = useMemo(() => {
    const c = document.createElement('canvas')
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return { c, t, m: bruno({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.22, shade: '#6f7699' }) }
  }, [])
  // (the song from Spotify while it plays; a made-up record's own song; nothing when nothing's on)
  const band = d.on ? d.on.p.sides[2 * d.on.disc + d.on.face]?.bands[needle.band] : null
  const song = p.track && !p.paused ? p.track.name : needle.playing && band ? band.name : ''
  const artist = p.track && !p.paused ? p.track.artists.map((a) => a.name).join(', ') : needle.playing && d.on ? d.on.p.artist : ''
  useEffect(() => {
    void document.fonts.load(`700 92px 'Gaegu'`).finally(() => {
      spinningArt(face.c, song, artist)
      face.t.needsUpdate = true
    })
  }, [face, song, artist])
  return face.m
}

// ---- the easel by the stand: the jacket of what's on, up for all to see
const EASEL = { h: 820, ledge: 430, w: 380, lean: 0.16 }
export function NowPlayingEasel() {
  const d = useDeck()
  const art = useArt(d.on?.p ?? null)
  const leg = useMemo(() => new BoxGeometry(34, EASEL.h, 22), [])
  const ledge = useMemo(() => new BoxGeometry(EASEL.w, 24, 70), [])
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={leg} material={WOOD} position={[(s * EASEL.w) / 2.6, EASEL.h / 2, 0]} rotation={[-EASEL.lean, 0, s * 0.06]} castShadow />
      ))}
      <mesh geometry={leg} material={WOOD} position={[0, EASEL.h / 2 - 20, -170]} rotation={[0.32, 0, 0]} castShadow />
      <mesh geometry={ledge} material={WOOD} position={[0, EASEL.ledge, 40]} castShadow />
      {d.on && art && (
        <group position={[0, EASEL.ledge + 12, 30]} rotation={[-EASEL.lean, 0, 0]} scale={0.95}>
          <Jacket p={d.on.p} art={art} lite />
        </group>
      )}
    </group>
  )
}

// ---- notes drifting up off the platter while a record plays
const NOTE_TEX = (() => {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.font = `700 110px ${HAND}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('♪', 64, 64)
  g.fillText('♫', 192, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
})()
const NOTE_COLOURS = ['#f5b3c6', '#d4c0ff', '#ffe08a', '#bfe8d6']
/** `from`: where they rise from, in the parent's frame (real mm) */
export function Notes({ from }: { from: [number, number, number] }) {
  const notes = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const tex = NOTE_TEX!.clone()
        tex.repeat.set(0.5, 1)
        tex.offset.set(i % 2 ? 0.5 : 0, 0)
        tex.needsUpdate = true
        const mesh = new Mesh(new PlaneGeometry(90, 90), new MeshBasicMaterial({ map: tex, color: NOTE_COLOURS[i % 4], transparent: true, depthWrite: false, opacity: 0 }))
        mesh.visible = false
        return { mesh, t: 99, x: 0, z: 0 } // (99: resting, till a record plays)
      }),
    [],
  )
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const on = needle.playing
    notes.forEach((n, i) => {
      if (n.t < 99) n.t += dt
      if (n.t > 2.8) {
        if (!on) {
          ;(n.mesh.material as MeshBasicMaterial).opacity = 0
          n.mesh.visible = false // (not drawn while it rests)
          n.t = 99
          return
        }
        // (from resting: one after another; else straight round again)
        n.t = n.t >= 99 ? -i * 0.45 : 0
        n.x = (Math.random() - 0.5) * 160
        n.z = (Math.random() - 0.5) * 120
      }
      if (n.t < 0) return
      const f = n.t / 2.8
      n.mesh.position.set(from[0] + n.x + Math.sin(n.t * 2.4 + n.z) * 40, from[1] + 40 + f * 520, from[2] + n.z)
      n.mesh.quaternion.copy(state.camera.quaternion)
      ;(n.mesh.material as MeshBasicMaterial).opacity = Math.min(1, f * 5) * (1 - f) * 0.95
      n.mesh.visible = true
      n.mesh.scale.setScalar(0.7 + f * 0.6)
    })
  })
  return (
    <group>
      {notes.map((n, i) => (
        <primitive key={i} object={n.mesh} />
      ))}
    </group>
  )
}

// ---- the vinyl wall: records hung on strings from the canopy's back rail, turning slowly
const HANG_LABELS = ['#f5b3c6', '#d4c0ff', '#ffe08a', '#bfe8d6', '#f7c59f']
/** (the face's black and grooves stay black under any colour; its label, white, takes the disc's) */
function hangingFace(label = '#ffffff') {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#1f1c24'
  g.fillRect(0, 0, 256, 256)
  for (let r = 40; r < 127; r += 3) {
    g.strokeStyle = `rgba(255,255,255,${0.03 + ((r * 7) % 5) * 0.012})`
    g.lineWidth = 1
    g.beginPath()
    g.arc(128, 128, r, 0, Math.PI * 2)
    g.stroke()
  }
  g.fillStyle = label
  g.beginPath()
  g.arc(128, 128, 36, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#1f1c24'
  g.beginPath()
  g.arc(128, 128, 4, 0, Math.PI * 2)
  g.fill()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const HANG_DISC = (() => {
  // (standing, its faces toward ±z; one material: its rim's uv in the face picture's black corner)
  const g = new CylinderGeometry(150, 150, 3, 48).rotateX(Math.PI / 2)
  const [torso] = g.groups
  const uv = g.attributes.uv
  for (let k = torso.start; k < torso.start + torso.count; k++) uv.setXY(g.index!.getX(k), 0.02, 0.02)
  g.clearGroups()
  return g
})()
const STRING = new CylinderGeometry(1.5, 1.5, 1, 4)
const HANG_FACE = bruno({ map: hangingFace() })
const HANG = { hx: CANOPY.hx, discs: [-900, -450, 0, 450, 900].map((x, i) => ({ x: Math.max(-CANOPY.hx + 160, Math.min(CANOPY.hx - 160, x + ((i * 37) % 60) - 30)), drop: 260 + ((i * 97) % 200), turn: 0.2 + (i % 3) * 0.12, phase: i * 1.7 })) }
/** the records hung from the back rail: their strings (still: for <Static>) */
export function VinylStrings() {
  return (
    <group position={[0, CANOPY.eave - 40, -CANOPY.hz + 40]}>
      {HANG.discs.map((d, i) => (
        <mesh key={i} geometry={STRING} material={DARK} position={[d.x, -d.drop / 2, 0]} scale={[1, d.drop, 1]} />
      ))}
    </group>
  )
}
const _hm = new Matrix4()
const _hq = new Quaternion()
const _hy = new Vector3(0, 1, 0)
const _hp = new Vector3()
const _h1 = new Vector3(1, 1, 1)
/** …and the records on them, turning slowly (one draw) */
export function VinylWall() {
  const ref = useRef<InstancedMesh>(null)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    HANG.discs.forEach((_, i) => m.setColorAt(i, new Color(HANG_LABELS[i % HANG_LABELS.length])))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const t = clock.elapsedTime
    HANG.discs.forEach((d, i) => {
      _hq.setFromAxisAngle(_hy, Math.sin(t * d.turn + d.phase) * 1.1)
      m.setMatrixAt(i, _hm.compose(_hp.set(d.x, -d.drop - 150, 0), _hq, _h1))
    })
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <group position={[0, CANOPY.eave - 40, -CANOPY.hz + 40]}>
      <instancedMesh ref={ref} args={[HANG_DISC, HANG_FACE, HANG.discs.length]} frustumCulled={false} />
    </group>
  )
}

// ---- pennant bunting along the canopy's sides
const PENNANT = (() => {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([-55, 0, 0, 55, 0, 0, 0, -150, 0]), 3))
  g.computeVertexNormals()
  return g
})()
const FLAGS = ['#f5b3c6', '#fdf2e4', '#c9b6ec', '#bfe8d6', '#ffe08a'].map((c) => bruno({ color: c, side: DoubleSide, shade: '#a993c9' }))
export function Bunting() {
  const { hx, hz, eave } = CANOPY
  const n = Math.floor((2 * hz) / 130)
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (hx + 8), eave - 70, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
          {Array.from({ length: n }, (_, i) => {
            const u = (i + 0.5) / n
            const z = (u - 0.5) * 2 * hz
            const sag = 60 * 4 * u * (1 - u)
            return <mesh key={i} geometry={PENNANT} material={FLAGS[(i + (s > 0 ? 2 : 0)) % FLAGS.length]} position={[z * -s, -sag, 0]} rotation={[0, 0, (u - 0.5) * 0.2]} />
          })}
        </group>
      ))}
    </group>
  )
}

// ---- the picks rack: a tiered wooden display rack, records face out (a few of hers: one draw, ../records/Sleeves), a card on top
export const RACK = { w: 720, h: 920, d: 300, lean: 0.22, tiers: [110, 520] }
// (the leg: its foot at z -440 on the grass, its top at y 600 just behind the leaned board (its back there: z -158))
const PROP = (() => {
  const foot = -440
  const top = { y: 600, z: -188 }
  return { y: top.y / 2, z: (foot + top.z) / 2, tilt: Math.atan2(top.z - foot, top.y), len: Math.hypot(top.z - foot, top.y) }
})()
const slots = [
  { x: -RACK.w / 4 + 6, tier: 0 },
  { x: RACK.w / 4 - 6, tier: 0 },
  { x: 0, tier: 1 },
]
function picksCard(title: string) {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 200
  slate(640, 200, (g) => {
    g.fillStyle = '#fbf7ef'
    g.textAlign = 'center'
    g.font = `700 74px ${HAND}`
    g.fillText(title, 320, 104)
  }, c)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
export function PicksRack({ records, title }: { records: import('../records/vinyl').Pressing[]; title: string }) {
  const card = useMemo(() => {
    const t = picksCard(title)
    return [WOOD, WOOD, WOOD, WOOD, bruno({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.15, shade: '#6f7699' }), WOOD] as Material[]
  }, [title])
  const g = useMemo(() => ({ back: new BoxGeometry(RACK.w, RACK.h, 24), ledge: new BoxGeometry(RACK.w, 22, 70), lip: new BoxGeometry(RACK.w, 50, 14), leg: new BoxGeometry(30, RACK.h * 0.8, 30), card: new BoxGeometry(RACK.w * 0.9, 190, 20) }), [])
  const place = useMemo(() => (i: number, m: Matrix4) => m.makeScale(0.98, 0.98, 0.98).setPosition(slots[i].x, RACK.tiers[slots[i].tier] + 11, 30), [])
  return (
    <group>
      {/* the back, leaning back on its prop; the ledges and their lips */}
      <group rotation={[-RACK.lean, 0, 0]}>
        <mesh geometry={g.back} material={WOOD} position={[0, RACK.h / 2, -12]} castShadow receiveShadow />
        {RACK.tiers.map((y) => (
          <group key={y} position={[0, y, 0]}>
            <mesh geometry={g.ledge} material={WOOD} position={[0, 0, 35]} castShadow />
            <mesh geometry={g.lip} material={WOOD} position={[0, 25, 68]} castShadow />
          </group>
        ))}
        <mesh geometry={g.card} material={card} position={[0, RACK.h + 60, 0]} castShadow />
        <StillSleeves records={records.slice(0, slots.length)} place={place} who="picks" />
      </group>
      {/* the prop leg: from the grass behind up to the back board's back (its top 10 behind it: not through it) */}
      <mesh geometry={g.leg} material={WOOD} position={[0, PROP.y, PROP.z]} rotation={[PROP.tilt, 0, 0]} scale={[1, PROP.len / (RACK.h * 0.8), 1]} castShadow />
    </group>
  )
}

