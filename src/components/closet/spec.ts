/**
 * Reach-in closet with two bypass mirror doors, millimetres.
 *
 * Local frame: X = across the opening, Y = up, Z = toward the room (doors face +Z).
 * Origin = floor, centre of the opening plane. The closet interior is at -Z.
 *
 * Bypass doors: two panels on two parallel tracks, one in front of the other, so
 * either can slide over the other. Each is half the opening plus half the overlap.
 */
export const CLOSET = {
  opening: { w: 1500, h: 2030 }, // standard 80 in door height
  depth: 650, // interior, back wall to opening
  ceiling: 2600,
  wall: 100,

  track: { h: 40, d: 90, floorH: 14 }, // top track under the header, floor guide
  door: { t: 28, overlap: 70, frame: 22, gapTop: 6, gapBottom: 10 },
  lanes: { front: 22, back: -22 }, // z of each door's centre plane (two channels)

  shelf: { y: 1760, t: 22 },
  rod: { y: 1660, r: 14 },
}

export const DOOR = (() => {
  const { opening, track, door } = CLOSET
  const w = opening.w / 2 + door.overlap / 2
  const h = opening.h - track.h - track.floorH - door.gapTop - door.gapBottom
  const y0 = track.floorH + door.gapBottom
  const travel = (opening.w - w) / 2 // centre offset at either end
  return { w, h, y0, left: -travel, right: travel }
})()
