# IMPLEMENTATION PLAN — research → Still Water

Status legend: [x] done this session · [ ] queued · [~] evaluated & declined

## A. Player feel (from enari-engine study)
- [x] Grounded-gated jump + launch/land SFX + landing camera shake (Rev 5)
- [x] Jump recharge gate 120 ms (`src/player/player.js`) — anti-bunny-hop,
      mirrors enari `jumpRechargeTime`
- [~] dt clamp 20 ms — DECLINED: QA runs headless SwiftShader where frame
      times exceed 20 ms; clamping would slow simulation vs wall clock and
      endanger critical_path timeouts. Keep 50 ms clamp (main.js).
- [~] Quake-style `Accelerate()` friction model — declined: accel-lerp feels
      right for a walking sim; revisit only if movement complaints appear.

## B. Audio (user request: different walking noises / jump / run SFX)
- [x] Surface-routed footstep samples (CC0 Fantozzi OGG, 12 files, 148 KB)
      stone→concrete/metal, sand→exterior ground, water→synth; synthesized
      fallback if fetch fails (`src/audio/audio.js`)
- [x] Jump whoosh + landing thump (synthesized, impact-scaled)
- [x] Sprint exertion breaths every ~1.9 s while sprinting
- [ ] If egress restored: swap in OGA "Jump Landing" CC0 wavs (queued in
      `research/download-manifest.json`) — drop-in replacement

## C. Camera (user request: camera shakes)
- [x] Landing dip + impact-scaled shake (`_landDip`, `_shake`)
- [x] Head-bob tied to stride; sprint FOV kick
- [ ] Valve-turn shake micro-kick during hold interactions (polish pass)

## D. Doors (from triomonnezza study)
- [~] Material-weighted easing — already present: hinge doors Quadratic.In
      open / Quadratic.Out close, gates 6.7× slower grind (`src/world/doors.js`).
      No change needed; noted for the record.

## E. Assets (blocked on egress; manifests ready)
- [ ] Poly Haven Concrete Floor 02 1K maps → textures (CC0, no credit)
- [ ] Sketchfab Small Industrial scene (CC-BY-4.0, credit Brendan Wood) —
      prop donor, not world replacement
- [ ] itch PSX Industrial pack GLB (CC-BY-4.0, credit godgoldfear)
- Run `tools/research/acquire.py` once user restores network; it appends to
  download-manifest.json / download-errors.json automatically.

## F. Atmosphere (from threejs-liminality study)
- [ ] Lamp-circuit flicker polish: rare single-lamp brownouts on the "always"
      circuit (0.5-1% of frames, brief) — must NOT affect QA luma gates
      (measure before/after with opencv_analyze.py)

## G. Hygiene
- [x] Per-asset metadata JSONs (`research/assets/metadata/**`)
- [x] No large binaries committed (repo clones gitignored under research/github/repos)
- [ ] git push/PR when user reconnects GitHub (token currently dead)
