import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * The hitch recorder (?hitch, or the dev menu): what a frame that came late was doing, measured in the browser
 * it happens in, at the screen's own rate. Every frame: when it really came (the browser's frame clock), the
 * time in our scripts and in drawing, its draw calls, the graphics card's time (where the browser lets us time
 * it), whether a shader, a model or a texture was new, whether the garbage collector ran; for a frame that
 * came late (half again the screen's frame time, or more) all that's kept, with what the browser says held it
 * up (its long-animation-frame report: which script, how long). A small panel shows the count; Copy puts the
 * whole report on the clipboard.
 */
type Frame = { t0: number; script: number; render: number; calls: number; gpu: number | null; progs: number; geos: number; texs: number; heap: number }
type Hitch = { at: number; gap: number; missed: number; script: number; render: number; outside: number; calls: number; gpu: number | null; added: string; gc: number; held: string }
type Loaf = { start: number; end: number; blocking: number; scripts: string }

const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0)
const pct = (a: number[], p: number) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2)
}
const heapNow = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0

export function Hitches({ timeGpu = true }: { timeGpu?: boolean }) {
  const gl = useThree((s) => s.gl)
  const rec = useRef({
    on: false,
    since: 0,
    frames: 0,
    missed: 0,
    gaps: [] as number[], // (the last few hundred, for the screen's frame time)
    allGaps: [] as number[],
    cpu: [] as number[],
    gpu: [] as number[],
    hitches: [] as Hitch[],
    loafs: [] as Loaf[],
    cur: null as Frame | null,
    prev: null as Frame | null,
    ts: 0,
    prevTs: 0,
    renderAt: 0,
  })
  // the frame clock: the browser's own time for each frame (asked for at the start of ours, so it runs just
  // before the next one)
  const tick = useRef((t: number) => {
    const r = rec.current
    r.prevTs = r.ts
    r.ts = t
  })
  useEffect(() => {
    const r = rec.current
    const ctx = gl.getContext() as WebGL2RenderingContext
    const ext = timeGpu ? (ctx.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null) : null
    // drawing, timed (every render this frame: the shadows, the scene, anything drawn to a texture)
    const render0 = gl.render
    gl.render = function (...a: Parameters<typeof render0>) {
      const t = performance.now()
      if (r.cur && !r.renderAt) r.renderAt = t
      render0.apply(this, a)
      if (r.cur) {
        r.cur.render += performance.now() - t
        r.cur.calls += gl.info.render.calls
      }
    }
    // the graphics card's time for each frame: from the start of one to the start of the next
    let query: WebGLQuery | null = null
    const pending: { q: WebGLQuery; f: Frame }[] = []
    ;(r as unknown as { gpuStep: () => void }).gpuStep = () => {
      if (!ext) return
      if (query && r.cur) {
        ctx.endQuery(ext.TIME_ELAPSED_EXT)
        pending.push({ q: query, f: r.cur }) // (the frame just ended)
      }
      query = ctx.createQuery()
      if (query) ctx.beginQuery(ext.TIME_ELAPSED_EXT, query)
      while (pending.length && ctx.getQueryParameter(pending[0].q, ctx.QUERY_RESULT_AVAILABLE)) {
        const { q, f } = pending.shift()!
        if (!ctx.getParameter(ext.GPU_DISJOINT_EXT)) {
          f.gpu = ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6
          if (r.on) r.gpu.push(f.gpu)
        }
        ctx.deleteQuery(q)
      }
    }
    // what the browser says held a frame up
    let obs: PerformanceObserver | null = null
    try {
      obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { startTime: number; duration: number; blockingDuration: number; scripts?: { invoker?: string; sourceFunctionName?: string; sourceURL?: string; duration: number }[] }[]) {
          const scripts = (e.scripts ?? [])
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 3)
            .map((s) => `${s.sourceFunctionName || s.invoker || '?'}@${(s.sourceURL || '').split('/').pop()?.split('?')[0]}:${Math.round(s.duration)}ms`)
            .join(', ')
          r.loafs.push({ start: e.startTime, end: e.startTime + e.duration, blocking: e.blockingDuration, scripts })
          if (r.loafs.length > 300) r.loafs.shift()
        }
      })
      obs.observe({ type: 'long-animation-frame', buffered: false })
    } catch {
      obs = null
    }
    // the panel
    const box = document.createElement('div')
    box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99;font:12px/1.45 ui-monospace,Consolas,monospace;color:#fff4e6;background:rgba(30,22,52,.82);border:1px solid rgba(255,240,230,.25);border-radius:10px;padding:8px 10px;min-width:230px;max-width:340px;pointer-events:auto;white-space:pre'
    const text = document.createElement('div')
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:6px;margin-top:6px'
    const button = (label: string, fn: () => void) => {
      const b = document.createElement('button')
      b.textContent = label
      b.style.cssText = 'font:inherit;color:inherit;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:6px;padding:2px 8px;cursor:pointer'
      b.onclick = (e) => (e.stopPropagation(), fn())
      row.appendChild(b)
      return b
    }
    const report = () => {
      const period = median(r.gaps)
      return {
        when: new Date().toISOString(),
        browser: navigator.userAgent,
        screen: `${screen.width}x${screen.height} @${devicePixelRatio}`,
        canvas: `${gl.domElement.width}x${gl.domElement.height}`,
        refresh: period ? `${(1000 / period).toFixed(0)} Hz (${period.toFixed(2)} ms)` : '?',
        seconds: +((performance.now() - r.since) / 1000).toFixed(1),
        frames: r.frames,
        late: r.hitches.length,
        missedFrames: r.missed,
        gap: { p50: pct(r.allGaps, 0.5), p95: pct(r.allGaps, 0.95), p99: pct(r.allGaps, 0.99), max: pct(r.allGaps, 1) },
        ourCpu: { p50: pct(r.cpu, 0.5), p95: pct(r.cpu, 0.95), p99: pct(r.cpu, 0.99), max: pct(r.cpu, 1) },
        gpu: ext ? { p50: pct(r.gpu, 0.5), p95: pct(r.gpu, 0.95), p99: pct(r.gpu, 0.99), max: pct(r.gpu, 1) } : 'not timeable here',
        longFrameReports: !!obs,
        hitches: r.hitches.slice(-150),
      }
    }
    const reset = () => {
      Object.assign(r, { since: performance.now(), frames: 0, missed: 0, allGaps: [], cpu: [], gpu: [], hitches: [] })
    }
    button('Copy report', () => {
      const s = JSON.stringify(report(), null, 1)
      navigator.clipboard?.writeText(s).then(
        () => (copy.textContent = 'Copied!'),
        () => (console.log(s), (copy.textContent = 'In the console')),
      )
      setTimeout(() => (copy.textContent = 'Copy report'), 1500)
    })
    const copy = row.lastChild as HTMLButtonElement
    button('Reset', reset)
    box.append(text, row)
    document.body.appendChild(box)
    ;(window as unknown as { __hitches: () => unknown }).__hitches = report
    const show = setInterval(() => {
      if (!r.on) {
        text.textContent = 'hitch recorder: waiting for the page…'
        return
      }
      const period = median(r.gaps)
      const s = (performance.now() - r.since) / 1000
      const last = r.hitches
        .slice(-4)
        .reverse()
        .map((h) => `${(h.at / 1000).toFixed(1)}s ${Math.round(h.gap)}ms  cpu ${(h.script + h.render).toFixed(1)}${h.gpu != null ? ` gpu ${h.gpu.toFixed(1)}` : ''}${h.gc ? ' GC' : ''}${h.added ? ' +' + h.added : ''}`)
      text.textContent =
        `hitch recorder  ${period ? Math.round(1000 / period) + ' Hz' : ''}  ${s.toFixed(0)} s\n` +
        `late frames ${r.hitches.length}  (missed ${r.missed} of ${r.frames})\n` +
        `cpu p50 ${pct(r.cpu, 0.5) ?? '-'}  p99 ${pct(r.cpu, 0.99) ?? '-'} ms` +
        (ext ? `\ngpu p50 ${pct(r.gpu, 0.5) ?? '-'}  p99 ${pct(r.gpu, 0.99) ?? '-'} ms` : '\ngpu: not timeable here') +
        (last.length ? '\n' + last.join('\n') : '')
    }, 250)
    return () => {
      gl.render = render0
      obs?.disconnect()
      clearInterval(show)
      box.remove()
      if (query && ext) ctx.endQuery(ext.TIME_ELAPSED_EXT)
    }
  }, [gl, timeGpu])

  useFrame(() => {
    const r = rec.current
    const now = performance.now()
    requestAnimationFrame(tick.current)
    ;(r as unknown as { gpuStep?: () => void }).gpuStep?.()
    // (recording once the page is up and showing)
    if (!r.on && performance.getEntriesByName('page-ready').length) {
      r.on = true
      r.since = now
    }
    const done = r.cur
    if (done) {
      done.script = r.renderAt ? r.renderAt - done.t0 : 0 // (its scripts: everything before it drew)
    }
    const info = gl.info
    const f: Frame = { t0: now, script: 0, render: 0, calls: 0, gpu: null, progs: info.programs?.length ?? 0, geos: info.memory.geometries, texs: info.memory.textures, heap: heapNow() }
    r.prev = done
    r.cur = f
    r.renderAt = 0
    if (!r.on || !done || !r.prevTs) return
    // the gap between the last two frames the browser showed: late, if half again its usual
    const gap = r.ts - r.prevTs
    r.gaps.push(gap)
    if (r.gaps.length > 240) r.gaps.shift()
    r.allGaps.push(gap)
    r.frames++
    const cpu = done.script + done.render
    r.cpu.push(cpu)
    const period = median(r.gaps)
    if (r.gaps.length < 30 || gap < period * 1.5) return
    const missed = Math.max(1, Math.round(gap / period) - 1)
    r.missed += missed
    const added = [f.progs > done.progs && `${f.progs - done.progs} shader`, f.geos > done.geos && `${f.geos - done.geos} model`, f.texs > done.texs && `${f.texs - done.texs} texture`].filter(Boolean).join(' ')
    const gc = done.heap && f.heap < done.heap - 512 * 1024 ? +((done.heap - f.heap) / 1048576).toFixed(1) : 0
    const held = r.loafs
      .filter((l) => l.end > r.prevTs - 2 && l.start < r.ts + 2)
      .map((l) => `${Math.round(l.end - l.start)}ms (blocking ${Math.round(l.blocking)}): ${l.scripts || 'no script: rendering/style/GC'}`)
      .join(' | ')
    r.hitches.push({
      at: +(r.ts - r.since).toFixed(0),
      gap: +gap.toFixed(1),
      missed,
      script: +done.script.toFixed(2),
      render: +done.render.toFixed(2),
      outside: +Math.max(0, gap - cpu).toFixed(1),
      calls: done.calls,
      // (the graphics card's time comes in a few frames later)
      get gpu() {
        return done.gpu == null ? null : +done.gpu.toFixed(2)
      },
      added,
      gc,
      held,
    })
  }, -1000)
  return null
}
