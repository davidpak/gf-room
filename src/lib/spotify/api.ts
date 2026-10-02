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

export async function sp<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await accessToken()
  if (!t) throw new Error('not logged in to Spotify')
  const r = await fetch(path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { authorization: `Bearer ${t}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  })
  if (r.status === 204) return undefined as T
  if (!r.ok) throw new Error(`Spotify ${path.split('?')[0]}: ${r.status} ${await r.text()}`)
  const text = await r.text()
  return (text ? JSON.parse(text) : undefined) as T
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
const uniqueAlbums = (tracks: { album: { id: string } }[], n: number) => [...new Set(tracks.map((t) => t.album.id))].slice(0, n)

/** her most played (short_term: about the last 4 weeks; medium_term: 6 months; long_term: about a year), as albums */
export async function topAlbums(range: 'short_term' | 'medium_term' | 'long_term', n = 12) {
  const r = await sp<{ items: (Track & { album: Album })[] }>(`/me/top/tracks?time_range=${range}&limit=50`)
  return albums(uniqueAlbums(r.items, n))
}
/** what she's played lately (the last 50 songs), as albums, the latest first */
export async function recentAlbums(n = 12) {
  const r = await sp<{ items: { track: Track & { album: Album } }[] }>('/me/player/recently-played?limit=50')
  return albums(uniqueAlbums(r.items.map((i) => i.track), n))
}
/** an artist's albums (and singles), the newest first */
export async function artistAlbums(id: string, n = 12) {
  const r = await sp<{ items: Album[] }>(`/artists/${id}/albums?include_groups=album,single&limit=${Math.min(50, n * 2)}`)
  // (the same album in several editions: the first of each name)
  const seen = new Set<string>()
  const ids = r.items.filter((a) => !seen.has(a.name.toLowerCase()) && seen.add(a.name.toLowerCase())).map((a) => a.id)
  return albums(ids.slice(0, n))
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
