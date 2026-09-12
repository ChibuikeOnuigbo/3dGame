#!/usr/bin/env python3
"""Capture 360deg surroundings evidence shots around the playable parcel.

User QA 2026-09-07 asked for images of the surroundings to understand what
models/surfaces the scene is made of. This script renders a panorama ring at
the street spawn plus first-door approach views and the fixed-up trouble
spots (fence lines, tomb gate, east skyline). Feeds opencv_analyze.py.

Camera convention: forward = (-sin yaw, -cos yaw).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pw_common import launch, stderr

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "qa", "shots", "surroundings")
os.makedirs(OUT, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/index.html"

import math
N, E, S, W = 0.0, -math.pi / 2, math.pi, math.pi / 2

POSES = [
    # name, x, y, z, yaw, pitch
    ("00_spawn_kiosk_door", 0, 3.2, -16.5, S, 0),          # THE black-wall view
    ("01_pano_north_fence", 0, 3.2, -15.5, N, 0),
    ("02_pano_east", 0, 3.2, -15.5, E, 0),
    ("03_pano_south_kiosk", 0, 3.2, -15.5, S, 0),
    ("04_pano_west", 0, 3.2, -15.5, W, 0),
    ("05_first_door_close", 0, 3.2, -13.1, N, -0.05),      # door_street up close
    ("06_kiosk_inside_out", 0, 3.2, -12.2, N, 0),          # inside kiosk -> door
    ("07_atrium_door_d1", 0, 0, -2.4, S, -0.03),           # where the bars stood
    ("08_fence_north_close", 0, 3.2, -18.9, N, 0),
    ("09_fence_east_close", 8.9, 3.2, -15.5, E, 0),
    ("10_fence_west_close", -8.9, 3.2, -15.5, W, 0),
    ("11_sump_tomb_gate", 17.6, -3.4, 17.7, W, -0.05),     # bars now on the gate
    ("12_east_skyline", 9.2, 3.2, -15.5, E, 0.02),
    ("13_gallery_overview", 8.0, 0, 17.7, E, -0.08),
    ("14_pumphall_gantry", -2.5, 0, 17.8, E, 0.06),
]


def main():
    pw, browser = launch()
    errors = []
    try:
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=60000)
        page.evaluate("() => window.swQA.start(false)")
        page.wait_for_function("() => window.swQA.ready().started", timeout=30000)
        page.wait_for_timeout(900)
        only = sys.argv[2] if len(sys.argv) > 2 else ""
        for name, x, y, z, yaw, pitch in POSES:
            if only and only not in name:
                continue
            page.evaluate("(p) => window.swQA.pose(p[0], p[1], p[2], p[3], p[4])", (x, y, z, yaw, pitch))
            page.evaluate("() => window.swQA.noclip(false)")
            page.wait_for_timeout(420)
            path = os.path.join(OUT, f"{name}.png")
            page.screenshot(path=path)
            room = page.evaluate("() => window.swQA.roomAt()")
            stderr(f"{name}: room={room} bytes={os.path.getsize(path)}")
        stderr(f"console errors: {len(errors)}")
        if errors:
            stderr("errors: " + "; ".join(errors[:5]))
    finally:
        browser.close()
        pw.stop()


if __name__ == "__main__":
    main()
