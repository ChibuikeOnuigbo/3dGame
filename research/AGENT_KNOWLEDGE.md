# AGENT_KNOWLEDGE — visual + mechanical QA memory for this repo

Running memory required by the VISUAL QA CORRECTION directive. Append-only;
newest entries last. RECREATED 2026-09-06 after the sandbox recycle that
destroyed the original file (it existed only in the lost unpushed commit).

## Standing rules (from user)

- Never claim a room "looks good" without real visual inspection; mechanical
  QA ≠ visual QA. No vision runtime in sandbox → surface screenshots, mark
  Layer C semantic review BLOCKED, never claim full visual QA.
- Visual QA must drive world changes; recapture after every fix; keep
  before/after + critique records (`qa/visual/<room>/before*_*.png`).
- Overlapping solid geometry = serious defect; ~0.1+ m margins between
  separate solid assets. No Kenney assets. No fabricated observations.
  Doors need real colliders + closable. Player fully enclosed.

## CRITICAL: sandbox persistence model (2026-09-06, cost a full session)

- Turn boundaries AND in-turn pauses (ask_user) can revert the workspace
  (including `.git`) to an earlier snapshot. `/tmp` and files changed within
  a live turn persisted, but never rely on it.
- NEVER leave work uncommitted across a turn boundary. Commit AND push in
  the SAME bash call. ORDER MATTERS: `git fetch` → `git reset` (if needed)
  → `git add -A` → `git commit` → `git push`. Doing `reset --hard` AFTER
  edits but BEFORE `add` silently destroys them (happened once).
- After a recycle: `node_modules` + `game/dist` are gone (npm i + rebuild),
  `/tmp` browser is gone (see below), `pip3 install --break-system-packages
  playwright pillow` again.

## Browser recovery (Playwright CDN is TLS-blocked in this sandbox)

Only registry.npmjs.org / github.com / pypi.org are reachable. Recipe:
`mkdir /tmp/chr && cd /tmp/chr && npm i @sparticuz/chromium` then
`node -e "require('@sparticuz/chromium').default.executablePath()"` →
extracts /tmp/chromium; then inflate the shared libs:
`node -e "require('@sparticuz/chromium').inflate('/tmp/chr/node_modules/@sparticuz/chromium/bin/al2023.tar.br')"`
→ /tmp/al2023/lib. `tools/qa/pw_common.py` launches
executable_path=/tmp/chromium with LD_LIBRARY_PATH=/tmp/al2023/lib
(Chromium 149, SwiftShader WebGL works, ~1-3 fps at 960x600).

## Capture-pipeline defects (all QA-found, all fixed in visual_qa.py)

1. `page.screenshot()` blurs the page → game auto-pauses
   (`player.enabled = false`) → camera-follow stops → later poses
   re-capture the same frozen frame. Fix: before each pose,
   `menus.hide()` + `player.enabled = true`, and pump
   `player.update(0.016)` manually.
2. Even with a correct camera, Playwright's compositor capture serves
   STALE presents under SwiftShader (byte-identical PNGs from different
   poses). Fix: read the frame directly — in ONE evaluate: forced
   `renderer.render()`, `drawImage` the WebGL canvas to a 2D canvas,
   return `toDataURL()`, decode in Python. Same-task readback is valid
   without preserveDrawingBuffer.
3. Debug heuristic (still true): byte-identical capture md5s across
   different poses = stale pipeline OR ghost-climb; always log
   `game.player.pos` alongside captures (room_context.json does).

## Ground-model knowledge

- Ground = analytic regions (`world.ground(x0,x1,z0,z1,y,surface,slope)`).
  `groundAt()` is last-registered-wins (footstep surfaces only);
  `groundNear(x,z,refY)` is closest-surface-to-refY and what player
  physics + swQA.pose must use (ghost-climb fix — keep it that way).
- **A flat floor region must never overlap a ramp lane whose low end
  starts at that floor level** — closest-match traps the walker on the
  flat region (F1 was unboardable; pit floor now carved into 5 regions
  around the chimney lanes).
- Switchback apices under SwiftShader (player halts 0.1-0.25 m shy of
  each head wall): F1 -1.44, F2 +0.96, F3 +2.96. Test thresholds are
  apex-minus-margin: -1.50 / 0.90 / 2.90. Never poll `y > ramp_top`.
- `swQA.pose` grounds to the support surface unless >0.6 m above it.
- Games must be STARTED before KeyW probes (`swQA.start()`); at the menu
  the loop does not update the player.

## Lighting knowledge

- Lights created via `world.light(x,y,z,{circuit})`: init() powers ONLY
  circuits `pumps`, `nest`, `emergency` (+ turns `lighting`, `service`,
  `dawn` off). The DEFAULT circuit `"always"` is never powered at init —
  a light without `circuit:"emergency"` (or a puzzle circuit) renders at
  intensity 0 from game start. The chimney lamps are `emergency`
  (egress route; survives the master-off endgame).
- A lamp below a solid platform is occluded by it — the shaft-top lamp
  must sit ABOVE the top grating (y3.4 > y3.2).
- Point lights ramp intensity at dt*3.5 — settled long before captures.
- Camera at shaft-top eye height looks OVER the 3.6 m walls into the dark
  world beyond; compose top-platform shots looking back down the climb
  (pitch -0.25 = down; positive pitch looks UP).

## Prop placement knowledge

- Check new placements against ALL nearby colliders including
  PRE-EXISTING props (three regressions were overlaps with old content:
  barrels-cluster toolbox inside the new workbench desk, crate stack into
  itself 0.13 m, dressing chair into the original reception chair — the
  redo does not re-add that chair).
- `verify_world` `no_solid_overlaps` is the authority; identify pairs
  with an inline pair-probe over `world.colliders` (fields: `c.box.min.x`
  etc. are {x,y,z} objects, props have no `.id` — match box coords to
  `place(...)` calls). Thresholds: pen x>0.06 && y>0.08 && z>0.06.
- Stacked props: rest exactly on top (upper.y = lower.top ± 0.01) — the
  y-threshold flags 0.08+ sink; the floating audit exempts props
  supported by another prop's top (support-surface exemption).

## Final QA state (2026-09-06, bundle index-Dn5GFWM5.js, pushed)

- verify_world 16/16, critical_path 40/40 (real 3-leg switchback walk).
- All 8 rooms: floating=0 sunk=0 repeats=0 exposure_flags=0, distinct
  md5s. Shaft: entry 83.1 / focal 161.8 / path 82.4 / interaction 124.5 /
  exit 9.0 / secondary 21.2. sump vertical (chimney from below) 50.5.
- Exposure audit thresholds: TOO_DARK mean_luma < 8 (dark_ok views
  exempt), FLAT variance < 45 (60 mis-flagged structured frames).
- Layer C semantic review: BLOCKED — qa/visual/INDEX.md lists the
  human-inspection priorities.
