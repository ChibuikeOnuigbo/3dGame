# Video analysis — to032deYr-Q (Enari Engine devlog, iErcan)

Method note (per directive §22): video BYTES are not downloadable from this
sandbox (yt-dlp 2026.08.19 TLS-killed: `SSL_ERROR_SYSCALL` after ClientHello;
gateway TLS-killed likewise). This analysis is built from the public watch
page, chapter list and full transcript obtained server-side
(research/video/metadata/to032deYr-Q.json). No frame-level claims are made;
timestamps are the author's own chapter markers.

## 0:00–1:39 — Tooling & project start
- Vanilla three.js + TypeScript + Vite; no React-Three-Fiber. Confirms our
  stack choice (three + vite, no framework).
- Split code into modules early ("way easier to work with in the long run").

## 1:39–3:00 — Scene, pointer lock, camera
- Pointer lock is "an absolute must for any FPS"; mouse deltas rotate the
  camera.
- KEY PATTERN (adopted in our Revision 1): "moving the camera directly isn't
  the best approach. Instead we need a player class with its own position and
  the camera will follow the player. We move the player, not the camera."

## 3:00–4:59 — Physics & the game loop
- Rapier physics (ammo.js in the 2021 original). Ground + cuboid colliders for
  boxes; fixed rigidbodies for statics.
- "For the player, a capsule collider is a great choice... capsules help
  prevent the player from getting stuck on small edges" (adopted as our
  capsule-vs-AABB sweep).
- "The most important thing to get right is the game loop": single rAF loop,
  updates everything in the right order (adopted).

## 4:59–6:50 — Trimesh colliders
- Colliders auto-generated from imported Blender maps (vertices+indices →
  trimesh). Verdict for us: keep authored AABBs (deterministic, QA-able);
  trimesh only if we ever import complex static meshes.
- Jump (6:50): set Y velocity; gate on grounded check via downward raycast
  that MUST ignore the player's own collider (we gate on `!airborne`, same
  idea, no self-hit risk).

## 7:26–12:11 — Viewmodel discipline
- Weapon mesh parented to the camera ("always in front of the player's view").
- 7:58 WEAPON MOVEMENT: bob when walking, sway when turning, bounce when
  jumping, driven by player velocity, lerped (adopted as layered viewmodel
  sway in Revision 3).
- Texture optimization: 4096² → tiny; "3 MB → 140 KB, ~95% reduction" — web
  games must ship light textures (our ambientCG 1-2K + repeat policy agrees).
- 11:32 MEMORY FIX: switching weapons reloaded duplicates → dispose on unload
  (adopted as dispose discipline; see DECISIONS.md pattern 10).

## 13:06–18:44 — Effects budget
- Muzzle flash / smoke / bullet particles optimized at 17:18; bullet holes at
  18:44 as decals, not geometry.
- Takeaway: particles are the first perf killer in browser FPS; keep counts
  bounded, pool them. (We have no gunfire; water drips/particles should stay
  pooled & bounded — they are.)

## 20:37–22:41 — Source-engine movement
- Author explicitly reproduces Source (CS) movement feel: accel/decel curves,
  air-strafe momentum. For our non-combat walker we keep snappy accel (14) +
  sprint FOV kick; momentum systems NOT adopted (genre mismatch) but the
  accel-lerp pattern is the one we use.

## 23:25–25:41 — Polish stack
- Slow-mo effect, post-processing, dynamic rigidbodies "for fun".
- Verdict: post-processing chain is a perf tax on SwiftShader-class machines;
  we achieve mood with fog/lights instead (correct call for our QA targets).

## Cross-cutting observations for Still Water
1. Player-owns-position + camera-follows: verified right for us.
2. Capsule player collider: verified.
3. Single rAF loop + update order: verified.
4. Camera-parented viewmodel with velocity-driven sway: implemented.
5. Dispose on asset switch: implemented (torch is single-asset; menu restarts
   stay clean).
6. Grounded-gated jump: adopted this session (Space hop + SFX).
7. Light web textures: enforced (ambientCG 1-2K, canvas-generated signage).
