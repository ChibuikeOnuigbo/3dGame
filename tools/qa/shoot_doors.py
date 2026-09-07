#!/usr/bin/env python3
"""Shoot close-ups of every hinge door (closed + open), the note overlay,
the torch viewmodel (off/on), and gates — saved to qa/shots/doors/."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pw_common import launch, stderr

OUT = "/home/user/3dGame/qa/shots/doors"
os.makedirs(OUT, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/index.html"

# id -> (side +1 uses door normal, -1 opposite; extra pitch)
DOORS = {
    "door_street": -1,   # shoot from the street side
    "door_d1": 1,
    "door_d2": 1,
    "door_d3": 1,
    "door_d4": 1,
    "door_d5": 1,
}

pw, browser = launch()
try:
    page = browser.new_page(viewport={"width": 960, "height": 540})
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=60000)
    page.evaluate("() => window.swQA.start()")
    page.wait_for_function("() => window.swQA.ready().started", timeout=30000)
    page.wait_for_timeout(1500)

    for did, side in DOORS.items():
        info = page.evaluate("""(id) => {
            const { door } = window.game.world.doors.get(id);
            const yaw = door.baseYaw, s = door.openSign, w = door.width;
            const dx = Math.cos(yaw) * s, dz = -Math.sin(yaw) * s;
            const gapX = door.group.position.x + dx * w / 2;
            const gapZ = door.group.position.z + dz * w / 2;
            return { gapX, gapZ, y: door.group.position.y, yaw,
                     nx: Math.sin(yaw), nz: Math.cos(yaw), locked: door.locked };
        }""", did)
        n = (info["nx"] * side, info["nz"] * side)
        camYaw = info["yaw"] if side > 0 else info["yaw"] + 3.14159265
        px, pz = info["gapX"] + n[0] * 1.7, info["gapZ"] + n[1] * 1.7
        page.evaluate("(p) => window.swQA.pose(p[0], p[1], p[2], p[3], 0)", (px, info["y"], pz, camYaw))
        page.evaluate("() => window.swQA.noclip(false)")
        page.wait_for_timeout(450)
        page.screenshot(path=f"{OUT}/{did}_closed.png")
        # open it (unlock quietly if locked, purely for the visual)
        page.evaluate("(id) => { const d = window.game.world.doors.get(id).door; d.locked = false; }", did)
        page.evaluate("(p) => window.swQA.pose(p[0], p[1], p[2], p[3], 0)", (px, info["y"], pz, camYaw))
        page.evaluate("(id) => window.swQA.interact(id)", did)
        try:
            page.wait_for_function(
                "(id) => window.game.world.doors.get(id).door.state === 'open'",
                arg=did, timeout=30000)
            page.wait_for_timeout(500)
        except Exception:
            pass
        page.screenshot(path=f"{OUT}/{did}_open.png")
        stderr(f"shot {did} closed+open")

    # note overlay (logbook)
    page.evaluate("() => window.swQA.pose(-2.0, 0, -3.4, -2.2, -0.2)")
    page.wait_for_timeout(400)
    page.evaluate("() => window.swQA.interact('logbook')")
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/note_logbook.png")
    page.evaluate("() => window.game.hud.closeNote()")
    stderr("shot note_logbook")

    # torch viewmodel close-ups (looking slightly down, lamp off then on)
    page.evaluate("() => window.swQA.pose(0, 3.2, -16.0, 3.1416, 0.5)")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/torch_off.png")
    page.evaluate("() => window.game.player.toggleLamp()")
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/torch_on.png")
    page.evaluate("() => window.game.player.toggleLamp()")
    stderr("shot torch off/on")

    # gates: service gate open (post-drain fast path)
    page.evaluate("() => { window.game.state.setFlag('nest_read'); window.game.state.setFlag('master_off'); }")
    page.evaluate("() => window.swQA.interact('winch')")
    try:
        page.wait_for_function(
            "() => window.game.world.doors.get('gate_service').door.state === 'open'",
            timeout=60000)
        page.wait_for_timeout(400)
    except Exception:
        pass
    page.evaluate("() => window.swQA.pose(22.6, -3.4, 20.9, 1.5708, 0.1)")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/gate_service_open.png")
    stderr("shot gate_service_open")

    # extra coverage loop: one shot per room at eye height
    rooms = [
        ("street", 0, 3.2, -16.5, 3.1416, 0),
        ("atrium", 0, 0, -4.8, 3.1416, 0),
        ("corridor", 0, 0, 6.0, 3.1416, 0),
        ("pumphall", -3.0, 0, 20.5, 1.9, 0),
        ("gallery", 10.5, 0, 17.7, -1.57, 0),
        ("sump", 19.5, -3.4, 16.5, 2.6, 0),
    ]
    for name, x, y, z, yaw, pitch in rooms:
        page.evaluate("(p) => window.swQA.pose(p[0], p[1], p[2], p[3], p[4])", (x, y, z, yaw, pitch))
        page.evaluate("() => window.swQA.noclip(false)")
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/room_{name}.png")
        stderr(f"shot room_{name}")
finally:
    browser.close()
    pw.stop()
print("DONE — shots in", OUT)
