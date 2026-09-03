# REUSE DECISIONS

Every borrowed/reimplemented idea, its source, why, license, and what we changed.

| # | Idea | Source | License | Why useful | What we changed / will change |
|---|---|---|---|---|---|
| 1 | Data-driven prop library with per-clone tags (`userData.hcProp/hcPos/hcRy`) | own work (evolved from kenney GLB mirror) | n/a | lets QA measure every placed clone's real AABB | already in `props.js` |
| 2 | Browser ground-truth AABB scan (`geometry.boundingBox × matrixWorld`) | own work | n/a | authoritative overlap/in-wall detection the GLB JSON audit missed | already in `qa/browser_scan.py` |
| 3 | DoorController state machine (LOCKED/CLOSED/OPENING/OPEN/CLOSING) | liminality `ExitDoor.js` (MIT) | MIT | reusable, testable doors instead of one-offs | reimplemented data-driven; current `world.js` doors are verified working and will be refactored into this without behaviour change |
| 4 | Interactable record (id/name/type/state/onInteract…) | enari Actor/Pawn + directive | MIT | data-driven interactions, no hard-coded switches | to implement; current interactions live in `world.js` |
| 5 | Motivated light components (ceiling/utility/spot/flashlight) | liminality (MIT) | MIT | lighting that reads as real fixtures | current lights already motivated; formalize as data |
| 6 | Global loading manager with per-GLB failure tracking | enari GlobalLoadingManager (MIT) | MIT | 0-failed-asset guarantee | equivalent already in `assets.js` |
| 7 | Collision debug overlay | liminality CannonDebugRenderer (MIT) | MIT | visually prove collision during QA | planned: lightweight AABB/wire overlay behind a debug flag |
| 8 | CSM shadows + sky for exterior | enari (MIT) | MIT | believable yard/sea-gate daylight | later phase |
| 9 | Tween-based object animation (doors/valves) | triomonnezza (tween.esm pattern) | study-only (no license) | simple deterministic transforms | we already tween doors with manual lerp — keep, no code copied |

## Not reused (and why)
- **Ammo.js / cannon.js physics** — real rigid-body physics; NOT adopted now because
  our AABB `solids` collision is already browser-verified (0 overlaps, doors pass,
  corridor walkable) and a physics rewrite is high-risk/low-payoff at this stage.
- **fps2 map editor / bot AI** — out of scope for current slice.
- **CSS-3D-Dungeon renderer** — CSS 3D, not WebGL; different pipeline entirely.
- **fps-asset-kit models** — no license statement → cannot redistribute.

## Asset sourcing rule (in effect)
- Kenney CC0 is **banned as final visual style** per the directive's realism target;
  current Kenney GLBs remain only as a placeholder prop library until replaced by
  approved realistic assets (see `qa/asset_inspector.py` gate + `VISUAL_TARGET.md`).
- All future assets must pass the quality gate and be recorded in `game/data/assets.json`.
