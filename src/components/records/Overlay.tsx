import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { loggedIn, login, missingScopes, onAuth } from '../../lib/spotify/auth'
import { usePlayer } from '../../lib/spotify/player'
import { openCrate, recordUp, useBrowse } from './browse'
import { useDeck } from './deck'
import { digFor, getShelf, showSaved, useShelf } from './shelf'

/**
 * What the page writes about the records (the same on the record player's own page and on the Quad):
 *   the record up or out: its album, its artist and year, nothing more (while the crate holds what she dug for:
 *   the way back to her own records)
 *   otherwise: log in (or again, for the crates' newer permissions), or what's playing
 *   the Dig card: what to look for (what's found goes in the crate)
 */
const T: React.CSSProperties = { font: "700 18px 'Gaegu', 'Nunito', cursive", color: '#fff4e6', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }
const PILL: React.CSSProperties = { ...T, background: '#2b2538', border: '2px solid #fff4e6', borderRadius: 999, padding: '5px 16px', cursor: 'pointer', textShadow: 'none', pointerEvents: 'auto' }

let asking = false
const askSubs = new Set<() => void>()
/** the Dig card, to write on */
export const askDig = (on = true) => {
  asking = on
  askSubs.forEach((f) => f())
}
const useAsking = () => useSyncExternalStore((f) => (askSubs.add(f), () => void askSubs.delete(f)), () => asking)

function About({ bottom }: { bottom: number }) {
  const b = useBrowse()
  useShelf() // (the record up changes as the crate's filled)
  const p = recordUp()
  useEffect(() => {
    // (the page's own title and hint step aside meanwhile)
    document.body.classList.toggle('browsing', b.mode !== 'none')
  }, [b.mode])
  if (!p || !b.crate) return null
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, zIndex: 21, pointerEvents: 'none', textAlign: 'center' }}>
      <div style={{ ...T, fontSize: 28 }}>{p.title}</div>
      <div style={T}>
        {p.artist}
        {p.year ? ` · ${p.year.slice(0, 4)}` : ''}
      </div>
      {b.crate === 'dig' && (
        <button
          style={{ ...PILL, fontSize: 16, marginTop: 6 }}
          onClick={() => {
            showSaved()
            openCrate('saved', 0)
          }}
        >
          ♡ back to her records
        </button>
      )}
    </div>
  )
}

function Status({ bottom }: { bottom: number }) {
  const looking = useBrowse().mode !== 'none'
  const isIn = useSyncExternalStore(onAuth, loggedIn)
  const p = usePlayer()
  const d = useDeck()
  if (looking) return null
  const box: React.CSSProperties = { position: 'fixed', left: '50%', bottom, transform: 'translateX(-50%)', zIndex: 20, textAlign: 'center' }
  if (!isIn)
    return (
      <button onClick={login} style={{ ...PILL, ...box }}>
        ♪ fill the crates with her own records (log in with Spotify)
      </button>
    )
  if (missingScopes())
    return (
      <button onClick={login} style={{ ...PILL, ...box }}>
        ♪ log in again, so the crates can see what she plays most
      </button>
    )
  if (p.error) return <div style={{ ...T, ...box }}>{p.error}</div>
  if (d.on && p.track && !p.paused)
    return (
      <div style={{ ...T, ...box }}>
        ♪ {p.track.name} · {p.track.artists.map((a) => a.name).join(', ')}
      </div>
    )
  return null
}

/** the Dig card: an index card to write on (what to look for) */
function DigCard() {
  const on = useAsking()
  const isIn = useSyncExternalStore(onAuth, loggedIn)
  const shelf = useShelf()
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (on) setTimeout(() => input.current?.focus(), 30)
  }, [on])
  if (!on) return null
  const go = async () => {
    if (!q.trim()) return
    await digFor(q.trim())
    askDig(false)
    if (getShelf().crates.dig.length) openCrate('dig', 0)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', zIndex: 40, background: 'rgba(27,21,48,0.35)' }} onClick={() => askDig(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 380, background: '#fbf6ec', borderRadius: 10, padding: '18px 22px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', transform: 'rotate(-1.5deg)', backgroundImage: 'repeating-linear-gradient(#fbf6ec 0 27px, #cfe0f2 27px 28px)', font: "400 20px 'Gaegu', cursive", color: '#2b2538' }}
      >
        <div style={{ fontWeight: 700, fontSize: 24, color: '#c2410c', borderBottom: '2px solid #f0a3a3', paddingBottom: 4, marginBottom: 10 }}>⛏ dig for records</div>
        {!isIn ? (
          <div>
            log in with Spotify first, and anything she can think of can be pressed into the crate.
            <div style={{ marginTop: 12 }}>
              <button style={{ ...PILL, color: '#fff4e6' }} onClick={login}>
                ♪ log in with Spotify
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void go()
            }}
          >
            <div>an artist, an album, a song…</div>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && askDig(false)}
              style={{ width: '100%', font: "700 24px 'Gaegu', cursive", border: 0, borderBottom: '2px solid #2b2538', background: 'transparent', outline: 'none', marginTop: 6, color: '#2b2538' }}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button style={{ ...PILL, color: '#fff4e6' }}>{shelf.loading.dig ? 'digging…' : 'dig them into the crate'}</button>
              {shelf.failed.dig && <span style={{ color: '#b91c1c', fontSize: 16 }}>couldn’t: {shelf.failed.dig.slice(0, 60)}</span>}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/** `status`: whether to show the log-in / playing line (on the Quad: only while the player's looked at) */
export function RecordsOverlay({ bottom = 110, status = true }: { bottom?: number; status?: boolean }) {
  return (
    <>
      <About bottom={bottom} />
      {status && <Status bottom={bottom - 26} />}
      <DigCard />
    </>
  )
}
