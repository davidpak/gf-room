import { Static } from '../../lib/render/Static'
import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, Color, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry, TorusGeometry, type Group } from 'three'
import { bruno } from '../quad/bruno'

/**
 * A mallard (../picnic/spec [M]), in real millimetres, the toy look: the drake (bottle-green head, a white collar, a
 * chestnut breast, pale grey flanks, a black rump and the curl of black feathers over his white tail, a yellow
 * bill), the hen (mottled brown all over, a dark stripe through her eye, an orange bill blotched dark), their
 * ducklings (yellow and dark brown fluff). A blue speculum edged white on the wings of the grown ones, orange
 * webbed feet on all.
 *
 * It's rigged (`rig`): its body rolls and bobs as it waddles, its legs step, its neck reaches down to peck
 * (its head stays level-ish), its bill opens to quack, its wings lift and beat. The owner sets those each
 * frame (./Ducks), by the rig's numbers: walk (the step's phase), peck (0..1: down), quack (0..1: open),
 * flap (0..1), look (its head turned, radians).
 *
 * Its frame: standing on y = 0, facing +x.
 */
export type DuckKind = 'drake' | 'hen' | 'duckling'
export type DuckPose = { walk: number; stride: number; peck: number; quack: number; flap: number; look: number; preen: number; wag: number }
export const newPose = (): DuckPose => ({ walk: 0, stride: 0, peck: 0, quack: 0, flap: 0, look: 0, preen: 0, wag: 0 })

/** sizes: the grown ones [M] 580 long bill to tail; a duckling of a week or two, 150 */
const SIZE = {
  adult: { len: 180, wide: 100, tall: 84, y: 128, neck: [122, 150] as [number, number], neckLen: 78, headR: 50, bill: 62, leg: 56, legX: -20, legZ: 40 },
  duckling: { len: 64, wide: 46, tall: 44, y: 56, neck: [44, 70] as [number, number], neckLen: 22, headR: 34, bill: 20, leg: 22, legX: -4, legZ: 18 },
}

// ---- its looks
const ORANGE = bruno({ color: '#f39a3a', shade: '#b0705e' })
const BLACK = bruno({ color: '#1c1a20', shade: '#141218' })
const WHITE = bruno({ color: '#f4f2ee', shade: '#b9b2c2' })
const EYE_SHINE = bruno({ color: '#ffffff', shade: '#ffffff', lit: 1.4 })
const DRAKE = {
  head: bruno({ color: '#2c7a4a', shade: '#1b3e3e', sheen: 0.7 }),
  bill: bruno({ color: '#e3cf58', shade: '#9f9064' }),
  wing: bruno({ color: '#8f877e', shade: '#5f5868' }),
  tail: bruno({ color: '#dcd8d2', shade: '#9a92a0' }),
}
const SPECULUM = bruno({ color: '#3b52c4', shade: '#2a3170', sheen: 0.6 })
const HEN = {
  head: bruno({ color: '#b48a5c', shade: '#6c5560' }),
  crown: bruno({ color: '#5e4128', shade: '#3c2c34' }),
  bill: bruno({ color: '#ec8a3c', shade: '#a26a5e' }),
  saddle: bruno({ color: '#5a3c2c', shade: '#3a2830' }),
  wing: bruno({ color: '#8b673f', shade: '#5c4650' }),
}
const CHICK = {
  fluff: bruno({ color: '#f4d466', shade: '#b39a74' }),
  back: bruno({ color: '#6e4f2e', shade: '#45343a' }),
  bill: bruno({ color: '#4a3a30', shade: '#2e2428' }),
}

// ---- its shapes
/** the body: an egg, full at the breast, drawn in and up toward the tail, flatter underneath; coloured
 *  for the drake by where on it (the chestnut breast, grey flanks, the black rump) */
function bodyGeo(kind: DuckKind) {
  const S = kind === 'duckling' ? SIZE.duckling : SIZE.adult
  const g = new SphereGeometry(1, 64, 44)
  const p = g.attributes.position
  const col: number[] = []
  const chestnut = new Color('#86452e')
  const grey = new Color('#d4d0ca')
  const back = new Color('#9c9184')
  const rump = new Color('#1e1c22')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    let y = p.getY(i)
    const z = p.getZ(i)
    if (y < 0) y *= kind === 'duckling' ? 0.9 : 0.82
    const rear = Math.max(0, -x)
    const front = Math.max(0, x)
    const X = x * S.len
    let Y = y * S.tall * (1 + 0.12 * front) * (1 - 0.3 * rear * rear) + S.tall * 0.42 * rear * rear * (kind === 'duckling' ? 0.4 : 1)
    const Z = z * S.wide * (1 - 0.38 * rear * rear) * (1 + 0.04 * front)
    if (kind !== 'duckling') Y += 10 * front * front * Math.max(0, y) // (the breast held high)
    p.setXYZ(i, X, Y, Z)
    if (kind === 'drake') {
      let c = grey.clone()
      if (y > 0.55) c.lerp(back, Math.min(1, (y - 0.55) / 0.3))
      if (x > 0.35 && y > -0.55) c = c.lerp(chestnut, Math.min(1, (x - 0.35) / 0.2) * Math.min(1, (y + 0.55) / 0.25))
      if (x < -0.72) c.lerp(rump, Math.min(1, (-x - 0.72) / 0.12))
      col.push(c.r, c.g, c.b)
    } else if (kind === 'duckling') {
      // dark brown over its back, yellow under and round its front
      const c = new Color('#f4d466').lerp(new Color('#6e4f2e'), Math.min(1, Math.max(0, (y - 0.15 + x * 0.25) / 0.3)))
      col.push(c.r, c.g, c.b)
    } else {
      // the hen: each feather dark down its middle, buff round it, in rows that overlap; paler underneath
      const b = Y / 15 + Z * 0.012
      const row = Math.floor(b)
      const fu = ((((X / 21 + row * 0.5) % 1) + 1) % 1) - 0.5
      const fv = (((b % 1) + 1) % 1) - 0.6
      const d = Math.hypot(fu, fv * 1.25)
      const dark = Math.max(0, Math.min(1, (0.36 - d) / 0.14))
      const c = new Color('#cfa877').lerp(new Color('#a87b4b'), 0.5 + 0.5 * Math.max(-1, Math.min(1, y * 2))).lerp(new Color('#5f3f24'), dark * (y < -0.5 ? 0.4 : 0.85))
      col.push(c.r, c.g, c.b)
    }
  }
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.computeVertexNormals()
  return g
}
const VERTEX = bruno({ vertexColors: true, color: '#ffffff', shade: '#6c6372' })
/** a bill: flat, rounded at its tip, wider there than where it meets the face; its nail at the tip */
function billGeo(len: number, w: number, t: number, lower = false) {
  const s = new Shape()
  s.moveTo(0, -w * 0.42)
  s.bezierCurveTo(len * 0.5, -w * 0.5, len * 0.92, -w * 0.52, len, -w * 0.25)
  s.bezierCurveTo(len * 1.04, 0, len * 1.04, 0, len, w * 0.25)
  s.bezierCurveTo(len * 0.92, w * 0.52, len * 0.5, w * 0.5, 0, w * 0.42)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.35, bevelSize: t * 0.35, bevelSegments: 3, curveSegments: 12 })
  // (lying flat: its outline across x/z, its thickness up; the upper one rising to the forehead)
  g.rotateX(Math.PI / 2)
  g.translate(0, lower ? 0 : t, 0)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    if (!lower && y > t * 0.3) p.setY(i, y + Math.max(0, 1 - x / (len * 0.45)) * t * 0.9) // (thicker at its base)
    if (lower) p.setY(i, y - t * 0.5)
  }
  g.computeVertexNormals()
  return g
}
/** a webbed foot: three toes splayed, webbed between, flat on the ground */
function footGeo(len: number) {
  const s = new Shape()
  s.moveTo(0, 0)
  const toes = [-0.55, 0, 0.55]
  toes.forEach((a, i) => {
    const tx = Math.cos(a) * len
    const tz = Math.sin(a) * len
    if (i === 0) s.lineTo(tx * 0.9, tz * 0.9)
    s.quadraticCurveTo(tx * 1.05, tz * 1.05 + len * 0.05, tx, tz + len * 0.08)
    if (i < 2) {
      const n = toes[i + 1]
      s.quadraticCurveTo(((tx + Math.cos(n) * len) / 2) * 0.8, ((tz + Math.sin(n) * len) / 2) * 0.8, Math.cos(n) * len * 0.92, Math.sin(n) * len * 0.92)
    }
  })
  s.lineTo(0, 0)
  const g = new ExtrudeGeometry(s, { depth: len * 0.06, bevelEnabled: false, curveSegments: 6 })
  g.rotateX(Math.PI / 2)
  g.translate(0, len * 0.06, 0)
  return g
}

type Shapes = ReturnType<typeof buildShapes>
const shapes: Partial<Record<DuckKind, Shapes>> = {}
function buildShapes(kind: DuckKind) {
  const S = kind === 'duckling' ? SIZE.duckling : SIZE.adult
  const chick = kind === 'duckling'
  return {
    body: bodyGeo(kind),
    neck: new CylinderGeometry(S.headR * (chick ? 0.6 : 0.8), S.headR * (chick ? 0.9 : 1.25), S.neckLen, 24, 1),
    head: new SphereGeometry(S.headR, 28, 20),
    bill: billGeo(S.bill, S.headR * (chick ? 0.75 : 0.78), S.headR * (chick ? 0.18 : 0.15)),
    jaw: billGeo(S.bill * 0.92, S.headR * (chick ? 0.68 : 0.7), S.headR * 0.09, true),
    eye: new SphereGeometry(S.headR * (chick ? 0.17 : 0.13), 12, 10),
    shine: new SphereGeometry(S.headR * 0.04, 6, 5),
    wing: new SphereGeometry(1, 24, 14),
    leg: new CylinderGeometry(S.leg * 0.085, S.leg * 0.1, S.leg, 8),
    foot: footGeo(S.leg * (chick ? 0.9 : 0.72)),
    tail: new SphereGeometry(1, 16, 10),
    curl: new TorusGeometry(14, 3.6, 8, 20, Math.PI * 1.4),
    collar: new TorusGeometry(S.headR * 0.7, S.headR * 0.09, 8, 28),
  }
}

/** the parts the owner moves */
export type DuckRig = { body: Group | null; neck: Group | null; head: Group | null; jaw: Group | null; legs: (Group | null)[]; wings: (Group | null)[]; tail: Group | null }

export function Duck({ kind, pose, children }: { kind: DuckKind; pose: { current: DuckPose }; children?: ReactNode }) {
  const g = useMemo(() => (shapes[kind] ??= buildShapes(kind)), [kind])
  const S = kind === 'duckling' ? SIZE.duckling : SIZE.adult
  const chick = kind === 'duckling'
  const rig = useRef<DuckRig>({ body: null, neck: null, head: null, jaw: null, legs: [null, null], wings: [null, null], tail: null })
  const m = kind === 'drake' ? { body: VERTEX, head: DRAKE.head, bill: DRAKE.bill, wing: DRAKE.wing, tail: DRAKE.tail } : kind === 'hen' ? { body: VERTEX, head: HEN.head, bill: HEN.bill, wing: HEN.wing, tail: HEN.wing } : { body: VERTEX, head: CHICK.fluff, bill: CHICK.bill, wing: CHICK.back, tail: CHICK.back }
  // ---- moved each frame by its pose
  useFrame(() => {
    const r = rig.current
    const p = pose.current
    const s = Math.sin(p.walk)
    const stride = p.stride
    if (r.body) {
      // waddling: rolling side to side with each step, bobbing; pitched forward to peck, back to quack
      r.body.rotation.x = s * 0.13 * stride
      r.body.rotation.z = -p.peck * 0.42 + p.quack * 0.08 + Math.cos(p.walk * 2) * 0.03 * stride
      r.body.position.y = S.y + Math.abs(s) * S.len * 0.035 * stride - p.peck * S.tall * 0.25 + p.flap * S.tall * 0.3
    }
    if (r.neck) {
      // reaching down and forward to peck; craned round to preen; bobbing as it walks
      r.neck.rotation.z = -p.peck * (chick ? 1.2 : 1.55) + Math.sin(p.walk * 2) * 0.06 * stride + p.quack * 0.15
      r.neck.rotation.y = p.preen * 2.2
      r.neck.rotation.x = p.preen * 0.4
    }
    if (r.head) {
      // its head stays level-ish as the neck goes down (tipped for the last of the peck), looks about
      r.head.rotation.z = p.peck * (chick ? 0.9 : 1.05) + p.quack * 0.25
      r.head.rotation.y = p.look
    }
    if (r.jaw) r.jaw.rotation.z = -p.quack * 0.5
    r.legs.forEach((l, i) => {
      if (!l) return
      const sg = i ? 1 : -1
      l.rotation.z = sg * s * 0.55 * stride
      l.position.y = S.leg + Math.max(0, sg * s) * S.leg * 0.25 * stride
    })
    r.wings.forEach((w, i) => {
      if (!w) return
      const sg = i ? 1 : -1
      // folded at its sides; lifted and beating when it flaps
      const beat = p.flap > 0 ? p.flap * (0.5 + 0.9 * Math.abs(Math.sin(p.walk * 5))) : 0
      w.rotation.x = sg * beat * 1.4
    })
    if (r.tail) r.tail.rotation.y = Math.sin(p.wag) * 0.35 * Math.min(1, Math.abs(Math.cos(p.wag * 0.5)) + 0.2)
  })
  const hr = S.headR
  const [nx, ny] = S.neck
  return (
    <group>
      {/* its legs and webbed feet (stepping) */}
      {[-1, 1].map((sz, i) => (
        <group key={sz} ref={(o) => void (rig.current.legs[i] = o)} position={[S.legX, S.leg, sz * S.legZ]}>
          <Static>
            <mesh geometry={g.leg} material={ORANGE} position={[0, -S.leg / 2 + S.leg * 0.2, 0]} scale={[1, 1.4, 1]} castShadow />
            <mesh geometry={g.foot} material={ORANGE} position={[-S.leg * 0.08, -S.leg, 0]} rotation={[0, sz * 0.15, 0]} castShadow />
          </Static>
        </group>
      ))}
      <group ref={(o) => void (rig.current.body = o)} position={[0, S.y, 0]}>
        <mesh geometry={g.body} material={m.body} castShadow receiveShadow />
        {/* its wings, folded along its sides (the speculum showing at their back edge) */}
        {[-1, 1].map((sz, i) => (
          <group key={sz} ref={(o) => void (rig.current.wings[i] = o)} position={[S.len * 0.3, S.tall * 0.45, sz * S.wide * 0.48]}>
            {chick ? (
              <mesh geometry={g.wing} material={m.wing} position={[-S.len * 0.45, -S.tall * 0.05, sz * S.wide * 0.12]} rotation={[sz * -0.5, 0, 0.2]} scale={[S.len * 0.32, S.tall * 0.3, S.wide * 0.3]} castShadow />
            ) : (
              <>
                <mesh geometry={g.wing} material={m.wing} position={[-S.len * 0.58, -S.tall * 0.06, sz * S.wide * 0.1]} rotation={[sz * -0.45, 0, 0.1]} scale={[S.len * 0.66, S.tall * 0.42, S.wide * 0.36]} castShadow />
                <mesh geometry={g.wing} material={SPECULUM} position={[-S.len * 0.86, -S.tall * 0.2, sz * S.wide * 0.3]} rotation={[sz * -0.45, 0, 0.16]} scale={[S.len * 0.17, S.tall * 0.1, S.wide * 0.1]} />
                <mesh geometry={g.wing} material={WHITE} position={[-S.len * 0.86, -S.tall * 0.27, sz * S.wide * 0.28]} rotation={[sz * -0.45, 0, 0.16]} scale={[S.len * 0.18, S.tall * 0.05, S.wide * 0.1]} />
              </>
            )}
          </group>
        ))}
        {/* its tail: up off its rump (the drake's white, with his curl) */}
        <group ref={(o) => void (rig.current.tail = o)} position={[-S.len * 0.86, S.tall * 0.42, 0]}>
          <mesh geometry={g.tail} material={m.tail} position={[-S.len * 0.14, S.tall * 0.1, 0]} rotation={[0, 0, 0.38]} scale={[S.len * (chick ? 0.14 : 0.27), S.tall * 0.09, S.wide * (chick ? 0.2 : 0.3)]} castShadow />
          {kind === 'drake' && <mesh geometry={g.curl} material={BLACK} position={[S.len * 0.02, S.tall * 0.3, 0]} rotation={[0, 0, 0.3]} scale={0.8} />}
        </group>
        {/* its neck (reaching down to peck), its head on it */}
        <group ref={(o) => void (rig.current.neck = o)} position={[nx, ny - S.y, 0]} rotation={[0, 0, 0]}>
          <mesh geometry={g.neck} material={kind === 'drake' ? DRAKE.head : m.head} position={[hr * 0.12, S.neckLen / 2, 0]} rotation={[0, 0, -0.12]} castShadow />
          {kind === 'drake' && <mesh geometry={g.collar} material={WHITE} position={[hr * 0.05, S.neckLen * 0.2, 0]} rotation={[Math.PI / 2, 0.12, 0]} />}
          <group ref={(o) => void (rig.current.head = o)} position={[hr * 0.3, S.neckLen, 0]}>
            {/* (its head drawn as a few meshes, not a dozen: merged as it turns; its jaw left to move) */}
            <Static>
            <mesh geometry={g.head} material={m.head} scale={[1.18, chick ? 1 : 0.95, 0.88]} castShadow />
            {kind === 'hen' && <mesh geometry={g.head} material={HEN.crown} position={[-hr * 0.06, hr * 0.2, 0]} scale={[1.14, 0.84, 0.84]} />}
            {/* its eyes (and the hen's and ducklings' dark stripe through them) */}
            {[-1, 1].map((sz) => (
              <group key={sz} position={[hr * 0.38, hr * 0.22, sz * hr * 0.74]}>
                {kind !== 'drake' && <mesh geometry={g.wing} material={kind === 'hen' ? HEN.crown : CHICK.back} position={[-hr * 0.2, -hr * 0.02, -sz * hr * 0.06]} rotation={[0, 0, -0.08]} scale={[hr * 0.55, hr * 0.07, hr * 0.12]} />}
                <mesh geometry={g.eye} material={BLACK} />
                <mesh geometry={g.shine} material={EYE_SHINE} position={[hr * 0.06, hr * 0.06, sz * hr * 0.08]} />
              </group>
            ))}
            {/* its bill, and its lower half (opens to quack) */}
            <group position={[hr * 0.95, -hr * 0.12, 0]} rotation={[0, 0, -0.12]}>
              <mesh geometry={g.bill} material={m.bill} castShadow />
              {kind === 'hen' && <mesh geometry={g.bill} material={HEN.saddle} position={[S.bill * 0.22, 0.6, 0]} scale={[0.45, 1.02, 0.6]} />}
              <group ref={(o) => void (rig.current.jaw = o)} userData={{ live: true }}>
                <mesh geometry={g.jaw} material={m.bill} />
              </group>
            </group>
            </Static>
          </group>
        </group>
      </group>
      {children}
    </group>
  )
}
export const DUCK_SIZE = SIZE
