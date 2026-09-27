import { useMemo, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, type Group } from 'three'
import { isHolding } from '../../lib/physics/Hand'
import { blip } from '../../lib/sound/thump'

/**
 * Fix-it prompts: when something is out of place (the charger unplugged, its cable dragged off), a
 * little tag floats over it offering to put it right, the way Bruno Simon's portfolio shows its
 * "accept cookie" points: a label plate that slides out from behind a diamond with an icon.
 *
 *   shows      once the thing has been out of place and at rest for a moment (not while you hold
 *              anything, not from far away); one per item at a time, the first that applies
 *   in         the diamond pops with a spring, the icon after it, the label slides out from behind
 *   waiting    a slow bob
 *   hover      the diamond grows a touch
 *   click      a soft pop: the diamond pulses and bursts into sparkles as the fix plays out
 *   gone       it winds up and snaps shut
 *
 * Drawn as page elements floating over the world (crisp text in Gaegu, CSS animation), a constant
 * size on screen. Styles: .fix-* in styles.css. Timings after Bruno's (sources/Game/InteractivePoints.js).
 */
export type PromptIcon = 'plug' | 'port' | 'tidy' | 'home'
export type PromptItem = {
  key: string
  label: string
  icon: PromptIcon
  /** where it is (world): the prompt floats just above */
  at: (out: Vector3) => Vector3
  /** out of place, so this applies (read every frame) */
  when: () => boolean
  /** put it right */
  run: () => void
}

const DELAY = 1 // s it must be out of place and at rest before the prompt shows
const FAR = 3200 // mm: from further away the prompt keeps out of the way
const OUT_MS = 480 // the snap shut
const FIX_MS = 760 // the pulse and sparkles

type Phase = 'in' | 'out' | 'fix'

export function Prompts({ items }: { items: PromptItem[] }) {
  const group = useRef<Group>(null)
  const camera = useThree((s) => s.camera)
  const [shown, setShown] = useState<{ key: string; phase: Phase } | null>(null)
  const shownRef = useRef(shown)
  shownRef.current = shown
  const itemsRef = useRef(items)
  itemsRef.current = items
  const cand = useRef<{ key: string | null; t: number }>({ key: null, t: 0 })
  const token = useRef(0)
  const at = useMemo(() => new Vector3(), [])

  const set = (s: { key: string; phase: Phase } | null) => {
    shownRef.current = s
    setShown(s)
  }
  const later = (ms: number, then: () => void) => {
    const t = ++token.current
    setTimeout(() => t === token.current && then(), ms)
  }

  useFrame((_, dt) => {
    const list = itemsRef.current
    const c = isHolding() ? null : (list.find((i) => i.when()) ?? null)
    const k = c?.key ?? null
    if (cand.current.key !== k) cand.current = { key: k, t: 0 }
    else cand.current.t += Math.min(dt, 0.1)
    const cur = shownRef.current
    // where: over the shown one (or the one about to show)
    const item = list.find((i) => i.key === (cur?.key ?? k))
    if (item && group.current) group.current.position.copy(item.at(at))
    if (cur && cur.phase !== 'in') return // snapping shut or fixing: its timers finish it
    let want = k && (cand.current.t >= DELAY || cur?.key === k) ? k : null
    if (want && c && camera.position.distanceTo(c.at(at)) > FAR) want = null
    if (cur && want !== cur.key) {
      set({ key: cur.key, phase: 'out' })
      later(OUT_MS, () => set(null))
    } else if (!cur && want) {
      token.current++
      set({ key: want, phase: 'in' })
    }
  })

  const fix = (e: SyntheticEvent) => {
    e.stopPropagation()
    const cur = shownRef.current
    const item = cur && itemsRef.current.find((i) => i.key === cur.key)
    if (!cur || cur.phase !== 'in' || !item) return
    blip()
    item.run()
    set({ key: cur.key, phase: 'fix' })
    later(FIX_MS, () => {
      cand.current = { key: null, t: 0 } // anything still out of place waits its moment again
      set(null)
    })
  }
  const stop = (e: SyntheticEvent) => e.stopPropagation() // presses here are the prompt's, not the hand's or the camera's
  const item = shown && items.find((i) => i.key === shown.key)

  return (
    <group ref={group}>
      <Html zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        {shown && item && (
          <div className={`fix fix-${shown.phase}`}>
            <div className="fix-float">
              <button className="fix-btn" onClick={fix} onPointerDown={stop} onMouseDown={stop} aria-label={item.label} tabIndex={shown.phase === 'in' ? 0 : -1}>
                <span className="fix-label">{item.label}</span>
                <span className="fix-pop">
                  <span className="fix-dia">
                    <Icon name={item.icon} />
                  </span>
                </span>
              </button>
              {shown.phase === 'fix' && (
                <span className="fix-spark" aria-hidden>
                  {Array.from({ length: 8 }, (_, i) => (
                    <i key={i} style={{ '--a': `${i * 45 + 22.5}deg`, '--d': `${i % 2 ? 30 : 42}px` } as CSSProperties} />
                  ))}
                </span>
              )}
            </div>
          </div>
        )}
      </Html>
    </group>
  )
}

/** little line icons, drawn to match (round caps, 2 px) */
function Icon({ name }: { name: PromptIcon }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {name === 'plug' && (
        <g {...p}>
          <path d="M9 3v4M15 3v4" />
          <path d="M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0z" />
          <path d="M12 16v5" />
        </g>
      )}
      {name === 'port' && (
        <g {...p}>
          <rect x="7.5" y="3" width="9" height="11" rx="3" />
          <path d="M10.5 3v3M13.5 3v3" />
          <path d="M12 14c0 4 -4 3 -4 7" />
        </g>
      )}
      {name === 'tidy' && (
        <g {...p}>
          <path d="M5 16c0-5 3-9 7-9s6 3 6 5-2 3-3.5 3S12 14 12 12.5" />
          <path d="M3 13l2 3 3-2" />
          <path d="M19 4l.6 1.4L21 6l-1.4.6L19 8l-.6-1.4L17 6l1.4-.6z" />
        </g>
      )}
      {name === 'home' && (
        <g {...p}>
          <path d="M4 11l8-7 8 7" />
          <path d="M6.5 9.5V20h11V9.5" />
          <path d="M10 20v-5h4v5" />
        </g>
      )}
    </svg>
  )
}
