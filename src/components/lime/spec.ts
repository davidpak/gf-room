/**
 * The LimeGlider: Lime's seated e-bike (a big padded seat, footboards instead of pedals, a basket, a hub motor),
 * the kind parked all over UW. In real millimetres: x forward, y up, z to its right, the ground at y = 0, its rear
 * axle at x = 0.
 *
 * Sources
 *   [B]  BikePortland (2026-04-07), "Lime adds new electric, seated 'Glider' to Portland fleet": "20-inch wheels
 *        ... the same size as their e-bikes", footrests instead of pedals, a larger padded seat set low, a hub
 *        motor, about 15 mph
 *   [R]  Lime's side render of the LimeGlider (1064 × 678 px), measured by pixel on a grid: the 20" (ISO 406)
 *        rims are 228 px across, so 1.8 mm a pixel; the tyres 274 px (493 mm) over; ground at y 622 px, rear axle
 *        at (209, 487) px, front at (834, 487). Every point below is off it: mm = (px - 209) × 1.8 across,
 *        (622 - py) × 1.8 up
 *   [P]  photos of one parked (its left side: the kickstand, the footboard's tread, the ID plate "HAQNPW" on
 *        the housing) and from the seat (the T bar: the display with its speed and battery, the QR code, the
 *        phone channel, "Front Brake" / "Rear Brake" levers, the green "GO" thumb throttle): for what's across
 *        it, widths judged off these against the 54 mm tyres
 */
const PX = 1.8
/** a point off the render [R], in mm */
export const R = (px: number, py: number): [number, number] => [(px - 209) * PX, (622 - py) * PX]

export const WHEEL = { od: 493, rim: 410, tyre: 54, hubFront: 118, hubRear: 84, spokes: 36 } // [B] 20", [R]
export const AXLE = { rear: R(209, 487), front: R(834, 487) } // [R] wheelbase 1125
/** the steering axis: through the top of the head tube and the front axle [R] (22.6° back from upright) */
export const STEER = { top: R(705, 180), crown: R(767, 322) }
export const STEM = { top: R(690, 100), clamp: R(697, 74) } // [R] bending more upright above the head
export const BAR = { y: 978, back: 80, half: 290, grip: 115 } // [R] its grips at 979 up, swept back 80; [P] ~580 across
/** the frame's spine: down from the head, swooping into the low rail, back to the rear dropouts [R] */
export const SPINE = [R(717, 238), R(690, 320), R(650, 390), R(602, 440), R(560, 470), R(520, 478), R(300, 478), R(232, 478)]
export const SPINE_SIZE = { tube: 82, rail: [70, 59] as [number, number] } // [R] the down tube ~45 px; the rail 33 px tall
export const STAY = { from: R(234, 458), to: R(474, 276), size: [40, 44] as [number, number] } // [R] the green diagonal to the seat
export const SEAT = { x0: R(252, 0)[0], x1: R(480, 0)[0], top: R(0, 219)[1], t: 88, w: 250 } // [R] 410 long, its top 725 up; [P] wide
export const SEAT_POST = { from: R(440, 282), to: R(480, 338) } // [R] the black strut under it
export const HANDLE = [R(252, 262), R(330, 290), R(345, 338)] // [R] the black grab loop round its back
/** the housing (battery and motor controller), black, under the seat [R]: its side outline */
export const HOUSING = { pts: [R(240, 462), R(240, 335), R(485, 335), R(510, 345), R(546, 452), R(536, 462)], w: 160 }
export const DECK = { x0: R(140, 0)[0], x1: R(250, 0)[0], top: R(0, 335)[1] } // [R] the flat rear deck, its tail light at its back
export const FENDER = { r: 290, rear: { from: 28, to: 168 }, front: { r: 280, from: 78, to: 196 }, w: [128, 72] as [number, number] } // [R] degrees round each axle
export const FOOTBOARD = { x0: R(476, 0)[0], x1: R(592, 0)[0], top: R(0, 505)[1], out: 145, t: 12 } // [R] 210 long, 210 up; [P] ~110 out each side
export const BASKET = { top: [R(703, 182), R(915, 195)], bottom: [R(770, 327), R(893, 327)], w: 330, wall: 5 } // [R] 382 long, 261 deep; [P] ~330 across
export const KICKSTAND = { pivot: R(500, 500), foot: R(506, 606) } // [R] down, on its left [P]
export const LOOK = { green: '#5ce63a', black: '#2c2b30', rubber: '#232226' }
