# Repository report — final-project-triomonnezza ("Echoes in the Dark")

- **Local clone:** `research/github/repos/final-project-triomonnezza`
- **Stack:** three.js (vendored `lib/three.module.js`), tween.esm.js, PointerLockControls, GLTFLoader; modular `src/` split into `core/` (AudioSystem, DoorController, FlashlightController, MonsterAI, PlayerController), `world/` (CollisionBuilder, InteriorAssetManager, TextureLoader, maps/Easy-Medium-Hard), `animations/`, `entities/`, `ui/`.
- **License:** NO LICENSE FILE — study only, do not copy code.

## Architecture (source tree)
- **DoorController** — tweened hinge doors with a custom "back-out" easing; explicit comment: overshoot strength lowered from tween.js default 1.70158 *for heavy-wooden-door feel* — deliberate physicality tuning of easing. Decoupled via DOM CustomEvents (`portaAperta`, `portaGoalAperta`), dependencies injected through constructor ("stays testable and has no implicit globals").
- **CollisionBuilder** — converts map meshes into `THREE.Box3` colliders; documented convention: *decorative meshes are NOT registered* — the exact rule our ghost scan automates.
- **MapBase/MapEasy/Medium/Hard** — difficulty variants share a base builder; monster + flashlight controllers; blood-splatter UI layer.

## Key patterns to steal
1. **Easing tuned to material physics** — door overshoot constants chosen by material weight. Our doors.js uses plain eases; cheap upgrade: slight back-out on open for heavy metal doors, none for the light kiosk panel.
2. **Event-decoupled controllers + DI constructors** — matches our doors/interact separation; we already route through interact.js callbacks rather than globals.
3. **Explicit decorative-vs-collider convention** documented in the builder — we enforce it mechanically with scan_ghosts.py instead (better).

## Techniques NOT to copy
- Vendored three.js module copy (version drift) — npm lockfile wins.
- Monster/flashlight systems — no combat/monster genre for Still Water.

## Applicability to Still Water
One concrete micro-upgrade candidate: door easing with material-appropriate overshoot. Priority: low (polish pass).
