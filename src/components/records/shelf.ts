import { useEffect, useSyncExternalStore } from 'react'
import { loggedIn, onAuth } from '../../lib/spotify/auth'
import { CRATES, demoFor, dig, digArtist, type CrateId } from './library'
import type { Pressing } from './vinyl'

/**
 * What's in each crate (./library says what each one is): loaded from Spotify once she's logged in, a crate at a
 * time; made-up records till then (and if a crate can't be loaded: an old login without the newer permissions says
 * so in `missing`). The Dig crate is filled by what she asks for (`digFor`, `digMore`).
 */
type Shelf = { crates: Record<CrateId, Pressing[]>; loading: Partial<Record<CrateId, boolean>>; failed: Partial<Record<CrateId, string>>; dug: string }
const demo = () => Object.fromEntries(CRATES.map((c) => [c.id, demoFor(c.id)])) as Record<CrateId, Pressing[]>
let s: Shelf = { crates: demo(), loading: {}, failed: {}, dug: '' }
const subs = new Set<() => void>()
const set = (o: Partial<Shelf>) => {
  s = { ...s, ...o }
  subs.forEach((f) => f())
}
export const getShelf = () => s
export const useShelf = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getShelf)

let loadedFor = ''
async function loadAll() {
  if (!loggedIn()) {
    loadedFor = ''
    return set({ crates: demo(), loading: {}, failed: {} })
  }
  if (loadedFor) return
  loadedFor = 'me'
  // (one crate after another: the first ones fill while the rest load)
  for (const c of CRATES) {
    if (c.id === 'dig') continue
    set({ loading: { ...s.loading, [c.id]: true } })
    try {
      const records = await c.load()
      set({ crates: { ...s.crates, [c.id]: records }, loading: { ...s.loading, [c.id]: false }, failed: { ...s.failed, [c.id]: undefined } })
    } catch (e) {
      console.warn('crate', c.id, e)
      set({ loading: { ...s.loading, [c.id]: false }, failed: { ...s.failed, [c.id]: String((e as Error).message ?? e) } })
    }
  }
}
/** keeps the crates filled (once per page: mounted by whoever shows them) */
export function useFillCrates() {
  const isIn = useSyncExternalStore(onAuth, loggedIn)
  useEffect(() => {
    loadedFor = ''
    void loadAll()
  }, [isIn])
}

async function fillDig(what: string, get: () => Promise<Pressing[]>) {
  set({ loading: { ...s.loading, dig: true }, dug: what })
  try {
    set({ crates: { ...s.crates, dig: await get() }, loading: { ...s.loading, dig: false }, failed: { ...s.failed, dig: undefined } })
  } catch (e) {
    set({ loading: { ...s.loading, dig: false }, failed: { ...s.failed, dig: String((e as Error).message ?? e) } })
  }
}
/** the Dig crate filled with what matches what she wrote */
export const digFor = (q: string) => fillDig(q, () => dig(q))
/** the Dig crate filled with an artist's albums */
export const digMore = (artistId: string, name: string) => fillDig(`more by ${name}`, () => digArtist(artistId))
