#!/usr/bin/env python3
"""Floor-integrity audit (USER 2026-09-12: "scan for any floor the user can
pass through, remove and fix").

Physics in Still Water is ANALYTIC: the player stands on world.groundRegions
(groundNear), never on meshes. That means exactly two failure classes exist:

  A. walkable ground region with NO visual floor mesh under it
     -> the player walks on thin air / sees the void through the world
     (root cause class of the historic "street asphalt under the stair shaft"
      and "F1 unboardable" bugs).

  B. a visual floor-like mesh top INSIDE a room's walkable volume with NO
     matching ground region
     -> the player sees a floor, steps on it, and falls straight through it.

  C. overlapping flat regions at different heights (closest-match trap risk,
     informational — the sump pit deliberately carves ramp lanes).

Method (no Raycaster needed — all floors in this game are boxes, so AABB-top
coverage is an exact proxy):
  1. Enumerate every scene mesh world AABB; mark audit-excluded meshes
     (water, sky, stars, moon, chain-link, hologram planes, camera viewmodel,
     props whose top is below mountable height).
  2. Check A: sample a grid over every ground region; a point is covered iff
     some non-excluded mesh spans it and |meshTopY - regionY| <= tol
     (tol 0.16 flat, 0.38 sloped — stepped stair boxes).
  3. Check B: for meshes with top area >= 1.0 m^2, top inside a room's XY
     footprint and inside [room.min.y - 0.1, room.max.y + 0.7], require a
     ground region within 0.3 of the top at the top's centre.
  4. Check C: pairwise region overlap with |dy| > 0.1 on flat pairs.

Output: qa/floor_audit.json + human summary. Exit 1 on any A/B defect.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pw_common import launch, stderr

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/index.html"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "qa", "floor_audit.json")

AUDIT_JS = r"""
async () => {
  const g = window.game, w = g.world, scene = g.scene;
  const T = await import("/node_modules/three/build/three.module.js");
  scene.updateMatrixWorld(true);

  // ---- exclusion set: things that may NEVER count as floor ----
  const excluded = new Set();
  const excludeRoot = (root) => { if (!root) return; root.traverse((o) => excluded.add(o)); };
  excludeRoot(w.sky);
  excludeRoot(w.water);
  excludeRoot(g.camera); // torch viewmodel hangs off the camera
  for (const o of scene.children) {
    if (o.isPoints) excluded.add(o);                    // star field
    if (o.type === "Mesh" && o.material && o.material.uniforms && o.material.uniforms.uMap) excluded.add(o); // hologram
    if (o.type === "Mesh" && o.material && (o.material.transparent === true) && o.geometry && o.geometry.type === "CircleGeometry") excluded.add(o); // moon/halo
  }

  // ---- mesh enumeration ----
  const B = w.colliders[0].box.constructor; // Box3 ctor via live object
  const tmp = new B();
  const meshes = [];
  const objects = []; // id -> Object3D for raycasting
  let mid = 0;
  scene.traverse((o) => {
    if (!o.isMesh || excluded.has(o)) return;
    tmp.setFromObject(o);
    if (tmp.isEmpty()) return;
    const sx = tmp.max.x - tmp.min.x, sy = tmp.max.y - tmp.min.y, sz = tmp.max.z - tmp.min.z;
    // opaque-ish test: floors must be visible solid surfaces
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m0 = mats[0] || {};
    if (m0.transparent === true && (m0.opacity ?? 1) < 0.55) return; // fences, ghosts
    if (o.userData && o.userData.noAudit) return;
    meshes.push({
      id: mid,
      name: o.name || o.parent?.name || "?",
      minx: tmp.min.x, maxx: tmp.max.x,
      miny: tmp.min.y, maxy: tmp.max.y,
      minz: tmp.min.z, maxz: tmp.max.z,
      topArea: sx * sz,
      thin: Math.min(sx, sz) <= 0.35, // walls / rails / posts / kerbs
    });
    objects[mid] = o;
    mid++;
  });

  const raycaster = new T.Raycaster();
  raycaster.far = 3.2;
  const DOWN = new T.Vector3(0, -1, 0);
  const rayObjects = objects.filter(Boolean);
  // exact underfoot height: raycast straight down from just above the point
  const floorHitAt = (x, y, z) => {
    raycaster.set(new T.Vector3(x, y + 1.6, z), DOWN);
    const hits = raycaster.intersectObjects(rayObjects, false);
    for (const h of hits) {
      if (!h.face || h.face.normal.y < 0.5) continue; // need an up-facing surface
      return h.point.y;
    }
    return null;
  };

  const regionY = (r, x, z) => {
    if (!r.slope) return r.y;
    const s = r.slope;
    const tt = s.axis === "z" ? (z - s.from) / (s.to - s.from) : (x - s.from) / (s.to - s.from);
    return s.y0 + (s.y1 - s.y0) * Math.min(1, Math.max(0, tt));
  };

  // ---- Check A: region coverage (exact downward raycast underfoot) ----
  const holes = [];
  let samples = 0;
  for (const r of w.groundRegions) {
    const stepX = Math.min(0.9, Math.max(0.35, (r.x1 - r.x0) / 14));
    const stepZ = Math.min(0.9, Math.max(0.35, (r.z1 - r.z0) / 14));
    const tol = r.slope ? 0.38 : 0.16;
    for (let x = r.x0 + 0.05; x <= r.x1; x += stepX) {
      for (let z = r.z0 + 0.05; z <= r.z1; z += stepZ) {
        samples++;
        const y = regionY(r, x, z);
        const hit = floorHitAt(x, y, z);
        // covered = a standable up-facing surface at/above the analytic height
        // (the floor itself, or a prop's top occupying the spot). A hit BELOW
        // the region height by > tol means the eye would see through a gap.
        if (hit === null || hit < y - tol) {
          holes.push({ region: r.surface + "@" + r.y.toFixed(2), x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), hit });
        }
      }
    }
  }
  // collapse hole clusters to their centres (report max 40)
  const clustered = [];
  for (const h of holes) {
    const near = clustered.find((c) => Math.abs(c.x - h.x) < 1.2 && Math.abs(c.z - h.z) < 1.2);
    if (!near) clustered.push(h);
  }

  // ---- Check B: visual floor tops without ground support ----
  // A top is only a WALKABLE fall-through hazard when a ground region runs at
  // (approximately) the same height next to it — otherwise it is a ceiling,
  // roof or wall top the player can never reach (jump height is 0.37 m).
  const ghostFloors = [];
  for (const m of meshes) {
    if (m.thin) continue;
    if (m.topArea < 1.0) continue;
    const cx = (m.minx + m.maxx) / 2, cz = (m.minz + m.maxz) / 2, cy = m.maxy;
    const room = w.rooms.find((r) => cx >= r.min[0] - 0.05 && cx <= r.max[0] + 0.05 && cz >= r.min[2] - 0.05 && cz <= r.max[2] + 0.05);
    if (!room) continue;                    // outside any room = unreachable dressing/roof
    if (cy < room.min[1] - 0.1 || cy > room.max[1] + 0.7) continue; // roofs/shelves above the volume
    // (1) is the top supported analytically at its own centre? (region OR a
    // standable collider top — colliderTopNear support landed 2026-09-12)
    let best = null;
    for (const r of w.groundRegions) {
      if (cx < r.x0 || cx > r.x1 || cz < r.z0 || cz > r.z1) continue;
      const ry = regionY(r, cx, cz);
      if (best === null || Math.abs(ry - cy) < Math.abs(best - cy)) best = ry;
    }
    for (const c of w.colliders) {
      if (!c.active || c.soft || c.door) continue;
      const b = c.box;
      if (cx < b.min.x - 0.08 || cx > b.max.x + 0.08 || cz < b.min.z - 0.08 || cz > b.max.z + 0.08) continue;
      if (b.max.y <= cy + 0.1 && cy - b.max.y < Math.abs((best ?? 1e9) - cy)) best = b.max.y;
    }
    if (best !== null && Math.abs(best - cy) <= 0.3) continue; // properly supported
    // (2) if unsupported, is it REACHABLE — some region within 1.2 m running
    // at walk-up height (<=0.35 of the top)? Ceilings/roofs/prop tops have no
    // such region (jump is 0.37 m) and can never be walked onto -> not hazards.
    // A solid collider over the point whose top is WELL above the mesh top
    // means the point is buried inside/behind solid geometry -> unreachable.
    let buried = false;
    for (const c of w.colliders) {
      if (!c.active || c.soft || c.door) continue;
      const b = c.box;
      if (cx < b.min.x || cx > b.max.x || cz < b.min.z || cz > b.max.z) continue;
      if (b.max.y > cy + 0.35 && b.min.y < cy) { buried = true; break; }
    }
    if (buried) continue;
    let reachable = false;
    for (const r of w.groundRegions) {
      const px = Math.min(Math.max(cx, r.x0), r.x1), pz = Math.min(Math.max(cz, r.z0), r.z1);
      const gap = Math.hypot(cx - px, cz - pz);
      if (gap > 1.2) continue;
      const ry = regionY(r, px, pz);
      if (Math.abs(ry - cy) <= 0.35 && ry <= cy + 0.1) { reachable = true; break; }
    }
    if (reachable) {
      ghostFloors.push({ mesh: m.name, at: [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)], topArea: +m.topArea.toFixed(2), support: best === null ? null : +best.toFixed(2) });
    }
  }

  // ---- Check C: overlapping flat regions, different heights ----
  const traps = [];
  const regs = w.groundRegions;
  for (let i = 0; i < regs.length; i++) {
    for (let j = i + 1; j < regs.length; j++) {
      const a = regs[i], b = regs[j];
      if (a.slope || b.slope) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > 0.05 && oz > 0.05 && Math.abs(a.y - b.y) > 0.1) {
        traps.push({ a: a.surface + "@" + a.y.toFixed(2), b: b.surface + "@" + b.y.toFixed(2), overlap: [+ox.toFixed(2), +oz.toFixed(2)] });
      }
    }
  }

  return {
    meshes: meshes.length,
    regionCount: regs.length,
    samples,
    holeSamples: holes.length,
    holes: clustered.slice(0, 40),
    ghostFloors: ghostFloors.slice(0, 40),
    ghostFloorCount: ghostFloors.length,
    traps: traps.slice(0, 20),
    trapCount: traps.length,
    propsPending: w.propsPending || 0,
  };
}
"""

def main():
    pw, browser = launch()
    page = browser.new_page(viewport={"width": 960, "height": 600})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    stderr(f"[audit_floors] loading {URL}")
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => window.game && window.game.ready && window.swQA", timeout=90000)
    # doors open so every room volume is walkable; start not required (world is static)
    page.evaluate("() => { for (const {door} of window.game.world.doors.values()) { door.t = 1; door.state = 'open'; if (door.kind === 'hinge') door.group.rotation.y = door.baseYaw + door.openSign * -1.85; else { door.rise = 2.6; } } }")
    # let async props settle (GLTF loads under SwiftShader are slow)
    try:
        page.wait_for_function("() => (window.game.world.propsPending || 0) === 0", timeout=30000)
    except Exception:
        stderr("[audit_floors] WARN: props still pending after 30s")
    res = page.evaluate(AUDIT_JS)
    res["consoleErrors"] = errors[:20]
    with open(OUT, "w") as f:
        json.dump(res, f, indent=1)
    ok = res["holeSamples"] == 0 and res["ghostFloorCount"] == 0 and res["propsPending"] == 0
    stderr(f"[audit_floors] regions={res['regionCount']} meshes={res['meshes']} samples={res['samples']}")
    stderr(f"[audit_floors] A see-through holes: {res['holeSamples']} samples in {len(res['holes'])} clusters")
    stderr(f"[audit_floors] B ghost floors (visual, no support): {res['ghostFloorCount']}")
    stderr(f"[audit_floors] C flat-overlap traps (info): {res['trapCount']}")
    stderr(f"[audit_floors] propsPending={res['propsPending']} consoleErrors={len(errors)}")
    for h in res["holes"][:12]:
        stderr(f"  HOLE {h['region']} at ({h['x']},{h['z']}) y={h['y']}")
    for gf in res["ghostFloors"][:12]:
        stderr(f"  GHOST-FLOOR {gf['mesh']} at {gf['at']} area={gf['topArea']} support={gf['support']}")
    stderr(f"[audit_floors] {'PASS' if ok else 'FAIL'} -> {os.path.abspath(OUT)}")
    browser.close()
    pw.stop()
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
