#!/usr/bin/env python3
"""Debug probe: trace player state during held movement in 3 problem spots."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pw_common import launch

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/index.html"
pw, browser = launch()
page = browser.new_page(viewport={"width": 480, "height": 270})
page.goto(URL, wait_until="domcontentloaded", timeout=60000)
page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=30000)
page.evaluate("() => window.swQA.start()")
page.wait_for_function("() => window.swQA.ready().started", timeout=15000)
page.evaluate("() => { window.game.settings.set('quality','low'); window.game.applySettings(); }")

def trace(label, n=14):
    print(f"--- {label} ---")
    for i in range(n):
        s = page.evaluate("""() => {
            const p = window.game.player.pos;
            const g = window.swQA.groundAt(p.x, p.z);
            const t = window.game.interact.target;
            return {x:+p.x.toFixed(2), y:+p.y.toFixed(2), z:+p.z.toFixed(2),
                    gy:+g.y.toFixed(2), room:window.swQA.roomAt(),
                    tgt: t ? t.id : null, en: window.game.player.enabled};
        }""")
        print(s, flush=True)
        page.wait_for_timeout(700)

# 1) street walk south
page.evaluate("() => window.swQA.pose(0, 3.2, -15.6, 3.1416, 0)")
page.evaluate("() => window.swQA.interact('door_street')")
page.wait_for_function("() => window.swQA.doors().find(d=>d.id==='door_street').state === 'open'", timeout=60000)
page.keyboard.down("KeyW")
trace("street->south", 16)
page.keyboard.up("KeyW")

# 2) note_last targeting
page.evaluate("() => window.swQA.pose(17.4, -3.4, 20.9, -1.5708, -0.6)")
page.wait_for_timeout(1500)
s = page.evaluate("""() => {
    const eye = window.game.player.eyePosition();
    const fwd = window.game.player.forward();
    const item = window.game.interact.items.get('note_last');
    const to = item.position.clone().sub(eye);
    const dist = to.length(); const dot = to.normalize().dot(fwd);
    let blocked = false;
    try { blocked = window.game.interact._blocked(eye, item.position); } catch(e) { blocked = 'err '+e.message; }
    const blockers = window.game.interact.blockers.map(o=>o.uuid);
    const hit = window.game.interact.raycaster.intersectObjects(window.game.interact.blockers, false);
    return {eye: eye.toArray().map(v=>+v.toFixed(2)), dist:+dist.toFixed(2), dot:+dot.toFixed(2),
            blocked, hits: hit.slice(0,3).map(h=>h.object.uuid+'@'+h.distance.toFixed(2)),
            near: blockers.length};
}""")
print("note_last targeting:", s, flush=True)

# 3) shaft climb
page.evaluate("() => window.swQA.pose(25.0, -3.4, 20.3, -1.5708, 0)")
page.evaluate("() => window.swQA.setFlag('master_off')")
page.evaluate("() => window.swQA.setFlag('nest_read')")
page.evaluate("() => window.swQA.setFlag('gate_open')")
page.evaluate("() => { const d = window.game.world.doors.get('gate_service').door; d.locked=false; d.open(); }")
page.wait_for_function("() => window.swQA.doors().find(d=>d.id==='gate_service').state === 'open'", timeout=120000)
page.keyboard.down("KeyW")
trace("shaft climb", 20)
page.keyboard.up("KeyW")

browser.close()
pw.stop()
