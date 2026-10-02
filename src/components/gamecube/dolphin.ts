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
