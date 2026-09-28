import { useEffect, useRef } from 'react'
import { drawScreensaver } from './screensaver'
import { OS_H, OS_W } from './RinaOS'

/**
 * RinaOS starting up and waking (./RinaOS runs them in turn):
 *
 *   Saver   the screensaver (./screensaver), live: what the screen showed from across the room, so
 *           coming up to it there's no jump
 *   Boot    dark; her case's hearts ring in one inside another round the middle, a thin bar fills
 *   Hello   the wallpaper, "hi, Rina" rising in her handwriting, a small heart
 */
export function Saver({ leaving }: { leaving?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const g = ref.current?.getContext('2d')
    if (!g) return
    let raf = 0
    const draw = () => {
      drawScreensaver(g, OS_W, OS_H, performance.now() / 1000) // (the same clock as the room's screen)
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} width={OS_W} height={OS_H} className={`ros-saver ${leaving ? 'leaving' : ''}`} />
}

/** the case's heart (viewBox 0 0 100 94) */
const HEART = 'M50 88C20 65 4 48 4 30 4 16 15 6 28 6c10 0 18 6 22 14 4-8 12-14 22-14 13 0 24 10 24 24 0 18-16 35-46 58z'
const RINGS = ['#a9e2d3', '#fdebcb', '#f9cabe', '#f5aaae', '#f0929c', '#f7c2bd', '#fff5ee']

export function Boot() {
  return (
    <div className="ros-boot">
      <svg className="ros-boot-mark" viewBox="0 0 100 94" width="136" height="128" aria-hidden>
        {RINGS.map((c, i) => {
          const k = 1 - i * 0.13
          return (
            <g key={c} transform={`translate(50 47) scale(${k}) translate(-50 -47)`}>
              <path d={HEART} fill={c} style={{ animationDelay: `${0.08 + i * 0.07}s` }} />
            </g>
          )
        })}
      </svg>
      <div className="ros-boot-bar">
        <i />
      </div>
    </div>
  )
}

export function Hello() {
  return (
    <div className="ros-hello">
      <span>hi, Rina</span>
      <svg viewBox="0 0 100 94" width="26" height="24" aria-hidden>
        <path d={HEART} fill="#ffd9e4" />
      </svg>
    </div>
  )
}
