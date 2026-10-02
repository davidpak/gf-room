import { useEffect, useMemo, useState } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { CylinderGeometry, DoubleSide, RingGeometry, type Texture } from 'three'
import { bruno } from '../quad/bruno'
import { canvasTexture, loadImage } from './anchors'
import { DISC } from './spec'

/**
 * Super Smash Bros. Melee's disc [D]: an 8 cm mini DVD, its label up (the photo of the real one, cut round, when it's
 * here: public/textures/melee, kept out of the repository; else our own drawing of it), its silver data side under,
 * its edge. Lying in its frame's xz plane, its label's top toward -z, its bottom at y 0.
 */
const R = DISC.r
const label = (() => {
  let t: Texture | null = null
  return () => {
    if (t) return t
    // (drawn first, the photo laid over it once it's loaded)
    t = canvasTexture(512, 512, (g) => {
      const c = 256
      const r = 256
      g.save()
      g.beginPath()
      g.arc(c, c, r, 0, Math.PI * 2)
      g.clip()
      g.fillStyle = '#cf2b2b'
      g.fillRect(0, 0, 512, 512)
      // the emblem, dark quarters on the red
      g.fillStyle = '#7d1717'
      const e = 190
      g.beginPath()
      g.arc(c, c - 30, e, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#cf2b2b'
      g.fillRect(c + e * 0.2 - 16, 0, 32, 512)
      g.fillRect(0, c - 30 + e * 0.22 - 16, 512, 32)
      g.fillStyle = '#141414'
      g.fillRect(0, 340, 512, 172)
      g.fillStyle = '#ffffff'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = "bold 46px Georgia, 'Times New Roman', serif"
      g.lineWidth = 6
      g.strokeStyle = '#3a0a0a'
      g.strokeText('SUPER', c, 118)
      g.fillText('SUPER', c, 118)
      g.font = "bold 40px Georgia, 'Times New Roman', serif"
      g.strokeText('SMASH BROS.', c, 166)
      g.fillText('SMASH BROS.', c, 166)
      g.font = "italic 900 30px 'Arial Black', Arial, sans-serif"
      g.strokeText('Melee', c, 208)
      g.fillText('Melee', c, 208)
      g.font = "bold 26px Arial, sans-serif"
      g.fillText('NINTENDO GAMECUBE', c, 392)
      g.restore()
    })
    const tex = t
    void loadImage('/textures/melee/disc.webp').then((im) => {
      if (!im) return
      const g = (tex.image as HTMLCanvasElement).getContext('2d')!
      // (the disc in the photo: its middle and radius, in its pixels)
      const k = im.width / 900
      const cx = 436 * k
      const cy = 462 * k
      const r = 276 * k
      g.save()
      g.beginPath()
      g.arc(256, 256, 256, 0, Math.PI * 2)
      g.clip()
      g.drawImage(im, cx - r, cy - r, 2 * r, 2 * r, 0, 0, 512, 512)
      g.restore()
      tex.needsUpdate = true
    })
    return t
  }
})()
const data = (() => {
  let t: Texture | null = null
  return () =>
    (t ??= canvasTexture(256, 256, (g) => {
      const f = g.createConicGradient(0, 128, 128)
      ;['#d9dce6', '#e9d9f2', '#d6ecf3', '#e8f0d6', '#f3e2d2', '#d9dce6'].forEach((col, i, a) => f.addColorStop(i / (a.length - 1), col))
      g.fillStyle = f
      g.fillRect(0, 0, 256, 256)
    }))
})()
const EDGE = bruno({ color: '#d7d9e2', shade: '#8d8fa3' })
const HUB = bruno({ color: '#e6e8ef', shade: '#9a9cb0', transparent: true, opacity: 0.85 })
const TOP = new RingGeometry(DISC.hole + 9, R, 72, 1).rotateX(-Math.PI / 2)
const HUBRING = new RingGeometry(DISC.hole, DISC.hole + 9, 48, 1).rotateX(-Math.PI / 2)
const UNDER = new RingGeometry(DISC.hole, R, 72, 1).rotateX(Math.PI / 2)
const RIM = new CylinderGeometry(R, R, DISC.t, 72, 1, true)

export function Disc({ onClick }: { onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const [mats, setMats] = useState<{ top: ReturnType<typeof bruno>; under: ReturnType<typeof bruno> } | null>(null)
  useEffect(() => setMats({ top: bruno({ map: label() }), under: bruno({ map: data(), shade: '#9a9cb0', sheen: 0.6, side: DoubleSide }) }), [])
  const over = useMemo(
    () =>
      onClick
        ? {
            onClick: (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onClick(e)
            },
            onPointerOver: (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            },
            onPointerOut: () => (document.body.style.cursor = ''),
          }
        : {},
    [onClick],
  )
  if (!mats) return null
  return (
    <group {...over}>
      <mesh geometry={TOP} material={mats.top} position={[0, DISC.t, 0]} castShadow />
      <mesh geometry={HUBRING} material={HUB} position={[0, DISC.t, 0]} />
      <mesh geometry={UNDER} material={mats.under} />
      <mesh geometry={RIM} material={EDGE} position={[0, DISC.t / 2, 0]} />
    </group>
  )
}
