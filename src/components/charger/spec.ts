import { CatmullRomCurve3, Matrix4, Vector3 } from 'three'
import { LAMP } from '../lamp/spec'

/**
 * Apple 70W USB-C Power Adapter (A2743) with Apple's woven USB-C to USB-C cable (3 ft): the charger
 * on Rina's lamp base, built on its own first.
 *
 * Sources (public/reference):
 *   adapter-70w-GEO.jpg        Apple, the logo face straight on, prongs folded. Measured by pixel
 *                              (face 429 px = 64.92 mm, 6.61 px/mm)
 *   adapter-70w-prongs.png     Apple (AV1), prongs out, from the front left. Measured by pixel
 *   adapter-70w-port.png       Apple (AV2), the port edge
 *   cl70-*.jpg                 ChargerLAB's review: calipers (64.92, 28.66), the port, the prong edge
 *
 * Detail list (frame: standing like Apple's photo, logo face toward +Z, X right, Y up, origin at the
 * centre of the body; the prong edge is -X, the port edge +X)
 *   body       64.92 x 64.92 x 28.66 (calipers). A flat slab: a rounded square seen face on (r 8.5,
 *              measured), the face edges softly rounded (r 4.5, caliper side views). White
 *   duck head  the removable plug corner, top left: 18.2 in from the prong edge, 28.4 down from the
 *              top, through the full thickness (GEO seams by pixel). Its corner is squarer than the
 *              others. Its seams draw an L on both faces and cross the top and the prong edge
 *   parting    a fine seam at mid thickness round the edges, stopping at the duck head (calipers)
 *   logo       the Apple logo, centred across the face, 13.9 wide x 17.4 tall, its box 1.6 above the
 *              centre (GEO by pixel), a touch greyer than the white. The back face is plain
 *   prongs     US 2 pin, unpolarised (NEMA 1-15P): blades 6.35 wide x 1.5 thick, 15.9 out, 12.7 apart
 *              across the thickness, a 3 mm hole 4.5 from the tip. They stand straight out of the
 *              prong edge, parallel to the faces, centred 19.9 below the top (AV1). Each turns on a
 *              round white knuckle (r 5.8) whose hinge is 4.6 in and 19.3 down, so it stands 1.2
 *              proud of the edge (GEO: 13 to 25.7 down). They fold up into two slots in the edge, tips
 *              toward the top, and folded, the tips peek 1.2 over the top (GEO)
 *   port       USB-C in the port edge, 21.4 below the top (a third), centred in the thickness, long
 *              way across it: an 8.34 x 2.56 opening in a light grey ring (10.6 x 4.6), a tongue inside
 *   plug       the cable's USB-C (Apple's woven cable photo): one slim sleeve, 10.8 x 5.6, 23 long,
 *              the cable straight into its end (no separate strain relief)
 *              (21 in all), the steel shell 8.25 x 2.4 x 6.65 goes into the port
 *   cable      woven, white, 4.2 thick, 3 ft (914)
 *   in use     on an upward outlet (the lamp base) it stands on its prong edge, the port on top
 */
export const CHARGER = {
  body: { w: 64.92, h: 64.92, t: 28.66, corner: 8.5, edge: 4.5 },
  duck: { in: 18.2, down: 28.4 },
  seam: 0.45, // seam line width
  logo: { w: 13.9, h: 17.4, up: 1.6 },
  prong: {
    w: 6.35,
    t: 1.5,
    out: 15.9,
    apart: 12.7,
    hole: { d: 3, fromTip: 4.5 },
    down: 19.9, // blade centre below the top, standing out
    hinge: { in: 4.6, down: 19.3 },
    knuckle: { r: 5.8, t: 2 },
    slot: { w: 2.4, deep: 7.6 },
  },
  port: { down: 21.4, w: 8.34, h: 2.56, ring: [10.6, 4.6] as [number, number], tongue: [6.6, 0.7] as [number, number] },
  plug: { mold: [10.8, 5.6, 23] as [number, number, number], corner: 2.2, shell: [8.25, 2.4, 6.65] as [number, number, number] },
  cable: { r: 2.1, length: 914 },
}

const B = CHARGER.body
const PR = CHARGER.prong

/**
 * The blades, relative to their hinge (charger frame, standing out): the blade runs from the hinge
 * out past the prong edge; turning it by -90° about Z (clockwise from the logo face) folds it into
 * its slot, tip up.
 */
export function prongLayout() {
  const edge = -B.w / 2
  const hinge = new Vector3(edge + PR.hinge.in, B.h / 2 - PR.hinge.down, 0)
  const tipX = edge - PR.out - hinge.x // blade tip, from the hinge
  const y0 = B.h / 2 - PR.down - PR.w / 2 - hinge.y // blade's lower side, from the hinge
  const y1 = y0 + PR.w
  // folded: (dx, dy) -> (dy, -dx)
  const folded = { x0: hinge.x + y0, x1: hinge.x + y1, tipY: hinge.y - tipX }
  return { edge, hinge, tipX, y0, y1, folded, zs: [-PR.apart / 2, PR.apart / 2] }
}

/** The port and the plug's axis (charger frame). */
export function portLayout() {
  const at = new Vector3(B.w / 2, B.h / 2 - CHARGER.port.down, 0)
  const dir = new Vector3(1, 0, 0)
  const moldEnd = at.clone().addScaledVector(dir, 0.3 + CHARGER.plug.mold[2])
  return { at, dir, moldEnd }
}

/**
 * The outlet stand on the charger page: a stand-in for the lamp base, one US receptacle face up in
 * the middle (built as the lamp's, turned so its slots run along X, the ground hole toward +X).
 * `slotLine`: where the slots' centre line sits (x) from the stand's centre.
 */
export const STAND = { r: 60, top: LAMP.base.top, face: 2.5, at: [-150, -40] as [number, number], slotLine: -4 }

/**
 * An outlet's frame: origin the middle of its two slots, on the face; the slots run along X, the
 * ground hole toward +X, up is +Y. The stand's outlet is one (charger page frame); the lamp has three
 * (lamp frame, in LAMP.outlet.angles order: left, right, back), each drawn as the lamp draws it: the
 * face 2.5 proud of the top tier, the slots' centre line 4 in from the outlet's centre, the ground
 * hole toward the rim.
 */
export const standOutlet = () => new Matrix4().makeTranslation(STAND.at[0] + STAND.slotLine, STAND.top + STAND.face, STAND.at[1])
export const lampOutlets = () =>
  LAMP.outlet.angles.map((a) =>
    new Matrix4()
      .makeRotationY(a)
      .multiply(new Matrix4().makeTranslation(0, LAMP.base.top + STAND.face, LAMP.base.ring + STAND.slotLine))
      .multiply(new Matrix4().makeRotationY(-Math.PI / 2)),
  )
export const LAMP_BACK = 2 // the back outlet, where Rina's charger lives
/**
 * The charger seated in an outlet, in the outlet's frame: turned a quarter about Z so it stands on its
 * prong edge with the port up, the blades down the slots. Its body runs out toward the ground hole.
 * (Turned half round about the outlet's Y it fits too: the blades are unpolarised.)
 */
export const SEAT = new Matrix4().makeRotationZ(Math.PI / 2).setPosition(B.h / 2 - PR.down, B.w / 2, 0)

/**
 * Where the charger is: 0 = standing on its bottom edge on the desk (as in Apple's photo), 1 =
 * plugged into the stand's outlet, standing on its prong edge (turned a quarter about Z, so the prong
 * edge is down and the port up). In between it lifts and turns.
 */
export function chargerPose(p: number) {
  const bladeY = B.h / 2 - PR.down // the blades' centre line (charger y)
  const a = new Vector3(0, B.h / 2, 0)
  const b = new Vector3(STAND.at[0] + STAND.slotLine + bladeY, STAND.top + STAND.face + B.w / 2, STAND.at[1])
  const position = a.clone().lerp(b, p).add(new Vector3(0, Math.sin(Math.PI * p) * 50, 0))
  const angle = (p * Math.PI) / 2
  const matrix = new Matrix4().makeRotationZ(angle).setPosition(position)
  const pt = portLayout()
  /** the cable's start (the end of the plug's sleeve), the plug pulled out by `out` */
  const cableStart = (out: number) => pt.moldEnd.clone().addScaledVector(pt.dir, out).applyMatrix4(matrix)
  return { position, angle, matrix, cableStart }
}

/**
 * Which way the cable's layout faces: `ex` / `ez` are where the stand's +X and +Z point, `floor`
 * the height of the desk under it, `edge` how far from the port the base's edge is (the way the cable
 * goes), `loop` the loop on the desk as (x, z) steps (stand frame) from where the head reaches it.
 */
export type CableRoute = { ex: Vector3; ez: Vector3; floor: number; edge: number; loop?: [number, number][] }
const STAND_ROUTE: CableRoute = { ex: new Vector3(1, 0, 0), ez: new Vector3(0, 0, 1), floor: 0, edge: 57.5 }

/**
 * The cable's control points from its start S, for pose p (0 desk, 1 outlet, blended in between):
 * a head that leaves the plug and gets down to the desk, a loose loop on the desk (scaled so the
 * length is 3 ft), then the far plug's approach, lying flat.
 *   desk:   straight out of the side, a soft drop to the desk, the loop round to the front right
 *   outlet: up out of the top, over and down past the charger's short side, across the stand's
 *           top, off its edge onto the desk, the loop round to the front
 */
export function cablePoints(S0: Vector3, p: number, route: CableRoute = STAND_ROUTE) {
  const r = CHARGER.cable.r
  const T = STAND.top
  // laid out in the stand's frame with the port above the origin, then turned and moved to S0
  const S = new Vector3(0, S0.y - route.floor, 0)
  const place = (v: Vector3) =>
    new Vector3(S0.x, route.floor + v.y, S0.z).addScaledVector(route.ex, v.x).addScaledVector(route.ez, v.z)
  const desk = [
    S.clone(),
    S.clone().add(new Vector3(8, -0.8, 0)),
    S.clone().add(new Vector3(16, -7, 1.5)),
    new Vector3(S.x + 22, Math.max(r, S.y - 26), S.z + 5),
    new Vector3(S.x + 27, r + 4, S.z + 11),
    new Vector3(S.x + 33, r, S.z + 19),
    new Vector3(S.x + 42, r, S.z + 30),
    new Vector3(S.x + 54, r, S.z + 42),
    new Vector3(S.x + 68, r, S.z + 52),
  ]
  const outlet = [
    S.clone(),
    S.clone().add(new Vector3(0, 8, 0)),
    S.clone().add(new Vector3(-8, 17, 0)),
    S.clone().add(new Vector3(-22, 12, 1)),
    S.clone().add(new Vector3(-30, -12, 3)),
    new Vector3(S.x - 34, T + r + 5, S.z + 5),
    new Vector3(S.x - 45, T + r, S.z + 10),
    new Vector3(S.x - route.edge - 4.5, T - 4, S.z + 14),
    new Vector3(S.x - route.edge - 14.5, r, S.z + 20),
  ]
  const head = desk.map((d, i) => d.clone().lerp(outlet[i], p))
  const loopDesk: [number, number][] = [[14, 10], [60, 40], [110, 100], [130, 180], [90, 240], [10, 240], [-50, 190]]
  const loopOutlet: [number, number][] = route.loop ?? [[-14, 10], [-50, 50], [-80, 120], [-60, 190], [0, 220], [60, 200], [80, 140]]
  const L = head[head.length - 1]
  const make = (s: number) => {
    const loop = loopDesk.map(([x, z], i) => {
      const [x2, z2] = loopOutlet[i]
      return new Vector3(L.x + (x + (x2 - x) * p) * s, r, L.z + (z + (z2 - z) * p) * s)
    })
    const e = loop[loop.length - 1]
    const d = e.clone().sub(loop[loop.length - 2]).setY(0).normalize()
    return [...head, ...loop, e.clone().addScaledVector(d, 14).setY(r + 0.6), e.clone().addScaledVector(d, 26).setY(CHARGER.plug.mold[1] / 2)].map(place)
  }
  let lo = 0.1
  let hi = 3
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    if (new CatmullRomCurve3(make(mid), false, 'centripetal').getLength() < CHARGER.cable.length) lo = mid
    else hi = mid
  }
  return make((lo + hi) / 2)
}

/** The spec's own check: does it hang together, and does it match what was measured? */
export function checkCharger() {
  const out: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => out.push({ what, ok, value })
  const pl = prongLayout()
  const f = (n: number) => n.toFixed(2)

  add('blades stand 15.9 out', Math.abs(pl.edge - (pl.hinge.x + pl.tipX) - PR.out) < 0.01, `${f(pl.edge - (pl.hinge.x + pl.tipX))} mm past the edge`)
  const blade = B.h / 2 - (pl.hinge.y + (pl.y0 + pl.y1) / 2)
  add('blades centred 19.9 below the top (AV1)', Math.abs(blade - PR.down) < 0.01, `${f(blade)}`)
  const proud = PR.knuckle.r - PR.hinge.in
  add('knuckles 1.2 proud, 13 to 25.7 down (GEO)', Math.abs(proud - 1.2) < 0.15, `${f(proud)} proud, ${f(PR.hinge.down - PR.knuckle.r)} to ${f(PR.hinge.down + PR.knuckle.r)} down`)
  add('the hinge sits in the duck head', PR.hinge.in + PR.knuckle.r < CHARGER.duck.in && PR.hinge.down + PR.knuckle.r < CHARGER.duck.down, `knuckle to ${f(PR.hinge.in + PR.knuckle.r)} in, ${f(PR.hinge.down + PR.knuckle.r)} down`)
  const inFrom = pl.folded.x0 - pl.edge
  add('folded blades sit inside the edge', inFrom > 0.5 && pl.folded.x1 - pl.edge < PR.slot.deep, `${f(inFrom)} to ${f(pl.folded.x1 - pl.edge)} in (slot ${PR.slot.deep})`)
  const peek = pl.folded.tipY - B.h / 2
  add('folded tips peek over the top (GEO 1.5)', Math.abs(peek - 1.2) < 0.4, `${f(peek)} mm`)
  const flat = B.t / 2 - B.edge
  add('slots in the flat of the edge', PR.apart / 2 + PR.slot.w / 2 < flat, `to ${f(PR.apart / 2 + PR.slot.w / 2)} of ±${f(flat)}`)
  const o = LAMP.outlet.slot
  add('blades fit a US outlet', PR.apart === o.apart && PR.w < o.hot && PR.w < o.neutral, `apart ${PR.apart} / ${o.apart}, ${PR.w} into ${o.hot} and ${o.neutral}`)
  const po = CHARGER.port
  add('port on the flat of its edge', po.ring[0] / 2 < flat && B.h / 2 - po.down < B.h / 2 - B.corner, `ring ±${f(po.ring[0] / 2)}, ${f(B.h / 2 - po.down)} above centre`)
  add('port a third of the way down', Math.abs(po.down / B.h - 1 / 3) < 0.02, `${f(po.down / B.h)} of the height`)
  const m = CHARGER.plug.mold
  add('overmold covers the port ring', m[0] > po.ring[0] && m[1] > po.ring[1], `${m[0]} x ${m[1]} over ${po.ring[0]} x ${po.ring[1]}`)
  const lg = CHARGER.logo
  add('logo on the flat of the face', lg.w / 2 < B.w / 2 - B.corner && lg.h / 2 + lg.up < B.h / 2 - B.corner, `${lg.w} x ${lg.h}, ${lg.up} above centre`)
  for (const p of [0, 1]) {
    const c = new CatmullRomCurve3(cablePoints(chargerPose(p).cableStart(0), p), false, 'centripetal')
    add(`cable is 3 ft (${p ? 'in the outlet' : 'on the desk'})`, Math.abs(c.getLength() - CHARGER.cable.length) < 5, `${c.getLength().toFixed(0)} mm`)
  }
  // in the outlet: the blades land in the slots, the port faces up
  const pose = chargerPose(1)
  const mid = new Vector3(pl.edge - PR.out / 2, B.h / 2 - PR.down, 0).applyMatrix4(pose.matrix)
  const off = Math.hypot(mid.x - (STAND.at[0] + STAND.slotLine), mid.z - STAND.at[1])
  add('in the outlet: blades in the slots', off < 0.01 && mid.y < STAND.top + STAND.face, `off by ${off.toFixed(2)}, the blades ${PR.out} deep`)
  const up = new Vector3(1, 0, 0).transformDirection(pose.matrix)
  add('in the outlet: the port faces up', up.y > 0.999, `(${up.toArray().map((v) => v.toFixed(2)).join(', ')})`)
  const same = standOutlet().multiply(SEAT).elements.every((v, i) => Math.abs(v - pose.matrix.elements[i]) < 1e-6)
  add('the seat matches the stand pose', same, same ? 'same matrix' : 'differs')
  // on the lamp's back outlet: its corners stay over the base, clear of the collar, and the blades
  // go down the slots
  const lm = lampOutlets()[LAMP_BACK].multiply(SEAT)
  let rin = Infinity
  let rout = 0
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const c = new Vector3((x * B.w) / 2, (y * B.h) / 2, (z * B.t) / 2).applyMatrix4(lm)
    rout = Math.max(rout, Math.hypot(c.x, c.z))
  }
  for (const y of [-1, 1]) {
    const c = new Vector3(0, (y * B.h) / 2, 0).applyMatrix4(lm) // the middle of each side edge
    rin = Math.min(rin, Math.hypot(c.x, c.z))
  }
  add('on the lamp: over the base, clear of the collar', rout < LAMP.base.r && rin > LAMP.base.collar.r + 2, `corners to r ${f(rout)} (base ${LAMP.base.r}), inner edge r ${f(rin)} (collar ${LAMP.base.collar.r})`)
  const lb = new Vector3(pl.edge - PR.out / 2, B.h / 2 - PR.down, 0).applyMatrix4(lm)
  const slots = new Vector3(0, LAMP.base.ring + STAND.slotLine, 0)
  add('on the lamp: blades in the back slots', Math.abs(lb.x) < 0.01 && Math.abs(-lb.z - slots.y) < 0.01 && lb.y < LAMP.base.top + STAND.face, `at (${f(lb.x)}, ${f(lb.y)}, ${f(lb.z)})`)
  return out
}
