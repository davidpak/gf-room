/**
 * The ribbon's hands on the text: it formats whatever's selected in the note being typed in (the
 * browser's own editing commands), and remembers that selection while a ribbon control has the
 * focus (a font menu, a colour), putting it back before it acts.
 */
export type Tool =
  | { kind: 'type' }
  | { kind: 'pen'; color: string; width: number }
  | { kind: 'highlighter'; color: string; width: number }
  | { kind: 'eraser' }

let note: HTMLElement | null = null
let range: Range | null = null

if (typeof document !== 'undefined') {
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection()
    if (!sel || !sel.rangeCount) return
    const r = sel.getRangeAt(0)
    const host = (r.commonAncestorContainer instanceof Element ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement)?.closest('.ros-note-body')
    if (host) {
      note = host as HTMLElement
      range = r.cloneRange()
    }
  })
}

function restore() {
  if (!note || !range || !note.isConnected) return false
  note.focus({ preventScroll: true })
  const sel = document.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

export const editor = {
  focusNote(el: HTMLElement | null) {
    note = el
  },
  /** a browser editing command on the selection (bold, a colour, a list...) */
  exec(cmd: string, value?: string) {
    if (!restore()) return
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, value)
  },
  /** the font size in points (the browser's own sizes are 1-7: set 7, then swap it for the size) */
  size(pt: number) {
    if (!restore() || !note) return
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontSize', false, '7')
    note.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span')
      span.style.fontSize = `${pt}pt`
      span.innerHTML = f.innerHTML
      f.replaceWith(span)
    })
    note.dispatchEvent(new Event('input', { bubbles: true }))
  },
  /** put something at the caret (a tag, the date) */
  insert(html: string) {
    if (!restore()) return
    document.execCommand('insertHTML', false, html)
  },
  hasNote: () => !!note && note.isConnected,
}

/** a point on an element, in its own px: the laptop's screen is shown in 3D, so the page is scaled
 *  on the way to the screen (head-on, evenly), and the page itself can be zoomed */
export function localPoint(el: HTMLElement, clientX: number, clientY: number): [number, number] {
  const r = el.getBoundingClientRect()
  const k = r.width / (el.offsetWidth || (el as unknown as SVGSVGElement).width?.baseVal?.value || r.width)
  return [(clientX - r.left) / k, (clientY - r.top) / k]
}
