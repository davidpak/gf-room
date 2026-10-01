import { useEffect, useMemo, useRef, useState } from 'react'
import { GROUPS, PARTS, type PartKey } from './parts'
import './shell.css'

/**
 * The dev menu: a small button in the corner (the page you're on); click it, or press `, for the panel: every
 * page, grouped (places, the room's things, the desk's, the Quad's, tools), a search box (type and Enter to go),
 * and switches for the verification sheet and the performance overlay. Esc or a click outside closes it.
 */
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const go = (part: string, extra: Record<string, boolean> = {}) => {
  const q = new URLSearchParams({ part })
  for (const [k, on] of Object.entries({ dev: params.has('dev'), ...extra })) if (on) q.set(k, '')
  location.search = q.toString().replace(/=(&|$)/g, '$1')
}

export function DevMenu({ part }: { part: PartKey }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const check = params.has('check')
  const perf = params.has('perf')
  const hitch = params.has('hitch')
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable
      if (e.key === '`' && !typing) {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') setOpen(false)
    }
    const click = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', click, true)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', click, true)
    }
  }, [])
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30)
    else setQ('')
  }, [open])
  const match = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (k: PartKey) => !s || k.includes(s) || PARTS[k].title.toLowerCase().includes(s)
  }, [q])
  const first = (Object.keys(PARTS) as PartKey[]).find(match)
  return (
    <div className="dev" ref={panel}>
      <button className={`dev-btn${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} title="dev menu (`)">
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
        <span>{part}</span>
      </button>
      {open && (
        <div className="dev-panel">
          <input
            ref={input}
            className="dev-search"
            placeholder="find a page…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && first && go(first)}
          />
          <div className="dev-groups">
            {GROUPS.map((g) => {
              const items = g.parts.filter(match)
              if (!items.length) return null
              return (
                <section key={g.name}>
                  <h3>{g.name}</h3>
                  {items.map((k) => (
                    <a key={k} href={`?part=${k}`} className={k === part ? 'on' : ''}>
                      <span>{k}</span>
                      <small>{PARTS[k].title}</small>
                    </a>
                  ))}
                </section>
              )
            })}
          </div>
          <div className="dev-toggles">
            {'check' in PARTS[part] && (
              <label>
                <input type="checkbox" checked={check} onChange={() => go(part, { check: !check, perf, hitch })} /> verification sheet
              </label>
            )}
            <label>
              <input type="checkbox" checked={perf} onChange={() => go(part, { check, perf: !perf, hitch })} /> performance overlay
            </label>
            <label>
              <input type="checkbox" checked={hitch} onChange={() => go(part, { check, perf, hitch: !hitch })} /> hitch recorder
            </label>
            <span className="dev-key">` to toggle</span>
          </div>
        </div>
      )}
    </div>
  )
}
