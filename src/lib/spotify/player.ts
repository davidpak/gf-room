import { useSyncExternalStore } from 'react'
import { accessToken } from './auth'

/**
 * This page as a Spotify speaker: the Web Playback SDK (Premium only) makes a Spotify Connect device in the browser
 * ("Rina's turntable"), which the Web API is then told to play on (./api play). Full songs, the browser's own audio
 * (DRM'd: nothing of it can be read to dance to). One player for the whole site, made on first use.
 */
type SdkState = {
  paused: boolean
  position: number
  duration: number
  track_window: { current_track: { uri: string; name: string; artists: { name: string }[]; album: { uri: string; name: string; images: { url: string }[] } } | null }
  context: { uri: string | null }
}
type SdkPlayer = {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(ev: string, f: (x: never) => void): void
  activateElement(): Promise<void>
  getCurrentState(): Promise<SdkState | null>
  pause(): Promise<void>
  resume(): Promise<void>
  togglePlay(): Promise<void>
  seek(ms: number): Promise<void>
  setVolume(v: number): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void
    Spotify?: { Player: new (o: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number }) => SdkPlayer }
  }
}

export type PlayerSnap = {
  status: 'off' | 'loading' | 'ready' | 'error'
  device: string | null
  error: string
  paused: boolean
  /** ms into the track when `at` was read (performance.now()); add the time since while playing */
  position: number
  at: number
  duration: number
  track: SdkState['track_window']['current_track']
  context: string | null
}
let snap: PlayerSnap = { status: 'off', device: null, error: '', paused: true, position: 0, at: 0, duration: 0, track: null, context: null }
const subs = new Set<() => void>()
const set = (p: Partial<PlayerSnap>) => {
  snap = { ...snap, ...p }
  subs.forEach((f) => f())
}
export const getPlayer = () => snap
export const usePlayer = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getPlayer)
/** where the track is now, in ms */
export const positionNow = (s = snap) => Math.min(s.duration, s.position + (s.paused ? 0 : performance.now() - s.at))

let player: SdkPlayer | null = null
let starting: Promise<SdkPlayer> | null = null

function loadSdk() {
  if (window.Spotify) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const s = document.createElement('script')
    s.src = 'https://sdk.scdn.co/spotify-player.js'
    s.onerror = () => reject(new Error("couldn't load Spotify's player"))
    document.head.appendChild(s)
  })
}

/** the player, made and connected (its device id in the snap once it's ready). Call from a click the first time:
 *  browsers only let a page start sound after one */
export function startPlayer(volume = 0.6) {
  starting ??= (async () => {
    set({ status: 'loading', error: '' })
    await loadSdk()
    const p = new window.Spotify!.Player({
      name: "Rina's turntable",
      volume,
      getOAuthToken: (cb) => void accessToken().then((t) => t && cb(t)),
    })
    p.addListener('ready', ({ device_id }: { device_id: string }) => set({ status: 'ready', device: device_id }))
    p.addListener('not_ready', () => set({ device: null }))
    p.addListener('player_state_changed', (s: SdkState | null) =>
      set(
        s
          ? { paused: s.paused, position: s.position, at: performance.now(), duration: s.duration, track: s.track_window.current_track, context: s.context.uri }
          : { paused: true, track: null, context: null },
      ),
    )
    const fail = (what: string) => ({ message }: { message: string }) => set({ status: 'error', error: `${what}: ${message}` })
    p.addListener('initialization_error', fail("this browser can't play Spotify"))
    p.addListener('authentication_error', fail('Spotify login'))
    p.addListener('account_error', fail('Spotify Premium is needed to play here'))
    p.addListener('playback_error', fail('playback'))
    await p.activateElement() // (the click that started this lets it make sound)
    if (!(await p.connect())) throw new Error("couldn't connect to Spotify")
    player = p
    return p
  })().catch((e) => {
    starting = null
    set({ status: 'error', error: String((e as Error).message ?? e) })
    throw e
  })
  return starting
}

export const sdk = () => player

/** the device id, once the player has said it is ready */
export function deviceReady() {
  return new Promise<string>((resolve, reject) => {
    const t0 = performance.now()
    const look = () => {
      if (snap.device) return resolve(snap.device)
      if (snap.status === 'error') return reject(new Error(snap.error))
      if (performance.now() - t0 > 15000) return reject(new Error('Spotify’s player didn’t come up'))
      setTimeout(look, 150)
    }
    look()
  })
}
