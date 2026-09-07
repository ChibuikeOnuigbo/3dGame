# Repository report — fps-asset-kit (asset source, highest direct value)

- **Local clone:** `research/github/repos/fps-asset-kit` (ChibuikeOnuigbo workspace repo)
- **Contents:** ~1.1 GB curated CC0/public-domain FPS assets: 24 ambientCG 2K PBR texture sets (asphalt/brick/concrete/ground/metal/plaster/rock/wood), 20 OpenGameArt "Flat Guns" GLB/FBX/OBJ weapons, Free Firearm Sound Library gunshots, **Fantozzi's Footsteps (12 OGG+FLAC, grass/sand/stone)**, HDRIs (downloaded via `download_hdris.py`/`download_textures.py` scripts, sourced from ambientCG/OGA).
- **License:** NO LICENSE FILE on the kit repo itself, but README documents every asset as CC0 (ambientCG, OpenGameArt Flat Guns, Fantozzi's Footsteps, Free Firearm Sound Library) — all no-attribution-required. Treat kit code/scripts as unlicensed; use only the clearly-CC0 assets.

## What we took (executed)
- `sfx/footsteps/Fantozzi-footsteps/ogg/*.ogg` (12 files, 148 KB) → copied to `game/public/sfx/footsteps/`, replacing the FLAC set; wired in `src/audio/audio.js` (`_loadSteps()`), stone set → concrete/metal surfaces, sand set → exterior ground, with synthesized fallback if fetch fails. Logged in `research/assets/metadata/other/fps-asset-kit-footsteps.json`.

## What remains usable (not yet taken)
- Extra ambientCG PBR sets beyond the 12 already in `game/public/textures/` (e.g. Asphalt023S/025C, Bricks097/102/104, Concrete047A variants, Metal049A extras) — adopt only where a specific surface is needed; each set is several MB.
- Gunshot SFX — irrelevant (no firearms in Still Water).

## Techniques NOT to copy
- Bulk-mirroring gigabytes into the game repo — keep selective adoption; gitignore/LFS discipline.

## Applicability to Still Water
Primary licensed asset well. Footsteps integrated this session. Priority: high (done for audio; textures on demand).
