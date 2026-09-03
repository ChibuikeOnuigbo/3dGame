# CHANGELOG

## 2026-09-03 — Research scaffolding + QA toolchain recovery + visual review rebuild
- **Recovered from sandbox reset**: re-clone wiped local-only artifacts; committed
  + pushed all work to `arena/01a064a7-3dgame` so resets can't lose it again.
- **Credential hygiene**: stopped tracking `.sketchfab_token` (moved to `.gitignore`).
  Note: the token existed in the repo's first public commit — rotate it if live.
- **QA toolchain rebuilt reproducibly**: `qa/setup_qa_env.sh` + `qa/threaded_server.py`;
  Sparticuz Chromium 149 + SwiftShader extracted to /tmp (venv + libs documented).
- **Playwright re-verified**: 13/13 checks (prop library 146/74, objective chain
  escapes, floor gaps, 0 console errors, 8/8 lit room frames).
- **Research directory created**: `research/` with video manifest + per-video design
  principles, VISUAL_TARGET, CURRENT_REPOSITORY_AUDIT, GITHUB_GAME_ARCHITECTURE,
  REUSE_DECISIONS, research_report.
- **Video pipeline tools**: `tools/video_research/*.py` (metadata/transcript/frames/
  analysis) for local use (sandbox has no YouTube egress).
- **Visual review**: regenerating `visual_review/<scene>/` + approved/declined
  view subfolders via `qa/shot_rooms.py` + `qa/build_review_folders.py`.

## 2026-09-03 (prior session) — Collision/overlap repair + visual review
- Fixed prop<->prop overlaps and wall penetrations using real world-space AABBs
  (browser ground-truth scan): 0 overlaps, 10 sub-12cm flush/mounted flags remain.
- Repositioned boiler/generator/reception/offices/locker/bunks/storage props.
- Doors 29/29 open/pass; collision verified; objective chain completes.
- Brightened exterior/tunnel lighting; sea-gate general view faces the gate.
- Deleted 19 flat single-colour Kenney GLBs (kept as git reference).
