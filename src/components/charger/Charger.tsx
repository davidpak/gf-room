import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Color, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, MeshStandardMaterial, Path, Shape, ShapeGeometry } from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { stepSpring, type Spring } from '../../lib/spring'
import { CHARGER, portLayout, prongLayout } from './spec'

/**
 * The Apple 70W USB-C adapter (spec.ts), in the toy look: matte soft white, lilac-silver metal,
 * plum darks. Charger frame: standing, logo face toward +Z, prong edge -X, port edge +X, origin at
 * the body's centre.
 *
 * The seams (the duck head's L, the parting line round the edges) and the slot mouths are painted
 * into the body's shader from its own coordinates, so they wrap every rounded edge exactly.
 * `folded` folds the blades up into their slots (click them to toggle).
 */
const B = CHARGER.body
const PR = CHARGER.prong
const PL = prongLayout()
const PORT = portLayout()

export const TOY_CHARGER = {
  white: '#f4f2ee',
  logo: '#e8e5ec',
  metal: '#d9d3e4',
  slot: '#2b2438',
  ring: '#d3cedb',
  hole: '#221c30',
  tongue: '#6c6482',
}

/** A stadium (rounded slot) w x h, long way along X, centred. */
function stadium(w: number, h: number, path: Shape | Path = new Shape()) {
  const r = h / 2
  path.moveTo(-w / 2 + r, -r)
  path.lineTo(w / 2 - r, -r)
  path.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false)
  path.lineTo(-w / 2 + r, r)
  path.absarc(-w / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false)
  return path
}

/**
 * The body: the face outline (r 8.5 corners, the duck-head corner as square as the soft edges
 * allow) extruded with rounded face edges (r 4.5).
 */
function bodyGeometry() {
  const e = B.edge
  const hw = B.w / 2 - e
  const hh = B.h / 2 - e
  const r = B.corner - e
  const rd = 0.3 // the duck head's corner: the bevel rounds it out to ~e
  const s = new Shape()
  s.moveTo(-hw + r, -hh)
  s.lineTo(hw - r, -hh)
  s.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hw, hh - r)
  s.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hw + rd, hh)
  s.absarc(-hw + rd, hh - rd, rd, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hh + r)
  s.absarc(-hw + r, -hh + r, r, Math.PI, (3 * Math.PI) / 2, false)
  const g = new ExtrudeGeometry(s, { depth: B.t - 2 * e, bevelEnabled: true, bevelThickness: e, bevelSize: e, bevelSegments: 8, curveSegments: 20 })
  g.translate(0, 0, -(B.t - 2 * e) / 2)
  return toCreasedNormals(g, 0.5)
}

// the Apple logo (simple-icons "apple"): a 24-unit box, y down
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>'

/** The logo, its bounding box exactly the spec's 13.9 x 17.4, centred on the origin. */
function logoGeometry() {
  const data = new SVGLoader().parse(LOGO_SVG)
  const g = new ShapeGeometry(
    data.paths.flatMap((p) => SVGLoader.createShapes(p)),
    16,
  )
  g.computeBoundingBox()
  const bb = g.boundingBox!
  g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, 0)
  g.scale(CHARGER.logo.w / (bb.max.x - bb.min.x), -CHARGER.logo.h / (bb.max.y - bb.min.y), 1)
  return g
}

/** One blade, relative to its hinge, standing out along -X: rounded tip corners, the 3 mm hole, soft edges. */
function bladeGeometry() {
  const k = 0.25 // edge softening (the bevel adds it back)
  const x0 = PL.tipX + k
  const y0 = PL.y0 + k
  const y1 = PL.y1 - k
  const r = 1
  const s = new Shape()
  s.moveTo(0, y0)
  s.lineTo(x0 + r, y0)
  s.absarc(x0 + r, y0 + r, r, -Math.PI / 2, -Math.PI, true)
  s.lineTo(x0, y1 - r)
  s.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true)
  s.lineTo(0, y1)
  s.lineTo(0, y0)
  const hole = new Path()
  hole.absarc(PL.tipX + PR.hole.fromTip, (PL.y0 + PL.y1) / 2, PR.hole.d / 2, 0, Math.PI * 2, false)
  s.holes.push(hole)
  const g = new ExtrudeGeometry(s, { depth: PR.t - 2 * k, bevelEnabled: true, bevelThickness: k, bevelSize: k, bevelSegments: 2, curveSegments: 16 })
  g.translate(0, 0, -(PR.t - 2 * k) / 2)
  return g
}

const vec = (hex: string) => {
  const c = new Color(hex)
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
}

/** The body's material: soft white, the seams and slot mouths painted from object coordinates. */
function bodyMaterial(uFold: { value: number }) {
  const m = new MeshStandardMaterial({ color: TOY_CHARGER.white, roughness: 1 })
  const n = (v: number) => v.toFixed(3)
  const dx = PL.edge + CHARGER.duck.in
  const dy = B.h / 2 - CHARGER.duck.down
  const sw = PR.slot.w / 2
  const bt = PR.t / 2
  m.customProgramCacheKey = () => 'charger-body'
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFold = uFold
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCp = position;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCp;\nuniform float uFold;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  vec3 p = vCp;
  float px = length(fwidth(p)) * 0.7;
  float hw = ${n(CHARGER.seam / 2)};
  // the duck head's L (both faces, over the top and the prong edge), the parting line round the edges
  float duck = step(p.x, ${n(dx)}) * step(${n(dy)}, p.y);
  float seam = (1.0 - smoothstep(hw, hw + px, abs(p.x - ${n(dx)}))) * step(${n(dy - CHARGER.seam)}, p.y);
  seam = max(seam, (1.0 - smoothstep(hw, hw + px, abs(p.y - ${n(dy)}))) * step(p.x, ${n(dx + CHARGER.seam)}));
  seam = max(seam, (1.0 - smoothstep(hw, hw + px, abs(p.z))) * (1.0 - duck));
  vec3 c = diffuseColor.rgb * (1.0 - 0.28 * seam);
  // the two slots in the prong edge (they run out over the top); folded, the blades' edges show in them
  float sz = abs(abs(p.z) - ${n(PR.apart / 2)});
  float region = step(p.x, ${n(PL.edge + PR.slot.deep)}) * step(${n(PL.hinge.y - PR.knuckle.r - 0.4)}, p.y);
  float slot = (1.0 - smoothstep(${n(sw)}, ${n(sw)} + px, sz)) * region;
  float blade = (1.0 - smoothstep(${n(bt)}, ${n(bt)} + px, sz)) * region * step(${n(PL.hinge.y)}, p.y) * step(0.98, uFold);
  c = mix(c, ${vec(TOY_CHARGER.slot)}, slot);
  c = mix(c, ${vec(TOY_CHARGER.metal)}, blade);
  diffuseColor.rgb = c;
}`,
    )
  }
  return m
}

const GEO = {
  body: bodyGeometry(),
  logo: logoGeometry(),
  blade: bladeGeometry(),
  knuckle: new CylinderGeometry(PR.knuckle.r, PR.knuckle.r, PR.knuckle.t, 40).rotateX(Math.PI / 2),
  ring: (() => {
    const s = stadium(CHARGER.port.ring[0], CHARGER.port.ring[1]) as Shape
    s.holes.push(stadium(CHARGER.port.w, CHARGER.port.h, new Path()) as Path)
    return new ShapeGeometry(s, 16)
  })(),
  opening: new ShapeGeometry(stadium(CHARGER.port.w, CHARGER.port.h) as Shape, 16),
  tongue: new ShapeGeometry(stadium(CHARGER.port.tongue[0], CHARGER.port.tongue[1]) as Shape, 8),
}

const decal = (color: string, bias = -2) =>
  new MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: bias, polygonOffsetUnits: bias })

const MAT = {
  plastic: new MeshStandardMaterial({ color: TOY_CHARGER.white, roughness: 1 }),
  logo: Object.assign(decal(TOY_CHARGER.logo), { side: DoubleSide }),
  metal: new MeshStandardMaterial({ color: TOY_CHARGER.metal, roughness: 1 }),
  ring: decal(TOY_CHARGER.ring),
  hole: decal(TOY_CHARGER.hole),
  tongue: decal(TOY_CHARGER.tongue, -4),
}

export function Charger({ folded, onToggleFold }: { folded: boolean; onToggleFold?: () => void }) {
  const uFold = useMemo(() => ({ value: folded ? 1 : 0 }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const body = useMemo(() => bodyMaterial(uFold), [uFold])
  const hinge = useRef<Group>(null!)
  const fold = useRef<Spring>({ x: folded ? 1 : 0, v: 0 })
  useFrame((_, dt) => {
    const x = Math.min(1, Math.max(0, stepSpring(fold.current, folded ? 1 : 0, dt, 110, 15)))
    hinge.current.rotation.z = (-Math.PI / 2) * x
    uFold.value = x
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onToggleFold?.()
  }
  return (
    <group>
      <mesh geometry={GEO.body} material={body} castShadow receiveShadow />
      {/* the Apple logo on the front face */}
      <mesh geometry={GEO.logo} material={MAT.logo} position={[0, CHARGER.logo.up, B.t / 2 + 0.02]} />
      {/* the USB-C port in the right edge, the long way across the thickness */}
      <group position={[PORT.at.x, PORT.at.y, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={GEO.ring} material={MAT.ring} position={[0, 0, 0.03]} />
        <mesh geometry={GEO.opening} material={MAT.hole} position={[0, 0, 0.02]} />
        <mesh geometry={GEO.tongue} material={MAT.tongue} position={[0, 0, 0.04]} />
      </group>
      {/* the blades on their knuckles, turning about the hinge */}
      <group ref={hinge} position={PL.hinge} onClick={click}>
        {PL.zs.map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh geometry={GEO.blade} material={MAT.metal} castShadow />
            <mesh geometry={GEO.knuckle} material={MAT.plastic} castShadow />
          </group>
        ))}
      </group>
    </group>
  )
}

/**
 * Apple's USB-C plug (the woven cable's). Plug frame: origin on the port's face, +X out toward the
 * cable: the steel shell (-6.35 to 0.3, in the port), then one slim sleeve (0.3 to 23.3), where the
 * cable starts.
 */
const PG = CHARGER.plug
export const PLUG_LENGTH = 0.3 + PG.mold[2]
const PLUG_GEO = {
  shell: (() => {
    const s = stadium(PG.shell[0], PG.shell[1]) as Shape
    s.holes.push(stadium(PG.shell[0] - 1, PG.shell[1] - 1, new Path()) as Path)
    return new ExtrudeGeometry(s, { depth: PG.shell[2], bevelEnabled: false, curveSegments: 12 }).rotateY(-Math.PI / 2).translate(0.3, 0, 0)
  })(),
  insulator: new ShapeGeometry(stadium(PG.shell[0] - 1, PG.shell[1] - 1) as Shape, 12).rotateY(-Math.PI / 2).translate(0.3 - PG.shell[2] + 1.2, 0, 0),
}

export function UsbCPlug({ onClick }: { onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  return (
    <group onClick={onClick}>
      <mesh geometry={PLUG_GEO.shell} material={MAT.metal} castShadow />
      <mesh geometry={PLUG_GEO.insulator} material={MAT.hole} />
      <RoundedBox args={[PG.mold[2], PG.mold[1], PG.mold[0]]} radius={PG.corner} smoothness={5} position={[0.3 + PG.mold[2] / 2, 0, 0]} material={MAT.plastic} castShadow receiveShadow />
    </group>
  )
}

/** The woven cable's material: soft white with a faint diagonal weave along its length (uv.x). */
export function wovenMaterial(uLen: { value: number }) {
  const m = new MeshStandardMaterial({ color: '#f1efea', roughness: 1 })
  m.customProgramCacheKey = () => 'woven-cable'
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLen = uLen
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWeave;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWeave = uv;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWeave;\nuniform float uLen;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  float a = vWeave.x * uLen / 1.8;
  float b = vWeave.y * 6.0;
  float w = sin(6.2832 * (a + b)) * sin(6.2832 * (a - b));
  diffuseColor.rgb *= 1.0 - 0.07 * smoothstep(-0.2, 1.0, w);
}`,
    )
  }
  return m
}
