#!/usr/bin/env python3
"""Layer A + B visual QA harness (per VISUAL QA CORRECTION directive).

REBUILT 2026-09-06 after a sandbox recycle destroyed the original
(post-Rev-5 work was never pushed). Same interface and audit intent as the
lost harness; view poses were re-derived from world room bounds.

Captures player-eye view sets per room (entry/focal/path/interaction/exit/
secondary/vertical) AFTER REAL MOVEMENT, plus deterministic machine audits
for defect classes that can be honestly detected without vision:
  FLOATING / SUNK props (collider vs groundNear, support-surface exemption)
  EMPTY / density-vs-purpose (floor area per prop, by room role)
  LONE-OBJECT isolation (nearest-neighbour cluster analysis)
  REPETITIVE identical prop signatures per room
  POORLY-LIT / LOW-CONTRAST views (histogram)
Semantic visual review (Layer C) is BLOCKED in this runtime — outputs are
marked as such and require human inspection (see INDEX.md).

Usage: python3 visual_qa.py [url] [room_ids_csv]
Existing current-generation PNGs are renamed to before_<n>_<view>.png before
a recapture (generation counter per room).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw_common import launch, stderr
from PIL import Image

BASE = "/home/user/3dGame/qa/visual"
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/index.html"
ONLY = sys.argv[2].split(",") if len(sys.argv) > 2 else None

# room -> views. how: pose | walk (walk = real KeyW movement segment)
ROOMS = [
  dict(id="street", name="Stadtfeld Street", purpose="outdoor night approach; establish place + lock-in",
       focal="lit STORMWATER STATION 6 kiosk sign + sodium lamp", route="south toward kiosk door, then stairwell",
       objects=["kiosk", "sodium lamp", "fences", "grass verges", "moon"], lighting="moon + sodium lamp + sign glow",
       pack="procedural + ambientCG", objective="find_logbook", target="industrial-night street, INFRA-style",
       dark_ok=["secondary"], density="light",
       views=[("entry", 0, 3.2, -17.5, 3.1416, 0.02, "pose"),
              ("focal", 1.6, 3.2, -14.9, 2.2, 0.0, "pose"),
              ("path", 0, 3.2, -16.0, 3.1416, 0.0, "walk"),
              ("interaction", 0, 3.2, -15.6, 3.1416, 0.0, "pose"),
              ("exit", 0, 3.0, -10.6, 0, 0.05, "pose"),
              ("secondary", -5.5, 3.2, -13.5, 2.45, 0.0, "pose")]),
  dict(id="kiosk", name="Street Kiosk", purpose="entry booth; first interior; light vs night contrast",
       focal="counter + lit signage inside the booth", route="in through the door, around the counter",
       objects=["counter", "signage", "shelf"], lighting="interior fluorescent spill",
       pack="procedural + ambientCG", objective="find_logbook", target="cramped ticket-booth feel",
       dark_ok=["entry", "path", "secondary"], density="medium",
       views=[("entry", 0, 3.2, -14.4, 0, 0.0, "pose"),
              ("focal", 0, 3.2, -12.7, 3.1416, 0.0, "pose"),
              ("path", 0, 3.2, -13.6, 0, 0.0, "walk"),
              ("interaction", 0.7, 3.2, -12.9, -2.1, -0.1, "pose"),
              ("exit", 0, 3.2, -14.7, 3.1416, 0.0, "pose"),
              ("secondary", -1.2, 3.2, -13.3, 1.1, 0.0, "pose")]),
  dict(id="corridor", name="Service Corridor", purpose="circulation spine; tension build; breaker nook",
       focal="long receding walls, door frames, cable trays", route="atrium north to pump hall",
       objects=["cable trays", "doors", "breaker nook", "clipboard"], lighting="dead fixtures + nook spill",
       pack="procedural + ambientCG", objective="restore_power", target="liminal service-corridor, ratty but real",
       dark_ok=["entry", "path", "secondary"], density="sparse",
       views=[("entry", 0, 0, 1.0, 0, 0.0, "pose"),
              ("focal", 0, 0, 6.5, 0, 0.0, "pose"),
              ("path", 0, 0, 3.0, 0, 0.0, "walk"),
              ("interaction", 0, 0, 8.6, -1.8, 0.0, "pose"),
              ("exit", 0, 0, 11.9, 0, 0.0, "pose"),
              ("secondary", 0, 0, 5.0, 3.1416, 0.0, "pose")]),
  dict(id="atrium", name="Reception", purpose="first big interior; logbook objective; dressing density",
       focal="reception desk group: desk + chair + logbook + toolbox", route="stairwell to desk to corridor",
       objects=["reception desk", "chair", "logbook", "notice board", "lockers", "toolbox"],
       lighting="atrium fixture + sign spill", pack="procedural + ambientCG", objective="find_logbook",
       target="abandoned admin corner, lived-in", dark_ok=["entry", "path"], density="medium",
       views=[("entry", 0, 0, -5.6, 0, 0.0, "pose"),
              ("focal", -2.3, 0, -4.4, -2.2, 0.0, "pose"),
              ("path", 0, 0, -4.5, 0, 0.0, "walk"),
              ("interaction", -2.3, 0, -3.3, 1.9, -0.25, "pose"),
              ("exit", 0, 0, -0.4, 0, 0.0, "pose"),
              ("secondary", 3.1, 0, -4.6, -2.0, 0.0, "pose")]),
  dict(id="pumphall", name="Pump Hall", purpose="machine room; pumps objective; noise + scale",
       focal="pump trains under high bays + control panel", route="corridor D1 to pumps, workbench SW, D3 east",
       objects=["pump trains", "control panel", "valve wheel", "workbench", "radio", "toolbox", "barrels"],
       lighting="high bay fluorescents (circuit)", pack="procedural + ambientCG", objective="restore_pumps",
       target="functional machine hall", dark_ok=["entry"], density="medium",
       views=[("entry", 0, 0, 13.2, 0, 0.0, "pose"),
              ("focal", 0, 0, 18.5, 0, 0.05, "pose"),
              ("path", 0, 0, 15.5, 0, 0.0, "walk"),
              ("interaction", -5.2, 0, 18.4, 0.9, 0.0, "pose"),
              ("exit", 5.5, 0, 16.5, -1.5708, 0.0, "pose"),
              ("secondary", -1.9, 0, 21.7, 3.1416, 0.0, "pose")]),
  dict(id="gallery", name="Valve Gallery", purpose="flooded valve room; drain puzzle; descent to sump",
       focal="valve wheels + water plane + drain wheel", route="east door to ramp descent",
       objects=["valve wheels", "water", "drain", "ramp"], lighting="wet reflections + sparse fixtures",
       pack="procedural + ambientCG", objective="drain_gallery", target="flooded sub-room, echoey",
       dark_ok=["exit"], density="light",
       views=[("entry", 8.6, 0, 17.5, -1.5708, 0.0, "pose"),
              ("focal", 12.0, 0, 17.5, -1.5708, 0.0, "pose"),
              ("path", 10.0, 0, 16.5, -1.5708, 0.0, "walk"),
              ("interaction", 12.0, 0, 19.4, 3.1416, 0.1, "pose"),
              ("exit", 16.2, -1.6, 17.8, -1.2, -0.1, "pose"),
              ("secondary", 14.0, 0, 15.6, 0.5, 0.0, "pose")]),
  dict(id="sump", name="Lower Level", purpose="nest + story beat; lowest point; gate to shaft",
       focal="the nest: bedroll + string lights + radio + crate desk", route="ramp bottom to nest to gate",
       objects=["bedroll", "string lights", "radio", "crate desk", "shelf", "crate stack", "master breaker"],
       lighting="nest string lights + tomb lamp", pack="procedural + ambientCG", objective="read_note",
       target="someone lived here", dark_ok=["exit"], density="medium",
       views=[("entry", 19.5, -3.4, 15.2, 3.1416, 0.0, "pose"),
              ("focal", 17.4, -3.4, 19.9, -2.5, 0.05, "pose"),
              ("path", 18.5, -3.4, 16.8, 3.5, 0.0, "walk"),
              ("interaction", 18.2, -3.4, 20.6, 0.4, -0.15, "pose"),
              ("exit", 23.2, -3.4, 20.9, -1.5708, 0.0, "pose"),
              ("secondary", 19.4, -3.4, 21.3, 3.1416, 0.05, "pose"),
              ("vertical", 21.9, -3.4, 20.9, -1.5708, 0.75, "pose")]),
  dict(id="shaft", name="Service Shaft", purpose="final climb; switchback ramps under the street",
       focal="3-flight switchback ramps with step markers + lamps", route="gate -> F1 -> L1 -> F2 -> L2 -> F3 -> top",
       objects=["ramps", "step-edge markers", "wall lamps", "gate", "winch", "gratings"],
       lighting="3 chimney wall lamps", pack="procedural + ambientCG", objective="escape",
       target="readable vertical climb", dark_ok=[], density="sparse",
       views=[("entry", 24.6, -3.4, 20.9, -1.5708, 0.1, "pose"),
              ("focal", 25.4, -2.2, 20.3, -1.5708, 0.15, "pose"),
              ("path", 26.2, -1.2, 21.5, 1.5708, 0.1, "pose"),
              ("interaction", 24.4, -3.4, 20.7, 0.5, 0.1, "pose"),
              ("exit", 25.7, 3.2, 20.4, -1.5708, -0.25, "pose"),  # look back down the climb (eye clears the shaft walls otherwise: half the frame is the dark world beyond; pitch -0.25 = down)
              ("secondary", 24.0, 0.9, 21.4, 0.8, 0.1, "pose")]),
]

DENSITY = {"sparse": 40, "light": 26, "medium": 18, "dense": 18}  # m^2/prop upper bounds
LONE_M = 3.0          # nearest-neighbour distance beyond which a prop is "lone"
REPEAT_N = 4          # identical-size signature count flagged as repetitive


def gen_shift(od):
    """rename current <view>.png -> before_<n>_<view>.png, n = next generation"""
    import glob
    n = len(glob.glob(os.path.join(od, "before*_*.png"))) and \
        max(int(os.path.basename(p).split("_")[1]) for p in glob.glob(os.path.join(od, "before*_*.png"))) + 1 or 1
    for f in glob.glob(os.path.join(od, "*.png")):
        b = os.path.basename(f)
        if b.startswith("before"):
            continue
        os.rename(f, os.path.join(od, f"before_{n}_{b}"))
    return n


AUDIT_JS = """() => {
  const w = window.game.world, cols = w.colliders.filter(c => c.active && c.tag === 'prop');
  const rooms = w.rooms;
  const info = cols.map(c => {
    const b = c.box, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const r = w.roomAt(cx, (b.min.y + b.max.y) / 2, cz);
    return { room: r ? r.id : '?',
             min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z],
             gy: w.groundNear(cx, cz, b.min.y).y };
  });
  // support-surface exemption: a prop resting on another prop's top is fine
  for (const p of info) {
    p.supported = info.some(q => q !== p &&
      q.min[0] - 0.06 <= p.max[0] && q.max[0] + 0.06 >= p.min[0] &&
      q.min[2] - 0.06 <= p.max[2] && q.max[2] + 0.06 >= p.min[2] &&
      Math.abs(q.max[1] - p.min[1]) < 0.06);
  }
  const floating = info.filter(p => p.min[1] - p.gy > 0.12 && !p.supported)
                       .map(p => ({room: p.room, y: +p.min[1].toFixed(2), gy: +p.gy.toFixed(2)}));
  const sunk = info.filter(p => p.min[1] < p.gy - 0.12)
                   .map(p => ({room: p.room, y: +p.min[1].toFixed(2), gy: +p.gy.toFixed(2)}));
  // lone analysis per room (nearest prop centre distance)
  const lone = [];
  for (const rid of new Set(info.map(p => p.room))) {
    const ps = info.filter(p => p.room === rid);
    for (const p of ps) {
      let best = 1e9;
      for (const q of ps) if (q !== p) {
        const d = Math.hypot((p.min[0]+p.max[0])/2 - (q.min[0]+q.max[0])/2,
                             (p.min[2]+p.max[2])/2 - (q.min[2]+q.max[2])/2);
        best = Math.min(best, d);
      }
      if (best > %f) lone.push({room: rid, id: 'prop', nearest: +best.toFixed(1)});
    }
  }
  // repetitive signature per room
  const sig = {};
  for (const p of info) {
    const k = p.room + '|' + [p.max[0]-p.min[0], p.max[1]-p.min[1], p.max[2]-p.min[2]]
      .map(v => Math.round(v * 10) / 10).join('x');
    sig[k] = (sig[k] || 0) + 1;
  }
  const repeats = Object.entries(sig).filter(([k, n]) => n > %d).map(([k, n]) => ({sig: k, n}));
  // density
  const roomsOut = {};
  for (const r of rooms) {
    const ps = info.filter(p => p.room === r.id);
    const area = Math.round((r.max[0]-r.min[0]) * (r.max[2]-r.min[2]));
    roomsOut[r.id] = {props: ps.length, area};
  }
  return {floating, sunk, lone, repeats, rooms: roomsOut};
}""" % (LONE_M, REPEAT_N)


def exposure(path):
    im = Image.open(path).convert("L")
    px = list(im.getdata())
    n = len(px)
    mean = sum(px) / n
    var = sum((v - mean) ** 2 for v in px) / n
    return mean, var


def main():
    os.makedirs(BASE, exist_ok=True)
    pw, browser = launch()
    page = browser.new_page(viewport={"width": 960, "height": 600})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=60000)
    page.evaluate("() => window.swQA.start()")
    page.wait_for_function("() => window.swQA.ready().started", timeout=30000)
    page.wait_for_timeout(1200)

    summary = {}
    for room in ROOMS:
        rid = room["id"]
        if ONLY and rid not in ONLY:
            continue
        od = os.path.join(BASE, rid)
        os.makedirs(od, exist_ok=True)
        if os.path.exists(os.path.join(od, "analysis.json")):
            gen_shift(od)
        pos_log = {}
        for view in room["views"]:
            name, x, y, z, yaw, pitch, how = view
            # screenshots blur the page -> the game auto-pauses (player.enabled
            # false) -> camera-follow stops (QA-found: duplicate PNGs). Also
            # Playwright's compositor capture serves stale presents under
            # SwiftShader, so views are read back DIRECTLY from the WebGL
            # canvas in the same JS task as a forced render instead.
            page.evaluate("""(p) => {
              const g = window.game;
              if (g.menus && g.menus.open) g.menus.hide();
              g.player.enabled = true;
              window.swQA.pose(p[0], p[1], p[2], p[3], p[4]);
              window.swQA.noclip(false);
            }""", (x, y, z, yaw, pitch))
            if how == "walk":
                page.keyboard.down("KeyW")
                page.wait_for_timeout(1400)
                page.keyboard.up("KeyW")
            page.wait_for_timeout(300)
            data = page.evaluate("""() => {
              const g = window.game;
              g.player.enabled = true;
              g.player.update(0.016);           // camera follows the pose now
              g.renderer.render(g.scene, g.camera);  // fresh frame
              const src = g.renderer.domElement;
              const t = document.createElement('canvas');
              t.width = src.width; t.height = src.height;
              t.getContext('2d').drawImage(src, 0, 0);  // same-task: buffer valid
              return t.toDataURL('image/png');
            }""")
            import base64
            with open(os.path.join(od, f"{name}.png"), "wb") as f:
                f.write(base64.b64decode(data.split(",", 1)[1]))
            pos_log[name] = page.evaluate(
                "() => window.game.player.pos.toArray().map(v => +v.toFixed(2))")
        stderr(f"captured {rid} ({len(room['views'])} views)")

        audit = page.evaluate(AUDIT_JS)
        density = None
        ra = audit["rooms"].get(rid)
        if ra and ra["props"] > 0:
            m2 = ra["area"] / ra["props"]
            density = dict(role=room["density"], props=ra["props"], area=ra["area"],
                           m2_per_prop=round(m2, 1),
                           flag=(room["density"] and m2 > DENSITY[room["density"]]) or None)
        exp = {}
        for view in room["views"]:
            name = view[0]
            mean, var = exposure(os.path.join(od, f"{name}.png"))
            flags = []
            # dark_ok views are intentionally dark (night exteriors, pre-power
            # circulation) — exempt from both flags, but only those views
            if name not in room["dark_ok"]:
                if mean < 8:
                    flags.append("TOO_DARK")
                if var < 45:  # calibrated: 60 flagged structured frames (mean 32, var 59.5)
                    flags.append("FLAT")
            exp[name] = dict(mean_lum=round(mean, 1), variance=round(var, 1), flags=flags)

        room_ctx = dict(room_id=rid, room_name=room["name"], purpose=room["purpose"],
                        expected_focal_point=room["focal"], expected_player_route=room["route"],
                        expected_important_objects=room["objects"], expected_lighting=room["lighting"],
                        environment_pack=room["pack"], objective=room["objective"],
                        visual_target_reference=room["target"],
                        semantic_visual_review="BLOCKED (no vision runtime) — human inspection required",
                        player_pos_at_capture=pos_log,
                        views={v[0]: dict(camera_feet=(v[1], v[2], v[3]), yaw=v[4], pitch=v[5], capture=v[6]) for v in room["views"]})
        analysis = dict(audit=audit, exposure=exp, density=density,
                        page_errors=errors[:6],
                        semantic_visual_review="BLOCKED (no vision runtime) — human inspection required")
        json.dump(room_ctx, open(os.path.join(od, "room_context.json"), "w"), indent=1)
        json.dump(analysis, open(os.path.join(od, "analysis.json"), "w"), indent=1)
        summary[rid] = analysis
        stderr(f"{rid}: floating={len(audit['floating'])} sunk={len(audit['sunk'])} "
               f"lone={len(audit['lone'])} repeats={len(audit['repeats'])} "
               f"exposure_flags={sum(len(v['flags']) for v in exp.values())}")

    json.dump(summary, open(os.path.join(BASE, "summary.json"), "w"), indent=1)
    stderr("DONE")
    browser.close()
    pw.stop()


if __name__ == "__main__":
    main()
