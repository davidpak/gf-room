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
  artists: { name: string }[]
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

export async function savedAlbums(limit = 20) {
  const r = await sp<{ items: { album: Album }[] }>(`/me/albums?limit=${limit}`)
  return r.items.map((i) => i.album)
}

/** the biggest picture of the cover (Spotify gives 640, 300, 64) */
export const cover = (a: Pick<Album, 'images'>) => [...a.images].sort((x, y) => y.width - x.width)[0]?.url

/** play an album (or a single track) on a device, from a track and a point in it */
export function play(device: string, contextUri: string, opts: { track?: number; ms?: number } = {}) {
  const body = contextUri.startsWith('spotify:track:')
    ? { uris: [contextUri], position_ms: opts.ms ?? 0 }
    : { context_uri: contextUri, offset: { position: opts.track ?? 0 }, position_ms: opts.ms ?? 0 }
  return sp<void>(`/me/player/play?device_id=${device}`, { method: 'PUT', body: JSON.stringify(body) })
}
