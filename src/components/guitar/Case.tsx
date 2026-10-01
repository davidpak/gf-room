import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Path, Shape, Vector2, Vector3, type Object3D } from 'three'
import { bruno } from '../quad/bruno'
import { BODY, CASE, HEAD, JOIN, NUT, OUTLINE, STRAP } from './spec'
import { END } from './Guitar'

/**
 * Its case, Martin's 12C640 (./spec [K]), open on the grass: a molded shell to the guitar's shape (the
 * body round, a channel for the neck, a pocket for the head), green plush inside with the guitar's own
 * shape pressed into it and the little lidded well for strings under the neck, five latches and the
 * handle down its opening side, its lid hinged back along the other. Built flat in its own frame (x
 * across, y along from the tail end, z up out of it), then laid down: `<group rotation-x={-π/2}>`.
 *
 * And the strap: tied at the endpin and the heel, hanging between them wherever the guitar is (it falls
 * to the grass and lies there when there's slack).
 */
const SHELL = bruno({ color: '#36313d', shade: '#241f2e', sheen: 0.22 })
const PLUSH = bruno({ color: '#6aa987', shade: '#4d6f86' })
const PLUSH_DEEP = bruno({ color: '#5a9677', shade: '#44607c' })
const NICKEL = bruno({ color: '#dcdce6', shade: '#8f8aa8', sheen: 0.45 })
const TUBE = new CylinderGeometry(1, 1, 1, 12)

const L = BODY.length
const HEAD_TOP = END + NUT.t + HEAD.length * Math.cos((HEAD.back * Math.PI) / 180)
/** the guitar's outline, offset out by `o` all round (the body), with a channel for its neck and a
 *  pocket for its head; `top` how far up it goes */
function contour(o: number, neck: number, head: number, top: number) {
  // the body's loop, each point pushed out along its normal
  const loop: Vector2[] = []
  for (const [s, w] of OUTLINE) loop.push(new Vector2(w, L - s))
  for (let i = OUTLINE.length - 2; i > 0; i--) loop.push(new Vector2(-OUTLINE[i][1], L - OUTLINE[i][0]))
  const n = loop.length
  const out = loop.map((p, i) => {
    const a = loop[(i - 1 + n) % n]
    const b = loop[(i + 1) % n]
    const t = b.clone().sub(a).normalize()
    return p.clone().add(new Vector2(-t.y, t.x).multiplyScalar(o)) // (a clockwise loop: outward is the tangent turned left)
  })
  // the right half, top to bottom, but not where the neck's channel runs
  const right = out.filter((p) => p.x >= 0 && (p.x > neck + 2 || p.y < L - 30)).sort((a, b) => b.y - a.y)
  const r = Math.min(40, head * 0.45)
  const pts: Vector2[] = []
  pts.push(new Vector2(0, top), new Vector2(head - r, top))
  for (let k = 1; k <= 6; k++) {
    const a = Math.PI / 2 - (k / 6) * (Math.PI / 2)
    pts.push(new Vector2(head - r + Math.cos(a) * r, top - r + Math.sin(a) * r))
  }
  pts.push(new Vector2(head, END + 10), new Vector2(neck, END - 40), new Vector2(neck, right[0].y + 6))
  pts.push(...right)
  const half = pts.slice(1)
  const all = [...pts, ...half.reverse().map((p) => new Vector2(-p.x, p.y))]
  return all
}
const shapeOf = (pts: Vector2[]) => new Shape(pts)
/** the edge's x (its widest) at y: for the latches and the handle */
function edgeAt(pts: Vector2[], y: number) {
  let best = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue
    best = Math.max(best, a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y))
  }
  return best
}

export function CaseModel() {
  const { h, w } = CASE.outside
  const hb = h * CASE.split // (the bottom shell)
  const hl = h - hb // (the lid)
  const geo = useMemo(() => {
    const o = (w - BODY.lower) / 2
    const top = HEAD_TOP + (CASE.outside.l - (HEAD_TOP + o)) // (so it's its full length)
    const outer = contour(o, 60, 88, top)
    const inner = contour(o - CASE.wall, 60 - CASE.wall, 88 - CASE.wall, top - CASE.wall)
    const recess = contour(5, 30, 66, HEAD_TOP + 6) // (the head pocket wide enough for its tuners)
    const ring = shapeOf(outer)
    ring.holes.push(new Path(inner.slice().reverse()))
    const soft = { bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 3, curveSegments: 6 }
    const walls = new ExtrudeGeometry(ring, { depth: hb - 8, ...soft })
    const floor = new ExtrudeGeometry(shapeOf(outer), { depth: 8, ...soft })
    // the plush: filling the shell to under its rim, the guitar's shape pressed into it
    const bed = shapeOf(inner)
    bed.holes.push(new Path(recess.slice().reverse()))
    const plush = new ExtrudeGeometry(bed, { depth: hb - 44, bevelEnabled: true, bevelThickness: 5, bevelSize: 3, bevelSegments: 3 })
    const hollow = new ExtrudeGeometry(shapeOf(inner), { depth: 10, bevelEnabled: false })
    // the lid: the same shell, shallower, closed on its top; plush lining it
    const lidWalls = new ExtrudeGeometry(ring, { depth: hl - 8, ...soft })
    const lidPad = new ExtrudeGeometry(shapeOf(inner), { depth: 14, bevelEnabled: true, bevelThickness: 5, bevelSize: 3, bevelSegments: 3 })
    return { outer, walls, floor, plush, hollow, lidWalls, lidPad }
  }, [w, hb, hl])
  const hingeX = -edgeAt(geo.outer, L * 0.35) // (along its bass side)
  const latchY = [0.06, 0.26, 0.46, 0.7, 0.9].map((f) => -30 + f * CASE.outside.l * 0.97)
  const well = { y: L + 30, w: 140, d: 70 } // (the lidded well under the neck, for strings and picks)
  return (
    <group>
      {/* the bottom shell: its floor, its walls, the plush in it with the guitar's shape pressed in */}
      <mesh geometry={geo.floor} material={SHELL} castShadow receiveShadow />
      <mesh geometry={geo.walls} material={SHELL} position={[0, 0, 8]} castShadow receiveShadow />
      <mesh geometry={geo.hollow} material={PLUSH_DEEP} position={[0, 0, 10]} receiveShadow />
      <mesh geometry={geo.plush} material={PLUSH} position={[0, 0, 14]} receiveShadow />
      {/* the well under the neck, its little plush lid ajar */}
      <group position={[0, well.y, 22]}>
        <mesh material={PLUSH} position={[0, 0, 12]} rotation={[0.25, 0, 0]} scale={[well.w, well.d, 6]}>
          <boxGeometry />
        </mesh>
        <mesh geometry={TUBE} material={NICKEL} position={[0, well.d / 2 - 6, 18]} rotation={[0, 0, Math.PI / 2]} scale={[1.6, 30, 1.6]} />
      </group>
      {/* the latches, down its opening side; the handle between them */}
      {latchY.map((y, i) => (
        <group key={i} position={[edgeAt(geo.outer, y) + 3, y, hb]}>
          <mesh material={NICKEL} scale={[10, 34, 26]}>
            <boxGeometry />
          </mesh>
        </group>
      ))}
      <group position={[edgeAt(geo.outer, L * 0.62) + 14, L * 0.62, hb - 30]}>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={TUBE} material={SHELL} position={[-6, s * 50, 0]} rotation={[0, 0, Math.PI / 2]} scale={[9, 24, 9]} />
        ))}
        <mesh geometry={TUBE} material={SHELL} position={[6, 0, 0]} scale={[11, 118, 11]} castShadow />
      </group>
      {/* the lid, hinged along its bass side, open */}
      <group position={[hingeX, 0, hb]} rotation={[0, -CASE.open, 0]}>
        <group position={[-hingeX, 0, 0]}>
          <mesh geometry={geo.lidWalls} material={SHELL} castShadow receiveShadow />
          <mesh geometry={geo.floor} material={SHELL} position={[0, 0, hl - 8]} castShadow />
          <mesh geometry={geo.lidPad} material={PLUSH} position={[0, 0, hl - 26]} />
        </group>
      </group>
    </group>
  )
}

/** the case's size once it's laid down (real mm): for its physics */
export const CASE_BOX = { half: [CASE.outside.w / 2, (CASE.outside.h * CASE.split) / 2, CASE.outside.l / 2] as [number, number, number] }

// ---- the strap: tied at the endpin and the heel, falling slack between them
const STRAP_MAT = bruno({ color: '#ffffff', side: DoubleSide, shade: '#9d86ad', vertexColors: true })
const STRAP_LEN = 1150 // (real mm: an ordinary strap, let out)
export const ENDPIN = new Vector3(0, -12, -BODY.depthTail / 2)
export const HEEL_BUTTON = new Vector3(0, END - (JOIN - 10), -BODY.depthHeel - 5)
/** `guitar`: the guitar's object (its frame, ./Guitar's); `scale`: the guitar's scale; `ground`: the grass's height */
export function Strap({ guitar, scale, ground }: { guitar: { current: Object3D | null }; scale: number; ground: number }) {
  const N = 48
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3))
    // woven stripes across it: cream, pink, sage, like the stand's canopy
    const cols = new Float32Array((N + 1) * 2 * 3)
    const stripe = [
      [0.99, 0.95, 0.89],
      [0.96, 0.7, 0.78],
      [0.99, 0.95, 0.89],
      [0.62, 0.78, 0.66],
    ]
    for (let i = 0; i <= N; i++)
      for (let k = 0; k < 2; k++) cols.set(stripe[Math.floor(i / 3) % 4], (i * 2 + k) * 3)
    g.setAttribute('color', new BufferAttribute(cols, 3))
    const idx: number[] = []
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    g.setIndex(idx)
    return g
  }, [])
  const a = useRef(new Vector3())
  const b = useRef(new Vector3())
  const was = useRef(new Vector3(1e9, 0, 0))
  const wasB = useRef(new Vector3(1e9, 0, 0))
  useFrame(() => {
    const o = guitar.current
    if (!o) return
    o.updateWorldMatrix(true, false)
    a.current.copy(ENDPIN).applyMatrix4(o.matrixWorld)
    b.current.copy(HEEL_BUTTON).applyMatrix4(o.matrixWorld)
    const moved = a.current.distanceTo(was.current) + b.current.distanceTo(wasB.current)
    if (moved < 0.05 && geo.boundingSphere) return
    was.current.copy(a.current)
    wasB.current.copy(b.current)
    const len = STRAP_LEN * scale
    const d = a.current.distanceTo(b.current)
    const sag = len > d ? Math.sqrt(len * len - d * d) * 0.48 : 0
    const p = geo.attributes.position as BufferAttribute
    const pt = new Vector3()
    const prev = new Vector3()
    const side = new Vector3()
    const up = new Vector3(0, 1, 0)
    const w = (STRAP.w * scale) / 2
    for (let i = 0; i <= N; i++) {
      const t = i / N
      pt.lerpVectors(a.current, b.current, t)
      pt.y -= sag * 4 * t * (1 - t)
      pt.y = Math.max(pt.y, ground + 0.6)
      // across it: level, square to where it runs
      const t2 = Math.min(1, t + 1 / N)
      prev.lerpVectors(a.current, b.current, t2)
      prev.y -= sag * 4 * t2 * (1 - t2)
      prev.y = Math.max(prev.y, ground + 0.6)
      const along = i < N ? prev.sub(pt) : pt.clone().sub(b.current).negate()
      side.crossVectors(along, up)
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0)
      side.normalize().multiplyScalar(w)
      p.setXYZ(i * 2, pt.x + side.x, pt.y + side.y, pt.z + side.z)
      p.setXYZ(i * 2 + 1, pt.x - side.x, pt.y - side.y, pt.z - side.z)
    }
    p.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
  })
  return <mesh geometry={geo} material={STRAP_MAT} castShadow frustumCulled={false} />
}
