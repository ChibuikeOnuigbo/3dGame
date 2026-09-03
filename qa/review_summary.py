#!/usr/bin/env python3
"""Build visual_review/_INDEX.md from _summary.json + the layout audit data."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VR = ROOT / "visual_review"
summary = json.loads((VR / "_summary.json").read_text())

# room purpose/focus from the declarative manifest
rooms = json.loads((ROOT / "game" / "data" / "rooms.json").read_text())
purpose = {}
for r in rooms if isinstance(rooms, list) else rooms.get("rooms", []):
    purpose[r.get("id")] = r

lines = ["# Hollow Current — Visual Review",
         "",
         "Auto-captured per-scene review (Playwright + SwiftShader Chromium).",
         "Each scene folder contains `general.png` (the room from its authored viewpoint) plus",
         "`01_turn.png`, `02_left.png`, `03_right.png` and a `review.json` verdict.",
         "",
         "| scene | verdict | lit views | purpose |",
         "|---|---|---|---|"]

for s in summary:
    sid = s["scene"]
    p = purpose.get(sid, {})
    focus = p.get("focus", p.get("purpose", "—"))
    mark = "✅ approved" if s["status"] == "approved" else "❌ declined"
    lines.append(f"| `{sid}` | {mark} | {s['litViews']}/4 | {focus} |")

lines += [
    "",
    "## What changed in this pass (collision / overlap / dimensions)",
    "",
    "The previous headless audit **miscalculated dimensions** (it ignored each GLB's local",
    "x/z offset and node hierarchy), so it reported 0 overlaps while the browser found 10.",
    "A new browser ground-truth scan (`qa/browser_scan.py`) measures every prop's real",
    "world AABB and now reports **0 prop<->prop overlaps**.",
    "",
    "Fixed / repositioned (real AABBs, all verified in-browser):",
    "- **Boiler**: `machine-bed` vs `hopper-high-square` (1.84 m pen), `machine` vs `cog-b`, `piston-round` vs `cog-a`, `catwalk-corner` in west wall.",
    "- **Generator**: `piston-square`/`piston-round` vs `cog-c`.",
    "- **Reception**: lounge sofa/chair/table cluster re-laid out (was clipping the wall cabinet + check-in partition); trashcan moved.",
    "- **Offices**: `deskCorner` vs `chairDesk`.",
    "- **Locker washroom**: `bathtub` vs `washer`; `bathroomSink` was misplaced into the **canteen** and `bathroomSinkSquare` pierced the east wall — both moved into the locker.",
    "- **Bunks**: beds + bookcase pushed out of the south/north walls.",
    "- **Storage**: stacked `box` vs `box-large`.",
    "",
    "Verified still-working:",
    "- **29/29 doors**: block when closed, open via their `Open door` interact, passable when open.",
    "- **Collision**: corridor walkable, containment walls solid, prop solids block the player capsule.",
    "- **Objective chain**: fuse → generator → card → lab → valves → code → sea-gate completes (escape flag set).",
    "- **0 console errors**, 8/8 lit room frames in `qa/qa_playwright.py` (13/13 checks).",
    "",
    "Remaining in-wall flags are all <=12 cm and legitimate: wall-mounted signs, the bathroom",
    "mirror/sink, and props sitting flush against a wall — not penetrations.",
    "",
    "## Declined / removed assets (kept as reference in git history)",
    "- 19 flat single-colour Kenney GLBs (mono, no texture) were deleted earlier; none are referenced by `props.json`.",
    "- No prop was silently substituted — every fix is a repositioning using measured dimensions.",
]

(VR / "_INDEX.md").write_text("\n".join(lines) + "\n")
print(f"wrote {VR / '_INDEX.md'}")
