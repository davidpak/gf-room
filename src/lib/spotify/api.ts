import { accessToken } from './auth'

/**
 * The bits of Spotify's Web API the turntable needs: who she is (Premium or not), search, an album with its tracks
 * (their lengths draw the record's grooves), her saved albums, and starting / stopping playback on a device.
 */
export type Image = { url: string; width: number; height: number }
export type Track = { id: string; uri: string; name: string; track_number: number; disc_number: number; duration_ms: number; artists: { name: string }[] }
export type Album = {
  id: string
  uri: string
  name: string
  album_type: string
  release_date: string
  artists: { id: string; name: string }[]
  images: Image[]
  total_tracks: number
  tracks?: { items: Track[]; next: string | null }
}
export type Me = { id: string; display_name: string; product: string; country: string }

/**
 * Asking Spotify, gently. An app in development mode has a small allowance of asks (past it: 429, "Too many
 * requests", every ask refused for a while), so:
 *   remembered  what's asked is kept (in memory, and in this browser for next time): an album for a week, her
 *               listening for an hour, a search for a day; asked again inside that, it isn't asked
 *   one at a time   a little apart; the same ask while it's out waits for that one's answer
 *   told to wait    a 429 holds every ask for as long as Spotify says (Retry-After), then that ask once more; a long
 *               wait isn't waited out: the ask fails, saying so (`SpotifyResting`)
 */
const DAY = 24 * 3600_000
const ttlFor = (path: string) =>
  path.startsWith('/albums/') ? 7 * DAY
  : path.startsWith('/me/top/') || path.startsWith('/me/albums') || path.startsWith('/me/playlists') ? 3600_000
  : path.startsWith('/me/player/recently') ? 600_000
  : path.startsWith('/search') || path.startsWith('/playlists/') || path.startsWith('/artists/') ? DAY
  : 0
const STORE = 'spotify.ask.'
const mem = new Map<string, { at: number; v: unknown }>()
function recall(path: string): unknown {
  const ttl = ttlFor(path)
  if (!ttl) return undefined
  let e = mem.get(path)
  if (!e) {
    try {
      const s = localStorage.getItem(STORE + path)
      if (s) mem.set(path, (e = JSON.parse(s)))
    } catch {
      /* (no storage: memory only) */
    }
  }
  return e && Date.now() - e.at < ttl ? e.v : undefined
}
function remember(path: string, v: unknown) {
  if (!ttlFor(path)) return
  const e = { at: Date.now(), v }
  mem.set(path, e)
  try {
    localStorage.setItem(STORE + path, JSON.stringify(e))
  } catch {
    // (full: the oldest remembered asks go, then try once more)
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORE))
      keys.sort((a, b) => (JSON.parse(localStorage.getItem(a)!).at ?? 0) - (JSON.parse(localStorage.getItem(b)!).at ?? 0))
      keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => localStorage.removeItem(k))
      localStorage.setItem(STORE + path, JSON.stringify(e))
    } catch {
      /* (memory only) */
    }
  }
}
export class SpotifyResting extends Error {}
let line: Promise<unknown> = Promise.resolve()
let restUntil = 0
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const out = new Map<string, Promise<unknown>>()

export async function sp<T>(path: string, init: RequestInit = {}): Promise<T> {
  const get = !init.method || init.method === 'GET'
  if (get) {
    const v = recall(path)
    if (v !== undefined) return v as T
    const pending = out.get(path)
    if (pending) return pending as Promise<T>
  }
  const ask = async (): Promise<T> => {
    if (Date.now() < restUntil) throw new SpotifyResting(`Spotify's resting: ${Math.ceil((restUntil - Date.now()) / 60000)} min`)
    for (let tries = 0; ; tries++) {
      const t = await accessToken()
      if (!t) throw new Error('not logged in to Spotify')
      const r = await fetch(path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`, {
        ...init,
        headers: { authorization: `Bearer ${t}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
      })
      if (r.status === 429) {
        const wait = Math.max(1, Number(r.headers.get('retry-after')) || 30) * 1000
        restUntil = Date.now() + wait
        if (wait > 20_000 || tries) throw new SpotifyResting(`Spotify's resting: ${Math.ceil(wait / 60000)} min`)
        await pause(wait)
        continue
      }
      if (r.status === 204) return undefined as T
      if (!r.ok) throw new Error(`Spotify ${path.split('?')[0]}: ${r.status} ${await r.text()}`)
      const text = await r.text()
      const v = (text ? JSON.parse(text) : undefined) as T
      if (get) remember(path, v)
      return v
    }
  }
  // (in line behind the others, a little apart; a play or a pause doesn't wait behind the crates' asks)
  const p = get ? (line = line.then(() => pause(120)).then(ask, ask)) : ask()
  if (get) {
    out.set(path, p)
    p.finally(() => out.delete(path)).catch(() => {})
  }
  return p as Promise<T>
}

export const me = () => sp<Me>('/me')

export async function search(q: string) {
  const r = await sp<{ albums: { items: Album[] }; tracks: { items: (Track & { album: Album })[] } }>(
    `/search?${new URLSearchParams({ q, type: 'album,track', limit: '10' })}`,
  )
  return { albums: r.albums.items.filter(Boolean), tracks: r.tracks.items.filter(Boolean) }
}

/** an album with all its tracks (past the first page, for long ones) */
export async function album(id: string) {
  const a = await sp<Album>(`/albums/${id}`)
  const items = [...(a.tracks?.items ?? [])]
  let next = a.tracks?.next ?? null
  while (next) {
    const p = await sp<{ items: Track[]; next: string | null }>(next)
    items.push(...p.items)
    next = p.next
  }
  return { ...a, tracks: { items, next: null } }
}

/** albums by id, with their tracks: twenty to an ask, or (where Spotify won't, as it doesn't for apps still in
 *  development mode since 2026) one at a time, a few at once */
let batchOk = true
export async function albums(ids: string[]) {
  if (batchOk) {
    try {
      const out: Album[] = []
      for (let i = 0; i < ids.length; i += 20) {
        const r = await sp<{ albums: (Album | null)[] }>(`/albums?ids=${ids.slice(i, i + 20).join(',')}`)
        out.push(...r.albums.filter((a): a is Album => !!a))
      }
      return out
    } catch (e) {
      console.warn('Spotify: albums in one ask refused, one at a time instead', e)
      batchOk = false
    }
  }
  const out: (Album | null)[] = new Array(ids.length).fill(null)
  let next = 0
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < ids.length) {
        const i = next++
        out[i] = await album(ids[i]).catch((e) => (console.warn('Spotify: album', ids[i], e), null))
      }
    }),
  )
  return out.filter((a): a is Album => !!a)
}
/** the albums of some songs, each once, in order */
const uniqueAlbums = (tracks: { album: Album }[], n: number) => {
  const seen = new Set<string>()
  return tracks.map((t) => t.album).filter((a) => a && !seen.has(a.id) && seen.add(a.id)).slice(0, n)
}

/** her most played (short_term: about the last 4 weeks; medium_term: 6 months; long_term: about a year), as their
 *  albums (as Spotify gives them with the songs: no track lists: those are asked for when a record's taken out) */
export async function topAlbums(range: 'short_term' | 'medium_term' | 'long_term', n = 12) {
  const r = await sp<{ items: (Track & { album: Album })[] }>(`/me/top/tracks?time_range=${range}&limit=50`)
  return uniqueAlbums(r.items, n)
}
/** what she's played lately (the last 50 songs), as their albums, the latest first */
export async function recentAlbums(n = 12) {
  const r = await sp<{ items: { track: Track & { album: Album } }[] }>('/me/player/recently-played?limit=50')
  return uniqueAlbums(
    r.items.map((i) => i.track),
    n,
  )
}
/** an artist's albums (and singles), the newest first, each name once */
export async function artistAlbums(id: string, n = 12) {
  const r = await sp<{ items: Album[] }>(`/artists/${id}/albums?include_groups=album,single&limit=${Math.min(50, n * 2)}`)
  const seen = new Set<string>()
  return r.items.filter((a) => !seen.has(a.name.toLowerCase()) && seen.add(a.name.toLowerCase())).slice(0, n)
}

export type Playlist = { id: string; uri: string; name: string; images: Image[] | null; owner: { display_name: string }; tracks: { total: number } }
/** her playlists (the ones she made and follows; Spotify's own made-for-you ones it no longer lets apps read) */
export async function playlists(n = 12) {
  const r = await sp<{ items: (Playlist | null)[] }>(`/me/playlists?limit=${n}`)
  return r.items.filter((p): p is Playlist => !!p)
}
/** a playlist's songs, in order (the first `n`): its items (as Spotify now calls them, each an `item`), or its
 *  tracks (as it did, each a `track`) */
export async function playlistTracks(id: string, n = 40) {
  type Row = { track?: Track | null; item?: Track | null }
  const r = await sp<{ items: Row[] }>(`/playlists/${id}/items?limit=${n}`).catch(() => sp<{ items: Row[] }>(`/playlists/${id}/tracks?limit=${n}`))
  return r.items.map((i) => i.item ?? i.track).filter((t): t is Track => !!t && !!t.uri && t.uri.startsWith('spotify:track:'))
}

export async function savedAlbums(limit = 20) {
  const r = await sp<{ items: { album: Album }[] }>(`/me/albums?limit=${limit}`)
  return r.items.map((i) => i.album)
}

/** the biggest picture of the cover (Spotify gives 640, 300, 64) */
export const cover = (a: Pick<Album, 'images'>) => [...a.images].sort((x, y) => y.width - x.width)[0]?.url

/** play an album (or a single track) on a device, from a track and a point in it */
export function play(device: string, contextUri: string, opts: { track?: number; uri?: string; ms?: number } = {}) {
  // (from a song by its uri when it's known: a playlist's positions count songs Spotify no longer has)
  const body = contextUri.startsWith('spotify:track:')
    ? { uris: [contextUri], position_ms: opts.ms ?? 0 }
    : { context_uri: contextUri, offset: opts.uri ? { uri: opts.uri } : { position: opts.track ?? 0 }, position_ms: opts.ms ?? 0 }
  return sp<void>(`/me/player/play?device_id=${device}`, { method: 'PUT', body: JSON.stringify(body) })
}
