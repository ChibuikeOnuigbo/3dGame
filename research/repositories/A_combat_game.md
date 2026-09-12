# Repository report — A_combat_game ("Combat Craft")

- **Local clone:** `research/github/repos/A_combat_game` (ChibuikeOnuigbo workspace repo)
- **Stack:** zero-dependency single-file FPS: raw WebGL (no three.js), custom m4 matrix lib, voxel world, procedural pixel texture atlas, WebAudio-synthesized SFX — all inside one HTML with two big inline scripts (`combat_craft_core.js` is the stringified page).
- **License:** NO LICENSE FILE — code may be studied but not copied/redistributed.

## Architecture (source tree)
- Three GLSL programs: world atlas shader (aShade vertex AO + distance fog), entity shader (normal-based `0.55+0.45*NdotL` lighting, uFlash hit-flash, uNoFog for HUD-weapons), line shader (tracers).
- Player collision: `collideAABB(px,py,pz)` per-axis tests + `raycastVoxel()` DDA for hits — axis-separated resolution, same family as our capsule-vs-AABB sweep.
- Viewmodel trick: `gl.clear(gl.DEPTH_BUFFER_BIT)` then draw weapon with identity view — weapon always on top. Cheap and effective (we use frustumCulled + render order instead).
- Enemy walk animation from pure sine phases (`sin(walkT*2.2)*0.55` limb swings) — no skeleton.
- HUD as DOM overlay (crosshair, hitmarker, health/armor bars, weapon slots, toast) — DOM HUD over WebGL is exactly our pattern.

## Key patterns to steal
1. **Vertex-baked AO shade factor (aShade)** — precomputed corner darkness sells voxel corners; analogous idea: our corner-dark gradient textures already do this in texture space.
2. **Per-axis collision resolution** validates our `_tryAxis` approach.
3. **Fog applied in shader with near/far uniforms** — same as three.js Fog; ours is scene.fog, fine.

## Techniques NOT to copy
- Raw WebGL instead of three.js — massive effort for no gain at our scale.
- Single-file architecture — unreadable past ~3k lines, untestable; we keep modules + QA harness.
- All-procedural look limits texturing variety (we legitimately use CC0 PBR maps).

## Applicability to Still Water
Validation repo: our DOM-HUD + axis-collision + fog choices are the right ones. Priority: none (already aligned).
