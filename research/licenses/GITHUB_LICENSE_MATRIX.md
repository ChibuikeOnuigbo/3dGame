# GITHUB LICENSE MATRIX
Investigated 2026-09-04. Code license ≠ bundled-asset license; each evaluated separately.

| Repo | Code license | Bundled 3D assets | Bundled audio/textures | Production use |
|---|---|---|---|---|
| enari-engine | MIT (c) iercan 2024 | fps_mine_sketch.glb (own, MIT repo), RobotExpressive (three.js example, CC-BY-ish via three.js repo), Kenney env maps (pool_day, collision-world) → **BANNED (project rule)**, Quaternius weapons (CC0 upstream), DJMaesen arms (CC-BY 4.0 per devlog credits) | none central | Code patterns ADAPT (no verbatim copy needed). Assets: none (Kenney ban / not needed). |
| CSS-3D-Dungeon | MIT (c) vadimTestPlatform 2022 | CSS/webp sprites | mp3s (provenance unclear) | STUDY ONLY |
| FPS2 | MIT (c) Parking Master 2022 | weapons/characters/maps — provenance mixed, MIT text may not cover third-party GLBs | sounds/ unclear | STUDY ONLY |
| fps-asset-kit | README declares assets **CC0/public-domain**; ambientCG (CC0), Flat Guns (OGA CC0) | Flat Guns GLBs (CC0) | firearm SFX (CC0 sets per README), footsteps (verify set), textures ambientCG CC0 | **YES — PBR textures (CC0), footstep SFX if license row confirms CC0** |
| threejs-fps-tps-starterkit-advanced | MIT | none | none | STUDY ONLY |
| threejs-liminality | MIT (c) Niclas Rogulski 2025 | Sketchfab models, attribution not per-asset → **unclear** | Pixabay/TextureCan/PH mixed | Code STUDY; binaries NO |
| final-project-triomonnezza | **NO LICENSE FILE** (default: all rights reserved) | interior kit + props (~70 GLBs) unattributed | wav sfx unattributed | **NO binary reuse** (patterns only) |
| LUMECraft first-person-shooter | NO LICENSE | FBX nature set (likely free pack, unclear) | unclear | STUDY ONLY |
| Kevinlaptop A_combat_game | NO LICENSE | minimal | unclear | STUDY ONLY |

## Rule applied (directive §161)
Unclear license ⇒ not in final release. Only clearly-CC0 external assets (fps-asset-kit/ambientCG textures + confirmed-CC0 SFX) and self-authored code/geometry/audio ship.

## Note on the supplied Sketchfab token
A `.sketchfab_token` file exists in the repo (was committed upstream; now untracked + gitignored). Sketchfab (site AND api.sketchfab.com) is unreachable from this sandbox (connection refused), so the authorized Download API could not be exercised: **SKETCHFAB_BLOCKED(network)**. The token was never printed or logged. Sketchfab/itch.io/OGA are therefore evidence-only sources this session.
