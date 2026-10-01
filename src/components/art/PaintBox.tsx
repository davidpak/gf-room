import { useState } from 'react'
import { painting, SIZES } from './painting'
import { PAINTS } from './spec'

/**
 * The paint box (in the page, over the scene, while you're at the easel): a dab of each paint to pick, three
 * brush sizes, undo, and a fresh canvas (back to the underpainting, after asking).
 */
export function PaintBox({ on = true }: { on?: boolean }) {
  const p = painting()
  const [color, setColor] = useState(p.getBrush().color)
  const [size, setSize] = useState(p.getBrush().size)
  const [sure, setSure] = useState(false)
  const pick = (c: string) => (setColor(c), p.setBrush({ color: c }))
  const pickSize = (s: number) => (setSize(s), p.setBrush({ size: s }))
  return (
    <div className={'paintbox' + (on ? ' on' : '')} onPointerDown={(e) => e.stopPropagation()}>
      <div className="paintbox-paints">
        {PAINTS.map((c) => (
          <button key={c.name} title={c.name} className={'paintbox-dab' + (c.hex === color ? ' on' : '')} style={{ background: c.hex }} onClick={() => pick(c.hex)} />
        ))}
      </div>
      <div className="paintbox-row">
        {Object.entries(SIZES).map(([name, s]) => (
          <button key={name} title={`${name} brush`} className={'paintbox-size' + (s === size ? ' on' : '')} onClick={() => pickSize(s)}>
            <span style={{ width: 4 + s * 0.45, height: 4 + s * 0.45, background: color }} />
          </button>
        ))}
        <button className="paintbox-btn" onClick={() => p.undo()}>
          undo
        </button>
        {sure ? (
          <>
            <button className="paintbox-btn warn" onClick={() => (p.clear(), setSure(false))}>
              start over?
            </button>
            <button className="paintbox-btn" onClick={() => setSure(false)}>
              keep it
            </button>
          </>
        ) : (
          <button className="paintbox-btn" onClick={() => setSure(true)}>
            fresh canvas
          </button>
        )}
      </div>
    </div>
  )
}
