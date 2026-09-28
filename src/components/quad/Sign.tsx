import { useMemo } from 'react'
import { BoxGeometry, CanvasTexture, SRGBColorSpace, type Material } from 'three'
import { bruno } from './bruno'

/**
 * The grounds crew's little lawn sign by the cherries (from the photo): a board on a wire H-stake,
 * its face a close-up of blossom on a dusky purple, "DON'T CLIMB ON THE TREES" in white, a line
 * under it, the reason small below, the W in the corner. The face is painted into the board's
 * texture (not a sticker on it). Stands on the lawn with its feet at y = 0.
 */
export const SIGN = { w: 240, h: 176, t: 6, low: 128, stake: 3.5, apart: 150 }

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function faceTexture() {
  const W = 600
  const H = Math.round((W * SIGN.h) / SIGN.w)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  // the photo behind: dusky purple, lighter toward the blossom on the right
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#5f3f6e')
  bg.addColorStop(0.55, '#8a5f8e')
  bg.addColorStop(1, '#b98bab')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  const rand = rng(4)
  // soft out-of-focus blossom, then a few sharp flowers over the right half
  for (let i = 0; i < 26; i++) {
    const x = W * (0.35 + rand() * 0.7)
    const y = rand() * H
    const r = 20 + rand() * 50
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, 'rgba(255,236,242,0.45)')
    gr.addColorStop(1, 'rgba(255,236,242,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const flower = (x: number, y: number, r: number, rot: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    for (let p = 0; p < 5; p++) {
      g.rotate((Math.PI * 2) / 5)
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
      gr.addColorStop(0, '#f2b6c8')
      gr.addColorStop(0.35, '#fdeef2')
      gr.addColorStop(1, '#ffffff')
      g.fillStyle = gr
      g.beginPath()
      g.moveTo(0, 0)
      g.bezierCurveTo(-r * 0.6, -r * 0.3, -r * 0.65, -r, -r * 0.12, -r)
      g.lineTo(0, -r * 0.86)
      g.lineTo(r * 0.12, -r)
      g.bezierCurveTo(r * 0.65, -r, r * 0.6, -r * 0.3, 0, 0)
      g.fill()
    }
    g.fillStyle = '#c9577a'
    g.beginPath()
    g.arc(0, 0, r * 0.18, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#f5cf73'
    for (let s = 0; s < 7; s++) {
      g.beginPath()
      g.arc(Math.cos(s * 0.9) * r * 0.3, Math.sin(s * 0.9) * r * 0.3, r * 0.05, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
  }
  const flowers: [number, number, number][] = [
    [0.66, 0.2, 44],
    [0.8, 0.12, 36],
    [0.76, 0.42, 48],
    [0.6, 0.5, 34],
    [0.9, 0.36, 30],
    [0.7, 0.7, 38],
    [0.55, 0.26, 26],
    [0.86, 0.62, 28],
  ]
  for (const [fx, fy, r] of flowers) flower(W * fx, H * fy, r, rand() * Math.PI)
  // the words, down the left
  g.fillStyle = '#ffffff'
  g.textBaseline = 'top'
  g.font = '900 54px "Arial Black", "Helvetica Neue", Arial, sans-serif'
  ;["DON'T", 'CLIMB', 'ON THE', 'TREES'].forEach((line, i) => g.fillText(line, 26, 22 + i * 54))
  g.fillRect(28, 246, 64, 6)
  g.font = '700 17px "Helvetica Neue", Arial, sans-serif'
  ;['CLIMBING ON THE TREES', 'DESTROYS THEM. KEEP OUR', 'TREES ALIVE AND HEALTHY.'].forEach((line, i) => g.fillText(line, 28, 268 + i * 21))
  g.font = '700 13px "Helvetica Neue", Arial, sans-serif'
  g.fillText('— GROUNDS MANAGEMENT', 28, 336)
  // the W, bottom right
  g.font = '900 96px "Arial Black", "Helvetica Neue", Arial, sans-serif'
  g.textBaseline = 'alphabetic'
  g.fillText('W', W - 126, H - 30)
  // a faint sheen and the board's white edge
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 6
  g.strokeRect(3, 3, W - 6, H - 6)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

const FACE = typeof document !== 'undefined' ? bruno({ map: faceTexture(), shade: '#b7a6d6' }) : null
const BACK = bruno({ color: '#ece6ee', shade: '#b7a6d6' })
const WIRE = bruno({ color: '#9aa0a8' })

export function Sign() {
  const { board, mats } = useMemo(() => {
    const board = new BoxGeometry(SIGN.w, SIGN.h, SIGN.t)
    // (+x, −x, top, bottom, +z the face, −z the back)
    const mats: Material[] = [BACK, BACK, BACK, BACK, FACE!, BACK]
    return { board, mats }
  }, [])
  return (
    <group>
      <mesh geometry={board} material={mats} position={[0, SIGN.low + SIGN.h / 2, 0]} castShadow receiveShadow />
      {/* the wire H-stake: two legs up the back, a cross wire under the board */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={WIRE} position={[(s * SIGN.apart) / 2, (SIGN.low + SIGN.h * 0.8) / 2, -SIGN.t / 2 - SIGN.stake]} castShadow>
          <cylinderGeometry args={[SIGN.stake, SIGN.stake, SIGN.low + SIGN.h * 0.8, 8]} />
        </mesh>
      ))}
      <mesh material={WIRE} position={[0, SIGN.low - 20, -SIGN.t / 2 - SIGN.stake]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[SIGN.stake * 0.8, SIGN.stake * 0.8, SIGN.apart, 8]} />
      </mesh>
    </group>
  )
}
