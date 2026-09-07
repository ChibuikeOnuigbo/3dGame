# CREDITS

Still Water — a Three.js game built in this repository. Everything below is
either original work by the build agent or a properly licensed third-party
asset. **No Kenney assets are used anywhere in this project** (hard project
rule). Full license study: `research/github/GITHUB_LICENSE_MATRIX.md`,
`research/licenses/`.

## Code (original)

- `game/src/**` — all game code written for this project (MIT-style project
  license; see `LICENSE` if present in repo root).
- `tools/qa/**`, `tools/*.py` — original QA and asset tooling.

## Libraries

| Library | License | Use |
| --- | --- | --- |
| [Three.js](https://threejs.org) r169 | MIT | rendering, math, loaders |
| [Vite](https://vitejs.dev) 5 | MIT | dev server / bundler |
| Chromium + Playwright (QA only) | Apache-2.0 / BSD | automated browser tests |

## 3D model

- **"Flashlight"** by **Brandon Baldwin** (https://sketchfab.com/Fecalomancer —
  https://sketchfab.com/3d-models/flashlight-fc5a0e9799de4eda932f2714f63f8d0c),
  licensed **CC-BY-4.0**. Used as the player hand torch (viewmodel), shipped at
  `game/public/models/flashlight/` with its `license.txt`.
  This work is based on "Flashlight" by Brandon Baldwin licensed under
  CC-BY-4.0. (Sourced from the threejs-liminality repository clone, which
  redistributes the model with its Sketchfab license file intact.)

## Textures — ambientCG (all CC0 1.0)

Sourced from https://ambientCG.com, downsampled for the web via
`tools/process_textures.py`. Attribution not required under CC0 but recorded
here in good faith:

- Asphalt031, Bricks102, Concrete034, Concrete047A, Concrete048, Ground037
  (grass verge), Ground054 (soil), Metal049A, Metal063, Plaster002, Rock063,
  Wood094
- © ambientCG / Lennart Demes (CC0 — no rights reserved).

## Audio

- **Stone footsteps** — "Fantozzi's footsteps" by Fantozzi (OpenGameArt),
  CC0 1.0. Files: `game/public/sfx/footsteps/Fantozzi-Stone*.flac`
  (verified per-asset license at download time — see `research/audio/`).
- **Grass/dirt footsteps** — same pack, Sand set (CC0):
  `game/public/sfx/footsteps/Fantozzi-Sand*.flac`.
- **All other sound** (ambience, drips, thud, gate grind, end sting) is
  procedural WebAudio synthesis — original, no samples.

## 3D models

The world architecture is procedural geometry authored in
`game/src/world/kit.js` and `world.js` (no imported scene meshes). The one
imported model is the CC-BY-4.0 flashlight credited above — fetched from a
licensed GitHub clone after the Sketchfab API itself stayed network-blocked
(connection refused, re-verified this session). No Kenney assets, per the
project rule.

## Reference works studied (principles only — no content copied)

- Videos analyzed under fair reference: see `research/videos/index.json`
  (facility-inspection genre, Outlast intro anatomy, Amnesia: The Bunker hub
  design, Portal 2 wayfinding, iercan Three.js devlog).
- Open-source repos cloned for study: `research/github/repos/` (licenses
  documented in `research/github/GITHUB_LICENSE_MATRIX.md`). No code was
  copied from these repositories.
