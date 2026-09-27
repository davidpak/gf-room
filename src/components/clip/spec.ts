import { CatmullRomCurve3 } from 'three'
import { LAMP, armPoints } from '../lamp/spec'

/**
 * Rina's claw clip, clamped on the lamp's pole with the Wumpus sitting on top of it, millimetres.
 * References (public/reference/):
 *   claw-clip.png        cropped from room-desk-night.jpg: a large rectangular claw clip in amber
 *                        (tortoise), clamped along the pole, one jaw face on (a flat panel with a
 *                        long slot you can see the pole through), the handles sticking out sideways,
 *                        the Wumpus sat on its top end
 *   lamp-arm.webp        the same, orange under the lamp, just below the Wumpus
 *   a "large cutout rectangle" claw clip: 4.1 × 2.1 in (105 × 55): its length, and teeth to handles.
 *   In the photo its length is ~1.8 of the Wumpus's width seen there, which fits.
 *
 * How it's made (like any claw clip): two jaws, hinged at the back with a spring; each jaw is a flat
 * slotted panel that curls round at the front into a lip of teeth, the two lips' teeth combing
 * together; squeeze the two handle tabs behind the hinge and the jaws open. Clamped on the pole its
 * jaws hug it, one each side, the lips meeting behind it.
 *
 * Local frame: origin on the pole's axis at the clip's middle, +Y up the pole, +X out to the hinge
 * and the handles (under the Wumpus), the jaws either side in ±Z.
 */
export const CLIP = {
  length: 105,
  depth: 55, // teeth to handle tips
  t: 3, // a jaw's thickness (acetate)
  panel: { z: 12, x0: 0, x1: 26, r: 7, slot: { l: 72, w: 6.5 } }, // each jaw's flat side: its inner face at ±z, from beside the pole back to the hinge
  lip: { r: 12, to: (160 * Math.PI) / 180, teeth: 7 }, // curling round the pole (inner radius) to 160° from +X; teeth per lip
  hinge: { x: 29, h: 36, r: 4 },
  handle: { h: 30, len: 12, splay: 0.28 }, // the tabs past the hinge, splayed apart (jaws closed)
  color: { acetate: '#bb7d4c', dark: '#8d5932' }, // amber tortoise, toned for the toy look
  /** its middle's height on the lamp: its top just under the Wumpus, its foot clear of the arm's bend */
  y: 414.5,
}
export const CLIP_TOP = CLIP.y + CLIP.length / 2

/** the spec's own check */
export function checkClip() {
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })
  const C = CLIP
  const reach = C.hinge.x + C.handle.len + (C.lip.r + C.t) * Math.cos(Math.PI - C.lip.to) // (the teeth are behind the pole)
  add('teeth to handle tips (55)', Math.abs(reach - C.depth) < 3, `${reach.toFixed(1)} mm`)
  add('hugs the pole', C.lip.r > LAMP.pole.r && C.lip.r - LAMP.pole.r < 4, `${(C.lip.r - LAMP.pole.r).toFixed(1)} mm round it`)
  add('slot inside the panel', C.panel.slot.l < C.length - 20 && C.panel.slot.w < C.panel.x1 - C.panel.x0 - 10, `${C.panel.slot.l} × ${C.panel.slot.w}`)
  // clear of the arm (its S leaves the pole just below, toward +Z) and the arm collar
  const arm = new CatmullRomCurve3(armPoints(), false, 'centripetal').getSpacedPoints(400)
  const lo = C.y - C.length / 2
  let gap = 1e9
  for (const p of arm) {
    if (p.y < lo - LAMP.arm.r || p.y > CLIP_TOP + LAMP.arm.r) continue
    // the clip's outline across: |z| up to the jaws' outer face, x from the lips to the hinge
    const dz = Math.abs(p.z) - (C.panel.z + C.t)
    const dx = p.x - (C.hinge.x + C.hinge.r)
    const dy = Math.max(lo - p.y, p.y - CLIP_TOP, 0)
    gap = Math.min(gap, Math.hypot(Math.max(dz, 0), Math.max(dx, 0), dy) - LAMP.arm.r)
  }
  add('clear of the arm', gap > 1.5, `${gap.toFixed(1)} mm`)
  add('above the arm collar', lo > LAMP.arm.collarY + 10 + 5, `${(lo - LAMP.arm.collarY - 10).toFixed(0)} mm`)
  return results
}
