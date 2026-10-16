/**
 * The published site says nothing in the console: no logs, warnings or errors (from the page or its libraries) for
 * anyone opening the developer tools. Imported first in ./main, so it's in place before anything else runs. The dev
 * server keeps its console.
 */
if (import.meta.env.PROD) {
  const quiet = () => {}
  for (const k of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'group', 'groupCollapsed', 'time', 'timeEnd'] as const) {
    ;(console as unknown as Record<string, () => void>)[k] = quiet
  }
}
export {}
