# Repository report — threejs-liminality ("Liminality")

- **Local clone:** `research/github/repos/threejs-liminality`
- **Stack:** three.js 0.174 + cannon-es physics + heap-js (A*) — MIT License (Niclas Rogulski, 2025). Backrooms-style psychological horror: procedurally generated maze, flickering lights, power breakers, weeping-angel statues, flashlight, exit door, dev console.
- **Modules:** `Maze.js` (837 lines — Cell/Maze classes, `generate()`, `generateWalls()`, `generateRooms()`, `generateBorderWalls()`, entity placement), `Player.js` (200 lines, cannon-es capsule + contactNormal ground check), `CeilingLight.js`, `DynamicSpotLight.js`, `Flashlight.js`, `ExitDoor.js`, `PowerSwitch.js`, `Furniture.js`, `CannonDebugRenderer.ts`.

## Key patterns to steal
1. **Cell-based procedural maze with named generation phases** (walls → rooms → border walls → entity spawn) — clean template if Still Water ever grows procedural wings.
2. **Flicker/breaker interplay**: lights as world state that gates progression; we already run lamp circuits via `_applyInitialCircuits`; their breaker→door-unlock chaining is a good reference for the vault sequence.
3. **Contact-normal grounded test** with cannon-es — equivalent to our grounded flag, validates simplicity.
4. **heap-js A*** for pathfinding — only relevant if we add entities; we don't.

## Techniques NOT to copy
- cannon-es full physics — overkill for our authored-AABB world.
- Procedural-only level design — our hand-authored parcel + QA-proven critical path is the product; a random maze would break the "doors are the obvious way" guarantee.

## Applicability to Still Water
Best atmosphere reference in the set (flicker tuning, breaker pacing). Priority: low-medium — revisit when polishing lamp circuits.
