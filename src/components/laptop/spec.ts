/**
 * Rina's laptop: a 13-inch MacBook Pro, Space Gray, in a hard shell case, millimetres.
 *
 * Which one (public/reference/room-desk-*.jpg): "MacBook Pro" on the chin under the screen (the
 * 13-inch body, 2016-2022: the 14-inch has no label, a notch and no Touch Bar); a Touch Bar with a
 * Touch ID key at its right and a physical Esc key at its left, and inverted-T arrow keys (the Magic
 * Keyboard: 2020 on); both cables in on the left side and nothing on the right (two ports, both
 * left: M1 2020 or M2 2022, the same body outside). Apple's tech specs (support.apple.com/111869,
 * 13-inch M2): "Height: 0.61 inch (1.56 cm), Width: 11.97 inches (30.41 cm), Depth: 8.36 inches
 * (21.24 cm), Weight: 3.0 pounds (1.4 kg)"; 13.3-inch 2560 × 1600 at 227 ppi (286.4 × 179.0 active);
 * two Thunderbolt ports (left), a 3.5 mm jack (right).
 *
 * The case (public/reference/macbook-case.jpg): a clip-on hard shell, the lid printed with concentric
 * hearts round the Apple logo (mint ground, then cream, peach, pinks, a pale middle), the bottom shell
 * dark; a pink silicone cover over the keys (the desk photos).
 *
 * Measured off the photos and the display (no drawing from Apple): the 1.56 splits ~10.8 base and
 * 4.8 lid; the chin under the display ~21, the bezel over it ~9; the keyboard's key pitch 18.9 (16.0
 * caps), the Touch Bar row 10.4 tall, 9 in from the back; the trackpad 135 × 82, 8 from the front.
 *
 * Frame: origin in the middle of the base (not counting the case), +Y up, the front (the trackpad's
 * edge) toward +Z, the ports' side toward -X. The lid hinges on an axis across the back.
 */
export const LAPTOP = {
  base: { w: 304.1, d: 212.4, t: 10.8, corner: 7.5, edge: 1.6 },
  lid: { t: 4.8, len: 209.5, open: (112 * Math.PI) / 180 }, // len: from its back edge to its front; open: how far it opens (from shut)
  hinge: { z: 4.5, y: -0.4, r: 3.4, w: 250 }, // the axis: in from the back, down from the base's top; the barrel over it
  display: { w: 286.4, h: 179.0, top: 9, px: [2560, 1600] }, // top: the bezel above it
  keys: { pitch: 18.9, cap: 16.0, rise: 0.7, back: 9, fnRow: 10.4, esc: 1.45, touchId: 1 }, // back: the Touch Bar row in from the back edge; esc / touchId in key widths
  trackpad: { w: 135, d: 82, front: 8 },
  speaker: { w: 6.5, inset: 5 }, // the grilles either side of the keys
  port: { w: 8.4, h: 2.8, z: [-62, -44] }, // the two Thunderbolt ports on the left (their middles, from the base's middle)
  jack: { r: 1.9, z: -60 }, // the headphone jack on the right
  case: { t: 1.0, feet: 1.0, mass: 0.14 }, // the shell's wall; its feet under it
  mass: 1.4, // (kg) the laptop, the case besides
  color: {
    gray: '#8d8f94', // Space Gray aluminium (toy-lit)
    bezel: '#141416',
    hinge: '#2a2a2d',
    shell: '#2c2a2c', // the case's bottom shell
    rim: '#f2c9bf', // the case's lid edge
    key: '#f1b4ae', // the pink cover over the keys
    legend: '#ffffff',
    trackpad: '#9a9ca1',
    touchBar: '#0d0d0f',
    // the lid's print (the photo's colours, cooled from the warm lamp light)
    hearts: ['#f6bcc6', '#a9e2d3', '#fdebcb', '#f9cabe', '#f5aaae', '#f0929c', '#f7c2bd', '#fff5ee'], // the corners, then each heart outside in
  },
}

/** the US layout, row by row: [label, width in keys] (the Touch Bar row separately) */
export const ROWS: [string, number][][] = [
  [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['delete', 1.5]],
  [['tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1]],
  [['caps lock', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['return', 1.75]],
  [['shift', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['shift', 2.25]],
  [['fn', 1], ['control', 1], ['option', 1], ['command', 1.25], [' ', 5], ['command', 1.25], ['option', 1], ['◀', 1], ['▲▼', 1], ['▶', 1]],
]

const L = LAPTOP
/** the keyboard's width (14.5 keys) */
export const KB_W = 14.5 * L.keys.pitch - (L.keys.pitch - L.keys.cap)
/** the Touch Bar row's back edge, and each key row's back edge (z) */
export const FN_Z = -L.base.d / 2 + L.keys.back
export const rowZ = (k: number) => FN_Z + L.keys.fnRow + 2.5 + k * L.keys.pitch

/** each key: middle (x, z), size (w, d), label; the arrows' up / down halves split */
export function keyLayout() {
  const P = L.keys.pitch
  const gap = P - L.keys.cap
  const out: { x: number; z: number; w: number; d: number; label: string }[] = []
  const x0 = -KB_W / 2
  // the Touch Bar row: Esc, (the bar), Touch ID
  const fz = FN_Z + L.keys.fnRow / 2
  const escW = L.keys.esc * P - gap
  out.push({ x: x0 + escW / 2, z: fz, w: escW, d: L.keys.fnRow, label: 'esc' })
  ROWS.forEach((row, k) => {
    let x = x0
    const z = rowZ(k) + L.keys.cap / 2
    for (const [label, u] of row) {
      const w = u * P - gap
      if (label === '▲▼') {
        const h = (L.keys.cap - 1) / 2
        out.push({ x: x + w / 2, z: z - h / 2 - 0.5, w, d: h, label: '▲' })
        out.push({ x: x + w / 2, z: z + h / 2 + 0.5, w, d: h, label: '▼' })
      } else if (label === '◀' || label === '▶') {
        const h = (L.keys.cap - 1) / 2
        out.push({ x: x + w / 2, z: z + h / 2 + 0.5, w, d: h, label })
      } else out.push({ x: x + w / 2, z, w, d: L.keys.cap, label })
      x += u * P
    }
  })
  return out
}

/** the Touch Bar strip (between Esc and Touch ID) and the Touch ID key */
export function touchBar() {
  const P = L.keys.pitch
  const gap = P - L.keys.cap
  const x0 = -KB_W / 2 + L.keys.esc * P
  const x1 = KB_W / 2 - L.keys.touchId * P
  const z = FN_Z + L.keys.fnRow / 2
  return { bar: { x: (x0 + x1 - gap) / 2, z, w: x1 - x0 - gap, d: L.keys.fnRow - 1.6 }, id: { x: x1 + (L.keys.touchId * P - gap) / 2, z, w: L.keys.touchId * P - gap, d: L.keys.fnRow } }
}

/** The spec's own check. */
export function checkLaptop() {
  const results: { what: string; ok: boolean; value: string }[] = []
  const add = (what: string, ok: boolean, value: string) => results.push({ what, ok, value })
  const b = L.base
  add('30.41 × 21.24 × 1.56 cm, shut (Apple)', b.w === 304.1 && b.d === 212.4 && Math.abs(b.t + L.lid.t - 15.6) < 0.05, `${b.w} × ${b.d} × ${(b.t + L.lid.t).toFixed(1)}`)
  const dpi = L.display.px[0] / (L.display.w / 25.4)
  add('13.3-inch, 2560 × 1600 at 227 ppi', Math.abs(Math.hypot(L.display.w, L.display.h) / 25.4 - 13.3) < 0.05 && Math.abs(dpi - 227) < 1, `${(Math.hypot(L.display.w, L.display.h) / 25.4).toFixed(2)}", ${dpi.toFixed(0)} ppi`)
  const chin = L.lid.len - L.display.top - L.display.h
  add('the display fits the lid, a chin under it for the label', (b.w - L.display.w) / 2 > 6 && chin > 15 && chin < 26, `sides ${((b.w - L.display.w) / 2).toFixed(1)}, chin ${chin.toFixed(1)}`)
  const margin = (b.w - KB_W) / 2
  add('the keyboard fits, room for the grilles either side', margin > L.speaker.w + L.speaker.inset + 2, `${KB_W.toFixed(1)} wide, ${margin.toFixed(1)} each side`)
  const keysEnd = rowZ(4) + L.keys.cap
  const padStart = b.d / 2 - L.trackpad.front - L.trackpad.d
  add('the trackpad clears the space bar', padStart - keysEnd > 6, `${(padStart - keysEnd).toFixed(1)} between`)
  add('every row is 14.5 keys wide', ROWS.every((r) => Math.abs(r.reduce((s, [, u]) => s + u, 0) - 14.5) < 1e-9), ROWS.map((r) => r.reduce((s, [, u]) => s + u, 0)).join(' '))
  add('1.4 kg (Apple), the case ~140 g more', L.mass === 1.4 && L.case.mass < 0.2, `${L.mass + L.case.mass} kg`)
  add('it opens to ~112° (a MacBook stops near 120°)', L.lid.open > 1.7 && L.lid.open < 2.2, `${((L.lid.open * 180) / Math.PI).toFixed(0)}°`)
  return results
}
