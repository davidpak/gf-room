import { loggedIn } from '../../lib/spotify/auth'
import { play } from '../../lib/spotify/api'
import { deviceReady, getPlayer, positionNow, sdk, startPlayer } from '../../lib/spotify/player'
import { getDeck, sideUp, type OnPlatter } from './deck'
import { angleFor, radiusAtAngle } from './victrola'
import { LEAD_IN, atRadius, radiusAt, sizeOf, type Side } from './vinyl'

/**
 * The needle and the music, kept together. Where the needle comes down (a radius on the side up) is a song and a
 * point in it (./vinyl atRadius); Spotify's told to play the album from there (on this page: its Web Playback SDK),
 * and from then on the needle follows what Spotify says (the song, the time), so the arm creeps inward as the song
 * goes, jumps the gap to the next song, and at the end of the side runs into the run-out and the music stops (the
 * album's next song is on the other side: turn it over). Lifted, the music pauses; put down elsewhere, it plays from
 * there.
 *
 * A record that isn't from Spotify (the made-up ones), or before Spotify's caught up: the needle keeps its own time.
 * At the end of a side it says so (`ended`), and ./changer turns the record over.
 */
export const needle = {
  /** in a song's groove, the record turning under it */
  playing: false,
  band: 0,
  ms: 0,
  /** off the end of the side: sat in the run-out */
  runout: false,
  /** …got there by playing to the end of the side (not set down there): the changer turns the record over */
  ended: false,
  /** Spotify's playing this record for us (since when: its first state may still be the last one's) */
  spotify: false,
  since: 0,
}
let ask = 0 // (each drop a fresh ask: an answer to an old one is let go)
const playable = (o: OnPlatter) => o.p.uri.startsWith('spotify:') && !o.p.uri.endsWith(':demo') && loggedIn()

/** the needle's come down */
export function drop() {
  const d = getDeck()
  if (!d.on || !d.power) return
  const side = sideUp(d.on)
  const r = radiusAtAngle(d.arm.a)
  const at = atRadius(side, r)
  needle.runout = false
  if (!at) {
    // (the label's edge, the run-out, past the edge: silence)
    needle.playing = false
    needle.runout = r < (side.end ?? 0) + 0.5 && r > 0
    return
  }
  needle.playing = true
  needle.band = at.band
  needle.ms = at.ms
  needle.spotify = false
  if (playable(d.on)) void spotify(d.on, side, at.band, at.ms)
}

async function spotify(o: OnPlatter, side: Side, band: number, ms: number) {
  const mine = ++ask
  try {
    await startPlayer(getDeck().volume)
    const dev = await deviceReady()
    if (mine !== ask || !needle.playing) return
    const b = side.bands[band]
    // (a single: the song itself; an album: the album, from this song: so it carries on to the next by itself)
    await play(dev, o.p.size === 'single' ? (b.uri ?? o.p.uri) : o.p.uri, { track: b.track, uri: b.uri, ms: Math.round(ms) })
    if (mine !== ask) return
    needle.spotify = true
    needle.since = performance.now()
  } catch (e) {
    console.warn('turntable: Spotify', e)
  }
}

/** the needle's lifted (or the power's off): the music stops where it is */
export function lift() {
  ask++
  if (needle.spotify) void sdk()?.pause()
  needle.spotify = false
  needle.playing = false
}

/** each frame: the needle moves on (by Spotify's word, or its own clock); returns where the arm should be */
export function tick(dt: number): number | null {
  const d = getDeck()
  if (!d.on) return null
  const side = sideUp(d.on)
  if (needle.runout) return angleFor(sizeOf(d.on.p).label + 3) // (the run-out spirals it in to the lock groove by the label)
  if (!needle.playing) return null
  const s = getPlayer()
  const fresh = needle.spotify && performance.now() - needle.since > 600 // (Spotify's own word, once it's had time)
  if (fresh && s.track) {
    const k = side.bands.findIndex((b) => b.uri === s.track!.uri)
    if (k < 0) {
      // the album's gone on past this side: the needle's in the run-out, the music stops
      void sdk()?.pause()
      needle.spotify = false
      needle.playing = false
      needle.runout = true
      needle.ended = true
      return angleFor(sizeOf(d.on.p).label + 3) // (the run-out spirals it in to the lock groove by the label)
    }
    needle.band = k
    needle.ms = positionNow(s)
    // (the side's last song about to end: stop before Spotify moves on to the other side's first)
    if (k === side.bands.length - 1 && !s.paused && s.duration - needle.ms < 350) {
      void sdk()?.pause()
      needle.spotify = false
      needle.playing = false
      needle.runout = true
      needle.ended = true
    }
  } else if (!needle.spotify || !fresh) {
    needle.ms += dt * 1000
    const b = side.bands[needle.band]
    if (needle.ms >= b.ms) {
      if (needle.band < side.bands.length - 1 && !needle.spotify) {
        needle.band++
        needle.ms = 0
      } else if (!needle.spotify) {
        needle.playing = false
        needle.runout = true
        needle.ended = true
      } else needle.ms = b.ms
    }
  }
  return angleFor(radiusAt(side, needle.band, needle.ms))
}

/** the song the needle's in, for the display; null between them */
export const songNow = () => (needle.playing ? needle.band + 1 : null)

/** where the songs start on the side up: the arm's angles (for the ⏮ ⏭ buttons) */
export function bandStarts(side: Side) {
  return side.bands.map((b, i) => angleFor(i === 0 ? b.r0 + LEAD_IN * 0.5 : b.r0 + 0.4))
}
