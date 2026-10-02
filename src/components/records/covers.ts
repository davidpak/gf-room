import { useSyncExternalStore } from 'react'
import { CanvasTexture, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, Texture, Vector2, type WebGLRenderer } from 'three'
import { drawCover, inksOf, type Inks } from './art'
import type { Pressing } from './vinyl'

/**
 * Album covers, loaded the cheap way.
 *
 *   the sheet   every cover in the crate (and on the picks rack) is a square on one shared texture, 2048 across, 8 × 8
 *               squares of 256: a crate of 50 records is one draw with one texture (./Crate), not 50 of each. A
 *               cover's square is filled in place when it arrives (only its 256², not the whole sheet sent again).
 *               A record whose cover hasn't come yet shows the sheet's blank card: never a colour of its own
 *   close up    the record up (or out) gets its own 640 picture on top (`bigCover`), the few last used kept
 *   decoding    a picture's fetched (the browser's cache keeps it: Spotify's picture server isn't the API, it
 *               counts against nothing) and decoded off the page's thread (createImageBitmap), already at the size
 *               it's drawn: nothing is decoded or scaled while a frame's being drawn
 *
 * Each cover's colours (../art inksOf: its spine, its label) come with it.
 */
export const SHEET = { size: 2048, tile: 256 }
const PER = SHEET.size / SHEET.tile
const N = PER * PER
/** the blank card (square 0): what a jacket shows till its cover comes */
export const BLANK = '#e9dcc6'

export const sheet: DataTexture = (() => {
  const d = new Uint8Array(SHEET.size * SHEET.size * 4)
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(BLANK.slice(k, k + 2), 16))
  new Uint32Array(d.buffer).fill((255 << 24) | (b << 16) | (g << 8) | r)
  const t = new DataTexture(d, SHEET.size, SHEET.size, RGBAFormat)
  t.colorSpace = SRGBColorSpace
  t.generateMipmaps = true
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.anisotropy = 8
  t.flipY = false // (a picture's top row at the square's top: v counts down the sheet; ./Crate's shader knows)
  t.needsUpdate = true
  return t
})()

let gl: WebGLRenderer | null = null
const waiting: (() => void)[] = []
/** the renderer the sheet's squares are sent through (whoever draws the sheet says, once it's up). A new one (the
 *  page's canvas made again) starts from the blank sheet: every square there was is sent again */
export function useSheetRenderer(r: WebGLRenderer) {
  if (gl === r) return
  const again = !!gl
  gl = r
  if (again) for (const t of tiles.values()) if (t.ready && t.bitmap) put(t, t.bitmap)
  waiting.splice(0).forEach((f) => f())
}

type Tile = { i: number; key: string; ready: boolean; spine: Color; inks: Inks | null; used: number; bitmap?: ImageBitmap }
const tiles = new Map<string, Tile>()
const free = Array.from({ length: N - 1 }, (_, k) => N - 1 - k) // (0 is the blank card)
const wanted = new Map<string, Set<string>>()
let version = 0
const subs = new Set<() => void>()
const changed = () => {
  version++
  subs.forEach((f) => f())
}
/** bumped whenever a cover's square fills (those drawing from the sheet look again) */
export const sheetVersion = () => version
export const useSheetVersion = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), sheetVersion)

/** a cover's key on the sheet: its picture, or (none) the record itself, its cover drawn */
const keyOf = (p: Pressing) => p.thumb || p.cover || `drawn:${p.uri}`

/** (x0, y0, size) of a record's square on the sheet, in uv; and its spine's colour */
export function squareOf(p: Pressing, out: { x: number; y: number; s: number; spine: Color }) {
  const t = tiles.get(keyOf(p))
  const i = t?.ready ? t.i : 0
  out.x = ((i % PER) * SHEET.tile) / SHEET.size
  out.y = (Math.floor(i / PER) * SHEET.tile) / SHEET.size
  out.s = SHEET.tile / SHEET.size
  out.spine.set(t?.ready ? t.spine : BLANK)
  if (t) t.used = performance.now()
  return out
}
export const inksFor = (p: Pressing) => tiles.get(keyOf(p))?.inks ?? null

/** what `who` (a crate, the rack) shows now: their covers asked for, in order; squares nobody shows any more can go */
export function want(who: string, records: Pressing[]) {
  wanted.set(who, new Set(records.map(keyOf)))
  records.forEach((p) => {
    const k = keyOf(p)
    if (tiles.has(k)) return
    const i = free.pop() ?? evict()
    if (i == null) return
    const t: Tile = { i, key: k, ready: false, spine: new Color(BLANK), inks: null, used: performance.now() }
    tiles.set(k, t)
    queue(() => fill(t, p))
  })
}
function evict() {
  const all = new Set([...wanted.values()].flatMap((s) => [...s]))
  let old: Tile | null = null
  for (const t of tiles.values()) if (!all.has(t.key) && (!old || t.used < old.used)) old = t
  if (!old) return null
  tiles.delete(old.key)
  old.bitmap?.close()
  return old.i
}

// (a few pictures fetched at once)
let busy = 0
const line: (() => Promise<void>)[] = []
function queue(f: () => Promise<void>) {
  line.push(f)
  pump()
}
function pump() {
  while (busy < 6 && line.length) {
    const f = line.shift()!
    busy++
    void f().finally(() => {
      busy--
      pump()
    })
  }
}

/** a picture, fetched and decoded off the page's thread, at `px` square (`flip`: upside down, for a texture of its own) */
export async function bitmapOf(url: string, px: number, flip = false): Promise<ImageBitmap | null> {
  try {
    const r = await fetch(url, { mode: 'cors', cache: 'force-cache' })
    if (!r.ok) return null
    return await createImageBitmap(await r.blob(), { resizeWidth: px, resizeHeight: px, resizeQuality: 'high', imageOrientation: flip ? 'flipY' : 'from-image' })
  } catch {
    return null
  }
}
const drawn = (p: Pressing, px: number, flip = false) => createImageBitmap(drawCover(p.title, p.artist, px), { imageOrientation: flip ? 'flipY' : 'from-image' })

async function fill(t: Tile, p: Pressing) {
  const url = p.thumb || p.cover
  const bm = (url && (await bitmapOf(url, SHEET.tile))) || (await drawn(p, SHEET.tile))
  if (tiles.get(t.key) !== t) return bm.close() // (let go of meanwhile)
  // (the picture kept, 256 square: should the sheet ever have to be sent again)
  t.bitmap = bm
  t.inks = inksOf(bm)
  t.spine.set(t.inks.spine)
  if (gl) put(t, bm)
  else waiting.push(() => put(t, bm))
}
/** a cover into its square, on the GPU (just that square: the sheet isn't sent again) */
function put(t: Tile, bm: ImageBitmap) {
  if (tiles.get(t.key) !== t || !gl) return
  gl.copyTextureToTexture(new Texture(bm), sheet, null, new Vector2((t.i % PER) * SHEET.tile, Math.floor(t.i / PER) * SHEET.tile))
  t.ready = true
  changed()
}

/** a texture sent to the GPU now (between frames: not when it's first drawn, mid-frame) */
export const uploadSoon = (t: Texture) => gl?.initTexture(t)

// ---- close up: a cover's own picture, 640 (the few last used kept; older ones let go)
const big = new Map<string, Promise<Texture>>()
const bigTex = new Map<string, Texture>()
/** the record's cover at 640, as a texture of its own (sent to the GPU as soon as it's decoded, not mid-frame) */
export function bigCover(p: Pressing): Promise<Texture> {
  const k = p.cover || `drawn:${p.uri}`
  let f = big.get(k)
  if (f) {
    // (most recently used last)
    big.delete(k)
    big.set(k, f)
    return f
  }
  f = (async () => {
    const bm = (p.cover && (await bitmapOf(p.cover, 640, true))) || null
    const t: Texture = bm ? new Texture(bm) : new CanvasTexture(drawCover(p.title, p.artist, 640))
    if (bm) t.flipY = false // (flipped as it was decoded)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    t.needsUpdate = true
    gl?.initTexture(t)
    bigTex.set(k, t)
    return t
  })()
  big.set(k, f)
  while (big.size > 10) {
    const old = big.keys().next().value!
    big.delete(old)
    // (off the GPU; still whole, should whoever has it show it again)
    bigTex.get(old)?.dispose()
    bigTex.delete(old)
  }
  return f
}
