/**
 * Rina's bed, millimetres, from public/reference/room.jpg.
 *
 * Full-size mattress (54 × 75 in) on a black square-tube platform frame, with a
 * maple 2 × 2 drawer unit under the foot half of the long side that faces the room.
 *
 * World frame: X = along the bed (foot at -X, head at +X), Y = up, Z = toward the room
 * (the drawer side). Origin = floor, centre of the footprint.
 */
const IN = 25.4

export const BED = {
  mattress: { len: 75 * IN, w: 54 * IN, h: 250, radius: 45 },
  tube: 38, // square steel tube
  deck: 420, // top of the frame rails = underside of the mattress
  get frame() {
    return { len: this.mattress.len + 2 * this.tube, w: this.mattress.w + 2 * this.tube }
  },

  // drawer unit sits between the foot leg and the centre leg on the room side
  unit: { depth: 600, bottomRail: 30, railGap: 18, gap: 6, frontInset: 10 },
  drawer: { front: 18, box: 12, travel: 330, peek: 14 },
  pull: { w: 110, dip: 14, thick: 8, fromTop: 16 }, // curved finger-pull cutout

  // the two-sided blue blanket (public/reference/bed-blanket.webp shows the sherpa inside), over
  // the foot end with the head end turned down
  blanket: {
    across: 72 * IN, // sides hang ~170 below the mattress's rounded edge: clear of the frame rails
    along: 84 * IN,
    thickness: 30, // plush
    footHang: 170, // how far the foot end hangs below the rounded edge (same as the sides)
    crease: 380, // x of the turned-down fold: just short of where the pillows sit
    cornerRound: 110, // the flat blanket's corners are rounded, like a real hemmed blanket
    // sheen = the fibres' glow at grazing angles: a lighter tint of the same blue (near-white washes it out)
    outside: { color: '#8a97cf', sheen: '#b9c1e8' }, // smooth micro-fleece, a soft dusty periwinkle
    inside: { color: '#c9d0f3', sheen: '#e6e9fb' }, // sherpa pile, lighter
  },
}

/** Derived layout of the drawer unit. */
export const UNIT = (() => {
  const { len, w } = BED.frame
  const t = BED.tube
  const x0 = -len / 2 + t // inside face of the foot leg
  const x1 = -t / 2 // near face of the centre leg
  const width = x1 - x0
  const top = BED.deck - t // underside of the side rail
  const bottom = BED.unit.railGap + BED.unit.bottomRail
  const g = BED.unit.gap
  const drawerW = (width - 3 * g) / 2
  const drawerH = (top - bottom - 3 * g) / 2
  const front = w / 2 - BED.unit.frontInset // z of the drawer faces
  return { x0, x1, width, cx: (x0 + x1) / 2, top, bottom, drawerW, drawerH, front, g }
})()
