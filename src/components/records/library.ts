import { album, artistAlbums, cover, coverAt, savedAlbums, search, type Album } from '../../lib/spotify/api'
import { press, type In, type Pressing } from './vinyl'

/**
 * The records there are to play: her saved albums, pressed (./vinyl), in the one crate; and, for a while, what she
 * dug for instead (a search, or more by an artist) in their place.
 *
 * Asking Spotify as little as can be:
 *   saved       one ask for her 50 latest saved albums, each with its songs: they come pressed, nothing more to ask
 *               when one's taken out. What's made of them is kept in this browser: the crate's full at once next
 *               time, and asked again (quietly, behind it) only when that's over half an hour old
 *   dug         one ask (a search, an artist's albums): jackets only (their songs aren't in what comes back); a
 *               record's songs asked for when it's taken out (one ask, remembered a week: ../../lib/spotify/api)
 *
 * Logged out, the crate holds made-up records (silent: the record turns and the arm tracks, nothing plays).
 */
export type CrateId = 'saved' | 'dig'
export const LABEL: Record<CrateId, string> = { saved: 'Saved', dig: 'Dig' }

/** made-up albums, for when she's not logged in */
const made = (uri: string, title: string, artist: string, n: number, k: number) =>
  press({ uri, title, artist, year: '2026', cover: '', tracks: Array.from({ length: n }, (_, j) => ({ name: `${title.split(' ')[0]} ${j + 1}`, ms: 160_000 + ((j * 53_000 + k * 7000) % 140_000) })) })
export const DEMO: Pressing[] = [
  press({ uri: 'demo:sunday', title: 'Sunday Morning Pancakes', artist: 'The Picnic Ducks', year: '2026', cover: '', tracks: ['Syrup', 'Blueberries', 'Second Helping', 'Orange Juice', 'Nap', 'Dishes (Later)', 'Crumbs', 'Back to Bed', 'Brunch Again'].map((name, i) => ({ name, ms: 150_000 + ((i * 47_000) % 130_000) })) }),
  press({ uri: 'demo:quad', title: 'Cherry Blossom Quad', artist: 'Rina & David', year: '2026', cover: '', tracks: ['Petals', 'The Long Walk', 'Under the Trees', 'Paper Planes', 'Lime Scooter', 'Melee at Midnight', 'Cookies', 'Lamp Posts', 'Goodnight', 'Again Tomorrow', 'Ducks', 'Fin'].map((name, i) => ({ name, ms: 200_000 + ((i * 61_000) % 160_000) })) }),
  made('demo:ramen', 'Rainy Day Ramen', 'The Picnic Ducks', 9, 1),
  made('demo:window', 'Window Seat', 'Rina & David', 11, 2),
  made('demo:bus', 'Late Bus Home', 'The Picnic Ducks', 8, 3),
  made('demo:polaroids', 'Polaroids', 'Rina & David', 10, 4),
  made('demo:summer', 'The Long Summer', 'The Picnic Ducks', 12, 5),
  made('demo:kitchen', 'Kitchen Dancing', 'Rina & David', 9, 6),
  press({ uri: 'spotify:track:demo', title: 'Our Song', artist: 'Two of Us', year: '2026', cover: '', tracks: [{ name: 'Our Song', ms: 214_000 }] }),
]

/** what a record's pressed from: an album's own words and its songs (what's kept in the browser) */
type Kept = { uri: string; title: string; artist: string; artistId?: string; year: string; cover: string; thumb?: string; tracks: In[]; id: string; more: boolean }
const keep = (a: Album): Kept => ({
  uri: a.uri,
  id: a.id,
  title: a.name,
  artist: a.artists.map((x) => x.name).join(', '),
  artistId: a.artists[0]?.id,
  year: a.release_date,
  cover: cover(a) ?? '',
  thumb: coverAt(a, 300),
  tracks: (a.tracks?.items ?? []).map((t) => ({ name: t.name, ms: t.duration_ms, uri: t.uri })),
  more: !!a.tracks?.next,
})
// (an album with more songs than came with it (over 50): a jacket till it's taken out, its songs asked for then)
const pressKept = (k: Kept): Pressing => (k.tracks.length && !k.more ? press(k) : { ...press({ ...k, tracks: [] }), stub: { kind: 'album', id: k.id } })
/** an album from Spotify, pressed (its songs: it has them) */
export const pressAlbum = (a: Album) => pressKept(keep(a))
/** an album as a jacket only: pressed when it's taken out */
export const jacket = (a: Album): Pressing => pressKept({ ...keep(a), tracks: [] })

const SAVED = 'records.saved'
const FRESH = 30 * 60_000
/** her saved albums as kept in this browser (and how old that is), if they are */
export function keptSaved(): { at: number; records: Pressing[] } | null {
  try {
    const s = localStorage.getItem(SAVED)
    if (!s) return null
    const v = JSON.parse(s) as { at: number; kept: Kept[] }
    return { at: v.at, records: v.kept.map(pressKept) }
  } catch {
    return null
  }
}
export const isFresh = (at: number) => Date.now() - at < FRESH
/** her 50 latest saved albums, asked for, pressed, and kept in this browser */
export async function askSaved(): Promise<Pressing[]> {
  const kept = (await savedAlbums(50)).map(keep)
  try {
    localStorage.setItem(SAVED, JSON.stringify({ at: Date.now(), kept }))
  } catch {
    /* (no room: asked for again next time) */
  }
  return kept.map(pressKept)
}

/** a jacket pressed into a record: its songs asked for (once: they're remembered) */
export async function pressFor(p: Pressing): Promise<Pressing> {
  if (!p.stub) return p
  return pressAlbum(await album(p.stub.id))
}

/** what she writes on the Dig card: the albums that match (and the albums of the songs that do), as jackets */
export async function dig(q: string): Promise<Pressing[]> {
  const r = await search(q)
  const seen = new Set<string>()
  return [...r.albums, ...r.tracks.map((t) => t.album)].filter((x) => x && !seen.has(x.id) && seen.add(x.id)).slice(0, 12).map(jacket)
}
/** more by an artist: their albums and singles, as jackets */
export const digArtist = (id: string) => artistAlbums(id).then((a) => a.map(jacket))
