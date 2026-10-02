import { useSyncExternalStore } from 'react'

/**
 * Real Melee on the TV: Dolphin (the GameCube emulator) running on this computer, its game window captured by the
 * browser's own screen sharing (getDisplayMedia: the person picks the window) and shown live on the CRT's glass
 * (./screen draws its frames, the tube's scanlines and warm-up over them). Nothing of the game is in the site: it's
 * whatever Dolphin is showing, here, now. Played with Dolphin's own controls (its Background Input on, so they work
 * while this page has the focus).
 *
 * The capture's asked for on a click (the browser insists); it ends when the sharing's stopped (the browser's own bar,
 * or here), and the TV goes back to our own screens.
 */
let stream: MediaStream | null = null
let video: HTMLVideoElement | null = null
const subs = new Set<() => void>()
const tell = () => subs.forEach((f) => f())

/** where the game's picture is in the captured window (in its pixels): found by looking out from the middle for the
 *  black bars Dolphin puts round it (and so stopping short of the window's title bar above them); looked for again
 *  twice a second, the window may be resized. Null till it's been found */
let crop: { x: number; y: number; w: number; h: number } | null = null
let cropAt = 0
const probe = typeof document !== 'undefined' ? document.createElement('canvas') : null
export function dolphinCrop(v: HTMLVideoElement) {
  const t = performance.now()
  if (crop && t - cropAt < 500) return crop
  cropAt = t
  const vw = v.videoWidth
  const vh = v.videoHeight
  if (!probe || !vw || !vh) return crop
  // (looked at small: 200 across)
  const pw = 200
  const ph = Math.max(1, Math.round((200 * vh) / vw))
  probe.width = pw
  probe.height = ph
  const g = probe.getContext('2d', { willReadFrequently: true })!
  g.drawImage(v, 0, 0, pw, ph)
  const d = g.getImageData(0, 0, pw, ph).data
  const lit = (x: number, y: number) => {
    const i = (y * pw + x) * 4
    return d[i] + d[i + 1] + d[i + 2] > 24 // (Dolphin's bars are pure black; a dark menu's edge isn't)
  }
  // a row (or column) is a bar when almost nothing in it, across the picture so far, is lit
  const rowBar = (y: number, x0: number, x1: number) => {
    let n = 0
    for (let x = x0; x <= x1; x++) if (lit(x, y)) n++
    return n <= (x1 - x0 + 1) * 0.02
  }
  const colBar = (x: number, y0: number, y1: number) => {
    let n = 0
    for (let y = y0; y <= y1; y++) if (lit(x, y)) n++
    return n <= (y1 - y0 + 1) * 0.02
  }
  let x0 = 0
  let x1 = pw - 1
  let y0 = 0
  let y1 = ph - 1
  const cx = pw >> 1
  const cy = ph >> 1
  for (let pass = 0; pass < 2; pass++) {
    let y = cy
    while (y > 0 && !rowBar(y - 1, x0, x1)) y--
    y0 = y
    y = cy
    while (y < ph - 1 && !rowBar(y + 1, x0, x1)) y++
    y1 = y
    let x = cx
    while (x > 0 && !colBar(x - 1, y0, y1)) x--
    x0 = x
    x = cx
    while (x < pw - 1 && !colBar(x + 1, y0, y1)) x++
    x1 = x
  }
  // no bar above it (the picture up against the title bar): the title bar trimmed as before, up to a tenth
  if (y0 === 0 && (x1 - x0 + 1) * 0.75 < y1 - y0 + 1) y0 = Math.round(Math.min((y1 + 1) - (x1 - x0 + 1) * 0.75, ph * 0.1))
  const k = vw / pw
  // (let out a pixel of the probe all round: better a hair of the bar than a hair of the picture lost)
  x0 = Math.max(0, x0 - 1)
  y0 = Math.max(0, y0 - 1)
  x1 = Math.min(pw - 1, x1 + 1)
  y1 = Math.min(ph - 1, y1 + 1)
  crop = { x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k }
  // (too small to be the game: a black screen, a fade; keep the whole window)
  if (crop.w < vw * 0.3 || crop.h < vh * 0.3) crop = { x: 0, y: 0, w: vw, h: vh }
  return crop
}

/** the captured window, playing, or null */
export const dolphinVideo = () => (video && video.readyState >= 2 ? video : null)
export const dolphinOn = () => !!stream
export const useDolphin = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), dolphinOn)

export async function connectDolphin() {
  if (stream) return
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60 }, width: { ideal: 1280 }, height: { ideal: 960 } },
    audio: false, // (Dolphin's sound plays from the computer already)
    // (a window, not this tab)
    ...({ selfBrowserSurface: 'exclude', surfaceSwitching: 'include', preferCurrentTab: false } as object),
  })
  const v = document.createElement('video')
  v.srcObject = s
  v.muted = true
  v.playsInline = true
  await v.play()
  s.getVideoTracks()[0]?.addEventListener('ended', disconnectDolphin)
  stream = s
  video = v
  tell()
}
export function disconnectDolphin() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  if (video) video.srcObject = null
  video = null
  tell()
}
