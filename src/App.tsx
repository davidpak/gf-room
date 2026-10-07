import { Suspense, useEffect } from 'react'
import { useOsMode } from './components/rinaos/mode'
import { PARTS, type Part, type PartKey } from './components/shell/parts'
import { Loader } from './components/shell/Loader'
import { DevMenu } from './components/shell/DevMenu'
import { ready } from './lib/ready'

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
  const usingLaptop = useOsMode() // (the laptop's screen fills the view: the dev menu steps aside)
  const Stage = check && p.check ? p.check : p.stage
  return (
    <>
      <Suspense fallback={null}>
        <Stage />
        <Mounted />
      </Suspense>
      {/* (no title or how-to written over the page: David, 2026-10-07, 'we don't need tutorials') */}
      {DEV && !usingLaptop && <DevMenu part={part} />}
      <Loader part={part} title={check ? `${p.title} · check` : p.title} />
    </>
  )
}
