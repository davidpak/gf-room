/**
 * JBL L100 Classic on its JS-120 stand: the record stand's speakers. mm.
 *
 * Sources
 *   [JBL]  JBL's specs (jbl.com, the L100 Classic quick-spec sheet): 636.6 H × 389.7 W × 371.5 D, 26.7 kg; a 3-way
 *          bass-reflex: 12" (300) JW300PW-8 pure-pulp woofer, 5¼" (130) 105H-1 polymer-coated pulp midrange, 1" (25)
 *          JT025Ti1-4 titanium dome; walnut veneer; Quadrex foam grille in black, burnt orange or dark blue
 *   [HTH]  HomeTheaterHifi's review: "a large front port", 5" across; the HF and MF attenuators "in the upper left
 *          corner of the front baffle"; the grille "has a wood frame that snaps onto plastic lugs"
 *   [EC]   eCoustics' review: "black front and rear faces with walnut veneer sides, top and bottom"; the midrange
 *          "sits adjacent to a 5-inch front-firing port"
 *   [JS]   the JS-120 (JBL; Turntable Lab, Upscale Audio): 362 W × 256.1 H × 322 D, the speaker's bottom 179.7 up at
 *          the front, 143.4 at the back (a 7° tilt back); all metal, crackle powder-coat; JBL's own photos
 *          (public/reference/jbl-js120-back.jpg, -side.jpg): a C from the side (the uprights at the back, the base
 *          frame on the floor running forward under the platform), the platform a frame of square tube with felt
 *          strips along its sides, a felt-faced backstop frame standing up off its back, four round feet
 *   [P]    measured off JBL's photo of the three (public/reference/jbl-l100-classic-trio.jpg, the black one straight
 *          on: 389.7 mm = 676 px, 0.577 mm a px): the grille 10 × 17 blocks at a 35.8 pitch (62.1 px across, 62.7
 *          down), its grooves 8 wide (14 px); the walnut's edge round the front 6–7 (10–12 px); the block field's
 *          margins 15.9 at the sides, 13.8 top and bottom; the JBL badge in place of the block in column 2, row 16
 *          (of 17, from the top), its logo 26 × 21 (45 × 37 px); the stand's tube ≈ 19 (rear photo, 0.35 mm a px)
 *   [E]    our estimate where nothing says (marked so): no photo of the baffle bare was to be found, so where the
 *          woofer, midrange, port and tweeter sit behind the grille is laid out from the reviews' words; the
 *          foam's depth; radii
 *
 * Its frame: the cabinet's middle at x 0, z 0, its bottom at y 0, its front (the baffle) toward +z. `side` -1 / 1:
 * left / right of a pair, mirror images (the tweeter toward the middle) [E].
 */
export const L100 = {
  w: 389.7, // [JBL]
  h: 636.6, // [JBL]
  d: 371.5, // [JBL]
  mass: 26.7, // [JBL] kg
  edge: 6.5, // [P] the walnut seen round the front (the sides', top's, bottom's front edges)
  round: 3, // [E] its corners' radius
  // (the black baffle flush with the walnut's front edges; the grille snaps on over it [HTH])
  badge: { w: 40, h: 17, y: 30 }, // [E] the JBL badge on the baffle, under the woofer
  // (no grille: the Quadrex foam it comes with is left off, the drivers on show)
  /** the drivers, the port, the attenuators (y up from the bottom, x from the middle) */
  woofer: { r: 150, cone: 122, dust: 50, x: 0, y: 205 }, // [JBL] 12" (300); where: [E] centred, low
  mid: { r: 68, cone: 52, dust: 18, x: -78, y: 452 }, // [JBL] 5¼" (130 cone); [EC] beside the port; where: [E]
  port: { r: 63.5, x: 78, y: 452, flare: 8 }, // [HTH] 5" front port; [EC] beside the midrange; where: [E]
  tweeter: { r: 45, dome: 13, x: 40, y: 575 }, // [JBL] 1" (25) dome on its plate; where: [E] above, toward the middle
  knobs: { r: 13, h: 9, xs: [-142, -100], y: 585 }, // [HTH] HF and MF, upper left; sizes [E]
  colors: { walnut: '#9c6844', walnutShade: '#8a6f96', baffle: '#2c2830', cone: '#ece4d6', surround: '#3a3540', silver: '#cfd2dc' },
}

/** the JS-120 stand: its frame the same as the speaker's (its middle, its feet's bottoms at y 0, its front +z) */
export const JS120 = {
  w: 362, // [JS]
  h: 256.1, // [JS] (to the backstop's top)
  d: 322, // [JS]
  tube: 19, // [P]
  front: 179.7, // [JS] the speaker's bottom at the front
  back: 143.4, // [JS] … at the back
  tilt: (7 * Math.PI) / 180, // [JS]
  platform: { d: 318 }, // [JS] 12.5" deep
  felt: { w: 16, t: 3 }, // [P][E] the strips along its sides
  backstop: { w: 156, frame: 18 }, // [P] (its top at the overall height)
  feet: { r: 9, h: 8 }, // [P] round, under the base frame's corners
  color: '#3a3540', // [JS] black crackle → the toy's plum-dark
  feltColor: '#4c4652',
}

/** the speaker's bottom-middle on the stand, and its tilt (its back against the backstop, on the platform) */
export function onStand() {
  const S = JS120
  // the platform's top surface: at the front S.front, at the back S.back, its front edge at z = S.d / 2 - (S.d - S.platform.d)
  const zBack = -S.d / 2 + S.tube / 2 + S.backstop.frame / 2 + S.felt.t // (the backstop's felt face)
  // the speaker's back-bottom edge sits at the backstop's face, on the platform
  const yBack = S.back
  // its middle: half its depth forward along the tilt
  const cz = zBack + (L100.d / 2) * Math.cos(S.tilt)
  const cy = yBack + (L100.d / 2) * Math.sin(S.tilt)
  return { x: 0, y: cy, z: cz, tilt: S.tilt }
}

export type Check = { what: string; value: string; ok: boolean }
export function checkSpeaker(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const B = L100.badge
  c('the badge under the woofer, on the baffle', `y ${B.y} ± ${B.h / 2}, the woofer's foot at ${L100.woofer.y - L100.woofer.r}`, B.y + B.h / 2 < L100.woofer.y - L100.woofer.r - 2 && B.y - B.h / 2 > L100.edge)
  // everything on the baffle, nothing overlapping
  const parts = [
    ['woofer', L100.woofer],
    ['mid', L100.mid],
    ['port', L100.port],
    ['tweeter', L100.tweeter],
  ] as const
  const inner = { x: L100.w / 2 - L100.edge, y0: L100.edge, y1: L100.h - L100.edge }
  const inside = parts.every(([, p]) => Math.abs(p.x) + p.r < inner.x && p.y - p.r > inner.y0 && p.y + p.r < inner.y1)
  c('the drivers and port on the baffle', inside ? 'all inside' : 'one over the edge', inside)
  let clear = true
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i][1]
      const b = parts[j][1]
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 4) clear = false
    }
  c('none of them overlapping', clear ? 'clear' : 'overlap', clear)
  c('the woofer 12", the midrange 5¼", the port 5" [JBL][HTH]', `Ø ${2 * L100.woofer.r} · ${2 * L100.mid.r} · ${2 * L100.port.r}`, 2 * L100.woofer.r === 300 && 2 * L100.port.r === 127 && Math.abs(2 * L100.mid.r - 136) < 10)
  c('the midrange beside the port [EC]', `${Math.abs(L100.mid.y - L100.port.y)} apart in height`, Math.abs(L100.mid.y - L100.port.y) < 10)
  const k = L100.knobs
  c('the attenuators upper left [HTH]', `x ${k.xs.join(', ')}, y ${k.y}`, k.xs.every((x) => x < 0) && k.y > L100.h * 0.8)
  const S = JS120
  c('the stand 362 × 256.1 × 322 [JS]', `${S.w} × ${S.h} × ${S.d}`, S.w === 362 && S.h === 256.1 && S.d === 322)
  const tiltFromHeights = Math.atan2(S.front - S.back, S.platform.d - S.tube)
  c('front 179.7, back 143.4 make its 7° [JS]', `${((tiltFromHeights * 180) / Math.PI).toFixed(1)}°`, Math.abs(tiltFromHeights - S.tilt) < 0.01)
  c('the stand narrower than the speaker (it sits on it, not in it)', `${S.w} < ${L100.w}`, S.w < L100.w)
  const o = onStand()
  const frontZ = o.z + (L100.d / 2) * Math.cos(o.tilt)
  c('the speaker overhangs the platform’s front a little, as in the photos', `${(frontZ - S.d / 2).toFixed(0)} mm`, frontZ - S.d / 2 > 20 && frontZ - S.d / 2 < 90)
  const top = o.y + L100.h * Math.cos(o.tilt)
  c('the whole about 81 tall', `${top.toFixed(0)}`, top > 780 && top < 830)
  return out
}
