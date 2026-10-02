import { album, albums, artistAlbums, cover, playlistTracks, playlists, recentAlbums, savedAlbums, search, topAlbums, type Album, type Playlist } from '../../lib/spotify/api'
import { press, type Pressing } from './vinyl'

/**
 * The records there are to play, crate by crate: what Spotify lets the site see of her listening, pressed (./vinyl).
 *
 *   On Repeat        her most played songs of the last 4 weeks, as their albums
 *   This Year        … of about the last 6 months
 *   All-Time         … of about a year (Spotify's longest reach)
 *   Played Lately    the last 50 songs she played, as their albums
 *   Saved            the albums she's saved
 *   Playlists        her playlists, each pressed as a record of its own (the first 40 songs: a mixtape)
 *   Dig              anything at all: what she writes on its card (a search), or more by an artist she's looking at
 *
 * Logged out, a crate holds made-up records (their songs silent: the record turns and the arm tracks, nothing plays).
 */
export type CrateId = 'repeat' | 'year' | 'alltime' | 'lately' | 'saved' | 'playlists' | 'dig'
export const CRATES: { id: CrateId; label: string; load: () => Promise<Pressing[]> }[] = [
  { id: 'repeat', label: 'On Repeat', load: () => topAlbums('short_term').then((a) => a.map(pressAlbum)) },
  { id: 'year', label: 'This Year', load: () => topAlbums('medium_term').then((a) => a.map(pressAlbum)) },
  { id: 'alltime', label: 'All-Time', load: () => topAlbums('long_term').then((a) => a.map(pressAlbum)) },
  { id: 'lately', label: 'Played Lately', load: () => recentAlbums().then((a) => a.map(pressAlbum)) },
  { id: 'saved', label: 'Saved', load: () => pressSaved(12) },
  { id: 'playlists', label: 'Playlists', load: () => pressPlaylists(12) },
  { id: 'dig', label: 'Dig', load: async () => [] },
]

/** made-up albums, for when she's not logged in */
export const DEMO: Pressing[] = [
  press({ uri: 'demo:sunday', title: 'Sunday Morning Pancakes', artist: 'The Picnic Ducks', year: '2026', cover: '', tracks: ['Syrup', 'Blueberries', 'Second Helping', 'Orange Juice', 'Nap', 'Dishes (Later)', 'Crumbs', 'Back to Bed', 'Brunch Again'].map((name, i) => ({ name, ms: 150_000 + ((i * 47_000) % 130_000) })) }),
  press({ uri: 'demo:quad', title: 'Cherry Blossom Quad', artist: 'Rina & David', year: '2026', cover: '', tracks: ['Petals', 'The Long Walk', 'Under the Trees', 'Paper Planes', 'Lime Scooter', 'Melee at Midnight', 'Cookies', 'Lamp Posts', 'Goodnight', 'Again Tomorrow', 'Ducks', 'Fin'].map((name, i) => ({ name, ms: 200_000 + ((i * 61_000) % 160_000) })) }),
  press({ uri: 'spotify:track:demo', title: 'Our Song', artist: 'Two of Us', year: '2026', cover: '', tracks: [{ name: 'Our Song', ms: 214_000 }] }),
]
/** a crate's made-up records (a different few in each, so they don't all look alike) */
export const demoFor = (id: CrateId): Pressing[] => {
  if (id === 'dig') return []
  const k = CRATES.findIndex((c) => c.id === id)
  const names = [
    ['Rainy Day Ramen', 'Window Seat'],
    ['Late Bus Home', 'Headphones On'],
    ['Polaroids', 'The Long Summer'],
    ['Last Night', 'Encore'],
    ['Keepers', 'Shelf Life'],
    ['Road Trip Mix', 'Kitchen Dancing'],
  ][k % 6]
  return [
    ...names.map((t, i) =>
      press({ uri: `demo:${id}:${i}`, title: t, artist: ['The Picnic Ducks', 'Rina & David'][i], year: '2026', cover: '', tracks: Array.from({ length: 8 + ((k + i) % 5) }, (_, j) => ({ name: `${t.split(' ')[0]} ${j + 1}`, ms: 170_000 + ((j * 53_000 + k * 7000) % 140_000) })) }),
    ),
    DEMO[(k + 1) % 3],
  ]
}

/** an album from Spotify, pressed */
export const pressAlbum = (a: Album) =>
  press({
    uri: a.uri,
    title: a.name,
    artist: a.artists.map((x) => x.name).join(', '),
    artistId: a.artists[0]?.id,
    year: a.release_date,
    cover: cover(a) ?? '',
    tracks: a.tracks!.items.map((t) => ({ name: t.name, ms: t.duration_ms, uri: t.uri })),
  })

/** her saved albums (the most recent n), pressed */
export async function pressSaved(n = 6): Promise<Pressing[]> {
  const saved = await savedAlbums(n)
  const full = await Promise.all(saved.map((a) => album(a.id)))
  return full.map(pressAlbum)
}

/** her playlists, each a record: its picture the cover, its first songs the record's (as many as four sides hold) */
async function pressPlaylists(n: number): Promise<Pressing[]> {
  const lists = (await playlists(n)).filter((p: Playlist) => p.tracks.total > 0)
  const out = await Promise.all(
    lists.map(async (p) => {
      const tracks = await playlistTracks(p.id, 40).catch(() => [])
      if (!tracks.length) return null
      return press({
        uri: p.uri,
        title: p.name,
        artist: p.owner.display_name,
        year: '',
        cover: p.images?.[0]?.url ?? '',
        tracks: tracks.map((t) => ({ name: t.name, ms: t.duration_ms, uri: t.uri })),
      })
    }),
  )
  return out.filter((p): p is Pressing => !!p)
}

/** what she writes on the Dig crate's card: the albums that match (and the albums of the songs that do) */
export async function dig(q: string): Promise<Pressing[]> {
  const r = await search(q)
  const ids = [...new Set([...r.albums.map((a) => a.id), ...r.tracks.map((t) => t.album.id)])].slice(0, 12)
  return (await albums(ids)).map(pressAlbum)
}
/** more by an artist: their albums and singles */
export const digArtist = (id: string) => artistAlbums(id).then((a) => a.map(pressAlbum))
