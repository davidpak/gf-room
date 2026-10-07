/**
 * Rina's portable monitor: a thin black 15.6" 1080p panel ("AMN" on its chin) standing on its bottom edge, leaning
 * back on the kickstand folded out of its back, millimetres.
 *
 * Sources
 *   [P]  her photos (public/reference/room-desk-night.jpg, room-desk-poster.jpg, room-desk-wide.png): left of the
 *        laptop, black all over, thin even bezels top and sides, a deeper chin with "AMN" in grey in its middle, the
 *        panel leaning back a little, nothing showing in front of it (the stand's behind), OneNote on it at night
 *   [E]  a 15.6" 16:9 portable monitor: 357 × 223 × 8 on the panel, the active area 345.4 × 194.3 (15.6" 16:9),
 *        about 0.65 kg with its kickstand plate; the kickstand's hinge height and angle
 *
 * Its frame: the middle of its footprint (the panel's front foot to the kickstand's foot) at x 0, z 0, its bottom on
 * y 0, the screen toward +z. The panel's own frame (`panelAt`): x across, v up the panel from its foot, u through
 * it from the back (0) to the screen (t); it pivots on its back foot, leaning back `lean`.
 */
export const MONITOR = {
  w: 357, // [E] across the panel
  h: 223, // [E] foot to top along the panel
  t: 8, // [E] thick
  r: 5, // [E] the panel's corners (from the front)
  edge: 1.6, // [E] its edges rounded
  screen: { w: 345.4, h: 194.3, top: 6, r: 1 }, // [E] the active area (15.6" 16:9), the top bezel; the sides even, the chin the rest
  lean: (15 * Math.PI) / 180, // [P] back from upright
  stand: { at: 140, w: 280, t: 2.5, angle: (33 * Math.PI) / 180, r: 6, hinge: 4 }, // [E] the kickstand: hinged `at` up the back, splayed `angle` from upright
  logo: { text: 'AMN', h: 7 }, // [P] grey, in the chin's middle
  mass: 0.65, // [E] kg
  colors: { body: '#232328', stand: '#2e2e35', logo: '#9a9aa4', glass: '#101116' },
}

const M = MONITOR
/** the chin under the screen */
export const CHIN = M.h - M.screen.top - M.screen.h
/** where a point (v up the panel, u through it) of the panel is, in the monitor's side profile (z, y), before the
 *  footprint's centred: the back foot at (0, 0) */
const raw = (v: number, u: number): [number, number] => [u * Math.cos(M.lean) - v * Math.sin(M.lean), v * Math.cos(M.lean) + u * Math.sin(M.lean)]
/** the kickstand: from its hinge on the back (u 0, v `at`) down and back to the desk */
const S = M.stand
const hingeRaw = raw(S.at, 0)
export const STAND_LEN = hingeRaw[1] / Math.cos(S.angle)
const footRaw: [number, number] = [hingeRaw[0] - STAND_LEN * Math.sin(S.angle), 0]
/** the footprint, front (the panel's front foot) to back (the stand's foot), and the shift that centres it */
const frontRaw = raw(0, M.t)
export const DEPTH = frontRaw[0] - footRaw[0]
const shift = -(frontRaw[0] + footRaw[0]) / 2
/** a panel point in the monitor's frame (z, y) */
export const panelAt = (v: number, u: number): [number, number] => {
  const [z, y] = raw(v, u)
  return [z + shift, y]
}
export const HINGE = panelAt(S.at, 0)
export const FOOT: [number, number] = [footRaw[0] + shift, 0]
/** the panel's back foot (its pivot) */
export const PIVOT = panelAt(0, 0)
/** how tall it stands */
export const HEIGHT = panelAt(M.h, M.t)[1]

export type Check = { what: string; value: string; ok: boolean }
export function checkMonitor(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const diag = Math.hypot(M.screen.w, M.screen.h) / 25.4
  c('a 15.6" screen [E]', `${diag.toFixed(2)}" across its diagonal`, Math.abs(diag - 15.6) < 0.05)
  c('16:9 [E]', `${(M.screen.w / M.screen.h).toFixed(3)}`, Math.abs(M.screen.w / M.screen.h - 16 / 9) < 0.01)
  const side = (M.w - M.screen.w) / 2
  c('thin even bezels top and sides, a deeper chin [P]', `top ${M.screen.top}, sides ${side.toFixed(1)}, chin ${CHIN.toFixed(1)}`, Math.abs(side - M.screen.top) < 1.5 && CHIN > 3 * M.screen.top && CHIN < 30)
  c('the logo fits the chin', `${M.logo.h} in ${CHIN.toFixed(1)}`, M.logo.h < CHIN - 10)
  c('thin: a portable panel [E]', `${M.t} mm`, M.t <= 10)
  const lean = (M.lean * 180) / Math.PI
  c('leaning back a little [P]', `${lean.toFixed(0)}° back from upright`, lean >= 10 && lean <= 20)
  c('the kickstand inside the panel, under the top', `${S.w} of ${M.w}, hinged ${S.at} up of ${M.h}`, S.w < M.w - 40 && S.at < M.h - 40 && S.at > M.h / 3)
  c('the kickstand reaches the desk', `${STAND_LEN.toFixed(0)} long`, STAND_LEN > 60 && STAND_LEN < M.h)
  // it stands: the panel's middle and the plate's (by weight) between the front foot and the stand's foot
  const pm = 0.85
  const [pz] = panelAt(M.h / 2, M.t / 2)
  const sz = (HINGE[0] + FOOT[0]) / 2
  const cz = pz * pm + sz * (1 - pm)
  const front = panelAt(0, M.t)[0]
  c('it stands: its weight between its feet', `centre at z ${cz.toFixed(0)}, feet ${FOOT[0].toFixed(0)} to ${front.toFixed(0)}`, cz > FOOT[0] + 20 && cz < front - 20)
  c('the footprint', `${M.w} × ${DEPTH.toFixed(0)}, ${HEIGHT.toFixed(0)} tall`, DEPTH > 80 && DEPTH < 200)
  return out
}
