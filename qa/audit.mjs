#!/usr/bin/env node
/**
 * Asset & layout audit for Hollow Current (no renderer, no DOM).
 *
 * Computes every GLB's AABB from its POSITION accessor min/max (stored in the
 * glTF JSON), so textured/embedded models load fine headlessly.
 *
 * Outputs:
 *   PART A — mono (flat single-color) GLBs
 *   PART B — real-world sizes of key furniture (for scaling decisions)
 *   PART C — placed-prop layout: in-wall (with the offending solid), solid
 *            prop<->prop overlap, floating, tiny
 *
 * Usage: node qa/audit.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KENNEY = resolve(ROOT, "game", "models", "kenney");
const PROPS = JSON.parse(readFileSync(resolve(ROOT, "game", "data", "props.json"), "utf8"));
const { World } = await import(pathToFileURL(resolve(ROOT, "game", "js", "world.js")).href);

// ---- GLB JSON parsing ----
function parseGlb(path) {
  const b = readFileSync(path);
  if (b.length <= 12 || b.readUInt32LE(0) !== 0x46546C67) return null;
  const jl = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + jl).toString("utf8"));
}
const quant = (c) => Math.round(c * 8) / 8;

// model AABB from POSITION accessor min/max
function localAABB(gltf) {
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of gltf.meshes || []) for (const p of m.primitives || []) {
    const ai = p.attributes?.POSITION;
    if (ai == null) continue;
    const acc = gltf.accessors[ai];
    if (!acc?.min || !acc?.max) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], acc.min[k]);
      max[k] = Math.max(max[k], acc.max[k]);
    }
  }
  if (min[0] === Infinity) return null;
  return { min, max };
}

// material info
function matInfo(gltf) {
  const colors = new Set();
  let textured = false, vcol = false;
  for (const m of gltf.meshes || []) for (const p of m.primitives || []) {
    if (p.attributes?.COLOR_0 != null) vcol = true;
    const mat = p.material != null ? gltf.materials[p.material] : null;
    if (!mat) continue;
    if (mat.pbrMetallicRoughness?.baseColorTexture != null || mat.emissiveTexture != null || mat.normalTexture != null) textured = true;
    if (mat.pbrMetallicRoughness?.baseColorFactor) {
      const [r, g, b] = mat.pbrMetallicRoughness.baseColorFactor;
      colors.add(`${quant(r)},${quant(g)},${quant(b)}`);
    }
  }
  return { colors: colors.size, textured, vcol };
}

// ---- world ----
const scene = await (async () => (await import("three")).Scene)();
const THREE = await import("three");
THREE.TextureLoader.prototype.load = function () { const t = new THREE.Texture(); t.needsUpdate = true; return t; };
const world = new World(new THREE.Scene());
const archSolids = world.solids.map((s) => ({ ...s, tag: "wall" }));

// world AABB of a prop at (x, y, z) with yaw ry and scale s.
// PropLibrary.place() transforms each vertex as:  world = R_y(ry) * S(s) * local,
// then positions the clone at (x, y - min.y*s, z). So the true world AABB is the
// 8 local min/max corners scaled, rotated about Y, then translated. This keeps
// the model's LOCAL x/z offset (models are not origin-centred), which the old
// centred approximation dropped — it missed real overlaps.
function worldBox(def, x, y, z, ry, s) {
  const g = parseGlb(resolve(KENNEY, def.f + ".glb"));
  const la = localAABB(g);
  if (!la) return null;
  const c = Math.cos(ry), si = Math.sin(ry);
  const lift = la.min[1] * s;
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const lx of [la.min[0], la.max[0]]) for (const ly of [la.min[1], la.max[1]]) for (const lz of [la.min[2], la.max[2]]) {
    const wx = lx * s, wy = ly * s, wz = lz * s;
    const px = x + wx * c - wz * si;
    const py = y + wy - lift;
    const pz = z + wx * si + wz * c;
    if (px < minx) minx = px; if (px > maxx) maxx = px;
    if (py < miny) miny = py; if (py > maxy) maxy = py;
    if (pz < minz) minz = pz; if (pz > maxz) maxz = pz;
  }
  return { minx, maxx, miny, maxy, minz, maxz, w: maxx - minx, h: maxy - miny, d: maxz - minz };
}
const aabbOverlap = (a, b) => a.minx < b.maxx && b.minx < a.maxx && a.miny < b.maxy && b.miny < a.maxy && a.minz < b.maxz && b.minz < a.maxz;
const penXY = (a, b) => Math.min(Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx), Math.min(a.maxz, b.maxz) - Math.max(a.minz, b.minz));

// ---- PART A: mono GLBs ----
const glbInfo = {};
for (const [id, def] of Object.entries(PROPS)) {
  const g = parseGlb(resolve(KENNEY, def.f + ".glb"));
  if (!g) continue;
  const mi = matInfo(g);
  glbInfo[id] = { ...mi, mono: !mi.textured && !mi.vcol && mi.colors <= 1 };
}

// ---- PART B: furniture sizes (at current scale s in props.json) ----
console.log("=== PART B: furniture real-world sizes (current scale) ===");
const sizeIds = ["desk", "deskCorner", "table", "tableCloth", "tableCoffeeGlass", "sideTable", "bedSingle",
  "kitchenFridge", "kitchenStove", "kitchenSink", "kitchenCabinetUpperDouble", "benchCushionLow",
  "bookcaseClosedDoors", "chairCushion", "stoolBar", "loungeSofaLong", "loungeChair", "workbench", "machine", "barrel"];
for (const id of sizeIds) {
  const def = PROPS[id];
  if (!def) continue;
  const g = parseGlb(resolve(KENNEY, def.f + ".glb"));
  const la = localAABB(g);
  const s = def.s ?? 1;
  const w = (la.max[0] - la.min[0]) * s, h = (la.max[1] - la.min[1]) * s, d = (la.max[2] - la.min[2]) * s;
  console.log(`  ${id.padEnd(26)} ${w.toFixed(2)} x ${h.toFixed(2)} x ${d.toFixed(2)}  (top=${(la.max[1]*s).toFixed(2)})`);
}

// ---- PART C: placed layout audit ----
const placed = [];
const reports = { mono: [], inWall: [], overlap: [], floating: [], tiny: [] };
for (const j of world._propJobs) {
  const def = PROPS[j.id];
  if (!def) continue;
  const s = j.opts?.s ?? def.s ?? 1;
  const bb = worldBox(def, j.x, j.y, j.z, j.ry, s);
  if (!bb) { reports.mono.push(`${j.id} [no bounds]`); continue; }
  placed.push({ id: j.id, bb, x: j.x, z: j.z, solid: def.solid, y: j.y });
  if (glbInfo[j.id]?.mono) reports.mono.push(j.id);
  // in-wall (only against real walls — skip floor/containment slabs whose top is at floor level)
  for (const w of archSolids) {
    if (w.maxy <= 0.5) continue;
    if (aabbOverlap(bb, w)) {
      const p = penXY(bb, w);
      if (p > 0.14) { reports.inWall.push(`${j.id} @(${j.x.toFixed(1)},${j.z.toFixed(1)}) pen=${p.toFixed(2)} vs solid[${w.minx.toFixed(1)}..${w.maxx.toFixed(1)},${w.minz.toFixed(1)}..${w.maxz.toFixed(1)}]`); break; }
    }
  }
  // floating (base above floor, nothing solid directly beneath).
  // Wall-/ceiling-mounted props are exempt — they are meant to be elevated.
  const MOUNTED = new Set([
    "screen-hanging-small", "screen-hanging-wide", "screen-wide", "bathroomMirror",
    "bathroomSink", "warning-orange", "warning-traffic", "lever-single", "lever-double",
    "kitchenCabinetUpperDouble", "lampWall", "lampSquareCeiling",
  ]);
  const floor = world.floorAt(j.x, j.z);
  if (bb.miny - floor > 0.12 && !MOUNTED.has(j.id)) {
    let supported = false;
    for (const w of [...archSolids, ...placed.map((q) => q.bb)]) {
      if (w.maxy >= bb.miny - 0.06 && w.maxy <= bb.miny + 0.3 && aabbOverlap({ ...bb, miny: bb.miny - 0.3 }, w)) { supported = true; break; }
    }
    if (!supported) reports.floating.push(`${j.id} @(${j.x.toFixed(1)},${j.z.toFixed(1)}) base=${bb.miny.toFixed(2)} floor=${floor.toFixed(2)}`);
  }
  if (Math.max(bb.w, bb.h, bb.d) < 0.45) reports.tiny.push(`${j.id} ${bb.w.toFixed(2)}x${bb.h.toFixed(2)}x${bb.d.toFixed(2)}`);
}
// prop-prop overlap (solid). Vertical stacking (one prop resting directly on
// another at the same x/z) is intentional and skipped.
for (let i = 0; i < placed.length; i++) for (let k = i + 1; k < placed.length; k++) {
  const a = placed[i], b = placed[k];
  if (!a.solid || !b.solid) continue;
  const xzSame = Math.abs(a.x - b.x) < 0.1 && Math.abs(a.z - b.z) < 0.1;
  const yGap = Math.min(a.bb.maxy, b.bb.maxy) - Math.max(a.bb.miny, b.bb.miny);
  if (xzSame && yGap < 0.12) continue; // stacked
  if (aabbOverlap(a.bb, b.bb)) {
    const p = penXY(a.bb, b.bb);
    if (p > 0.08) reports.overlap.push(`${a.id} @(${a.x.toFixed(1)},${a.z.toFixed(1)}) <-> ${b.id} @(${b.x.toFixed(1)},${b.z.toFixed(1)}) pen=${p.toFixed(2)}`);
  }
}

console.log("\n=== PART C1: mono placed ===");
[...new Set(reports.mono)].forEach((r) => console.log("  MONO", r));
console.log("\n=== PART C2: in-wall ===");
reports.inWall.forEach((r) => console.log("  INWALL", r));
console.log("\n=== PART C3: prop overlap ===");
reports.overlap.forEach((r) => console.log("  OVERLAP", r));
console.log("\n=== PART C4: floating ===");
reports.floating.forEach((r) => console.log("  FLOAT", r));
console.log("\n=== PART C5: tiny ===");
reports.tiny.forEach((r) => console.log("  TINY", r));
console.log(`\nSUMMARY: ${Object.keys(glbInfo).length} GLBs, ${Object.values(glbInfo).filter((i) => i.mono).length} mono; ` +
  `${reports.inWall.length} in-wall, ${reports.overlap.length} overlaps, ${reports.floating.length} floating, ${reports.tiny.length} tiny (placed=${placed.length}).`);
