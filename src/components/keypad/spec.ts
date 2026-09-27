/**
 * FEZIBO keypad spec, in millimetres, measured against public/reference/keypad.png.
 *
 * World frame for this component (three.js): X = left to right as you face the desk,
 * Y = up, Z = toward you. Origin = top-front edge of the housing, where it meets the
 * underside of the desktop.
 *
 * Side profile (looking from the right, Z to the right, Y up):
 *
 *        back-top ________________ face-top
 *                |                 \
 *                |                  \   <- sloped control face ("beveled top edge")
 *                |                   \
 *                |                    | face-bottom
 *                |                    |  front lip
 *     back-bottom|____________________| front-bottom
 *
 * The face is the chamfer. Everything on it is laid out flat in a 2D "face frame"
 * (x across, y up the slope, z out of the face) and that frame is rotated ONCE.
 */
export const KP = {
  width: 150,
  depth: 40,
  height: 28,

  // chamfer: starts `faceTopInset` back from the front on the top, ends `faceDrop` down the front
  faceTopInset: 18,
  faceDrop: 20,

  corner: { backTop: 1.5, faceTop: 3, faceBottom: 3, frontBottom: 4, backBottom: 2 },
  endBevel: 2.5, // rounding on the left/right end caps

  screen: { x: -46, w: 25, h: 14, bezel: 2 },
  presets: { xs: [-15, 1, 17], size: 13, radius: 2.8, labels: ['1', '2', '3'] },
  arrows: { up: 37, down: 55, circumradius: 8.2, radius: 2.2 },
  button: { depth: 2.2, bevel: 0.8 },
  label: { size: 6.2, depth: 0.5 },
  press: 1.3, // how far a button sinks when held

  desk: { width: 320, thick: 25, depth: 200, overhang: -20 }, // negative: the keypad juts past the desk edge, face exposed
}

// derived: face geometry in the side profile (z, y)
export const FACE = (() => {
  const top = { z: -KP.faceTopInset, y: 0 }
  const bottom = { z: 0, y: -KP.faceDrop }
  const length = Math.hypot(top.z - bottom.z, top.y - bottom.y)
  // outward normal points forward and up; rotate the face frame about X by -angle
  const angle = Math.atan2(KP.faceTopInset, KP.faceDrop)
  return {
    center: { z: (top.z + bottom.z) / 2, y: (top.y + bottom.y) / 2 },
    length,
    angle,
  }
})()
