#!/usr/bin/env python3
"""Playwright snapshot of the Hollow Current asset gallery + full game.

Launches the Sparticuz Chromium build (SwiftShader WebGL) via Playwright,
serves the game/ dir locally, and captures screenshots for visual QA.
"""
import os
import sys
import threading
import http.server
import socketserver
import functools

GAME_DIR = os.path.join(os.path.dirname(__file__), "..", "game")
SHOTS_DIR = os.path.join(os.path.dirname(__file__), "shots")
CHROMIUM = "/tmp/chromium"

os.makedirs(SHOTS_DIR, exist_ok=True)

# --- static server ---------------------------------------------------------
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

def serve():
    os.chdir(GAME_DIR)
    handler = functools.partial(QuietHandler, directory=GAME_DIR)
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
        global PORT
        PORT = httpd.server_address[1]
        print(f"[server] http://127.0.0.1:{PORT}", flush=True)
        httpd.serve_forever()

PORT = 0
t = threading.Thread(target=serve, daemon=True)
t.start()
while PORT == 0:
    pass

# --- playwright ------------------------------------------------------------
from playwright.sync_api import sync_playwright

env = dict(os.environ)
env.update({
    "LD_LIBRARY_PATH": "/tmp/al2023/lib:" + env.get("LD_LIBRARY_PATH", ""),
    "FONTCONFIG_PATH": "/tmp/fonts",
    "HOME": env.get("HOME", "/tmp"),
    "VK_ICD_FILENAMES": "/tmp/vk_swiftshader_icd.json",
})

args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--ignore-gpu-blocklist",
    "--in-process-gpu",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
    "--enable-features=SharedArrayBuffer",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-zygote",
    "--single-process",
    "--no-first-run",
    "--disable-background-networking",
]

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=CHROMIUM,
        args=args,
        env=env,
        timeout=120_000,
    )
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    page.goto(f"http://127.0.0.1:{PORT}/asset_gallery.html", timeout=120_000)
    page.wait_for_function("window.__hcDone === true", timeout=120_000)

    placed = page.evaluate("window.__hcPlaced")
    failed = page.evaluate("window.__hcFailed")
    total = page.evaluate("Object.keys(window.__hcGrid).length")
    print(f"[gallery] placed={placed} total={total} failed={len(failed)}", flush=True)
    for f in failed:
        print(f"[gallery] FAIL {f}", flush=True)

    page.screenshot(path=os.path.join(SHOTS_DIR, "gallery.png"), timeout=180_000)
    print(f"[gallery] saved gallery.png", flush=True)

    browser.close()

print("[snapshot] done", flush=True)
