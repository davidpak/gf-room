// @ts-nocheck (Node types aren't installed; this file only runs in Vite's Node process)
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Dev only: lets the page write a file to disk (blender/bake/in/*, ignored by git): snapshots of the
 * canvas, to look at while working. POST /__bake/<file name> with the body.
 */
function bakeUpload(): Plugin {
  return {
    name: 'bake-upload',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__bake/', (req, res) => {
        if (req.method !== 'POST') return res.writeHead(405).end()
        const name = decodeURIComponent((req.url ?? '').replace(/^\//, ''))
        if (!/^[\w.-]+$/.test(name)) return res.writeHead(400).end('bad name')
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const out = resolve('blender/bake/in', name)
          mkdirSync(dirname(out), { recursive: true })
          writeFileSync(out, Buffer.concat(chunks))
          res.writeHead(200, { 'content-type': 'text/plain' }).end('ok ' + out)
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), bakeUpload()],
  // (127.0.0.1, not localhost: Spotify's login only sends her back to that address while we're developing)
  // (Document-Policy: the page may sample its own JavaScript (new Profiler(), the JS Self-Profiling API), to find
  // what a hitch is spending its time on from the console)
  server: { host: '127.0.0.1', port: 5173, open: false, headers: { 'Document-Policy': 'js-profiling' } },
  preview: { host: '127.0.0.1', headers: { 'Document-Policy': 'js-profiling' } },
})
