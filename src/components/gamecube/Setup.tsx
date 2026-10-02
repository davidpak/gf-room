import { BENCH, RUG } from './spec'

/**
 * How it's all set out (real mm, the rug's middle at the origin, +z toward whoever's sitting down to play): the TV
 * bench along the rug's back edge, the CRT on it; the GameCube on the rug in front of the bench, a little to the right;
 * the two controllers out on the rug toward the cushions, their cables back to ports 1 and 2; the case by the console,
 * shut; the two cushions at the rug's front. The cables: each controller's, and the AV cable up to the TV's jacks.
 */
export const LAYOUT = {
  bench: { x: 0, z: -RUG.d / 2 + BENCH.d / 2 + 10, rot: 0 },
  tv: { x: 0, z: -RUG.d / 2 + BENCH.d / 2 + 10 + BENCH.d / 2 - 12, rot: 0 }, // (its front at the bench's front edge)
  cube: { x: 190, z: -90, rot: -0.12 },
  pads: [
    { x: -190, z: 120, rot: 0.3, color: 'indigo' as const },
    { x: 120, z: 150, rot: -0.35, color: 'black' as const },
  ],
  case: { x: 480, z: 20, rot: 0.3 }, // (clear of the console when it's opened out to its left)
  cushions: [
    { x: -260, z: 400, rot: 0.12, color: '#f6c1cf' },
    { x: 260, z: 415, rot: -0.18, color: '#c9b6e8' },
  ],
}
export const CABLES = [
  { from: 'port1', to: 'pad1', color: '#4f45a6' },
  { from: 'port2', to: 'pad2', color: '#26252c' },
  { from: 'avout', to: 'avin', color: '#26252c' },
]
