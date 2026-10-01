import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Every page of the site (?part=…), each its own chunk of code, fetched only when it's opened (so the room doesn't
 * download the Quad, nor the Civic's model). `check` is its verification sheet (&check), where it has one.
 */
type Page = LazyExoticComponent<ComponentType>
const page = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): Page =>
  lazy(() => load().then((m) => ({ default: m[name] as ComponentType })))

export type Part = { title: string; hint: string; stage: Page; check?: Page }
export const PARTS = {
  room: { title: "Rina's room", hint: 'drag to orbit · right-drag to pan · scroll to zoom · WASD + Q/E to fly · F to reset · click things', stage: page(() => import('../room/RoomStage'), 'RoomStage'), check: page(() => import('../room/RoomStage'), 'RoomCheck') },
  quad: { title: 'The Quad', hint: 'drive: W A S D or the arrows · space to brake · R to start over · scroll to zoom', stage: page(() => import('../quad/QuadStage'), 'QuadStage') },
  doll: { title: 'David, crocheted', hint: 'drag to look · he fidgets like a toy (rigged for walking next)', stage: page(() => import('../doll/DollStage'), 'DollStage'), check: page(() => import('../doll/DollStage'), 'DollCheck') },
  closet: { title: 'Closet', hint: 'click a mirror door to slide it · drag to look', stage: page(() => import('../closet/ClosetStage'), 'ClosetStage') },
  bed: { title: "Rina's bed", hint: 'grab the pillows · click the bed or the blanket · click a drawer · drag to look', stage: page(() => import('../bed/BedStage'), 'BedStage'), check: page(() => import('../bed/BedStage'), 'BedCheck') },
  desk: { title: 'FEZIBO 47.2 × 23.6', hint: 'hold ▲ / ▼ on the keypad · presets 1 2 3 · left-drag the charger, its cable, the Wumpus, the mints, the tissues or the laptop to carry · click a mint tab to open it, the tissue to pull one, the laptop lid to shut it · pull the charger plug out of the laptop (or click it), let it go by a port to plug it in · right-drag a thing to turn it, empty space to pan · press the wheel and drag to look', stage: page(() => import('../desk/DeskStage'), 'DeskStage'), check: page(() => import('../desk/DeskStage'), 'DeskCheck') },
  lamp: { title: "Rina's lamp", hint: 'click the lamp or its switch · drag to look', stage: page(() => import('../lamp/LampStage'), 'LampStage'), check: page(() => import('../lamp/LampStage'), 'LampCheck') },
  laptop: { title: 'MacBook Pro 13"', hint: 'click the lid to shut it or open it · left-drag to carry, right-drag to turn · press the wheel and drag to look', stage: page(() => import('../laptop/LaptopStage'), 'LaptopStage'), check: page(() => import('../laptop/LaptopStage'), 'LaptopCheck') },
  rinaos: { title: 'RinaOS', hint: 'her laptop, flat: open OneNote from the dock · click anywhere on a page to type · the ribbon: Home, Insert, Draw, View', stage: page(() => import('../rinaos/RinaOSStage'), 'RinaOSStage') },
  charger: { title: 'Apple 70W USB-C', hint: 'left-drag to carry (wheel: up / down) · right-drag to turn in place (wheel: tilt) · hold both to turn mid-carry · while carrying, Q/E spin, R/F tip, Z/C tilt · press the wheel and drag to look', stage: page(() => import('../charger/ChargerStage'), 'ChargerStage'), check: page(() => import('../charger/ChargerStage'), 'ChargerCheck') },
  keypad: { title: 'FEZIBO keypad', hint: 'hold ▲ / ▼ · presets 1 2 3 · keys work too · drag to look', stage: page(() => import('../keypad/KeypadStage'), 'KeypadStage'), check: page(() => import('../keypad/KeypadStage'), 'KeypadCheck') },
  wumpus: { title: 'Wumpus stress ball', hint: 'left-drag to carry it (it gets a squeeze) · drop it and it squishes · let go near the lamp and it hops back onto the claw clip · right-drag to turn · press the wheel and drag to look', stage: page(() => import('../wumpus/WumpusStage'), 'WumpusStage'), check: page(() => import('../wumpus/WumpusStage'), 'WumpusCheck') },
  mints: { title: 'Ice Breakers spearmint', hint: 'click a tab to flip it open (one / many) · left-drag to carry, right-drag or Q/E R/F Z/C to tip it and pour · pick up a mint · press the wheel and drag to look', stage: page(() => import('../mints/MintsStage'), 'MintsStage'), check: page(() => import('../mints/MintsStage'), 'MintsCheck') },
  tissues: { title: 'Kleenex', hint: 'click the tissue to pull one · left-drag to carry, right-drag to turn · press the wheel and drag to look', stage: page(() => import('../tissues/TissuesStage'), 'TissuesStage'), check: page(() => import('../tissues/TissuesStage'), 'TissuesCheck') },
  civic: { title: '2016 Honda Civic LX', hint: 'click a door or the trunk to open it · drag to look round · scroll to zoom', stage: page(() => import('../civic/CivicStage'), 'CivicStage') },
  guitar: { title: 'Martin D-28', hint: 'hold the left button and sweep across the soundhole to strum · click a string or press 1–6 to pick it · click the fingerboard to hold a string at that fret (again to let go) · drag elsewhere to look round · scroll to zoom · &view=play: held up to play', stage: page(() => import('../guitar/GuitarStage'), 'GuitarStage') },
  picnic: { title: 'A picnic', hint: 'click the basket to look in · click what’s in it to lift it out · &show=food or &show=ducks · drag to look round · scroll to zoom', stage: page(() => import('../picnic/PicnicStage'), 'PicnicStage') },
  glider: { title: 'LimeGlider', hint: 'drag to look round · scroll to zoom · &steer=0.4 turns its bars · &stand=0 folds its kickstand', stage: page(() => import('../lime/GliderStage'), 'GliderStage') },
  scooter: { title: 'Lime Gen4 scooter', hint: 'drag to look round · scroll to zoom · &steer=0.4 turns its bars · &battery=0.3 (or 0.1) for a yellow (or red) lime', stage: page(() => import('../lime/GliderStage'), 'ScooterStage') },
  easel: { title: 'The art corner', hint: 'pick a paint and a brush below · press and drag on the canvas to paint · click the sketchbook’s pages to turn them · drag elsewhere to look round · scroll to zoom', stage: page(() => import('../art/ArtStage'), 'ArtStage') },
  prompt: { title: 'Fix-it prompts', hint: 'click a prompt · carry a block away and its prompt comes back when it settles · press the wheel and drag to look', stage: page(() => import('../prompt/PromptStage'), 'PromptStage') },
} satisfies Record<string, Part>
export type PartKey = keyof typeof PARTS

/** how the dev menu groups them */
export const GROUPS: { name: string; parts: PartKey[] }[] = [
  { name: 'Places', parts: ['room', 'quad'] },
  { name: 'The room', parts: ['bed', 'closet', 'lamp', 'desk', 'doll'] },
  { name: 'On the desk', parts: ['laptop', 'rinaos', 'charger', 'keypad', 'wumpus', 'mints', 'tissues'] },
  { name: 'On the Quad', parts: ['civic', 'guitar', 'picnic', 'glider', 'scooter', 'easel'] },
  { name: 'Tools', parts: ['prompt'] },
]
