# Repository report — Parking-Master/FPS2 (Tier 3)

- **URL:** https://github.com/Parking-Master/FPS2 · cloned at `research/github/repos/FPS2`
- **Stack:** legacy static-site FPS: multi-page HTML (index/chat/forge/login/signup/store/preferences), inline scripts + vendored loaders (`GLTFLoader.js`, `OBJLoader.js`, `OrbitControls.js`, `GamepadControls.min.js`), Parse backend via unpkg CDN, sweetalert/tippy/simple-keyboard/gamecontroller CDN deps, Google Analytics, `server.js` stub, `models/` + `sounds/` folders.
- **License:** `LICENSE` present in repo root.

## Architecture (source tree)
- No bundler; 13 script tags in `index.html`, most from unpkg/jsdelivr CDNs with `@latest` — non-reproducible and a supply-chain risk.
- `js/utils.js` is 0 bytes and `js/bot.js` is 46 lines — game logic lives inline in HTML pages; `chatengine.js`/`userman.js` implement chat/accounts, not gameplay.
- Gamepad support (`GamepadControls`) and a map forge editor (`forge.html`) are the ambitious parts.

## Key patterns to steal
1. **Gamepad control surface** — eventually relevant if Still Water grows controller support; their integration is via alvaromontoro/gamecontroller.js (mappable button events), a reasonable low-cost approach.
2. **In-browser level forge** concept (place/forge maps client-side) is a long-horizon idea only.

## Techniques NOT to copy
- `@latest` CDN pins — irreproducible builds; we vendor via npm lockfile.
- Backend/chat/store sprawl inside a game repo — scope pollution.
- Inline-everything HTML game code — we keep modules under `src/`.

## Applicability to Still Water
Historical reference for what NOT to do architecturally; only the gamepad idea is bankable. Priority: none.
