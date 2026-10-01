/**
 * Lime's Gen4 scooter: the grey frame (a broad beam down from the head to a low deck), the green stem with its
 * box on the front, the battery standing behind the beam, the black rear hood over its hub motor, a suspended
 * front fork. In real millimetres: x forward, y up, z to its right, the ground at y = 0, the rear axle at x = 0.
 *
 * Sources
 *   [L]  Lime and Levy's Gen4 pages: a 12" front wheel, a 10" rear; ~27 kg; swept-back bars; a lowered deck
 *   [M]  3dmodels.org's "Lime Scooter Gen4 2025" renders (side, front, back, three-quarters, top, close-ups)
 *        sent as reference: measured by pixel on a grid off the side view (1000 × 1000): its front tyre 198 px
 *        across, so (12" ≈ 300 mm over) 1.515 mm a pixel; ground at y 900 px, rear axle (838, 820), front
 *        (154, 801). mm = (838 - px) × 1.515 forward, (900 - py) × 1.515 up. Widths judged off the front and
 *        top views against its ~465 mm bars
 *   [P]  photos of one in the street, and of its T head from the deck: the stem a fat green tube, the T head green
 *        with only its grips black, the QR code on a screwed-on steel plate, the screen under it (an NFC mark, the
 *        lime that shows the battery green, yellow or red)
 */
const PX = 1.515
export const S = (px: number, py: number): [number, number] => [(838 - px) * PX, (900 - py) * PX]

export const WHEELS = { front: { od: 300, w: 62 }, rear: { od: 242, w: 68 } } // [L] 12" / 10"
export const AX = { rear: S(838, 820), front: S(154, 801) } // [M] a 1036 wheelbase
/** the steering axis: up from the front axle through the top of the stem [M] (12° back from upright) */
export const STEER_TOP = S(290, 190)
export const HEAD = { lo: 380, hi: 612, r: 34 } // [M] its head tube (heights), standing proud of the beam
export const STEM = { lo: 612, hi: 1085, r: 31, collars: [[606, 664], [1032, 1092]] as [number, number][] } // [M]
export const BARS = { y: 1113, half: 232, sweep: 44, grip: 110 } // [M] [P] ~465 across, one smooth arc swept back
/** the frame: the beam's side outline down from the head to the deck [M] */
export const BEAM = { pts: [S(168, 548), S(232, 540), S(400, 790), S(410, 850), S(350, 850), S(165, 600)], w: 74 }
export const DECK = { x0: S(745, 0)[0], x1: S(400, 0)[0], top: S(0, 788)[1], bottom: 92, w: 175 } // [M] 170 up
export const ARMS = { from: [170, 106] as [number, number], to: [-92, 116] as [number, number], z: 56 } // [M]
/** the rear hood's side outline over the wheel [M] */
export const HOOD = { pts: [[165, 150], [132, 222], [78, 272], [0, 290], [-140, 290], [-168, 262], [-168, 178], [-128, 132], [0, 104], [90, 112]] as [number, number][], w: 132 }
export const BATTERY = { lo: S(410, 790), hi: S(300, 572), t: 76, w: 116 } // [M] standing behind the beam
export const LOOK = { grey: '#b8bfca', green: '#39c22a', black: '#2b2a30' }
