/**
 * Records, to the standard, and pressing one from any album on Spotify.
 *
 * Sources
 *   [E4]   RIAA Bulletin E4 (1963) / IEC 60098:1987, the disc standard: 12" disc Ø 11.875 ± 0.031 in (301.6 mm);
 *          7" Ø 6.875 in (174.6 mm); centre hole 0.286 in (7.26 mm); 45's big hole 1.504 in (38.2 mm); recording
 *          starts (12") inside Ø 11.5 in (292.1) and must end outside Ø 4.75 in (120.65) — the run-out and label
 *          inside that; 7" from Ø 6.625 in (168.3) to no less than Ø 4.25 in (108).
 *   [SL]   the LP jacket: 12.375 in (314.3 mm) square; a 7" sleeve 7.25 in (184 mm).
 *   [TYP]  typical, not standard: an LP 140–180 g, 1.5–2 mm thick (taken 1.8); a groove ~0.1 mm apart at 33⅓
 *          (a side of 22–24 minutes fills one, longer and the cutting engineer squeezes the pitch); between songs
 *          a few turns cut wide apart, the band you can see; labels Ø 100 mm (12"), Ø 85 mm (7").
 *
 * Pressing (ours): an album's tracks, in order, are shared over sides (A, B, then C, D on a second disc… as real
 * double albums are), as evenly as they'll go, none over 24 minutes if it can help it. Each side's grooves run
 * inward from the lead-in at a steady pitch, the songs as bands with a gap between; where the needle lands (a
 * radius) is then a song and a point in it, and back. A single song is a 7" single at 45, the song on side A.
 */
export const IN = 25.4
export const LP = {
  r: (11.875 * IN) / 2, // 150.8 [E4]
  hole: (0.286 * IN) / 2, // 3.63 [E4]
  t: 1.8, // [TYP]
  start: (11.5 * IN) / 2, // 146.05: the lead-in, outermost groove [E4]
  endMin: (4.75 * IN) / 2, // 60.3: the last groove no further in than this [E4]
  label: 50, // Ø 100 [TYP]
  rpm: 100 / 3,
  sideMax: 24 * 60_000, // (ms: a side at the standard pitch)
  mass: 0.15, // kg [TYP]
  sleeve: 12.375 * IN, // 314.3 [SL]
  sleeveT: 3,
}
export const SINGLE = {
  r: (6.875 * IN) / 2, // 87.3 [E4]
  hole: (1.504 * IN) / 2, // 19.1 [E4]: the 45's big hole (an adapter on the spindle)
  t: 1.4, // [TYP]
  start: (6.625 * IN) / 2, // 84.1 [E4]
  endMin: (4.25 * IN) / 2, // 54.0 [E4]
  label: 42.5, // Ø 85 [TYP]
  rpm: 45,
  sideMax: 7.5 * 60_000, // (a 7" side: about 7½ minutes at 45)
  mass: 0.04,
  sleeve: 7.25 * IN, // 184.2 [SL]
  sleeveT: 1.5,
}
export type Size = typeof LP

/** the lead-in's few turns before the first song, and the wide-cut gap between songs, mm */
export const LEAD_IN = 1.6
export const GAP = 1.3
/** steady pitch: mm the groove moves inward per turn, so a side of sideMax just reaches endMin */
export const pitchOf = (s: Size) => (s.start - LEAD_IN - s.endMin) / ((s.sideMax / 60_000) * s.rpm)

export type In = { name: string; ms: number; artists?: string }
export type Band = { track: number; name: string; ms: number; r0: number; r1: number }
export type Side = { letter: string; bands: Band[]; ms: number; pitch: number; end: number }
export type Pressing = {
  size: 'lp' | 'single'
  uri: string
  title: string
  artist: string
  year: string
  cover: string
  /** two sides per disc */
  sides: Side[]
}

/** tracks split into n runs, in order, the longest run as short as it can be (the linear partition, by DP) */
export function partition(ms: number[], n: number): number[][] {
  const N = ms.length
  n = Math.max(1, Math.min(n, N))
  const pre = [0]
  for (const m of ms) pre.push(pre[pre.length - 1] + m)
  // best[k][i]: the longest run splitting the first i tracks into k runs; cut[k][i]: where the last run starts
  const best = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(Infinity))
  const cut = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(0))
  best[0][0] = 0
  for (let k = 1; k <= n; k++)
    for (let i = 1; i <= N; i++)
      for (let j = k - 1; j < i; j++) {
        const v = Math.max(best[k - 1][j], pre[i] - pre[j])
        if (v < best[k][i]) {
          best[k][i] = v
          cut[k][i] = j
        }
      }
  const runs: number[][] = []
  let i = N
  for (let k = n; k >= 1; k--) {
    const j = cut[k][i]
    runs.unshift(Array.from({ length: i - j }, (_, x) => j + x))
    i = j
  }
  return runs
}

/** one side's bands: inward from the lead-in at the steady pitch, squeezed only if it won't otherwise fit */
export function cutSide(size: Size, letter: string, tracks: { i: number; t: In }[]): Side {
  const ms = tracks.reduce((a, x) => a + x.t.ms, 0)
  const gaps = Math.max(0, tracks.length - 1) * GAP
  const room = size.start - LEAD_IN - size.endMin - gaps
  const turns = (ms / 60_000) * size.rpm
  const pitch = Math.min(pitchOf(size), turns > 0 ? room / turns : Infinity)
  let r = size.start - LEAD_IN
  const bands: Band[] = tracks.map(({ i, t }, k) => {
    if (k) r -= GAP
    const r0 = r
    r -= (t.ms / 60_000) * size.rpm * pitch
    return { track: i, name: t.name, ms: t.ms, r0, r1: r }
  })
  return { letter, bands, ms, pitch, end: r }
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function press(a: { uri: string; title: string; artist: string; year: string; cover: string; tracks: In[] }): Pressing {
  if (a.tracks.length === 1 && a.uri.startsWith('spotify:track:')) {
    // a single: the song on A; B is left smooth (no B-side to put there)
    return { ...a, size: 'single', sides: [cutSide(SINGLE, 'A', [{ i: 0, t: a.tracks[0] }]), cutSide(SINGLE, 'B', [])] }
  }
  const total = a.tracks.reduce((s, t) => s + t.ms, 0)
  let n = Math.max(2, 2 * Math.ceil(total / (2 * LP.sideMax)))
  // (more sides than songs can't be; a long side then squeezes its pitch)
  n = Math.min(n, a.tracks.length + (a.tracks.length % 2))
  const runs = partition(
    a.tracks.map((t) => t.ms),
    n,
  )
  const sides = runs.map((run, k) => cutSide(LP, LETTERS[k], run.map((i) => ({ i, t: a.tracks[i] }))))
  while (sides.length % 2) sides.push(cutSide(LP, LETTERS[sides.length], [])) // (an odd last side: left smooth)
  return { ...a, size: 'lp', sides }
}

export const sizeOf = (p: Pressing) => (p.size === 'lp' ? LP : SINGLE)

/** where the needle lands, as a song and a point in it (null: the lead-in, the run-out, the label: nothing there) */
export function atRadius(side: Side, r: number): { band: number; ms: number } | null {
  for (let k = 0; k < side.bands.length; k++) {
    const b = side.bands[k]
    // (on the lead-in or a gap: the start of the song after it)
    const top = k === 0 ? b.r0 + LEAD_IN : side.bands[k - 1].r1
    if (r <= top && r >= b.r1) {
      const f = Math.max(0, Math.min(1, (b.r0 - r) / (b.r0 - b.r1)))
      return { band: k, ms: f * b.ms }
    }
  }
  return null
}

/** where the needle is, for a song and a point in it */
export function radiusAt(side: Side, band: number, ms: number) {
  const b = side.bands[band]
  return b.r0 - (b.r0 - b.r1) * Math.max(0, Math.min(1, ms / b.ms))
}

export type Check = { what: string; value: string; ok: boolean }
export function checkVinyl(): Check[] {
  const out: Check[] = []
  const c = (what: string, value: string, ok: boolean) => out.push({ what, value, ok })
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
  c('12" disc Ø 301.6 ± 0.8 [E4]', `${(2 * LP.r).toFixed(1)} mm`, near(2 * LP.r, 301.6, 0.8))
  c('7" disc Ø 174.6 ± 0.8 [E4]', `${(2 * SINGLE.r).toFixed(1)} mm`, near(2 * SINGLE.r, 174.6, 0.8))
  c('centre hole Ø 7.26 (fits a 7.0 spindle) [E4]', `${(2 * LP.hole).toFixed(2)} mm`, 2 * LP.hole > 7)
  c('jacket 314.3 square, clear of the disc', `${LP.sleeve.toFixed(1)} vs ${(2 * LP.r).toFixed(1)}`, LP.sleeve > 2 * LP.r + 8)
  c('label inside the last groove (12")', `Ø ${2 * LP.label} < Ø ${(2 * LP.endMin).toFixed(1)}`, LP.label < LP.endMin - 5)
  c('label inside the last groove (7")', `Ø ${2 * SINGLE.label} < Ø ${(2 * SINGLE.endMin).toFixed(1)}`, SINGLE.label < SINGLE.endMin - 5)
  c('pitch at 33⅓ about 0.1 mm a turn [TYP]', `${pitchOf(LP).toFixed(3)} mm`, pitchOf(LP) > 0.07 && pitchOf(LP) < 0.15)
  c('pitch at 45 (7") about 0.1 mm a turn [TYP]', `${pitchOf(SINGLE).toFixed(3)} mm`, pitchOf(SINGLE) > 0.06 && pitchOf(SINGLE) < 0.15)
  // an album of ten 4-minute songs: 40 minutes, sides A and B of 20
  const ten = press({ uri: 'spotify:album:x', title: 't', artist: 'a', year: '', cover: '', tracks: Array.from({ length: 10 }, (_, i) => ({ name: `s${i}`, ms: 240_000 })) })
  c('40-minute album: one disc, 5 + 5', ten.sides.map((s) => s.bands.length).join(' + '), ten.sides.length === 2 && ten.sides[0].bands.length === 5)
  c('a 20-minute side stops short of the run-out', `ends Ø ${(2 * ten.sides[0].end).toFixed(0)}`, ten.sides[0].end > LP.endMin)
  // 70 minutes, 14 × 5: a double album, four sides
  const long = press({ uri: 'spotify:album:y', title: 't', artist: 'a', year: '', cover: '', tracks: Array.from({ length: 14 }, (_, i) => ({ name: `s${i}`, ms: 300_000 })) })
  c('70-minute album: two discs (A–D), none over 24 min', long.sides.map((s) => `${s.letter} ${(s.ms / 60000).toFixed(0)}`).join(', '), long.sides.length === 4 && long.sides.every((s) => s.ms <= LP.sideMax))
  // a 30-minute song on one side: squeezed, still inside the standard
  const epic = press({ uri: 'spotify:album:z', title: 't', artist: 'a', year: '', cover: '', tracks: [{ name: 'long', ms: 30 * 60_000 }] })
  c('one 30-min song: squeezed, still ends ≥ Ø 120.65', `pitch ${epic.sides[0].pitch.toFixed(3)}, ends Ø ${(2 * epic.sides[0].end).toFixed(1)}`, epic.sides[0].end >= LP.endMin - 1e-6)
  // needle → song → needle
  const s = ten.sides[0]
  const back = atRadius(s, radiusAt(s, 2, 90_000))
  c('needle at song 3, 1:30 → reads back', back ? `song ${back.band + 1}, ${(back.ms / 1000).toFixed(1)} s` : 'nothing', !!back && back.band === 2 && near(back.ms, 90_000, 1))
  c('needle on the label: nothing', String(atRadius(s, LP.label - 2)), atRadius(s, LP.label - 2) === null)
  const single = press({ uri: 'spotify:track:q', title: 't', artist: 'a', year: '', cover: '', tracks: [{ name: 'song', ms: 200_000 }] })
  c('a song alone → a 7" at 45', `${single.size}, ${single.sides[0].bands.length} band`, single.size === 'single' && single.sides[0].end > SINGLE.endMin)
  return out
}
