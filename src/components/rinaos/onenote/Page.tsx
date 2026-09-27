import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { act, uid, type Block, type Page, type Stroke } from './model'
import { editor, localPoint, type Tool } from './editor'

/**
 * A page: its title and when it was made, then the canvas. In the Type tool, click anywhere on the
 * canvas and a note container starts there; containers are dragged by the bar along their top and
 * sized by their right edge, and go away when left empty. Pictures sit on it the same way. Ink is
 * drawn over everything with the pens and highlighters (the Draw tab), and rubbed out with the eraser.
 */
const PAPER_W = 1100

export function PageView({ page, tool, zoom }: { page: Page; tool: Tool; zoom: number }) {
  const canvas = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const bottom = Math.max(900, ...page.blocks.map((b) => b.y + 400), ...page.ink.flatMap((s) => s.pts.map((p) => p[1] + 300)))

  // type anywhere: a new note container where you click (not on a note)
  const onCanvasDown = (e: RPointerEvent) => {
    if (tool.kind !== 'type' || e.button !== 0 || e.target !== canvas.current) return
    const [x, y] = localPoint(canvas.current!, e.clientX, e.clientY)
    const id = uid()
    act.addBlock(page.id, { id, kind: 'text', x: Math.max(0, x - 6), y: Math.max(0, y - 12), w: 360, html: '' })
    setFocusId(id)
    e.preventDefault()
  }

  const rules = page.rules ?? 'none'
  const date = new Date(page.created)
  return (
    <div className="ros-page" style={{ background: page.paper ?? '#ffffff' }}>
      <div className="ros-page-zoom" style={{ transform: `scale(${zoom})`, width: PAPER_W, height: bottom + 150 }}>
        <div className="ros-page-head">
          <input
            className="ros-title"
            value={page.title}
            placeholder="Untitled Page"
            onChange={(e) => act.setTitle(page.id, e.target.value)}
            spellCheck={false}
          />
          <div className="ros-page-date">
            {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            <span>{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
        </div>
        <div ref={canvas} className={`ros-canvas ros-rules-${rules} ros-tool-${tool.kind}`} style={{ height: bottom }} onPointerDown={onCanvasDown}>
          {page.blocks.map((b) =>
            b.kind === 'text' ? (
              <TextBlock key={b.id} page={page.id} block={b} focus={focusId === b.id} onFocused={() => setFocusId(null)} />
            ) : (
              <ImageBlock key={b.id} page={page.id} block={b} />
            ),
          )}
          <Ink page={page} tool={tool} height={bottom} />
        </div>
      </div>
    </div>
  )
}

/** dragging something on the canvas by its bar (or sizing it by its edge), in canvas px */
function useDrag(page: string, block: Block, mode: 'move' | 'size') {
  return (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget
    const canvas = el.closest('.ros-canvas') as HTMLElement
    const start = localPoint(canvas, e.clientX, e.clientY)
    const from = { x: block.x, y: block.y, w: block.w }
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const [x, y] = localPoint(canvas, ev.clientX, ev.clientY)
      if (mode === 'move') act.updateBlock(page, block.id, { x: Math.max(0, from.x + x - start[0]), y: Math.max(0, from.y + y - start[1]) })
      else act.updateBlock(page, block.id, { w: Math.max(80, from.w + x - start[0]) })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
}

function TextBlock({ page, block, focus, onFocused }: { page: string; block: Extract<Block, { kind: 'text' }>; focus: boolean; onFocused: () => void }) {
  const body = useRef<HTMLDivElement>(null)
  // the text is the note's own while it's being typed in: only put the stored text in when it isn't
  useEffect(() => {
    const el = body.current
    if (el && document.activeElement !== el && el.innerHTML !== block.html) el.innerHTML = block.html
  }, [block.html])
  useEffect(() => {
    if (focus && body.current) {
      body.current.focus()
      onFocused()
    }
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    const el = body.current
    if (el) act.updateBlock(page, block.id, { html: el.innerHTML })
  }
  const empty = () => {
    const el = body.current
    return !!el && !el.textContent?.trim() && !el.querySelector('img,.ros-tag')
  }
  return (
    <div className="ros-note" style={{ left: block.x, top: block.y, width: block.w }}>
      <div className="ros-note-bar" onPointerDown={useDrag(page, block, 'move')} title="Drag to move" />
      <div
        ref={body}
        className="ros-note-body"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={save}
        onFocus={() => editor.focusNote(body.current)}
        onBlur={() => (empty() ? act.deleteBlock(page, block.id) : save())}
        onClick={(e) => {
          // a To Do box ticks
          const t = e.target as HTMLElement
          if (t.classList.contains('ros-tag-todo')) {
            t.dataset.on = t.dataset.on === '1' ? '0' : '1'
            save()
          }
        }}
      />
      <div className="ros-note-size" onPointerDown={useDrag(page, block, 'size')} />
    </div>
  )
}

function ImageBlock({ page, block }: { page: string; block: Extract<Block, { kind: 'image' }> }) {
  return (
    <div className="ros-note ros-note-img" style={{ left: block.x, top: block.y, width: block.w }} tabIndex={0} onKeyDown={(e) => (e.key === 'Delete' || e.key === 'Backspace') && act.deleteBlock(page, block.id)}>
      <div className="ros-note-bar" onPointerDown={useDrag(page, block, 'move')} title="Drag to move" />
      <img src={block.src} alt="" draggable={false} />
      <div className="ros-note-size" onPointerDown={useDrag(page, block, 'size')} />
    </div>
  )
}

/** a stroke as a smooth path (through the midpoints between its points) */
function pathOf(pts: [number, number][]) {
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}l0.01 0`
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]
    const [nx, ny] = pts[i + 1]
    d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`
  }
  const [lx, ly] = pts[pts.length - 1]
  return `${d}L${lx} ${ly}`
}

/** how near a point comes to a stroke */
function nearStroke(s: Stroke, x: number, y: number) {
  let best = Infinity
  for (let i = 0; i < s.pts.length; i++) {
    const [ax, ay] = s.pts[i]
    const [bx, by] = s.pts[Math.min(i + 1, s.pts.length - 1)]
    const dx = bx - ax
    const dy = by - ay
    const l = dx * dx + dy * dy
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y))
  }
  return best - s.width / 2
}

function Ink({ page, tool, height }: { page: Page; tool: Tool; height: number }) {
  const svg = useRef<SVGSVGElement>(null)
  const [live, setLive] = useState<Stroke | null>(null)
  const drawing = tool.kind === 'pen' || tool.kind === 'highlighter'
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || tool.kind === 'type') return
    e.preventDefault()
    const el = svg.current!
    el.setPointerCapture(e.pointerId)
    const at = (ev: { clientX: number; clientY: number }) => localPoint(el as unknown as HTMLElement, ev.clientX, ev.clientY)
    if (tool.kind === 'eraser') {
      const rub = (ev: { clientX: number; clientY: number }) => {
        const [x, y] = at(ev)
        const hit = page.ink.filter((s) => nearStroke(s, x, y) < 6).map((s) => s.id)
        if (hit.length) act.eraseStrokes(page.id, hit)
      }
      rub(e)
      const move = (ev: PointerEvent) => rub(ev)
      const up = () => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      return
    }
    const s: Stroke = { id: uid(), tool: tool.kind as Stroke['tool'], color: tool.color, width: tool.width, pts: [at(e)] }
    setLive(s)
    const move = (ev: PointerEvent) => {
      const p = at(ev)
      const last = s.pts[s.pts.length - 1]
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return
      s.pts = [...s.pts, p]
      setLive({ ...s })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      setLive(null)
      act.addStroke(page.id, { ...s, pts: s.pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const strokes = live ? [...page.ink, live] : page.ink
  return (
    <svg ref={svg} className="ros-ink" width={PAPER_W} height={height} style={{ pointerEvents: tool.kind === 'type' ? 'none' : 'auto', cursor: drawing ? 'crosshair' : tool.kind === 'eraser' ? 'cell' : undefined }} onPointerDown={down}>
      {strokes.map((s) => (
        <path
          key={s.id}
          d={pathOf(s.pts)}
          fill="none"
          stroke={s.color}
          strokeWidth={s.width}
          strokeLinecap={s.tool === 'highlighter' ? 'butt' : 'round'}
          strokeLinejoin="round"
          opacity={s.tool === 'highlighter' ? 0.42 : 1}
          style={s.tool === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
        />
      ))}
    </svg>
  )
}
