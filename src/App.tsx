import { RoomCheck, RoomStage } from './components/room/RoomStage'
import { LampCheck, LampStage } from './components/lamp/LampStage'
import { ChargerCheck, ChargerStage } from './components/charger/ChargerStage'
import { ClosetStage } from './components/closet/ClosetStage'
import { BedCheck, BedStage } from './components/bed/BedStage'
import { DeskCheck, DeskStage } from './components/desk/DeskStage'
import { KeypadCheck, KeypadStage } from './components/keypad/KeypadStage'
import { DollCheck, DollStage } from './components/doll/DollStage'
import { PromptStage } from './components/prompt/PromptStage'
import { WumpusCheck, WumpusStage } from './components/wumpus/WumpusStage'

// ?part=room|doll|closet|bed|desk|lamp|charger|keypad|wumpus|prompt, add &check for the verification sheet
const params = new URLSearchParams(location.search)
const part = params.get('part') ?? 'room'
const check = params.has('check')

const PARTS = {
  room: { stage: RoomStage, check: RoomCheck, title: "Rina's room", hint: 'drag to orbit · right-drag to pan · scroll to zoom · WASD + Q/E to fly · F to reset · click things' },
  doll: { stage: DollStage, check: DollCheck, title: 'David, crocheted', hint: 'drag to look · he fidgets like a toy (rigged for walking next)' },
  closet: { stage: ClosetStage, check: ClosetStage, title: 'Closet', hint: 'click a mirror door to slide it · drag to look' },
  bed: { stage: BedStage, check: BedCheck, title: "Rina's bed", hint: 'grab the pillows · click the bed or the blanket · click a drawer · drag to look' },
  desk: { stage: DeskStage, check: DeskCheck, title: 'FEZIBO 47.2 × 23.6', hint: 'hold ▲ / ▼ on the keypad · presets 1 2 3 · left-drag the charger, its cable or the Wumpus to carry · right-drag a thing to turn it, empty space to pan · press the wheel and drag to look' },
  lamp: { stage: LampStage, check: LampCheck, title: "Rina's lamp", hint: 'click the lamp or its switch · drag to look · add &check for the verification sheet' },
  charger: { stage: ChargerStage, check: ChargerCheck, title: 'Apple 70W USB-C', hint: 'left-drag to carry (wheel: up / down) · right-drag to turn in place (wheel: tilt) · hold both to turn mid-carry · while carrying, Q/E spin, R/F tip, Z/C tilt · press the wheel and drag to look' },
  keypad: { stage: KeypadStage, check: KeypadCheck, title: 'FEZIBO keypad', hint: 'hold ▲ / ▼ · presets 1 2 3 · keys work too · drag to look' },
  wumpus: { stage: WumpusStage, check: WumpusCheck, title: 'Wumpus stress ball', hint: 'left-drag to carry it (it gets a squeeze) · drop it and it squishes · let go near the lamp and it hops back on its perch · right-drag to turn · press the wheel and drag to look' },
  prompt: { stage: PromptStage, check: PromptStage, title: 'Fix-it prompts', hint: 'click a prompt · carry a block away and its prompt comes back when it settles · press the wheel and drag to look' },
} as const

export default function App() {
  const p = PARTS[part as keyof typeof PARTS] ?? PARTS.room
  if (check) return <p.check />
  const Stage = p.stage
  return (
    <>
      <Stage />
      <div className="overlay">
        <h1>{p.title}</h1>
        <div>{p.hint}</div>
      </div>
      <nav className="parts">
        {Object.keys(PARTS).map((k) => (
          <a key={k} href={`?part=${k}`} className={k === part ? 'on' : ''}>
            {k}
          </a>
        ))}
      </nav>
    </>
  )
}
