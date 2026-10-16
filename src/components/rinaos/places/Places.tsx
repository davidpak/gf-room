import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react'

/**
 * RinaOS's Photos, open on Places: a map of Seattle (drawn, Apple Maps' colours), a pin for each place their photos
 * were taken. One is open so far, the Quad: its pin is a cherry photo, and its card takes you there (?part=quad).
 * The rest are still ??? (a blurred photo, a shake when tried). Drag to move round, the wheel or + − to zoom.
 */
type Photo = { id: string; set: string; thumb: string }
type Place = { id: string; x: number; y: number; open?: true; name?: string; part?: string }

const MAP_W = 1600
const MAP_H = 1000
const PLACES: Place[] = [
  { id: 'quad', x: 1018, y: 352, open: true, name: 'The Quad', part: 'quad' },
  { id: 'a', x: 318, y: 288 },
  { id: 'b', x: 642, y: 196 },
  { id: 'c', x: 728, y: 488 },
  { id: 'd', x: 548, y: 868 },
  { id: 'e', x: 884, y: 742 },
  { id: 'f', x: 1172, y: 300 },
  { id: 'g', x: 1176, y: 694 },
]

let manifest: Promise<Photo[]> | null = null
const loadPhotos = () =>
  (manifest ??= fetch('/photos/manifest.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []))

export function Places() {
  const view = useRef<HTMLDivElement>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [cam, setCam] = useState({ x: 0, y: 0, s: 0.62 })
  const [picked, setPicked] = useState<string | null>(null)
  const [shake, setShake] = useState<string | null>(null)
  const [going, setGoing] = useState(false)
  useEffect(() => void loadPhotos().then(setPhotos), [])

  // fitted round the Quad at first
  useEffect(() => {
    const el = view.current
    if (!el) return
    const s = Math.max(el.clientWidth / MAP_W, el.clientHeight / MAP_H) * 1.15
    setCam(clamp({ s, x: el.clientWidth / 2 - 860 * s, y: el.clientHeight / 2 - 520 * s }, el))
  }, [])

  const cherry = photos.filter((p) => p.set === 'cherry')
  const other = photos.filter((p) => p.set !== 'cherry')
  const thumb = (pl: Place, i: number) => (pl.open ? cherry[0]?.thumb : other[(i * 5) % Math.max(1, other.length)]?.thumb)

  // dragged round (in the desktop's own px: on the laptop it's scaled in 3D on the way out)
  const drag = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.ros-ph-pin, .ros-ph-card, .ros-ph-zoom')) return
    const el = e.currentTarget
    const desk = el.closest('.ros-root') as HTMLElement | null
    const k = desk ? desk.getBoundingClientRect().width / desk.offsetWidth : 1
    const sx = e.clientX
    const sy = e.clientY
    const from = cam
    let moved = false
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / k
      const dy = (ev.clientY - sy) / k
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      setCam(clamp({ ...from, x: from.x + dx, y: from.y + dy }, el))
    }
    const up = () => {
      if (!moved) setPicked(null)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  const zoom = (f: number, cx?: number, cy?: number) => {
    const el = view.current
    if (!el) return
    const px = cx ?? el.clientWidth / 2
    const py = cy ?? el.clientHeight / 2
    setCam((c) => {
      const s = Math.min(1.8, Math.max(minScale(el), c.s * f))
      return clamp({ s, x: px - ((px - c.x) / c.s) * s, y: py - ((py - c.y) / c.s) * s }, el)
    })
  }
  const wheel = (e: RWheelEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    const k = r.width / e.currentTarget.offsetWidth
    zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, (e.clientX - r.left) / k, (e.clientY - r.top) / k)
  }
  const tryPin = (pl: Place) => {
    if (pl.open) return setPicked(picked === pl.id ? null : pl.id)
    setPicked(null)
    setShake(pl.id)
    window.setTimeout(() => setShake((s) => (s === pl.id ? null : s)), 500)
  }
  const go = (pl: Place) => {
    setGoing(true)
    window.setTimeout(() => location.assign(`?part=${pl.part}&from=room`), 380)
  }

  return (
    <div className="ros-ph">
      <aside className="ros-ph-side">
        <b>Photos</b>
        <span>Library</span>
        <span>Memories</span>
        <span className="on">Places</span>
        <span>Favourites</span>
      </aside>
      <div className="ros-ph-main">
        <div className="ros-ph-bar">
          <b>Places</b>
          <span>
            {PLACES.filter((p) => p.open).length} of {PLACES.length}
          </span>
        </div>
        <div className="ros-ph-view" ref={view} onPointerDown={drag} onWheel={wheel}>
          <div className="ros-ph-world" style={{ width: MAP_W, height: MAP_H, transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})` }}>
            <SeattleMap />
            {PLACES.map((pl, i) => (
              <button
                key={pl.id}
                className={`ros-ph-pin ${pl.open ? 'open' : 'locked'} ${shake === pl.id ? 'shake' : ''} ${picked === pl.id ? 'picked' : ''}`}
                style={{ left: pl.x, top: pl.y, transform: `translate(-50%, -100%) scale(${1 / cam.s})` }}
                onClick={() => tryPin(pl)}
              >
                <i style={{ backgroundImage: thumb(pl, i) ? `url(${thumb(pl, i)})` : undefined }} />
                {!pl.open && <em>?</em>}
                <span>{pl.open ? pl.name : '???'}</span>
              </button>
            ))}
            {PLACES.filter((pl) => pl.open && picked === pl.id).map((pl) => (
              <div key={pl.id} className="ros-ph-card" style={{ left: pl.x, top: pl.y, transform: `translate(-50%, 0) scale(${1 / cam.s}) translateY(10px)` }} onPointerDown={(e) => e.stopPropagation()}>
                <div className="ros-ph-card-strip">
                  {cherry.slice(0, 4).map((p) => (
                    <i key={p.id} style={{ backgroundImage: `url(${p.thumb})` }} />
                  ))}
                </div>
                <b>{pl.name}</b>
                <span>{cherry.length} photos · spring</span>
                <button onClick={() => go(pl)}>Go there ›</button>
              </div>
            ))}
          </div>
          <div className="ros-ph-zoom">
            <button onClick={() => zoom(1.25)}>+</button>
            <button onClick={() => zoom(1 / 1.25)}>−</button>
          </div>
        </div>
      </div>
      {going && <div className="ros-ph-going" />}
    </div>
  )
}

const minScale = (el: HTMLElement) => Math.max(el.clientWidth / MAP_W, el.clientHeight / MAP_H)
/** never past the map's edges */
function clamp(c: { x: number; y: number; s: number }, el: HTMLElement) {
  const s = Math.max(minScale(el), c.s)
  return { s, x: Math.min(0, Math.max(el.clientWidth - MAP_W * s, c.x)), y: Math.min(0, Math.max(el.clientHeight - MAP_H * s, c.y)) }
}

const LAND = '#f2efe8'
const WATER = '#a8d5f2'
const PARK = '#cfe8bf'
const ROAD = '#ffffff'
const HIGHWAY = '#fbd88a'

/** Seattle, drawn loosely: the Sound, the ship canal through Lake Union, Lake Washington, Green Lake, the parks,
 *  I-5 and 520, a street grid under it all */
function SeattleMap() {
  const streets: string[] = []
  for (let x = 0; x <= MAP_W; x += 46) streets.push(`M${x} 0V${MAP_H}`)
  for (let y = 0; y <= MAP_H; y += 46) streets.push(`M0 ${y}H${MAP_W}`)
  return (
    <svg className="ros-ph-map" viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W} height={MAP_H} aria-hidden>
      <rect width={MAP_W} height={MAP_H} fill={LAND} />
      <path d={streets.join('')} stroke={ROAD} strokeWidth="3" opacity="0.9" />
      {/* parks */}
      <g fill={PARK}>
        <path d="M230 210c50-40 140-30 170 20s10 120-50 140-150-10-160-70 0-60 40-90z" />
        <path d="M600 150c40-20 110-10 120 40s-30 100-80 100-90-30-90-70 20-55 50-70z" />
        <path d="M920 300c40-30 160-30 190 10s20 110-30 130-140 10-170-30-20-80 10-110z" />
        <path d="M850 700c30-20 80-15 90 20s-15 70-50 70-60-20-60-50 5-28 20-40z" />
        <path d="M700 470c15-10 45-8 50 10s-10 30-30 30-30-10-30-25z" />
        <path d="M1180 820c40-20 90-10 100 30s-20 70-60 70-60-30-60-60 5-28 20-40z" />
      </g>
      {/* water */}
      <g fill={WATER}>
        <path d="M0 0h230c-20 80 40 140 10 230s-80 120-60 220 70 150 40 250-40 180-10 300H0z" />
        <path d="M1290 0h310v1000h-330c30-90-20-170 10-260s60-140 30-240-60-170-40-270 10-150 20-230z" />
        <path d="M612 175c20-25 70-20 80 10s-5 60-40 60-55-40-40-70z" />
        <path d="M690 500c30-40 90-40 110 0s20 120-10 170-90 50-110 10-20-130 10-180z" />
        <path d="M205 420c80-10 200 10 300 10s160 20 200 50l-10 22c-50-24-110-30-200-30s-200-10-290-20z" />
        <path d="M790 505c50-10 100-30 160-10s120 50 170 40 120-30 175-20l-2 34c-60-5-110 20-180 22s-110-30-160-40-110 0-160 10z" />
      </g>
      {/* highways: I-5, 520 */}
      <g fill="none" stroke={HIGHWAY} strokeWidth="11" strokeLinecap="round">
        <path d="M840 0c-10 120 0 220-10 330s-40 200-40 300 30 200 10 370" />
        <path d="M960 560c80 20 160 40 260 30s200-10 380 0" />
      </g>
      <g fill="none" stroke="#e6b65a" strokeWidth="1.5" opacity="0.6">
        <path d="M840 0c-10 120 0 220-10 330s-40 200-40 300 30 200 10 370" />
        <path d="M960 560c80 20 160 40 260 30s200-10 380 0" />
      </g>
      {/* labels */}
      <g fill="#5d8db3" fontFamily="-apple-system, 'Segoe UI', sans-serif" fontStyle="italic" fontSize="22" textAnchor="middle">
        <text x="95" y="560" transform="rotate(-90 95 560)">Puget Sound</text>
        <text x="745" y="600" fontSize="16">Lake Union</text>
        <text x="1450" y="420" transform="rotate(90 1450 420)">Lake Washington</text>
      </g>
      <g fill="#8a8478" fontFamily="-apple-system, 'Segoe UI', sans-serif" fontSize="15" fontWeight="600" letterSpacing="2" textAnchor="middle">
        <text x="470" y="360">BALLARD</text>
        <text x="1090" y="468">UNIVERSITY DISTRICT</text>
        <text x="980" y="870">CAPITOL HILL</text>
        <text x="560" y="740">QUEEN ANNE</text>
        <text x="620" y="110">GREEN LAKE</text>
      </g>
    </svg>
  )
}
