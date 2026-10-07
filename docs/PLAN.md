# Rina's Room: plan

A cozy, interactive 3D room website in the spirit of bruno-simon.com, built as a gift.
Reference floor plan: `docs/reference/floorplan.png` (her room is the far-right bedroom, sharing a wall with the living space).

## What Bruno actually uses (verified Sept 2026)

Two portfolios, both open source under MIT:

| | folio-2019 (car, low-poly) | folio-2025 (current site) |
|---|---|---|
| Repo | github.com/brunosimon/folio-2019 | github.com/brunosimon/folio-2025 |
| Renderer | three.js WebGL, vanilla (no React) | three.js **WebGPU** (`three/webgpu`) with WebGL fallback, vanilla |
| Shaders | GLSL ShaderMaterials, matcaps | TSL (Three Shading Language) |
| Physics | cannon.js RaycastVehicle | **Rapier** (WASM) RaycastVehicle |
| Lighting | Baked in Blender to PNG lightmaps | Real-time directional light + shadow maps, day cycles |
| Animation | GSAP | GSAP |
| Audio | Howler | Howler |
| Build | Vite (migrated from webpack) | Vite 7, gltf-transform + KTX2 compression |
| Debug | dat.gui | Tweakpane |
| Models | Blender, GLB + Draco, under 2 MB | Blender, compressed GLB, palette texture |

Patterns worth copying, in order of payoff:

1. **Blender naming drives behaviour.** Objects named `cube_*`, `cylinder_*` become physics bodies automatically; empties mark spawn points and areas. Content lives in the .blend, code stays generic.
2. **Areas.** A cheap position test (AABB in 2019, cylinder in 2025) fires `in`/`out` events. Prompts appear with GSAP `back.out` / `elastic.out` easing. This is the whole "sign pops up when you approach" trick.
3. **Everything is eased.** Camera focus lerps toward the player, zoom follows speed, prompts spring in. Nothing snaps.
4. **Confetti** is one InstancedMesh of 500 particles with a single `progress` uniform tweened 0 to 1 over 5 s; the whole arc is computed in the vertex shader.
5. **Bake or fake lighting.** 2019 baked everything; that is still the cheapest route to a cozy look on a phone.

## Our stack (reuse, don't rebuild)

Bruno writes vanilla Three.js because he sells a course on it. We are one person building a gift, so we take the React path he *also* teaches (Three.js Journey chapter 7), where the community has already packaged his techniques:

- **Vite + React + TypeScript**
- **@react-three/fiber** (R3F): declarative Three.js
- **@react-three/drei**: `SoftShadows`, `ContactShadows`, `AccumulativeShadows`, `Environment`, `Float`, `Html`, `Text`, `useGLTF`, `Sparkles`, `CameraControls`, `PresentationControls`, `Bounds`
- **@react-three/rapier**: same physics engine Bruno uses, as components (`<RigidBody>`, `<CuboidCollider>`)
- **@react-three/postprocessing**: bloom, vignette, depth of field, one component each
- **maath**: `easing.damp` for the "everything is eased" rule
- **GSAP** or **@react-spring/three** for choreographed sequences (confetti burst, camera tours)
- **leva**: debug sliders while tuning colours and light
- **gltfjsx**: turns a Blender GLB into a typed React component
- **howler**: sounds (Bruno uses it too)

## Milestones

Each milestone is something you can open in a browser and show someone.

- [x] **M0: Ball rolling.** Her room as a cutaway built from primitives, warm light through the window, soft shadows, constrained orbit, one hover and one click interaction. No models, no Blender, no physics.
- [ ] **M1: Feels alive.** Camera eases toward whatever you hover (drei `Bounds` / `CameraControls`), a gentle intro animation, `Sparkles` dust in the window light, ambient sound toggle, mobile touch works.
- [x] **M0.5: Blender pipeline.** `blender/lib/brunostyle.py` = the shared look (palette texture, collapsed UVs, bevels, naming). `npm run blender:room` rebuilds `public/models/room.glb` and `blender/room.blend`. First real asset: `blender/assets/desk_fezibo.py`, the FEZIBO 48×24 standing desk built to spec with a working lift (`deskBase` static, `deskLift` moves; click the top or keypad).
- [ ] **M2: Real furniture.** One asset module per real object in `blender/assets/` (bed, chair, closet, lamp), each parameterised from a tape measure and photos. Kenney/Poly Pizza only for filler.
- [ ] **M3: Her story.** Interactive "areas": the desk opens her interview journey (schools, dates, hours), the bed shows a note, the window shows Seattle/UW. Sign-style prompts with GSAP spring easing.
- [ ] **M4: Physics toys.** Rapier: throwable pillows, a stack of textbooks that topples, confetti burst when you click the acceptance letter.
- [ ] **M5: Polish.** Post-processing (bloom on the lamp, vignette), day/night toggle, loading screen, deploy to Vercel/Netlify with a custom domain.
- [ ] **M6 (optional): Blender.** Model the whole apartment in Blender, bake lighting, export one GLB. This is the Three.js Journey "portal scene" workflow and is where it starts looking like Bruno's.

## Finishing her desk and wall (from her photos, 2026-10-07)

What's on her desk and the wall round it in `public/reference/room-desk-wall.jpg`, `room-desk-night.jpg`, `room-desk-poster.jpg` and `room-desk-wide.png` that the room doesn't have yet. Each is built our usual way: a sourced spec with checks, its own `?part=` page first, the toy look, life only from small real motion (as the Quad's petals). Done so far: desk, lamp, laptop, charger, mints, clock, tissues, David plush, poster.

**The notes, split in two.** Her closest friends go on the poster; everyone else goes on sticky notes on the wall round it, like hers. The sheet gets a column saying which (a form question, or David filling one in, e.g. "where": poster / wall). Each sticky is clickable too, with the same glide-in as the poster's slips.

**The wall**

1. **Sticky notes, dozens.** Pastel yellow, pink, blue, green and orange 3 in squares in clusters round the poster, the calendar and the lamp, each in a handwriting and pen of its own. These hold the wider friends' notes. Each is its own bit of paper: its bottom curls a hair, it stirs in the poster's draft, it lifts when pointed at, and a click glides in to read it. A long note shows its opening and the rest opens up close.
2. **Her name in brush calligraphy.** Rice paper with soft torn edges above the poster, black ink with red seal stamps. The characters are traced from the photo like her Rina.
3. **Photo booth strips and photos.** Five or six strips, polaroids, printed photos and one in a gold frame, using her photos from `photos/` (gitignored). Each is clickable like a Quad photo, with ← → between them.
4. **Wall calendar.** A month grid with a rainbow tab border, showing the current month live, with a few stickies on it.
5. **Study sheets.** Hand-drawn glycolysis, TCA cycle and nucleotide sheets taped up, with small stickies on them (from the Dec 2025 photo).
6. **Small things.** The navy round badge sticker; the "Hello my name is Baked beans" tag on the poster's corner; the floral cloud print strip; a "UR GR8" heart card; a Wonder Woman sticker; a checkered heart clip.
7. **String lights.** Warm white fairy lights up the window's left edge and across its top, glowing softly on the wall and blinds. *(Done with the lighting pass.)*
8. **Candy cane garland** across the window under the lights (seasonal).
9. **On the lamp.** Pearl necklaces draped on its pole, a yellow flower and a little elephant plush clipped by the arm.

**The desk**

10. **Portable monitor** (black, thin, on its folding stand) to the laptop's left, with notes on its screen.
11. **iPad** in its tan case with the Apple Pencil, notes on its screen.
12. **Mugs.** The white ceramic one painted with a Christmas tree, and a copper tumbler.
13. **Red pen cup** with pens, highlighters and scissors.
14. **Jewellery stand** (clear acrylic, necklaces hanging) and her **LED vanity mirror**.
15. **Cards and keepsakes.** Standing cards ("My Daughter is Amazing", Mickey), a gold-framed photo, a hot cocoa bomb box.
16. **Holiday candle.** Red, in a jar with a striped ribbon; lit, a small flickering warm light (the cosiest light on the desk).
17. **Little things.** Green lotion pump bottle, Vaseline, a hair tie, her blue lanyard with keys and badge, a white smartwatch.
18. **A bowl.** Blue-and-white swirl ceramic, chopsticks resting in it.
19. **The white sound machine** by the lamp.

Suggested order: the candle (it's light), the sticky notes (the biggest piece: the notes), photos and booth strips, the calendar, the monitor and iPad, then the small things.

## Later

- **A day–night cycle for the Quad.** Tried and reverted on 2026-10-02 (commit 00b95f3 has the full working version, reverted by the next commit), pinned to revisit. The approach:
  - **Times of day.** Keyframes for sunrise, morning, today's midday look (unchanged), golden hour, sunset, dusk and night. Each key sets the sky gradient, light colour and intensity, sun direction, a tint on every shadow colour, bounce, fog, lamp strength and glow, blended between keys.
  - **Cheap per frame.** `bruno` reads a few shared uniforms (light, shadow tint, lamp and glow multipliers, 12 lamp pools as vec4s), so each frame only changes those.
  - **Night lights.** Fairy lights on the cherries (one instanced draw), string lights on both canopies, additive point halos (one draw a set), warm pools under the trees and canopies, stars and a moon.
  - **Timing.** A 24-minute day starting at the visitor's own clock; `?time=` and `?daylen=` override it.
  - **Cost.** About +7 draws; night cost the same as midday.
  - **Lessons.** The sunset sun must stay at least 0.4 high, or the grass goes muddy. Decide the mood and pacing with David before building again.
- **Melee from the Mac mini, over Tailscale.** Today the TV shows Dolphin only from the viewer's own computer (`getDisplayMedia` in `src/components/gamecube/dolphin.ts`). The solid version: Slippi runs around the clock on David's Mac mini. OBS streams its window (picture and sound) over WebRTC through MediaMTX, and the TV plays that stream with no window picker. The browser's Gamepad API (or the keyboard) sends ports 1 and 2 back to a small Node bridge on the mini, which drives Dolphin's controller pipes. `tailscale serve` hosts the site at a private HTTPS `*.ts.net` address. Expect about 60–120 ms of input lag, fine for casual play; Slippi online is still better for serious matches. The mini may need an HDMI dummy plug when running headless. Undecided: a written setup guide versus SSH access for Claude, and whether to keep the window-capture mode as a fallback.

## Known bugs

- **Ice Breakers tin still bounces with mints inside** (`?part=mints`, desk page). Dropping or throwing it with mints in, especially with a tab open, can still send it bouncing or hopping. Commit 73112e1 fixed one cause (mints teleported back inside shoved the tin), but big bounces remain. Leads: contacts between the near-weightless mints (0.00005 kg) and the 12 g tin, the rattle cap and shared gravity/damping in `src/components/mints/Mints.tsx`, and unpacking mints while the tin is moving. Idea to try: while the tin is moving, keep every mint packed (kinematic, touching nothing) and only let them loose once it is still.

## Running

```bash
npm install
npm run dev
```
