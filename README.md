# Still Water

A small, complete, playable first-person Three.js game. You are a night inspector
for the city stormwater utility. A storm has just passed, Station 6 has stopped
reporting, and the street door locks behind you. Restore the station, find what
the last keeper left in the sump, and climb out through the service shaft
before dawn.

- **Engine:** Three.js 0.169 (Vite 5 build, no other runtime deps)
- **Length:** ~10–15 minutes, 7 rooms, 7 objectives, one ending
- **Input:** mouse-look (pointer lock) + fully remappable keyboard (physical-key
  bindings — no WASD assumption; every prompt keycap reflects your bindings)
- **Assets:** 100% licensed — procedural geometry written in this repo,
  CC0 PBR textures (ambientCG), CC0 footstep audio (OpenGameArt). No Kenney
  assets anywhere. See `CREDITS.md`.

## Run

```bash
cd game
npm install
npm run dev        # http://localhost:5173
# or
npm run build && npm run preview
```

## Controls (defaults — remap in Menu → Controls)

| Action | Default |
| --- | --- |
| Move | W / S / A / D |
| Interact / hold | E |
| Sprint | Left Shift |
| Flashlight | F |
| Pause | Esc |

## Objective path (spoilers)

Find the logbook → restore station lights → investigate the pump hall →
drain the flooded valve gallery (valves A then B) → search the keeper's nest
in the sump → pull the master breaker → crank the winch, raise the service
gate, and climb the exit shaft.

## QA

Automated, real-browser playthrough (Playwright + SwiftShader):

```bash
cd tools/qa && ./setup_browser.sh   # one-time
python3 smoke.py                    # boot + console + per-room shots/stats
python3 critical_path.py            # full 7-objective playthrough: 40/40 checks
python3 analyze_shots.py            # programmatic visual analysis of qa/shots/
```

Latest results and per-check status: `qa/FINAL_QA_REPORT.md`.
Build narrative and category scores: `BUILD_REPORT.md`.
Research trail (video/GitHub/asset studies): `research/`.
