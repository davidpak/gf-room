import { useEffect, useSyncExternalStore } from 'react'
import { loggedIn, onAuth } from '../../lib/spotify/auth'
import { DEMO, askSaved, dig, digArtist, isFresh, keptSaved, pressFor, type CrateId } from './library'
import type { Pressing } from './vinyl'

/**
 * What's in the crate (./library): her saved albums, or, after she digs for something, what she found (`showing`
 * says which; `showSaved` puts hers back). Made-up records till she's logged in.
 */
type Shelf = { crates: Record<CrateId, Pressing[]>; showing: CrateId; loading: Partial<Record<CrateId, boolean>>; failed: Partial<Record<CrateId, string>>; loaded: Partial<Record<CrateId, boolean>>; dug: string; pressing: string; pressFailed: string }
let s: Shelf = { crates: { saved: DEMO, dig: [] }, showing: 'saved', loading: {}, failed: {}, loaded: {}, dug: '', pressing: '', pressFailed: '' }
const subs = new Set<() => void>()
const set = (o: Partial<Shelf>) => {
  s = { ...s, ...o }
  subs.forEach((f) => f())
}
export const getShelf = () => s
export const useShelf = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getShelf)
/** what the crate's card says while it's empty: loading, or why it couldn't be (the status Spotify answered) */
export function crateNote(id: CrateId, sh: Shelf = s) {
  if (sh.loading[id]) return 'pressing records…'
  const f = sh.failed[id]
  if (!f) return sh.loaded[id] ? 'nothing here yet' : ''
  const rest = f.match(/resting: (\d+) min/)?.[1]
  if (rest) return `Spotify needs a rest: ${rest} min`
  const code = f.match(/: (\d{3})\b/)?.[1]
  return code === '403' || code === '401' ? 'Spotify won\'t share this: log in again' : code ? `Spotify said ${code}` : 'couldn\'t reach Spotify'
}
const same = (a: Pressing[], b: Pressing[]) => a.length === b.length && a.every((p, i) => p.uri === b[i].uri && p.sides.length === b[i].sides.length)

let loadedFor = false
async function loadSaved() {
  if (!loggedIn()) {
    loadedFor = false
    return set({ crates: { saved: DEMO, dig: [] }, showing: 'saved', loading: {}, failed: {} })
  }
  if (loadedFor) return
  loadedFor = true
  // (what was kept, at once; asked again behind it only when that's old)
  const kept = keptSaved()
  if (kept) set({ crates: { ...s.crates, saved: kept.records }, loaded: { ...s.loaded, saved: true } })
  if (kept && isFresh(kept.at)) return
  if (!kept) set({ loading: { ...s.loading, saved: true } })
  try {
    const records = await askSaved()
    // (the same records as before: left as they are, so nothing in the crate is drawn again)
    if (!kept || !same(kept.records, records)) set({ crates: { ...s.crates, saved: records } })
    set({ loading: { ...s.loading, saved: false }, failed: { ...s.failed, saved: undefined }, loaded: { ...s.loaded, saved: true } })
  } catch (e) {
    console.warn('saved albums', e)
    // (what was kept stays; with nothing kept, the crate's empty and says why on its card)
    set({ loading: { ...s.loading, saved: false }, failed: kept ? s.failed : { ...s.failed, saved: String((e as Error).message ?? e) }, crates: kept ? s.crates : { ...s.crates, saved: [] } })
  }
}
/** keeps the crate filled (mounted by whoever shows it) */
export function useFillCrates() {
  const isIn = useSyncExternalStore(onAuth, loggedIn)
  useEffect(() => {
    loadedFor = false
    void loadSaved()
  }, [isIn])
}

async function fillDig(what: string, get: () => Promise<Pressing[]>) {
  set({ loading: { ...s.loading, dig: true }, dug: what })
  try {
    set({ crates: { ...s.crates, dig: await get() }, showing: 'dig', loading: { ...s.loading, dig: false }, failed: { ...s.failed, dig: undefined }, loaded: { ...s.loaded, dig: true } })
  } catch (e) {
    set({ loading: { ...s.loading, dig: false }, failed: { ...s.failed, dig: String((e as Error).message ?? e) } })
  }
}
/** a record taken out of the crate pressed, if it's a jacket only (its songs asked for): put back in its place */
export async function pressIn(id: CrateId, uri: string) {
  const p = s.crates[id]?.find((x) => x.uri === uri)
  if (!p?.stub || s.pressing === uri) return
  set({ pressing: uri, pressFailed: '' })
  try {
    const full = await pressFor(p)
    set({ crates: { ...s.crates, [id]: s.crates[id].map((x) => (x.uri === uri ? full : x)) }, pressing: '' })
  } catch (e) {
    console.warn('pressing', uri, e)
    set({ pressing: '', pressFailed: String((e as Error).message ?? e) })
  }
}

/** a record put on: back in the front of its crate (where a hand puts it back), so it's the first one found */
export function toFront(uri: string) {
  const crates = { ...s.crates }
  let moved = false
  for (const id of Object.keys(crates) as CrateId[]) {
    const i = crates[id].findIndex((p) => p.uri === uri)
    if (i > 0) {
      crates[id] = [crates[id][i], ...crates[id].slice(0, i), ...crates[id].slice(i + 1)]
      moved = true
    }
  }
  if (moved) set({ crates })
}

/** the crate filled with what matches what she wrote */
export const digFor = (q: string) => fillDig(q, () => dig(q))
/** the crate filled with an artist's albums */
export const digMore = (artistId: string, name: string) => fillDig(`more by ${name}`, () => digArtist(artistId))
/** her own records back in the crate */
export const showSaved = () => set({ showing: 'saved' })

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __shelf: { getShelf, set } }) // (for trying it from the console)
