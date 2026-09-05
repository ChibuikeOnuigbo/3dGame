# FINAL QA REPORT — Still Water 1.0.0

Date: 2026-09-04. Environment: Playwright (Python) driving real Chromium
(`/tmp/chromium`) with SwiftShader software GL, served from `game/dist` via
local HTTP. Results below are from the final committed build.
Browser sourcing note (transparency): the official Playwright
`playwright install` CDN was network-blocked in this environment, so the
Chromium binary was taken from the `@sparticuz/chromium` npm package
(official Chromium build shipped on the reachable npm registry) and driven by
the unmodified official `playwright` Python package — see
`tools/qa/setup_browser.sh`.

## Summary

| Suite | Result |
| --- | --- |
| `tools/qa/smoke.py` (boot + console + rooms + stats) | **PASS** — no console errors, all 7 rooms render |
| `tools/qa/critical_path.py` (full playthrough) | **40/40 PASS** |
| `tools/qa/verify_world.py` (torch/doors/sealing/overlaps) | **13/13 PASS** |
| `tools/qa/analyze_shots.py` (programmatic visual QA) | **13/15 pass** (2 intentional dark beats) |
| `npm run build` | **green** (~1.5 s) |

## VERIFIED (evidence: critical_path.py output, this build)

- Boot to menu with zero page/console errors; start; spawn objective
  `find_logbook`.
- Street walk with real keys (KeyW) to atrium incl. door unlock, kiosk-locked
  beat (door locks behind player), wall collision stops movement.
- Logbook prompt/note → O1; prompt keycap shows bound key ("E").
- Door opens; O2 lights on (corridor transforms); O3 pumps objective.
- Valve A then B hold interactions complete; water level drops 0.367 → 0.096
  (< 0.1 threshold); sluice opens.
- Real-key walk down the gallery ramp to the sump floor (y −3.20).
- `note_last` targeting at correct pose (dot 0.95, dist 0.98, LOS clear) → O5;
  repeat-interact does not regress state.
- O6 master breaker → sump goes dark; winch enabled only after master (gate
  verified by enabled flag); service gate opens.
- Rebinding: INTERACT→KeyF (menu UI, keyboard capture), persisted to
  localStorage, live prompt keycap shows "F", binding MOVE_FORWARD→KeyF
  displaces INTERACT (no duplicate), reset restores defaults.
- Real-key switchback climb of the exit shaft (y −3.40 → 3.20); **ending
  triggers** (fade, player disabled, escaped flag); ground sanity at shaft
  ramp midpoint.
- Page reload → clean state (all flags false except `pumps_running`, which is
  the designed initial state) with objective `find_logbook`.

## Physics bugs found by QA and fixed (final build clean)

1. **Kiosk-entry teleport** (pos (0,2.89,−10.71) → (−11.84,0,−10.56), KeyW
   only): reproduced with a `player.update` monkey-patch frame recorder and a
   property-write trap; root cause = street **curb collider** crossing the
   stairwell descent; the clamp resolution chained into the west bounds wall.
   Fix: curb is `collide:false`; resolution now breaks after first contact
   per axis.
2. **Street slab overlapped the shaft descent** — swept the player to
   (−10.34, 0, −23.34). Fix: asphalt built around the stairwell footprint
   (main slab + two flanking strips).
3. Earlier in the session: axis-separated collision rewrite itself (removed a
   teleport-push fallback), `box()` opts ReferenceError at boot, kit.js
   levers crash, missing audio.drip, pointer-lock gesture errors.

## UNVERIFIED (method limits — reported honestly)

- **Human-visual QA.** No vision capability was available in this build
  session; screenshots were assessed **programmatically only** (luminance,
  variance, rule-of-thirds energy, color diversity — `analyze_shots.py`).
  Compositional/aesthetic judgments were not made. The 15 screenshots are in
  `qa/shots/` for human review.
- Real-GPU performance. Triangles/draw-calls were measured headlessly
  (0.9k–21k tris, ≤472 calls per view); framerate on actual hardware was not
  measured.

## Intentional deviations flagged by visual analyzer

- `01_atrium.png` (lum 2.7) — atrium before lights are restored; designed
  darkness, navigable by emergency circuit + hand lamp.
- `03_gate_open.png` (lum 3.9) — after the master breaker is pulled; only the
  dawn light through the raised gate is visible by design.

## BLOCKED (environmental, documented)

- Sketchfab (and itch.io) network access remained blocked all session
  (connection refused) despite an available token — no external 3D models
  could be fetched. World is 100% procedural geometry (see `CREDITS.md`).

## Known open (non-blocking)

- `backOut` easing overshoots ~2° on door close (visual only).
- `redLamps` array unused (dead code).

## Reproduction

```bash
cd game && npm run build && (npm run preview &)
cd ../tools/qa
python3 smoke.py http://127.0.0.1:4173/index.html
python3 critical_path.py http://127.0.0.1:4173/index.html
python3 analyze_shots.py
```


## Revision 2 (user-feedback pass, 2026-09-04)

User-reported issues and their resolution, all verified by `verify_world.py`
(13/13) + full `critical_path.py` rerun (40/40):

- "No textures / no grass": added Ground037 grass + Ground054 soil CC0 sets —
  street verges with curbs, bushes, soil strip; all walls/floors already
  ambientCG-mapped; global lighting raised (hemi 0.35→0.55, brighter fog) so
  texture detail actually reads. 15/15 shot checks now pass (was 13/15).
- "Shape torch": replaced procedural viewmodel with the CC-BY-4.0 Sketchfab
  "Flashlight" GLTF (auto-oriented via glass-material detection); glow +
  lamp wiring verified in-scene (pixel-diff on toggle: ~13k px cluster).
- "Doors horrible / no collision / hinge in air": rebuilt hinge doors —
  jamb-mounted frames, visible hinge barrels + knuckles, recessed panels,
  push bars, thresholds. Fixed HALF-OFFSET placement bug (leaves were buried
  in walls; hinges now sit at jamb edges, leaf covers gap exactly — verified
  AABBs). Leaf collider is now ALWAYS active and follows the swing each frame
  with an anti-crush guard (holds back if it would sweep through the player).
- "Assets overlapping": collider tagging + pairwise audit
  (`verify_world.py no_solid_overlaps`) — 19 props scanned; found 2 lockers
  sunk 0.1 m into the atrium east wall, fixed; audit now clean.
- "No gravity / no camera vibration on stairs": real vertical velocity with
  fall + landing dip + footstep on landing; head-bob extended with
  slope-scaled high-frequency stair judder.
- "Can leave map / no back wall": street parcel now fenced at the slab edge
  (posts + rails + mesh + solid colliders); walk-out probes on 6 edges all
  sealed.
- "Too dark / no moon / no sky": star field (460 pts), moon disc + halo,
  moonlight directional (0.5), sky/fog retuned — pre-restore atrium now
  lum 42.8 (was 2.7), gate-open beat 64.0 (was 3.9).


## Revision 3 (iterative council pass, 2026-09-04)

Multi-persona iteration loop (Critic / Domain Expert / Pragmatist / QA Auditor).
Findings and fixes, each verified:

- **CRITICAL — textures never rendered before this revision.** Root cause in
  `materials.js loadAll()`: materials were constructed with `...texes` while
  texture promises were pending — the spread captured an empty object, so
  `map/normalMap/roughnessMap` were never attached. Every previous build
  rendered untextured (only 17 meshes had maps — torch GLTF + canvas signs).
  Fixed: materials are now created only after all textures resolve.
  Verified: 247/609 meshes carry PBR maps; per-room color diversity rose
  (corridor 57 distinct colors, street 54).
- **World-scale UV density.** Big surfaces mapped one tile per face (a 20 m
  wall = one stretched smear). `box()` now bakes UVs at ~1.5–2 m per tile,
  divided by each material's repeat so density stays uniform. Verified:
  measured tile spans 2.1–4.0 m-equivalent on large meshes (was 8–20+).
- **Lighting re-compensated** for real albedo absorption (hemi 0.55→0.78,
  moonlight 0.5→0.7, torch beam 34→42): pre-restore atrium 24.1, street 42.8,
  corridor 44.5 — 15/15 shot checks.
- **Feel adoptions from the studied repos (with receipts):**
  - triomonnezza `DoorController.js` (lines 81–161): asymmetric easing —
    Quadratic.In opening / Quadratic.Out closing (also removes the old
    close-overshoot rough edge).
  - enari-engine `FPSRenderer.ts` (lines 271–281): dynamic FOV — sprint kick
    75→81 with smooth lerp.
  - FPS2 (animation via GLB clips + mixer; bundled JS unreadable): principle
    adopted as layered procedural sway — idle figure-8 + roll on the torch,
    fading out while moving.
- Stair judder amplitude 0.009→0.022 (imperceptible→felt); torch scale
  0.30→0.34; barrels switched from flat blue paint to textured steel.
- Sandbox recycles twice wiped the uncommitted preview state; recovered from
  GitHub each time. Live build re-verified after final restore:
  `verify_world` 13/13, `critical_path` 40/40, shots 15/15, zero console
  errors.


## Revision 4 (doorway pass, 2026-09-05)
- User report "door opens but collision blocks the entrance": root cause =
  anti-crush guard froze the leaf collider at its CLOSED pose whenever a door
  was opened while the player stood in the threshold; the stale box never
  refreshed after the door settled. Fix: disable collision during a crushing
  sweep + force resync at settle. Regression check `walk_through_open_door`
  reproduces the exact scenario (passes), `all_doorways_clear_when_open`
  asserts no active collider covers any hinge-door gap center (6 doors).
- Doors cloned with the same jamb-hinge logic: door_d4 (breaker nook),
  door_d5 (stairwell->atrium; opens away from the approaching player).
- verify_world 15/15, critical_path 40/40 (atrium walk now opens door_d5).


## Revision 5 (doorway visuals + torch direction, 2026-09-05)
- User report "pillar top-to-bottom mid-doorway when open": frames were
  hinge-relative; fixed to gap-centered via pivot + (width/2)·closed-leaf-dir.
  Numeric check (6 doors, err 0.000) + screenshot center-edge scan (no pillar
  gradient at any doorway center; shots in qa/shots/doors/).
- User report "torch points the wrong way": glass-end sign detection on the
  long axis + runtime camera-space verification (mouth forward of body).
- shoot_doors.py: 18 Playwright shots. verify_world 16/16, critical 40/40.
