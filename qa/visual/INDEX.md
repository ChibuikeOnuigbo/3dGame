# Visual QA Index — Still Water (Stormwater Station 6)

Machine-driven visual QA per the VISUAL QA CORRECTION directive.
**Layer C semantic review is BLOCKED in this runtime (no vision model):
every `*.png` below is surfaced for HUMAN INSPECTION.** Machine audits
(floating / sunk / lone / repeats / exposure) are honest programmatic
checks only — they do not certify visual quality.

- Harness: `tools/qa/visual_qa.py` (REBUILT 2026-09-06 after a sandbox
  recycle destroyed the original; view poses re-derived from room bounds).
- Captures are read back directly from the WebGL canvas (same JS task as a
  forced render) — Playwright compositor capture serves stale frames under
  SwiftShader and page.screenshot pauses the game (QA-found, see
  research/AGENT_KNOWLEDGE.md).
- Final bundle: index-Dn5GFWM5.js (served hash verified == dist hash);
  mechanical suites on the same build: verify_world 16/16,
  critical_path 40/40 (real 3-leg switchback climb).

## Room status (final generation)

| Room | Views | floating | sunk | lone | repeats | exposure flags | mean-luma range |
|---|---|---|---|---|---|---|---|
| street | 6 | 0 | 0 | 4 | 0 | 0 | — (dark_ok: outward night views) |
| kiosk | 6 | 0 | 0 | 4 | 0 | 0 | focal 42 / interaction 36 |
| corridor | 6 | 0 | 0 | 4 | 0 | 0 | pre-power dark by design (dark_ok) |
| atrium | 6 | 0 | 0 | 4 | 0 | 0 | focal/interaction lit |
| pumphall | 6 | 0 | 0 | 4 | 0 | 0 | entry dark_ok (from dark corridor) |
| gallery | 6 | 0 | 0 | 4 | 0 | 0 | exit dark_ok (ramp descent) |
| sump | 7 | 0 | 0 | 4 | 0 | 0 | 32–64 (vertical 50.5) |
| shaft | 6 | 0 | 0 | 4 | 0 | 0 | **entry 83 / focal 162 / path 82 / interaction 125 / exit 9 / secondary 21** |

All current-generation view PNGs have distinct md5s within each room.
`lone` = the deliberate step-edge markers / signage reads, accepted.
Exposure audit thresholds: TOO_DARK mean<8 (unless dark_ok), FLAT var<45.

## What changed this session (defect -> fix -> recapture)

This whole set is a faithful REDO: the original visual-QA session (post
Rev 5) was lost to a sandbox recycle before its push (token had expired).
Everything below was re-derived, re-verified and pushed.

1. **Ghost climb** — `groundAt` last-registered-wins lifted the player at
   the shaft. Fix: y-aware `world.groundNear()` used by player physics +
   `swQA.pose`. Proof: pose logs land exactly; duplicate/dark views gone.
2. **F1 unboardable** — the sump pit-floor region under the chimney won
   `groundNear`'s closest-match at the ramp foot; real walking pinned the
   player flat at y-3.4 into the head wall. Fix: pit floor carved into 5
   regions around the lanes. Proof: F1 now walks -3.4 -> -1.44 (trace).
3. **Shaft unreadable** — the 3 flights read as a black void. Fixes:
   3 east-wall lamps + mid-chimney fill + gate-approach lamp on the
   `emergency` circuit (the default "always" circuit is DEAD at init —
   QA-found), step-edge markers every 0.55m, top lamp above the platform
   (a lamp under the top grate is occluded). Shaft views went 0.4-4
   mean-luma to 83-162.
4. **Prop penetrations** — pumphall toolbox inside the new workbench desk
   (old toolbox removed), sump crate stack sunk 0.13 into itself (now
   rests exactly on top), atrium duplicate chair overlapping the original
   reception chair (the redo never re-adds it).
5. **Capture-pipeline defects (harness)** — page.screenshot pauses the
   game (blur -> player.enabled false -> frozen camera) AND the compositor
   serves stale presents under SwiftShader. Fix: direct canvas toDataURL
   readback + re-enable/pose/pump per view. Duplicate md5s eliminated.

## Human inspection priority (Layer C — BLOCKED, needs your eyes)

1. `shaft/` current set — ramps + markers + lamps readable? exit view
   (look back down the climb) composed sensibly?
2. `sump/secondary.png` + `sump/vertical.png` — crate stack beside shelf;
   lit chimney seen from below.
3. `atrium/focal.png` — desk group (desk/chair/logbook/toolbox).
4. `pumphall/secondary.png` — new workbench corner (desk/radio/toolbox).
5. `before_*` files in each room dir = prior generations for comparison.
