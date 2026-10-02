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

## Later

- **Melee from the Mac mini, over Tailscale.** Today the TV shows Dolphin only from the viewer's own computer (`getDisplayMedia` in `src/components/gamecube/dolphin.ts`). The solid version: Slippi runs around the clock on David's Mac mini. OBS streams its window (picture and sound) over WebRTC through MediaMTX, and the TV plays that stream with no window picker. The browser's Gamepad API (or the keyboard) sends ports 1 and 2 back to a small Node bridge on the mini, which drives Dolphin's controller pipes. `tailscale serve` hosts the site at a private HTTPS `*.ts.net` address. Expect about 60–120 ms of input lag, fine for casual play; Slippi online is still better for serious matches. The mini may need an HDMI dummy plug when running headless. Undecided: a written setup guide versus SSH access for Claude, and whether to keep the window-capture mode as a fallback.

## Known bugs

- **Ice Breakers tin still bounces with mints inside** (`?part=mints`, desk page). Dropping or throwing it with mints in, especially with a tab open, can still send it bouncing or hopping. Commit 73112e1 fixed one cause (mints teleported back inside shoved the tin), but big bounces remain. Leads: contacts between the near-weightless mints (0.00005 kg) and the 12 g tin, the rattle cap and shared gravity/damping in `src/components/mints/Mints.tsx`, and unpacking mints while the tin is moving. Idea to try: while the tin is moving, keep every mint packed (kinematic, touching nothing) and only let them loose once it is still.

## Running

```bash
npm install
npm run dev
```
