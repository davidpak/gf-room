import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * The mints' speckles (the cooling crystals), drawn. (The puck's lid and base are the maker's own
 * product shots: public/textures/icebreakers-*.webp.)
 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** the mints' speckles (the cooling crystals): green flecks on white, tiled every `tile` mm */
export function speckTexture(tile: number) {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const rand = rng(3)
  g.fillStyle = '#f7f7f2'
  g.fillRect(0, 0, N, N)
  const cols = ['#2f8f55', '#4aa86a', '#6cc58a', '#a3dcb5']
  for (let k = 0; k < 150; k++) {
    g.fillStyle = cols[Math.floor(rand() * cols.length)]
    g.globalAlpha = 0.7 + rand() * 0.3
    const x = rand() * N
    const y = rand() * N
    const w = 3 + rand() * 9
    const h = 2 + rand() * 6
    g.save()
    g.translate(x, y)
    g.rotate(rand() * Math.PI)
    g.fillRect(-w / 2, -h / 2, w, h)
    g.restore()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(1 / tile, 1 / tile) // (the mints' UVs are in mm)
  return t
}
