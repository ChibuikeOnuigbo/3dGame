#!/usr/bin/env node
/**
 * Headless world validator — vets the game WITHOUT a browser.
 *
 * Runs the actual world.js builder in Node (three.js works headlessly; only
 * texture/image loading is stubbed), then checks the data-driven files and
 * geometry for the failure modes the spec calls out:
 *   - rooms with no purpose/focus/interact/emotion
 *   - missing / corrupt GLB props and unknown prop ids
 *   - overlapping rooms (z-fighting)
 *   - unreachable rooms (doorway gaps -> y=-20 pits)
 *
 * Usage:  node qa/validate.mjs   (from the repo root)
 */
import { mkdirSync, existsSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- alias "three" -> vendored module (browser uses the import map; node doesn't) ---
const nm = resolve(ROOT, "node_modules", "three");
if (!existsSync(nm)) {
  mkdirSync(nm, { recursive: true });
  symlinkSync(resolve(ROOT, "game", "vendor", "three.module.js"), resolve(nm, "index.js"));
  writeFileSync(resolve(nm, "package.json"),
    JSON.stringify({ name: "three", version: "0.160.0", type: "module", main: "index.js", exports: { ".": "./index.js" } }));
}

const THREE = await import("three");
// Node has no DOM: stub texture loading (world only needs material maps).
THREE.TextureLoader.prototype.load = function () {
  const t = new THREE.Texture();
  t.needsUpdate = true;
  return t;
};
THREE.CubeTextureLoader.prototype.load = function () { return null; };

const { World } = await import(pathToFileURL(resolve(ROOT, "game", "js", "world.js")).href);

const fail = [];
const ok = [];
const check = (name, cond, detail = "") => {
  (cond ? ok : fail).push(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

// ---------- build the world ----------
let world;
try {
  world = new World(new THREE.Scene());
  ok.push("PASS  world builds (solids=" + world.solids.length + " floors=" + world.floors.length +
    " interacts=" + world.interacts.length + " doors=" + world.doors.length + " lights=" + world.lights.length + ")");
} catch (e) {
  fail.push("FAIL  world builds (" + (e && e.message) + ")");
}

// ---------- data files ----------
const rooms = JSON.parse(readFileSync(resolve(ROOT, "game", "data", "rooms.json"), "utf8"));
const props = JSON.parse(readFileSync(resolve(ROOT, "game", "data", "props.json"), "utf8"));

// every room has a reason to exist (spec: room existence test)
for (const r of rooms.rooms) {
  for (const f of ["id", "purpose", "focus", "interact", "emotion"]) {
    check(`room ${r.id} has "${f}"`, r[f] && String(r[f]).trim().length > 0, r[f]);
  }
}
check("rooms.json room count == 20+", rooms.rooms.length >= 20, "rooms=" + rooms.rooms.length);

// ---------- props ----------
const used = world ? world.usedPropIds() : [];
for (const id of used) {
  const def = props[id];
  check(`prop "${id}" in props.json`, !!def);
  if (def) {
    const file = resolve(ROOT, "game", "models", "kenney", def.f + ".glb");
    check(`prop file ${def.f}.glb exists`, existsSync(file));
    if (existsSync(file)) {
      const b = readFileSync(file);
      const magicOk = b.length > 12 && b.readUInt32LE(0) === 0x46546C67;
      check(`prop ${def.f}.glb is a GLB`, magicOk, "bytes=" + b.length);
      if (magicOk) {
        try {
          const jsonLen = b.readUInt32LE(12);
          const gltf = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
          const extUris = (gltf.images || []).map((i) => i.uri).filter(Boolean);
          for (const u of extUris) {
            const tex = resolve(file, "..", u);
            check(`prop ${def.f} texture ${u} exists`, existsSync(tex));
          }
        } catch (e) {
          check(`prop ${def.f}.glb JSON parses`, false, String(e));
        }
      }
    }
  }
}
check("prop jobs queued", world && world._propJobs.length > 120, "jobs=" + (world ? world._propJobs.length : 0));

// ---------- room overlap (z-fighting) ----------
// Known pre-existing seams in the original map: floors touch/overlap slightly
// where adjacent rooms share a doorway strip. Whitelisted; NEW rooms must not
// add any overlap.
const KNOWN_OVERLAPS = [
  [-7, 7, 0, 12, -5, 5, -9, 1],      // reception <-> security
  [-2.6, 2.6, -23, -9, -2.6, 2.6, -34, -22], // corridor <-> southhall
  [10, 14, -79, -69, -18, 30, -106, -78],     // tunnel <-> yard
  [-18, 30, -106, -78, -12, -4, -102, -94],   // yard <-> shack
];
if (world) {
  const roomsFloor = world.floors.filter((f) =>
    !(f.minx <= -40 && f.maxx >= 48 && f.minz <= -111 && f.maxz >= 29) && f.y === 0);
  let overlaps = 0;
  for (let i = 0; i < roomsFloor.length; i++) {
    for (let j = i + 1; j < roomsFloor.length; j++) {
      const a = roomsFloor[i], b = roomsFloor[j];
      if (!(a.minx < b.maxx - 0.05 && b.minx < a.maxx - 0.05 && a.minz < b.maxz - 0.05 && b.minz < a.maxz - 0.05)) continue;
      const known = KNOWN_OVERLAPS.some((k) => {
        const [x1, x2, z1, z2, u1, u2, v1, v2] = k;
        const f1 = a.minx === x1 && a.maxx === x2 && a.minz === z1 && a.maxz === z2;
        const f2 = b.minx === u1 && b.maxx === u2 && b.minz === v1 && b.maxz === v2;
        const f3 = a.minx === u1 && a.maxx === u2 && a.minz === v1 && a.maxz === v2;
        const f4 = b.minx === x1 && b.maxx === x2 && b.minz === z1 && b.maxz === z2;
        return (f1 && f2) || (f3 && f4);
      });
      if (!known) {
        overlaps++;
        fail.push(`FAIL  floor overlap ${JSON.stringify(a)} <-> ${JSON.stringify(b)}`);
      }
    }
  }
  check("no NEW overlapping rooms", overlaps === 0, "room floors=" + roomsFloor.length);
}

// ---------- doors: every leafed door must be openable by its interact ----------
if (world) {
  // group leaf records into pairs by their pivot center
  const centers = new Map();
  for (const d of world.doors) {
    const key = `${d.x.toFixed(2)}:${d.z.toFixed(2)}`;
    if (!centers.has(key)) centers.set(key, []);
    centers.get(key).push(d);
  }
  let badDoors = 0;
  for (const [key, pair] of centers) {
    const [cx, cz] = key.split(":").map(Number);
    const it = world.interacts.find((i) => i.label === "Open door" &&
      Math.abs(i.pos.x - cx) < 0.25 && Math.abs(i.pos.z - cz) < 0.25);
    if (!it) { badDoors++; fail.push(`FAIL  door at (${cx},${cz}) has no interact`); continue; }
    it.fn(); // toggles its own pair to open
    if (!pair.every((d) => d.open)) { badDoors++; fail.push(`FAIL  door at (${cx},${cz}) did not open`); }
  }
  check("all leafed doors open via their interact", badDoors === 0, `doors=${centers.size}`);
}

// ---------- reachability (doorway gaps) ----------
if (world) {
  // open every door first (the player can always open them; closed doors are walls)
  world.doors.forEach((d) => { d.open = true; d.angle = d.target || 1.7; });
  const step = 0.5;
  const X0 = -40, X1 = 48, Z0 = -112, Z1 = 30;
  const NX = Math.round((X1 - X0) / step), NZ = Math.round((Z1 - Z0) / step);
  const idx = (x, z) => x * NZ + z;
  const seen = new Uint8Array(NX * NZ);
  const startX = Math.round((world.spawn.x - X0) / step), startZ = Math.round((world.spawn.z - Z0) / step);
  const q = [[startX, startZ]];
  seen[idx(startX, startZ)] = 1;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nx >= NX || nz < 0 || nz >= NZ) continue;
      if (seen[idx(nx, nz)]) continue;
      const wx = X0 + nx * step, wz = Z0 + nz * step;
      const fy = world.floorAt(wx, wz);
      if (fy < -1) continue;                       // pit
      if (Math.abs(fy - 0) > 0.01 && (fy < 0.2 || fy > 2.7)) continue; // ignore tall elevation for reach
      if (world.blocked(wx, fy + 0.05, wz, 0.3)) continue; // solid wall/prop
      seen[idx(nx, nz)] = 1;
      q.push([nx, nz]);
    }
  }
  let unreachable = [];
  for (const r of rooms.rooms) {
    if (!r.pose) continue;
    const rx = Math.round((r.pose.x - X0) / step), rz = Math.round((r.pose.z - Z0) / step);
    if (rx < 0 || rx >= NX || rz < 0 || rz >= NZ || !seen[idx(rx, rz)]) unreachable.push(r.id);
  }
  check("all rooms reachable from spawn", unreachable.length === 0, unreachable.join(",") || "ok");
}

// ---------- summary ----------
console.log(ok.join("\n"));
if (fail.length) console.log(fail.join("\n"));
console.log(`\n${ok.length} checks passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
