import { play, sp } from '../../lib/spotify/api'
import { loggedIn } from '../../lib/spotify/auth'
import { deviceReady, sdk, startPlayer } from '../../lib/spotify/player'

/**
 * A song while she reads her friends' notes (./Poster): opening the board starts it through her Spotify (once she's
 * logged in, at the Quad's record stand; Premium plays in the page), coming in softly, over and over while she
 * reads; leaving the board, it fades and stops. Not logged in, or no Premium: the board's just quiet.
 */
export const SONG = 'https://open.spotify.com/track/7N05mAG1X23Sd2PNOyoJSF' // (David's pick; a track's link or its spotify:track: URI)
const VOLUME = 0.55
const FADE_IN = 2.5 // s
const FADE_OUT = 1.2 // s

const uri = (s: string) => {
  const id = s.match(/track[:/]([A-Za-z0-9]{22})/)?.[1]
  return id ? `spotify:track:${id}` : null
}
let on = false
let device = ''
/** the song over again at its end (or not: the turntable's records play on through their sides) */
const repeat = (state: 'track' | 'off') => device && sp<void>(`/me/player/repeat?state=${state}&device_id=${device}`, { method: 'PUT' }).catch(() => {})
let fade = 0
/** the volume eased from where it is to `to` over `secs` (then `done`) */
function ease(to: number, secs: number, done?: () => void) {
  cancelAnimationFrame(fade)
  const p = sdk()
  if (!p) return done?.()
  const t0 = performance.now()
  void p.getVolume().then((from) => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000))
      void p.setVolume(Math.max(0.0001, from + (to - from) * k))
      if (k < 1) fade = requestAnimationFrame(step)
      else done?.()
    }
    step()
  })
}

/** the board opened (from her click: a browser lets a page start sound only then) */
export async function startSong() {
  const track = uri(SONG)
  if (on || !track || !loggedIn()) return
  on = true
  try {
    await startPlayer(0.0001)
    device = await deviceReady()
    if (!on) return
    await sdk()?.setVolume(0.0001)
    await play(device, track)
    void repeat('track')
    if (on) ease(VOLUME, FADE_IN)
  } catch (e) {
    on = false
    console.warn('the board’s song', e)
  }
}

/** the board left */
export function stopSong() {
  if (!on) return
  on = false
  ease(0.0001, FADE_OUT, () => {
    if (on) return
    void sdk()?.pause()
    void repeat('off')
  })
}
