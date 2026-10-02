import { album, artistAlbums, cover, playlistTracks, playlists, recentAlbums, savedAlbums, search, topAlbums, type Album, type Playlist } from '../../lib/spotify/api'
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
 *
 * A crate's records come as jackets: their album, artist and cover are in what Spotify answers about her listening;
 * their songs aren't, and asking for every album's would use up the app's small allowance of asks. So a record's
 * songs are asked for (and it's pressed: `pressFor`) only when it's taken out of its crate.
 */
export type CrateId = 'repeat' | 'year' | 'alltime' | 'lately' | 'saved' | 'playlists' | 'dig'
export const CRATES: { id: CrateId; label: string; load: () => Promise<Pressing[]> }[] = [
  { id: 'repeat', label: 'On Repeat', load: () => topAlbums('short_term').then((a) => a.map(jacket)) },
  { id: 'year', label: 'This Year', load: () => topAlbums('medium_term').then((a) => a.map(jacket)) },
  { id: 'alltime', label: 'All-Time', load: () => topAlbums('long_term').then((a) => a.map(jacket)) },
  { id: 'lately', label: 'Played Lately', load: () => recentAlbums().then((a) => a.map(jacket)) },
  { id: 'saved', label: 'Saved', load: () => pressSaved(12) },
  { id: 'playlists', label: 'Playlists', load: () => playlistJackets(12) },
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

/** an album from Spotify, pressed (its songs: it has them) */
export const pressAlbum = (a: Album) =>
  press({
    uri: a.uri,
    title: a.name,
    artist: a.artists.map((x) => x.name).join(', '),
    artistId: a.artists[0]?.id,
    year: a.release_date,
    cover: cover(a) ?? '',
    tracks: (a.tracks?.items ?? []).map((t) => ({ name: t.name, ms: t.duration_ms, uri: t.uri })),
  })
/** an album as a jacket only: pressed when it's taken out */
export const jacket = (a: Album) => ({ ...pressAlbum({ ...a, tracks: undefined }), stub: { kind: 'album' as const, id: a.id } })

/** her saved albums (the most recent n): Spotify gives their songs with them, so they come pressed */
export async function pressSaved(n = 12): Promise<Pressing[]> {
  const saved = await savedAlbums(n)
  return saved.map((a) => (a.tracks?.items.length ? pressAlbum(a) : jacket(a)))
}

/** her playlists, each a record (a jacket till it's taken out: its picture the cover) */
async function playlistJackets(n: number): Promise<Pressing[]> {
  const lists = (await playlists(n)).filter((p: Playlist) => p.tracks?.total !== 0)
  return lists.map((p) => press({ uri: p.uri, title: p.name, artist: p.owner.display_name, year: '', cover: p.images?.[0]?.url ?? '', tracks: [], stub: { kind: 'playlist', id: p.id } }))
}

/** a jacket pressed into a record: its songs asked for (once: they're remembered) */
export async function pressFor(p: Pressing): Promise<Pressing> {
  if (!p.stub) return p
  if (p.stub.kind === 'album') {
    const a = await album(p.stub.id)
    return pressAlbum(a)
  }
  const tracks = await playlistTracks(p.stub.id, 40)
  return press({ uri: p.uri, title: p.title, artist: p.artist, year: '', cover: p.cover, tracks: tracks.map((t) => ({ name: t.name, ms: t.duration_ms, uri: t.uri })) })
}

/** what she writes on the Dig crate's card: the albums that match (and the albums of the songs that do), as jackets */
export async function dig(q: string): Promise<Pressing[]> {
  const r = await search(q)
  const seen = new Set<string>()
  return [...r.albums, ...r.tracks.map((t) => t.album)].filter((x) => x && !seen.has(x.id) && seen.add(x.id)).slice(0, 12).map(jacket)
}
/** more by an artist: their albums and singles, as jackets */
export const digArtist = (id: string) => artistAlbums(id).then((a) => a.map(jacket))
