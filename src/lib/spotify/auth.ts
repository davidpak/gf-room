/**
 * Logging in with Spotify, from the page alone (no server of ours): the authorization-code flow with PKCE. The page
 * sends her to Spotify's login with a secret it made up (the verifier, kept here); Spotify sends her back to /spotify
 * with a code, which the page trades, with the verifier, for the tokens. The access token lasts an hour and is
 * refreshed with the refresh token when it runs out. Kept in localStorage (this browser only).
 *
 * The app is David's on developer.spotify.com (development mode: only the accounts added there can log in). Its
 * redirect URIs are registered there too: http://127.0.0.1:5173/spotify (dev), :4173 (preview); the real site's
 * address goes there once it's hosted. (The client ID isn't a secret; the client secret isn't used, nor kept here.)
 */
export const CLIENT_ID = '3122e056a83849fb9444af8e2efc3dd2'
const SCOPES = [
  'streaming', // (the Web Playback SDK: this page plays)
  'user-read-email',
  'user-read-private', // (her account: Premium or not)
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read', // (her saved albums: the crate)
] // (no more than it uses: a token from before, which could see more, still does)
const KEY = 'spotify.tokens'
const PENDING = 'spotify.pending'
const redirect = () => `${location.origin}/spotify`

type Tokens = { access: string; refresh: string; expires: number; scope?: string }
const read = <T,>(k: string): T | null => {
  try {
    const s = localStorage.getItem(k)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}
const write = (k: string, v: unknown) => {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* (storage blocked: logged in for this visit only) */
  }
}
let tokens: Tokens | null = read<Tokens>(KEY)

const subs = new Set<() => void>()
export const onAuth = (f: () => void) => (subs.add(f), () => void subs.delete(f))
const tell = () => subs.forEach((f) => f())
export const loggedIn = () => !!tokens
/** logged in, but before the site asked for all it asks for now (the crates' top songs, what's played lately):
 *  logging in again grants the rest */
export const missingScopes = () => !!tokens && SCOPES.some((s) => !(tokens!.scope ?? '').split(' ').includes(s))

const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** off to Spotify's login; back to this very page afterwards */
export async function login() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)))
  write(PENDING, { verifier, state, back: location.href })
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirect(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES.join(' '),
    state,
  })
  location.assign(`https://accounts.spotify.com/authorize?${q}`)
}

export function logout() {
  tokens = null
  write(KEY, null)
  tell()
}

async function tokenRequest(body: Record<string, string>) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  })
  if (!r.ok) throw new Error(`Spotify token: ${r.status} ${await r.text()}`)
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
  tokens = { access: j.access_token, refresh: j.refresh_token ?? tokens?.refresh ?? '', expires: Date.now() + j.expires_in * 1000, scope: j.scope ?? tokens?.scope }
  write(KEY, tokens)
  tell()
}

/** /spotify: Spotify's sent her back. Trade the code for tokens and go back where she was. True if this was it */
export async function finishLogin() {
  if (location.pathname !== '/spotify') return false
  const q = new URLSearchParams(location.search)
  const pending = read<{ verifier: string; state: string; back: string }>(PENDING)
  write(PENDING, null)
  const back = pending?.back ?? '/'
  const code = q.get('code')
  if (code && pending && q.get('state') === pending.state) {
    try {
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect(), code_verifier: pending.verifier })
    } catch (e) {
      console.error(e)
    }
  }
  // (an error, or she said no: back all the same, still logged out)
  location.replace(back)
  return true
}

let refreshing: Promise<void> | null = null
/** a token good for at least the next minute, or null when logged out (or the refresh failed: logged out then) */
export async function accessToken(): Promise<string | null> {
  if (!tokens) return null
  if (Date.now() < tokens.expires - 60_000) return tokens.access
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh })
    .catch((e) => {
      console.error(e)
      logout()
    })
    .finally(() => (refreshing = null))
  await refreshing
  return tokens?.access ?? null
}
