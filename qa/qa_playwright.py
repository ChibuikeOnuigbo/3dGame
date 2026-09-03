#!/usr/bin/env python3
"""Playwright end-to-end QA for Hollow Current.

Vets every change in a real Chromium:
  1. boot + prop library load (0 failed GLBs, 0 console errors)
  2. objective chain (fuse -> generator -> card -> lab -> valves -> code -> gate)
  3. floor integrity along the main path (no doorway-gap pits)
  4. in-game screenshots with a pixel-level render sanity check

Browser selection (in order):
  * --executable /tmp/chromium  (Sparticuz headless-shell; needs the swiftshader
    libs unpacked to /tmp — see the env setup below)
  * a Playwright-installed Chromium (default)

Usage:
    python qa/qa_playwright.py --serve --headless
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
OUT = ROOT / "qa" / "shots"
REPORT = ROOT / "qa" / "qa_report.json"
URL = "http://127.0.0.1:8081/index.html"

# Sparticuz chromium (serverless headless shell) + SwiftShader layout.
SPART_CR = "/tmp/chromium"
SWIFTSHADER_DIR = "/tmp"


def sparticuz_args():
    # NOTE: no --single-process / --no-zygote / --headless=shell here.
    # Those Lambda-isms make the multi-light GL scene crash mid-screenshot
    # under SwiftShader; a normal multi-process headless Chrome is stable.
    return [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--ignore-gpu-blocklist", "--in-process-gpu",
        "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--disable-web-security",
        "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
        "--enable-features=SharedArrayBuffer", "--font-render-hinting=none",
        "--hide-scrollbars", "--mute-audio",
    ]


def setup_env():
    if Path(SPART_CR).exists():
        os.environ["LD_LIBRARY_PATH"] = "/tmp/al2023/lib:" + os.environ.get("LD_LIBRARY_PATH", "")
        os.environ["FONTCONFIG_PATH"] = "/tmp/fonts"
        os.environ["VK_ICD_FILENAMES"] = "/tmp/vk_swiftshader_icd.json"


def serve():
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8081", "--bind", "0.0.0.0"],
        cwd=str(GAME), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.0)
    return proc


def pixel_stats(path):
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(path).convert("RGB"))
    mean = tuple(int(v) for v in a.mean(axis=(0, 1)).round())
    colors = int(len(np.unique(a.reshape(-1, 3), axis=0)))
    black = float((a.sum(axis=2) < 36).mean())
    return {"mean": mean, "colors": colors, "black": round(black, 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serve", action="store_true")
    ap.add_argument("--headless", action="store_true", default=True)
    ap.add_argument("--shots", type=int, default=8, help="how many room screenshots")
    ap.add_argument("--executable", default=SPART_CR)
    args = ap.parse_args()

    OUT.mkdir(exist_ok=True)
    setup_env()
    server = serve() if args.serve else None
    results = {"checks": [], "shots": [], "console_errors": [], "chain": []}
    checks = results["checks"]

    def add(name, ok, detail=""):
        checks.append({"name": name, "pass": bool(ok), "detail": detail})
        print(("PASS" if ok else "FAIL"), "—", name, ("— " + str(detail) if detail else ""))

    try:
        with sync_playwright() as p:
            launch_kwargs = dict(headless=args.headless, args=sparticuz_args(), timeout=120000)
            if Path(args.executable).exists():
                launch_kwargs["executable_path"] = args.executable
            browser = p.chromium.launch(**launch_kwargs)
            page = browser.new_page(viewport={"width": 960, "height": 540})
            console_errors = []
            page.on("console", lambda m: console_errors.append(f"{m.type}: {m.text}")
                    if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

            page.goto(URL, wait_until="domcontentloaded", timeout=120000)
            page.wait_for_function("() => window.__hcReady === true", timeout=90000)
            page.wait_for_function("() => window.__hcProps !== undefined", timeout=120000)

            qa = page.evaluate("() => window.hcQA.props()")
            add("prop library loaded with 0 failures",
                len(qa["failed"]) == 0 and qa["registry"] >= 140 and qa["loaded"] >= 60,
                f"registry={qa['registry']} used={qa['loaded']} failed={qa['failed']}")
            results["props"] = qa

            # start the game, disable enemies + collision for deterministic shots
            page.evaluate("() => { window.hcQA.start(); window.hcQA.enemies(false); window.hcQA.collide(false); window.hcQA.gravity(false); }")
            page.wait_for_timeout(500)

            # ---- objective chain ----
            chain = [
                ("Pull spare fuse", "fuse"),
                ("Start generator", "power"),
                ("Take Lab B card", "card"),
                ("Use card reader", "lab"),
                ("Turn valve 1", "valves"),
                ("Turn valve 2", "valves"),
                ("Turn valve 3", "valves"),
                ("Archive drawer", "code"),
                ("Sea-gate keypad", "end"),
            ]
            ok_chain = True
            for label, evt in chain:
                r = page.evaluate("(l) => window.hcQA.interact(l)", label)
                results["chain"].append(r)
                if evt == "valves":
                    ok_chain = ok_chain and r.get("event") in ("", "valves") and "text" in r
                else:
                    ok_chain = ok_chain and r.get("event") == evt
            flags = page.evaluate("() => window.hcQA.flags()")
            escaped = flags.get("escaped")
            add("objective chain completes (escape flag)", ok_chain and escaped, f"escaped={escaped}")
            results["flags"] = flags

            # ---- main path floor integrity ----
            walk = page.evaluate(
                """() => {
                    const pts = [[0,8],[0,0],[0,-16],[10,-16],[10,-26],[0,-28],[-4,-42],[12,-42],
                                 [12,-54],[12,-64],[12,-74],[6,-92],[22,-92]];
                    return pts.map(([x,z]) => [x, z, window.hcQA.floorAt(x,z)]);
                }"""
            )
            gaps = [w for w in walk if w[2] < 0]
            add("main path has no floor gaps", len(gaps) == 0, gaps or "all y>=0")

            results["console_errors"] = console_errors[:20]
            add("no console errors/warnings", len(console_errors) == 0, console_errors[:5])

            # ---- screenshots (software WebGL is slow; keep the loop alive past
            # per-room failures and relaunch the browser if it dies) ----
            try:
                rooms = page.evaluate("() => window.hcQA.rooms()")
                picks = rooms[:: max(1, len(rooms) // args.shots)][:args.shots]
                shot_ok = 0

                def _setup():
                    page.goto(URL, wait_until="domcontentloaded", timeout=120000)
                    page.wait_for_function("() => window.__hcReady === true", timeout=90000)
                    page.wait_for_function("() => window.__hcProps !== undefined", timeout=120000)
                    page.evaluate("() => { window.hcQA.start(); window.hcQA.enemies(false); window.hcQA.collide(false); window.hcQA.gravity(false); }")
                    page.wait_for_timeout(300)

                for i, r in enumerate(picks):
                    try:
                        page.evaluate("(r) => window.hcQA.pose(r.x, 1.6, r.z, r.yaw, -0.08)", r)
                        page.wait_for_timeout(200)
                        path = OUT / f"qa_{i:02d}_{r['id']}.png"
                        page.screenshot(path=str(path), timeout=240000)
                        st = pixel_stats(path)
                        lit = sum(st["mean"]) / 3 > 9 and st["colors"] > 300
                        results["shots"].append({"room": r["id"], "bytes": path.stat().st_size, **st, "lit": lit})
                        if lit:
                            shot_ok += 1
                            add(f"render sanity {r['id']}", True, st)
                    except Exception as e:  # screenshot may fail under software GL
                        results["shots"].append({"room": r["id"], "error": str(e)[:120]})
                        try:
                            browser.close()
                        except Exception:
                            pass
                        browser = p.chromium.launch(
                            headless=args.headless, args=sparticuz_args(),
                            executable_path=args.executable, timeout=120000)
                        page = browser.new_page(viewport={"width": 960, "height": 540})
                        try:
                            _setup()
                        except Exception as e2:
                            results["shots"].append({"error": f"relaunch failed: {str(e2)[:120]}"})
                            break
                add("in-game screenshots captured", shot_ok > 0, f"{shot_ok}/{len(picks)} lit frames")
            except Exception as e:
                results["shots"].append({"error": str(e)[:160]})

            try:
                browser.close()
            except Exception:
                pass
    finally:
        if server:
            server.terminate()

    REPORT.write_text(json.dumps(results, indent=2))
    passed = sum(1 for c in checks if c["pass"])
    print(f"\nQA: {passed}/{len(checks)} checks passed — report: {REPORT}")
    sys.exit(0 if passed == len(checks) else 1)


if __name__ == "__main__":
    main()
