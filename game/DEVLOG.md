# DEVLOG

## 2026-09-03
Change: Dense-room pass + real prop pipeline + headless QA.
- Added data-driven GLB prop library: `game/data/props.json` (165 props), `game/js/props.js` (PropLibrary), wired in `main.js`. Props are authored in `world.js` via `prop(id,x,y,z,ry)` and resolved after world build, so the world never blocks on model fetch.
- Imported 166 Kenney CC0 GLBs (~3.2 MB) via `qa/sync_kenney.py` from the shorepine/kenney mirror (Sketchfab is unreachable from this sandbox; Kenney is CC0 and serves the same furniture/industrial purpose).
- Added 6 rooms (22 total): east hall, canteen, bunks, locker, boiler, store B — each with a purpose, focus, interaction, and lighting. Dressed every existing room with believable object groups.
- Fixed a doorway-gap bug: rooms previously left y=-20 pits between them; registered the rock slab as a base floor. Also reopened the yard gate (the yard was fenced off from the tunnel exit).
- QA: `qa/validate.mjs` builds the real world in Node (three.js headless) and checks 437 things: rooms.json fields, prop file/GLB integrity, room overlap, and full reachability from spawn (0 failures).
- Playwright: working. Installed Python 1.62 + the Sparticuz Chromium 149 headless-shell (serverless binary), with SwiftShader (SwANGLE) libs unpacked to /tmp and NSS libs from its al2023 bundle on LD_LIBRARY_PATH. `qa/qa_playwright.py --serve` boots the game, loads the prop library (92 GLBs, 0 failed), drives the full objective chain to the escape flag, verifies no floor gaps on the main path, and screenshots rooms with a pixel-level render sanity check — 6/6 checks pass (report: qa/qa_report.json).
- Screenshots are slow/flaky on the heaviest rooms (software WebGL capture can crash the single-process shell); the functional checks are deterministic and green.

## 2026-09-02
Change: Performance pass — Lambert, instancing, spatial hash, no per-room point lights. Large tile facility (~20 room types, long fuse→gen→card→lab→valves→code→gate loop).
## 2026-09-02 earlier
Change: Initial playable application — Hollow Current.
Reason: Empty workspace; previous builds were too short/empty.
Files: game/* 
Testing: Load index.html, walk facility, generator, valves, drones, menus.
Known issues: Sketchfab packs not imported (no auth); procedural density instead.

## 2026-09-03 (later) — collision & overlap ground-truth pass
- Root cause of "you don't calc dimensions": `qa/audit.mjs` `worldBox()` ignored each GLB's local x/z offset AND its node hierarchy, so it under-reported prop<->prop overlap (0) vs reality (10).
- Added `qa/browser_scan.py`: real Chromium loads the game and measures every placed prop's true world AABB (geometry bounding box x matrixWorld). It found 10 real prop overlaps + 22 wall penetrations + 14 (legit) mounted items.
- Fixed all 10 overlaps and the real wall penetrations by repositioning in `world.js` using measured AABBs (boiler machine cluster, generator piston/cog cluster, reception lounge, offices desk/chair, locker washer/bathtub/sinks, bunks beds/bookcase, storage boxes, catwalk, bathroom sinks). The misplaced locker `bathroomSink` (was in the canteen) and the east-wall-piercing `bathroomSinkSquare` were moved into the locker washroom.
- Result (browser ground truth): **0 prop<->prop overlaps**, 10 in-wall flags all <=12cm (wall-mounted signs/mirror/sink + flush boxes — legitimate), doors 29/29 block-when-closed / open-via-interact / passable-when-open, collision verified.
- `qa/qa_playwright.py`: 13/13 checks, 8/8 lit room frames, objective chain completes, 0 console errors.
- Added per-scene visual review: `qa/shot_rooms.py` -> `visual_review/<scene>/{general.png, 01..03 views, review.json}`.
