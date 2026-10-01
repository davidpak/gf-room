import { Suspense, useEffect } from 'react'
import { useOsMode } from './components/rinaos/mode'
import { PARTS, type Part, type PartKey } from './components/shell/parts'
import { Loader } from './components/shell/Loader'
import { DevMenu } from './components/shell/DevMenu'
import { ready, useReady } from './lib/ready'

// ?part=… (./components/shell/parts), add &check for the verification sheet, &perf for the performance overlay.
// The dev menu (`) shows in development, or with &dev.
const params = new URLSearchParams(location.search)
const asked = params.get('part') ?? 'room'
const part = (asked in PARTS ? asked : 'room') as PartKey
const check = params.has('check')
const DEV = import.meta.env.DEV || params.has('dev')

/** tells the loading screen the page's code has arrived and mounted */
function Mounted() {
  useEffect(() => ready.mounted(), [])
  return null
}

export default function App() {
  const p: Part = PARTS[part]
  const usingLaptop = useOsMode() // (the laptop's screen fills the view: the page's labels step aside)
  const shown = useReady().phase === 'ready'
  const Stage = check && p.check ? p.check : p.stage
  return (
    <>
      <Suspense fallback={null}>
        <Stage />
        <Mounted />
      </Suspense>
      {shown && !check && (
        <div className="overlay" hidden={usingLaptop}>
          <h1>{p.title}</h1>
          <div>{p.hint}</div>
        </div>
      )}
      {DEV && !usingLaptop && <DevMenu part={part} />}
      <Loader part={part} title={check ? `${p.title} · check` : p.title} />
    </>
  )
}
