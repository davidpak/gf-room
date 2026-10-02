import { useState } from 'react'
import { connectDolphin, disconnectDolphin, useDolphin } from './dolphin'
import { getCube, pressPower, pressTv } from './state'

/**
 * The button that puts Dolphin on the TV (./dolphin): a click asks the browser to share a window (pick Dolphin's
 * game window), and the TV and the console are switched on if they aren't; again, it's taken off. Under it, the one
 * thing to set in Dolphin. Shown where the TV's being looked at (the setup's page; the Quad's TV look).
 */
export function DolphinButton({ show = true, bottom = 24 }: { show?: boolean; bottom?: number }) {
  const on = useDolphin()
  const [err, setErr] = useState('')
  if (!show) return null
  const click = async () => {
    setErr('')
    if (on) return disconnectDolphin()
    try {
      await connectDolphin()
      const c = getCube()
      if (!c.tv) pressTv()
      if (!c.power) pressPower()
    } catch (e) {
      // (the picker closed without a window: nothing to say; anything else, say it)
      const name = (e as { name?: string }).name
      if (name !== 'NotAllowedError' && name !== 'AbortError') setErr(String((e as Error).message ?? e))
    }
  }
  return (
    <div style={{ position: 'fixed', left: '50%', bottom, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 20, pointerEvents: 'none' }}>
      <button
        onClick={click}
        style={{
          pointerEvents: 'auto',
          font: "700 18px 'Gaegu', 'Nunito', cursive",
          color: '#fff4e6',
          background: on ? '#6a3a52' : '#2b2538',
          border: '2px solid #fff4e6',
          borderRadius: 999,
          padding: '6px 18px',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        }}
      >
        {on ? '■ take Dolphin off the TV' : '▶ show Dolphin on the TV'}
      </button>
      <div style={{ font: "700 14px 'Gaegu', 'Nunito', cursive", color: '#fff4e6', textShadow: '0 1px 3px rgba(0,0,0,0.6)', textAlign: 'center', maxWidth: 520 }}>
        {err || (on ? 'playing on the TV · in Dolphin: Controllers → Background Input, so your controller works here' : "pick Dolphin's game window when the browser asks")}
      </div>
    </div>
  )
}
