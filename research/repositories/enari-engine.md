# Repository report — iErcann/enari-engine (Tier 1, primary reference)

- **URL:** https://github.com/iErcann/enari-engine · cloned at `research/github/repos/enari-engine`
- **Relation to video:** README links video `to032deYr-Q` as this repo's tutorial; deployed at enari-engine.vercel.app (+ backrooms/minecraft/unrecord variants on Vercel branches).
- **Stack:** TypeScript 5 + three 0.164 + Vite 5; ammojs-typed physics; three-nebula particles; three-csm shadows; tweakpane debug.
- **License:** MIT (`LICENSE` present) — code may be studied and patterns reused; assets in `public/` belong to their authors (Quaternius weapons, CC-BY/CC0 audio per video credits; Kenney environment = banned project-wide here).

## Architecture (from source tree, not README)
- `Game.ts` — singleton (`Game.getInstance()`), owns Renderer / InputManager / Physics / AudioManager. Update loop: single `requestAnimationFrame`, re-armed at end of `update()`. Order: `player.prestep(dt)` → `inputManager.update` → actors → `player.update` → `physics.update` → `renderer.update`.
- **dt clamp:** `dt = Math.min(20/1000, dt)` — 20 ms max step. Prevents tunneling after tab-switch. We clamp similarly; theirs is tighter.
- `Core/Player.ts` (341 lines) — Ammo capsule rigidbody, `setAngularFactor(0)` to stay upright, `setDamping(0,0)` + `setGravity(0)` so velocity is fully hand-controlled.
- `Physics/Collider/*` — Cube/Sphere/Ground/Trimesh colliders; `MapMesh.addPhysics()` traverses one GLB (`pool_day_baked.glb`) and builds a trimesh collider per mesh child; children named `Spot*` become `FakeSpotLight` volumetric cones instead of colliders.
- `View/CameraManager/FPSCameraManager.ts` — Euler "YXZ", sensitivity `0.0015`, camera = player pos + `eyeOffsetY = capsuleHeight*2.5/3`.
- `View/Mesh/FPSMesh.ts` — viewmodel: `frustumCulled = false` on all children (weapon never pops out of frame), per-mesh `viewmodelOffset`.
- `View/Audio/AudioManager.ts` — THREE.AudioListener + single THREE.Audio; `playShot()` = stop + play.

## Key patterns to steal (verified in source)
1. **Source-engine Accelerate** (`Player.ts: Accelerate/MoveGround/MoveAir`): dot-product speed projection, `accelSpeed = min(wishSpeed*airAccel*dt, addSpeed)`. This is the Quake/CS movement core; our accel-lerp is the simplified cousin. Keep ours (walker, not strafeshooter) but their ground-friction `drop = speed*friction*dt` formula is a clean upgrade path if movement ever feels floaty.
2. **Grounded raycast with manual cleanup**: `ClosestRayResultCallback` ray 1.5 units down from capsule base, then `AmmoInstance.destroy()` for from/to/callback — the "memory-leak fix" from the video (11:32).
3. **Jump gating:** `canJump() = isOnGround && jumpRechargeTimer >= 100ms`; jump adds `+0.11` y nudge before applying `jumpVelocity=200` — avoids initial ground interpenetration. Our `!airborne` gate is equivalent; the 100 ms recharge is a nice anti-bunnyhop guard.
4. **Recoil damping curves:** `c*x*exp(1-c*x)` (Desmos-derived) for pitch/yaw recoil decay with 10% yaw-direction flips. If we ever add impact-kick feedback beyond landing shake, this is the function family to use.
5. **dt clamp 20 ms** and update ordering — confirms our loop order.
6. **Viewmodel `frustumCulled=false`** — cheap insurance we already apply to the lamp; keep.

## Techniques NOT to copy
- **Ammo.js** — author themselves say "Ammo.js has a better alternative now (Rapier.js)"; we deliberately use bespoke capsule-vs-AABB sweep (deterministic + QA-probeable), which is even lighter.
- **Single THREE.Audio with stop()+play()** — re-triggers cut off overlapping sounds; our pooled multi-source synth is superior.
- **Trimesh-everything colliders from one GLB** — opaque to our ghost-scan QA; our authored AABB list stays.
- `console.log('jump')` left in Player.jump() — dev noise, don't ship.
- Kenney environment assets visible in the video/public — banned for this project regardless.

## Applicability to Still Water
Already adopted from this lineage: player-owns-position/camera-follows, capsule collider, single rAF loop, viewmodel sway, dispose discipline, grounded-gated jump. Remaining optional upgrades: 20 ms dt clamp (we clamp larger), 100 ms jump recharge, Accelerate-style friction. Priority: low (already aligned).
