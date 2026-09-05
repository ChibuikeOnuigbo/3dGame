#!/usr/bin/env python3
"""World verification: torch model, door colliders/coverage, map sealing,
and solid-object overlap audit (no two solid props may interpenetrate)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pw_common import launch, stderr

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/index.html"

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    stderr(f"{'PASS' if ok else 'FAIL'} {name} {detail}")


pw, browser = launch()
errors = []
try:
    page = browser.new_page(viewport={"width": 640, "height": 360})
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=60000)
    page.evaluate("() => window.swQA.start()")
    page.wait_for_function("() => window.swQA.ready().started", timeout=30000)
    page.wait_for_timeout(1500)

    # ---- torch model ----
    torch = page.evaluate("() => window.game.player.torchReady === true")
    check("torch_model_loaded", torch)

    # ---- sky ----
    sky = page.evaluate("""() => ({
        stars: !!window.game.world.sky, moon: !!window.game.world.moonLight,
        moonI: window.game.world.moonLight ? window.game.world.moonLight.intensity : 0 })""")
    check("moonlight_present", sky["moon"] and sky["moonI"] > 0, json.dumps(sky))

    # ---- doors: closed leaf covers its gap; collider follows when open ----
    doors = page.evaluate("""() => {
        const out = [];
        for (const [id, { door, col }] of window.game.world.doors) {
            const b = door.colliderBox();
            out.push({ id, kind: door.kind, state: door.state,
                box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => +v.toFixed(2)),
                colActive: col.active, colBox: [col.box.min.x, col.box.min.z, col.box.max.x, col.box.max.z].map(v => +v.toFixed(2)) });
        }
        return out;
    }""")
    for (d,) in [(d,) for d in doors]:
        stderr(f"door {d['id']}: {json.dumps(d)}")
    d1 = next((d for d in doors if d["id"] == "door_d1"), None)
    if d1:
        # closed leaf must straddle the gap x in [-0.55, 0.55] at z ~0.35
        b = d1["box"]
        covers = b[0] < -0.45 and b[3] > 0.45 and b[4] > 1.8
        check("door_d1_leaf_covers_gap", covers, json.dumps(b))

    # open door_d1 via API and confirm collider followed the leaf
    page.evaluate("() => window.swQA.pose(0, 0, -1.2, 3.1416, 0)")
    page.evaluate("() => window.swQA.interact('door_d1')")
    page.wait_for_function(
        "() => window.game.world.doors.get('door_d1') && window.game.world.doors.get('door_d1').door.state === 'open'",
        timeout=30000)
    page.wait_for_timeout(300)
    d1o = page.evaluate("""() => { const { door, col } = window.game.world.doors.get('door_d1');
        return { t: door.t, colActive: col.active,
            colBox: [col.box.min.x, col.box.min.y, col.box.min.z, col.box.max.x, col.box.max.y, col.box.max.z].map(v => +v.toFixed(2)) }; }""")
    moved = abs(d1o["colBox"][0] - d1["colBox"][0]) > 0.2 or abs(d1o["colBox"][2] - d1["colBox"][2]) > 0.2
    check("door_collider_follows_leaf", moved and d1o["colActive"], json.dumps(d1o))

    # ---- REGRESSION (user report): open a door while standing in its
    # threshold, then walk through — the doorway must be physically clear ----
    page.evaluate("() => window.game.world.doors.get('door_d1').door.close()")
    page.wait_for_function(
        "() => window.game.world.doors.get('door_d1').door.state === 'closed'", timeout=30000)
    page.evaluate("() => window.swQA.pose(0, 0, 1.0, 0, 0)")  # corridor side, facing -z toward the door (yaw 0)
    page.evaluate("() => window.swQA.interact('door_d1')")
    page.wait_for_function(
        "() => window.game.world.doors.get('door_d1').door.state === 'open'", timeout=30000)
    page.keyboard.down("KeyW")
    page.wait_for_timeout(5200)  # SwiftShader runs ~3 fps — budget real frames
    page.keyboard.up("KeyW")
    pos = page.evaluate("() => window.game.player.pos.toArray().map(v => +v.toFixed(2))")
    check("walk_through_open_door", pos[2] < -0.2, f"pos={pos}")

    # ---- every hinge door: after opening, the gap center must be clear of
    # ALL active colliders (no invisible blockers in any doorway) ----
    clear = page.evaluate("""() => {
        const out = [];
        for (const [id, { door }] of window.game.world.doors) {
            if (door.kind !== 'hinge') continue;
            if (door.state !== 'open') door.open();
        }
        return new Promise((resolve) => {
            const check = () => {
                let allOpen = true;
                for (const [, { door }] of window.game.world.doors)
                    if (door.kind === 'hinge' && door.state !== 'open') allOpen = false;
                if (!allOpen) { requestAnimationFrame(check); return; }
                const bad = [];
                for (const [id, { door }] of window.game.world.doors) {
                    if (door.kind !== 'hinge') continue;
                    // gap center = hinge + (width/2) along the closed-leaf dir
                    const yaw = door.baseYaw, sgn = door.openSign;
                    const dx = Math.cos(yaw) * sgn, dz = -Math.sin(yaw) * sgn;
                    const cx = door.group.position.x + dx * door.width / 2;
                    const cz = door.group.position.z + dz * door.width / 2;
                    const cy = door.group.position.y + 1.0;
                    for (const c of window.game.world.colliders) {
                        if (!c.active) continue;
                        const b = c.box, M = 0.12;
                        if (cx > b.min.x - M && cx < b.max.x + M &&
                            cz > b.min.z - M && cz < b.max.z + M &&
                            cy > b.min.y && cy < b.max.y) {
                            bad.push({ id, blocker: c.door ? 'door:' + c.door : (c.tag || 'arch'),
                                at: [+cx.toFixed(2), +cz.toFixed(2)] });
                        }
                    }
                }
                resolve(bad);
            };
            requestAnimationFrame(check);
        });
    }""")
    check("all_doorways_clear_when_open", len(clear) == 0, json.dumps(clear[:8]))

    # ---- map sealing: walk probes at every edge ----
    probes = [
        ("street_west", -9.0, 3.2, -15.5, -1.5708),   # face west, walk
        ("street_east", 9.0, 3.2, -15.5, 1.5708),
        ("street_north", 0, 3.2, -19.4, 3.1416),
        ("atrium_west", -3.8, 0, -4.0, -1.5708),
        ("sump_east", 27.5, -3.4, 20.0, 1.5708),
        ("sump_south", 20.0, -3.4, 22.8, 3.1416),
    ]
    for name, x, y, z, yaw in probes:
        page.evaluate("(p) => window.swQA.pose(p[0], p[1], p[2], p[3], 0)", (x, y, z, yaw))
        page.evaluate("() => window.swQA.noclip(false)")
        page.keyboard.down("KeyW")
        page.wait_for_timeout(2600)
        page.keyboard.up("KeyW")
        pos = page.evaluate("() => window.game.player.pos.toArray().map(v => +v.toFixed(2))")
        # expected clamp: stayed within world bounds with margin
        ok = -10.6 < pos[0] < 29.0 and -21.0 < pos[2] < 24.0
        check(f"sealed_{name}", ok, f"pos={pos}")

    # ---- overlap audit: solid PROPS must not interpenetrate each other or walls ----
    overlaps = page.evaluate("""() => {
        const cols = window.game.world.colliders.filter(c => c.active);
        const props = cols.filter(c => c.tag === 'prop');
        const arch = cols.filter(c => !c.tag && !c.door && c.tag !== 'fence');
        const out = [];
        const pen = (a, b) => ({
            x: Math.min(a.box.max.x, b.box.max.x) - Math.max(a.box.min.x, b.box.min.x),
            y: Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y),
            z: Math.min(a.box.max.z, b.box.max.z) - Math.max(a.box.min.z, b.box.min.z) });
        // prop vs prop: any real 3-D interpenetration is a placement bug
        for (let i = 0; i < props.length; i++)
            for (let j = i + 1; j < props.length; j++) {
                const p = pen(props[i], props[j]);
                if (p.x > 0.06 && p.y > 0.08 && p.z > 0.06)
                    out.push({ kind: 'prop-prop', pen: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
            }
        // prop vs architecture: prop significantly buried into a wall/column
        // (deep horizontal penetration, substantial vertical overlap)
        for (const pr of props)
            for (const a of arch) {
                if (a.soft) continue;
                const p = pen(pr, a);
                const horiz = Math.min(p.x, p.z);
                if (horiz > 0.06 && p.y > 0.3)
                    out.push({ kind: 'prop-arch', pen: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
            }
        return { pairs: out, propCount: props.length };
    }""")
    check("props_registered", overlaps["propCount"] >= 8, f"props={overlaps['propCount']}")
    check("no_solid_overlaps", len(overlaps["pairs"]) == 0, json.dumps(overlaps["pairs"][:12]))

    check("no_page_errors", len(errors) == 0, "; ".join(errors[:4]))
finally:
    browser.close()
    pw.stop()

passed = sum(1 for _, ok, _ in results if ok)
stderr(f"===== VERIFY WORLD: {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)
