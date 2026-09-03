# RESEARCH REPORT — Pump Station 7

Generated 2026-09-03. Every design decision below has a reason; sources are the
supplied YouTube references and the studied human-made Three.js repos.

## 1. What the references tell us (YouTube)
The 11 supplied links cover a coherent design space. Classified by relevance:

**PRIMARY (directly shape the build)**
- **INFRA** — the closest tonal match: a structural analyst walking decaying
  water/utility infrastructure. Teaches: every machine has a function and connects
  to pipes/cables/signage; exploration *is* the gameplay; dread from failing
  infrastructure, not monsters; wayfinding via signage + light + logical layout.
- **SOMA** — underwater/coastal station horror: pressure doors, pump/generator
  machinery, emergency lighting; sparse earned encounters; dread through absence.
- **Amnesia: The Bunker** — the generator/fuel core loop (= our fuse → generator
  → power objective); light as a gameplay resource; one small interconnected
  facility, few rooms, dense with purpose.
- **Alien: Isolation** — industrial corridors + one unscripted stalker; sound =
  spatial awareness; re-traversal tension; vents/alternate routes.

**SECONDARY (technique/lesson only)**
- SCP:CB (dread from darkness/blink/sound on a tiny budget), Black Mesa + Portal 2
  (facility architecture guides without UI; layered decay), Outlast 1/2 (pacing;
  CAUTION — relentless chases exhaust players), Phasmophobia (darkness contrast).

**TECHNICAL**
- iercan's "Counter Strike in JavaScript" devlog = the enari-engine author's own
  walkthrough of building a browser FPS in Three.js.

Full metadata: `research/video_manifest.json`. Per-video design principles:
`research/video_analysis/<id>.json`.

## 2. Human-made repos studied (→ GITHUB_GAME_ARCHITECTURE.md)
- **enari-engine** (MIT): TS + Vite + three + Ammo.js + CSM + tweakpane. Best
  *engine* reference (module separation, physics, loading manager).
- **threejs-liminality** (MIT): cannon.js + flashlight + PowerSwitch + ExitDoor +
  maze. Best *horror-systems* reference (maps 1:1 onto our power/door/flashlight).
- **FPS2** (MIT): AI bots + in-game map editor + gamepad.
- **triomonnezza**: tween-based door/object animation.
- CSS-3D-Dungeon (CSS 3D, not WebGL — N/A), LUMECraft, A_combat_game (demos),
  fps-asset-kit (no license → cannot import).

## 3. Reuse decisions (→ REUSE_DECISIONS.md)
- REUSE: verified AABB collision, data-driven prop library, browser AABB ground-truth
  scan, loading-with-failure-tracking, Playwright QA.
- REIMPLEMENT (patterns, not code): DoorController state machine, data-driven
  Interactables, motivated light components, collision debug overlay.
- AVOID NOW: Ammo/Cannon migration (high-risk, zero current payoff), TS/Vite
  migration (churn), unlicensed asset kit.

## 4. Visual target (→ VISUAL_TARGET.md)
Abandoned coastal water-pumping station. Concrete + painted steel + worn tile,
motivated lighting only, real-world metric scale, camera 1.6 m, hero-object +
functional-support prop budgeting, horror through restraint. No rainbow/neon, no
cartoon assets, no monochrome props.

## 5. Current repository audit (→ CURRENT_REPOSITORY_AUDIT.md)
Renderer/camera/player/input/loading/QA = REUSE. Interaction + door systems = REVIEW
(refactor to data-driven without behaviour change). `world.js` monolith = REPLACE
(long-term split into room/door/interaction data). Verified today: 13/13 Playwright
checks, 0 prop overlaps, doors 29/29, 0 console errors.

## 6. Sandbox constraint (recorded honestly)
Direct YouTube/Sketchfab/itch egress is firewalled here. Video research used the
platform oEmbed proxy (metadata + thumbnails); frame/transcript extraction scripts
are provided in `tools/video_research/` and run locally. GitHub + PyPI + npm are
reachable, so repo study and the Playwright/Chromium toolchain were rebuilt.

## 7. Next actions (ordered)
1. Rebuild visual review + approved/declined folders (in progress).
2. Split `world.js` into data-driven rooms/doors/interactions (no behaviour change).
3. Realistic asset pass per VISUAL_TARGET (replace Kenney placeholders), gated by
   `qa/asset_inspector.py` + `game/data/assets.json`.
4. DoorController + Interactable state machines; animation pipeline.
5. Performance profile (draw calls, texture memory, GLB sizes).
