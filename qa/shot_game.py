#!/usr/bin/env python3
import os
from playwright.sync_api import sync_playwright

OUT = "/home/user/qa/shots"
os.makedirs(OUT, exist_ok=True)
URL = "http://127.0.0.1:8081/index.html"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => window.hcQA", timeout=20000)
    page.screenshot(path=f"{OUT}/00_menu.png", timeout=120000)
    page.evaluate(
        """() => {
          window.hcQA.start();
          window.hcQA.enemies(false);
          window.hcQA.noclip(true);
          window.hcQA.gravity(false);
          window.hcQA.collide(false);
          window.hcQA.force(2);
        }"""
    )
    rooms = page.evaluate("() => window.hcQA.rooms()")
    print("rooms", [r["id"] for r in rooms], flush=True)
    n = 2
    for r in rooms:
        page.evaluate("(r) => window.hcQA.pose(r.x, 1.55, r.z, r.yaw, -0.12)", r)
        page.wait_for_timeout(50)
        path = f"{OUT}/{n:02d}_{r['id']}.png"
        page.screenshot(path=path, timeout=120000)
        print("shot", r["id"], os.path.getsize(path), flush=True)
        n += 1
        if r["id"] in ("reception", "corridor", "storage", "generator"):
            page.evaluate("(r) => window.hcQA.pose(r.x, 1.35, r.z + 0.15, r.yaw, -0.72)", r)
            page.wait_for_timeout(40)
            path = f"{OUT}/{n:02d}_{r['id']}_floor.png"
            page.screenshot(path=path, timeout=120000)
            print("floor", r["id"], os.path.getsize(path), flush=True)
            n += 1
    print("state", page.evaluate("() => window.hcQA.state()"), flush=True)
    browser.close()
print("done")
