/**
 * Her photos, from the originals to the site: `npm run photos`.
 *
 *   in    photos/incoming/<set>/...   (a set per folder: cherry = the UW cherry blossoms, misc = the rest;
 *                                     HEIC, JPEG or PNG, straight from Google Photos)
 *   out   public/photos/<set>/<name>.webp   at most 1600 px on the long side
 *         public/photos/<set>/<name>.t.webp a 480 px thumbnail
 *         public/photos/manifest.json       every photo: its set, files, size, and when it was taken
 *
 * Turned the right way up (EXIF orientation), stripped of their metadata. Videos are skipped for now.
 * Both folders are git-ignored: her photos stay on this machine until David decides where they live.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import exifr from 'exifr'
import heicConvert from 'heic-convert'

const IN = 'photos/incoming'
const OUT = 'public/photos'
const BIG = 1600
const THUMB = 480

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const manifest = []
for (const set of fs.readdirSync(IN, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
  fs.mkdirSync(path.join(OUT, set), { recursive: true })
  for (const file of walk(path.join(IN, set))) {
    if (!/\.(heic|jpe?g|png)$/i.test(file)) continue
    const name = path.basename(file).replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_')
    const taken = (await exifr.parse(file, { pick: ['DateTimeOriginal'] }).catch(() => null))?.DateTimeOriginal ?? null
    let input = fs.readFileSync(file)
    if (/\.heic$/i.test(file)) input = Buffer.from(await heicConvert({ buffer: input, format: 'JPEG', quality: 0.95 }))
    const img = sharp(input).rotate() // (EXIF orientation, then dropped with the rest of the metadata)
    const big = await img.clone().resize({ width: BIG, height: BIG, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    await sharp(big.data).resize({ width: THUMB, height: THUMB, fit: 'inside' }).webp({ quality: 78 }).toFile(path.join(OUT, set, `${name}.t.webp`))
    fs.writeFileSync(path.join(OUT, set, `${name}.webp`), big.data)
    manifest.push({ id: `${set}/${name}`, set, src: `/photos/${set}/${name}.webp`, thumb: `/photos/${set}/${name}.t.webp`, w: big.info.width, h: big.info.height, taken: taken ? new Date(taken).toISOString() : null })
    console.log(`${set}/${name}  ${big.info.width}×${big.info.height}  ${taken ? new Date(taken).toISOString().slice(0, 10) : '(no date)'}`)
  }
}
manifest.sort((a, b) => (a.taken ?? '').localeCompare(b.taken ?? ''))
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
console.log(`${manifest.length} photos → ${OUT}/manifest.json`)
