# DECISIONS
Format: decision • alternatives • evidence • reason • result

## D1 — Game concept: "STILL WATER" (stormwater lift station, first-person inspection, no monster)
- Alternatives: radio relay (B), hospital ward (C), flooded archive (D) — see research/story/CONCEPTS.md.
- Evidence: video corpus (INFRA top anchor, 5/11 facility-horror), CC0 asset inventory (industrial PBR only), animation feasibility (mechanical motions), scope math (6 rooms).
- Reason: highest minimum score across all 12 criteria; asset/animation fit is decisive.
- Result: ADOPTED.

## D2 — Art direction: grounded low-poly architecture + human-made CC0 PBR materials (ambientCG via fps-asset-kit)
- Alternatives: ship Triomonnezza interior GLBs (best fit visually); Sketchfab downloads; pure flat-color low-poly.
- Evidence: license matrix (Triomonnezza no license; Sketchfab network-blocked); ambientCG sets are full PBR (color/normal/roughness/AO) in CC0.
- Reason: only route that is simultaneously believable, coherent, and 100% license-clean; directive §47 permits advanced low-poly; textures provide the human-made material quality.
- Result: ADOPTED. Textures downsampled to ≤1K for web budgets (Enari devlog lesson).

## D3 — No monster / no combat
- Alternatives: stalker entity (Triomonnezza MonsterAI pattern), combat (Enari).
- Evidence: video report principle "restraint"; INFRA (gun-free, no monster) is the anchor; creature animation sources unavailable (no licensed rigged creature); playability risk.
- Reason: an unreliable creature adds the largest QA/animation cost for the least story gain at this scope; tension comes from water, darkness, sound, and the nest discovery.
- Result: ADOPTED (one scripted non-sequitur scare budget: lights dip + thud when the nest is disturbed).

## D4 — Player controller: custom capsule-vs-AABB, no physics engine
- Alternatives: ammo.js (Enari), cannon-es (Liminality), Rapier (devlog), PointerLockControls default.
- Evidence: we need walk/sprint/crouch-lite, stairs as ramps, doors as moving boxes; dynamic rigid bodies unnecessary; determinism wanted for QA.
- Reason: smaller bundle, no WASM fetch, fully testable; keeps collision honest (directive: simplified collision geometry).
- Result: ADOPTED. Pointer-lock + mouse-look code adapted from Enari InputManager structure (action-based input).

## D5 — QA browser: @sparticuz/chromium npm package + Playwright Python
- Alternatives: official `playwright install chromium` (CDN blocked: cdn.playwright.dev 000); system chromium (apt blocked); no browser QA.
- Evidence: npm registry reachable; package ships the browser binary in the tarball; WebGL verified working via SwiftShader (ANGLE Vulkan renderer string).
- Reason: enables REAL Playwright QA (screenshots, WebGL capture, input simulation) in-sandbox, per §130–133 without inventing anything.
- Result: ADOPTED (tools/qa/setup_browser.sh + tools/qa/pw_common.py).

## D6 — Audio: 100% procedural Web Audio
- Alternatives: OpenGameArt downloads (network-blocked), fps-asset-kit SFX (gunfire-centric; footsteps candidate but bulky set).
- Evidence: sandbox blocks OGA/itch; procedural covers room tones (hum, drips), footsteps by surface, door creaks, valve ratchets, breaker clacks, UI ticks; directive §78 explicitly allows procedural.
- Reason: zero license exposure, zero network, infinite variation via parameterization, context-driven by room.
- Result: ADOPTED (fps-asset-kit footsteps remain a documented fallback if network ever allows).

## D7 — Level: 6 rooms, hub-and-spoke around the Pump Hall
- Alternatives: 10+ rooms linear; open labyrinth.
- Evidence: Amnesia The Bunker/Phasmophobia hub patterns; INFRA process-chain rooms; Portal 2 one-idea-per-room.
- Reason: every room has purpose + focal point; traversal reuse (return through Pump Hall after draining reads as transformation).
- Result: ADOPTED; see research/story/3d_map.md.
