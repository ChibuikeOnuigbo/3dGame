# GITHUB GAME ARCHITECTURE STUDY

Human-made Three.js/browser FPS + horror repos studied as reference (cloned shallow
to /tmp, inspected source/license). Findings below answer: reuse / reimplement /
avoid, and better/worse vs. our current implementation.

## Repos studied

| # | Repo | What it is | License | Score (0–10 rough) |
|---|---|---|---|---|
| 1 | iErcann/enari-engine | CS-style FPS engine: TS + Vite + three 0.164 + **Ammo.js** + CSM shadows + tweakpane | MIT | architecture 9, playability 8, physics 9, relevance 8 |
| 2 | MeroVinggen/CSS-3D-Dungeon | Dungeon crawler rendered with **CSS 3D transforms** (no WebGL) | MIT | relevance 3 (different renderer) |
| 3 | Parking-Master/FPS2 | FPS with **AI bots**, map **editor (forge.html)**, gamepad controls, chat | MIT | interaction 7, AI 7, relevance 6 |
| 4 | Sapienza…/final-project-triomonnezza | Small horror FPS: GLTFLoader + PointerLockControls + **tween.esm** | none stated | animation 6, relevance 6 |
| 5 | IronExcavater/threejs-liminality | Liminal-space horror: **cannon.js** physics + flashlight + **PowerSwitch** + **ExitDoor** + maze | MIT | horror 8, systems 8, relevance 9 |
| 6 | hugohamelcom/threejs-fps-tps-starterkit-advanced | FPS/TPS starter (thin) | none stated | relevance 4 |
| 7 | LUMECraft/first-person-shooter | FPS demo, three >=0.139 | MIT | relevance 4 |
| 8 | Kevinlaptop/A_combat_game | Minecraft-like combat demo | none stated | relevance 3 |
| 9 | petroulacl/fps-asset-kit | Asset kit (442 files, models) | none stated | asset-only, license unclear → **do not import** |

## enari-engine (deep dive) — the best "engine" reference
- `Core/` GameObject·Actor·Pawn·Player, own Vector/Quaternion/Shape math, PeriodicUpdater.
- `Physics/Ammo.ts` + typed colliders (Cube/Ground/Sphere/Trimesh) over **Ammo.js (wasm)**.
- `Input/InputManager` + `KeyBinding` — rebindable keys.
- `View/` CameraManager (FPS + TPS), AudioManager, DebugUI (tweakpane), Mesh loaders
  (LoadableMesh, AnimatedLoadableMesh, MapMesh, GlobalLoadingManager), ParticleManager,
  CSM shadows, SkyShader, SceneLighting, Renderer hierarchy (Cube/Sphere/Trimesh/Shape/Viewmodel).
- `Controller/` PlayerController, CarController. `Game.ts` central orchestrator.

**Takeaways:** rigid-body physics via a real engine (Ammo) is the "correct" solution;
centralized GlobalLoadingManager; FPS camera + input separated from game state;
viewmodel rendering for first-person hands.

## liminality (deep dive) — the best horror-systems reference
- `Player.js` + **cannon.js** body; `CannonDebugRenderer` for collision debugging.
- `Flashlight.js`, `CeilingLight.js`, `DynamicSpotLight.js` — motivated light systems.
- `PowerSwitch.js` (power state), `ExitDoor.js` (locked/opening door), `Maze.js`,
  `Furniture.js`, `GameObject.js`. three 0.174.

**Takeaways:** a real physics engine + a debug renderer for collision; door and
power-switch as discrete stateful components — exactly the DoorController /
Interactable pattern our directive requires. Its flashlight + power mechanics map
1:1 onto Pump Station 7 (restore power, navigate dark rooms).

## fps2
- `bot.js` (bot AI), `forge.html` (map editor), `chatengine.js`, gamepad support,
  GLTF/OBJ loaders. Plain JS.

**Takeaways:** an in-game map editor is a large scope item we do **not** need now;
bot AI ideas (patrol/see-player) relevant later for the sea-gate threat.

## triomonnezza
- Single `main.js`, GLTFLoader + PointerLockControls + **tween.esm** — door/object
  animation via tween library.

**Takeaways:** tween-based transform animation is the pragmatic pattern for doors/
drawers/valves (we already do this with manual lerp; a small tween helper is cleaner).

## What we REUSE (MIT / no-conflict)
1. **DoorController + Interactable state machine** (pattern from liminality + enari
   Actor/Pawn), reimplemented for our data-driven world.
2. **Cannon/Ammo debug-renderer idea** for a visible collision debug overlay in QA.
3. **GlobalLoadingManager** pattern (we already track GLB load failures).
4. **Motivated light components** (ceiling/utility/spot/flashlight) as data.
5. **CSM shadows + sky shader** approach for the exterior (yard/sea gate) — later.

## What we AVOID
- **Ammo/Cannon migration now:** our verified AABB `solids` collision already passes
  the browser ground-truth scan (0 overlaps, doors/collision OK). A physics-engine
  rewrite is high-risk for zero current payoff; revisit only if physics *props* are
  needed.
- **TypeScript/Vite migration now:** plain script tags already work end-to-end; a
  build-system migration is churn. Reconsider if the team grows.
- **fps-asset-kit models:** no license statement → cannot import.

## Better than ours / worse than ours
| System | Better elsewhere | Notes |
|---|---|---|
| Physics | enari (Ammo), liminality (cannon) | more robust for rigid bodies; ours is lighter + already verified |
| Collision debug | liminality CannonDebugRenderer | add a lightweight AABB debug overlay for QA |
| Door system | liminality ExitDoor | stateful component, not one-off |
| Loading | enari GlobalLoadingManager | we have equivalent failure tracking |
| Input | enari KeyBinding | rebinding is a nice-to-have |
| Level data | OURS is fine | rooms.json + props.json already data-driven; world.js is the monolith to split |
