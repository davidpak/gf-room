import { Matrix4, Quaternion, Vector3 } from 'three'
import { BODY, HEAD, NUT } from './spec'
import { END } from './Guitar'

/**
 * Where the guitar goes, as a matrix for its frame (./Guitar's: tail at the origin, neck up +y, its top
 * facing +z), at `s` its scale:
 *
 *   lean   stood on its tail against a trunk, leaning back: the back of its tail on the ground, the back
 *          of its headstock against the bark (as a guitar leans on a wall), its face turned `yaw` from +z
 *   play   held up flat in front of you to play: the neck off to your right (as a player facing you
 *          holds it), its face toward `yaw`, tipped up a little
 */
export const LEAN = 0.3
const back = (HEAD.back * Math.PI) / 180
/** the back of the tail, where it stands; the back of the head's top, where it rests */
const BASE = new Vector3(0, 0, -BODY.depthTail)
const REST = new Vector3(0, END + NUT.t + HEAD.length * Math.cos(back) - HEAD.t * Math.sin(back), -HEAD.length * Math.sin(back) - (HEAD.t + 9) * Math.cos(back)) // (its tuners' knobs stand 9 proud of its back)

export function leanMatrix(trunk: { x: number; z: number; r: number }, ground: number, s: number, yaw: number) {
  const R = new Matrix4().makeRotationY(yaw).multiply(new Matrix4().makeRotationX(-LEAN))
  const base = BASE.clone().applyMatrix4(R).multiplyScalar(s)
  const rest = REST.clone().applyMatrix4(R).multiplyScalar(s)
  const f = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
  // its head's back on the bark, facing out from it; its tail's back on the ground
  const t = new Vector3(trunk.x, 0, trunk.z).addScaledVector(f, trunk.r).sub(rest)
  t.y = ground - base.y
  return new Matrix4().compose(t, new Quaternion().setFromRotationMatrix(R), new Vector3(s, s, s))
}

/** the middle of it (its frame): what's put at `centre` when it's held up to play */
export const MIDDLE = new Vector3(0, 470, -40)
export function playMatrix(centre: Vector3, s: number, yaw: number, tilt = 0.12) {
  const f = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const face = f.clone().multiplyScalar(Math.cos(tilt)).setY(Math.sin(tilt)).normalize()
  const X = right.clone().cross(face) // (its treble side: down, the bass strings on top)
  const m = new Matrix4().makeBasis(X, right, face)
  const q = new Quaternion().setFromRotationMatrix(m)
  const p = centre.clone().sub(MIDDLE.clone().applyQuaternion(q).multiplyScalar(s))
  return new Matrix4().compose(p, q, new Vector3(s, s, s))
}
