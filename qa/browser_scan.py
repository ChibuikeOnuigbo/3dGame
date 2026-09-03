#!/usr/bin/env python3
"""Browser ground-truth scan for Hollow Current (real dimensions, real overlap).

Loads the real game in Chromium, then measures every placed prop's real
world-space AABB (geometry bounding box x matrixWorld) and reports:
  - every prop's actual width x height x depth and position
  - prop<->prop overlap (penetration per axis) between distinct props
  - prop penetration into walls (against world.solids)
  - floating props (base above floor with nothing beneath)
  - door behavior (closed blocks / interact opens / open passes)
  - collision sanity samples
"""
import json
import os
import threading
import functools
import http.server
import socketserver
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
OUT = ROOT / "qa"
CHROMIUM = "/tmp/chromium"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

PORT = [0]

def serve():
    with socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=GAME)) as h:
        PORT[0] = h.server_address[1]
        h.serve_forever()

threading.Thread(target=serve, daemon=True).start()
while PORT[0] == 0:
    pass

env = dict(os.environ)
env.update({
    "LD_LIBRARY_PATH": "/tmp/al2023/lib:" + env.get("LD_LIBRARY_PATH", ""),
    "FONTCONFIG_PATH": "/tmp/fonts",
    "VK_ICD_FILENAMES": "/tmp/vk_swiftshader_icd.json",
})

args = [
    "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
    "--ignore-gpu-blocklist", "--in-process-gpu",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--disable-web-security",
    "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
    "--enable-features=SharedArrayBuffer", "--font-render-hinting=none",
    "--hide-scrollbars", "--mute-audio",
]

SCAN_JS = r"""
() => {
  const world = window.__hcWorld;
  const scene = world.scene;
  const R = {};
  scene.updateMatrixWorld(true);

  function aabbOf(o) {
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox, m = o.matrixWorld.elements;
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    for (const sx of [b.min.x,b.max.x]) for (const sy of [b.min.y,b.max.y]) for (const sz of [b.min.z,b.max.z]) {
      const x=m[0]*sx+m[4]*sy+m[8]*sz+m[12], y=m[1]*sx+m[5]*sy+m[9]*sz+m[13], z=m[2]*sx+m[6]*sy+m[10]*sz+m[14];
      if (x<mn[0])mn[0]=x; if (x>mx[0])mx[0]=x;
      if (y<mn[1])mn[1]=y; if (y>mx[1])mx[1]=y;
      if (z<mn[2])mn[2]=z; if (z>mx[2])mx[2]=z;
    }
    return { minx:mn[0], maxx:mx[0], miny:mn[1], maxy:mx[1], minz:mn[2], maxz:mx[2], sx:mx[0]-mn[0], sy:mx[1]-mn[1], sz:mx[2]-mn[2] };
  }
  function unionAABB(root) {
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    root.traverse((o)=>{ if(!o.isMesh||o.visible===false)return; const a=aabbOf(o); if(a.sx<=0||a.sy<=0||a.sz<=0)return;
      for(let k=0;k<3;k++){ if(a.minx<mn[0])mn[0]=a.minx; if(a.miny<mn[1])mn[1]=a.miny; if(a.minz<mn[2])mn[2]=a.minz;
        if(a.maxx>mx[0])mx[0]=a.maxx; if(a.maxy>mx[1])mx[1]=a.maxy; if(a.maxz>mx[2])mx[2]=a.maxz; } });
    if (mn[0]===1e9) return null;
    return { minx:mn[0], maxx:mx[0], miny:mn[1], maxy:mx[1], minz:mn[2], maxz:mx[2], sx:mx[0]-mn[0], sy:mx[1]-mn[1], sz:mx[2]-mn[2] };
  }

  const props = [];
  for (const c of scene.children) {
    if (c.userData && c.userData.hcProp) {
      const a = unionAABB(c);
      if (!a) continue;
      props.push({ id: c.userData.hcProp, x: c.userData.hcPos[0], y: c.userData.hcPos[1], z: c.userData.hcPos[2], ry: c.userData.hcRy, aabb: a });
    }
  }
  R.propCount = props.length;
  R.propDims = props.map((p) => ({ id:p.id, x:+p.x.toFixed(1), y:+p.y.toFixed(2), z:+p.z.toFixed(1),
    w:+p.aabb.sx.toFixed(2), h:+p.aabb.sy.toFixed(2), d:+p.aabb.sz.toFixed(2),
    minx:+p.aabb.minx.toFixed(2), maxx:+p.aabb.maxx.toFixed(2), minz:+p.aabb.minz.toFixed(2), maxz:+p.aabb.maxz.toFixed(2),
    miny:+p.aabb.miny.toFixed(2), maxy:+p.aabb.maxy.toFixed(2) }));

  const inter = (a,b) => {
    const dx=Math.min(a.maxx,b.maxx)-Math.max(a.minx,b.minx);
    const dy=Math.min(a.maxy,b.maxy)-Math.max(a.miny,b.miny);
    const dz=Math.min(a.maxz,b.maxz)-Math.max(a.minz,b.minz);
    if (dx<=0||dy<=0||dz<=0) return [0,0,0,0];
    return [dx,dy,dz,dx*dy*dz];
  };

  const overlaps = [];
  for (let i=0;i<props.length;i++) for (let k=i+1;k<props.length;k++) {
    const a=props[i].aabb, b=props[k].aabb;
    const [dx,dy,dz,v]=inter(a,b);
    if (dx>0.05 && dz>0.05 && dy>0.05) overlaps.push({
      a:props[i].id, b:props[k].id, ax:+a.minx.toFixed(2), az:+a.minz.toFixed(2), bx:+b.minx.toFixed(2), bz:+b.minz.toFixed(2),
      dx:+dx.toFixed(2), dy:+dy.toFixed(2), dz:+dz.toFixed(2), vol:+v.toFixed(3) });
  }
  overlaps.sort((p,q)=>q.vol-p.vol);
  R.overlaps = overlaps.slice(0,300); R.overlapCount = overlaps.length;

  // true architecture walls = direct-child scene meshes that are tall & thin.
  // (world.solids also holds prop solids, so rebuild walls from the meshes.)
  const wallMeshes = [];
  for (const c of scene.children) {
    if (!c.isMesh || c.visible === false) continue;
    const a = aabbOf(c);
    if (a.sy > 1.5 && Math.min(a.sx, a.sz) < 0.4) wallMeshes.push(a);
  }
  const inWall = [];
  for (const p of props) {
    const a = p.aabb;
    for (const w of wallMeshes) {
      const [dx,dy,dz] = inter(a, w);
      if (dx>0.05 && dz>0.05 && dy>0.2) { inWall.push({ id:p.id, x:+a.minx.toFixed(1), z:+a.minz.toFixed(1), pen:+Math.min(dx,dz).toFixed(2),
        wx:+w.minx.toFixed(2), wxx:+w.maxx.toFixed(2), wz:+w.minz.toFixed(2), wzz:+w.maxz.toFixed(2) }); break; }
    }
  }
  R.inWall = inWall.slice(0,150); R.inWallCount = inWall.length;
  R.wallMeshCount = wallMeshes.length;
  R.walls = wallMeshes.map((w) => ({ minx:+w.minx.toFixed(2), maxx:+w.maxx.toFixed(2), minz:+w.minz.toFixed(2), maxz:+w.maxz.toFixed(2) }));

  const floating = [];
  for (const p of props) {
    const a = p.aabb;
    const floorY = world.floorAt(a.minx, a.minz);
    if (a.miny - floorY > 0.12) {
      let supported = false;
      for (const q of props) if (q !== p && q.aabb.maxy >= a.miny - 0.06 && q.aabb.maxy <= a.miny + 0.4 && inter(a,q.aabb)[0]>0.05 && inter(a,q.aabb)[2]>0.05) { supported=true; break; }
      if (!supported) floating.push({ id:p.id, x:+a.minx.toFixed(1), z:+a.minz.toFixed(1), base:+a.miny.toFixed(2), floor:+floorY.toFixed(2) });
    }
  }
  R.floating = floating.slice(0,150); R.floatingCount = floating.length;

  const fakePlayer = { pos: { x:0, y:0, z:0 }, vel: null, damage(){} };
  const doors = [];
  for (let i=0;i<world.doors.length;i+=2) {
    const d = world.doors[i];
    const cx=d.x, cz=d.z;
    const blockedClosed = world.blocked(cx,1.1,cz,0.35);
    const it = world.interacts.find((q)=>Math.abs(q.pos.x-cx)<0.3 && Math.abs(q.pos.z-cz)<0.3 && q.label==="Open door");
    if (it) it.fn();
    for (let s=0;s<40;s++) world.update(0.05, fakePlayer);
    const opened = Math.abs(d.angle)>0.5;
    const passable = !world.blocked(cx,1.1,cz,0.35);
    if (it) it.fn();
    for (let s=0;s<40;s++) world.update(0.05, fakePlayer);
    doors.push({ x:+cx.toFixed(1), z:+cz.toFixed(1), blockedClosed, opened, passableWhenOpen:passable, hasInteract:!!it });
  }
  R.doorTests = doors;
  R.doorBlockedClosedOk = doors.every((d)=>d.blockedClosed);
  R.doorOpensOk = doors.every((d)=>d.opened);
  R.doorPassableOk = doors.every((d)=>d.passableWhenOpen);
  R.doorInteractOk = doors.every((d)=>d.hasInteract);

  R.collision = {
    corridorOpen: !world.blocked(0,1.1,-10,0.35),
    westContainSolid: world.blocked(-40.8,1.1,-40,0.35),
    floorAtSpawn: world.floorAt(0,8),
  };
  return R;
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=args, env=env, timeout=120_000)
    page = browser.new_page(viewport={"width": 960, "height": 540})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"http://127.0.0.1:{PORT[0]}/index.html", wait_until="domcontentloaded", timeout=120_000)
    page.wait_for_function("() => window.__hcReady === true", timeout=90_000)
    page.wait_for_function("() => window.__hcProps !== undefined", timeout=120_000)
    page.evaluate("() => { window.hcQA.start(); window.hcQA.enemies(false); }")
    page.wait_for_timeout(500)
    res = page.evaluate(SCAN_JS)
    res["console_errors"] = errs[:10]
    out = OUT / "browser_scan.json"
    out.write_text(json.dumps(res, indent=2))
    print(json.dumps({
        "propCount": res["propCount"],
        "overlapCount": res["overlapCount"], "inWallCount": res["inWallCount"], "floatingCount": res["floatingCount"],
        "doors": len(res["doorTests"]),
        "doorBlockedClosedOk": res["doorBlockedClosedOk"], "doorOpensOk": res["doorOpensOk"],
        "doorPassableOk": res["doorPassableOk"], "doorInteractOk": res["doorInteractOk"],
        "collision": res["collision"], "console_errors": res["console_errors"],
    }, indent=2))
    browser.close()

print(f"\nwrote {OUT / 'browser_scan.json'}")
