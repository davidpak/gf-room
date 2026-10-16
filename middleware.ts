import { createHmac, timingSafeEqual } from 'node:crypto'
import { next } from '@vercel/functions'

/**
 * The whole site behind one password (Vercel Routing Middleware: it runs before every request, the page and every
 * file under it: photos, models, scripts). The password and the signing key live only in the project's environment
 * variables (SITE_PASSWORD, AUTH_SECRET), never in the code or the bundle.
 *
 *   /__login    the password form (GET), and checking it (POST): right, a signed session cookie and back to where
 *               you were going; wrong, the form again, after a pause (slows guessing)
 *   /__logout   the cookie cleared
 *   else        a valid session goes through untouched; a page without one is sent to the form, anything else 401
 *
 * The session: `<expiry>.<HMAC-SHA256(AUTH_SECRET, expiry + the password's own MAC)>`, in an HttpOnly, Secure,
 * SameSite=Lax, __Host- cookie for 30 days. Changing the password (or the key) signs everyone out. Not configured:
 * nothing is served (fails closed).
 */
const COOKIE = '__Host-rr_session'
const LOGIN = '/__login'
const LOGOUT = '/__logout'
const MAX_AGE = 60 * 60 * 24 * 30
const NO_STORE = { 'Cache-Control': 'no-store' }

const mac = (key: string, data: string) => createHmac('sha256', key).update(data).digest('base64url')
const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
const sessionFor = (key: string, password: string, exp: number) => mac(key, `session:${exp}:${mac(key, `pw:${password}`)}`)

function hasSession(request: Request, key: string, password: string) {
  const m = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-rr_session=([^;]+)/)
  if (!m) return false
  const [exp, sig] = decodeURIComponent(m[1]).split('.')
  const t = Number(exp)
  if (!sig || !Number.isFinite(t) || t < Date.now() / 1000) return false
  return same(sig, sessionFor(key, password, t))
}

/** where to go after signing in: a path on this site only (never another site's URL) */
function safeNext(v: unknown) {
  const s = typeof v === 'string' ? v : ''
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') && !s.startsWith(LOGIN) ? s : '/'
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function form(nextPath: string, wrong: boolean, status: number) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>&#9829;</title>
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: #1b1530; font: 16px/1.4 system-ui, sans-serif; color: #f3ecff; }
  form { display: flex; flex-direction: column; gap: 12px; width: min(280px, 80vw); }
  input, button { font: inherit; padding: 12px 14px; border-radius: 12px; border: 1px solid #4a3f72; }
  input { background: #241c3d; color: inherit; outline: none; }
  input:focus { border-color: #b9a6ff; }
  button { background: #b9a6ff; color: #1b1530; border: 0; font-weight: 600; cursor: pointer; }
  p { margin: 0; text-align: center; color: #ffb3c7; font-size: 14px; }
</style></head>
<body><form method="post" action="${LOGIN}" autocomplete="on">
  <input type="password" name="password" aria-label="password" autocomplete="current-password" autofocus required>
  <input type="hidden" name="next" value="${esc(nextPath)}">
  <button type="submit">&#9829;</button>
  ${wrong ? '<p>not quite</p>' : ''}
</form></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } })
}

export default async function middleware(request: Request) {
  const key = process.env.AUTH_SECRET ?? ''
  const password = process.env.SITE_PASSWORD ?? ''
  if (key.length < 32 || password.length === 0) return new Response('Unavailable', { status: 503, headers: NO_STORE })

  const url = new URL(request.url)

  if (url.pathname === LOGOUT) {
    return new Response(null, {
      status: 303,
      headers: { Location: LOGIN, 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`, ...NO_STORE },
    })
  }

  if (url.pathname === LOGIN) {
    if (request.method !== 'POST') return form(safeNext(url.searchParams.get('next')), false, 200)
    // (a form posted from another site is refused)
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403, headers: NO_STORE })
    const body = await request.formData().catch(() => null)
    const given = String(body?.get('password') ?? '')
    const to = safeNext(body?.get('next'))
    if (!same(mac(key, `pw:${given}`), mac(key, `pw:${password}`))) {
      await new Promise((r) => setTimeout(r, 900))
      return form(to, true, 401)
    }
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE
    return new Response(null, {
      status: 303,
      headers: {
        Location: to,
        'Set-Cookie': `${COOKIE}=${exp}.${sessionFor(key, password, exp)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        ...NO_STORE,
      },
    })
  }

  if (hasSession(request, key, password)) return next()

  const page = request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')
  if (page) {
    const back = encodeURIComponent(url.pathname + url.search)
    return new Response(null, { status: 303, headers: { Location: `${LOGIN}?next=${back}`, ...NO_STORE } })
  }
  return new Response('Unauthorized', { status: 401, headers: NO_STORE })
}
