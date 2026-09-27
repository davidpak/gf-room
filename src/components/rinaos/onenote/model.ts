import { useSyncExternalStore } from 'react'
import { seedLibrary } from './seed'

/**
 * OneNote's own way of keeping things, as Rina knows it:
 *
 *   notebooks   each its own colour; one open at a time (the notebook list drops down from its name)
 *   sections    coloured tabs down the notebook (rename, recolour, delete from a right-click)
 *   pages       down each section, a page can be a subpage (indented under the one above it)
 *   a page      a title and the date and time it was made, then a free canvas: click anywhere and
 *               type (a note container starts there), drag containers by their top bar, pictures,
 *               ink drawn over everything in pens and highlighters; its paper colour and rule lines
 *
 * No saving: every change is kept as it's made (here, in this browser: localStorage), and she comes
 * back to the page she was on.
 */
export type Stroke = { id: string; tool: 'pen' | 'highlighter'; color: string; width: number; pts: [number, number][] }
export type Block =
  | { id: string; kind: 'text'; x: number; y: number; w: number; html: string }
  | { id: string; kind: 'image'; x: number; y: number; w: number; src: string }
export type Rules = 'none' | 'narrow' | 'college' | 'grid'
export type Page = { id: string; title: string; created: number; level: 0 | 1 | 2; blocks: Block[]; ink: Stroke[]; paper?: string; rules?: Rules }
export type Section = { id: string; name: string; color: string; pages: Page[] }
export type Notebook = { id: string; name: string; color: string; sections: Section[] }
export type Library = { version: 1; notebooks: Notebook[]; at: { notebook: string; section: string; page: string } }

/** OneNote's section colours */
export const SECTION_COLORS = ['#8aa8e4', '#91baae', '#8cbf7b', '#f5d270', '#f7a95c', '#f38f8f', '#e28cc2', '#b49edc', '#9fb6cd', '#c4b2d8', '#d7c3a4', '#c8d97b', '#a9d18e', '#7cc4c9', '#e8a198', '#b8b8b8']
export const NOTEBOOK_COLORS = ['#7719aa', '#2b579a', '#217346', '#d24726', '#c43e1c', '#0078d4', '#e3008c', '#5c2d91']

export const uid = () => Math.random().toString(36).slice(2, 10)

const KEY = 'rinaos.onenote.v1'
function load(): Library {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const lib = JSON.parse(raw) as Library
      if (lib.version === 1 && lib.notebooks.length) return lib
    }
  } catch {
    // (no storage here, or it's unreadable: start from the seed)
  }
  return seedLibrary()
}

let lib: Library = load()
let saveTimer = 0
let saveError = ''
const subs = new Set<() => void>()
function commit(next: Library) {
  lib = next
  subs.forEach((f) => f())
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lib))
      saveError = ''
    } catch {
      saveError = 'This browser is out of room for notes (pictures take the most).'
    }
    subs.forEach((f) => f())
  }, 350)
}
export const useLibrary = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => lib)
export const saveProblem = () => saveError

// ---- finding things
export const findNotebook = (l: Library, id = l.at.notebook) => l.notebooks.find((n) => n.id === id) ?? l.notebooks[0]
export const findSection = (l: Library, nb = findNotebook(l), id = l.at.section) => nb.sections.find((s) => s.id === id) ?? nb.sections[0]
export const findPage = (l: Library, sec = findSection(l), id = l.at.page) => sec?.pages.find((p) => p.id === id) ?? sec?.pages[0]

// ---- changing things (each a new library, sharing what didn't change)
const mapNotebook = (id: string, f: (n: Notebook) => Notebook) => ({ ...lib, notebooks: lib.notebooks.map((n) => (n.id === id ? f(n) : n)) })
const mapSection = (id: string, f: (s: Section) => Section) =>
  ({ ...lib, notebooks: lib.notebooks.map((n) => (n.sections.some((s) => s.id === id) ? { ...n, sections: n.sections.map((s) => (s.id === id ? f(s) : s)) } : n)) })
const mapPage = (id: string, f: (p: Page) => Page) =>
  ({
    ...lib,
    notebooks: lib.notebooks.map((n) => ({
      ...n,
      sections: n.sections.map((s) => (s.pages.some((p) => p.id === id) ? { ...s, pages: s.pages.map((p) => (p.id === id ? f(p) : p)) } : s)),
    })),
  })

export const blankPage = (title = ''): Page => ({ id: uid(), title, created: Date.now(), level: 0, blocks: [], ink: [] })

export const act = {
  go(at: Partial<Library['at']>) {
    const next = { ...lib, at: { ...lib.at, ...at } }
    // keep it consistent: a notebook's first section, a section's first page
    const nb = findNotebook(next)
    const sec = nb.sections.find((s) => s.id === next.at.section) ?? nb.sections[0]
    const page = sec?.pages.find((p) => p.id === next.at.page) ?? sec?.pages[0]
    commit({ ...next, at: { notebook: nb.id, section: sec?.id ?? '', page: page?.id ?? '' } })
  },
  addNotebook(name: string) {
    const page = blankPage('Untitled Page')
    const sec: Section = { id: uid(), name: 'New Section 1', color: SECTION_COLORS[0], pages: [page] }
    const nb: Notebook = { id: uid(), name, color: NOTEBOOK_COLORS[lib.notebooks.length % NOTEBOOK_COLORS.length], sections: [sec] }
    commit({ ...lib, notebooks: [...lib.notebooks, nb], at: { notebook: nb.id, section: sec.id, page: page.id } })
  },
  renameNotebook: (id: string, name: string) => commit(mapNotebook(id, (n) => ({ ...n, name }))),
  addSection(notebook: string) {
    const nb = lib.notebooks.find((n) => n.id === notebook)!
    const page = blankPage('Untitled Page')
    const sec: Section = { id: uid(), name: `New Section ${nb.sections.length + 1}`, color: SECTION_COLORS[nb.sections.length % SECTION_COLORS.length], pages: [page] }
    commit({ ...mapNotebook(notebook, (n) => ({ ...n, sections: [...n.sections, sec] })), at: { notebook, section: sec.id, page: page.id } })
    return sec.id
  },
  renameSection: (id: string, name: string) => commit(mapSection(id, (s) => ({ ...s, name: name.trim() || s.name }))),
  colorSection: (id: string, color: string) => commit(mapSection(id, (s) => ({ ...s, color }))),
  deleteSection(id: string) {
    const nb = lib.notebooks.find((n) => n.sections.some((s) => s.id === id))!
    if (nb.sections.length <= 1) return // (a notebook keeps one section)
    commit(mapNotebook(nb.id, (n) => ({ ...n, sections: n.sections.filter((s) => s.id !== id) })))
    act.go({})
  },
  moveSection(id: string, by: -1 | 1) {
    const nb = lib.notebooks.find((n) => n.sections.some((s) => s.id === id))!
    const i = nb.sections.findIndex((s) => s.id === id)
    const j = i + by
    if (j < 0 || j >= nb.sections.length) return
    const sections = nb.sections.slice()
    ;[sections[i], sections[j]] = [sections[j], sections[i]]
    commit(mapNotebook(nb.id, (n) => ({ ...n, sections })))
  },
  addPage(section: string, after?: string, level: 0 | 1 | 2 = 0) {
    const page = { ...blankPage(''), level }
    commit({
      ...mapSection(section, (s) => {
        const pages = s.pages.slice()
        const i = after ? pages.findIndex((p) => p.id === after) : pages.length - 1
        pages.splice(i + 1, 0, page)
        return { ...s, pages }
      }),
      at: { ...lib.at, section, page: page.id },
    })
    return page.id
  },
  deletePage(id: string) {
    const sec = lib.notebooks.flatMap((n) => n.sections).find((s) => s.pages.some((p) => p.id === id))!
    const pages = sec.pages.filter((p) => p.id !== id)
    commit(mapSection(sec.id, (s) => ({ ...s, pages: pages.length ? pages : [blankPage('Untitled Page')] })))
    act.go({})
  },
  movePage(id: string, by: -1 | 1) {
    const sec = lib.notebooks.flatMap((n) => n.sections).find((s) => s.pages.some((p) => p.id === id))!
    const i = sec.pages.findIndex((p) => p.id === id)
    const j = i + by
    if (j < 0 || j >= sec.pages.length) return
    const pages = sec.pages.slice()
    ;[pages[i], pages[j]] = [pages[j], pages[i]]
    commit(mapSection(sec.id, (s) => ({ ...s, pages })))
  },
  setLevel: (id: string, level: 0 | 1 | 2) => commit(mapPage(id, (p) => ({ ...p, level }))),
  setTitle: (id: string, title: string) => commit(mapPage(id, (p) => ({ ...p, title }))),
  setPaper: (id: string, paper: string) => commit(mapPage(id, (p) => ({ ...p, paper }))),
  setRules: (id: string, rules: Rules) => commit(mapPage(id, (p) => ({ ...p, rules }))),
  addBlock(page: string, block: Block) {
    commit(mapPage(page, (p) => ({ ...p, blocks: [...p.blocks, block] })))
  },
  updateBlock(page: string, id: string, patch: Partial<Block>) {
    commit(mapPage(page, (p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)) })))
  },
  deleteBlock(page: string, id: string) {
    commit(mapPage(page, (p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== id) })))
  },
  addStroke: (page: string, s: Stroke) => commit(mapPage(page, (p) => ({ ...p, ink: [...p.ink, s] }))),
  eraseStrokes: (page: string, ids: string[]) => commit(mapPage(page, (p) => ({ ...p, ink: p.ink.filter((s) => !ids.includes(s.id)) }))),
}

/** the words on a page (for search and the page list's previews) */
export function pageText(p: Page) {
  const div = document.createElement('div')
  div.innerHTML = p.blocks.map((b) => (b.kind === 'text' ? b.html : '')).join(' ')
  return `${p.title} ${div.textContent ?? ''}`
}
