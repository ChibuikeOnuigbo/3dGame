# Repository report — merovinggen/CSS-3D-Dungeon (Tier 2)

- **URL:** https://github.com/merovinggen/CSS-3D-Dungeon · cloned at `research/github/repos/CSS-3D-Dungeon`
- **Stack:** no WebGL — a dungeon built entirely from DOM elements with CSS 3D transforms (`perspective`, `rotateX/rotateY`, `translate3d`: 20× rotateX / 22× rotateY occurrences in the shipped bundle), plain JS, webfonts + mp3/webp assets hashed in `assets/`.
- **License:** `LICENSE` present (check file for terms; repo ships built bundle only).

## Architecture (source tree)
- Only `index.html` (63 KB) + prebuilt hashed `assets/*` — source was not committed; the shipped JS bundle is the only inspectable artifact. This is itself the first finding: no reproducible build.
- One full level with interactive items and puzzles (README), camera = transformed container, walls/floors are absolutely-positioned divs.
- Author's own admission: "bugs and fps drops are also available".

## Key patterns to steal
1. **Texture-as-mood without a render engine:** layered CSS gradients/box-shadows on wall divs create a coherent grimy dungeon look at zero GPU-shader cost. Validates our approach of canvas-generated + PBR-light materials over post-processing.
2. **Audio cues on interaction** (bug/spell/close-scroll mp3s tied to puzzle states) — interaction sounds sell the space; we already do this with doors/drips.

## Techniques NOT to copy
- DOM-based 3D: no depth buffer, no culling, per-element repaint cost → fps drops. Correctly rejected for this project (three.js WebGL).
- Shipping only minified bundles: violates our QA requirement of inspectable source.

## Applicability to Still Water
Ideas only (atmosphere via texture layering, interaction SFX); no code transferable. Priority: none.
