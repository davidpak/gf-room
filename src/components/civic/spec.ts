/**
 * David's car: a 2016 Honda Civic LX sedan (10th generation), Crystal Black Pearl, Washington plates
 * BTD2709. Everything here in REAL millimetres, the way the car is; the toy is this scaled by
 * `TOY.k`, a touch wider and on bigger wheels (Bruno's cars are chunky), see ./Civic.
 *
 * Sources
 *   Honda's 2016 Civic Sedan specifications (hondanews.com, Edmunds, Sep 2026):
 *     length 182.3 in (4630), width 70.8 in (1798), height 55.7 in (1415), wheelbase 106.3 in (2700),
 *     track 60.9 in front (1547) / 61.5 in rear (1562); ground clearance ~5.0 in (127)
 *   LX: 215/55R16 tyres on 16-inch steel wheels with covers (tyre radius 16 × 25.4 / 2 + 0.55 × 215 = 321)
 *   the profile (hood, the steep windshield, the fastback roof into a short deck, the beltline rising to
 *   the C-pillar, the door cuts) from David's reference photos (front and rear three-quarters)
 *   Washington plate: 12 × 6 in (305 × 152), the "Evergreen State" design (Mt Rainier across it)
 *
 * Frame: s from the front bumper back (0 → length), y up from the ground, x across (0 the middle).
 */
export const CIVIC = {
  length: 4630,
  width: 1798,
  height: 1415,
  wheelbase: 2700,
  track: { front: 1547, rear: 1562 },
  clearance: 127,
  tyre: { r: 321, w: 215 },
  axle: { front: 935, rear: 935 + 2700 }, // (s of each axle: a 935 front overhang, 995 behind)
  // the lower body's top edge (hood, then the beltline along the sides, the deck) and the greenhouse
  hood: [
    [0, 560],
    [40, 660],
    [140, 715],
    [500, 790],
    [1000, 860],
    [1520, 925],
  ],
  belt: [
    [1520, 925],
    [3300, 985],
    [3960, 1040],
  ],
  deck: [
    [3960, 1040],
    [4400, 1030],
    [4560, 1022],
    [4600, 1032], // (the lip)
    [4630, 1000],
    [4630, 790],
  ],
  roof: [
    [1520, 925], // the windshield's foot
    [2250, 1370], // its top, the roof's front
    [2650, 1415], // the roof's crown
    [3150, 1390],
    [3500, 1300],
    [3960, 1040], // the rear glass's foot: the deck
  ],
  rocker: 200, // (the sill's bottom)
  arch: { r: 405 }, // (the wheel arches, round the toy's bigger tyre with a gap)
  // the doors: where each is cut (s at the sill, s at the beltline), hinged at its front
  doors: {
    front: { s0: 1620, s1: 2690, belt1: 2690 },
    rear: { s0: 2710, s1: 3280, belt1: 3460 },
  },
  trunk: { s0: 3990, s1: 4600, floor: 540 }, // (the lid from the rear glass's foot to the lip; the well's floor)
  cabin: { floor: 360, dash: 1680, back: 3420 }, // (inside: the floor, where the dash ends, the rear seat's back)
  greenhouse: { width: 1640 }, // (the glass and roof, narrower than the body: the sides lean in)
  plate: { w: 305, h: 152, text: 'BTD2709' },
  paint: '#1d1e25', // Crystal Black Pearl
}

/** the toy: scaled down, a bit wider, on bigger wheels */
export const TOY = { k: 0.115, wide: 1.12, wheel: 1.12 }
