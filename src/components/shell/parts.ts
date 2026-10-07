import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Every page of the site (?part=…), each its own chunk of code, fetched only when it's opened (so the room doesn't
 * download the Quad, nor the Civic's model). `check` is its verification sheet (&check), where it has one.
 */
type Page = LazyExoticComponent<ComponentType>
const page = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): Page =>
  lazy(() => load().then((m) => ({ default: m[name] as ComponentType })))

/** a page whose code may not be written yet (it's being built): found by a glob, so a missing file doesn't break the site */
const LATER = import.meta.glob(['../{monitor,ipad,mugs,bowl,pencup,soundmachine,candle,keepsakes,vanity,trinkets}/*Stage.tsx'])
const later = (path: string, name: string): Page =>
  lazy(() => (LATER[path] ? LATER[path]() : Promise.reject(new Error(path + ' not built yet'))).then((m) => ({ default: (m as Record<string, ComponentType>)[name] })))

export type Part = { title: string; hint: string; stage: Page; check?: Page }
export const PARTS = {
  room: { title: "Rina's room", hint: 'W A S D to walk · press the wheel and drag to look round · right-drag to step · scroll to step forward / back · shift faster · F back to the door · click things', stage: page(() => import('../room/RoomStage'), 'RoomStage'), check: page(() => import('../room/RoomStage'), 'RoomCheck') },
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
  clock: { title: 'Alarm clock', hint: 'click a button to press it (the first sets the alarm, the second dims the digits) · left-drag to carry, right-drag to turn · press the wheel and drag to look', stage: page(() => import('../clock/ClockStage'), 'ClockStage'), check: page(() => import('../clock/ClockStage'), 'ClockCheck') },
  poster: { title: 'Rina poster', hint: 'her friends’ notes typed round her name, as on hers (from the Google Form) · a new one types itself in · click a slip to read it · drag to look · &demo=n: stand-in notes', stage: page(() => import('../poster/PosterStage'), 'PosterStage'), check: page(() => import('../poster/PosterStage'), 'PosterCheck') },
  monitor: { title: 'Portable monitor', hint: '', stage: later('../monitor/MonitorStage.tsx', 'MonitorStage'), check: later('../monitor/MonitorStage.tsx', 'MonitorCheck') },
  ipad: { title: 'iPad', hint: '', stage: later('../ipad/IpadStage.tsx', 'IpadStage'), check: later('../ipad/IpadStage.tsx', 'IpadCheck') },
  mugs: { title: 'Mugs', hint: '', stage: later('../mugs/MugsStage.tsx', 'MugsStage'), check: later('../mugs/MugsStage.tsx', 'MugsCheck') },
  bowl: { title: 'Bowl and chopsticks', hint: '', stage: later('../bowl/BowlStage.tsx', 'BowlStage'), check: later('../bowl/BowlStage.tsx', 'BowlCheck') },
  pencup: { title: 'Pen cup', hint: '', stage: later('../pencup/PenCupStage.tsx', 'PenCupStage'), check: later('../pencup/PenCupStage.tsx', 'PenCupCheck') },
  soundmachine: { title: 'Sound machine', hint: '', stage: later('../soundmachine/SoundMachineStage.tsx', 'SoundMachineStage'), check: later('../soundmachine/SoundMachineStage.tsx', 'SoundMachineCheck') },
  candle: { title: 'Holiday candle', hint: '', stage: later('../candle/CandleStage.tsx', 'CandleStage'), check: later('../candle/CandleStage.tsx', 'CandleCheck') },
  keepsakes: { title: 'Cards and keepsakes', hint: '', stage: later('../keepsakes/KeepsakesStage.tsx', 'KeepsakesStage'), check: later('../keepsakes/KeepsakesStage.tsx', 'KeepsakesCheck') },
  vanity: { title: 'Jewellery stand and mirror', hint: '', stage: later('../vanity/VanityStage.tsx', 'VanityStage'), check: later('../vanity/VanityStage.tsx', 'VanityCheck') },
  trinkets: { title: 'Little things', hint: '', stage: later('../trinkets/TrinketsStage.tsx', 'TrinketsStage'), check: later('../trinkets/TrinketsStage.tsx', 'TrinketsCheck') },
  civic: { title: '2016 Honda Civic LX', hint: 'click a door or the trunk to open it · drag to look round · scroll to zoom', stage: page(() => import('../civic/CivicStage'), 'CivicStage') },
  guitar: { title: 'Martin D-28', hint: 'hold the left button and sweep across the soundhole to strum · click a string or press 1–6 to pick it · click the fingerboard to hold a string at that fret (again to let go) · drag elsewhere to look round · scroll to zoom · &view=play: held up to play', stage: page(() => import('../guitar/GuitarStage'), 'GuitarStage') },
  picnic: { title: 'A picnic', hint: 'click the basket to look in · click what’s in it to lift it out · &show=food or &show=ducks · drag to look round · scroll to zoom', stage: page(() => import('../picnic/PicnicStage'), 'PicnicStage') },
  gamecube: { title: 'Nintendo GameCube', hint: 'click POWER (the light grey button, back left on top), OPEN (front left), RESET (front right) · click the lid to shut it · with the lid up, click the disc to take it out (and back) · left-drag to carry, right-drag to turn · press the wheel and drag to look', stage: page(() => import('../gamecube/GameCubeStage'), 'GameCubeStage'), check: page(() => import('../gamecube/GameCubeStage'), 'GameCubeCheck') },
  gamepad: { title: 'GameCube controllers', hint: 'left-drag to carry, right-drag to turn · click START, A, B, X or Y to press it · press the wheel and drag to look', stage: page(() => import('../gamecube/PadStage'), 'PadStage'), check: page(() => import('../gamecube/PadStage'), 'PadCheck') },
  gamesetup: { title: 'GameCube + Melee', hint: 'click POWER (the light grey button, back left on top), OPEN (front left), RESET (front right) · click the lid to shut it · with the lid up, click the disc to put it in its case (and back) · the TV has its own power switch · START, A and B on either controller (Enter, Backspace) · drag to look round · scroll to zoom', stage: page(() => import('../gamecube/SetupStage'), 'SetupStage') },
  glider: { title: 'LimeGlider', hint: 'drag to look round · scroll to zoom · &steer=0.4 turns its bars · &stand=0 folds its kickstand', stage: page(() => import('../lime/GliderStage'), 'GliderStage') },
  scooter: { title: 'Lime Gen4 scooter', hint: 'drag to look round · scroll to zoom · &steer=0.4 turns its bars · &battery=0.3 (or 0.1) for a yellow (or red) lime', stage: page(() => import('../lime/GliderStage'), 'ScooterStage') },
  easel: { title: 'The art corner', hint: 'pick a paint and a brush below · press and drag on the canvas to paint · click the sketchbook’s pages to turn them · drag elsewhere to look round · scroll to zoom', stage: page(() => import('../art/ArtStage'), 'ArtStage') },
  plane: { title: 'Paper airplanes', hint: 'four sheets of paper: hover one for its folds, click a fold (in the right order, or it crumples) · left-drag to carry, right-drag to turn, let go moving to throw · drag elsewhere to look round · scroll to zoom', stage: page(() => import('../art/plane/PlaneStage'), 'PlaneStage') },
  turntable: { title: 'Victrola Eastwood', hint: 'click the crate to go through it (A / D or ← →, Enter takes one out, Esc steps back), click a record out of its jacket: it goes on and plays · POWER is far left of the strip · drag the arm over the record and let go: it plays from there · CUE or ▶❚❚ lifts and lowers it · ◀◀ ▶▶ skip songs · click the record (arm off it) to turn it over · drag across VOLUME · click the lid · press the wheel and drag to look', stage: page(() => import('../records/TurntableStage'), 'TurntableStage'), check: page(() => import('../records/TurntableStage'), 'TurntableCheck') },
  speaker: { title: 'JBL L100 Classic', hint: '▶ play pumps the cones · drag to look', stage: page(() => import('../speaker/SpeakerStage'), 'SpeakerStage'), check: page(() => import('../speaker/SpeakerStage'), 'SpeakerCheck') },
  records: { title: 'Records', hint: 'her saved albums on Spotify, pressed into records (log in below) · click a record to turn it over · drag to look round · scroll to zoom', stage: page(() => import('../records/RecordsStage'), 'RecordsStage'), check: page(() => import('../records/RecordsStage'), 'RecordsCheck') },
  spotify: { title: 'Spotify, the plumbing', hint: 'log in · search or pick a saved album · click a track to play it here (Premium) · open at 127.0.0.1:5173', stage: page(() => import('../records/SpotifyStage'), 'SpotifyStage') },
  prompt: { title: 'Fix-it prompts', hint: 'click a prompt · carry a block away and its prompt comes back when it settles · press the wheel and drag to look', stage: page(() => import('../prompt/PromptStage'), 'PromptStage') },
} satisfies Record<string, Part>
export type PartKey = keyof typeof PARTS

/** how the dev menu groups them */
export const GROUPS: { name: string; parts: PartKey[] }[] = [
  { name: 'Places', parts: ['room', 'quad'] },
  { name: 'The room', parts: ['bed', 'closet', 'lamp', 'desk', 'doll', 'poster'] },
  { name: 'On the desk', parts: ['laptop', 'rinaos', 'charger', 'keypad', 'wumpus', 'mints', 'tissues', 'clock', 'monitor', 'ipad', 'mugs', 'bowl', 'pencup', 'soundmachine', 'candle', 'keepsakes', 'vanity', 'trinkets'] },
  { name: 'On the Quad', parts: ['civic', 'guitar', 'picnic', 'glider', 'scooter', 'easel', 'plane', 'turntable', 'records'] },
  { name: 'Tools', parts: ['prompt', 'spotify'] },
]
