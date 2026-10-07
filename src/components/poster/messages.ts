import { useEffect, useState } from 'react'

/**
 * Her friends' words of encouragement, from David's Google Form, for the poster (./Poster).
 *
 * How they get here: the form's responses go to a Google Sheet (Responses → Link to Sheets); that sheet is published
 * to the web as CSV (File → Share → Publish to web → the responses tab → CSV), and its address goes in SHEET_CSV
 * below. The page reads it when it opens: a new response is on the poster within Google's few minutes of caching,
 * no deploy, no keys. Only rows ticked in a "show" column (a checkbox column added to the sheet) go up, if there is
 * one: anyone with the form's link can write in, so each is looked at first.
 *
 * The columns are found by their headings: the name (a heading with "name" in it), the message (one with "message",
 * "encourage", "note", "say" or "write"; else the column with the longest answers), "show" if it's there. The last
 * good list is kept (this browser), so the poster has its notes even offline, or while Google is slow.
 */
// the form's responses sheet, as CSV (Google's query endpoint: it answers once the sheet's readable by link or
// published; the tab is the responses' gid)
export const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1Wkf1iTta1HZBK1M2R6k5CAFxyJzs4py1aj3rHrva93I/gviz/tq?tqx=out:csv&gid=141110143'

export type Note = { id: string; name: string; text: string }

/** CSV to rows (quotes, doubled quotes, commas and newlines inside quotes) */
export function parseCsv(s: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"' && s[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') row.push(cell), (cell = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** the sheet's rows as notes: the right columns found by their headings, unticked ones left out */
export function notesFrom(rows: string[][]): Note[] {
  if (rows.length < 2) return []
  const head = rows[0].map((h) => h.toLowerCase())
  const find = (...words: string[]) => head.findIndex((h) => words.some((w) => h.includes(w)))
  const name = find('name')
  const show = find('show', 'approve', 'ok?')
  let text = find('message', 'encourag', 'note', 'say', 'write')
  if (text < 0) {
    // (the column with the longest answers)
    let best = -1
    head.forEach((_, c) => {
      if (c === name || c === show || /time/.test(head[c])) return
      const len = rows.slice(1).reduce((a, r) => a + (r[c]?.length ?? 0), 0)
      if (best < 0 || len > rows.slice(1).reduce((a, r) => a + (r[best]?.length ?? 0), 0)) best = c
    })
    text = best
  }
  if (text < 0) return []
  const yes = (v: string) => /^(true|yes|y|x|✓|✔|1)$/i.test(v.trim())
  return rows
    .slice(1)
    .filter((r) => (r[text] ?? '').trim() && (show < 0 || yes(r[show] ?? '')))
    .map((r) => ({ id: `${r[0]}|${r[name] ?? ''}`, name: (r[name] ?? '').trim(), text: r[text].trim().replace(/\s+/g, ' ') }))
}

/** &demo[=n] on any page (the poster's, the room): n stand-in notes instead of the sheet's (50 if no n). Made up,
 *  only to see how they lay out and behave before the real ones come in; never shown without it */
const DEMO = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null
const SAYS = [
  'Rina, you are one of the kindest people I know.',
  'You always make everyone around you feel welcome, and I am so lucky to be your friend.',
  'Keep going! You work so hard and it shows in everything you do.',
  'Thank you for always listening to me.',
  'I hope you know how proud we all are of you.',
  'You light up every room you walk into.',
  'Never forget how strong you are.',
  'Remember to take breaks and be gentle with yourself, you deserve it.',
]
const WHO = ['Mia', 'Hannah', 'Jess', 'Olivia', 'Grace', 'Sam', 'Emily', 'Chloe', 'Ava', 'Sophie', 'Nina', 'Kate']
const DEMO_NOTES: Note[] = Array.from({ length: DEMO === null ? 0 : Number(DEMO) || 50 }, (_, i) => ({
  id: `demo${i}`,
  name: WHO[i % WHO.length],
  text: [0, 1, 2].slice(0, 1 + ((i * 7) % 3)).map((k) => SAYS[(i * 3 + k * 5) % SAYS.length]).join(' '),
}))

const KEPT = 'poster.notes'
/** the notes: the last kept at once, then the sheet's when it comes (&demo: the stand-ins) */
export function useNotes(): Note[] {
  const [notes, setNotes] = useState<Note[]>(() => {
    if (DEMO !== null) return DEMO_NOTES
    try {
      return JSON.parse(localStorage.getItem(KEPT) ?? '[]') as Note[]
    } catch {
      return []
    }
  })
  useEffect(() => {
    if (!SHEET_CSV || DEMO !== null) return
    let live = true
    fetch(SHEET_CSV, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((csv) => {
        const n = notesFrom(parseCsv(csv))
        if (!live) return
        setNotes(n)
        try {
          localStorage.setItem(KEPT, JSON.stringify(n))
        } catch {
          /* (no storage) */
        }
      })
      .catch((e) => console.warn('poster notes', e))
    return () => void (live = false)
  }, [])
  return notes
}
