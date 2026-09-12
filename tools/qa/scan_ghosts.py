#!/usr/bin/env python3
"""Ghost-element scanner + collision-probe walker.

Hunts exactly the class of bugs reported by user QA:
  * "black wall" meshes: visible (even faint/low-opacity), NO collision,
    touching a door, overlapping another asset, or floating outside/around
    the playable parcel;
  * invisible walls: colliders that block the player with nothing visible;
  * useless open space: walkable area outside every defined room.

Method:
  1. Enumerate every scene mesh: world AABB, material opacity/transparency,
     colour luma, double-sided, canvas-texture (sign/text) flag.
  2. Match each mesh against the world collider list (coverage test) and
     against every door volume (leaf + threshold).
  3. Walk a DUMMY CAPSULE (the player's own collision rules) over a grid of
     the whole map with all doors opened — recording which visible meshes it
     passes THROUGH (ghosts) and where it is blocked by nothing visible
     (invisible walls), and which visited cells belong to no room (open
     space leaks).

Output: qa/ghost_scan.json + summary on stderr.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from pw_common import launch, stderr

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/index.html"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "qa", "ghost_scan.json")

ENUM_JS = r"""() => {
  const T = window.THREE || null;
  const g = window.game;
  const scene = g.scene, world = g.world;
  const box3 = () => new window.gameBox3();

  // --- mesh enumeration -------------------------------------------------
  const meshes = [];
  let mid = 0;
  const tmpB = new window.gameBox3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m0 = mats[0] || {};
    const col = m0.color ? '#' + m0.color.getHexString() : null;
    let luma = null;
    if (m0.color) luma = 0.2126 * m0.color.r + 0.7152 * m0.color.g + 0.0722 * m0.color.b;
    tmpB.setFromObject(o);
    if (tmpB.isEmpty()) return;
    const sx = tmpB.max.x - tmpB.min.x, sy = tmpB.max.y - tmpB.min.y, sz = tmpB.max.z - tmpB.min.z;
    meshes.push({
      id: mid++,
      name: o.name || o.parent?.name || o.geometry?.type || '?',
      type: o.isPoints ? 'points' : 'mesh',
      min: [+tmpB.min.x.toFixed(3), +tmpB.min.y.toFixed(3), +tmpB.min.z.toFixed(3)],
      max: [+tmpB.max.x.toFixed(3), +tmpB.max.y.toFixed(3), +tmpB.max.z.toFixed(3)],
      size: [+sx.toFixed(3), +sy.toFixed(3), +sz.toFixed(3)],
      matType: m0.type || '?',
      color: col, luma: luma == null ? null : +luma.toFixed(3),
      transparent: !!m0.transparent,
      opacity: m0.opacity == null ? 1 : m0.opacity,
      depthWrite: m0.depthWrite !== false,
      doubleSide: m0.side === 2,
      fog: m0.fog !== false,
      hasMap: !!m0.map,
      canvasTex: !!(m0.map && m0.map.isCanvasTexture),
      emissiveI: m0.emissiveIntensity || 0,
      visible: o.visible,
      castShadow: !!o.castShadow,
    });
  });

  // --- colliders + doors ------------------------------------------------
  const colliders = world.colliders.map((c) => ({
    active: c.active, soft: !!c.soft, door: c.door || null, tag: c.tag || null,
    min: c.box.min.toArray(), max: c.box.max.toArray(),
  }));
  const doors = [];
  for (const [id, { door }] of world.doors) {
    const b = door.colliderBox();
    const wp = door.group.position;
    doors.push({
      id, kind: door.kind, width: door.width, height: door.height,
      pos: [wp.x, wp.y, wp.z], yaw: door.baseYaw,
      leaf: { min: b.min.toArray(), max: b.max.toArray() },
    });
  }
  return { meshes, colliders, doors,
           bounds: { x: [-9.5, 28.5], y: [-4.5, 8], z: [-20.5, 23.5] } };
}"""

PROBE_JS = r"""(scan) => {
  const g = window.game, world = g.world;
  const R = 0.35, BODY = 1.65, STEP = 0.55;   // capsule radius / head / max step
  const CELL = 0.45;
  const cols = scan.colliders.filter(c => c.active);
  const intersects = (a, b, pad = 0) =>
    a[0] < b[1][0] + pad && a[1][0] > b[0][0] - pad &&
    a[2] < b[1][1] + pad && a[3] < b[1][2] + pad &&
    a[4] > b[0][1] - pad && a[5] > b[0][2] - pad;
  // capsule as [minx,maxx,miny,maxy,minz,maxz]
  const capBox = (x, z, fy) => [x - R, x + R, fy + 0.05, fy + BODY, z - R, z + R];
  const boxHitsCapsule = (b, cap) =>
    b.min[0] < cap[1] && b.max[0] > cap[0] &&
    b.min[1] < cap[3] && b.max[1] > cap[2] &&
    b.min[2] < cap[5] && b.max[2] > cap[4];

  // open + unlock every door for the scan, sync colliders to open pose
  for (const { door, col } of world.doors.values()) {
    door.locked = false;
    door.t = 1; door.state = 'open';
    if (door.kind === 'gate') { door.group.position.y = door.baseY + door.height * 0.92; }
    else { door.group.rotation.y = door.baseYaw + door.openSign * -1.85; }
    col.box.copy(door.colliderBox());
    col.active = door.kind === 'gate' ? false : true;  // open hinge leaf stays solid
  }

  // blocker query: any active collider that is not floor/step-below or
  // ceiling-above the capsule
  const blockers = (x, z, fy) => {
    const cap = capBox(x, z, fy);
    const hits = [];
    for (const c of cols) {
      if (c.max[1] <= fy + 0.32) continue;       // floor / low step: walkable
      if (c.min[1] >= fy + BODY) continue;       // above head
      if (boxHitsCapsule({ min: c.min, max: c.max }, cap)) hits.push(c);
    }
    return hits;
  };

  const X0 = -10.4, X1 = 29.0, Z0 = -21.0, Z1 = 24.0;
  const NX = Math.round((X1 - X0) / CELL), NZ = Math.round((Z1 - Z0) / CELL);
  const idx = (ix, iz) => iz * NX + ix;
  const feet = new Float32Array(NX * NZ).fill(NaN);
  const kind = new Uint8Array(NX * NZ); // 0 unseen, 1 visited, 2 blocked-edge
  const blockInfo = [];                  // blocked neighbours w/ reason
  const seeds = [
    [0, -16, 3.2], [0, -13, 3.2],        // street, kiosk
    [0, -3, 0], [0, 6, 0], [-2.4, 9.4, 0], // atrium, corridor, nook
    [0, 18, 0], [12.1, 17.7, 0],          // pump hall, gallery
    [20, 17.7, -3.4], [16.2, 21.5, -3.4], // sump
    [25.0, 20.3, -3.4], [25.95, 20.9, 3.2], // shaft flights/top
  ];
  const q = [];
  const groundAtRegion = (x, z, refY) => {
    let gr = null;
    for (const r of world.groundRegions) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
        let y = r.y;
        if (r.slope) {
          const s = r.slope;
          const tt = s.axis === "z" ? (z - s.from) / (s.to - s.from) : (x - s.from) / (s.to - s.from);
          y = s.y0 + (s.y1 - s.y0) * Math.min(1, Math.max(0, tt));
        }
        if (!gr || Math.abs(y - refY) < Math.abs(gr.y - refY)) gr = { y };
      }
    }
    return gr;
  };
  for (const [sx, sz, ry] of seeds) {
    const ix = Math.round((sx - X0) / CELL), iz = Math.round((sz - Z0) / CELL);
    if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) continue;
    const gr = groundAtRegion(sx, sz, ry);
    if (!gr || blockers(sx, sz, gr.y).length) continue;
    feet[idx(ix, iz)] = gr.y; kind[idx(ix, iz)] = 1; q.push([ix, iz]);
  }
  let head = 0, visited = 0;
  while (head < q.length) {
    const [ix, iz] = q[head++]; visited++;
    const fy = feet[idx(ix, iz)];
    const x = X0 + ix * CELL, z = Z0 + iz * CELL;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= NX || jz >= NZ) continue;
      const j = idx(jx, jz);
      if (kind[j]) continue;
      const nx = X0 + jx * CELL, nz = Z0 + jz * CELL;
      // require REAL ground support: groundNear's fallback returns refY
      // anywhere (phantom mid-air floor), which made the probe "walk" over the
      // whole map at street height. Only accept cells covered by a ground
      // region near the current feet height.
      let gr = null;
      for (const r of world.groundRegions) {
        if (nx >= r.x0 && nx <= r.x1 && nz >= r.z0 && nz <= r.z1) {
          let y = r.y;
          if (r.slope) {
            const s = r.slope;
            const tt = s.axis === "z" ? (nz - s.from) / (s.to - s.from) : (nx - s.from) / (s.to - s.from);
            y = s.y0 + (s.y1 - s.y0) * Math.min(1, Math.max(0, tt));
          }
          if (!gr || Math.abs(y - fy) < Math.abs(gr.y - fy)) gr = { y };
        }
      }
      if (!gr) { kind[j] = 2; blockInfo.push({ x: nx, z: nz, fy, reason: 'no-floor' }); continue; }
      if (Math.abs(gr.y - fy) > STEP) {
        if (kind[j] === 0) { kind[j] = 2; blockInfo.push({ x: nx, z: nz, fy, reason: 'height', dy: +(gr.y - fy).toFixed(2) }); }
        continue;
      }
      const hits = blockers(nx, nz, gr.y);
      if (hits.length) {
        kind[j] = 2;
        blockInfo.push({ x: nx, z: nz, fy: gr.y, reason: 'collider', n: hits.length,
                         doors: hits.filter(h => h.door).map(h => h.door),
                         tags: hits.filter(h => h.tag).map(h => h.tag) });
        continue;
      }
      feet[j] = gr.y; kind[j] = 1; q.push([jx, jz]);
    }
  }

  // ghost pass-through test: visible meshes intersecting visited capsules
  // where NO collider blocked the cell
  const ghostHits = new Map(); // meshId -> count
  const ENV_MIN = 40; // sky dome / stars / moon are environment, not ghosts
  const meshBoxes = scan.meshes.map(m => ({
    min: m.min, max: m.max,
    env: Math.max(...m.size) > ENV_MIN || m.matType === 'ShaderMaterial' || m.matType === 'PointsMaterial',
  }));
  for (let jz = 0; jz < NZ; jz++) for (let ix = 0; ix < NX; ix++) {
    const j = idx(ix, jz);
    if (kind[j] !== 1) continue;
    const x = X0 + ix * CELL, z = Z0 + jz * CELL, fy = feet[j];
    const cap = capBox(x, z, fy);
    for (let mi = 0; mi < meshBoxes.length; mi++) {
      const mb = meshBoxes[mi];
      if (mb.env) continue;
      const top = mb.max[1], bot = mb.min[1];
      if (top < fy + 0.30 || bot > fy + BODY) continue; // step-height or head-height
      if (boxHitsCapsule(mb, cap)) {
        ghostHits.set(mi, (ghostHits.get(mi) || 0) + 1);
      }
    }
  }

  // open-space audit: visited cells outside every room rect (2D check)
  const rooms = world.rooms;
  const openCells = [];
  for (let jz = 0; jz < NZ; jz++) for (let ix = 0; ix < NX; ix++) {
    const j = idx(ix, jz);
    if (kind[j] !== 1) continue;
    const x = X0 + ix * CELL, z = Z0 + jz * CELL, fy = feet[j];
    let inside = false;
    for (const r of rooms) {
      if (x >= r.min[0] - 0.2 && x <= r.max[0] + 0.2 &&
          z >= r.min[2] - 0.2 && z <= r.max[2] + 0.2 &&
          fy >= r.min[1] - 0.6 && fy <= r.max[1] + 0.6) { inside = true; break; }
    }
    if (!inside) openCells.push([+x.toFixed(2), +z.toFixed(2), +fy.toFixed(2)]);
  }

  // invisible-wall audit: blocked cells whose blocking collider has no
  // visible mesh nearby (within 0.6m of the collider surface)
  const invisible = [];
  for (const b of blockInfo.filter(b => b.reason === 'collider')) {
    if (b.doors.length) continue; // door leaves are expected blockers
    const cap = capBox(b.x, b.z, b.fy);
    let seenMesh = false;
    for (const mb of meshBoxes) {
      if (mb.env) continue;
      if (mb.max[1] < b.fy + 0.3 || mb.min[1] > b.fy + BODY) continue;
      if (boxHitsCapsule(mb, [cap[0] - 0.6, cap[1] + 0.6, cap[2], cap[3], cap[4] - 0.6, cap[5] + 0.6])) { seenMesh = true; break; }
    }
    if (!seenMesh) invisible.push({ x: b.x, z: b.z, fy: +b.fy.toFixed(2), tags: b.tags });
  }

  return {
    grid: { NX, NZ, CELL, X0, Z0 },
    seeds, visited,
    blocked: blockInfo.length,
    ghostHits: [...ghostHits.entries()].map(([mi, n]) => [mi, n]),
    openCells, invisible,
  };
}"""

DOOR_TOUCH_JS = r"""(scan) => {
  // which elements touch each door: leaf box OR threshold volume
  const out = {};
  for (const d of scan.doors) {
    const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
    const cx = d.pos[0] + c * d.width / 2 * (d.kind === 'hinge' ? 1 : 0);
    const cz = d.pos[2] - s * d.width / 2 * (d.kind === 'hinge' ? 1 : 0);
    const thr = {
      min: [d.pos[0] - d.width / 2 - 0.35, d.pos[1], d.pos[2] - d.width / 2 - 0.35],
      max: [d.pos[0] + d.width / 2 + 0.35, d.pos[1] + (d.height || 2.2), d.pos[2] + d.width / 2 + 0.35],
    };
    const leaf = d.leaf;
    const touch = [];
    for (const m of scan.meshes) {
      if (!m.visible) continue;
      const ov = (b) =>
        m.min[0] < b.max[0] && m.max[0] > b.min[0] &&
        m.min[1] < b.max[1] && m.max[1] > b.min[1] &&
        m.min[2] < b.max[2] && m.max[2] > b.min[2];
      const parts = [];
      if (ov(thr)) parts.push('threshold');
      if (ov(leaf)) parts.push('leaf');
      if (parts.length) touch.push({ id: m.id, name: m.name, parts,
        size: m.size, opacity: m.opacity, transparent: m.transparent,
        luma: m.luma, min: m.min, max: m.max });
    }
    out[d.id] = touch;
  }
  return out;
}"""


def main():
    pw, browser = launch()
    errors = []
    try:
        page = browser.new_page(viewport={"width": 960, "height": 540})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_function("() => window.swQA && window.swQA.ready().loaded", timeout=60000)
        page.evaluate("() => window.swQA.start(false)")
        page.wait_for_function("() => window.swQA.ready().started", timeout=30000)
        page.wait_for_timeout(1200)
        page.evaluate("() => { window.gameBox3 = window.game.scene.children && window.game.world.colliders[0].box.constructor; }")

        scan = page.evaluate(ENUM_JS)
        probe = page.evaluate(PROBE_JS, scan)
        doorTouch = page.evaluate(DOOR_TOUCH_JS, scan)

        report = {"scan": scan, "probe": probe, "doorTouch": doorTouch, "consoleErrors": errors}
        with open(OUT, "w") as f:
            json.dump(report, f)
        stderr(f"wrote {OUT}")

        # ---- classification summary -------------------------------------
        meshes = scan["meshes"]
        colliders = scan["colliders"]
        bnd = scan["bounds"]

        def cov(m):
            """does any active collider meaningfully cover this mesh box?"""
            mvol = max(1e-9, m["size"][0] * m["size"][1] * m["size"][2])
            best = 0.0
            for c in colliders:
                if not c["active"]:
                    continue
                ox = min(m["max"][0], c["max"][0]) - max(m["min"][0], c["min"][0])
                oy = min(m["max"][1], c["max"][1]) - max(m["min"][1], c["min"][1])
                oz = min(m["max"][2], c["max"][2]) - max(m["min"][2], c["min"][2])
                if ox > 0 and oy > 0 and oz > 0:
                    best = max(best, ox * oy * oz / mvol)
            return best

        ghostIds = {mi: n for mi, n in probe["ghostHits"]}
        rows = []
        for m in meshes:
            if not m["visible"] or m["type"] == "points":
                continue
            coverage = cov(m)
            wallish = max(m["size"]) > 0.9 and m["size"][1] > 0.5
            faint = m["transparent"] and m["opacity"] < 0.9
            dark = (m["luma"] is not None and m["luma"] < 0.12)
            outside = (m["min"][0] < bnd["x"][0] - 0.6 or m["max"][0] > bnd["x"][1] + 0.6 or
                       m["min"][2] < bnd["z"][0] - 0.6 or m["max"][2] > bnd["z"][1] + 0.6)
            walked = m["id"] in ghostIds
            rows.append({
                "id": m["id"], "name": m["name"], "size": m["size"],
                "coverage": round(coverage, 3), "opacity": m["opacity"],
                "transparent": m["transparent"], "luma": m["luma"],
                "canvasTex": m["canvasTex"], "wallish": wallish,
                "faint": faint, "dark": dark, "outside": outside,
                "walkedThrough": walked, "walkCells": ghostIds.get(m["id"], 0),
            })

        # candidates: no collider coverage + visible + (walked-through OR
        # (wallish AND (dark OR faint OR outside))) and not a text sign
        cands = [r for r in rows if r["coverage"] < 0.25 and not r["canvasTex"] and
                 (r["walkedThrough"] or (r["wallish"] and (r["dark"] or r["faint"] or r["outside"])))]
        cands.sort(key=lambda r: (-r["walkCells"], -max(r["size"])))

        summary = {
            "meshes": len(meshes), "colliders": len(colliders),
            "visitedCells": probe["visited"], "blocked": probe["blocked"],
            "openCells": len(probe["openCells"]),
            "invisibleWallCells": len(probe["invisible"]),
            "candidates": cands[:40],
            "doorTouch": {k: v for k, v in doorTouch.items() if v},
        }
        print(json.dumps(summary, indent=1))
        stderr(f"console errors: {len(errors)}")
    finally:
        browser.close()
        pw.stop()


if __name__ == "__main__":
    main()
