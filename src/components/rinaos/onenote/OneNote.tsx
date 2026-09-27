import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SECTION_COLORS, act, findNotebook, findPage, findSection, pageText, saveProblem, uid, useLibrary, type Page, type Rules, type Section } from './model'
import { editor, type Tool } from './editor'
import { PageView } from './Page'
import { Glyph } from '../icons'

/**
 * OneNote (./model for how it keeps things): the ribbon (Home, Insert, Draw, View) over the notebook
 * pane (the notebook's name, a list of the others dropping down from it; search; its sections; the
 * open section's pages) and the page.
 */
type Tab = 'Home' | 'Insert' | 'Draw' | 'View'
type Menu = { x: number; y: number; items: { label: string; run?: () => void; colors?: (c: string) => void; danger?: boolean }[] } | null

export function OneNote() {
  const lib = useLibrary()
  const nb = findNotebook(lib)
  const sec = findSection(lib, nb)
  const page = findPage(lib, sec)
  const [tab, setTab] = useState<Tab>('Home')
  const [tool, setTool] = useState<Tool>({ kind: 'type' })
  const [zoom, setZoom] = useState(1)
  const [menu, setMenu] = useState<Menu>(null)
  const [query, setQuery] = useState('')
  const [books, setBooks] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  useEffect(() => {
    if (!menu && !books) return
    const close = () => {
      setMenu(null)
      setBooks(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu, books])

  const sectionMenu = (s: Section, x: number, y: number) =>
    setMenu({
      x,
      y,
      items: [
        { label: 'Rename', run: () => setRenaming(s.id) },
        { label: 'Section Color', colors: (c) => act.colorSection(s.id, c) },
        { label: 'Move Up', run: () => act.moveSection(s.id, -1) },
        { label: 'Move Down', run: () => act.moveSection(s.id, 1) },
        { label: 'Delete Section', run: () => act.deleteSection(s.id), danger: true },
      ],
    })
  const pageMenu = (p: Page, x: number, y: number) =>
    setMenu({
      x,
      y,
      items: [
        p.level < 2 ? { label: p.level ? 'Make Subpage (deeper)' : 'Make Subpage', run: () => act.setLevel(p.id, (p.level + 1) as 1 | 2) } : { label: 'Make Subpage (deeper)' },
        p.level > 0 ? { label: 'Promote Subpage', run: () => act.setLevel(p.id, (p.level - 1) as 0 | 1) } : { label: 'Promote Subpage' },
        { label: 'New Page Below', run: () => act.addPage(sec.id, p.id, p.level) },
        { label: 'Move Up', run: () => act.movePage(p.id, -1) },
        { label: 'Move Down', run: () => act.movePage(p.id, 1) },
        { label: 'Delete Page', run: () => act.deletePage(p.id), danger: true },
      ],
    })

  // search: every page in every notebook whose title or words have it
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return lib.notebooks.flatMap((n) =>
      n.sections.flatMap((s) =>
        s.pages
          .map((p) => ({ n, s, p, text: pageText(p) }))
          .filter((r) => r.text.toLowerCase().includes(q))
          .map((r) => {
            const i = r.text.toLowerCase().indexOf(q)
            return { ...r, snippet: r.text.slice(Math.max(0, i - 24), i + q.length + 40).trim() }
          }),
      ),
    )
  }, [query, lib])

  const problem = saveProblem()
  return (
    <div className="ros-on" onContextMenu={(e) => e.preventDefault()}>
      <Ribbon tab={tab} setTab={setTab} tool={tool} setTool={setTool} page={page} zoom={zoom} setZoom={setZoom} />
      <div className="ros-on-main">
        <nav className="ros-nav">
          <div className="ros-nav-book" onPointerDown={(e) => e.stopPropagation()}>
            <button className="ros-book-btn" onClick={() => setBooks(!books)}>
              <Glyph name="book" color={nb.color} />
              <span>{nb.name}</span>
              <Glyph name="chevron" />
            </button>
            {books && (
              <div className="ros-books">
                {lib.notebooks.map((n) => (
                  <button key={n.id} className={n.id === nb.id ? 'on' : ''} onClick={() => (act.go({ notebook: n.id, section: '', page: '' }), setBooks(false))}>
                    <Glyph name="book" color={n.color} /> {n.name}
                  </button>
                ))}
                <AddNotebook done={() => setBooks(false)} />
              </div>
            )}
          </div>
          <div className="ros-search">
            <Glyph name="search" />
            <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
            {query && (
              <button onClick={() => setQuery('')} title="Clear">
                ×
              </button>
            )}
          </div>
          {results ? (
            <div className="ros-results">
              <div className="ros-col-head">{results.length ? `${results.length} result${results.length > 1 ? 's' : ''}` : 'No results'}</div>
              {results.map((r) => (
                <button key={r.p.id} onClick={() => act.go({ notebook: r.n.id, section: r.s.id, page: r.p.id })}>
                  <b>{r.p.title || 'Untitled Page'}</b>
                  <small>
                    <i style={{ background: r.s.color }} />
                    {r.n.name} › {r.s.name}
                  </small>
                  <span>{r.snippet}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ros-cols">
              <div className="ros-sections">
                {nb.sections.map((s) => (
                  <div
                    key={s.id}
                    className={`ros-section ${s.id === sec.id ? 'on' : ''}`}
                    style={{ ['--tab' as string]: s.color }}
                    onClick={() => act.go({ section: s.id, page: '' })}
                    onDoubleClick={() => setRenaming(s.id)}
                    onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), sectionMenu(s, e.clientX, e.clientY))}
                  >
                    <i />
                    {renaming === s.id ? <Rename value={s.name} done={(v) => (act.renameSection(s.id, v), setRenaming(null))} /> : <span>{s.name}</span>}
                  </div>
                ))}
                <button className="ros-add" onClick={() => setRenaming(act.addSection(nb.id))}>
                  <Glyph name="plus" /> Section
                </button>
              </div>
              <div className="ros-pages" style={{ ['--tab' as string]: sec.color }}>
                {sec.pages.map((p) => (
                  <div
                    key={p.id}
                    className={`ros-pagerow lv${p.level} ${p.id === page?.id ? 'on' : ''}`}
                    onClick={() => act.go({ page: p.id })}
                    onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), pageMenu(p, e.clientX, e.clientY))}
                  >
                    {p.title || <em>Untitled Page</em>}
                  </div>
                ))}
                <button className="ros-add" onClick={() => act.addPage(sec.id)}>
                  <Glyph name="plus" /> Page
                </button>
              </div>
            </div>
          )}
        </nav>
        {page ? <PageView key={page.id} page={page} tool={tool} zoom={zoom} /> : <div className="ros-page" />}
      </div>
      {problem && <div className="ros-toast">{problem}</div>}
      {menu && <ContextMenu menu={menu} close={() => setMenu(null)} />}
    </div>
  )
}

function Rename({ value, done }: { value: string; done: (v: string) => void }) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.select(), [])
  return (
    <input
      ref={ref}
      className="ros-rename"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(v)
        if (e.key === 'Escape') done(value)
      }}
      onClick={(e) => e.stopPropagation()}
      spellCheck={false}
    />
  )
}

function AddNotebook({ done }: { done: () => void }) {
  const [name, setName] = useState<string | null>(null)
  if (name === null)
    return (
      <button className="ros-books-add" onClick={() => setName('')}>
        <Glyph name="plus" /> Add Notebook
      </button>
    )
  return (
    <input
      autoFocus
      className="ros-rename"
      placeholder="Notebook name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && name.trim()) {
          act.addNotebook(name.trim())
          done()
        }
        if (e.key === 'Escape') done()
      }}
      spellCheck={false}
    />
  )
}

function ContextMenu({ menu, close }: { menu: NonNullable<Menu>; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ x: 0, y: 0 })
  useEffect(() => {
    // (the menu's placed in the window's own px: clientX/Y are the screen's, scaled in 3D)
    const host = ref.current?.offsetParent as HTMLElement | null
    if (!host) return
    const r = host.getBoundingClientRect()
    const k = r.width / host.offsetWidth
    setAt({ x: (menu.x - r.left) / k, y: (menu.y - r.top) / k })
  }, [menu])
  return (
    <div ref={ref} className="ros-menu" style={{ left: at.x, top: at.y }} onPointerDown={(e) => e.stopPropagation()}>
      {menu.items.map((it) =>
        it.colors ? (
          <div key={it.label} className="ros-menu-colors">
            <span>{it.label}</span>
            <div>
              {SECTION_COLORS.map((c) => (
                <button key={c} style={{ background: c }} onClick={() => (it.colors!(c), close())} />
              ))}
            </div>
          </div>
        ) : (
          <button key={it.label} disabled={!it.run} className={it.danger ? 'danger' : ''} onClick={() => (it.run?.(), close())}>
            {it.label}
          </button>
        ),
      )}
    </div>
  )
}

// ---- the ribbon
const FONTS = ['Calibri', 'Calibri Light', 'Arial', 'Georgia', 'Times New Roman', 'Comic Sans MS', 'Courier New', 'Gaegu']
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36]
const HIGHLIGHTS = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ffa6c9', '#ffc000']
const INKS = ['#1f1f1f', '#2b579a', '#c00000', '#00a651', '#7719aa', '#e3008c', '#ff8c00']
const PAPERS: [string, string][] = [['None', '#ffffff'], ['Yellow', '#fdf8e1'], ['Pink', '#fce8ef'], ['Blue', '#e6f1fb'], ['Green', '#e9f5e4'], ['Lavender', '#efe9f8'], ['Peach', '#fdeee3']]
const TAGS: [string, string, string][] = [
  ['To Do', 'todo', `<span class="ros-tag ros-tag-todo" data-on="0" contenteditable="false"></span>&nbsp;`],
  ['Important', 'star', `<span class="ros-tag ros-tag-star" contenteditable="false"></span>&nbsp;`],
  ['Question', 'question', `<span class="ros-tag ros-tag-question" contenteditable="false"></span>&nbsp;`],
  ['Critical', 'critical', `<span class="ros-tag ros-tag-critical" contenteditable="false"></span>&nbsp;`],
  ['Idea', 'idea', `<span class="ros-tag ros-tag-idea" contenteditable="false"></span>&nbsp;`],
]
const STICKERS = ['💜', '⭐', '✨', '🌸', '🍓', '☕', '📚', '🧪', '🧬', '✅', '❗', '😊', '🥹', '🐻', '🌈', '🎀']

/** a ribbon button: it doesn't take the focus (the selection in the note stays put) */
function RB({ icon, label, on, onClick, title, children, wide }: { icon?: string; label?: string; on?: boolean; onClick?: () => void; title?: string; children?: ReactNode; wide?: boolean }) {
  return (
    <button className={`ros-rb ${on ? 'on' : ''} ${wide ? 'wide' : ''}`} title={title ?? label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon && <Glyph name={icon} />}
      {label && <span>{label}</span>}
      {children}
    </button>
  )
}
function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="ros-rgroup">
      <div className="ros-rgroup-body">{children}</div>
      <div className="ros-rgroup-name">{name}</div>
    </div>
  )
}

function Ribbon({ tab, setTab, tool, setTool, page, zoom, setZoom }: { tab: Tab; setTab: (t: Tab) => void; tool: Tool; setTool: (t: Tool) => void; page?: Page; zoom: number; setZoom: (z: number) => void }) {
  const [hl, setHl] = useState(HIGHLIGHTS[0])
  const [fc, setFc] = useState('#c00000')
  const [stickers, setStickers] = useState(false)
  const pickFile = useRef<HTMLInputElement>(null)
  const now = () => new Date()
  const addPicture = (file: File) => {
    if (!page) return
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      // kept small enough to keep: at most 1400 px across, a JPEG
      const k = Math.min(1, 1400 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      const y = Math.max(24, ...page.blocks.map((b) => b.y + 120))
      act.addBlock(page.id, { id: uid(), kind: 'image', x: 48, y, w: Math.min(480, c.width), src: c.toDataURL('image/jpeg', 0.85) })
    }
    img.src = url
  }
  return (
    <div className="ros-ribbon">
      <div className="ros-tabs">
        {(['Home', 'Insert', 'Draw', 'View'] as Tab[]).map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="ros-rbody">
        {tab === 'Home' && (
          <>
            <Group name="Font">
              <div className="ros-rrow">
                <select className="ros-sel" defaultValue="Calibri" onChange={(e) => editor.exec('fontName', e.target.value)}>
                  {FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select className="ros-sel small" defaultValue="11" onChange={(e) => editor.size(Number(e.target.value))}>
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ros-rrow">
                <RB icon="bold" title="Bold" onClick={() => editor.exec('bold')} />
                <RB icon="italic" title="Italic" onClick={() => editor.exec('italic')} />
                <RB icon="underline" title="Underline" onClick={() => editor.exec('underline')} />
                <RB icon="strike" title="Strikethrough" onClick={() => editor.exec('strikeThrough')} />
                <span className="ros-split">
                  <RB icon="highlight" title="Highlight" onClick={() => editor.exec('hiliteColor', hl)}>
                    <i className="ros-swatch" style={{ background: hl }} />
                  </RB>
                  <Swatches colors={HIGHLIGHTS} pick={(c) => (setHl(c), editor.exec('hiliteColor', c))} />
                </span>
                <span className="ros-split">
                  <RB icon="fontcolor" title="Font Color" onClick={() => editor.exec('foreColor', fc)}>
                    <i className="ros-swatch" style={{ background: fc }} />
                  </RB>
                  <Swatches colors={INKS} pick={(c) => (setFc(c), editor.exec('foreColor', c))} />
                </span>
                <RB icon="clear" title="Clear Formatting" onClick={() => editor.exec('removeFormat')} />
              </div>
            </Group>
            <Group name="Paragraph">
              <div className="ros-rrow">
                <RB icon="bullets" title="Bullets" onClick={() => editor.exec('insertUnorderedList')} />
                <RB icon="numbers" title="Numbering" onClick={() => editor.exec('insertOrderedList')} />
                <RB icon="outdent" title="Decrease Indent" onClick={() => editor.exec('outdent')} />
                <RB icon="indent" title="Increase Indent" onClick={() => editor.exec('indent')} />
              </div>
              <div className="ros-rrow">
                <RB icon="alignl" title="Align Left" onClick={() => editor.exec('justifyLeft')} />
                <RB icon="alignc" title="Center" onClick={() => editor.exec('justifyCenter')} />
                <RB icon="alignr" title="Align Right" onClick={() => editor.exec('justifyRight')} />
              </div>
            </Group>
            <Group name="Styles">
              <div className="ros-styles">
                {(
                  [
                    ['Heading 1', 'h1'],
                    ['Heading 2', 'h2'],
                    ['Heading 3', 'h3'],
                    ['Normal', 'p'],
                    ['Quote', 'blockquote'],
                    ['Code', 'pre'],
                  ] as const
                ).map(([name, tag]) => (
                  <button key={tag} className={`ros-style s-${tag}`} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.exec('formatBlock', tag)}>
                    {name}
                  </button>
                ))}
              </div>
            </Group>
            <Group name="Tags">
              <div className="ros-tags">
                {TAGS.map(([name, cls, html]) => (
                  <button key={cls} className="ros-tagbtn" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.insert(html)}>
                    <span className={`ros-tag ros-tag-${cls}`} />
                    {name}
                  </button>
                ))}
              </div>
            </Group>
          </>
        )}
        {tab === 'Insert' && (
          <>
            <Group name="Images">
              <RB icon="picture" label="Picture" wide onClick={() => pickFile.current?.click()} />
              <input ref={pickFile} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && addPicture(e.target.files[0]), (e.target.value = ''))} />
            </Group>
            <Group name="Time Stamp">
              <RB icon="calendar" label="Date" wide onClick={() => editor.insert(now().toLocaleDateString())} />
              <RB icon="clock" label="Time" wide onClick={() => editor.insert(now().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))} />
              <RB icon="calclock" label="Date & Time" wide onClick={() => editor.insert(`${now().toLocaleDateString()} ${now().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`)} />
            </Group>
            <Group name="Stickers">
              <span className="ros-split">
                <RB icon="sticker" label="Stickers" wide onClick={() => setStickers(!stickers)} />
                {stickers && (
                  <div className="ros-pop ros-stickers" onMouseDown={(e) => e.preventDefault()}>
                    {STICKERS.map((s) => (
                      <button key={s} onClick={() => (editor.insert(s), setStickers(false))}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            </Group>
            <Group name="Symbols">
              {['→', '←', '↑', '↓', '⇌', 'α', 'β', 'Δ', 'µ', '±', '≈', '°'].map((s) => (
                <button key={s} className="ros-sym" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.insert(s)}>
                  {s}
                </button>
              ))}
            </Group>
          </>
        )}
        {tab === 'Draw' && (
          <>
            <Group name="Tools">
              <RB icon="cursor" label="Type" wide on={tool.kind === 'type'} onClick={() => setTool({ kind: 'type' })} />
              <RB icon="eraser" label="Eraser" wide on={tool.kind === 'eraser'} onClick={() => setTool({ kind: 'eraser' })} />
            </Group>
            <Group name="Pens">
              {INKS.map((c) => (
                <button key={c} className={`ros-pen ${tool.kind === 'pen' && tool.color === c ? 'on' : ''}`} onClick={() => setTool({ kind: 'pen', color: c, width: tool.kind === 'pen' ? tool.width : 2.5 })} title="Pen">
                  <Glyph name="pen" color={c} />
                </button>
              ))}
              {HIGHLIGHTS.slice(0, 4).map((c) => (
                <button key={c} className={`ros-pen ${tool.kind === 'highlighter' && tool.color === c ? 'on' : ''}`} onClick={() => setTool({ kind: 'highlighter', color: c, width: 14 })} title="Highlighter">
                  <Glyph name="marker" color={c} />
                </button>
              ))}
            </Group>
            <Group name="Thickness">
              {[1.5, 2.5, 4, 7].map((w) => (
                <button key={w} className={`ros-thick ${tool.kind === 'pen' && tool.width === w ? 'on' : ''}`} onClick={() => setTool({ kind: 'pen', color: tool.kind === 'pen' ? tool.color : INKS[0], width: w })} title={`${w} pt`}>
                  <i style={{ height: w, width: 22 }} />
                </button>
              ))}
            </Group>
          </>
        )}
        {tab === 'View' && page && (
          <>
            <Group name="Page Color">
              {PAPERS.map(([name, c]) => (
                <button key={c} className={`ros-paper ${(page.paper ?? '#ffffff') === c ? 'on' : ''}`} style={{ background: c }} title={name} onClick={() => act.setPaper(page.id, c)} />
              ))}
            </Group>
            <Group name="Rule Lines">
              {(['none', 'narrow', 'college', 'grid'] as Rules[]).map((r) => (
                <button key={r} className={`ros-rulebtn r-${r} ${(page.rules ?? 'none') === r ? 'on' : ''}`} onClick={() => act.setRules(page.id, r)}>
                  <i />
                  <span>{r === 'none' ? 'None' : r[0].toUpperCase() + r.slice(1)}</span>
                </button>
              ))}
            </Group>
            <Group name="Zoom">
              <RB icon="zoomout" title="Zoom Out" onClick={() => setZoom(Math.max(0.6, Math.round((zoom - 0.1) * 10) / 10))} />
              <span className="ros-zoom">{Math.round(zoom * 100)}%</span>
              <RB icon="zoomin" title="Zoom In" onClick={() => setZoom(Math.min(1.6, Math.round((zoom + 0.1) * 10) / 10))} />
              <RB label="100%" onClick={() => setZoom(1)} />
            </Group>
          </>
        )}
      </div>
    </div>
  )
}

function Swatches({ colors, pick }: { colors: string[]; pick: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="ros-caret" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        <Glyph name="chevron" />
      </button>
      {open && (
        <div className="ros-pop" onMouseDown={(e) => e.preventDefault()}>
          {colors.map((c) => (
            <button key={c} className="ros-swatch-btn" style={{ background: c }} onClick={() => (pick(c), setOpen(false))} />
          ))}
        </div>
      )}
    </>
  )
}
