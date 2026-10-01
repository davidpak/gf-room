import { useEffect, useMemo, useState } from 'react'
import { useReady, type Phase } from '../../lib/ready'
import './shell.css'

/**
 * The loading screen: the evening sky, a cherry blossom turning in the middle with petals drifting down past it,
 * the page's name, and a bar filling as it loads (../../lib/ready): its code, its models and textures, building
 * the scene, warming up the shaders. Little lines about what's being got ready, for the page. It stays until
 * everything's drawn and ready to touch, then the blossom blooms and the screen fades away.
 *
 * Everything on it moves by transform and opacity only, so it keeps moving while the page is busy building.
 */
const PHASE: Record<Phase, string> = {
  code: 'unpacking',
  assets: 'fetching models',
  building: 'building the scene',
  shaders: 'warming up the shaders',
  ready: 'ready',
}
/** what's being got ready, by page (and for any page) */
const LINES: Record<string, string[]> = {
  room: ['fluffing the pillows', 'hanging the fairy lights', 'tidying the desk', 'switching on the lamp'],
  quad: ['planting the cherry trees', 'laying the bricks', 'waking the ducks', 'baking the cookies', 'parking the Limes', 'packing the picnic'],
  picnic: ['packing the basket', 'wrapping the subs', 'pouring the lemonade', 'shooing the ducks'],
  guitar: ['tuning the strings', 'polishing the rosette'],
  glider: ['charging the battery', 'pumping the tyres'],
  scooter: ['charging the battery', 'pumping the tyres', 'scanning the QR code'],
  civic: ['washing the Civic', 'checking the mirrors'],
  any: ['dusting the shelves', 'mixing the paint', 'counting the petals'],
}
const PETALS = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: -((i * 1.7) % 9),
  dur: 7 + ((i * 13) % 5),
  size: 10 + ((i * 7) % 9),
  sway: (i % 2 ? 1 : -1) * (20 + ((i * 11) % 30)),
}))

/** where the bar heads in each phase, and how long it takes to get there: it starts crawling at once and keeps
 *  crawling (slowing as it goes) while the page builds, then fills the rest quickly when it's ready. One long
 *  transition at a time, run by the compositor, so it keeps moving even while the page is too busy to draw */
const BAR: Record<Phase, [number, number]> = {
  code: [0.62, 4200],
  assets: [0.7, 4800],
  building: [0.84, 1600],
  shaders: [0.93, 1900],
  ready: [1, 520],
}
const FILLED = 620 // (ms: the bar full, a breath, then the blossom blooms and the screen fades)
const FADE = 1000

export function Loader({ part, title }: { part: string; title: string }) {
  const r = useReady()
  const done = r.phase === 'ready'
  // the bar: where it's going and how long it takes (it never goes back)
  const [bar, setBar] = useState<[number, number]>([0.02, 0])
  useEffect(() => {
    // (from the second frame, so the empty bar's been drawn and the crawl has somewhere to start from)
    let a = 0
    a = requestAnimationFrame(() => (a = requestAnimationFrame(() => setBar((b) => (BAR[r.phase][0] > b[0] ? BAR[r.phase] : b)))))
    return () => cancelAnimationFrame(a)
  }, [r.phase])
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!done) return
    const a = setTimeout(() => setLeaving(true), FILLED)
    const b = setTimeout(() => setGone(true), FILLED + FADE)
    return () => (clearTimeout(a), clearTimeout(b))
  }, [done])
  const lines = useMemo(() => [...(LINES[part] ?? []), ...LINES.any], [part])
  const [line, setLine] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setLine((l) => l + 1), 1600)
    return () => clearInterval(t)
  }, [])
  if (gone) return null
  return (
    <div className={`loader${leaving ? ' loader-done' : ''}`} aria-busy={!done} role="status">
      <div className="loader-petals" aria-hidden>
        {PETALS.map((p, i) => (
          <span key={i} style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ['--sway' as string]: `${p.sway}px` }} />
        ))}
      </div>
      <div className="loader-card">
        <div className="loader-flower" aria-hidden>
          <div className="loader-spin">
            {[0, 1, 2, 3, 4].map((k) => (
              <i key={k} style={{ transform: `rotate(${k * 72}deg) translateY(-3px)` }} />
            ))}
            <b />
          </div>
        </div>
        <h2 className="loader-title">{title}</h2>
        <div className="loader-bar">
          <div className="loader-fill" style={{ transform: `scaleX(${bar[0]})`, transitionDuration: `${bar[1]}ms` }} />
        </div>
        <div className="loader-line">
          <span key={done ? 'done' : line}>{done ? 'all set ♡' : `${lines[line % lines.length]}…`}</span>
        </div>
        <div className="loader-phase">
          <span key={r.phase}>{PHASE[r.phase]}</span>
        </div>
      </div>
    </div>
  )
}
