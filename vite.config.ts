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

/**
 * The physics library catches up on a slow frame with as many steps as it fell behind, up to half a second's worth:
 * at 120 steps a second that's up to 60 in one frame, which makes that frame slower still, and the next needs more
 * (a slower computer spirals down to a few frames a second). Capped at 3 steps a frame: on a machine that can't keep
 * up, the toys move a touch slower instead. (Patched where it clamps; ../src/lib/physics/World's clock counts the same.)
 */
const RAPIER_CLAMP = 'const clampedDelta = MathUtils.clamp(dt, 0, 0.5);'
function physicsCatchUp(): Plugin {
  return {
    name: 'physics-catch-up',
    transform(code, id) {
      if (!id.includes('react-three-rapier') || !code.includes(RAPIER_CLAMP)) return null
      return code.replace(RAPIER_CLAMP, "const clampedDelta = MathUtils.clamp(dt, 0, typeof timeStep === 'number' ? Math.min(0.5, timeStep * 3) : 0.5);")
    },
  }
}

export default defineConfig({
  plugins: [react(), bakeUpload(), physicsCatchUp()],
  optimizeDeps: { rolldownOptions: { plugins: [physicsCatchUp()] } },
  // (127.0.0.1, not localhost: Spotify's login only sends her back to that address while we're developing)
  // (Document-Policy: the page may sample its own JavaScript (new Profiler(), the JS Self-Profiling API), to find
  // what a hitch is spending its time on from the console)
  server: { host: '127.0.0.1', port: 5173, open: false, headers: { 'Document-Policy': 'js-profiling' } },
  preview: { host: '127.0.0.1', headers: { 'Document-Policy': 'js-profiling' } },
})
