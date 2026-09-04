# GITHUB REPOSITORY STUDY
Date: 2026-09-04. All 9 repos shallow-cloned into research/github/repos/ (gitignored).

## Summary verdicts
| Repo | License | What it is | Verdict |
|---|---|---|---|
| enari-engine (iErcann) | MIT (code) | TS+Vite Three.js FPS engine: Actor/Pawn core, Ammo.js physics (capsule + trimesh colliders), InputManager with KeyBinding enum, FPS/TPS camera managers, AudioManager. Assets: Quaternius weapons, Kenney env (BANNED for us), DJMaesen CC-BY arms, RobotExpressive. | ADAPT architecture patterns (input actions, player owns position, camera follows). Do not reuse Kenney-derived GLBs. |
| CSS-3D-Dungeon (MeroVinggen) | MIT | CSS-3D dungeon crawler, 49 assets, mostly UI/audio/webp. 3D CSS transforms, not WebGL scene craft. | STUDY ONLY (no reusable 3D subsystem for WebGL FPS). |
| FPS2 (Parking-Master) | MIT (code) | Large multiplayer web FPS: 207 assets, maps CARGO/CITY/GHOST/VERTEX, Minecraft-style characters with 10 anims each, heavy weapons (~12 anims each, 13-30MB GLBs). MIT covers code; per-model provenance mixed/unclear. | STUDY ONLY for structure. Weapon/character assets NOT needed (non-violent game) + provenance unclear. |
| fps-asset-kit (petroulacl) | README: assets CC0/public-domain | Curated CC0 pack: ambientCG PBR texture sets (asphalt, bricks, concrete, ground, more), Flat Guns East/West (CC0), firearm SFX, footstep SFX. | **PRODUCTION**: ambientCG CC0 PBR textures are our material backbone. Verify footsteps set license in README table before use. |
| threejs-fps-tps-starterkit-advanced (hugohamelcom) | MIT | Starter kit, 0 local assets. FPS/TPS switch, pointer lock. | STUDY ONLY (small). |
| threejs-liminality (IronExcavater) | MIT (code) | Backrooms-style liminal explorer: cannon-es, procedural generation, exit-door model with 'Open' clip, power-switch with 'Activate' clip, flashlight, weeping-angel enemy. Assets "from Sketchfab/Pixabay/TextureCan/Poly Haven" without per-asset attribution. | ADAPT gameplay loop ideas (power switch → gate). Asset provenance too vague → do not reuse binaries. |
| final-project-triomonnezza (Sapienza course) | none (all-rights-reserved default) | COMPLETE small horror game: grid maps, CollisionBuilder (Box3 list vs player), DoorController (hinge tween + back-out easing s=1.2, block re-trigger mid-swing), FlashlightController (battery→flicker), MonsterAI (state machine + LOS raycasts), procedural hierarchy animation, InteriorAssetManager with LLM-assisted semantic prop placement (documented in their README). | STUDY ONLY for code patterns (door easing, collision-box registration convention, semantic prop groups). Interior prop GLBs: no license file → REJECTED for production reuse despite good fit. |
| first-person-shooter (LUMECraft) | none | Three.js FPS with FBX nature assets + character. | STUDY ONLY. |
| A_combat_game (Kevinlaptop) | none | Small combat game reference. | STUDY ONLY. |

## Patterns library (what we adopt, from where)
1. **Input actions not raw keys** — Enari `InputManager`/`KeyBinding` (enum of actions, isPressed/justPressed/justReleased, reset per frame). ADAPT: action→code map, user-rebindable, persisted.
2. **Player owns position; camera follows player** — Enari PlayerController + devlog 2:34. ADOPT.
3. **Capsule-shaped player vs world** — Enari (ammo capsule, devlog 3:00 "capsules prevent edge snagging"). ADAPT: our own capsule-vs-AABB sweep (no physics engine dependency; deterministic, testable).
4. **Collision as registered Box3 list, decorative meshes excluded** — Triomonnezza CollisionBuilder convention. ADOPT (with spatial grid for perf).
5. **Door hinge groups + tween with heavy back-out easing + isAnimating guard** — Triomonnezza DoorController. ADOPT.
6. **Data-driven grid maps parsed into world** — Triomonnezza maps/ (we use JSON room data instead of grids; same principle). ADOPT.
7. **Semantic prop grouping (WORKSTATION/STORAGE/MEDICAL...)** — Triomonnezza InteriorAssetManager philosophy. ADOPT.
8. **Power switch → gate/exit causality** — Liminality (power-switch 'Activate' clip + exit-door 'Open'). ADAPT into our breaker→winch chain.
9. **rAF single loop, update-order discipline** — Enari Game.ts. ADOPT.
10. **Dispose on unload (weapon-switch leak)** — Enari devlog 11:32. ADOPT for room asset lifecycle.
11. **Flashlight battery flicker curves** — Triomonnezza FlashlightController. ADAPT for our hand lamp (optional feature).
12. **Monster teleport-to-adjacent-room pressure** — Triomonnezza MonsterAI. NOT NEEDED (no monster; restraint per video report).

## Maps studied (from repo clones under research/github/repos/)
- `final-project-triomonnezza/src/world/maps/Map{Easy,Medium,Hard}.js` — grid-labyrinth hub structure (rooms around corridors; goal door with green light landmark).
- `threejs-liminality/src/Maze.js` — procedural backrooms chunk flow.
See files for room/route analysis.


## Adoption receipts (Revision 3, from re-clones)
- `final-project-triomonnezza/src/core/DoorController.js` — Quadratic.In open /
  Quadratic.Out close easing (lines 81–161): ADOPTED in our doors.js.
- `enari-engine/src/View/Renderer/PlayerRenderer/FPSRenderer.ts` — dynamic FOV
  switching (lines 271–281): ADOPTED as sprint FOV kick.
- `threejs-liminality/public/assets/models/flashlight/` — CC-BY-4.0 Sketchfab
  model (Brandon Baldwin) with license.txt: USED as the hand torch.
- FPS2 — animation excellence is in GLB clips + AnimationMixer (bundled JS not
  readable): principle adopted as layered procedural sway.
