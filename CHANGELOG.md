# CHANGELOG

All notable changes to Still Water. Dates are YYYY-MM-DD (build session).

## 2026-09-12 (turn 8) — first-door poster → hologram + floor audit + street filling

### User-requested changes
- **First-door "poster" REMOVED** (user asked again): the framed STORMWATER
  STATION 6 sign above the street door is gone. Replaced by a **see-through
  hologram projection** (new `kit.hologramSign`): additive shader plane —
  scanlines, upward light-band sweep, glitch ticks, flicker dips, cyan tint,
  alpha 0.62 so the facade shows through — floating above a small projector
  housing. **Moved up** (text centre y 4.92 → 5.45 vs old framed sign at
  4.85) and the porch lamp shifted to x 1.5 so the dome no longer sits in
  the text. Projector boot blip (uisfx "connect", MIT) plays at game start.
- **Floor audit (new tool `tools/qa/audit_floors.py`)** — raycast-based
  scan of every ground region and every room-volume mesh top. Found and
  FIXED:
  - street parcel south edge: visuals/regions/fence stopped at z -10.9
    while asphalt ran to -10.4 — a walkable see-through strip with no
    boundary. Regions/verges extended, **south fence line added** (splits
    around the stairwell block) — the parcel is now fully sealed.
  - stair-ramp foot slot: visual steps ended at z -6.37 vs region -6.2 —
    filler tread closes it flush at y 0.
  - tilted-ramp class: single tilted ramp slabs (stairwell + sump F0) shrink
    their footprint by cos(slope), leaving the lane ends with NO visual
    underfoot. `_rampVis` rebuilt as stepped treads spanning the full run.
  - collider-top support: solid collider tops (crates, bench, fridge) are
    now standable (`world.colliderTopNear` + player ground integration) —
    hopping onto a prop no longer falls through it.
- **Street de-scanted** (user: "space too scanty, create new houses"):
  - CC0 **KayKit City Builder Bits** neighbourhood across the fence:
    5 buildings + water tower + yard bushes on the city-ground disc.
  - In-parcel street furniture (all solid, overlap-verified): sedan +
    taxi parked parallel to the kerbs, dumpster, bench, hydrant, 2 bins.
  - Pump Hall SW crate row + NE crate, Atrium NW corner crate pair.
- **More SFX** (user request): CC0 OpenGameArt packs acquired via the
  network-reachable GitHub route (`python-sound-generator` redistributes
  OGA archives with provenance): Iwan Gabovitch doors, laleksic creaks/
  thunks/cant-open, rubberduck slams, leonmire gate squeal (now rides the
  gateGrind synth), wood/panel debris, key-click layer on breakerClack,
  winch strain creak, hologram boot blip. All sample paths keep their
  original synth fallbacks. Sketchfab + worker gateway verified BLOCKED
  ("Host not allowed" for api.sketchfab.com; binary payloads impossible) —
  token intentionally not stored in the repo.

### QA
- NEW `tools/qa/audit_floors.py` (raycast floor integrity): **PASS**
  (0 see-through samples, 0 unsupported reachable floor tops; regions=25,
  meshes≈1070, 2235 samples).
- verify_world **17/17** (no_solid_overlaps back to 0 after re-placing the
  new props against every existing collider — 6 initial clashes found and
  fixed; cars de-rotated to parallel parking).
- critical_path **40/40**; ghost scan open=0 / invisible=0.
- Visual pass: `qa/visual/2026-09-12/` (hologram door shots, street with
  houses/cars, pump-hall + atrium crates).

## 1.0.0 — 2026-09-04 (release)

First complete, playable build. All gates §215–216 green.

### Game
- 7-room stormwater station: street, kiosk, stairwell, atrium, corridor,
  pump hall, valve gallery, sump, exit shaft — loop-back to street level.
- 7 data-driven objectives from `game/data/objectives.json`; notes, rooms,
  route map, world bounds from JSON.
- Collision: capsule + axis-separated clamp-to-face resolution; soft/step
  barrier classification; ground-region height fields for ramps and stairs.
- Doors (swing colliders), sluice + service gates, hold-to-crank winch,
  water level/drain state, lighting circuits + master breaker, one scare
  beat, procedural audio (ambience, surface-keyed footsteps, drips, sting).
- Original minimal UI: dynamic keycap prompts, full keyboard remapping with
  conflict displacement, persistence, reset; brightness/quality/volume.

### QA-fixed bugs (each reproduced via instrumented Playwright traces)
- Kiosk-entry teleport off the stair ramp: root cause was the street **curb
  collider** sweeping the descending capsule sideways into the bounds wall
  (chained resolution). Curb is now visual-only and resolution stops at first
  contact per axis.
- Street asphalt slab extended under the stairwell shaft descent — rebuilt
  around the shaft footprint.
- Collision resolution could chain-push across multiple boxes in one frame
  (the 11.8 m sideways jump) — now clamps once per axis per frame.
- Boot-time `opts is not defined` ReferenceError from a destructured-signature
  pitfall in `box()`; `makeToggleable` white-restore edge; kit.js levers
  self-reference crash; missing `audio.drip`; pointer-lock gesture errors
  in headless QA; spawn yaw aimed at the kiosk door.
- Spawn-view readability: kiosk entry sign + wayfinding signs now
  self-lit (emissive); sump nest light boosted.

### Revision 2 — user-feedback pass (same day)
- Real torch viewmodel (CC-BY-4.0 Sketchfab flashlight via licensed clone),
  auto-oriented, emissive lens tied to lamp state.
- Doors rebuilt: jamb frames, visible hinges, recessed panels; hinge-at-jamb
  placement fix (leaves were half-buried in walls); leaf colliders follow
  the swing and stay solid when open (anti-crush guard).
- Gravity (fall velocity, landing dip, landing footstep), stair-judder camera
  vibration, head-bob retained.
- Street sealed with fenced grass verges (Ground037/054 CC0), bushes, soil
  strip; grass-surface footsteps (Fantozzi Sand set, CC0).
- Night sky: stars, moon + halo, moonlight; global brightness retune.
- Overlap audit added (verify_world.py); 2 locker placements fixed.
- setup_browser.sh: ESM-safe @sparticuz/chromium bootstrap.

### Revision 3 — council iteration pass
- FIXED critical materials.js bug: textures loaded but never attached to
  materials (async spread race) — surfaces rendered untextured since v1.0.
- World-scale UV density baked in box() (uniform ~1.5–2 m tiles).
- Lighting re-balanced for real PBR albedos; torch beam stronger.
- Repo adoptions: triomonnezza asymmetric door easing, enari sprint-FOV
  kick, layered viewmodel sway (FPS2 principle).
- Stair judder made perceptible; barrels textured.

### Revision 4 — doorway pass
- FIXED the "invisible wall in the open doorway": the anti-crush guard used to
  freeze a door's collider at its closed pose when the door was opened while
  standing in the threshold. Now the collider disables during a crushing
  sweep and force-resyncs to the resting pose the moment the door settles.
- Cloned the jamb-hinge door pattern onto two more doorways: door_d4 (breaker
  nook, corridor west wall) and door_d5 (stairwell->atrium archway, opens
  away from the approaching player).
- New QA: walk-through-open-door regression (open from threshold, walk
  through) + all-doorways-clear audit (no active collider may cover any gap
  center when open). verify_world now 15/15; critical_path 40/40.

### Revision 5 — doorway visuals + torch direction
- FIXED mid-doorway "pillar": door frames were positioned at the HINGE
  origin, so one jamb + header landed in the middle of the gap. Frames now
  center on the gap via hinge math (frame = pivot + width/2 along the
  closed-leaf direction); knuckles moved to the hinge edge. Verified
  geometrically (frame↔gap error 0.000 for all 6 doors) and photographically
  (center-strip edge scan of every open-door shot: no pillar signature).
- FIXED backwards torch: end-for-end orientation now uses signed glass-end
  detection on the model's long axis (old code "flipped" by rolling about
  the long axis — a spin, not a reversal), plus a runtime camera-space
  self-check that verifies the mouth sits forward of the body.
- New tools/qa/shoot_doors.py: 18-shot Playwright pass (every door closed +
  open, note overlay, torch off/on, service gate open, all rooms).
- verify_world 16/16 (new door_frames_centered_on_gap check);
  critical_path 40/40.

### QA tooling (`tools/qa/`)
- `setup_browser.sh` / `pw_common.py` — Playwright + SwiftShader bootstrap.
- `smoke.py` — boot, console-error capture, per-room screenshots + tri/draw
  stats.
- `critical_path.py` — 39→40 poll-based checks: full playthrough with real
  key walking, physics, doors, objectives, rebinding/persistence/conflict/
  reset, ending, restart-clean-state. **Final: 40/40.**
- `probe.py` — state tracer used to pin the collision teleports.
- `analyze_shots.py` — programmatic visual QA (luminance/variance/thirds/
  color diversity) → `qa/shots/analysis.json`. **Final: 13/15** (2 flagged
  shots are intentional dark beats).

## Revision 5 — "black wall" extermination pass (2026-09-07)

User QA reported a black wall: visible but faint, no collision, touching the
first door, and black masses outside/around the game. A new instrumented
scanner (`tools/qa/scan_ghosts.py`) walks a dummy collision capsule over a
grid of the whole map with every door open and cross-references every mesh
against colliders, doors and rooms. Findings and fixes:

- **THE black wall**: fence mesh infill planes were rotated +90° off — three
  huge 0.42-opacity dark planes stood perpendicular to the fence, one cutting
  the street parcel at x=0 from z=-30 through the kiosk door, the other two
  jutting past the west/east bounds. Re-aligned to the fence line, then
  replaced entirely with an alpha-tested chain-link lattice (see-through, no
  more black sheet at eye level).
- **Bars at the first interior door**: the sump tomb-gate bars had never been
  positioned — six 2.6 m bars stood at the world origin inside the atrium
  door_d1 threshold. The whole tomb gate was also buried inside the west
  wall; rebuilt proud of the wall (plug, frame, bars, chains, red lamp).
- **Skyline intruders**: two "distant" buildings sat inside the playable
  bounds (east) as giant dark walk-through masses — pushed fully outside.
- **Walk-through ghosts given collision**: verge bushes (soft), gallery
  beater pump, gantry railing lines.
- **Head-height ghost pipe** in the sump re-hung near the ceiling.
- **Kiosk shell holes**: north/south facades had open black slits under the
  roof (walls stopped at 5.32/5.3) — closed flush.
- **Dead "always" circuit**: `_applyInitialCircuits` never enabled the
  `always` circuit, so every always-on light (street sodium lamp included!)
  ran at intensity 0 since v1.0. Enabled — the street, porch, kiosk and
  fence corners are now actually lit; first-door approach luminance went
  9→107 (OpenCV-measured).
- **Exterior void**: no ground existed past the fence; added a dim city
  ground disc to the horizon so the skyline sits on ground, not void.
- **Physics teleport class fixed**: `_tryAxis` snapped the capsule to the far
  face of any collider it already overlapped (QA poses near the new bush
  colliders launched the player 20 m through the fence). Boxes already
  intersected are now skipped (exit-only).
- **Jump + run feedback** (user request): bindable Space hop with synthesized
  jump whoosh, landing thump scaled by impact, landing camera shake, sprint
  breath SFX. (OpenGameArt is network-blocked here; SFX are procedural,
  walking footsteps remain CC0 Fantozzi FLAC.)
- New QA: `shoot_surroundings.py` (panorama evidence ring) +
  `opencv_analyze.py` (luma/dark-region/palette extraction, black-wall
  detector) + `tools/keep_improving.py` (3 h autonomous verify loop).
- verify_world probe yaws corrected to the real forward convention; sealing
  probes now genuinely walk into each edge.

Final gates: verify_world 16/16, critical_path 40/40, ghost scan 0 open
cells / 0 invisible walls, OpenCV black-wall flags NONE.

## 2026-09-08 (turn 6) — user bug list closed + HDR/surroundings pass
- Street curb split (±1.3 m gap) so the down-stair shaft is no longer roofed by a non-colliding slab.
- Gantry stair steps un-mirrored (0.61 + i*0.42).
- Torch beam aligned forward/down (lampTarget (0.1, -0.75, -8)).
- Doors: function verbs ("Close door" when open/opening), prompt re-renders on verb change, mid-swing E reversal.
- Lighting circuits: 10 lamps on "lighting" breaker (default OFF), 5 on "service" (OFF); sump torch-only.
- Surroundings/HDR pass: far skyline band + rooftop HVAC/tank/mast silhouettes + warm/cool window mix (reference list: research/environment-reference.md).
- QA: verify_world 16/16, critical_path 40/40, ghost scan open=0/invisible=0. VISUAL_APPROVAL remains FALSE (human/vision sign-off pending).

## 2026-09-08 (turn 7) — real-asset pass + acquisition loop
- Sluice leaf rotated 90° (was perpendicular to its opening); both vertical
  gates now rise into real slots/hoods; sprocket+chain+counterweight rig.
- fps-asset-kit (CC0): gun rack (pistol/rifle GLB) in kiosk; distant gunshot
  ambience; ambientCG 1K PBR sets already drive all surface materials.
- warehouse-3d (MIT) industrial props in Pump Hall; Quaternius (CC0) street
  furniture + skyline buildings replace procedural blobs/boxes.
- FMOD-style exertion audio: wind/breath/pulse layers follow sprint parameter.
- New QA: props_grounded + stricter overlap audit; _gltfProp bbox pipeline fix.
- tools/acquire_loop.py: 2h autonomous acquisition timer (GitHub/npm routes).

## 2026-09-11 — entry/shaft wall-lamp rebuild (user screenshots)

- User screenshots showed the entrance light as a hollow white arch floating
  against the night sky with its mount box hovering off the facade. Root
  cause: kit.wallLamp used an OPEN-ended cone shade (see-through shell) and
  every placement left the mount plate off the wall face (porch mount floated
  0.06 outside the outer face; shaft lamps floated 0.15+ off the north wall,
  facing it backwards).
- kit.wallLamp rebuilt as a closed bulkhead light: flush back plate (embeds
  into the wall at placement), short arm, closed metal dome, emissive
  down-lens. Solid from every angle; nothing see-through.
- Placements fixed: porch lamp (0, 5.3, -14.95) — mount embedded in the outer
  face, dome tops out at 5.47 below the 5.6 parapet so it can never silhouette
  into the sky; four exit-shaft lamps re-mounted ON the chimney north wall
  (yaw 0, z 19.62, embedded).
- Verified visually (headless shots at both user angles + shaft + kiosk) and
  by QA: verify_world 17/17, critical_path 40/40.
