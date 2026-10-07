import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { BoxGeometry, BufferAttribute, Color, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, type InstancedMesh, type Mesh } from 'three'
import { stepSpring, type Spring } from '../../lib/spring'
import { ROOM } from './spec'
import { LIGHT } from './spec'
import { CuboidCollider, RigidBody } from '@react-three/rapier'

/**
 * The one window, in the north wall behind the bed head: white vinyl frame in the wall recess
 * (two sashes, a mullion between), dusk sky outside, a white sill board, and a pair of
 * white 2 in faux-wood blinds.
 *
 *   click the blinds   the slats tilt open / closed (spring); the light through them follows
 *
 * Evening: a dim, cool dusk light comes in through the opening, so the slats throw soft blue
 * stripes on the bed and floor; the warmth in the room is the lamp and string lights.
 * Room frame (see ./spec.ts), millimetres.
 */
const W = ROOM.window
const BL = ROOM.blinds
const Z0 = -ROOM.d / 2 // the north wall's interior face
const XC = (W.x0 + W.x1) / 2
const shadow = { castShadow: true, receiveShadow: true }

/**
 * Bevels: every trim piece has rounded edges, big enough to catch a thin line of light from
 * across the room, never more than ~40% of the piece's smallest side.
 *   frame  the vinyl frame, mullion and sash profiles
 *   stool  the 22 mm sill board
 *   thin   the 12 mm apron and valance
 *   rail   the blinds' head rail
 * The slats and ladder tapes stay as they are.
 */
const R = { frame: 5, stool: 6, thin: 4.5, rail: 6 }

export function Window() {
  const trim = useMemo(() => new MeshStandardMaterial({ color: ROOM.trim, roughness: 0.45 }), [])
  const slatMat = useMemo(() => new MeshStandardMaterial({ color: ROOM.trim, roughness: 0.5 }), [])
  const cord = useMemo(() => new MeshStandardMaterial({ color: '#efece6', roughness: 0.8 }), [])
  const open = useRef(true)
  const tilt = useRef<Spring>({ x: BL.tiltOpen, v: 0 })

  const panels = useMemo(
    () => [
      { x0: W.x0 + 4, x1: W.x0 + W.split - 4 },
      { x0: W.x0 + W.split + 4, x1: W.x1 - 4 },
    ],
    [],
  )

  const toggle = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    open.current = !open.current
  }
  const pointer = {
    onClick: toggle,
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => (document.body.style.cursor = 'auto'),
  }

  const ow = W.x1 - W.x0
  return (
    <group>
      <Frame trim={trim} />
      <Sky />
      {/* sill board (stool) and the apron under it */}
      <RoundedBox
        args={[ow + 2 * W.stool.ears, W.stool.t, W.glass - 20 + W.stool.over]}
        radius={R.stool}
        smoothness={3}
        position={[XC, W.sill - W.stool.t / 2, Z0 + W.stool.over - (W.glass - 20 + W.stool.over) / 2]}
        material={trim}
        {...shadow}
      />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[(ow + 2 * W.stool.ears) / 2, W.stool.t / 2, (W.glass - 20 + W.stool.over) / 2]}
          position={[XC, W.sill - W.stool.t / 2, Z0 + W.stool.over - (W.glass - 20 + W.stool.over) / 2]}
        />
      </RigidBody>
      <RoundedBox args={[ow + 2 * W.stool.ears - 30, 60, 12]} radius={R.thin} position={[XC, W.sill - W.stool.t - 30, Z0 + 6]} material={trim} {...shadow} />
      {/* valance across the top of the whole window */}
      <RoundedBox args={[ow - 4, BL.valance.h, BL.valance.t]} radius={R.thin} position={[XC, W.head - BL.valance.h / 2, Z0 - BL.valance.t / 2 - 2]} material={trim} {...shadow} {...pointer} />
      <group {...pointer}>
        {panels.map((p, i) => (
          <Blind key={i} x0={p.x0} x1={p.x1} tilt={tilt} slatMat={slatMat} trim={trim} cord={cord} />
        ))}
      </group>
      <TiltDriver tilt={tilt} open={open} />
    </group>
  )
}

/** Springs the slat tilt toward open / closed. */
function TiltDriver({ tilt, open }: { tilt: { current: Spring }; open: { current: boolean } }) {
  useFrame((_, dt) => {
    stepSpring(tilt.current, open.current ? BL.tiltOpen : BL.tiltClosed, dt, 60, 13)
  })
  return null
}

/** White vinyl frame at the glass plane: four sides and the mullion between the sashes, all rounded. */
function Frame({ trim }: { trim: MeshStandardMaterial }) {
  const f = W.frame
  const z = Z0 - W.glass
  const depth = 60
  const ow = W.x1 - W.x0
  const oh = W.head - W.sill
  const xm = W.x0 + W.split
  return (
    <group>
      <RoundedBox args={[f, oh, depth]} radius={R.frame} position={[W.x0 + f / 2, (W.sill + W.head) / 2, z]} material={trim} {...shadow} />
      <RoundedBox args={[f, oh, depth]} radius={R.frame} position={[W.x1 - f / 2, (W.sill + W.head) / 2, z]} material={trim} {...shadow} />
      <RoundedBox args={[ow, f, depth]} radius={R.frame} position={[XC, W.head - f / 2, z]} material={trim} {...shadow} />
      <RoundedBox args={[ow, f, depth]} radius={R.frame} position={[XC, W.sill + f / 2, z]} material={trim} {...shadow} />
      <RoundedBox args={[W.mullion, oh, depth]} radius={R.frame} position={[xm, (W.sill + W.head) / 2, z]} material={trim} {...shadow} />
      {/* the sashes' own inner frames: a slimmer profile inside each opening */}
      {[
        [W.x0 + f, xm - W.mullion / 2],
        [xm + W.mullion / 2, W.x1 - f],
      ].map(([a, b], i) => (
        <group key={i}>
          {[
            [(a + b) / 2, W.head - f - 14, b - a, 28],
            [(a + b) / 2, W.sill + f + 14, b - a, 28],
          ].map(([x, y, w, h], k) => (
            <RoundedBox key={k} args={[w, h, 30]} radius={R.frame} position={[x, y, z + 8]} material={trim} castShadow />
          ))}
        </group>
      ))}
    </group>
  )
}

/** The night behind the glass: deep blue above, a warm city glow low down; dim (./spec LIGHT.sky). */
function Sky() {
  const { geo, mat } = useMemo(() => {
    // exactly the opening (plus a hair), right at the outside face of the wall: every view through
    // the window lands on it, and from outside the room it never pokes out past the wall
    const g = new PlaneGeometry(W.x1 - W.x0 + 20, W.head - W.sill + 20, 1, 12)
    const pos = g.getAttribute('position')
    const col = new Float32Array(pos.count * 3)
    const S = LIGHT.sky
    const top = new Color(S.top).multiplyScalar(S.k)
    const mid = new Color(S.mid).multiplyScalar(S.k)
    const low = new Color(S.low).multiplyScalar(S.k)
    const c = new Color()
    const H = W.head - W.sill + 20
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + H / 2) / H // 0 bottom, 1 top
      if (t < 0.45) c.lerpColors(low, mid, t / 0.45)
      else c.lerpColors(mid, top, (t - 0.45) / 0.55)
      c.toArray(col, i * 3)
    }
    g.setAttribute('color', new BufferAttribute(col, 3))
    return { geo: g, mat: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }) }
  }, [])
  return <mesh geometry={geo} material={mat} position={[XC, (W.sill + W.head) / 2, Z0 - ROOM.wall - 2]} />
}

/** One blind: head rail, instanced crowned slats, bottom rail, ladder tapes, cord pulls, tilt wand. */
function Blind({
  x0,
  x1,
  tilt,
  slatMat,
  trim,
  cord,
}: {
  x0: number
  x1: number
  tilt: { current: Spring }
  slatMat: MeshStandardMaterial
  trim: MeshStandardMaterial
  cord: MeshStandardMaterial
}) {
  const w = x1 - x0
  const xc = (x0 + x1) / 2
  const z = Z0 - BL.inset
  const top = W.head - BL.valance.h + 30 // slats start under the head rail, hidden by the valance
  const bottomY = W.sill + 12 + BL.bottom / 2
  const count = Math.floor((top - BL.rail.h - (bottomY + BL.bottom)) / BL.pitch)
  const slat = useMemo(() => {
    const g = new BoxGeometry(w - 8, BL.thick, BL.slat, 1, 1, 8)
    const p = g.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      const s = p.getZ(i) / (BL.slat / 2)
      p.setY(i, p.getY(i) + BL.crown * (1 - s * s)) // crowned: a gentle arch across the slat
    }
    g.computeVertexNormals()
    return g
  }, [w])
  const slats = useRef<InstancedMesh>(null)
  const tapes = useRef<Mesh[]>([])
  const last = useRef(NaN)
  const dummy = useMemo(() => new Object3D(), [])
  const tapeXs = [-(w / 2 - 110), w / 2 - 110]
  const tapeH = top - BL.rail.h - bottomY

  const place = (a: number) => {
    const m = slats.current
    if (!m) return
    for (let i = 0; i < count; i++) {
      dummy.position.set(xc, top - BL.rail.h - (i + 0.8) * BL.pitch, z)
      dummy.rotation.set(a, 0, 0)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    // ladder tapes run down the slats' front and back edges
    const half = (BL.slat / 2) * Math.cos(a)
    tapes.current.forEach((t, k) => {
      if (t) t.position.z = z + (k % 2 === 0 ? half : -half)
    })
  }
  useLayoutEffect(() => place(tilt.current.x))
  useFrame(() => {
    const a = tilt.current.x
    if (Math.abs(a - last.current) < 1e-4) return
    last.current = a
    place(a)
  })

  const wandX = x1 - 45
  return (
    <group>
      <RoundedBox args={[w - 4, BL.rail.h, BL.rail.d]} radius={R.rail} position={[xc, top - BL.rail.h / 2, z]} material={trim} castShadow />
      <instancedMesh ref={slats} args={[slat, slatMat, count]} castShadow receiveShadow />
      <RoundedBox args={[w - 8, BL.bottom, BL.slat - 4]} radius={5} position={[xc, bottomY, z]} material={slatMat} castShadow receiveShadow />
      {tapeXs.flatMap((tx, i) =>
        [0, 1].map((side) => (
          <mesh
            key={`${i}${side}`}
            ref={(m) => {
              if (m) tapes.current[i * 2 + side] = m
            }}
            position={[xc + tx, bottomY + tapeH / 2, z]}
            material={cord}
          >
            <boxGeometry args={[BL.tape, tapeH, 0.8]} />
          </mesh>
        )),
      )}
      {/* lift cords with little pulls, at the left end */}
      {[0, 1].map((k) => (
        <group key={k} position={[x0 + 40 + k * 14, 0, z + BL.slat / 2 + 6]}>
          <mesh position={[0, (top - BL.rail.h / 2 + 1480) / 2, 0]} material={cord}>
            <cylinderGeometry args={[1, 1, top - BL.rail.h / 2 - 1480, 5]} />
          </mesh>
          <mesh position={[0, 1470 - k * 30, 0]} material={trim}>
            <cylinderGeometry args={[4, 7, 26, 12]} />
          </mesh>
        </group>
      ))}
      {/* tilt wand: a clear-ish white rod hanging from the head rail */}
      <group position={[wandX, top - BL.rail.h, z + BL.slat / 2 + 8]}>
        <mesh position={[0, -8, 0]} material={trim}>
          <torusGeometry args={[6, 1.5, 6, 12]} />
        </mesh>
        <mesh position={[0, -16 - BL.wand.len / 2, 0]} material={trim}>
          <cylinderGeometry args={[BL.wand.r, BL.wand.r, BL.wand.len, 10]} />
        </mesh>
      </group>
    </group>
  )
}

