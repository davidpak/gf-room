// Her "Rina" traced off the photo of her desk (public/reference/room-desk-poster.jpg) into src/components/poster/letters.ts
// and public/textures/rina-letters.png. Needs (not kept in the project): npm i --no-save potrace jimp@0.22
// Run: node scripts/trace-letters.cjs. The marker: dark and grey (her colours are as dark but coloured), pencil grain
// opened away; what's coloured in: the enclosed parts holding the SEEDS (read off the photo by eye).
const Jimp = require('jimp')
const potrace = require('potrace')
const fs = require('fs')
const OUT = require('path').join(__dirname, '..') + '/'
const UP = 4 // trace at 4x: smoother curves

const traceMask = (mask, W, H, opts) =>
  new Promise(async (res, rej) => {
    const img = new Jimp(W, H, 0xffffffff)
    for (let i = 0; i < W * H; i++) if (mask[i]) img.bitmap.data.writeUInt32BE(0x000000ff, i * 4)
    const buf = await img.getBufferAsync(Jimp.MIME_PNG)
    const t = new potrace.Potrace({ threshold: 128, turdSize: 60, optTolerance: 0.4, alphaMax: 1.0, ...opts })
    t.loadImage(buf, (err) => (err ? rej(err) : res(t.getPathTag().match(/ d="([^"]+)"/)[1])))
  })

;(async () => {
  const src = await Jimp.read(OUT + 'public/reference/room-desk-poster.jpg')
  const box = { x: 516, y: 272, w: 390, h: 345 } // the letters, right of the selfie inset
  const img = src.clone().crop(box.x, box.y, box.w, box.h).resize(box.w * UP, box.h * UP, Jimp.RESIZE_BICUBIC)
  const W = img.bitmap.width
  const H = img.bitmap.height
  const d = img.bitmap.data
  const px = (i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
  // the marker: dark, and in big pieces (the printed notes are dark too, but small: dropped below)
  const dark = new Uint8Array(W * H)
  // (dark and grey: her red, dim in the photo, is as dark but strongly coloured)
  for (let i = 0; i < W * H; i++) { const c = px(i); dark[i] = lum(c) < 72 && Math.max(...c) - Math.min(...c) < 58 && c[2] < c[0] + 6 ? 1 : 0 }
  // (pencil grain off: eroded then grown back, so only strokes as thick as the marker stay)
  const morph = (m, r, grow) => { const o = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = grow ? 0 : 1; for (let dy = -r; dy <= r && (grow ? !v : v); dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy)); const b = m[yy * W + xx]; if (grow && b) { v = 1; break } if (!grow && !b) { v = 0; break } } o[y * W + x] = v } return o }
  dark.set(morph(morph(dark, 5, false), 5, true))
  // (the name-tag sticker under the R, in the corner: not hers to trace)
  for (let y = 1150; y < H; y++) for (let x = 0; x < 64; x++) dark[y * W + x] = 0
  // connected parts of a mask: a label each, their sizes
  const label = (mask) => {
    const lab = new Int32Array(W * H).fill(-1)
    const sizes = []
    const stack = []
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || lab[s] >= 0) continue
      const id = sizes.length
      let n = 0
      stack.push(s)
      lab[s] = id
      while (stack.length) {
        const i = stack.pop()
        n++
        const x = i % W
        const y = (i / W) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
          const j = yy * W + xx
          if (mask[j] && lab[j] < 0) (lab[j] = id), stack.push(j)
        }
      }
      sizes.push(n)
    }
    return { lab, sizes }
  }
  const D = label(dark)
  const big = (W * H) / 400
  const outline = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) if (D.lab[i] >= 0 && D.sizes[D.lab[i]] > big) outline[i] = 1
  // the rest: the paper (what touches the edge), holes (paper-coloured, enclosed), fills (coloured, enclosed)
  // (the marker's pinholes closed for this: thickened a few pixels, so no letter leaks out into the paper)
  const R2 = 10
  const thick = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!outline[y * W + x]) continue
    for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
      if (dx * dx + dy * dy > R2 * R2) continue
      const xx = x + dx, yy = y + dy
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) thick[yy * W + xx] = 1
    }
  }
  const rest = thick.map((v) => 1 - v)
  const R = label(rest)
  const edge = new Set()
  for (let x = 0; x < W; x++) edge.add(R.lab[x]), edge.add(R.lab[(H - 1) * W + x])
  for (let y = 0; y < H; y++) edge.add(R.lab[y * W]), edge.add(R.lab[y * W + W - 1])
  // the paper's colour (the part on the edge) and each part's
  const sum = R.sizes.map(() => [0, 0, 0, 0])
  for (let i = 0; i < W * H; i++) {
    const l = R.lab[i]
    if (l < 0) continue
    const c = px(i)
    sum[l][0] += c[0]
    sum[l][1] += c[1]
    sum[l][2] += c[2]
    sum[l][3]++
  }
  const mean = sum.map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]])
  let paper = [0, 0, 0]
  let pn = 0
  for (const l of edge) if (l >= 0 && R.sizes[l] > big) (paper = paper.map((v, k) => v + mean[l][k] * R.sizes[l])), (pn += R.sizes[l])
  paper = paper.map((v) => v / pn)
  // the coloured-in parts: whichever enclosed part holds one of these points (the photo's pixels: inside the R, the i's
  // dot and stem, the n, the a; read off the photo by eye)
  const SEEDS = [[548, 480], [600, 337], [660, 352], [647, 480], [690, 470], [745, 420], [817, 405], [850, 520]]
  const fillLabels = new Set()
  for (const [sx, sy] of SEEDS) {
    const l = R.lab[Math.round((sy - box.y) * UP) * W + Math.round((sx - box.x) * UP)]
    if (l >= 0 && !edge.has(l)) fillLabels.add(l)
    else console.log('seed', sx, sy, l < 0 ? 'on the marker' : 'in the paper (a leak?)')
  }
  const fill = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) if (fillLabels.has(R.lab[i])) fill[i] = 1
  console.log('paper', paper.map(Math.round), 'fills', fillLabels.size, 'holes', R.sizes.filter((n, l) => !edge.has(l) && !fillLabels.has(l) && n >= big / 4).length)
  // the paths, in the crop's pixels at 1x
  const outlinePath = await traceMask(outline, W, H)
  const fillPath = await traceMask(fill, W, H)
  // her colours: the fills white-balanced (the paper to her paper's #f6f0e2), each colour spread out past its fill's
  // edge (so the edge, clipped, is clean), then small: a picture the poster stretches over the letters
  const target = [0xf6, 0xf0, 0xe2]
  const gain = target.map((t, k) => t / paper[k])
  const S = 8 // the colour picture: an eighth of the 4x crop (half the photo's own resolution)
  const cw = Math.ceil(W / S)
  const ch = Math.ceil(H / S)
  const col = new Float32Array(cw * ch * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!fill[i]) continue
      const c = px(i)
      const k = (((y / S) | 0) * cw + ((x / S) | 0)) * 4
      for (let j = 0; j < 3; j++) col[k + j] += Math.min(255, c[j] * gain[j])
      col[k + 3]++
    }
  for (let i = 0; i < cw * ch; i++) if (col[i * 4 + 3]) for (let j = 0; j < 3; j++) col[i * 4 + j] /= col[i * 4 + 3]
  // spread into the empty cells, a ring at a time
  for (let pass = 0; pass < 40; pass++) {
    const next = col.slice()
    let any = false
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const k = (y * cw + x) * 4
        if (col[k + 3]) continue
        let r = 0, g = 0, b = 0, n = 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy
          if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue
          const q = (yy * cw + xx) * 4
          if (col[q + 3]) (r += col[q]), (g += col[q + 1]), (b += col[q + 2]), n++
        }
        if (n) (next[k] = r / n), (next[k + 1] = g / n), (next[k + 2] = b / n), (next[k + 3] = 0.5), (any = true)
      }
    col.set(next)
    if (!any) break
  }
  const pic = new Jimp(cw, ch)
  for (let i = 0; i < cw * ch; i++) {
    // (a touch brighter and richer than the photo, which is dim)
    const c = [col[i * 4], col[i * 4 + 1], col[i * 4 + 2]]
    const m = (c[0] + c[1] + c[2]) / 3
    const out = c.map((v) => Math.max(0, Math.min(255, (m + (v - m) * 1.25) * 1.06)))
    pic.bitmap.data[i * 4] = out[0]
    pic.bitmap.data[i * 4 + 1] = out[1]
    pic.bitmap.data[i * 4 + 2] = out[2]
    pic.bitmap.data[i * 4 + 3] = 255
  }
  await pic.writeAsync(OUT + 'public/textures/rina-letters.png')
  fs.writeFileSync(
    OUT + 'src/components/poster/letters.ts',
    `/**
 * Her "Rina", traced off the photo of her desk (public/reference/room-desk-poster.jpg, the letters at x ${box.x}, y ${box.y},
 * ${box.w} × ${box.h} px), by scratch tooling (potrace): \`outline\` her marker, \`fill\` the parts she coloured in, both
 * SVG path data in a ${W} × ${H} frame; her colours are public/textures/rina-letters.png (${cw} × ${ch}, the same frame:
 * white-balanced to the poster's paper, spread a little past the fills so a clipped edge is clean).
 */
export const LETTERS = {
  w: ${W},
  h: ${H},
  colors: '/textures/rina-letters.png',
  outline: ${JSON.stringify(outlinePath)},
  fill: ${JSON.stringify(fillPath)},
}
`,
  )
  const prev = new Jimp(W, H, 0xffffffff); for (let i = 0; i < W * H; i++) prev.bitmap.data.writeUInt32BE(thick[i] ? (outline[i] ? 0x000000ff : 0x8888ffff) : fill[i] ? 0xff8080ff : edge.has(R.lab[i]) ? 0xffffffff : 0xccccccff, i * 4); await prev.scale(0.5).writeAsync('rina-letters-mask.png') // (to look at: the marker, the fills, the holes)
  // a preview: the colours under the fills, the outline over them
  console.log('outline', outlinePath.length, 'chars; fill', fillPath.length, 'chars; colours', cw, 'x', ch)
})()
