import { PAL } from '../../lib/palette'

/**
 * Rina's room, millimetres, from public/reference/room*.{jpg,png}, bed-blanket.webp, room.jpg.
 *
 * Room frame: X = west to east, Z = north to south, Y = up. Origin = floor, room centre.
 * Interior faces of the walls are at x = ±w/2, z = ±d/2 (walls are built outward).
 *
 *   north  the ONE window (a pair of white faux-wood blinds), behind the bed head, right of the desk
 *   east   the bed's long side (vines, art, sticky notes later)
 *   south  mirrored closet (SE, protruding into the room) and the door (SW), facing the bed
 *   west   a ceiling bulkhead runs along it, over the desk side of the room
 *
 * ROOM w × d is an estimate (about 10.5 × 12.5 ft); the photos fix the arrangement, not the size.
 */
export const ROOM = {
  w: 3200,
  d: 3800,
  h: 2600, // ceiling
  wall: 150, // wall thickness (shows in the window recess and the door opening)

  paint: PAL.cream, // warm cream: amber in the lamp's pool, dusty lavender in the shade
  trim: PAL.white, // warm white: baseboards, casings, window frame, blinds
  floor: PAL.honey, // soft honey laminate
  base: PAL.base, // the diorama slab under the room
  plank: { w: 190, len: 1220 }, // planks run north-south (toward the window)
  baseboard: { h: 90, t: 12 },

  // the window: a wide left sash and a narrower right one, each with its own blind
  window: {
    x0: -350, // left edge of the opening: just past the lamp at the desk's right end
    x1: 1450, // right edge: ~150 from the east corner (where the paper cranes hang)
    sill: 700, // pillows lean on the lower blinds
    head: 2380,
    split: 1000, // width of the left sash / blind from x0
    frame: 45, // white vinyl frame profile
    mullion: 50,
    glass: 80, // glass plane, back from the room face
    stool: { t: 22, over: 38, ears: 45 }, // interior sill board: thickness, overhang, extends past the opening
  },

  // white 2 in faux-wood blinds, inside-mounted, one per sash
  blinds: {
    slat: 50, // slat width (front to back)
    thick: 2.6,
    crown: 2.2, // slight curve across the slat
    pitch: 43, // vertical spacing
    inset: 40, // centre of the slats, back from the room face
    rail: { h: 45, d: 52 }, // head rail
    valance: { h: 85, t: 12 }, // decorative board across the top of the whole window
    bottom: 24, // bottom rail height
    wand: { len: 900, r: 4.5 },
    tape: 9, // ladder tape width
    tiltOpen: 0.3, // radians: slats a little tilted, light comes through in stripes
    tiltClosed: 1.38,
  },

  soffit: { w: 1200, drop: 350 }, // bulkhead along the west wall, over the desk side

  // interior door, near the SW corner, hinged on the west, swings into the room
  door: { x0: -1450, w: 915, h: 2030, t: 35, casing: 70, swing: 1.5, handleY: 960 },
  hall: { depth: 1400 },

  gap: { bedToWall: 60, deskToWall: 20 },
}

/**
 * The room's light: the end of the day, in, reading notes from your friends. [P] her night photos
 * (room-desk-night.jpg, room-desk-wide.png, room-desk-window-bed-night.png): amber all over, the yellow lamp the
 * brightest thing, a strand of warm fairy lights up the window's left edge, across its top and on along the top of
 * the wall over her bed. [E] David: sunset colours, orange and pink; and the cozy-interior way (golden light through
 * blinds in slatted stripes, lamps ~2800 K, a soft bounce lifting the dark corners). The strengths by eye. The
 * lamp's own light is in ./Lamp (its spot and spill); everything else is here (./RoomLights).
 */
export const LIGHT = {
  dark: '#17131f', // past the room (the diorama's surround)
  // what fills the shade: a dusky rose-lilac from above, a warm apricot bounce from below
  shade: { sky: '#7c6488', ground: '#a87656', k: 1.05 },
  // the room's soft warm light, from above (the lamp and strings bounced off the ceiling): soft shadows for contact
  warm: { color: '#ffcf9f', k: 0.42 },
  // the sun going down outside the window: low, warm coral-orange, in through the blinds in slatted stripes (the
  // north wall shades everything else), across the bed and the floor and up the wall by it
  sunset: { color: '#ff8f6a', k: 1.25, dir: [0.42, -0.32, 1] as [number, number, number] },
  // outside: the sky at sunset, violet above, pink, a glowing orange low down (between the slats)
  sky: { top: '#4a3468', mid: '#ec8b86', low: '#ffb36e', k: 1.05 },
  // the fairy lights (her photo: ~70 mini bulbs on a white wire, ~8 cm apart)
  strings: {
    bulb: { r: 5, len: 11, every: 85 }, // mm
    color: '#ffc67c',
    glow: 3.4, // above white: they bloom
    off: 95, // mm out from the window casing's edge
    over: 115, // mm above the window head (its top run)
    sag: 35, // mm the wire hangs between hooks
    hooks: 420, // mm apart
    wire: 1.3, // mm
    lights: 4, // real lights along it, warming the walls and blinds round it
    // [P] past the window it goes on into the corner and along the top of the wall over her bed, then droops
    bed: { run: 2300, droop: 260 }, // mm along that wall; how far its end hangs down
    k: 85, // each (decay 1, as the lamp's)
    reach: 1500, // mm
  },
  // dust in the lamp's light over the desk (as the poster's motes)
  dust: { count: 40, box: [1300, 1100, 650] as [number, number, number] },
}
