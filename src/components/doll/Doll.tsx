import { useLayoutEffect, useMemo, useRef, type ReactNode, type Ref } from 'react'
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, TubeGeometry, Vector3, type Group, type Material } from 'three'
import { embroidery, lathe, radiusAt, TILE, yarnMaterial, type Stitcher } from '../../lib/crochet'
import { DOLL } from './spec'
import { Static } from '../../lib/render/Static'

/**
 * David as a crochet doll (./spec.ts, public/reference/doll-*.png, hoodie-*.jpg): cream yarn
 * skin and a sweet embroidered face, his black cuffed beanie with DoodleBob on the cuff, black hair with a middle part, the maroon
 * MF DOOM hoodie (DOOM on the chest, ALLCAPS! on the back), wide black pants, chunky black
 * sneakers with pink and white stripes.
 *
 * Every round part is a lathe with UVs in stitches (lib/crochet), so the crochet rows run around
 * it like real amigurumi rounds. Logos, lettering and the face are embroidery decals: threads
 * drawn on a canvas, laid on a patch cut from the same surface.
 *
 * Rigged for animation (DollRig): pelvis, waist, neck, shoulders and hips are joint groups.
 *
 * Origin on the floor between the feet, faces +Z, millimetres. ~339 tall.
 */
const Y = DOLL.yarn
const T = DOLL.thread
const shadow = { castShadow: true, receiveShadow: true }

/**
 * The doll's joints, for animation. Every joint rests at zero rotation; rotate (or nudge) these:
 *   root    the whole doll: where it is and which way it faces
 *   pelvis  bob and sway (pivot between the hips); legs and torso hang off it
 *   torso   lean and rock (pivot at the waist); arms and head hang off it
 *   head    look around (pivot at the neck)
 *   armL/R  swing (pivot at the shoulders)
 *   legL/R  stride (pivot at the hip joints; the shoes swing with them)
 * L/R are the doll's own left/right (left = +X).
 */
export type DollRig = Record<'root' | 'pelvis' | 'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR', Group>

/** A joint: children are modelled in doll coordinates; the group `ref` rotates them about `at`. Its pieces are
 *  merged (one draw a material; a joint inside it is left to itself, live, and merges its own) */
function Pivot({ at, ref, children }: { at: [number, number, number]; ref?: Ref<Group>; children: ReactNode }) {
  return (
    <group position={at}>
      <group ref={ref} userData={{ live: true }}>
        <group position={[-at[0], -at[1], -at[2]]}>
          <Static>{children}</Static>
        </group>
      </group>
    </group>
  )
}

export function Doll({ rig }: { rig?: { current: DollRig | null } }) {
  const mat = useMemo(
    () => ({
      skin: yarnMaterial(Y.skin.color, Y.skin.sheen),
      black: yarnMaterial(Y.black.color, Y.black.sheen),
      maroon: yarnMaterial(Y.maroon.color, Y.maroon.sheen),
      pink: yarnMaterial(Y.pink.color, Y.pink.sheen),
      white: yarnMaterial(Y.white.color, Y.white.sheen),
    }),
    [],
  )
  const R = DOLL.rig
  const A = DOLL.arm
  const root = useRef<Group>(null)
  const pelvis = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!rig) return
    rig.current = {
      root: root.current!,
      pelvis: pelvis.current!,
      torso: torso.current!,
      head: head.current!,
      armL: armL.current!,
      armR: armR.current!,
      legL: legL.current!,
      legR: legR.current!,
    }
  })
  const neck = useMemo(() => lathe([[DOLL.neck.r, DOLL.neck.y0], [DOLL.neck.r, DOLL.neck.y1]]), [])
  return (
    <group ref={root}>
      <Pivot at={[0, R.hipY, 0]} ref={pelvis}>
        {([1, -1] as const).map((side) => (
          <Pivot key={side} at={[side * DOLL.legs.x, R.hipY, 0]} ref={side === 1 ? legL : legR}>
            <Leg side={side} mat={mat} />
          </Pivot>
        ))}
        <Pivot at={[0, R.waistY, 0]} ref={torso}>
          <Hoodie mat={mat} />
          <mesh geometry={neck} material={mat.skin} {...shadow} />
          {([1, -1] as const).map((side) => (
            <Pivot key={side} at={[side * A.shoulder[0], A.shoulder[1], 0]} ref={side === 1 ? armL : armR}>
              <Arm side={side} mat={mat} />
            </Pivot>
          ))}
          <Pivot at={[0, R.neckY, 0]} ref={head}>
            <group position={[0, DOLL.headDrop, 0]}>
              <Head mat={mat} />
            </group>
          </Pivot>
        </Pivot>
      </Pivot>
    </group>
  )
}

type Mats = Record<'skin' | 'black' | 'maroon' | 'pink' | 'white', Material>

/** A point on a lathe surface: angle (0 = front, + toward the doll's left), height, pushed out by `off`. */
function onSurface(profile: [number, number][], th: number, y: number, off = 0) {
  const r = radiusAt(profile, y) + off
  return new Vector3(r * Math.sin(th), y, r * Math.cos(th))
}

/** A strand of yarn along a curve, with UVs scaled to stitches. */
function strand(points: Vector3[], radius: number) {
  const curve = new CatmullRomCurve3(points)
  const g = new TubeGeometry(curve, Math.max(12, points.length * 10), radius, 8, false)
  const len = curve.getLength()
  const uv = g.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / (DOLL.stitch.w * TILE), uv.getY(i) * 0.3)
  return g
}

/** A decal patch on a lathe region (0..1 UVs), with the embroidery material drawn for it. */
function useDecal(
  profile: [number, number][],
  theta: [number, number],
  yRange: [number, number],
  offset: number,
  draw: (s: Stitcher, w: number, h: number) => void,
  bend?: (p: Vector3) => void,
): [BufferGeometry, Material] {
  return useMemo(() => {
    const geo = lathe(profile, { theta, yRange, offset, uv: 'patch', segments: 40, step: 1.5, bend })
    const rMid = radiusAt(profile, (yRange[0] + yRange[1]) / 2)
    const w = rMid * theta[1]
    const h = yRange[1] - yRange[0]
    const m = embroidery(w, h, (s) => draw(s, w, h))
    return [geo, m]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

const zigzag = (ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, amp: number, step: number) => {
  ctx.moveTo(x0, y)
  for (let x = x0, k = 0; x <= x1; x += step, k++) ctx.lineTo(x, y + (k % 2 ? -amp : amp))
}

function Head({ mat }: { mat: Mats }) {
  const H = DOLL.head.profile
  const F = DOLL.face
  const head = useMemo(() => lathe(H), [H])
  const hair = useMemo(() => makeHair(H), [H])
  const nose = useMemo(() => lathe([[0, -4], [2.8, -2.9], [4, 0], [2.8, 2.9], [0, 4]], { step: 0.8 }), [])
  const ear = useMemo(() => lathe([[0, -8], [5.5, -5.8], [8, 0], [5.5, 5.8], [0, 8]], { step: 1.2 }), [])
  // a sweet face: tall brown oval eyes with a highlight, tiny soft brows, a small smile
  const face = useDecal(H, [-0.95, 1.9], [258, 302], 0.4, (s, w, h) => {
    const cx = w / 2
    const yy = (y: number) => h - (y - 258) // head height → canvas mm (top = 302)
    const xx = (x: number, y: number) => cx + (x / radiusAt(H, y)) * (w / 1.9) // mm across → canvas
    for (const sg of [-1, 1]) {
      const ex = xx(sg * F.eyeX, F.eyeY)
      const ey = yy(F.eyeY)
      s.satin(
        (c) => {
          c.ellipse(ex, ey, F.eyeW / 2, F.eyeH / 2, 0, 0, Math.PI * 2)
        },
        T.eye,
        Math.PI / 2,
      )
      // the highlight: one little white stitch, up and toward the nose's side for everyone alike
      s.satin(
        (c) => {
          c.ellipse(ex - 1.1, ey - 2.3, 0.85, 1.15, 0, 0, Math.PI * 2)
        },
        T.white,
      )
      // tiny soft brows, high and gently arched
      const bx = xx(sg * F.eyeX, F.browY)
      s.backstitch(
        (c) => {
          c.moveTo(bx - 1.8, yy(F.browY) + 0.3)
          c.quadraticCurveTo(bx, yy(F.browY) - 0.6, bx + 1.8, yy(F.browY) + 0.3)
        },
        T.brow,
        0.6,
        1.2,
      )
    }
    // a small, sweet smile
    s.backstitch(
      (c) => {
        c.moveTo(xx(-2.6, F.mouthY), yy(F.mouthY) - 0.4)
        c.quadraticCurveTo(xx(0, F.mouthY), yy(F.mouthY) + 1.4, xx(2.6, F.mouthY), yy(F.mouthY) - 0.4)
      },
      T.mouth,
      0.75,
      1.3,
    )
  })
  const earX = radiusAt(H, DOLL.ear.y) + 1
  return (
    <group scale={[1, 1, DOLL.head.depth]}>
      <mesh geometry={head} material={mat.skin} {...shadow} />
      <mesh geometry={face[0]} material={face[1]} />
      <mesh geometry={nose} material={mat.skin} position={[0, F.noseY, radiusAt(H, F.noseY) - 1]} scale={[1, 0.85, 0.7]} castShadow />
      {[1, -1].map((sg) => (
        <mesh key={sg} geometry={ear} material={mat.skin} position={[sg * earX, DOLL.ear.y, -3]} scale={[0.45, 1, 0.8]} castShadow />
      ))}
      <mesh geometry={hair} material={mat.black} {...shadow} />
      <Beanie mat={mat} />
    </group>
  )
}

/**
 * The hair: one crocheted piece hugging the head, its lower edge a designed curve. A little V at
 * the centre of the forehead (the middle part), curtain bangs sweeping out and down to the
 * temples, a rounded bob over the sides and back, ears peeking out. A thick rolled rim, a soft
 * groove along the part, faint strands flowing out from it.
 */
function makeHair(H: [number, number][]) {
  const R = DOLL.hair
  const edge = R.edge // [|θ|, y] control points: the lower edge, front to back
  const edgeY = (a: number) => {
    const t = Math.abs(a)
    for (let i = 1; i < edge.length; i++)
      if (t <= edge[i][0]) {
        const [a0, y0] = edge[i - 1]
        const [a1, y1] = edge[i]
        const f = (t - a0) / (a1 - a0)
        return y0 + (y1 - y0) * (f * f * (3 - 2 * f)) // eased between points: a smooth swoop
      }
    return edge[edge.length - 1][1]
  }
  const NA = 180
  const NT = 34
  const pos = new Float32Array((NA + 1) * (NT + 1) * 3)
  const uv = new Float32Array((NA + 1) * (NT + 1) * 2)
  const v = new Vector3()
  for (let i = 0; i <= NA; i++) {
    const a = -Math.PI + (2 * Math.PI * i) / NA
    const yb = edgeY(a)
    const side = Math.min(1, Math.max(0, (Math.abs(a) - 0.9) / 0.8)) // 0 at the face, 1 over the sides/back
    for (let j = 0; j <= NT; j++) {
      const t = Math.pow(j / NT, 1.5) // more rows near the rim
      const y = yb + (R.top - yb) * t
      // thickness: tucked against the skin at the very edge, a rolled rim, then the body
      let off = 0.3 + (R.thick - 0.3) * Math.min(1, Math.sqrt(t * 9))
      off += R.bob * side * Math.sin(Math.min(1, t * 2.2) * Math.PI) // the bob's rounded fullness
      // the middle part: a soft groove up the centre of the forehead
      off -= 1.2 * Math.exp(-((a / 0.06) ** 2)) * Math.min(1, t * 3)
      // faint strands flowing out and down from the part
      const flow = Math.atan2(y - R.partY, a * 40)
      off += 0.35 * Math.cos(flow * 22) * Math.min(1, t * 4)
      const p = onSurface(H, a, y, off)
      v.copy(p)
      const n = i * (NT + 1) + j
      v.toArray(pos, n * 3)
      uv[n * 2] = (a * 40) / DOLL.stitch.w / TILE
      uv[n * 2 + 1] = y / DOLL.stitch.h / TILE
    }
  }
  const idx: number[] = []
  for (let i = 0; i < NA; i++)
    for (let j = 0; j < NT; j++) {
      const a = i * (NT + 1) + j
      const b = a + NT + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * His beanie (public/reference/beanie.webp): a black ribbed cuffed watch cap. Rounded crown with a
 * soft peak and fine ribs, a tall folded cuff with deeper ribs, DoodleBob embroidered in white on
 * the front of the cuff. Worn tipped back a little so the middle part shows.
 */
function Beanie({ mat }: { mat: Mats }) {
  const B = DOLL.beanie
  const C = B.cuff
  const R = B.crownRibs
  // knit ribs: the surface pushed in and out around the circumference
  const rib = (v: Vector3, count: number, depth: number) => {
    const r = Math.hypot(v.x, v.z)
    if (r < 1e-3) return
    const k = (r + depth * Math.cos(count * Math.atan2(v.x, v.z))) / r
    v.x *= k
    v.z *= k
  }
  const crown = useMemo(
    () =>
      lathe(B.crown, {
        segments: 128,
        bend: (v) => rib(v, R.count, R.depth * Math.min(1, Math.max(0, (R.fadeTo - v.y) / (R.fadeTo - R.fadeFrom)))),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [B, R],
  )
  // the folded cuff: a rounded-rectangle cross-section revolved, ribs on its outer face
  const cuffRibs = (v: Vector3) => {
    const r = Math.hypot(v.x, v.z)
    rib(v, C.ribs, C.ribDepth * Math.min(1, Math.max(0, (r - C.rIn - 1.5) / (C.rOut - C.rIn - 1.5))))
  }
  const cuff = useMemo(() => {
    const pts: [number, number][] = []
    const corner = (cr: number, cy: number, a0: number) => {
      for (let i = 0; i <= 4; i++) {
        const a = a0 + (Math.PI / 2) * (i / 4)
        pts.push([cr + 2.5 * Math.cos(a), cy + 2.5 * Math.sin(a)])
      }
    }
    corner(C.rIn + 2.5, C.y0 + 2.5, Math.PI) // inner bottom, then along the bottom outward
    corner(C.rOut - 2.5, C.y0 + 2.5, -Math.PI / 2) // outer bottom, then up the outside
    corner(C.rOut - 2.5, C.y1 - 2.5, 0) // outer top, then inward along the top
    corner(C.rIn + 2.5, C.y1 - 2.5, Math.PI / 2) // inner top, then down the inside
    pts.push(pts[0])
    return lathe(pts, { step: 1.2, segments: 192, bend: cuffRibs })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [C])
  // DoodleBob, embroidered straight onto the cuff (white thread, following the ribs)
  const face0 = C.y0 + 2.5
  const face1 = C.y1 - 2.5
  const doodle = useDecal(
    [
      [C.rOut, face0],
      [C.rOut, face1],
    ],
    [-B.doodle.half, 2 * B.doodle.half],
    [face0, face1],
    0.7,
    (s, w) => {
      const W = T.white
      const D = '#2b292e'
      const cx = w / 2
      // a wobbly sponge body
      const body = (c: CanvasRenderingContext2D) => {
        c.moveTo(cx - 3.3, 1.5)
        c.lineTo(cx + 3.4, 1.2)
        c.lineTo(cx + 3.2, 9.0)
        c.lineTo(cx - 3.4, 9.2)
        c.closePath()
      }
      s.satin(body, W, 0.3)
      // arms thrown up with little fingers, stubby legs and feet: white thread on the black knit
      s.backstitch(
        (c) => {
          c.moveTo(cx - 3.3, 4.4)
          c.quadraticCurveTo(cx - 5.6, 3.8, cx - 6.6, 1.6)
          c.moveTo(cx + 3.3, 4.2)
          c.quadraticCurveTo(cx + 5.6, 3.6, cx + 6.4, 1.3)
          c.moveTo(cx - 7.4, 1.7)
          c.lineTo(cx - 6.6, 1.6)
          c.lineTo(cx - 6.9, 0.7)
          c.moveTo(cx + 7.2, 1.4)
          c.lineTo(cx + 6.4, 1.3)
          c.lineTo(cx + 6.7, 0.4)
          c.moveTo(cx - 1.7, 9.2)
          c.lineTo(cx - 1.8, 11.3)
          c.lineTo(cx - 3, 11.4)
          c.moveTo(cx + 1.6, 9.1)
          c.lineTo(cx + 1.7, 11.3)
          c.lineTo(cx + 2.9, 11.4)
        },
        W,
        0.55,
        1.3,
      )
      // googly eyes, a round nose, the frown and two buck teeth, the pants line: dark thread
      s.backstitch(
        (c) => {
          c.moveTo(cx - 0.2, 3.5)
          c.arc(cx - 1.5, 3.5, 1.3, 0, Math.PI * 2)
          c.moveTo(cx + 2.8, 3.4)
          c.arc(cx + 1.5, 3.4, 1.3, 0, Math.PI * 2)
          c.moveTo(cx + 0.5, 5.3)
          c.arc(cx, 5.3, 0.5, 0, Math.PI * 2)
          c.moveTo(cx - 2.1, 7.3)
          c.quadraticCurveTo(cx, 6.1, cx + 2.1, 7.2)
          c.moveTo(cx - 1, 6.8)
          c.lineTo(cx - 1, 7.8)
          c.lineTo(cx - 0.2, 7.8)
          c.lineTo(cx - 0.2, 6.6)
          c.moveTo(cx + 0.3, 6.6)
          c.lineTo(cx + 0.3, 7.8)
          c.lineTo(cx + 1.1, 7.8)
          c.lineTo(cx + 1.1, 6.8)
          c.moveTo(cx - 3.3, 8.2)
          c.lineTo(cx + 3.2, 8.0)
        },
        D,
        0.32,
        0.8,
      )
      s.satin((c) => {
        c.moveTo(cx - 0.75, 3.7)
        c.arc(cx - 1.2, 3.7, 0.45, 0, Math.PI * 2)
        c.moveTo(cx + 2.25, 3.6)
        c.arc(cx + 1.8, 3.6, 0.45, 0, Math.PI * 2)
      }, D)
      // crisp white outline around the body
      s.backstitch(body, W, 0.5, 1.2)
    },
    cuffRibs,
  )
  return (
    <group position={[0, B.pivotY, 0]} rotation={[B.tilt, 0, 0]}>
      <group position={[0, -B.pivotY, 0]}>
        <mesh geometry={crown} material={mat.black} {...shadow} />
        <mesh geometry={cuff} material={mat.black} {...shadow} />
        <mesh geometry={doodle[0]} material={doodle[1]} />
      </group>
    </group>
  )
}

function Hoodie({ mat }: { mat: Mats }) {
  const P = DOLL.torso.profile
  const K = DOLL.pocket
  const body = useMemo(() => lathe(P), [P])
  const pocket = useMemo(() => lathe(P, { theta: [-K.half, 2 * K.half], yRange: [K.y0, K.y1], offset: 2.2 }), [P, K])
  // the hood lying down the back: a flat pouch (an ellipsoid pressed against the back)
  const hood = useMemo(() => {
    const [rx, ry] = DOLL.hood.size
    const pts: [number, number][] = []
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 16
      pts.push([rx * Math.cos(a), ry * Math.sin(a)])
    }
    return lathe(pts)
  }, [])
  const collar = useMemo(() => {
    const { R, t } = DOLL.collar
    const pts: [number, number][] = []
    for (let i = 0; i <= 20; i++) {
      const a = -Math.PI + (2 * Math.PI * i) / 20
      pts.push([R + t * Math.cos(a), t * Math.sin(a)])
    }
    return lathe(pts, { step: 1.5 })
  }, [])
  // DOOM (the mask logo) on the chest, the wearer's left
  const L = DOLL.logo
  const logo = useDecal(P, L.theta, L.y, 0.5, (s, w, h) => {
    const cx = w / 2
    const cy = h / 2 + 0.5
    s.satin(
      (c) => {
        c.font = `900 ${h * 0.62}px Arial Black, Impact, sans-serif`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText('D', cx - 8.2, cy)
        c.fillText('M', cx + 8.4, cy)
        // the mask: a rounded shield between the letters
        c.moveTo(cx - 4.4, cy - 5.6)
        c.lineTo(cx + 4.4, cy - 5.6)
        c.lineTo(cx + 4, cy + 1.8)
        c.lineTo(cx + 1.5, cy + 6)
        c.lineTo(cx - 1.5, cy + 6)
        c.lineTo(cx - 4, cy + 1.8)
        c.closePath()
      },
      T.white,
      0.2,
    )
    // eye slits and mouth grill stitched in maroon over the mask
    s.backstitch(
      (c) => {
        c.moveTo(cx - 3.2, cy - 1.7)
        c.lineTo(cx - 0.8, cy - 1.3)
        c.moveTo(cx + 3.2, cy - 1.7)
        c.lineTo(cx + 0.8, cy - 1.3)
        c.moveTo(cx - 1.5, cy + 2.1)
        c.lineTo(cx + 1.5, cy + 2.1)
        c.moveTo(cx - 1.1, cy + 3.8)
        c.lineTo(cx + 1.1, cy + 3.8)
      },
      Y.maroon.color,
      0.7,
      1.6,
    )
  })
  // ALLCAPS! with the zigzags on the back, below the hood, like the doll
  const back = useDecal(P, [Math.PI - 0.95, 1.9], DOLL.back.y, 0.5, (s, w) => {
    s.backstitch((c) => zigzag(c, 16, w - 16, 3.2, 1.4, 3), T.green, 0.9, 2.2)
    s.backstitch(
      (c) => {
        c.font = `600 11px Arial Narrow, Arial, sans-serif`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.strokeText('ALLCAPS!', w / 2, 14.5)
      },
      T.white,
      0.9,
      2.2,
    )
    s.backstitch((c) => zigzag(c, 6, w - 6, 29, 1.7, 3.4), T.green, 1, 2.2)
    s.backstitch((c) => zigzag(c, 6, w - 6, 37.5, 1.9, 3.6), T.yellow, 1, 2.2)
  })
  // the pocket's stitched top and bottom edges
  const pocketTrim = useDecal(P, [-K.half, 2 * K.half], [K.y0, K.y1], 2.8, (s, w, h) => {
    s.backstitch((c) => zigzag(c, 3, w - 3, 2.2, 0.9, 2.2), T.yellow, 0.9, 1.8)
    s.backstitch((c) => zigzag(c, 3, w - 3, h - 2.2, 0.9, 2.2), T.green, 0.9, 1.8)
  })
  const { pos, size } = DOLL.hood
  return (
    <group>
      <group scale={[1, 1, DOLL.torso.depth]}>
        <mesh geometry={body} material={mat.maroon} {...shadow} />
        <mesh geometry={pocket} material={mat.maroon} {...shadow} />
        <mesh geometry={logo[0]} material={logo[1]} />
        <mesh geometry={back[0]} material={back[1]} />
        <mesh geometry={pocketTrim[0]} material={pocketTrim[1]} />
      </group>
      {/* the hood lying flat down the back, and its thick rolled edge around the neck */}
      <mesh geometry={hood} material={mat.maroon} position={pos} rotation={[0.18, 0, 0]} scale={[1, 1, size[2] / size[0]]} {...shadow} />
      <mesh geometry={collar} material={mat.maroon} position={[0, DOLL.collar.y, -1.5]} rotation={[DOLL.collar.tilt, 0, 0]} scale={[1, 1, 0.9]} {...shadow} />
    </group>
  )
}

/** An arm in shoulder-local coordinates, hanging down and angled out (the joint is outside). */
function Arm({ side, mat }: { side: 1 | -1; mat: Mats }) {
  const A = DOLL.arm
  const sleeve = useMemo(() => lathe(A.sleeve), [A])
  const hand = useMemo(() => {
    const { r, len } = A.hand
    const y0 = A.sleeve[0][1]
    return lathe([
      [0, y0 - len - 2],
      [r * 0.7, y0 - len - 1],
      [r, y0 - len + 4],
      [r, y0 - 6],
      [r * 0.85, y0 + 2],
      [0, y0 + 3],
    ])
  }, [A])
  return (
    <group position={[side * A.shoulder[0], A.shoulder[1], 0]} rotation={[0, 0, side * A.spread]}>
      <mesh geometry={sleeve} material={mat.maroon} {...shadow} />
      <mesh geometry={hand} material={mat.skin} {...shadow} />
    </group>
  )
}

/** A leg (pants + sneaker) in doll coordinates; its joint at the hip is outside. */
function Leg({ side, mat }: { side: 1 | -1; mat: Mats }) {
  const L = DOLL.legs
  const S = DOLL.shoe
  const pants = useMemo(() => lathe(L.profile), [L])
  const shoe = useMemo(
    () => ({
      pink: lathe(S.profile, { yRange: S.bands.pink }),
      white: lathe(S.profile, { yRange: S.bands.white, offset: 0.3 }),
      upper: lathe(S.profile, { yRange: [S.bands.white[1], 33] }),
      trim: lathe(
        Array.from({ length: 13 }, (_, i) => {
          const a = -Math.PI + (2 * Math.PI * i) / 12
          return [9.5 + 2 * Math.cos(a), 2 * Math.sin(a)] as [number, number]
        }),
        { step: 1 },
      ),
    }),
    [S],
  )
  // laces: two floppy loops on top and the ends dangling down the front to the floor
  const laces = useMemo(() => {
    const loop = (sg: number) =>
      strand(
        [
          [0, 31, 16],
          [sg * 5, 35, 19],
          [sg * 8, 31, 22],
          [sg * 3, 30, 20],
          [0, 31, 17],
        ].map(([x, y, z]) => new Vector3(x, y, z)),
        0.9,
      )
    const end = (sg: number) =>
      strand(
        [
          [0, 31, 17],
          [sg * 2, 26, 26],
          [sg * 3, 14, 30],
          [sg * 4.5, 3, 31],
        ].map(([x, y, z]) => new Vector3(x, y, z)),
        0.9,
      )
    return [loop(1), loop(-1), end(1), end(-1)]
  }, [])
  return (
    <group>
      <mesh geometry={pants} material={mat.black} position={[side * L.x, 0, 0]} {...shadow} />
      <group position={[side * S.x, 0, S.z]}>
        <group scale={[1, 1, S.stretch]}>
          <mesh geometry={shoe.pink} material={mat.pink} {...shadow} />
          <mesh geometry={shoe.white} material={mat.white} {...shadow} />
          <mesh geometry={shoe.upper} material={mat.black} {...shadow} />
        </group>
        <mesh geometry={shoe.trim} material={mat.pink} position={[0, 30, 2]} scale={[1, 1, 1.3]} castShadow />
        {laces.map((g, i) => (
          <mesh key={i} geometry={g} material={mat.black} castShadow />
        ))}
      </group>
    </group>
  )
}
