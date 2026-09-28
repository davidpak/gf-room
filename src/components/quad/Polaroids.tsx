import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type Group } from 'three'
import { photoSpots } from './layout'
import type { CarState } from './Car'

/**
 * Their photos, as polaroids on little wooden easels by the walks. Drive up to one and it lifts off
 * its easel and turns to you; press E (or click it) to look at it properly. The caption's only what
 * the back of a real one would say: the day, in handwriting.
 */
export type Photo = { id: string; src: string; thumb: string; w: number; h: number; taken: string | null }

/** the day a photo was taken, as it was in Seattle */
export const dayOf = (p: Photo) =>
  p.taken ? new Date(p.taken).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase() : ''

// which photo's near the car (for the hint, and E)
let near = -1
const subs = new Set<() => void>()
export const nearPhoto = {
  get: () => near,
  set(i: number) {
    if (i === near) return
    near = i
    subs.forEach((f) => f())
  },
}
export const useNearPhoto = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), nearPhoto.get)

const CARD = { w: 250 } // the polaroid's width (mm); its height follows the photo
const NEAR = 820
const HAND = "'Gaegu', 'Nunito', cursive"

/** a polaroid's face: the white card, the photo in it, the day written under it */
function cardTexture(p: Photo, img: HTMLImageElement) {
  const W = 600
  const side = 34
  const iw = W - 2 * side
  const ih = Math.round(iw / Math.max(0.6, Math.min(1.4, p.w / p.h)))
  const H = side + ih + 150
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#fbf8f2'
  g.fillRect(0, 0, W, H)
  // the photo, filling its window
  const k = Math.max(iw / img.width, ih / img.height)
  g.save()
  g.beginPath()
  g.rect(side, side, iw, ih)
  g.clip()
  g.drawImage(img, side + (iw - img.width * k) / 2, side + (ih - img.height * k) / 2, img.width * k, img.height * k)
  g.restore()
  g.fillStyle = '#5a4d5c'
  g.font = `700 44px ${HAND}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(dayOf(p), W / 2, side + ih + 75)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return { t, aspect: H / W }
}

const WHITE = new MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.7 })
const WOOD = new MeshStandardMaterial({ color: '#c79a6b', roughness: 0.8 })

function Polaroid({ photo, i, spot, car, onOpen }: { photo: Photo; i: number; spot: { x: number; z: number; yaw: number }; car: { current: CarState }; onOpen: (i: number) => void }) {
  const [face, setFace] = useState<{ t: CanvasTexture; aspect: number } | null>(null)
  useEffect(() => {
    const img = new Image()
    img.onload = () => document.fonts.load(`700 44px 'Gaegu'`).finally(() => setFace(cardTexture(photo, img)))
    img.src = photo.thumb.replace('.t.webp', '.webp')
  }, [photo])
  const h = CARD.w * (face?.aspect ?? 1.6)
  const geo = useMemo(() => new BoxGeometry(CARD.w, h, 4), [h])
  const mats = useMemo(() => (face ? [WHITE, WHITE, WHITE, WHITE, new MeshStandardMaterial({ map: face.t, roughness: 0.6 }), WHITE] : WHITE), [face])
  const card = useRef<Group>(null)
  const lift = useRef(0)
  useFrame((_, dt) => {
    const c = car.current
    const d = Math.hypot(c.x - spot.x, c.z - spot.z)
    const close = d < NEAR
    if (close && (nearPhoto.get() < 0 || nearPhoto.get() === i)) nearPhoto.set(i)
    else if (!close && nearPhoto.get() === i) nearPhoto.set(-1)
    lift.current += ((close ? 1 : 0) - lift.current) * Math.min(1, dt * 5)
    const g = card.current
    if (!g) return
    const k = lift.current
    const e = k * k * (3 - 2 * k)
    // off the easel, up and upright, turned a little toward the camera, a touch bigger
    g.position.set(0, 250 + h / 2 + e * 230 + Math.sin(performance.now() / 600 + i) * 6 * e, 30 * e)
    g.rotation.set(-0.2 * (1 - e), e * 0.25 * Math.sin(spot.yaw), 0)
    g.scale.setScalar(1 + 0.35 * e)
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onOpen(i)
  }
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, spot.yaw, 0]}>
      {/* the easel: two legs, a ledge, a prop behind */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={WOOD} position={[s * 80, 150, 0]} rotation={[-0.2, 0, s * -0.08]} castShadow>
          <boxGeometry args={[16, 310, 16]} />
        </mesh>
      ))}
      <mesh material={WOOD} position={[0, 250, 22]} castShadow>
        <boxGeometry args={[200, 12, 24]} />
      </mesh>
      <mesh material={WOOD} position={[0, 140, -60]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[14, 290, 14]} />
      </mesh>
      <group ref={card} onClick={click} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <mesh geometry={geo} material={mats} castShadow receiveShadow />
      </group>
    </group>
  )
}

export function Polaroids({ photos, car, onOpen }: { photos: Photo[]; car: { current: CarState }; onOpen: (i: number) => void }) {
  const spots = useMemo(() => photoSpots(photos.length), [photos.length])
  return (
    <>
      {spots.map((s, i) => (
        <Polaroid key={photos[i].id} photo={photos[i]} i={i} spot={s} car={car} onOpen={onOpen} />
      ))}
    </>
  )
}

/** the easels, for the car to bump into */
export const easelObstacles = (n: number) => photoSpots(n).map((s) => ({ kind: 'circle' as const, x: s.x, z: s.z, r: 110 }))
