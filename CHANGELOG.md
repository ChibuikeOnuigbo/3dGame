# CHANGELOG

All notable changes to Still Water. Dates are YYYY-MM-DD (build session).

## 1.0.0 — 2026-09-04 (release)

First complete, playable build. All gates §215–216 green.

### Game
- 7-room stormwater station: street, kiosk, stairwell, atrium, corridor,
  pump hall, valve gallery, sump, exit shaft — loop-back to street level.
- 7 data-driven objectives from `game/data/objectives.json`; notes, rooms,
  route map, world bounds from JSON.
- Collision: capsule + axis-separated clamp-to-face resolution; soft/step
  barrier classification; ground-region height fields for ramps and stairs.
- Doors (swing colliders), sluice + service gates, hold-to-crank winch,
  water level/drain state, lighting circuits + master breaker, one scare
  beat, procedural audio (ambience, surface-keyed footsteps, drips, sting).
- Original minimal UI: dynamic keycap prompts, full keyboard remapping with
  conflict displacement, persistence, reset; brightness/quality/volume.

### QA-fixed bugs (each reproduced via instrumented Playwright traces)
- Kiosk-entry teleport off the stair ramp: root cause was the street **curb
  collider** sweeping the descending capsule sideways into the bounds wall
  (chained resolution). Curb is now visual-only and resolution stops at first
  contact per axis.
- Street asphalt slab extended under the stairwell shaft descent — rebuilt
  around the shaft footprint.
- Collision resolution could chain-push across multiple boxes in one frame
  (the 11.8 m sideways jump) — now clamps once per axis per frame.
- Boot-time `opts is not defined` ReferenceError from a destructured-signature
  pitfall in `box()`; `makeToggleable` white-restore edge; kit.js levers
  self-reference crash; missing `audio.drip`; pointer-lock gesture errors
  in headless QA; spawn yaw aimed at the kiosk door.
- Spawn-view readability: kiosk entry sign + wayfinding signs now
  self-lit (emissive); sump nest light boosted.

### Revision 2 — user-feedback pass (same day)
- Real torch viewmodel (CC-BY-4.0 Sketchfab flashlight via licensed clone),
  auto-oriented, emissive lens tied to lamp state.
- Doors rebuilt: jamb frames, visible hinges, recessed panels; hinge-at-jamb
  placement fix (leaves were half-buried in walls); leaf colliders follow
  the swing and stay solid when open (anti-crush guard).
- Gravity (fall velocity, landing dip, landing footstep), stair-judder camera
  vibration, head-bob retained.
- Street sealed with fenced grass verges (Ground037/054 CC0), bushes, soil
  strip; grass-surface footsteps (Fantozzi Sand set, CC0).
- Night sky: stars, moon + halo, moonlight; global brightness retune.
- Overlap audit added (verify_world.py); 2 locker placements fixed.
- setup_browser.sh: ESM-safe @sparticuz/chromium bootstrap.

### Revision 3 — council iteration pass
- FIXED critical materials.js bug: textures loaded but never attached to
  materials (async spread race) — surfaces rendered untextured since v1.0.
- World-scale UV density baked in box() (uniform ~1.5–2 m tiles).
- Lighting re-balanced for real PBR albedos; torch beam stronger.
- Repo adoptions: triomonnezza asymmetric door easing, enari sprint-FOV
  kick, layered viewmodel sway (FPS2 principle).
- Stair judder made perceptible; barrels textured.

### Revision 4 — doorway pass
- FIXED the "invisible wall in the open doorway": the anti-crush guard used to
  freeze a door's collider at its closed pose when the door was opened while
  standing in the threshold. Now the collider disables during a crushing
  sweep and force-resyncs to the resting pose the moment the door settles.
- Cloned the jamb-hinge door pattern onto two more doorways: door_d4 (breaker
  nook, corridor west wall) and door_d5 (stairwell->atrium archway, opens
  away from the approaching player).
- New QA: walk-through-open-door regression (open from threshold, walk
  through) + all-doorways-clear audit (no active collider may cover any gap
  center when open). verify_world now 15/15; critical_path 40/40.

### QA tooling (`tools/qa/`)
- `setup_browser.sh` / `pw_common.py` — Playwright + SwiftShader bootstrap.
- `smoke.py` — boot, console-error capture, per-room screenshots + tri/draw
  stats.
- `critical_path.py` — 39→40 poll-based checks: full playthrough with real
  key walking, physics, doors, objectives, rebinding/persistence/conflict/
  reset, ending, restart-clean-state. **Final: 40/40.**
- `probe.py` — state tracer used to pin the collision teleports.
- `analyze_shots.py` — programmatic visual QA (luminance/variance/thirds/
  color diversity) → `qa/shots/analysis.json`. **Final: 13/15** (2 flagged
  shots are intentional dark beats).
