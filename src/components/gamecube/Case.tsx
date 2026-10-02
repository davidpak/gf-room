import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group, type Texture } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { bruno } from '../quad/bruno'
import { anchor, canvasTexture, loadImage } from './anchors'
import { Disc } from './Disc'
import { CASE } from './spec'
import { getCube, moveDisc, toggleCase, useCube } from './state'

/**
 * Melee's case [K], lying on its back: closed, its cover up under the sleeve (the real cover art when it's here,
 * public/textures/melee, kept out of the repository; else our own drawing of it); clicked, it opens, its front swung
 * over flat on its spine, the inside showing: the hub the disc snaps onto (with the disc on it, when it's here: a
 * click on it, the console's lid up, puts it back), the clips for the manual. Its frame: the origin under its
 * middle, its top toward -z.
 */
const { w: W, h: H, t: T } = CASE
const HALF = T / 2
const PX = 4

let cover: Texture | null = null
function coverTexture() {
  if (cover) return cover
  const tex = canvasTexture(W * PX, H * PX, (g) => {
    const w = W * PX
    const h = H * PX
    g.fillStyle = '#121216'
    g.fillRect(0, 0, w, h)
    const x0 = 4 * PX
    const y0 = 4 * PX
    const iw = w - 8 * PX
    const ih = h - 8 * PX
    const sky = g.createLinearGradient(0, y0, 0, y0 + ih)
    sky.addColorStop(0, '#7fb2e8')
    sky.addColorStop(1, '#f2c49a')
    g.fillStyle = sky
    g.fillRect(x0, y0, iw, ih)
    g.fillStyle = '#0c0c10'
    g.fillRect(x0, y0, iw, 26 * PX)
    g.fillStyle = '#e9e9f0'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `bold ${8 * PX}px Arial, sans-serif`
    g.fillText('NINTENDO GAMECUBE', w / 2, y0 + 13 * PX)
    g.lineJoin = 'round'
    g.font = `bold ${15 * PX}px Georgia, serif`
    g.strokeStyle = '#5a0d12'
    g.lineWidth = 3 * PX
    g.strokeText('SUPER', w / 2, y0 + 50 * PX)
    g.fillStyle = '#f2f2f2'
    g.fillText('SUPER', w / 2, y0 + 50 * PX)
    g.font = `bold ${12 * PX}px Georgia, serif`
    g.strokeText('SMASH BROS.', w / 2, y0 + 68 * PX)
    g.fillText('SMASH BROS.', w / 2, y0 + 68 * PX)
    g.font = `italic 900 ${11 * PX}px 'Arial Black', Arial, sans-serif`
    g.strokeStyle = '#1a2450'
    g.strokeText('Melee', w / 2, y0 + 86 * PX)
    g.fillStyle = '#ffffff'
    g.fillText('Melee', w / 2, y0 + 86 * PX)
    g.fillStyle = 'rgba(255,255,255,0.75)'
    g.beginPath()
    g.arc(w / 2, y0 + 135 * PX, 28 * PX, 0, Math.PI * 2)
    g.fill()
  })
  cover = tex
  void loadImage('/textures/melee/cover.webp').then((im) => {
    if (!im) return
    const g = (tex.image as HTMLCanvasElement).getContext('2d')!
    g.drawImage(im, 4 * PX, 4 * PX, (W - 8) * PX, (H - 8) * PX)
    tex.needsUpdate = true
  })
  return tex
}
const inside = (manual: boolean) =>
  canvasTexture(W * PX, H * PX, (g) => {
    const w = W * PX
    const h = H * PX
    g.fillStyle = '#26252c'
    g.fillRect(0, 0, w, h)
    if (manual) {
      // (this face is seen once it's swung over: drawn upside down)
      g.translate(0, h)
      g.scale(1, -1)
      // the manual's clips
      g.fillStyle = '#3a3942'
      g.fillRect(w * 0.08, h * 0.12, w * 0.14, h * 0.06)
      g.fillRect(w * 0.08, h * 0.82, w * 0.14, h * 0.06)
      g.fillStyle = '#e9e5da'
      g.fillRect(w * 0.18, h * 0.16, w * 0.64, h * 0.68)
      g.fillStyle = '#c7c1b3'
      g.font = `bold ${7 * PX}px Arial, sans-serif`
      g.textAlign = 'center'
      g.fillText('INSTRUCTION BOOKLET', w / 2, h * 0.5)
    } else {
      // the hub the disc snaps onto
      g.strokeStyle = '#4a4952'
      g.lineWidth = 3 * PX
      g.beginPath()
      g.arc(w / 2, h / 2, 41 * PX, 0, Math.PI * 2)
      g.stroke()
      g.fillStyle = '#3c3b44'
      g.beginPath()
      g.arc(w / 2, h / 2, 14 * PX, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#5c5b66'
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        g.beginPath()
        g.arc(w / 2 + Math.cos(a) * 9 * PX, h / 2 + Math.sin(a) * 9 * PX, 2.2 * PX, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
const SHELL = new RoundedBoxGeometry(W, HALF, H, 2, 2)
const BLACK = bruno({ color: '#18171c', shade: '#0d0c10' })

export function Case({ open: forced }: { open?: boolean }) {
  const c = useCube()
  const mats = useMemo(() => {
    const cov = bruno({ map: coverTexture() })
    const manual = bruno({ map: inside(true) })
    const hub = bruno({ map: inside(false) })
    // (box faces: +x, -x, +y, -y, +z, -z)
    return { base: [BLACK, BLACK, hub, BLACK, BLACK, BLACK], front: [BLACK, BLACK, cov, manual, BLACK, BLACK] }
  }, [])
  const hinge = useRef<Group>(null)
  const a = useRef(0)
  useFrame((_, dt) => {
    const g = hinge.current
    if (!g) return
    const want = (forced ?? getCube().caseOpen) ? Math.PI : 0
    a.current += (want - a.current) * Math.min(1, dt * 9)
    g.rotation.z = a.current
  })
  const click = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    toggleCase()
  }
  const over = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => (document.body.style.cursor = ''),
  }
  return (
    <group>
      <mesh geometry={SHELL} material={mats.base} position={[0, HALF / 2, 0]} castShadow receiveShadow onClick={click} {...over} />
      <group ref={anchor('seat-case')} position={[0, HALF - 0.9, 0]} userData={{ live: true }}>
        {c.disc === 'case' && <Disc onClick={moveDisc} />}
      </group>
      <group ref={hinge} position={[-W / 2, HALF, 0]} userData={{ live: true }}>
        <mesh geometry={SHELL} material={mats.front} position={[W / 2, HALF / 2, 0]} castShadow receiveShadow onClick={click} {...over} />
      </group>
    </group>
  )
}
