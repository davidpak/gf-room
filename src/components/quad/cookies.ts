import { useSyncExternalStore } from 'react'

/**
 * How many cookies the oven's handed out (the number on the canopy: ./CookieStand), after Bruno's
 * "accept cookie" count.
 *
 *   here       kept in this browser (localStorage), so it works as it is
 *   shared     one count for everyone who visits, once a counter's set up online and named in
 *              VITE_COOKIE_COUNTER (not yet: where it lives is David's call). Its contract: GET the url
 *              for { count }, POST to it to add one and get the new { count } back
 *
 * With the shared one, the page shows the larger of the two it knows (a slow or failed request never
 * makes the number go down).
 */
const KEY = 'quad-cookies'
const REMOTE = (import.meta.env.VITE_COOKIE_COUNTER as string | undefined) || null

let count = 0
try {
  count = Number(localStorage.getItem(KEY) ?? 0) || 0
} catch {
  /* (private windows: it starts at 0) */
}
const subs = new Set<() => void>()
const set = (n: number) => {
  if (n <= count) return
  count = n
  try {
    localStorage.setItem(KEY, String(n))
  } catch {
    /* (can't keep it: fine) */
  }
  subs.forEach((f) => f())
}
if (REMOTE && typeof window !== 'undefined')
  fetch(REMOTE)
    .then((r) => r.json())
    .then((j: { count?: number }) => typeof j.count === 'number' && set(j.count))
    .catch(() => {})

export const cookieCount = () => count
export const useCookieCount = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), cookieCount)
/** one more cookie handed out */
export function addCookie() {
  set(count + 1)
  if (REMOTE)
    fetch(REMOTE, { method: 'POST' })
      .then((r) => r.json())
      .then((j: { count?: number }) => typeof j.count === 'number' && set(j.count))
      .catch(() => {})
}
