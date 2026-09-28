import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon, Glyph } from './icons'
import { OneNote } from './onenote/OneNote'
import { useOsMode } from './mode'
import { Boot, Hello, Saver } from './Boot'
import './rinaos.css'

/**
 * RinaOS: her laptop's desktop, 1280 × 800 (the 13-inch's "looks like" size). A menu bar (the
 * apple's menu, the open app's name and menus, the clock), the wallpaper, windows (dragged by their
 * title bars; close, minimise, zoom), the dock. Apps: OneNote; Photos and Music to come. It starts
 * up with a boot and a hello (./Boot), wakes from its screensaver after, and goes back to it when left.
 *
 * `embedded`: it's on the laptop's screen in the room. Then it keeps the keys and the pointer to
 * itself (the room's shortcuts stay out of her typing), and Esc, the "Back to the room" chip or a
 * click off the screen leaves it.
 */
export const OS_W = 1280
export const OS_H = 800
const MENU_H = 24
const DOCK_H = 78

type AppId = 'onenote' | 'photos' | 'music'
export type Phase = 'saver' | 'boot' | 'hello' | 'wake' | 'desk'
const IDLE = 120_000 // (ms untouched before the screensaver comes on)
type Win = { open: boolean; min: boolean; max: boolean; x: number; y: number; w: number; h: number; z: number }
const APPS: { id: AppId; name: string; ready: boolean; menus: string[] }[] = [
  { id: 'onenote', name: 'OneNote', ready: true, menus: ['File', 'Edit', 'View', 'Insert', 'Format', 'Notebooks', 'Window', 'Help'] },
  { id: 'photos', name: 'Photos', ready: false, menus: [] },
  { id: 'music', name: 'Music', ready: false, menus: [] },
]

export function RinaOS({ embedded, hold }: { embedded?: { onExit: () => void }; hold?: Phase }) {
  const root = useRef<HTMLDivElement>(null)
  const [wins, setWins] = useState<Record<string, Win>>({
    onenote: { open: true, min: false, max: false, x: 34, y: MENU_H + 12, w: 1212, h: 668, z: 1 },
  })
  const [front, setFront] = useState<AppId>('onenote')
  const [soon, setSoon] = useState<AppId | null>(null)
  const [appleMenu, setAppleMenu] = useState(false)
  const [about, setAbout] = useState(false)
  const now = useClock()
  const exit = useRef(embedded?.onExit)
  exit.current = embedded?.onExit
  const using = useOsMode() && !!embedded // (on the laptop, kept while it's put down: only while it's in use)

  // Esc leaves (the room's own key listeners pass over keys typed in here: lib/inputLock's typing())
  useEffect(() => {
    if (!using) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && exit.current?.()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [using])

  // starting up: the screensaver (on the laptop: what it showed from across the room), then the
  // first time a boot and a hello, after that just a wake; back to the screensaver when it's left,
  // or put down. A click or a key skips ahead
  const [phase, setPhase] = useState<Phase>(hold ?? (embedded ? 'saver' : 'boot')) // (hold: stay in one, to look at it)
  const [entering, setEntering] = useState(false)
  const booted = useRef(false)
  /** the desktop coming in (the menu bar, the dock, the window) */
  const enter = () => {
    setEntering(true)
    window.setTimeout(() => setEntering(false), 1000)
  }
  // waking: the screensaver fades as the desktop comes in under it, together (one fade)
  const start = () => {
    if (!booted.current) return setPhase('boot')
    setPhase('wake')
    enter()
  }
  const toDesk = (entered = false) => {
    booted.current = true
    setPhase('desk')
    if (!entered) enter()
  }
  useEffect(() => {
    if (!embedded) return
    if (!using) {
      setPhase('saver')
      return
    }
    // come up to it: once the camera's there, it wakes
    const t = window.setTimeout(start, 850)
    return () => window.clearTimeout(t)
  }, [using]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const next: Partial<Record<Phase, [number, () => void]>> = { boot: [1650, () => setPhase('hello')], hello: [1250, () => toDesk()], wake: [550, () => toDesk(true)] }
    const n = next[phase]
    if (!n || hold) return
    const t = window.setTimeout(n[1], n[0])
    return () => window.clearTimeout(t)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
  // left a while: the screensaver (a touch or a key wakes it)
  useEffect(() => {
    const el = root.current
    if (!el || phase !== 'desk') return
    let t = window.setTimeout(() => setPhase('saver'), IDLE)
    const poke = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => setPhase('saver'), IDLE)
    }
    const kinds = ['pointerdown', 'pointermove', 'keydown', 'wheel']
    kinds.forEach((k) => el.addEventListener(k, poke))
    return () => {
      window.clearTimeout(t)
      kinds.forEach((k) => el.removeEventListener(k, poke))
    }
  }, [phase])
  const skip = () => {
    if (phase === 'boot' || phase === 'hello') toDesk()
    else if (phase === 'saver' && (using || !embedded)) start()
  }
  useEffect(() => {
    if (phase === 'desk' || phase === 'wake') return
    const key = () => skip()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const raise = (id: AppId) => {
    setFront(id)
    setWins((w) => {
      const top = Math.max(...Object.values(w).map((v) => v.z)) + 1
      return { ...w, [id]: { ...w[id], z: top } }
    })
  }
  const launch = (id: AppId) => {
    const app = APPS.find((a) => a.id === id)!
    if (!app.ready) {
      setSoon(id)
      window.setTimeout(() => setSoon((s) => (s === id ? null : s)), 1600)
      return
    }
    setWins((w) => ({ ...w, [id]: { ...w[id], open: true, min: false } }))
    raise(id)
  }
  const patch = (id: AppId, p: Partial<Win>) => setWins((w) => ({ ...w, [id]: { ...w[id], ...p } }))
  const frontApp = APPS.find((a) => a.id === front && wins[a.id]?.open && !wins[a.id]?.min)

  return (
    <div
      ref={root}
      className={`ros-root ${phase === 'saver' || phase === 'boot' || phase === 'hello' ? 'ros-pre' : ''} ${entering ? 'ros-enter' : ''}`}
      style={{ width: OS_W, height: OS_H }}
      onPointerDown={() => setAppleMenu(false)}
    >
      <div className="ros-wall" />
      {/* the menu bar */}
      <div className="ros-menubar" style={{ height: MENU_H }}>
        <button className="ros-apple" onPointerDown={(e) => (e.stopPropagation(), setAppleMenu(!appleMenu))}>
          <Glyph name="apple" />
        </button>
        {appleMenu && (
          <div className="ros-dropdown" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => (setAbout(true), setAppleMenu(false))}>About RinaOS</button>
            <hr />
            {embedded && <button onClick={() => embedded.onExit()}>Back to the Room</button>}
          </div>
        )}
        <b>{frontApp?.name ?? 'Finder'}</b>
        {(frontApp?.menus ?? ['File', 'Edit', 'View', 'Go', 'Window', 'Help']).map((m) => (
          <span key={m}>{m}</span>
        ))}
        <div className="ros-menubar-right">
          <Glyph name="battery" />
          <Glyph name="wifi" />
          <span>
            {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}&nbsp;&nbsp;
            {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      </div>
      {/* the windows */}
      {wins.onenote.open && !wins.onenote.min && (
        <Window
          title="OneNote"
          win={wins.onenote}
          focused={front === 'onenote'}
          bar="#7719aa"
          onFocus={() => raise('onenote')}
          onMove={(x, y) => patch('onenote', { x, y })}
          onClose={() => patch('onenote', { open: false })}
          onMin={() => patch('onenote', { min: true })}
          onMax={() => patch('onenote', { max: !wins.onenote.max })}
        >
          <OneNote />
        </Window>
      )}
      {about && (
        <div className="ros-about" style={{ zIndex: 999 }}>
          <div className="ros-about-logo">
            <Glyph name="apple" />
          </div>
          <b>RinaOS</b>
          <span>Version 1.0</span>
          <p>Made for Rina, with love.</p>
          <button onClick={() => setAbout(false)}>OK</button>
        </div>
      )}
      {/* the dock */}
      <div className="ros-dock" style={{ height: DOCK_H - 14 }}>
        {APPS.map((a) => (
          <button key={a.id} className={`ros-dock-app ${soon === a.id ? 'bounce' : ''}`} onClick={() => launch(a.id)}>
            <AppIcon app={a.id} />
            <span className="ros-dock-tip">{a.ready ? a.name : `${a.name}: coming soon`}</span>
            {wins[a.id]?.open && <i className="ros-dock-dot" />}
          </button>
        ))}
      </div>
      {/* starting up (over everything; a click skips ahead) */}
      {phase !== 'desk' && (
        <div className="ros-startup" onPointerDown={(e) => (e.stopPropagation(), skip())}>
          {phase === 'hello' && <Hello />}
          {phase === 'boot' && <Boot />}
          {(phase === 'saver' || phase === 'wake') && <Saver leaving={phase === 'wake'} />}
        </div>
      )}
      {embedded &&
        using &&
        createPortal(
          <>
            <div className="ros-backdrop" onPointerDown={() => embedded.onExit()} />
            <button className="ros-back" onClick={() => embedded.onExit()}>
              ‹ Back to the room <kbd>esc</kbd>
            </button>
          </>,
          document.body,
        )}
    </div>
  )
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

function Window({
  title,
  win,
  focused,
  bar,
  onFocus,
  onMove,
  onClose,
  onMin,
  onMax,
  children,
}: {
  title: string
  win: Win
  focused: boolean
  bar: string
  onFocus: () => void
  onMove: (x: number, y: number) => void
  onClose: () => void
  onMin: () => void
  onMax: () => void
  children: ReactNode
}) {
  const box = win.max ? { x: 0, y: MENU_H, w: OS_W, h: OS_H - MENU_H - DOCK_H + 6 } : win
  // dragged by the title bar, in the desktop's own px (the screen's scaled in 3D on the way out)
  const drag = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || win.max || (e.target as HTMLElement).closest('.ros-lights')) return
    const el = e.currentTarget
    const desk = el.closest('.ros-root') as HTMLElement
    const r = desk.getBoundingClientRect()
    const k = r.width / desk.offsetWidth
    const sx = e.clientX
    const sy = e.clientY
    const from = { x: win.x, y: win.y }
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => onMove(Math.round(from.x + (ev.clientX - sx) / k), Math.round(Math.max(MENU_H, from.y + (ev.clientY - sy) / k)))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <div className={`ros-win ${focused ? 'focused' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: win.z }} onPointerDown={onFocus}>
      <div className="ros-titlebar" style={{ background: bar }} onPointerDown={drag} onDoubleClick={onMax}>
        <div className="ros-lights">
          <button className="c" onClick={onClose} title="Close" />
          <button className="m" onClick={onMin} title="Minimize" />
          <button className="z" onClick={onMax} title="Zoom" />
        </div>
        <span>{title}</span>
      </div>
      <div className="ros-win-body">{children}</div>
    </div>
  )
}
