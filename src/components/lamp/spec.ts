import { Vector3 } from 'three'

const deg = (d: number) => (d * Math.PI) / 180

/**
 * Rina's desk lamp, millimetres. References (public/reference/):
 *   lamp-arm.webp       close crop: the arm's hook, the cap on the shade, the shade's proportions
 *   lamp-desk.webp      the lamp beside the laptop (scale), the base on the desk
 *   room-desk-wall.jpg  the pole, the spike finial, the base and the power adapter
 *   lamp-outlet.png     what one outlet looks like (a US NEMA 5-15 receptacle face)
 *
 * Every detail in the photos:
 *   base      round polished nickel, stepped: three ridges rising toward a flat top tier; a small
 *             collar where the pole stands
 *   outlets   three, set flat into the top tier facing up (left, right, behind): each ONE black
 *             receptacle face, two vertical slots (the neutral one taller) and the round-topped
 *             ground hole below, like a little face
 *   switch    a small black rocker at the front, flat in the top, lying east-west: I and O
 *   pole      straight, a ring low down, carrying on up past the arm to an urn finial and a spike
 *             (her bucket hat hangs on the spike)
 *   arm       a second, thinner tube: it leaves the pole at a collar about level with the shade's
 *             bottom, bends out (the bottom of the S), rises right beside the pole ("two poles"),
 *             hooks over in a tight curve (the top of the S) and comes down into the cap
 *   cap       a domed silver socket cap on top of the shade
 *   shade     yellow fabric empire cone, tall for its width, thin rolled rims top and bottom, a
 *             white lining, tipped about 18 degrees away from the pole so its rim clears it
 *   charger   Rina's Apple 70W stands upright in the back outlet, prong edge down, the cable out of
 *             its top (both photos): it is its own item now (../charger/spec.ts), plugged in there
 *
 * Proportions from lamp-arm.webp: the shade's top is ~0.42 of its bottom width, its height ~0.76;
 * the hook is ~65 wide. From room-desk-wall.jpg (the pole ⌀18 is 55 px there): the arm's rising leg
 * stands ~55 out from the pole, centre to centre, sweeping out of the collar in a long, easy S over
 * ~75 of rise; so the shade hangs ~115 in front of the pole, for the hook to keep its width. Heights from
 * lamp-desk.webp against the 13" MacBook (screen top ~210 above the desk): shade bottom ~310,
 * spike top ~600.
 *
 * Local frame: origin on the desk at the centre of the base, +Z the way the shade leans.
 */
export const LAMP = {
  base: {
    r: 110, // footprint radius (22 cm across)
    top: 27, // height of the flat top tier
    topR: 83, // the flat tier runs out to here, then the ridges step down
    ring: 54, // radius the outlets and the switch sit on
    collar: { r: 22, h: 20 }, // where the pole stands
  },
  pole: { r: 9, ring: 110, top: 540 }, // ring: height of the low ring; top: where the finial starts
  finial: { h: 58 }, // urn + spike
  arm: {
    r: 6, // thinner than the pole
    collarY: 330, // where it leaves the pole: about level with the shade's bottom
    offset: 52, // its rising leg, centre to centre from the pole (a hand's width apart, as in the photos)
    peakY: 562, // top of the hook
  },
  shade: { rTop: 44, rBottom: 106, h: 162, topY: 470, reach: 115, tilt: deg(18), rimTop: 2, rimBottom: 2.8 },
  cap: { r: 24, h: 22 },
  bulbDepth: 72, // bulb centre, below the shade's top along its axis
  outlet: {
    w: 34, // one receptacle face (flat sides, arched top and bottom)
    h: 36,
    slot: { w: 1.8, hot: 7.1, neutral: 8.7, apart: 12.7 }, // NEMA 5-15R: a little longer than the blades (6.35 hot, 7.9 neutral)
    ground: { d: 4.8, below: 11.9 }, // below the slots' centre line
    angles: [-Math.PI / 2, Math.PI / 2, Math.PI], // left, right, behind (in the lamp's frame)
  },
  rocker: { w: 21, d: 15, rocker: [15, 10] as [number, number] }, // w runs east-west
}

/** The shade's axis (unit, pointing down and forward) and its key points. */
export function shadeFrame() {
  const S = LAMP.shade
  const axis = new Vector3(0, -Math.cos(S.tilt), Math.sin(S.tilt))
  const toPole = new Vector3(0, -Math.sin(S.tilt), -Math.cos(S.tilt)) // in the rim plane, toward the pole
  const top = new Vector3(0, S.topY, S.reach) // centre of the shade's top ring
  const bottom = top.clone().addScaledVector(axis, S.h)
  const capTop = top.clone().addScaledVector(axis, -LAMP.cap.h) // where the arm ends
  return { axis, toPole, top, bottom, capTop }
}

/** The arm's centre line: the S from the collar up beside the pole, the hook, down into the cap. */
export function armPoints() {
  const A = LAMP.arm
  const { axis, capTop } = shadeFrame()
  const pr = LAMP.pole.r
  const lead = capTop.clone().addScaledVector(axis, -24) // straight run into the cap, along the shade's axis
  return [
    new Vector3(0, A.collarY, pr), // out of the collar
    new Vector3(0, A.collarY + 18, pr + 7),
    new Vector3(0, A.collarY + 50, A.offset - 8), // the bottom of the S: a long, easy sweep out
    new Vector3(0, A.collarY + 80, A.offset),
    new Vector3(0, A.peakY - 58, A.offset), // up beside the pole
    new Vector3(0, A.peakY - 20, A.offset + 6),
    new Vector3(0, A.peakY, (A.offset + lead.z) / 2), // over the top of the hook
    new Vector3(0, A.peakY - 16, lead.z - 6),
    lead,
    capTop,
  ]
}

/** The spec's own check: geometry that must hold before anything is built. */
export function checkSpec() {
  const L = LAMP
  const { toPole, top, bottom } = shadeFrame()
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })

  // the shade's rim nearest the pole must clear it
  const nearBottom = bottom.clone().addScaledVector(toPole, L.shade.rBottom)
  const nearTop = top.clone().addScaledVector(toPole, L.shade.rTop)
  add('shade rim clears the pole', nearBottom.z - L.pole.r > 10, `${(nearBottom.z - L.pole.r).toFixed(0)} mm gap`)
  // the arm's rising leg must clear the shade's near side
  const sideAt = (y: number) => nearTop.z + ((nearBottom.z - nearTop.z) * (nearTop.y - y)) / (nearTop.y - nearBottom.y)
  const worst = Math.min(...[L.arm.collarY + 42, (L.arm.collarY + L.arm.peakY) / 2, nearTop.y].map((y) => sideAt(y) - (L.arm.offset + L.arm.r)))
  add('arm clears the shade', worst > 8, `${worst.toFixed(0)} mm gap`)
  add('hook is above the shade', L.arm.peakY > top.y + L.cap.h + 40, `${(L.arm.peakY - top.y).toFixed(0)} mm above its top`)
  add('spike tops the hook', L.pole.top + L.finial.h > L.arm.peakY + 20, `${(L.pole.top + L.finial.h - L.arm.peakY).toFixed(0)} mm higher`)
  add('shade bottom height', Math.abs(bottom.y - 310) < 25, `${bottom.y.toFixed(0)} mm (photo ~310)`)
  // outlets and switch fit on the top tier and don't touch each other or the collar
  const o = L.outlet
  const reach = Math.hypot(L.base.ring + o.h / 2, o.w / 2)
  add('outlets fit on the top tier', reach < L.base.topR - 3, `${reach.toFixed(0)} of ${L.base.topR}`)
  add('outlets clear the pole collar', L.base.ring - o.h / 2 > L.base.collar.r + 3, `${(L.base.ring - o.h / 2 - L.base.collar.r).toFixed(0)} mm`)
  const neighbour = 2 * L.base.ring * Math.sin(Math.PI / 4) - Math.hypot(o.w, o.h) // between the side and back outlets
  add('outlets clear each other', neighbour > 3, `${neighbour.toFixed(0)} mm`)
  return results
}
