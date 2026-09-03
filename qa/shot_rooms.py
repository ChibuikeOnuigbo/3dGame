#!/usr/bin/env python3
"""Capture a per-scene visual review folder for Hollow Current.

For every room in hcQA.rooms(): general view + 3 other views, each scored
pixel-level, plus a review.json verdict (approved/declined).
"""
import json
import os
import threading
import functools
import http.server
import socketserver
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
OUT = ROOT / "visual_review"
CHROMIUM = "/tmp/chromium"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

PORT = [0]

def serve():
    with socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=GAME)) as h:
        PORT[0] = h.server_address[1]
        h.serve_forever()

threading.Thread(target=serve, daemon=True).start()
while PORT[0] == 0:
    pass

env = dict(os.environ)
env.update({
    "LD_LIBRARY_PATH": "/tmp/al2023/lib:" + env.get("LD_LIBRARY_PATH", ""),
    "FONTCONFIG_PATH": "/tmp/fonts",
    "VK_ICD_FILENAMES": "/tmp/vk_swiftshader_icd.json",
})
args = [
    "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
    "--ignore-gpu-blocklist", "--in-process-gpu",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--disable-web-security",
    "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
    "--enable-features=SharedArrayBuffer", "--font-render-hinting=none",
    "--hide-scrollbars", "--mute-audio",
]

def stats(path):
    a = np.asarray(Image.open(path).convert("RGB"))
    lum = a.mean(axis=2)
    return {
        "mean": round(float(a.mean()), 1),
        "lum": round(float(lum.mean()), 1),
        "colors": int(len(np.unique(a.reshape(-1, 3), axis=0))),
        "black": round(float((lum < 20).mean()), 3),
    }

def lit(s):
    return s["lum"] > 20 and s["colors"] > 800 and s["black"] < 0.85

def setup(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=120_000)
    page.wait_for_function("() => window.__hcReady === true", timeout=90_000)
    page.wait_for_function("() => window.__hcProps !== undefined", timeout=120_000)
    page.evaluate("() => { window.hcQA.start(); window.hcQA.enemies(false); window.hcQA.collide(false); window.hcQA.gravity(false); }")
    page.wait_for_timeout(250)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=args, env=env, timeout=120_000)
    page = browser.new_page(viewport={"width": 640, "height": 360})
    url = f"http://127.0.0.1:{PORT[0]}/index.html"
    setup(page, url)

    rooms = page.evaluate("() => window.hcQA.rooms()")
    OUT.mkdir(exist_ok=True)

    ctx = {"browser": browser, "page": page}

    def relaunch():
        try:
            ctx["browser"].close()
        except Exception:
            pass
        ctx["browser"] = p.chromium.launch(executable_path=CHROMIUM, args=args, env=env, timeout=120_000)
        ctx["page"] = ctx["browser"].new_page(viewport={"width": 640, "height": 360})
        setup(ctx["page"], url)
        page = ctx["page"]

    summary = []
    for r in rooms:
        rid = r["id"]
        rdir = OUT / rid
        rdir.mkdir(exist_ok=True)
        views = [
            ("general",  r["yaw"], 1.6, -0.06),
            ("turn",     r["yaw"] + 3.14159, 1.6, -0.06),
            ("left",     r["yaw"] + 1.5708, 1.6, -0.06),
            ("right",    r["yaw"] - 1.5708, 1.6, -0.06),
        ]
        shots = []
        for idx, (label, yaw, ey, pitch) in enumerate(views):
            page = ctx["page"]
            path = rdir / ("general.png" if label == "general" else f"0{idx}_{label}.png")
            try:
                page.evaluate("([x,y,z,yaw,pitch]) => window.hcQA.pose(x,y,z,yaw,pitch)", [r["x"], ey, r["z"], yaw, pitch])
                page.wait_for_timeout(120)
                page.screenshot(path=str(path), timeout=90_000)
                s = stats(path)
                shots.append({"label": label, "file": path.name, "lit": lit(s), **s})
            except Exception as e:
                shots.append({"label": label, "file": path.name, "error": str(e)[:100]})
                try:
                    relaunch()
                except Exception:
                    pass
        nlit = sum(1 for s in shots if s.get("lit"))
        general_lit = bool(shots and shots[0].get("lit"))
        status = "approved" if general_lit else "declined"
        review = {"scene": rid, "status": status, "litViews": nlit, "views": shots,
                  "note": ("general view renders correctly" if general_lit
                           else "general view too dark/empty — lighting pass needed")}
        (rdir / "review.json").write_text(json.dumps(review, indent=2))
        summary.append({"scene": rid, "status": status, "litViews": nlit})
        print(f"{rid:12s} {status:9s} lit={nlit}/4", flush=True)

    (OUT / "_summary.json").write_text(json.dumps(summary, indent=2))
    try:
        ctx["browser"].close()
    except Exception:
        pass

print("\n=== SUMMARY ===")
for s in summary:
    print(f"  {s['scene']:12s} {s['status']}  ({s['litViews']}/4 lit)")
print(f"\nwrote {OUT}")
