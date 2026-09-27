import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three'
import { LAMP, armPoints, shadeFrame } from '../lamp/spec'

/**
 * Rina's claw clip, clamped on the lamp's pole with the Wumpus sat on top of it, millimetres.
 * References (public/reference/):
 *   claw-clip.png   (from room-desk-night.jpg) a large rectangular claw clip in amber (tortoise),
 *                   clamped along the pole, one jaw face on (a flat panel with a long slot), the
 *                   handles sticking out sideways, the Wumpus sat on its top end
 *   lamp-arm.webp   the same, just below the Wumpus
 *   a "large cutout rectangle" claw clip: 4.1 × 2.1 in (105 × 55): its length, and teeth to handles
 * How it's made (like any claw clip): two jaws hinged at the back on a spring; each jaw's flat side
 * curls round at the front into a lip (the two lips' teeth comb together); squeeze the handle tabs
 * behind the hinge and the jaws open. Clamped on the pole the jaws hug it, one each side, the lips
 * meeting behind it. (Written for more clips than one: CLIPS.)
 *
 * Each clip's frame: origin on the pole's axis at its middle, +Y up the pole, +X out to the hinge and
 * the handles, the jaws either side in ±Z. On the lamp it's turned `yaw` round the pole (from +X
 * toward +Z) at height `y`.
 */
export type ClipKind = 'amber'
export type ClipSpec = {
  id: ClipKind
  length: number // along the pole
  depth: number // teeth to handle tips
  t: number // a jaw's thickness (a wire clip: its wire's)
  zIn: number // each jaw's flat side: its inner face off the pole's plane
  x1: number // the flat sides run back to here, into the hinge
  lip: { r: number; to: number } // curling round the pole (inner radius) to `to` from +X
  hinge: { x: number; h: number; r: number }
  handle: { len: number; h: number; splay: number }
  y: number
  yaw: number
  mass: number // kg
}
const deg = (d: number) => (d * Math.PI) / 180

export const CLIPS: Record<ClipKind, ClipSpec> = {
  // the big amber (tortoise acetate) rectangle, the Wumpus's seat: its top just under him, its foot
  // clear of the arm's bend
  amber: {
    id: 'amber',
    length: 105,
    depth: 55,
    t: 3,
    zIn: 12,
    x1: 26,
    lip: { r: 12, to: deg(160) },
    hinge: { x: 29, h: 36, r: 4 },
    handle: { len: 12, h: 30, splay: 0.28 },
    y: 414.5,
    yaw: 0,
    mass: 0.03,
  },
}
export const CLIP_LIST = Object.values(CLIPS)
/** the amber clip's top: the Wumpus sits here */
export const CLIP_TOP = CLIPS.amber.y + CLIPS.amber.length / 2
/** how far the jaws swing open in the hand */
export const OPEN = deg(24)

/** a clip's place on the lamp (lamp frame) */
export function clipMatrix(c: ClipSpec) {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -c.yaw) // its +X to (cos yaw, 0, sin yaw)
  return new Matrix4().compose(new Vector3(0, c.y, 0), q, new Vector3(1, 1, 1))
}
/** a lamp-frame point in a clip's own frame */
const toClip = (c: ClipSpec, p: Vector3) => {
  const x = p.x * Math.cos(c.yaw) + p.z * Math.sin(c.yaw)
  const z = -p.x * Math.sin(c.yaw) + p.z * Math.cos(c.yaw)
  return new Vector3(x, p.y - c.y, z)
}
/** how far a point (clip frame) is outside the clip's outline, roughly (a box round jaws and hinge) */
function outside(c: ClipSpec, p: Vector3) {
  const dx = Math.max(-(c.lip.r + c.t) - p.x, p.x - (c.hinge.x + c.hinge.r + c.handle.len), 0)
  const dy = Math.max(Math.abs(p.y) - c.length / 2, 0)
  const dz = Math.max(Math.abs(p.z) - (c.zIn + c.t), 0)
  return Math.hypot(dx, dy, dz)
}

/** the spec's own check, for every clip */
export function checkClips() {
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })
  const P = LAMP.pole
  const arm = new CatmullRomCurve3(armPoints(), false, 'centripetal').getSpacedPoints(400)
  const F = shadeFrame()
  const S = LAMP.shade
  const sorted = [...CLIP_LIST].sort((a, b) => a.y - b.y)
  for (const c of CLIP_LIST) {
    const lo = c.y - c.length / 2
    const hi = c.y + c.length / 2
    const reach = c.hinge.x + c.handle.len + (c.lip.r + c.t) * Math.cos(Math.PI - c.lip.to) // (the teeth are behind the pole)
    add(`${c.id}: teeth to handle tips (${c.depth})`, Math.abs(reach - c.depth) < 3, `${reach.toFixed(1)} mm`)
    add(`${c.id}: hugs the pole`, c.lip.r > P.r + 0.5 && c.lip.r - P.r < 4 && c.zIn > P.r + 1.5, `${(c.lip.r - P.r).toFixed(1)} mm round it`)
    // on the bare pole: above the low ring, clear of the arm's collar
    const ringTop = P.ring + 12
    const collar = [LAMP.arm.collarY - 10, LAMP.arm.collarY + 10]
    const bare = lo > ringTop + 2 && (hi < collar[0] - 2 || lo > collar[1] + 2) && hi < P.top - 2
    add(`${c.id}: on the bare pole`, bare, `${lo.toFixed(0)}–${hi.toFixed(0)}`)
    let gap = 1e9
    for (const p of arm) gap = Math.min(gap, outside(c, toClip(c, p)) - LAMP.arm.r)
    add(`${c.id}: clear of the arm`, gap > 1.5, `${gap.toFixed(1)} mm`)
    // the shade: its rim and cone against the clip's corners
    let shade = 1e9
    for (const sx of [-(c.lip.r + c.t), c.hinge.x + c.hinge.r + c.handle.len])
      for (const sy of [-c.length / 2, c.length / 2])
        for (const sz of [-(c.zIn + c.t), c.zIn + c.t]) {
          const w = new Vector3(sx, sy, sz).applyMatrix4(clipMatrix(c))
          const v = w.clone().sub(F.top)
          const t = v.dot(F.axis)
          const r = v.addScaledVector(F.axis, -t).length()
          if (t >= -5 && t <= S.h + 5) shade = Math.min(shade, r - (S.rTop + (S.rBottom - S.rTop) * Math.min(1, Math.max(0, t / S.h))))
        }
    add(`${c.id}: clear of the shade`, shade > 4, shade > 1e8 ? 'nowhere near it' : `${shade.toFixed(0)} mm`)
  }
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    const g = b.y - b.length / 2 - (a.y + a.length / 2)
    add(`${a.id} and ${b.id} don't overlap`, g > 2, `${g.toFixed(0)} mm apart`)
  }
  return results
}
