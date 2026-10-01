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
import { MintsCheck, MintsStage } from './components/mints/MintsStage'
import { TissuesCheck, TissuesStage } from './components/tissues/TissuesStage'
import { LaptopCheck, LaptopStage } from './components/laptop/LaptopStage'
import { RinaOSStage } from './components/rinaos/RinaOSStage'
import { QuadStage } from './components/quad/QuadStage'
import { CivicStage } from './components/civic/CivicStage'
import { GuitarStage } from './components/guitar/GuitarStage'
import { PicnicStage } from './components/picnic/PicnicStage'
import { GliderStage } from './components/lime/GliderStage'
import { useOsMode } from './components/rinaos/mode'

// ?part=room|doll|closet|bed|desk|lamp|charger|keypad|wumpus|mints|tissues|laptop|rinaos|quad|civic|guitar|picnic|glider|prompt, add &check for the verification sheet
const params = new URLSearchParams(location.search)
const part = params.get('part') ?? 'room'
const check = params.has('check')

const PARTS = {
  room: { stage: RoomStage, check: RoomCheck, title: "Rina's room", hint: 'drag to orbit · right-drag to pan · scroll to zoom · WASD + Q/E to fly · F to reset · click things' },
  doll: { stage: DollStage, check: DollCheck, title: 'David, crocheted', hint: 'drag to look · he fidgets like a toy (rigged for walking next)' },
  closet: { stage: ClosetStage, check: ClosetStage, title: 'Closet', hint: 'click a mirror door to slide it · drag to look' },
  bed: { stage: BedStage, check: BedCheck, title: "Rina's bed", hint: 'grab the pillows · click the bed or the blanket · click a drawer · drag to look' },
  desk: { stage: DeskStage, check: DeskCheck, title: 'FEZIBO 47.2 × 23.6', hint: 'hold ▲ / ▼ on the keypad · presets 1 2 3 · left-drag the charger, its cable, the Wumpus, the mints, the tissues or the laptop to carry · click a mint tab to open it, the tissue to pull one, the laptop lid to shut it · pull the charger plug out of the laptop (or click it), let it go by a port to plug it in · right-drag a thing to turn it, empty space to pan · press the wheel and drag to look' },
  lamp: { stage: LampStage, check: LampCheck, title: "Rina's lamp", hint: 'click the lamp or its switch · drag to look · add &check for the verification sheet' },
  charger: { stage: ChargerStage, check: ChargerCheck, title: 'Apple 70W USB-C', hint: 'left-drag to carry (wheel: up / down) · right-drag to turn in place (wheel: tilt) · hold both to turn mid-carry · while carrying, Q/E spin, R/F tip, Z/C tilt · press the wheel and drag to look' },
  keypad: { stage: KeypadStage, check: KeypadCheck, title: 'FEZIBO keypad', hint: 'hold ▲ / ▼ · presets 1 2 3 · keys work too · drag to look' },
  wumpus: { stage: WumpusStage, check: WumpusCheck, title: 'Wumpus stress ball', hint: 'left-drag to carry it (it gets a squeeze) · drop it and it squishes · let go near the lamp and it hops back onto the claw clip · right-drag to turn · press the wheel and drag to look' },
  mints: { stage: MintsStage, check: MintsCheck, title: 'Ice Breakers spearmint', hint: 'click a tab to flip it open (one / many) · left-drag to carry, right-drag or Q/E R/F Z/C to tip it and pour · pick up a mint · press the wheel and drag to look' },
  tissues: { stage: TissuesStage, check: TissuesCheck, title: 'Kleenex', hint: 'click the tissue to pull one · left-drag to carry, right-drag to turn · press the wheel and drag to look' },
  laptop: { stage: LaptopStage, check: LaptopCheck, title: 'MacBook Pro 13"', hint: 'click the lid to shut it or open it · left-drag to carry, right-drag to turn · press the wheel and drag to look' },
  rinaos: { stage: RinaOSStage, check: RinaOSStage, title: 'RinaOS', hint: 'her laptop, flat: open OneNote from the dock · click anywhere on a page to type · the ribbon: Home, Insert, Draw, View' },
  quad: { stage: QuadStage, check: QuadStage, title: 'The Quad', hint: 'drive: W A S D or the arrows · space to brake · R to start over · scroll to zoom' },
  civic: { stage: CivicStage, check: CivicStage, title: '2016 Honda Civic LX', hint: 'click a door or the trunk to open it · drag to look round · scroll to zoom' },
  guitar: { stage: GuitarStage, check: GuitarStage, title: 'Martin D-28', hint: 'hold the left button and sweep across the soundhole to strum · click a string or press 1–6 to pick it · click the fingerboard to hold a string at that fret (again to let go) · drag elsewhere to look round · scroll to zoom · &view=play: held up to play' },
  glider: { stage: GliderStage, check: GliderStage, title: 'LimeGlider', hint: 'drag to look round · scroll to zoom · &steer=0.4 turns its bars · &stand=0 folds its kickstand' },
  picnic: { stage: PicnicStage, check: PicnicStage, title: 'A picnic', hint: 'click the basket to open its lids · click a sandwich to take it · drag to look round · scroll to zoom' },
  prompt: { stage: PromptStage, check: PromptStage, title: 'Fix-it prompts', hint: 'click a prompt · carry a block away and its prompt comes back when it settles · press the wheel and drag to look' },
} as const

export default function App() {
  const p = PARTS[part as keyof typeof PARTS] ?? PARTS.room
  const usingLaptop = useOsMode() // (the laptop's screen fills the view: the page's labels step aside)
  if (check) return <p.check />
  const Stage = p.stage
  return (
    <>
      <Stage />
      <div className="overlay" hidden={usingLaptop}>
        <h1>{p.title}</h1>
        <div>{p.hint}</div>
      </div>
      <nav className="parts" hidden={usingLaptop}>
        {Object.keys(PARTS).map((k) => (
          <a key={k} href={`?part=${k}`} className={k === part ? 'on' : ''}>
            {k}
          </a>
        ))}
      </nav>
    </>
  )
}
