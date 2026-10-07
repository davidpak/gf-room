// Measures a page as David's machine sees it: headless Edge on the real GPU (ANGLE D3D11), 2560x1440 CSS at 1.5,
// unthrottled (the app's browser pane is throttled when hidden: useless for timing). Over CDP, no packages.
//   node scripts/measure.mjs "<url>" [seconds of frames] [expression to print at the end]
//   the loader's marks (page-*, ready:*: where load time goes), rAF frame times, draw numbers, a CPU+GPU frame cost.
// env: PROF=1 profile the load (ALL=1: library code too) · FRAMES=1 with PROF: profile 4 s of frames instead
//      PRE="<expr>" run before the frames (toggle things, time parts) · INJECT="<js>" run before the page's own code
//      SHOT=out.png [SCALE=0.5] [WAIT=ms]: a screenshot after load instead (PRE runs first: move the camera)
//      SAMPLE=1 log window.__waits every 2 s while loading · SHADOWCOUNT=1 shadow redraws a second
// Use a build (npm run build, preview :4173, &dev for window.__r3f) for real numbers; dev is several times slower.
import { spawn, spawnSync } from 'node:child_process'
import fs, { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2]
const secs = Number(process.argv[3] ?? 6)
const port = 9333
const prof = mkdtempSync(join(tmpdir(), 'edge-'))
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
  '--window-size=2560,1440', '--force-device-scale-factor=1.5', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank',
], { stdio: 'ignore' })
/** the whole of Edge gone (its own kill leaves its children running: they piled up, hundreds, rendering away) */
function quit(code = 0) {
  try {
    ws?.close()
  } catch {}
  // (every process started with this run's profile: Edge's launcher hands off and leaves, so there's no tree to kill)
  const tag = prof.split(/[\\/]/).pop()
  spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' })
  try {
    rmSync(prof, { recursive: true, force: true })
  } catch {}
  process.exit(code)
}
process.on('SIGINT', () => quit(1))
process.on('SIGTERM', () => quit(1))
process.on('uncaughtException', (e) => {
  console.error(e)
  quit(1)
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    const page = list.find((t) => t.type === 'page')
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break }
  } catch {}
  await sleep(200)
}
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) }
  if (d.method === 'Runtime.consoleAPICalled' && /error|warn/.test(d.params.type)) console.log('console.' + d.params.type, d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300))
  if (d.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', d.params.exceptionDetails.exception?.description?.slice(0, 300))
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1.5, mobile: false })
if (process.env.PROF && !process.env.FRAMES) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 500 }); await send('Profiler.start') }
if (process.env.INJECT) await send('Page.addScriptToEvaluateOnNewDocument', { source: process.env.INJECT })
const t0 = Date.now()
await send('Page.navigate', { url })
let phase = ''
for (let i = 0; i < 600; i++) {
  await sleep(250)
  phase = await ev(`(performance.getEntriesByType('mark').map(m => m.name + '@' + Math.round(m.startTime)).join(' '))`)
  if (process.env.SAMPLE && i % 8 === 0) console.log('waits@' + i / 4 + 's', String(await ev('(window.__waits?.() ?? []).map(s => s.startsWith("count") ? s : s.split(String.fromCharCode(10)).slice(1, 3).map(l => l.trim().split(" ")[1]).join("<")).join(" | ")')).slice(0, 300))
  if (typeof phase === 'string' && phase.includes('page-ready')) break
}
async function dumpProfile() {
  const { result } = await send('Profiler.stop')
  const p = result.profile
  const byId = new Map(p.nodes.map((n) => [n.id, n]))
  const counts = new Map()
  p.samples.forEach((id, i) => counts.set(id, (counts.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)))
  // self time by function, and inclusive time by our own source functions (the stack walked up)
  const parent = new Map()
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const name = (n) => n.callFrame.functionName + ' ' + n.callFrame.url.replace(/^.*\/src\//, '').replace(/\?.*$/, '').replace(/^.*node_modules\//, 'nm/') + ':' + n.callFrame.lineNumber
  const self = new Map()
  const incl = new Map()
  for (const [id, us] of counts) {
    self.set(name(byId.get(id)), (self.get(name(byId.get(id))) ?? 0) + us)
    const seen = new Set()
    for (let x = id; x; x = parent.get(x)) {
      const n = byId.get(x)
      if (!process.env.ALL && !n.callFrame.url.includes('/src/')) continue
      const k = name(n)
      if (seen.has(k)) continue
      seen.add(k)
      incl.set(k, (incl.get(k) ?? 0) + us)
    }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => (us / 1000).toFixed(0).padStart(6) + ' ms  ' + k).join('\n')
  console.log('SELF\n' + top(self, 20) + '\nINCLUSIVE (our code)\n' + top(incl, 40))
}
console.log('marks:', phase, ` (wall ${Date.now() - t0} ms)`)
console.log('gpu:', await ev(`(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(d.UNMASKED_RENDERER_WEBGL) })()`))
await sleep(1500)
if (process.env.CLICKSEL) {
  // real input (as a mouse does it, not a page script's): a drag across the canvas first, then a click on CLICKSEL;
  // CHECK (an expression) says what came of it
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 })
  await mouse('mousePressed', 900, 600)
  await mouse('mouseMoved', 1000, 650)
  await mouse('mouseReleased', 1000, 650)
  await sleep(200)
  const r = JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(process.env.CLICKSEL)})?.getBoundingClientRect() ?? null)`))
  if (!r) console.log('click: no', process.env.CLICKSEL)
  else {
    const x = r.x + r.width / 2
    const y = r.y + r.height / 2
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 })
    await sleep(400)
    console.log('click', process.env.CLICKSEL, '->', await ev(process.env.CHECK ?? 'true'))
  }
}
if (process.env.SHOT) {
  // a picture of the page as it is (SHOT=path.png; SCALE=0.5 makes it smaller), then done
  if (process.env.PRE) console.log('pre', await ev(process.env.PRE))
  await sleep(Number(process.env.WAIT ?? 800))
  const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 2560, height: 1440, scale: Number(process.env.SCALE ?? 0.5) } })
  fs.writeFileSync(process.env.SHOT, Buffer.from(result.data, 'base64'))
  console.log('shot', process.env.SHOT)
  quit(0)
}
if (process.env.PRE) console.log('pre', await ev(process.env.PRE))
await sleep(500)
if (process.env.FRAMES) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); await sleep(4000); await dumpProfile() }
// real frames: rAF intervals, and the scene's numbers
console.log(await ev(`new Promise(res => {
  const s = window.__r3f?.(); const gl = s?.gl
  const times = []; let last = performance.now(); const end = last + ${secs * 1000}
  const f = (t) => { times.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else {
    times.sort((a, b) => a - b)
    const q = (p) => times[Math.floor(times.length * p)].toFixed(1)
    let meshes = 0, casters = 0, tris = 0; const lights = []
    s?.scene.traverse(o => { if (o.isMesh && o.visible) { meshes++; if (o.castShadow) casters++ } if (o.isLight && o.castShadow) lights.push(o.type + ' ' + o.shadow.mapSize.x) })
    res(JSON.stringify({ frames: times.length, fps: (times.length / ${secs}).toFixed(0), p50: q(0.5), p90: q(0.9), p99: q(0.99), max: times[times.length - 1].toFixed(1), calls: gl?.info.render.calls, tris: gl?.info.render.triangles, meshes, casters, lights, px: gl && [gl.domElement.width, gl.domElement.height] }))
  } }
  requestAnimationFrame(f)
})`))
// CPU per frame (no GPU wait): the frame loop driven by hand
console.log('cpu', await ev(`(() => { const s = __r3f(); const N = 40; const t0 = performance.now(); for (let i = 0; i < N; i++) s.advance(performance.now()); s.gl.getContext().finish(); return ((performance.now() - t0) / N).toFixed(2) + ' ms/frame incl. gpu finish' })()`))
if (process.env.SHADOWCOUNT) console.log('shadow redraws/s', await ev('new Promise(r => { const gl = __r3f().gl; let n = 0; const sm = gl.shadowMap; let v = sm.needsUpdate; Object.defineProperty(sm, "needsUpdate", { get: () => v, set: (x) => { if (x) n++; v = x }, configurable: true }); setTimeout(() => r(n / 3), 3000) })'))
if (process.argv[4]) console.log('extra', await ev(process.argv[4]))
quit(0)
