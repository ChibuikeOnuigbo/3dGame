#!/usr/bin/env python3
"""Smoke test: boot game, check console errors, start, screenshot key rooms."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pw_common import launch, stderr

OUT = "/home/user/3dGame/qa/shots"
os.makedirs(OUT, exist_ok=True)

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/index.html"

errors = []
pw, browser = launch()
try:
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=30000)
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{OUT}/00_menu.png")
    stderr("menu shot ok")

    page.evaluate("() => window.swQA.start()")
    page.wait_for_function("() => window.swQA.ready().started", timeout=15000)
    page.wait_for_timeout(800)

    poses = [
        ("street", (0, 3.2, -16.0, 3.1416, 0)),  # face kiosk (player-start framing, lamp in view)
        ("kiosk", (0, 3.2, -13.0, 3.1416, 0)),
        ("atrium", (0, 0, -4.8, 3.1416, -0.05)),
        ("corridor", (0, 0, 8.0, 3.1416, 0)),
        ("pumphall", (-3.0, 0, 20.5, 1.9, -0.08)),
        ("gallery", (10.5, 0, 17.7, -1.57, -0.1)),
        ("sump", (19.5, -3.4, 16.5, 2.6, -0.1)),
    ]
    for name, (x, y, z, yaw, pitch) in poses:
        page.evaluate("(p) => window.swQA.pose(p[0], p[1], p[2], p[3], p[4])", (x, y, z, yaw, pitch))
        page.evaluate("() => window.swQA.noclip(false)")
        page.wait_for_timeout(350)
        page.screenshot(path=f"{OUT}/01_{name}.png")
        room = page.evaluate("() => window.swQA.roomAt()")
        stats = page.evaluate("() => window.swQA.stats()")
        stderr(f"{name}: room={room} tris={stats['triangles']} calls={stats['calls']}")

    state = page.evaluate("() => window.swQA.state()")
    stderr("state: " + json.dumps(state["flags"]))
    stderr("objective: " + str(state["objective"]))
finally:
    browser.close()
    pw.stop()

print("ERRORS:" if errors else "NO CONSOLE ERRORS")
for e in errors[:20]:
    print(" ", e[:300])
