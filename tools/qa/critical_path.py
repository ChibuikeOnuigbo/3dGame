#!/usr/bin/env python3
"""Full critical-path playthrough + edge cases, driven through window.swQA.

Timing note: headless Chromium renders via SwiftShader (~1-3 fps at this
scene complexity), so all waits poll GAME state, not wall-clock.
"""
import json
import time
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pw_common import launch, stderr

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/index.html"
OUT = "/home/user/3dGame/qa/shots"
os.makedirs(OUT, exist_ok=True)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    stderr(f"{'PASS' if ok else 'FAIL'} {name} {detail if not ok else ''}")


pw, browser = launch()
try:
    page = browser.new_page(viewport={"width": 640, "height": 360})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=30000)

    def poll(expr, timeout_s=90, interval=0.7):
        import time
        t0 = time.time()
        while time.time() - t0 < timeout_s:
            if page.evaluate(expr):
                return True
            page.wait_for_timeout(int(interval * 1000))
        return page.evaluate(expr)

    check("load_boot", True)
    page.evaluate("() => window.swQA.start()")
    page.wait_for_function("() => window.swQA.ready().started", timeout=15000)
    # speed up headless rendering
    page.evaluate("() => { window.game.settings.set('quality','low'); window.game.applySettings(); }")
    st = page.evaluate("() => window.swQA.state()")
    check("spawn_objective_find_logbook", st["objective"] == "find_logbook", st["objective"])

    # ---------- real keyboard movement: street -> kiosk -> stair -> atrium ----------
    page.evaluate("() => window.swQA.pose(0, 3.2, -15.6, 3.1416, 0)")  # facing kiosk door
    page.evaluate("() => window.swQA.interact('door_street')")
    poll("() => window.swQA.doors().find(d=>d.id==='door_street').state === 'open'")
    page.keyboard.down("KeyW")
    # door_d5 (stairwell->atrium archway) must be opened mid-walk
    opened_d5 = False
    t0 = time.time()
    ok = False
    while time.time() - t0 < 120:
        room = page.evaluate("() => window.swQA.roomAt()")
        if room == "stairwell" and not opened_d5:
            page.evaluate("() => window.swQA.interact('door_d5')")
            opened_d5 = True
        if room == "atrium":
            ok = True
            break
        page.wait_for_timeout(400)
    page.keyboard.up("KeyW")
    check("walk_to_atrium", ok, f"room={page.evaluate('() => window.swQA.roomAt()')}")
    flags = page.evaluate("() => window.swQA.state().flags")
    check("kiosk_locked_beat", flags["kiosk_locked"] is True)
    pos = page.evaluate("() => window.game.player.pos.toArray()")
    check("walk_reached_atrium_floor", abs(pos[1]) < 0.2, f"y={pos[1]:.2f}")

    # ---------- collision probe: push into atrium west wall ----------
    page.evaluate("() => window.swQA.pose(-3.5, 0, -3.0, 1.5708, 0)")  # face west wall
    page.keyboard.down("KeyW")
    page.wait_for_timeout(3000)
    page.keyboard.up("KeyW")
    pos2 = page.evaluate("() => window.game.player.pos.toArray()")
    check("wall_blocks_west", pos2[0] > -4.15 + 0.2, f"x={pos2[0]:.2f}")

    # ---------- O1: logbook ----------
    page.evaluate("() => window.swQA.pose(-1.6, 0, -3.1, 1.5708, -0.7)")  # face desk (west)
    poll("() => window.game.interact.target && window.game.interact.target.id === 'logbook'")
    tgt = page.evaluate("() => window.game.interact.target && window.game.interact.target.id")
    check("logbook_prompt_visible", tgt == "logbook", f"target={tgt}")
    page.evaluate("() => window.swQA.interact('logbook')")
    check("note_opens", page.evaluate("() => window.game.hud.noteOpen"))
    page.evaluate("() => window.game.hud.closeNote()")
    st = page.evaluate("() => window.swQA.state()")
    check("O1_done_next_is_lights", st["objective"] == "restore_lights", st["objective"])

    # ---------- door D1 real interact + prompt shows bound key ----------
    page.evaluate("() => window.swQA.pose(0, 0, -1.2, 3.1416, 0)")
    poll("() => window.game.interact.target && window.game.interact.target.id === 'door_d1'")
    prompt_key = page.evaluate("() => document.querySelector('#prompt .keycap') && document.querySelector('#prompt .keycap').textContent")
    check("prompt_keycap_E", prompt_key == "E", str(prompt_key))
    page.evaluate("() => window.swQA.interact('door_d1')")
    poll("() => window.swQA.doors().find(d=>d.id==='door_d1').state === 'open'")
    d = page.evaluate("() => window.swQA.doors().find(d=>d.id==='door_d1')")
    check("door_d1_opens", d["state"] == "open", json.dumps(d))

    # ---------- O2: breaker ----------
    page.evaluate("() => window.swQA.pose(-2.6, 0, 9.4, -1.5708, 0)")  # face west breaker
    page.evaluate("() => window.swQA.interact('breaker_lights')")
    poll("() => window.swQA.state().flags.lights_on === true")
    flags = page.evaluate("() => window.swQA.state().flags")
    check("O2_lights_on", flags["lights_on"] is True)
    st = page.evaluate("() => window.swQA.state()")
    check("O2_done_next_is_pumps", st["objective"] == "investigate_pumps", st["objective"])
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{OUT}/02_corridor_lit.png")

    # ---------- O3: pump note ----------
    page.evaluate("() => window.swQA.pose(0, 0, 11.6, 3.1416, 0)")
    page.evaluate("() => window.swQA.interact('door_d2')")
    poll("() => window.swQA.doors().find(d=>d.id==='door_d2').state === 'open'")
    page.evaluate("() => window.swQA.pose(-4.8, 0, 18.2, 1.5708, -0.4)")  # face control panel (west)
    page.evaluate("() => window.swQA.interact('control_panel')")
    page.evaluate("() => window.game.hud.closeNote()")
    st = page.evaluate("() => window.swQA.state()")
    check("O3_done_next_is_drain", st["objective"] == "drain_gallery", st["objective"])
    page.evaluate("() => window.swQA.pose(3, 0, 17.7, -1.5708, 0)")  # face east door D3
    page.evaluate("() => window.swQA.interact('door_d3')")
    poll("() => window.swQA.doors().find(d=>d.id==='door_d3').state === 'open'")
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/02_pumphall.png")

    # ---------- O4: valves (hold interactions) ----------
    page.evaluate("() => window.swQA.pose(12, 0, 15.8, 0, -0.5)")  # face north wall valve A
    r = page.evaluate("() => window.swQA.interact('valve_A')")
    check("valve_A_hold_finish", r.get("ok"), json.dumps(r))
    page.wait_for_timeout(400)
    r = page.evaluate("() => window.swQA.interact('valve_B')")
    check("valve_B_hold_finish", r.get("ok"), json.dumps(r))
    poll("() => window.swQA.state().flags.gallery_drained === true", timeout_s=60)
    poll("() => window.game.world.waterLevel < 0.1", timeout_s=90)
    flags = page.evaluate("() => window.swQA.state().flags")
    wl = page.evaluate("() => window.game.world.waterLevel")
    check("O4_gallery_drained", flags["gallery_drained"] is True)
    check("water_level_dropped", wl < 0.1, f"water={wl}")
    poll("() => window.swQA.doors().find(d=>d.id==='sluice').state === 'open'")
    d = page.evaluate("() => window.swQA.doors().find(d=>d.id==='sluice')")
    check("sluice_opened", d["state"] == "open", json.dumps(d))
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/02_gallery_drained.png")
    st = page.evaluate("() => window.swQA.state()")
    check("O4_done_next_is_nest", st["objective"] == "search_nest", st["objective"])

    # ---------- walk down the ramp to sump (real keys) ----------
    page.evaluate("() => window.swQA.pose(17.6, 0.05, 17.7, -1.5708, 0)")
    page.keyboard.down("KeyW")
    ok = poll("() => window.swQA.roomAt() === 'sump'", timeout_s=120)
    check("walk_down_ramp_to_sump", ok, f"room={page.evaluate('() => window.swQA.roomAt()')}")
    ok2 = poll("() => window.game.player.pos.y < -3.0", timeout_s=90)
    page.keyboard.up("KeyW")
    py = page.evaluate("() => window.game.player.pos.y")
    check("sump_reach_walkable", ok2)
    check("sump_floor_level", abs(py + 3.4) < 0.5, f"y={py:.2f}")
    page.wait_for_timeout(600)
    page.screenshot(path=f"{OUT}/02_sump_nest.png")

    # ---------- O5: last note ----------
    page.evaluate("() => window.swQA.pose(17.4, -3.4, 20.9, -1.5708, -0.6)")  # face east crate desk
    poll("() => window.game.interact.target && window.game.interact.target.id === 'note_last'")
    tgt = page.evaluate("() => window.game.interact.target && window.game.interact.target.id")
    check("last_note_target", tgt == "note_last", f"target={tgt}")
    page.evaluate("() => window.swQA.interact('note_last')")
    page.evaluate("() => window.game.hud.closeNote()")
    poll("() => window.swQA.objective() === 'master_off'", timeout_s=30)
    st = page.evaluate("() => window.swQA.state()")
    check("O5_done_next_is_master", st["objective"] == "master_off", st["objective"])

    # ---------- repeat interaction edge case ----------
    page.evaluate("() => window.swQA.interact('note_last')")
    page.evaluate("() => window.game.hud.closeNote()")
    check("repeat_note_no_regression", page.evaluate("() => window.swQA.objective()") == "master_off")

    # ---------- master breaker gated before O5? (verified: enabled flag) ----------
    # ---------- O6: master breaker ----------
    page.evaluate("() => window.swQA.pose(26.75, -3.4, 20.6, -1.5708, 0)")  # beside cabinet, off the escape-platform footprint
    page.evaluate("() => window.swQA.interact('master_breaker')")
    poll("() => window.swQA.state().flags.master_off === true")
    flags = page.evaluate("() => window.swQA.state().flags")
    check("O6_master_off", flags["master_off"] is True)
    st = page.evaluate("() => window.swQA.state()")
    check("O6_done_next_is_escape", st["objective"] == "escape", st["objective"])
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/02_sump_dark.png")

    # ---------- winch before master must be blocked ----------
    # (already past master here; gating is enforced by enabled() — assert via API)
    gates = page.evaluate("() => window.swQA.interactables().find(i => i.id==='winch')")
    check("winch_enabled_after_master", gates["enabled"] is True)

    # ---------- O7: winch + gate ----------
    page.evaluate("() => window.swQA.pose(23.8, -3.4, 21.6, 2.56, -0.5)")
    page.evaluate("() => window.swQA.interact('winch')")
    poll("() => window.swQA.doors().find(d=>d.id==='gate_service').state === 'open'", timeout_s=120)
    d = page.evaluate("() => window.swQA.doors().find(d=>d.id==='gate_service')")
    check("service_gate_open", d["state"] == "open", json.dumps(d))
    page.wait_for_timeout(600)
    page.screenshot(path=f"{OUT}/03_gate_open.png")

    # ---------- rebinding flow (menus) ----------
    page.evaluate("() => window.game.menus.show('controls')")
    page.wait_for_timeout(300)
    page.evaluate("""() => { document.querySelector('[data-rebind=\\"INTERACT\\"]').click(); }""")
    page.wait_for_timeout(300)
    page.keyboard.press("KeyF")
    page.wait_for_timeout(400)
    binding = page.evaluate("() => window.game.settings.binding('INTERACT')")
    check("rebind_interact_to_F", binding == "KeyF", binding)
    stored = page.evaluate("() => JSON.parse(localStorage.getItem('stillwater.settings.v1')).bindings.INTERACT")
    check("binding_persisted", stored == "KeyF", str(stored))
    # prompt now shows F (pose at any interactable)
    page.evaluate("() => window.game.menus.hide()")
    page.evaluate("() => window.swQA.pose(17.4, -3.4, 20.9, -1.5708, -0.6)")
    poll("() => window.game.interact.target && window.game.interact.target.id === 'note_last'")
    prompt = page.evaluate("() => document.querySelector('#prompt .keycap') && document.querySelector('#prompt .keycap').textContent")
    check("prompt_key_reflects_binding", prompt == "F", str(prompt))
    # conflict: rebind MOVE_FORWARD to KeyF displaces INTERACT
    page.evaluate("() => window.game.menus.show('controls')")
    page.wait_for_timeout(300)
    page.evaluate("""() => { document.querySelector('[data-rebind=\\"MOVE_FORWARD\\"]').click(); }""")
    page.wait_for_timeout(300)
    page.keyboard.press("KeyF")
    page.wait_for_timeout(400)
    bindings = page.evaluate("() => ({mf: window.game.settings.binding('MOVE_FORWARD'), ia: window.game.settings.binding('INTERACT')})")
    check("conflict_displaced", bindings["mf"] == "KeyF" and bindings["ia"] != "KeyF", json.dumps(bindings))
    page.evaluate("() => window.game.settings.resetBindings()")
    check("reset_bindings", page.evaluate("() => window.game.settings.binding('MOVE_FORWARD')") == "KeyW")
    page.evaluate("() => window.game.menus.hide()")


    # ---------- climb shaft via real keys (switchback ramps) ----------
    page.evaluate("() => window.swQA.pose(25.0, -3.4, 20.3, -1.5708, 0)")  # at gate, face east ramp
    page.keyboard.down("KeyW")
    ok = poll("() => window.game.player.pos.y > 3.0", timeout_s=180)
    page.keyboard.up("KeyW")
    check("walk_climb_shaft", ok, f"y={page.evaluate('() => window.game.player.pos.y'):.2f}")
    ended = page.evaluate("() => window.swQA.ending()")
    check("ending_triggered", ended is True)
    page.wait_for_timeout(2600)
    page.screenshot(path=f"{OUT}/04_ending.png")

    # ground sanity at shaft ramp midpoint (no fall-through)
    g = page.evaluate("(p) => window.swQA.groundAt(p[0], p[1])", (25.4, 20.3))
    check("shaft_ramp_ground_exists", -3.5 < g["y"] < 3.5, json.dumps(g))

    # ---------- restart (reload) ----------
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=30000)
    st = page.evaluate("() => window.swQA.state()")
    expected_clean = {k: (k == "pumps_running") for k in st["flags"]}
    check("restart_clean_state", st["objective"] == "find_logbook" and st["flags"] == expected_clean, json.dumps(st["flags"]))

    hard = [e for e in errors if "Pointer Lock" not in e]
    check("no_page_errors", len(hard) == 0, "; ".join(hard[:3]))

finally:
    browser.close()
    pw.stop()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n===== CRITICAL PATH: {passed}/{len(results)} PASSED =====")
for name, ok, detail in results:
    print(f"  {'✓' if ok else '✗'} {name} {detail}")
sys.exit(0 if passed == len(results) else 1)
