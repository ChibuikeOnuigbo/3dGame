# MASTER RESEARCH REPORT — Still Water (2026-09-07)

Scope: 9 reference repos (cloned & source-inspected), 1 design-reference video
(iErcan "Making Counter Strike in JavaScript", to032deYr-Q), Sketchfab/Poly
Haven/OpenGameArt/itch.io asset investigation, gateway-assisted acquisition
attempts. Nothing below is fabricated: every claim cites a local file under
`research/` or a recorded diagnostic.

## 1. Executive summary
- Our stack (three.js 0.169 + Vite, no framework, authored AABB colliders,
  capsule sweep physics, DOM HUD) matches the proven architecture of the best
  reference repos; the enari-engine study confirmed each core decision.
- Only binary acquisitions that succeeded: CC0 footstep OGGs (12 × ~12 KB)
  copied from the locally-cloned `fps-asset-kit` into the game and wired into
  `game/src/audio/audio.js` (this session).
- All remote binary downloads fail in this sandbox: egress TLS is killed per
  SNI (SSL_ERROR_SYSCALL after ClientHello) for every non-GitHub/non-npm
  host, including the arena gateway itself. Full diagnostics in
  `research/download-errors.json`. Metadata for all targets WAS captured
  server-side (fetch_page) into `research/assets/metadata/**`.
- Kenney assets (used in the reference video) remain BANNED project-wide;
  every asset we shipped or shortlisted is CC0/CC-BY-4.0 with credits noted.

## 2. Methodology & network matrix
| Route | Result |
|---|---|
| `api.github.com` anonymous | 200 (rate-limited 5000/h) |
| `git clone https://github.com/...` anonymous (`credential.helper=`) | OK — 9 repos cloned |
| `registry.npmjs.org` | OK |
| Direct HTTPS to youtube/sketchfab/polyhaven/opengameart/itch/workers.dev | TLS reset after ClientHello (logged per-host: DNS ok, TCP 443 ok, TLS FAIL) |
| Gateway `https://arena-asset-gateway.onuigbochibuike15.workers.dev/?url=...` | unreachable from sandbox (same TLS reset); used as documented fallback in `tools/research/acquire.py`, never as a proxy |
| `fetch_page` tool (server-side) | works for HTML pages & transcripts — used for all metadata |
| `yt-dlp` 2026.08.19 | fails on youtube TLS — logged, no retry loop |

## 3. Video study — to032deYr-Q (design reference)
Metadata + chapters + acquisition diagnostics:
`research/video/metadata/to032deYr-Q.json`; timestamped analysis:
`research/video/analysis/to032deYr-Q.md` (no frame grabs possible — bytes
unobtainable; analysis is chapter/transcript-based and says so).
Findings banked: player-owns-position camera-follow, capsule collider,
single-rAF loop ordering, dt clamp 20 ms, viewmodel sway/bob driven by
velocity, grounded-gated jump, dispose-on-unload, tiny web textures,
Source-movement accel curves, bounded particles.

## 4. Repo tier results (details in research/repositories/*.md)
- **Tier 1 — enari-engine (MIT):** direct ancestor of our patterns. Source
  patterns confirmed: `Accelerate/MoveGround/MoveAir` Quake-style movement,
  raycast-to-ground with manual Ammo handle disposal (the video's leak fix),
  jump recharge 100 ms + 0.11 y-nudge, recoil damping `c·x·e^(1-cx)`,
  viewmodel `frustumCulled=false`, `eyeOffsetY = h*2.5/3`.
- **Tier 2 — CSS-3D-Dungeon (MIT):** atmosphere via layered CSS textures;
  DOM-3D rejected for perf reasons; repo ships no buildable source (lesson).
- **Tier 3 — FPS2 (MIT):** legacy multi-page + `@latest` CDN deps =
  irreproducible; gamepad-controls idea banked.
- **fps-asset-kit (no repo LICENSE; assets documented CC0):** footstep OGGs
  shipped; extra ambientCG sets on demand.
- **A_combat_game (unlicensed):** zero-dep WebGL voxel FPS; validates our
  DOM-HUD + per-axis collision choices; code not reusable legally.
- **final-project-triomonnezza (unlicensed):** DoorController easing tuned
  to material weight (back-out overshoot < tween default); CollisionBuilder
  convention "decorative meshes never get colliders" = our ghost-scan rule.
- **threejs-fps-tps-starterkit-advanced (mirror, no LICENSE file):**
  official three.js Octree+Capsule collision; correct escalation path if we
  ever exceed ~1k colliders.
- **threejs-liminality (MIT):** best atmosphere reference — flicker/breaker
  gating, procedural cell-maze generation phases.
- **first-person-shooter (unlicensed):** LUME+Solid+Meteor declarative FPS;
  no applicable patterns.

## 5. Techniques ADOPTED (with evidence)
1. OGG footstep samples (CC0 Fantozzi) wired per-surface + synth fallback —
   `game/src/audio/audio.js`, metadata
   `research/assets/metadata/other/fps-asset-kit-footsteps.json`.
2. (Carried from Rev 1-5) camera-follows-capsule, single rAF loop, authored
   AABB colliders + mechanical decoration/collider audit (scan_ghosts.py).

## 6. Techniques REJECTED (with reasons)
Ammo/Rapier/cannon-es (overkill vs authored AABBs + QA probe), trimesh
colliders from imported GLB (opaque to QA), DOM/CSS 3D rendering (perf),
`@latest` CDN deps (irreproducibility), post-processing chains (SwiftShader
QA perf), Kenney assets (banned), single-file 3k-line architecture
(untestable), Meteor/LUME stack (scope).

## 7. Sketchfab investigation
Three CC-BY-4.0 models catalogued with tri/vertex counts and credit lines
(`research/assets/metadata/sketchfab/`): Simple Factory Scene (Pickeri,
269.6k tris), Small Industrial scene (Brendan Wood, 48.3k tris), maps
(photon — skibidi-themed, deprioritized). Tedathon "Industrial Environment"
collection page recorded as JS-gated. Download API returns 401 anonymous;
browser-automation download requires a Sketchfab account + working egress.

## 8. itch.io investigation
Two CC-BY-4.0 packs catalogued (`research/assets/metadata/itch/`): PSX
Industrial Environment Asset Pack (godgoldfear; FBX zip + single 1.6 MB GLB
free, unitypackage $2.99) and hospital-horror (Zertto; 13 low-poly PBR
models). Free download requires itch session flow — blocked by egress.

## 9. Poly Haven & OpenGameArt
Concrete Floor 02 (Rob Tuytel, CC0) 1K diff/normal/rough URLs queued;
Jump Landing (Dan Knoflicek, CC0) wav set queued. Both failed TLS with full
diagnostics; entries in `research/download-manifest.json` status=failed.

## 10. Download manifest & errors
`research/download-manifest.json` — 9 attempts (3 PolyHaven jpg, 3 OGA wav,
2 Sketchfab API, 1 itch purchase page); all `status: failed` with per-method
diagnostics. `research/download-errors.json` — DNS/TCP/TLS traces per host.
**No HTML saved as binary; no placeholders fabricated.**

## 11. Licensing posture
| Source | License | Credit required |
|---|---|---|
| Fantozzi footsteps (OGA) | CC0 | optional (we credit anyway) |
| ambientCG textures | CC0 | no |
| Poly Haven (queued) | CC0 | no |
| Sketchfab shortlist | CC-BY-4.0 | yes — credit lines stored in metadata JSONs |
| itch shortlist | CC-BY-4.0 | yes |
| Kenney (seen in video) | CC0 but **BANNED by project policy** | n/a |

## 12. Storage structure compliance
`research/repositories/`, `research/video/{metadata,raw,analysis,frames}`,
`research/assets/{metadata/{sketchfab,itch,other},models,textures,materials,audio}`,
`research/reports/`, `research/github/repos/` all populated as directed;
`raw/` and `frames/` empty by necessity (bytes unobtainable) with the reason
documented in the video metadata JSON. Large binaries (repo clones, 3.5 GB)
kept under `research/github/repos/` which is gitignored — not committed.

## 13. What changed in the GAME this round
- FLAC footstep set swapped for smaller OGG set (432 KB → 148 KB) with the
  same per-surface routing and synth fallback.

## 14. Risks & constraints
- Push/PR blocked (dead GH token) — local commits only until user reconnects.
- Sandbox egress: until restored, binary asset acquisition is limited to
  GitHub-hosted or npm-hosted content.
- Video raw bytes/frames remain unobtainable; video analysis is explicitly
  transcript/chapter-derived.

## 15. Verification evidence
QA unchanged and green after the audio swap: `tools/qa/verify_world.py`
16/16, `critical_path.py` 40/40, `scan_ghosts.py` 0 open cells / 0 invisible
walls (rerun this session, see `qa/ghost_scan.json`); audio loader keeps
synth fallback if OGG fetch fails, so no QA-visible regression path.

## 16. Next best moves (see IMPLEMENTATION_PLAN.md)
1. Door easing overshoot tuned per material weight (triomonnezza finding).
2. 20 ms dt clamp + 100 ms jump recharge (enari findings).
3. If egress restored: execute queued Poly Haven/OGA/Sketchfab/itch downloads
   via `tools/research/acquire.py` (manifest/error logging already built).
4. Lamp-circuit flicker polish pass (liminality finding).
