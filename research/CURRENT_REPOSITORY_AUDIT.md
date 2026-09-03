# CURRENT REPOSITORY AUDIT — `ChibuikeOnuigbo/3dGame`

State inspected: 2026-09-03 (branch `arena/01a064a7-3dgame`). This documents the
existing architecture and classifies each system as REUSE / REPLACE / REVIEW, per
the production directive (the current world is "untrusted" but its reusable
infrastructure is preserved).

## Runtime architecture
- `game/index.html` loads `js/*.js` (plain script tags, no bundler) + `vendor/` three.js.
- Entry: `main.js` — renderer, camera, clock, resize, animation loop, authored
  per-room viewpoints (`hcQA.rooms()`), `hcQA` debug/QA hooks.
- `world.js` — builds all rooms inline: floors/walls/ceilings, door leaves
  (`portalDoor()`), `solids` AABB collision, `open()` openings, `blocked()`,
  `floorAt()`, `nearestInteract()`, door animation in `update()`.
- `props.js` — data-driven prop library (`PropLibrary.place()`), tags clones with
  `userData.hcProp`/`hcPos`/`hcRy` for QA scanning.
- `player.js` — first-person controller (move/look/sprint/crouch).
- `input.js`, `ui.js`, `audio.js`, `save.js`, `materials.js`, `assets.js`.
- `game/data/rooms.json` (room purposes) + `game/data/props.json` (146-GLB manifest).

## Classification
| System | Status | Notes |
|---|---|---|
| Renderer / camera / resize loop | **REUSE** | standard, works |
| Player controller | **REUSE** | fast/responsive (a stated requirement); verify head-bob/foot-step feel |
| Input | **REUSE** | pointer-lock + keys |
| Interaction framework | **REVIEW** | interactions live inside `world.js` (hard-coded per object). Directive requires data-driven Interactables. |
| Collision | **REUSE (verified)** | `solids` AABB + `blocked()`; browser ground-truth scan confirms no wall/floor pass-through, props block capsule. |
| Door system | **REVIEW** | functional (29/29 open/pass) but one-off per door, not a reusable DoorController state machine. |
| Asset loading | **REUSE** | GLTFLoader with failure tracking; 146 GLBs, 0 failed. |
| Animation | **REVIEW** | doors animated by transform tween; no AnimationMixer/animation-clip pipeline yet. |
| Audio | **REVIEW** | hooks exist; check whether spatial audio is actually wired. |
| UI | **REUSE** | minimal HUD (objective + prompt). |
| Save/state | **REVIEW** | save.js + objective state exist; expose full debug-state snapshot for QA. |
| Level system | **REPLACE (long-term)** | `world.js` is one large script (~1200+ lines). Directive wants data-driven rooms/doors/props/interactions. |
| QA | **REUSE** | `qa/validate.mjs` (377 checks), `qa/audit.mjs` (GLB AABB), `qa/browser_scan.py` (browser ground-truth AABB, authoritative), `qa/qa_playwright.py` (13 checks), `qa/shot_rooms.py` (per-scene visual review). |
| Playwright | **REUSE** | Sparticuz Chromium 149 + SwiftShader; reproducible via `qa/setup_qa_env.sh`. |

## Known bugs / risks
- **Monochrome assets:** 19 flat single-colour Kenney GLBs were already deleted from
  the active build (kept as git reference). Continue enforcing the no-monochrome rule.
- **`world.js` monolith:** the main maintainability risk. Refactor into data-driven
  room/door/interaction modules without changing current playable behaviour.
- **Seagate off-axis views dim** (lum 12–19): a lighting-caveat, not a blocker.
- **Performance:** 146 GLBs loaded eagerly; measure draw calls / texture memory and
  consider instancing + shared materials (directive phase 21).

## Verified (evidence in `qa/browser_scan.json` / `qa/qa_report.json`)
- 147 placed props, 318 architectural walls, **0 prop<->prop overlaps**.
- 10 remaining in-wall flags ≤ 0.12 m (wall-mounted/flush — legitimate).
- Doors 29/29 block-when-closed / open / passable. Collision corridor walkable.
- Objective chain fuse → generator → card → lab → valves → code → gate completes.

## Bottom line
The engine/QA/loading infrastructure is **sound and reusable**. The main work per
the directive is (a) un-monolith `world.js`, (b) real DoorController + data-driven
Interactable systems, (c) a genuine animation pipeline, (d) asset coherence against
VISUAL_TARGET.md, and (e) performance profiling — *without* regressing the playable,
collision-verified state that already exists.
