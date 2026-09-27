import { useEffect, useState } from 'react'
import { OS_H, OS_W, RinaOS } from './RinaOS'

/**
 * RinaOS on its own (gallery first): the laptop's screen, flat, scaled to fit the window. The same
 * desktop as on the laptop in the room.
 */
export function RinaOSStage() {
  const [k, setK] = useState(1)
  useEffect(() => {
    const fit = () => setK(Math.min((window.innerWidth - 40) / OS_W, (window.innerHeight - 110) / OS_H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1c1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: OS_W * k, height: OS_H * k, borderRadius: 14 * k, overflow: 'hidden', boxShadow: '0 0 0 10px #111, 0 30px 80px rgba(0,0,0,.5)' }}>
        <div style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}>
          <RinaOS />
        </div>
      </div>
    </div>
  )
}
