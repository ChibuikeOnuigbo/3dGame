# Sketchfab model scores (Playwright preview, 2026-09-03)

| Model | Path | Score | Keep? |
|---|---|---|---|
| ECEL industrial double door | models/door | **15** | No — 24-vert black slab |
| Spellkaze Metal Door | models/door2 | **82** | Yes (mesh); not preloaded at boot (texture stall) |
| DJMaesen flashlight | models/flashlight | **85** | Yes — Maglite, parented in grip |
| ronildo four-hand pack | models/hand | **68** | No — T-pose quartet + skeleton |
| DJMaesen Hand (8MB) | models/hand_b | **20** | No — off-camera / empty frame |
| Enalya Hand Low Poly | models/hand_c | **78** | Yes — single mesh, viewmodel |
| scribbletoad hand | models/hand_d | **n/a** | Not used |

Threshold 80/100: door2 and flashlight pass. Hand_c is 78 — kept as the only usable single hand (closer than 68 pack).

Boot overlay `#boot` waits for LoadingManager / 2.5s timeout. World build ~54ms. Menu ready ~2.5–3s after timeout. PLAY after ready ~2.3s in headless (GPU ReadPixels stall).
