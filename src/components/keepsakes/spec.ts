/**
 * Rina's cards and keepsakes, standing together at the back of her desk: her mum's card ("My Daughter is
 * Amazing..."), a Mickey Mouse card, a gold frame with a photo of her and her sister, and a hot cocoa bomb in its
 * box ("Hot Cocoa Polar Bear"). Millimetres.
 *
 * Sources
 *   [P]  her photo room-desk-wall.jpg (middle back, zoomed): the daughter card face on, portrait, folded and standing
 *        open: a painting of a blue bicycle by a white pillar, its basket heaped with pink flowers, deep green
 *        leaves behind, a pale sky; "My Daughter / is Amazing..." in a red-brown script top left. Behind it to the
 *        right the Mickey card: kraft-brown stock, Mickey drawn large in sepia browns. Right of them a deep gold
 *        box frame standing upright, a photo in it of two girls in white, seated, on a dark backdrop. In front of
 *        the frame the cocoa box: teal printed with white snowflakes, a red mug drawn at the top, a red banner
 *        "HOT COCOA POLAR BEAR", a big clear window showing the white chocolate inside, a white band of small
 *        print at the foot; it reads about 1.5 times as tall as it's wide
 *   [E]  a 5 × 7 in greeting card (127 × 178) on ~0.4 card stock; a 5 × 7 in frame with ~25 mouldings and an easel
 *        back; a cocoa bomb (~60 across) on a paper cup in a carton; the weights
 *
 * Each thing's frame: the middle of its footprint at x 0, z 0, its bottom on y 0, its face (the side you look at)
 * toward +z.
 */
const IN = 25.4
export const KEEPSAKES = {
  card: { w: 5 * IN, h: 7 * IN, t: 0.4, open: 62 }, // [E] each panel; open: the angle between the panels (degrees)
  // the front panel turned this far from facing +z (degrees), its back panel round behind it
  cardYaw: 12,
  frame: {
    photo: { w: 5 * IN, h: 7 * IN }, // [E] a 5 × 7 print
    mat: 9, // [E] the white mat's border, over the print's edge
    moulding: 25, // [E] the moulding's width (face on)
    depth: 22, // [P] a deep box moulding
    lip: 5, // [E] the inner step of the moulding, down to the mat
    lean: 12, // [E] it leans back on its easel this far (degrees)
    mass: 0.38, // [E] kg, with its glass
  },
  box: { w: 76, d: 76, h: 118, round: 1.2 }, // [P] its proportions off the photo (1.55 tall to wide), [E] its width
  window: { w: 56, h: 60, y: 22, r: 4 }, // [P] the window in its front, its foot this high
  bomb: { d: 58, ears: 11, cup: { d: 50, h: 16 } }, // [E] the white chocolate ball, its little bear's ears, the paper cup it sits in
  mass: { card: 0.018, box: 0.09 }, // [E] kg
  colors: {
    kraft: '#c99c68',
    sepia: '#6e4325',
    cardInside: '#fbf7ef',
    gold: '#d1a743',
    goldDeep: '#a77c25',
    mat: '#f6f2ea',
    teal: '#58c3c4',
    tealDeep: '#2f9fa6',
    red: '#d6293a',
    boardInside: '#e9e2d4',
    chocolate: '#f6efe2',
    cup: '#f1e9da',
  },
}

const K = KEEPSAKES
const rad = (d: number) => (d * Math.PI) / 180

/** a standing card's footprint (x, z): the spine and the free edges of the front and back panels, centred */
export function tent() {
  const C = K.card
  const a = rad(K.cardYaw)
  const b = rad(K.cardYaw + C.open)
  // the spine at the left; the front panel runs off to the right, turned back by its yaw; the back panel further round
  const spine: [number, number] = [0, 0]
  const front: [number, number] = [C.w * Math.cos(a), -C.w * Math.sin(a)]
  const back: [number, number] = [C.w * Math.cos(b), -C.w * Math.sin(b)]
  const xs = [spine[0], front[0], back[0]]
  const zs = [spine[1], front[1], back[1]]
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const at = (p: [number, number]): [number, number] => [p[0] - cx, p[1] - cz]
  return { spine: at(spine), front: at(front), back: at(back), yawFront: a, yawBack: b }
}

/** the frame's outside: width and height face on */
export function frameOuter() {
  const F = K.frame
  // (the opening's the print's size; the mat inside it, over the print's edge)
  return { w: F.photo.w + 2 * F.moulding, h: F.photo.h + 2 * F.moulding }
}

export type Check = { what: string; value: string; ok: boolean }
export function checkKeepsakes(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const C = K.card
  c('a 5 × 7 in greeting card [E]', `${C.w.toFixed(0)} × ${C.h.toFixed(0)}`, Math.abs(C.w - 127) < 2 && Math.abs(C.h - 178) < 2)
  c('thin card stock [E]', `${C.t} thick`, C.t >= 0.25 && C.t <= 0.6)
  const T = tent()
  const area = Math.abs((T.front[0] - T.spine[0]) * (T.back[1] - T.spine[1]) - (T.back[0] - T.spine[0]) * (T.front[1] - T.spine[1])) / 2
  c('it stands: open enough to make a firm tent', `${C.open}° open, a footprint of ${(area / 100).toFixed(0)} cm²`, C.open >= 40 && C.open <= 110 && area > 3000)
  c('its front faces you, near enough [P]', `turned ${K.cardYaw}°`, K.cardYaw < 25)
  const F = K.frame
  const o = frameOuter()
  c('a 5 × 7 frame with ~25 mouldings [E]', `${o.w.toFixed(0)} × ${o.h.toFixed(0)} outside`, Math.abs(F.moulding - 25) <= 5 && Math.abs(o.w - 177) < 4)
  c('the frame’s proportions as in her photo (~0.7) [P]', `${(o.w / o.h).toFixed(2)}`, Math.abs(o.w / o.h - 0.75) < 0.08)
  const tipX = o.h * Math.sin(rad(F.lean))
  c('the frame stands: leaning back, its weight over its easel’s foot', `leaning ${F.lean}°, its top ${tipX.toFixed(0)} back`, F.lean >= 8 && F.lean <= 20)
  const B = K.box
  c('the box’s proportions as in her photo (~1.5 tall to wide) [P]', `${B.w} × ${B.d} × ${B.h}: ${(B.h / B.w).toFixed(2)}`, Math.abs(B.h / B.w - 1.55) < 0.15)
  const W = K.window
  c('the window in the box’s front, with print all round [P]', `${W.w} × ${W.h} at y ${W.y}..${W.y + W.h} of ${B.w} × ${B.h}`, W.w <= B.w - 14 && W.y >= 15 && W.y + W.h <= B.h - 28)
  const bm = K.bomb
  c('the ball fits inside the box', `${bm.d} in ${B.w - 2}, its top at ${bm.cup.h - 4 + bm.d}`, bm.d < B.w - 8 && bm.cup.h - 4 + bm.d + bm.ears * 0.5 < B.h - 10)
  c('the ball shows in the window', `its middle at y ${(bm.cup.h - 4 + bm.d / 2).toFixed(0)}, the window ${W.y}..${W.y + W.h}`, bm.cup.h - 4 + bm.d / 2 > W.y + 10 && bm.cup.h - 4 + bm.d / 2 < W.y + W.h - 10)
  return out
}
