import { useEffect, useState, useSyncExternalStore } from 'react'
import { loggedIn, login, logout, onAuth } from '../../lib/spotify/auth'
import { album, cover, me, play, savedAlbums, search, type Album, type Me, type Track } from '../../lib/spotify/api'
import { deviceReady, positionNow, sdk, startPlayer, usePlayer } from '../../lib/spotify/player'

/**
 * The turntable's plumbing on its own, before the turntable: log in with Spotify, this page as the speaker, search,
 * her saved albums, play an album from any track, pause, seek. A plain page (no 3D); the record player uses the same
 * pieces (src/lib/spotify).
 */
const box: React.CSSProperties = { background: '#fff8ef', border: '2px solid #2b2538', borderRadius: 14, padding: 14 }
const btn: React.CSSProperties = { font: "700 17px 'Gaegu', 'Nunito', cursive", color: '#fff4e6', background: '#2b2538', border: 0, borderRadius: 999, padding: '5px 14px', cursor: 'pointer' }
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => set((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [on])
}

function Cover({ a, size = 120, onClick }: { a: Album; size?: number; onClick?: () => void }) {
  return (
    <button onClick={onClick} title={`${a.name} · ${a.artists.map((x) => x.name).join(', ')}`} style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer', width: size, textAlign: 'left' }}>
      <img src={cover(a)} width={size} height={size} style={{ display: 'block', borderRadius: 4, boxShadow: '0 3px 10px rgba(0,0,0,0.2)' }} />
      <div style={{ font: "700 14px 'Gaegu', cursive", lineHeight: 1.1, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
      <div style={{ font: "400 13px 'Gaegu', cursive", opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.artists.map((x) => x.name).join(', ')}</div>
    </button>
  )
}

export function SpotifyStage() {
  const isIn = useSyncExternalStore(onAuth, loggedIn)
  const p = usePlayer()
  const [who, setWho] = useState<Me | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ albums: Album[]; tracks: (Track & { album: Album })[] } | null>(null)
  const [saved, setSaved] = useState<Album[]>([])
  const [open, setOpen] = useState<Album | null>(null)
  useTick(!p.paused)
  useEffect(() => {
    if (!isIn) return setWho(null)
    me().then(setWho, (e) => setErr(String(e.message)))
    savedAlbums(24).then(setSaved, () => {})
  }, [isIn])

  const go = async (uri: string, track = 0) => {
    setErr('')
    try {
      await startPlayer()
      const dev = await deviceReady()
      await play(dev, uri, { track })
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    }
  }
  const openAlbum = (a: Album) => album(a.id).then(setOpen, (e) => setErr(String(e.message)))

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#f4e6d4', color: '#2b2538', font: "400 17px 'Gaegu', 'Nunito', cursive", padding: '90px 24px 40px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {!isIn ? (
            <button style={btn} onClick={login}>Log in with Spotify</button>
          ) : (
            <>
              <span>
                {who ? `${who.display_name} · ${who.product}${who.product !== 'premium' ? ' (Premium is needed to play here)' : ''}` : '…'}
              </span>
              <span style={{ opacity: 0.6 }}>speaker: {p.status}{p.device ? ' ✓' : ''}</span>
              <button style={{ ...btn, background: '#6a3a52', marginLeft: 'auto' }} onClick={logout}>log out</button>
            </>
          )}
          {location.hostname === 'localhost' && <span style={{ color: '#a33' }}>open this at 127.0.0.1, not localhost: Spotify only sends logins back there</span>}
          {(err || p.error) && <div style={{ color: '#a33', flexBasis: '100%' }}>{err || p.error}</div>}
        </div>

        {isIn && (
          <>
            <div style={{ ...box, display: 'flex', gap: 14, alignItems: 'center' }}>
              {p.track ? (
                <>
                  <img src={p.track.album.images[0]?.url} width={84} height={84} style={{ borderRadius: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 20 }}>{p.track.name}</div>
                    <div style={{ opacity: 0.7 }}>{p.track.artists.map((a) => a.name).join(', ')} · {p.track.album.name}</div>
                    <input type="range" min={0} max={p.duration} value={positionNow(p)} onChange={(e) => sdk()?.seek(+e.target.value)} style={{ width: '100%' }} />
                    <div style={{ opacity: 0.6, fontSize: 14 }}>{mmss(positionNow(p))} / {mmss(p.duration)}</div>
                  </div>
                  <button style={btn} onClick={() => sdk()?.previousTrack()}>⏮</button>
                  <button style={btn} onClick={() => sdk()?.togglePlay()}>{p.paused ? '▶' : '❚❚'}</button>
                  <button style={btn} onClick={() => sdk()?.nextTrack()}>⏭</button>
                </>
              ) : (
                <span style={{ opacity: 0.6 }}>nothing playing: pick an album below</span>
              )}
            </div>

            <form
              style={{ ...box, display: 'flex', gap: 10 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (q.trim()) search(q.trim()).then(setFound, (er) => setErr(String(er.message)))
              }}
            >
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search albums and songs" style={{ flex: 1, font: 'inherit', padding: '4px 10px', borderRadius: 999, border: '2px solid #2b2538' }} />
              <button style={btn}>search</button>
            </form>

            {open && (
              <div style={{ ...box, display: 'flex', gap: 16 }}>
                <Cover a={open} size={200} />
                <ol style={{ margin: 0, flex: 1 }}>
                  {open.tracks!.items.map((t, i) => (
                    <li key={t.id} style={{ cursor: 'pointer', fontWeight: p.track?.uri === t.uri ? 700 : 400 }} onClick={() => go(open.uri, i)}>
                      {t.name} <span style={{ opacity: 0.5 }}>{mmss(t.duration_ms)}</span>
                    </li>
                  ))}
                </ol>
                <button style={{ ...btn, alignSelf: 'start' }} onClick={() => setOpen(null)}>×</button>
              </div>
            )}

            {found && (
              <div style={{ ...box }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {found.albums.map((a) => (
                    <Cover key={a.id} a={a} onClick={() => openAlbum(a)} />
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  {found.tracks.map((t) => (
                    <div key={t.id} style={{ cursor: 'pointer' }} onClick={() => go(t.uri)}>
                      ♪ {t.name} <span style={{ opacity: 0.6 }}>· {t.artists.map((a) => a.name).join(', ')} · {t.album.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {saved.length > 0 && (
              <div style={{ ...box }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>saved albums</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {saved.map((a) => (
                    <Cover key={a.id} a={a} onClick={() => openAlbum(a)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

