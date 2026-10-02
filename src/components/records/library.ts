import { album, cover, savedAlbums, type Album } from '../../lib/spotify/api'
import { press, type Pressing } from './vinyl'

/**
 * The records there are to play: her saved albums on Spotify, pressed (./vinyl); made-up ones when she's not logged
 * in (their songs silent: the record turns and the arm tracks, nothing plays).
 */
/** made-up albums, for when she's not logged in */
export const DEMO: Pressing[] = [
  press({ uri: 'demo:sunday', title: 'Sunday Morning Pancakes', artist: 'The Picnic Ducks', year: '2026', cover: '', tracks: ['Syrup', 'Blueberries', 'Second Helping', 'Orange Juice', 'Nap', 'Dishes (Later)', 'Crumbs', 'Back to Bed', 'Brunch Again'].map((name, i) => ({ name, ms: 150_000 + ((i * 47_000) % 130_000) })) }),
  press({ uri: 'demo:quad', title: 'Cherry Blossom Quad', artist: 'Rina & David', year: '2026', cover: '', tracks: ['Petals', 'The Long Walk', 'Under the Trees', 'Paper Planes', 'Lime Scooter', 'Melee at Midnight', 'Cookies', 'Lamp Posts', 'Goodnight', 'Again Tomorrow', 'Ducks', 'Fin'].map((name, i) => ({ name, ms: 200_000 + ((i * 61_000) % 160_000) })) }),
  press({ uri: 'spotify:track:demo', title: 'Our Song', artist: 'Two of Us', year: '2026', cover: '', tracks: [{ name: 'Our Song', ms: 214_000 }] }),
]

/** an album from Spotify, pressed */
export const pressAlbum = (a: Album) =>
  press({
    uri: a.uri,
    title: a.name,
    artist: a.artists.map((x) => x.name).join(', '),
    year: a.release_date,
    cover: cover(a) ?? '',
    tracks: a.tracks!.items.map((t) => ({ name: t.name, ms: t.duration_ms, uri: t.uri })),
  })

/** her saved albums (the most recent n), pressed */
export async function pressSaved(n = 6): Promise<Pressing[]> {
  const albums = await savedAlbums(n)
  const full = await Promise.all(albums.map((a) => album(a.id)))
  return full.map(pressAlbum)
}
