import * as THREE from "three";
import { makeLibrary, kelvinRGB, lumensToIntensity } from "./materials.js";

export class World {
  constructor(scene) {
    this.scene = scene;
    this.solids = [];
    this.openings = [];
    this.floors = [];
    this.interacts = [];
    this.drones = [];
    this.lights = [];
    this.debris = [];
    this.doors = [];
    this._portals = new Set();
    this.events = {};
    this.shrinkWalls = [];
    this.enemiesOn = true;
    this.flags = {
      power: false, labOpen: false, valves: [false, false, false],
      seaGate: false, crushDone: false, genOn: false, card: false,
      fuse: false, code: false, pump: false,
    };
    this.M = makeLibrary();
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    this.sph = new THREE.SphereGeometry(1, 10, 8);
    this._env();
    this._contain();
    this._build();
    this._drones();
    this.spawn = new THREE.Vector3(0, 0, 8);
  }

  _env() {
    this.scene.add(new THREE.AmbientLight(0x1a1e22, 0.22));
    const hemi = new THREE.HemisphereLight(kelvinRGB(7500), kelvinRGB(3200), 0.28);
    this.scene.add(hemi);
    this.moon = new THREE.DirectionalLight(kelvinRGB(6800), 0.18);
    this.moon.position.set(-20, 40, 8);
    this.scene.add(this.moon);
    this.scene.fog = new THREE.Fog(0x0c1014, 10, 55);
    this.scene.background = new THREE.Color(0x07090c);
  }

  /** Outer rock bowl + night dome so the player cannot leave the facility. */
  _contain() {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(72, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: this.M.rockWall.map, color: 0x1a2228, roughness: 1, side: THREE.BackSide,
      })
    );
    dome.position.set(4, -2, -40);
    this.scene.add(dome);
    // thick ring walls + floor slab under everything
    this.box(4, -1.2, -40, 90, 2.2, 140, this.M.rock, true);
    this.box(4, 8, -40, 90, 1.2, 140, this.M.rockWall, true);
    this.box(-40, 4, -40, 2.4, 14, 140, this.M.rockWall);
    this.box(48, 4, -40, 2.4, 14, 140, this.M.rockWall);
    this.box(4, 4, 32, 90, 14, 2.4, this.M.rockWall);
    this.box(4, 4, -112, 90, 14, 2.4, this.M.rockWall);
  }

  _mesh(geo, mat, x, y, z, sx, sy, sz, solid = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    this.scene.add(m);
    if (solid) {
      this.solids.push({
        minx: x - sx / 2, maxx: x + sx / 2,
        miny: y - sy / 2, maxy: y + sy / 2,
        minz: z - sz / 2, maxz: z + sz / 2,
      });
    }
    return m;
  }
  box(x, y, z, w, h, d, mat, solid = true) {
    return this._mesh(this.geo, mat, x, y, z, w, h, d, solid);
  }
  pipe(x, y, z, len, axis, mat = this.M.rust, r = 0.08) {
    const m = new THREE.Mesh(this.cyl, mat);
    m.scale.set(r, len / 2, r);
    m.position.set(x, y, z);
    if (axis === "x") m.rotation.z = Math.PI / 2;
    if (axis === "z") m.rotation.x = Math.PI / 2;
    this.scene.add(m);
    return m;
  }

  lamp(x, y, z, { lm = 800, k = 3200, type = "point", dist = 9, hue = 0, angle = 0.45 } = {}) {
    const col = kelvinRGB(k);
    if (hue) col.offsetHSL(hue, 0, 0);
    const I = lumensToIntensity(lm);
    let L;
    if (type === "spot") {
      L = new THREE.SpotLight(col, I, dist, angle, 0.4, 1.4);
      L.position.set(x, y, z);
      L.target.position.set(x, 0, z);
      this.scene.add(L.target);
    } else {
      L = new THREE.PointLight(col, I, dist, 1.6);
      L.position.set(x, y, z);
    }
    this.scene.add(L);
    this.lights.push(L);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      k < 3000 ? this.M.emitAmber : k > 4500 ? this.M.emitCool : this.M.emitWarm
    );
    bulb.position.set(x, y, z);
    this.scene.add(bulb);
    this.box(x, y + 0.08, z, 0.45, 0.06, 0.45, this.M.metal, false);
    return L;
  }

  open(x, z, w, h, axis) {
    const o = axis === "z"
      ? { minx: x - w / 2, maxx: x + w / 2, miny: 0, maxy: h, minz: z - 0.7, maxz: z + 0.7, door: null }
      : { minx: x - 0.7, maxx: x + 0.7, miny: 0, maxy: h, minz: z - w / 2, maxz: z + w / 2, door: null };
    this.openings.push(o);
    return o;
  }

  portalDoor(x, z, gap, axis, h = 2.45) {
    const key = `${axis}:${x.toFixed(2)}:${z.toFixed(2)}`;
    if (this._portals.has(key)) return null;
    this._portals.add(key);
    const thick = 0.07;
    const leafW = gap / 2 - 0.02;
    const opening = this.openings[this.openings.length - 1];
    const pair = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      if (axis === "z") pivot.position.set(x + side * (gap / 2), 0, z);
      else pivot.position.set(x, 0, z + side * (gap / 2));
      const leaf = new THREE.Mesh(this.geo, this.M.metal);
      if (axis === "z") {
        leaf.scale.set(leafW, h, thick);
        leaf.position.set(-side * leafW / 2, h / 2, 0);
      } else {
        leaf.scale.set(thick, h, leafW);
        leaf.position.set(0, h / 2, -side * leafW / 2);
      }
      const handle = new THREE.Mesh(this.geo, this.M.warn);
      handle.scale.set(0.04, 0.14, 0.05);
      if (axis === "z") handle.position.set(-side * 0.18, 1.05, thick);
      else handle.position.set(thick, 1.05, -side * 0.18);
      const window = new THREE.Mesh(this.geo, this.M.glass);
      const kick = new THREE.Mesh(this.geo, this.M.rust);
      if (axis === "z") {
        window.scale.set(leafW * 0.35, 0.45, thick + 0.02);
        window.position.set(-side * leafW / 2, 1.55, 0);
        kick.scale.set(leafW * 0.92, 0.28, thick + 0.02);
        kick.position.set(-side * leafW / 2, 0.22, 0);
      } else {
        window.scale.set(thick + 0.02, 0.45, leafW * 0.35);
        window.position.set(0, 1.55, -side * leafW / 2);
        kick.scale.set(thick + 0.02, 0.28, leafW * 0.92);
        kick.position.set(0, 0.22, -side * leafW / 2);
      }
      pivot.add(leaf, handle, window, kick);
      this.scene.add(pivot);
      const rec = { pivot, leaf, axis, side, x, z, gap, h, leafW, thick, angle: 0, target: 0, open: false, opening };
      this.doors.push(rec);
      pair.push(rec);
    }
    this.interact(x, 1.1, z, "Open door", () => {
      const willOpen = !pair[0].open;
      for (const d of pair) {
        d.open = willOpen;
        d.target = willOpen ? (d.side * Math.PI * 0.92) : 0;
      }
      return { text: willOpen ? "The latch gives." : "You pull it shut." };
    });
    if (opening) opening.door = pair[0];
    // No extra "house" around the leaf — only the existing wall jamb.
    return pair;
  }

  placeWarehouse(proto) {
    const spots = [[6.9, -12.8, 0], [7.4, -19.4, 0.4], [13.2, -12.2, -0.3]];
    for (const [x, z, yaw] of spots) {
      const m = proto.clone(true);
      m.scale.set(1, 1, 1);
      m.position.set(x, 0, z);
      m.rotation.y = yaw;
      this.scene.add(m);
    }
  }
  applyDoorMeshes(proto) {
    if (!proto) return;
    for (const d of this.doors) {
      if (d.leaf) d.leaf.visible = false;
      d.pivot.children.forEach((c) => { if (c.isMesh) c.visible = false; });
      const m = proto.clone(true);
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      const sx = d.leafW / Math.max(0.01, size.x);
      const sy = d.h / Math.max(0.01, size.y);
      const sz = (d.thick * 4) / Math.max(0.01, size.z);
      m.scale.set(sx, sy, sz);
      const c = box.getCenter(new THREE.Vector3());
      m.position.set(-d.side * d.leafW / 2 - c.x * sx, d.h / 2 - c.y * sy, -c.z * sz);
      d.pivot.add(m);
      d.gltf = m;
    }
  }

  _inDoorX(x, cx, doors, axisGap = 2.4) {
    if (!doors) return false;
    const g = doors.sw || doors.nw || 2.4;
    return Math.abs(x - cx) < g / 2 + 0.15;
  }

  /** Visible tileset: wainscot, ceramic/metal tiles, skirting, corner beads, stains. */
  _trim(cx, cz, w, d, h, wall, doors = {}) {
    const inset = 0.155;
    const zS = cz - d / 2 + inset, zN = cz + d / 2 - inset;
    const xW = cx - w / 2 + inset, xE = cx + w / 2 - inset;
    // thick skirting (reads at eye height)
    this.box(cx, 0.12, zS, w - 0.5, 0.24, 0.08, this.M.metal, false);
    this.box(cx, 0.12, zN, w - 0.5, 0.24, 0.08, this.M.metal, false);
    this.box(xW, 0.12, cz, 0.08, 0.24, d - 0.5, this.M.metal, false);
    this.box(xE, 0.12, cz, 0.08, 0.24, d - 0.5, this.M.metal, false);
    // wainscot panel 0.25–1.15m
    this.box(cx, 0.7, zS, w - 0.55, 0.95, 0.04, this.M.metal, false);
    this.box(cx, 0.7, zN, w - 0.55, 0.95, 0.04, this.M.metal, false);
    this.box(xW, 0.7, cz, 0.04, 0.95, d - 0.55, this.M.metal, false);
    this.box(xE, 0.7, cz, 0.04, 0.95, d - 0.55, this.M.metal, false);
    // dado cap
    this.box(cx, 1.18, zS, w - 0.5, 0.05, 0.07, this.M.rust, false);
    this.box(cx, 1.18, zN, w - 0.5, 0.05, 0.07, this.M.rust, false);
    this.box(xW, 1.18, cz, 0.07, 0.05, d - 0.5, this.M.rust, false);
    this.box(xE, 1.18, cz, 0.07, 0.05, d - 0.5, this.M.rust, false);
    // upper wall tiles (skip door bays)
    const tw = 0.62, th = 0.48;
    const rows = Math.min(3, Math.max(2, Math.floor((h - 1.35) / th)));
    const colsX = Math.min(8, Math.max(3, Math.floor((w - 0.8) / tw)));
    const colsZ = Math.min(8, Math.max(3, Math.floor((d - 0.8) / tw)));
    const tileMat = wall === this.M.tile ? this.M.tile : this.M.concWall;
    for (let r = 0; r < rows; r++) {
      const y = 1.42 + r * th;
      for (let c = 0; c < colsX; c++) {
        const x = cx - (colsX - 1) * tw / 2 + c * tw;
        const doorS = doors.s && Math.abs(x - cx) < (doors.sw || 2.4) / 2;
        const doorN = doors.n && Math.abs(x - cx) < (doors.nw || 2.4) / 2;
        if (!doorS) this.box(x, y, zS, tw - 0.04, th - 0.04, 0.03, tileMat, false);
        if (!doorN) this.box(x, y, zN, tw - 0.04, th - 0.04, 0.03, tileMat, false);
        // water stain / chip
        if ((c + r) % 3 === 0 && !doorS) this.box(x, y - 0.12, zS + 0.02, tw * 0.45, th * 0.35, 0.02, this.M.dirt, false);
        if ((c + r) % 4 === 1 && !doorN) this.box(x, y + 0.08, zN - 0.02, tw * 0.4, th * 0.5, 0.02, this.M.rust, false);
      }
      for (let c = 0; c < colsZ; c++) {
        const z = cz - (colsZ - 1) * tw / 2 + c * tw;
        const doorW = doors.w && Math.abs(z - cz) < (doors.ww || 2.2) / 2;
        const doorE = doors.e && Math.abs(z - cz) < (doors.ew || 2.2) / 2;
        if (!doorW) this.box(xW, y, z, 0.03, th - 0.04, tw - 0.04, tileMat, false);
        if (!doorE) this.box(xE, y, z, 0.03, th - 0.04, tw - 0.04, tileMat, false);
      }
    }
    // corner beads + vertical conduit
    for (const [x, z] of [[xW, zS], [xE, zS], [xW, zN], [xE, zN]]) {
      this.box(x, h / 2, z, 0.06, h - 0.2, 0.06, this.M.metal, false);
      this.pipe(x + (x < cx ? 0.08 : -0.08), h / 2, z + (z < cz ? 0.08 : -0.08), h - 0.4, "y", this.M.rust, 0.035);
    }
    this.box(cx, h - 0.05, cz, 0.05, 0.06, d * 0.9, this.M.metal, false);
    this.box(cx, h - 0.05, cz, w * 0.9, 0.06, 0.05, this.M.metal, false);
    // door mats
    if (doors.s) this.mat(cx, cz - d / 2 + 0.7, 1.6, 0.7);
    if (doors.n) this.mat(cx, cz + d / 2 - 0.7, 1.6, 0.7);
    if (doors.w) this.mat(cx - w / 2 + 0.7, cz, 0.7, 1.5);
    if (doors.e) this.mat(cx + w / 2 - 0.7, cz, 0.7, 1.5);
  }

  /** Clutter glued to walls so aisles stay clear. */
  _perimeter(cx, cz, w, d) {
    const m = 0.55;
    const pts = [
      [cx - w / 2 + m, cz - d / 2 + m],
      [cx + w / 2 - m, cz - d / 2 + m],
      [cx - w / 2 + m, cz + d / 2 - m],
      [cx + w / 2 - m, cz + d / 2 - m],
    ];
    pts.forEach((p, i) => {
      this.trash(p[0], p[1]);
      this.can(p[0] + 0.22, p[1] + 0.12);
      if (i % 2 === 0) this.paper(p[0] + 0.35, p[1] + 0.28, i);
    });
    const step = 2.2;
    for (let x = cx - w / 2 + 1.4; x < cx + w / 2 - 1.4; x += step) {
      this.can(x, cz - d / 2 + 0.42);
      this.paper(x + 0.3, cz + d / 2 - 0.38, x);
    }
    for (let z = cz - d / 2 + 1.6; z < cz + d / 2 - 1.6; z += step) {
      this.can(cx - w / 2 + 0.42, z);
    }
    this.cable(cx - w / 2 + 0.3, cz - d / 2 + 0.3, cx + w / 2 - 0.3, cz - d / 2 + 0.35, 0.04);
  }

  room(cx, cz, w, d, h, wall, floor, doors = {}) {
    this.box(cx, 0.04, cz, w, 0.08, d, floor, false);
    this.floors.push({ minx: cx - w / 2, maxx: cx + w / 2, minz: cz - d / 2, maxz: cz + d / 2, y: 0 });
    this.box(cx, h, cz, w, 0.1, d, this.M.concWall, false);
    const t = 0.28;
    if (!doors.s) this.box(cx, h / 2, cz - d / 2, w, h, t, wall);
    else {
      const gap = doors.sw || 2.4;
      this.box(cx - (w + gap) / 4, h / 2, cz - d / 2, (w - gap) / 2, h, t, wall);
      this.box(cx + (w + gap) / 4, h / 2, cz - d / 2, (w - gap) / 2, h, t, wall);
      this.open(cx, cz - d / 2, gap, 2.5, "z");
      this.box(cx, 2.55, cz - d / 2, gap, 0.16, 0.36, this.M.metal, false);
      this.box(cx - gap / 2, 1.25, cz - d / 2, 0.12, 2.5, 0.32, this.M.metal, false);
      this.box(cx + gap / 2, 1.25, cz - d / 2, 0.12, 2.5, 0.32, this.M.metal, false);
      if (doors.leaf !== false) this.portalDoor(cx, cz - d / 2, gap, "z");
    }
    if (!doors.n) this.box(cx, h / 2, cz + d / 2, w, h, t, wall);
    else {
      const gap = doors.nw || 2.4;
      this.box(cx - (w + gap) / 4, h / 2, cz + d / 2, (w - gap) / 2, h, t, wall);
      this.box(cx + (w + gap) / 4, h / 2, cz + d / 2, (w - gap) / 2, h, t, wall);
      this.open(cx, cz + d / 2, gap, 2.5, "z");
      this.box(cx, 2.55, cz + d / 2, gap, 0.16, 0.36, this.M.metal, false);
      this.box(cx - gap / 2, 1.25, cz + d / 2, 0.12, 2.5, 0.32, this.M.metal, false);
      this.box(cx + gap / 2, 1.25, cz + d / 2, 0.12, 2.5, 0.32, this.M.metal, false);
      if (doors.leaf !== false) this.portalDoor(cx, cz + d / 2, gap, "z");
    }
    if (!doors.w) this.box(cx - w / 2, h / 2, cz, t, h, d, wall);
    else {
      const gap = doors.ww || 2.2;
      this.box(cx - w / 2, h / 2, cz - (d + gap) / 4, t, h, (d - gap) / 2, wall);
      this.box(cx - w / 2, h / 2, cz + (d + gap) / 4, t, h, (d - gap) / 2, wall);
      this.open(cx - w / 2, cz, gap, 2.4, "x");
      this.box(cx - w / 2, 2.5, cz, 0.36, 0.16, gap, this.M.metal, false);
      this.box(cx - w / 2, 1.2, cz - gap / 2, 0.32, 2.4, 0.12, this.M.metal, false);
      this.box(cx - w / 2, 1.2, cz + gap / 2, 0.32, 2.4, 0.12, this.M.metal, false);
      if (doors.leaf !== false) this.portalDoor(cx - w / 2, cz, gap, "x");
    }
    if (!doors.e) this.box(cx + w / 2, h / 2, cz, t, h, d, wall);
    else {
      const gap = doors.ew || 2.2;
      this.box(cx + w / 2, h / 2, cz - (d + gap) / 4, t, h, (d - gap) / 2, wall);
      this.box(cx + w / 2, h / 2, cz + (d + gap) / 4, t, h, (d - gap) / 2, wall);
      this.open(cx + w / 2, cz, gap, 2.4, "x");
      this.box(cx + w / 2, 2.5, cz, 0.36, 0.16, gap, this.M.metal, false);
      this.box(cx + w / 2, 1.2, cz - gap / 2, 0.32, 2.4, 0.12, this.M.metal, false);
      this.box(cx + w / 2, 1.2, cz + gap / 2, 0.32, 2.4, 0.12, this.M.metal, false);
      if (doors.leaf !== false) this.portalDoor(cx + w / 2, cz, gap, "x");
    }
    this.box(cx, h - 0.12, cz, w * 0.98, 0.08, 0.12, this.M.metal, false);
    this._trim(cx, cz, w, d, h, wall, doors);
  }

  desk(x, z, rot = 0) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(this.geo, this.M.wood);
    top.scale.set(1.5, 0.07, 0.72); top.position.y = 0.74;
    const leg = () => {
      const m = new THREE.Mesh(this.geo, this.M.metal);
      m.scale.set(0.07, 0.74, 0.07);
      return m;
    };
    const a = leg(); a.position.set(-0.65, 0.37, -0.28);
    const b = leg(); b.position.set(0.65, 0.37, -0.28);
    const c = leg(); c.position.set(-0.65, 0.37, 0.28);
    const d = leg(); d.position.set(0.65, 0.37, 0.28);
    const mon = new THREE.Mesh(this.geo, this.M.dark);
    mon.scale.set(0.5, 0.32, 0.06); mon.position.set(0, 1.02, -0.2);
    const scr = new THREE.Mesh(this.geo, this.M.emitGreen);
    scr.scale.set(0.44, 0.26, 0.02); scr.position.set(0, 1.02, -0.17);
    const kb = new THREE.Mesh(this.geo, this.M.dark);
    kb.scale.set(0.42, 0.03, 0.16); kb.position.set(0, 0.79, 0.08);
    const mug = new THREE.Mesh(this.cyl, this.M.rust);
    mug.scale.set(0.04, 0.05, 0.04); mug.position.set(0.5, 0.82, 0.1);
    const chair = new THREE.Mesh(this.geo, this.M.dark);
    chair.scale.set(0.42, 0.5, 0.42); chair.position.set(0, 0.25, 0.65);
    g.add(top, a, b, c, d, mon, scr, kb, mug, chair);
    g.position.set(x, 0, z); g.rotation.y = rot;
    this.scene.add(g);
    this.solids.push({ minx: x - 0.8, maxx: x + 0.8, miny: 0, maxy: 0.85, minz: z - 0.45, maxz: z + 0.45 });
  }

  /** Wooden shipping crate — slats + straps, not a solid cube. */
  crate(x, z, s = 0.7) {
    const g = new THREE.Group();
    const wood = this.M.wood, strap = this.M.metal;
    const body = new THREE.Mesh(this.geo, wood);
    body.scale.set(s * 0.92, s * 0.88, s * 0.92);
    g.add(body);
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(this.geo, wood);
      slat.scale.set(s * 0.98, 0.045, s * 0.08);
      slat.position.set(0, -s * 0.35 + i * (s * 0.22), s * 0.47);
      g.add(slat);
      const slat2 = slat.clone(); slat2.position.z = -s * 0.47; g.add(slat2);
    }
    for (const sx of [-s * 0.32, s * 0.32]) {
      const band = new THREE.Mesh(this.geo, strap);
      band.scale.set(0.04, s * 0.95, s * 0.99);
      band.position.set(sx, 0, 0);
      g.add(band);
    }
    const lid = new THREE.Mesh(this.geo, wood);
    lid.scale.set(s * 0.96, 0.05, s * 0.96); lid.position.y = s * 0.46;
    g.add(lid);
    g.position.set(x, s / 2, z);
    this.scene.add(g);
    this.solids.push({ minx: x - s / 2, maxx: x + s / 2, miny: 0, maxy: s, minz: z - s / 2, maxz: z + s / 2 });
  }
  /** Cardboard carton (OGA CC0 cardboard albedo). */
  carton(x, z, s = 0.5) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(this.geo, this.M.cardboard);
    box.scale.set(s, s * 0.7, s * 0.85);
    const flap = new THREE.Mesh(this.geo, this.M.cardboard);
    flap.scale.set(s * 0.48, 0.02, s * 0.82); flap.position.set(-s * 0.12, s * 0.37, 0);
    flap.rotation.z = 0.15;
    const tape = new THREE.Mesh(this.geo, this.M.warn);
    tape.scale.set(s * 0.12, s * 0.72, 0.01); tape.position.z = s * 0.43;
    g.add(box, flap, tape);
    g.position.set(x, s * 0.35, z);
    this.scene.add(g);
    this.solids.push({ minx: x - s / 2, maxx: x + s / 2, miny: 0, maxy: s * 0.7, minz: z - s / 2, maxz: z + s / 2 });
  }
  cabinet(x, z, h = 2.1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geo, this.M.metal);
    body.scale.set(0.9, h, 0.42);
    const door = new THREE.Mesh(this.geo, this.M.rust);
    door.scale.set(0.38, h * 0.88, 0.04); door.position.set(-0.2, 0, 0.22);
    const door2 = door.clone(); door2.position.x = 0.2;
    const handle = new THREE.Mesh(this.geo, this.M.dark);
    handle.scale.set(0.04, 0.12, 0.05); handle.position.set(-0.04, 0.1, 0.26);
    const vent = new THREE.Mesh(this.geo, this.M.dark);
    vent.scale.set(0.6, 0.08, 0.03); vent.position.set(0, h * 0.4, 0.22);
    g.add(body, door, door2, handle, vent);
    g.position.set(x, h / 2, z);
    this.scene.add(g);
    this.solids.push({ minx: x - 0.45, maxx: x + 0.45, miny: 0, maxy: h, minz: z - 0.22, maxz: z + 0.22 });
  }
  workbench(x, z, w = 2.2, d = 0.9) {
    this.box(x, 0.78, z, w, 0.08, d, this.M.wood);
    this.box(x - w * 0.42, 0.38, z - d * 0.38, 0.08, 0.76, 0.08, this.M.metal);
    this.box(x + w * 0.42, 0.38, z - d * 0.38, 0.08, 0.76, 0.08, this.M.metal);
    this.box(x - w * 0.42, 0.38, z + d * 0.38, 0.08, 0.76, 0.08, this.M.metal);
    this.box(x + w * 0.42, 0.38, z + d * 0.38, 0.08, 0.76, 0.08, this.M.metal);
    this.box(x, 0.5, z, w * 0.9, 0.06, d * 0.7, this.M.metal, false);
    this.carton(x - 0.5, z - 0.05, 0.28);
  }
  toolchest(x, z) {
    this.box(x, 0.55, z, 1.3, 1.1, 0.62, this.M.metal);
    for (let i = 0; i < 4; i++) {
      this.box(x, 0.22 + i * 0.24, z + 0.32, 1.15, 0.04, 0.04, this.M.dark, false);
      this.box(x, 0.22 + i * 0.24, z + 0.34, 0.18, 0.03, 0.04, this.M.warn, false);
    }
  }
  shelf(x, z, rot = 0) {
    for (let i = 0; i < 4; i++) this.box(x, 0.35 + i * 0.48, z, 1.6, 0.05, 0.42, this.M.metal);
    this.box(x - 0.78, 1.1, z, 0.06, 2.2, 0.4, this.M.metal);
    this.box(x + 0.78, 1.1, z, 0.06, 2.2, 0.4, this.M.metal);
  }
  barrel(x, z) {
    const m = new THREE.Mesh(this.cyl, this.M.rust);
    m.scale.set(0.28, 0.5, 0.28);
    m.position.set(x, 0.5, z);
    this.scene.add(m);
    this.solids.push({ minx: x - 0.3, maxx: x + 0.3, miny: 0, maxy: 1, minz: z - 0.3, maxz: z + 0.3 });
  }
  mat(x, z, w = 1.4, d = 0.85) {
    this.box(x, 0.02, z, w, 0.035, d, this.M.dirt, false);
    this.box(x, 0.038, z, w * 0.92, 0.01, d * 0.88, this.M.rust, false);
  }
  can(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.cyl, this.M.metal);
    body.scale.set(0.055, 0.09, 0.055);
    const band = new THREE.Mesh(this.cyl, this.M.warn);
    band.scale.set(0.058, 0.025, 0.058); band.position.y = 0.02;
    const lid = new THREE.Mesh(this.cyl, this.M.rust);
    lid.scale.set(0.05, 0.012, 0.05); lid.position.y = 0.095;
    g.add(body, band, lid);
    g.position.set(x, 0.09, z);
    this.scene.add(g);
    this.debris.push({ mesh: g, vx: 0, vz: 0, vy: 0, y: 0.09, r: 0.06 });
  }
  trash(x, z) {
    const g = new THREE.Group();
    const bag = new THREE.Mesh(this.sph, this.M.dirt);
    bag.scale.set(0.16, 0.2, 0.14);
    const neck = new THREE.Mesh(this.cyl, this.M.dark);
    neck.scale.set(0.04, 0.06, 0.04); neck.position.y = 0.18;
    g.add(bag, neck);
    g.position.set(x, 0.16, z);
    this.scene.add(g);
  }
  paper(x, z, rot = 0) {
    const m = this.box(x, 0.02, z, 0.22, 0.01, 0.16, this.M.paint, false);
    m.rotation.y = rot;
  }
  cable(x1, z1, x2, z2, y = 0.03) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const m = this.box((x1 + x2) / 2, y, (z1 + z2) / 2, 0.04, 0.02, len, this.M.dark, false);
    m.rotation.y = Math.atan2(dx, dz);
  }
  sign(x, y, z, textMat) {
    this.box(x, y, z, 1.15, 0.32, 0.05, this.M.metal, false);
    this.box(x, y, z + 0.03, 1.02, 0.22, 0.02, textMat || this.M.warn, false);
  }
  /** Wall-mounted extinguisher + hose reel — grouped, not random. */
  extinguisher(x, y, z, yaw = 0) {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(this.cyl, this.M.warn);
    tank.scale.set(0.08, 0.28, 0.08); tank.position.y = 0.1;
    const cap = new THREE.Mesh(this.cyl, this.M.metal);
    cap.scale.set(0.05, 0.05, 0.05); cap.position.y = 0.4;
    const hose = new THREE.Mesh(this.geo, this.M.dark);
    hose.scale.set(0.04, 0.18, 0.04); hose.position.set(0.1, 0.15, 0);
    const board = new THREE.Mesh(this.geo, this.M.paint);
    board.scale.set(0.28, 0.7, 0.04); board.position.set(0, 0.05, -0.04);
    g.add(board, tank, cap, hose);
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);
  }
  cooler(x, z) {
    this.box(x, 0.55, z, 0.38, 1.1, 0.38, this.M.tile, false);
    this.box(x, 1.18, z, 0.32, 0.28, 0.32, this.M.glass, false);
    this.box(x, 0.08, z, 0.42, 0.06, 0.42, this.M.metal, false);
    this.can(x + 0.28, z + 0.12);
  }
  wallClock(x, y, z) {
    const m = new THREE.Mesh(this.cyl, this.M.metal);
    m.scale.set(0.16, 0.04, 0.16); m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z); this.scene.add(m);
    this.box(x, y, z + 0.03, 0.02, 0.1, 0.01, this.M.dark, false);
  }
  cork(x, y, z, yaw = 0) {
    const g = new THREE.Group();
    const board = new THREE.Mesh(this.geo, this.M.wood);
    board.scale.set(0.9, 0.7, 0.04);
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(this.geo, i % 2 ? this.M.paint : this.M.warn);
      p.scale.set(0.18, 0.22, 0.01);
      p.position.set(-0.28 + (i % 3) * 0.28, 0.12 - Math.floor(i / 3) * 0.28, 0.03);
      g.add(p);
    }
    g.add(board);
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);
  }
  plant(x, z) {
    this.box(x, 0.12, z, 0.22, 0.24, 0.22, this.M.rust, false);
    const l = new THREE.Mesh(this.sph, this.M.dirt);
    l.scale.set(0.18, 0.22, 0.16); l.position.set(x, 0.42, z); this.scene.add(l);
  }
  bin(x, z) {
    const m = new THREE.Mesh(this.cyl, this.M.metal);
    m.scale.set(0.16, 0.28, 0.16); m.position.set(x, 0.28, z); this.scene.add(m);
    this.paper(x + 0.12, z + 0.08, 0.4);
  }
  breaker(x, y, z, yaw = 0) {
    this.box(x, y, z, 0.45, 0.7, 0.12, this.M.metal, false);
    for (let i = 0; i < 6; i++) {
      this.box(x - 0.12 + (i % 2) * 0.24, y - 0.18 + Math.floor(i / 2) * 0.18, z + 0.07, 0.08, 0.1, 0.04, this.M.warn, false);
    }
  }
  firstAid(x, y, z) {
    this.box(x, y, z, 0.42, 0.32, 0.1, this.M.warn, false);
    this.box(x, y, z + 0.06, 0.12, 0.04, 0.02, this.M.paint, false);
    this.box(x, y, z + 0.06, 0.04, 0.12, 0.02, this.M.paint, false);
  }
  fluoro(x, y, z, len = 1.6) {
    this.box(x, y, z, len, 0.05, 0.12, this.M.metal, false);
    this.box(x, y - 0.04, z, len * 0.92, 0.03, 0.08, this.M.emitCool, false);
  }
  visitorChair(x, z, yaw = 0) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(this.geo, this.M.dark);
    seat.scale.set(0.42, 0.07, 0.42); seat.position.y = 0.42;
    const back = new THREE.Mesh(this.geo, this.M.dark);
    back.scale.set(0.42, 0.45, 0.06); back.position.set(0, 0.68, -0.18);
    const leg = (ox, oz) => {
      const m = new THREE.Mesh(this.geo, this.M.metal);
      m.scale.set(0.05, 0.42, 0.05); m.position.set(ox, 0.21, oz); return m;
    };
    g.add(seat, back, leg(-0.16, -0.16), leg(0.16, -0.16), leg(-0.16, 0.16), leg(0.16, 0.16));
    g.position.set(x, 0, z); g.rotation.y = yaw;
    this.scene.add(g);
  }
  printer(x, z) {
    this.box(x, 0.95, z, 0.55, 0.32, 0.48, this.M.dark, false);
    this.box(x, 0.78, z, 0.6, 0.08, 0.55, this.M.metal, false);
    this.box(x, 0.74, z + 0.1, 0.4, 0.02, 0.28, this.M.paint, false);
  }
  pegboard(x, y, z) {
    this.box(x, y, z, 1.4, 0.9, 0.05, this.M.metal, false);
    for (let i = 0; i < 8; i++) {
      this.box(x - 0.5 + (i % 4) * 0.32, y - 0.2 + Math.floor(i / 4) * 0.3, z + 0.04, 0.04, 0.22, 0.04, this.M.rust, false);
    }
  }
  clipboard(x, y, z) {
    this.box(x, y, z, 0.18, 0.02, 0.24, this.M.wood, false);
    this.box(x, y + 0.015, z, 0.14, 0.01, 0.2, this.M.paint, false);
  }
  cot(x, z) {
    this.box(x, 0.42, z, 1.9, 0.08, 0.7, this.M.paint, false);
    this.box(x - 0.85, 0.22, z, 0.06, 0.42, 0.6, this.M.metal, false);
    this.box(x + 0.85, 0.22, z, 0.06, 0.42, 0.6, this.M.metal, false);
    this.box(x, 0.48, z, 1.7, 0.06, 0.55, this.M.dirt, false);
  }

  interact(x, y, z, label, fn) {
    this.interacts.push({ pos: new THREE.Vector3(x, y, z), label, fn });
  }

  _floorScatter(cx, cz, w, d, n = 8) {
    this.mat(cx, cz + d * 0.28);
    for (let i = 0; i < n; i++) {
      const x = cx + (i % 4 - 1.5) * (w * 0.18);
      const z = cz + (Math.floor(i / 4) - 0.5) * (d * 0.22);
      if (i % 3 === 0) this.can(x, z);
      else if (i % 3 === 1) this.paper(x + 0.2, z - 0.1, i);
      else this.trash(x, z);
    }
  }

  _build() {
    // 01 ARRIVAL / RECEPTION
    this.room(0, 6, 14, 12, 3.4, this.M.paint, this.M.tile, { s: true });
    this.lamp(0, 3.15, 8, { lm: 1400, k: 3500, dist: 11 });
    this.lamp(-4.2, 3.15, 4.5, { lm: 700, k: 2700, dist: 8, hue: 0.02 });
    this.lamp(4.2, 3.15, 4.5, { lm: 700, k: 4000, dist: 8 });
    this.desk(-3.4, 8.2);
    this.desk(3.6, 8.2, Math.PI);
    this.cabinet(-6.2, 3.2);
    this.cabinet(6.2, 3.4);
    this.shelf(-6.2, 9.4);
    this.barrel(5.8, 1.8);
    this.barrel(6.4, 1.4);
    this.carton(5.35, 2.35, 0.52);
    this.crate(4.55, 2.55, 0.48);
    this.mat(0, 6.8, 2.2, 1.1);
    this.mat(-3.4, 7.4, 1.2, 0.7);
    this.sign(0, 2.4, 0.2, this.M.warn);
    this.box(0, 1.3, 0.18, 2.2, 2.5, 0.08, this.M.glass, false);
    for (let i = 0; i < 4; i++) this.pipe(-6.4, 3.0, 3 + i, 2.2, "z", this.M.metal, 0.05);
    this.can(-1.2, 7.1); this.can(-0.9, 7.3); this.paper(1.4, 5.2, 0.4);
    this.trash(6.0, 9.0); this.cable(-2, 8, 1.2, 6.5);
    this._floorScatter(-4, 4, 6, 4, 6);
    this.cooler(-6.0, 8.6);
    this.plant(6.3, 10.4);
    this.wallClock(0, 2.85, 11.7);
    this.cork(-5.2, 1.7, 11.65);
    this.extinguisher(6.6, 1.15, 6.2, Math.PI);
    this.bin(-5.5, 5.2);
    this.breaker(-6.65, 1.4, 6.8, Math.PI / 2);
    this.firstAid(6.65, 1.7, 8.2);
    this.fluoro(0, 3.28, 6, 3.2);
    this.visitorChair(-1.4, 4.4, 0.2);
    this.visitorChair(1.5, 4.5, -0.15);
    this.box(0, 0.42, 4.6, 0.9, 0.08, 0.55, this.M.wood, false);
    this.paper(-0.15, 4.55, 0.3); this.paper(0.2, 4.7, 1.1);
    this.interact(0.1, 1.25, 1.4, "Read lockdown notice", () => ({
      text: "STATION 7 LOCKDOWN. Fuse in workshop, generator, Lab B card, valves, archive code, sea-gate.",
    }));
    this.interact(-3.4, 1.15, 8.2, "Reception terminal", () => ({
      text: "Night contractor logged. Time-out field is blank. Someone typed your name already.",
    }));

    // 02 SECURITY
    this.room(0, -4, 10, 10, 3.2, this.M.concWall, this.M.concFloor, { n: true, s: true });
    this.lamp(0, 3.0, -4, { lm: 900, k: 5000, dist: 9 });
    this.lamp(-3, 2.9, -6, { lm: 400, k: 2200, type: "spot", dist: 7, angle: 0.55 });
    this.box(-2.4, 1.05, -7.2, 2.4, 1.5, 0.7, this.M.metal);
    this.cabinet(3.6, -7.4, 2.0);
    this.shelf(4.0, -1.8);
    this.carton(3.4, -1.6, 0.48);
    this.mat(0, -2.2, 1.8, 0.9);
    this.can(1.1, -5.2); this.paper(-1.5, -3.2, 1.1); this.trash(3.8, -5.5);
    this.cable(-2, -7, 2, -3.5);
    this.visitorChair(-1.1, -6.4, 0.4);
    this.cork(4.7, 1.65, -4, -Math.PI / 2);
    this.extinguisher(-4.7, 1.15, -1.6);
    this.breaker(4.7, 1.45, -6.8, -Math.PI / 2);
    this.fluoro(0, 3.08, -4, 2.4);
    this.bin(3.2, -2.2);
    this.wallClock(0, 2.7, -8.7);
    this.box(-3.6, 1.55, -7.0, 0.55, 0.42, 0.08, this.M.emitGreen, false);
    this.box(-1.4, 1.55, -7.0, 0.55, 0.42, 0.08, this.M.emitAmber, false);
    this.clipboard(-2.4, 1.82, -6.85);
    this.interact(-2.4, 1.3, -6.7, "Take Lab B card", () => {
      if (this.flags.card) return { text: "Empty slot." };
      this.flags.card = true;
      return { text: "You take the Lab B card. The face is scratched out.", event: "card" };
    });

    // 03 MAIN CORRIDOR
    this.room(0, -16, 5.2, 14, 3.1, this.M.concWall, this.M.concFloor, { n: true, s: true, w: true, e: true });
    this.lamp(0, 2.95, -12, { lm: 800, k: 3800, dist: 8 });
    this.lamp(0, 2.95, -20, { lm: 600, k: 2600, dist: 8, hue: 0.04 });
    for (let i = 0; i < 6; i++) {
      this.pipe(-2.2, 2.7, -11 - i * 1.6, 1.5, "z", this.M.rust, 0.07);
      this.pipe(-2.2, 2.45, -11 - i * 1.6, 1.5, "z", this.M.metal, 0.05);
    }
    this.sign(0, 2.3, -16, this.M.warn);
    this.box(-2.35, 1.2, -16, 0.12, 2.2, 0.12, this.M.metal, false);
    this.mat(0, -16, 1.6, 2.4);
    this.can(0.9, -14); this.can(-0.8, -18.4); this.paper(0.4, -19, 0.2);
    this.cable(-1.8, -12, 1.6, -20);
    this.extinguisher(-2.35, 1.15, -13.2);
    this.extinguisher(2.35, 1.15, -19.2, Math.PI);
    this.firstAid(2.35, 1.7, -16);
    this.fluoro(0, 2.98, -16, 2.0);
    this.bin(1.8, -21.5);

    // 04 OFFICES
    this.room(-10, -16, 12, 10, 3.0, this.M.paint, this.M.tile, { e: true });
    this.lamp(-10, 2.85, -14, { lm: 1000, k: 4000, dist: 10 });
    this.lamp(-13, 2.85, -18, { lm: 500, k: 2700, dist: 7 });
    this.desk(-12.5, -13.5);
    this.desk(-7.5, -18.2, 0.3);
    this.cabinet(-14.8, -12.5);
    this.shelf(-14.6, -19.2);
    this.box(-6.6, 0.22, -13.8, 0.5, 0.44, 0.7, this.M.dark);
    this.mat(-10, -16, 1.6, 1.0);
    this.can(-9.2, -14.8); this.trash(-6.8, -19); this.paper(-11, -17.5, 0.7);
    this.printer(-7.2, -13.2);
    this.plant(-14.2, -16);
    this.cork(-10, 1.7, -11.15);
    this.bin(-6.4, -16.4);
    this.fluoro(-10, 2.9, -16, 2.8);
    this.visitorChair(-11.2, -14.6, 0.5);
    this.extinguisher(-15.7, 1.15, -16, Math.PI / 2);
    this.clipboard(-12.2, 0.8, -13.2);
    this.interact(-12.5, 1.15, -13.5, "Office terminal", () => ({
      text: this.flags.power ? "POWER OK. Valves + archive code unlock the gate." : "NO BUS. Workshop fuse, then generator south-west.",
    }));

    // 05 STORAGE — wall stacks only, aisle clear
    this.room(10, -16, 12, 10, 3.2, this.M.concWall, this.M.concFloor, { w: true });
    this.lamp(10, 2.95, -16, { lm: 700, k: 2400, dist: 9, hue: 0.03 });
    for (let i = 0; i < 8; i++) {
      const x = 6.6 + (i % 2) * 0.85, z = -12.4 - Math.floor(i / 2) * 0.9;
      if (i % 2) this.carton(x, z, 0.5); else this.crate(x, z, 0.58);
    }
    for (let i = 0; i < 6; i++) this.crate(13.6, -12.6 - i * 0.9, 0.55);
    this.shelf(14.4, -19.6);
    this.barrel(7.2, -19.6); this.barrel(7.9, -19.2);
    this.mat(10, -16, 1.8, 1.2);
    this.can(9.2, -14); this.trash(12.2, -13.2); this.paper(10.4, -18, 0.3);
    this.fluoro(10, 3.1, -16, 2.6);
    this.bin(8.2, -16.5);
    this.extinguisher(15.7, 1.15, -16, -Math.PI / 2);
    this.clipboard(10.2, 0.04, -15.5);
    this.breaker(4.25, 1.4, -16, Math.PI / 2);
    this.interact(14.5, 1.2, -19.1, "Search locker", () => ({
      text: "Rain jacket. Note: don't stay after the pumps change pitch.",
    }));

    // 06 WORKSHOP (fuse)
    this.room(10, -26, 10, 10, 3.0, this.M.concWall, this.M.concFloor, { n: true, w: true });
    this.lamp(10, 2.8, -26, { lm: 1100, k: 3200, type: "spot", dist: 10, angle: 0.7 });
    this.workbench(8, -28, 2.2, 0.9);
    this.toolchest(12.5, -29);
    this.carton(13.2, -23.5, 0.5);
    this.shelf(6.4, -29.4);
    this.barrel(13.6, -26.8);
    this.mat(10, -24.5, 1.5, 0.9);
    this.can(9.1, -27.2); this.can(9.4, -27.5); this.trash(7.2, -23.2);
    this.cable(8, -28, 12, -24);
    this.pegboard(10, 1.6, -30.7);
    this.extinguisher(5.25, 1.15, -26);
    this.firstAid(14.7, 1.7, -26);
    this.fluoro(10, 2.9, -26, 2.2);
    this.bin(11.2, -23.4);
    this.clipboard(8.4, 0.84, -27.6);
    this.breaker(5.25, 1.4, -28.5);
    this.interact(8, 1.2, -27.5, "Pull spare fuse", () => {
      this.flags.fuse = true;
      return { text: "60A fuse. Generator tray is empty until this goes in.", event: "fuse" };
    });

    this.room(0, -28, 5.2, 12, 3.1, this.M.concWall, this.M.concFloor, { n: true, s: true, e: true });
    this.lamp(0, 2.9, -28, { lm: 500, k: 3600, dist: 8 });
    this.mat(0, -28, 1.4, 2.0);
    this.can(1.1, -26); this.paper(-0.6, -30, 0.5);

    // 07 GENERATOR
    this.room(-4, -42, 20, 16, 5.4, this.M.concWall, this.M.concFloor, { n: true, e: true, s: true });
    this.lamp(-8, 4.6, -42, { lm: 1800, k: 2200, dist: 14, hue: 0.05 });
    this.lamp(4, 4.6, -38, { lm: 900, k: 6500, dist: 12 });
    this.lamp(2, 4.6, -48, { lm: 600, k: 1800, dist: 10, hue: 0.08 });
    this.box(-8, 1.7, -42, 4.6, 3.4, 3.6, this.M.metal);
    this.box(-8, 0.12, -42, 5.2, 0.12, 4.2, this.M.warn, false);
    const tank = new THREE.Mesh(this.cyl, this.M.rust);
    tank.scale.set(0.85, 1.4, 0.85); tank.position.set(-8, 2.6, -40.2); this.scene.add(tank);
    this.barrel(-1.5, -36); this.barrel(-0.8, -36.6); this.barrel(5.2, -48);
    this.shelf(4.5, -36.2);
    this.mat(-2, -38, 2.0, 1.2);
    this.trash(-12, -48); this.can(0.4, -40); this.can(0.7, -40.4);
    this.cable(-6, -40, 3, -46);
    this.extinguisher(-13.7, 1.2, -36);
    this.extinguisher(5.5, 1.2, -49.5, Math.PI);
    this.fluoro(-4, 5.2, -42, 4);
    this.bin(-2.2, -46);
    this.clipboard(-6.2, 1.72, -40.2);
    this.pegboard(5.6, 1.7, -34.3);
    this.interact(-5.4, 1.35, -40.5, "Start generator", () => {
      if (!this.flags.fuse) return { text: "Empty fuse tray. Workshop, east of the corridor." };
      if (this.flags.genOn) return { text: "Idle holds. Bus A is live." };
      this.flags.genOn = true; this.flags.power = true;
      return { text: "The hall shakes. Strips catch. Pipes knock once, then wait.", event: "power" };
    });
    for (let i = 0; i < 9; i++) {
      this.box(2.2, 0.14 + i * 0.28, -36.2 - i * 0.32, 1.5, 0.12, 0.38, this.M.metal, false);
      this.floors.push({ minx: 1.4, maxx: 3.0, minz: -36.4 - i * 0.32, maxz: -36.0 - i * 0.32, y: 0.2 + i * 0.28 });
    }
    this.box(5.5, 2.55, -42, 7, 0.1, 2.0, this.M.metal, false);
    this.floors.push({ minx: 2, maxx: 9, minz: -43, maxz: -41, y: 2.6 });
    this.box(2.1, 1.3, -42, 0.12, 2.5, 0.12, this.M.metal);
    this.box(8.8, 1.3, -42, 0.12, 2.5, 0.12, this.M.metal);
    for (let i = 0; i < 8; i++) this.box(8.5, 0.2 + i * 0.32, -40.6, 0.4, 0.06, 0.06, this.M.metal, false);
    this.box(8.3, 1.3, -40.6, 0.05, 2.6, 0.05, this.M.metal, false);
    this.box(8.7, 1.3, -40.6, 0.05, 2.6, 0.05, this.M.metal, false);
    this.interact(2, 1.1, -35.5, "Inspect scorch", () => ({
      text: "Floor scarred in an arc. Something heavy swung more than once.",
    }));

    // 08 LAB
    this.room(12, -42, 12, 12, 3.3, this.M.tile, this.M.tile, { w: true, s: true });
    this.lamp(12, 3.05, -42, { lm: 1200, k: 5600, dist: 11 });
    this.lamp(15, 3.05, -46, { lm: 400, k: 7000, dist: 7 });
    this.box(12, 1.0, -46.2, 3.6, 1.05, 1.3, this.M.metal);
    this.cabinet(7.6, -37.5, 2.2);
    this.shelf(16.6, -38);
    this.mat(12, -40, 1.6, 1.0);
    this.can(13.2, -43); this.paper(11, -41, 0.2);
    this.fluoro(12, 3.18, -42, 2.4);
    this.bin(16.2, -45);
    this.plant(7.8, -37.8);
    this.extinguisher(17.7, 1.15, -42, -Math.PI / 2);
    this.firstAid(6.25, 1.7, -46);
    this.clipboard(12, 1.55, -45.6);
    this.box(14.4, 1.05, -46.0, 0.22, 0.35, 0.22, this.M.glass, false);
    this.box(10.0, 1.05, -46.0, 0.22, 0.35, 0.22, this.M.glass, false);
    this.interact(7.8, 1.25, -42, "Use card reader", () => {
      if (!this.flags.card) return { text: "Lab B reader." };
      this.flags.labOpen = true;
      return { text: "Inner shutter unlocks toward maintenance.", event: "lab" };
    });
    this.interact(12, 1.2, -45.5, "Inspect CURRENT-7 jars", () => ({
      text: "Silt samples. One jar empty. Lid on the floor, inside-out.",
    }));

    // 09 MAINTENANCE / SHRINK
    this.room(12, -54, 4.2, 10, 2.5, this.M.concWall, this.M.concFloor, { n: true, s: true, leaf: false });
    this.lamp(12, 2.3, -54, { lm: 350, k: 1900, dist: 7, hue: 0.06 });
    for (let i = 0; i < 5; i++) this.pipe(10.5, 2.1, -50 - i, 1.6, "z", this.M.rust, 0.09);
    const w1 = this.box(10.55, 1.2, -54, 0.18, 2.3, 7.5, this.M.concWall, false);
    const w2 = this.box(13.45, 1.2, -54, 0.18, 2.3, 7.5, this.M.concWall, false);
    this.shrinkWalls = [w1, w2];
    this.mat(12, -54, 1.0, 1.6);

    // 10 VALVES
    this.room(12, -64, 10, 8, 3.0, this.M.concWall, this.M.concFloor, { n: true, s: true });
    this.lamp(12, 2.8, -64, { lm: 800, k: 4800, dist: 9 });
    for (let i = 0; i < 3; i++) {
      const vx = 9.5 + i * 1.8;
      const v = new THREE.Mesh(this.cyl, this.M.rust);
      v.scale.set(0.16, 0.7, 0.16); v.position.set(vx, 1.0, -66); this.scene.add(v);
      this.interact(vx, 1.2, -65.2, "Turn valve " + (i + 1), ((idx) => () => {
        this.flags.valves[idx] = !this.flags.valves[idx];
        const n = this.flags.valves.filter(Boolean).length;
        if (n === 3) this.flags.pump = true;
        return { text: `Valve ${idx + 1} ${this.flags.valves[idx] ? "open" : "closed"}. ${n}/3.`, event: n === 3 ? "valves" : "" };
      })(i));
    }
    this.barrel(16, -62); this.mat(12, -62, 1.4, 0.9);
    this.can(14, -63); this.trash(8.4, -66.5);
    this.clipboard(9.5, 1.72, -66);
    this.clipboard(11.3, 1.72, -66);
    this.clipboard(13.1, 1.72, -66);
    this.fluoro(12, 2.88, -64, 2);
    this.bin(8.2, -61.5);
    this.extinguisher(7.25, 1.15, -64);
    this.box(12, 0.06, -66.4, 3.2, 0.04, 1.1, this.M.wet, false);

    // 11 TUNNEL
    this.room(12, -74, 4.0, 10, 2.4, this.M.concWall, this.M.concFloor, { n: true, s: true });
    this.lamp(12, 2.2, -74, { lm: 280, k: 2100, dist: 6 });
    for (let i = 0; i < 8; i++) this.pipe(10.6, 1.9, -70 - i * 0.9, 0.9, "z", this.M.metal, 0.06);
    this.mat(12, -74, 1.1, 1.8);
    this.can(12.6, -72);

    // 12–13 YARD
    this.box(6, -0.06, -92, 48, 0.12, 28, this.M.asphalt || this.M.dirt, false);
    this.floors.push({ minx: -18, maxx: 30, minz: -106, maxz: -78, y: 0 });
    this.open(12, -79, 2.6, 2.6, "z");
    // Yard is open air — no door sitting in empty space.
    this.lamp(4, 4.2, -88, { lm: 1600, k: 6500, type: "spot", dist: 16, angle: 0.9 });
    this.lamp(18, 3.6, -96, { lm: 700, k: 2200, dist: 12, hue: 0.04 });
    this.box(6, 1.2, -105.8, 48, 2.4, 0.12, this.M.metal);
    this.box(6, 1.2, -78.2, 48, 2.4, 0.12, this.M.metal);
    this.box(-17.8, 1.2, -92, 0.12, 2.4, 28, this.M.metal);
    this.box(29.8, 1.2, -92, 0.12, 2.4, 28, this.M.metal);
    this.box(-6, 0.45, -98, 3.2, 0.9, 2.2, this.M.rock);
    this.box(20, 0.6, -100, 2.4, 1.2, 1.8, this.M.concWall);
    this.box(2, 0.08, -90, 10, 0.06, 1.8, this.M.wet, false);
    this.box(10, 0.08, -96, 1.6, 0.06, 8, this.M.concFloor, false);
    this.crate(16, -86);
    this.crate(17.1, -87.2, 0.5);
    this.barrel(18.4, -85); this.barrel(-10, -88);
    this.mat(12, -82, 1.8, 1.2);
    this.trash(8, -90); this.trash(9.2, -91); this.can(5, -88); this.can(14, -94);
    for (let i = 0; i < 10; i++) {
      this.box(-8 + (i % 5) * 6, 0.03, -84 - Math.floor(i / 5) * 8, 3.5, 0.04, 3.5, this.M.gravel, false);
    }
    const n = 80;
    const pg = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = -16 + Math.random() * 44;
      arr[i * 3 + 1] = Math.random() * 9;
      arr[i * 3 + 2] = -106 + Math.random() * 28;
    }
    pg.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    this.rain = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x99b0c0, size: 0.05, transparent: true, opacity: 0.45 }));
    this.scene.add(this.rain);

    // 14 SHACK
    this.room(-8, -98, 8, 8, 2.7, this.M.concWall, this.M.wood, { n: true, leaf: false });
    this.open(-8, -94, 1.8, 2.2, "z");
    this.lamp(-8, 2.4, -98, { lm: 450, k: 2400, dist: 7 });
    this.desk(-8, -100);
    this.mat(-8, -96, 1.2, 0.8);
    this.can(-6.5, -97); this.trash(-5.2, -100);
    this.interact(-8, 1.15, -99.5, "Yard radio", () => ({
      text: "Tide noise. Then the pipes' knock, delayed.",
    }));

    // 15 SEA GATE
    this.box(24, 1.7, -92, 1.5, 3.4, 6, this.M.metal);
    this.lamp(24, 3.4, -92, { lm: 900, k: 1800, dist: 8, hue: 0.07 });
    this.mat(22, -92, 1.6, 2.0);
    this.barrel(21, -89);
    this.interact(22.8, 1.35, -92, "Sea-gate keypad", () => {
      if (!this.flags.pump) return { text: "Interlock: three valves first." };
      if (!this.flags.code) return { text: "Keypad. Code is in archives — north offices wing." };
      this.flags.escaped = true;
      return { text: "Motors grind. Salt air. You can leave Station 7.", event: "end" };
    });

    // ARCHIVES
    this.room(-10, -5, 10, 8, 3.0, this.M.wood, this.M.wood, { s: true });
    this.open(-10, -9, 2.2, 2.3, "z");
    this.lamp(-10, 2.8, -5, { lm: 700, k: 2900, dist: 8 });
    this.cabinet(-13.5, -3.2);
    this.shelf(-13.6, -7.2);
    this.desk(-8, -4);
    this.mat(-10, -5, 1.5, 0.9);
    this.paper(-9, -6, 0.4); this.paper(-8.6, -6.3, 1.2); this.can(-7.2, -3.5);
    this.cork(-10, 1.65, -1.15);
    this.bin(-5.6, -3.2);
    this.fluoro(-10, 2.88, -5, 2.2);
    this.plant(-13.6, -5.5);
    this.extinguisher(-14.75, 1.15, -5, Math.PI / 2);
    this.clipboard(-8.4, 0.8, -3.7);
    this.box(-12.2, 1.4, -7.0, 0.02, 0.28, 0.22, this.M.paint, false);
    this.box(-12.2, 1.4, -6.7, 0.02, 0.28, 0.22, this.M.paint, false);
    this.interact(-8, 1.15, -4, "Archive drawer", () => {
      this.flags.code = true;
      return { text: "SEA-GATE KEYPAD 4-7-2-1. Tide photos: closer every year.", event: "code" };
    });
  }

  _drones() {
    const paths = [
      [new THREE.Vector3(0, 1.15, -12), new THREE.Vector3(0, 1.15, -22)],
      [new THREE.Vector3(-8, 1.3, -42), new THREE.Vector3(4, 1.3, -46)],
      [new THREE.Vector3(8, 1.15, -90), new THREE.Vector3(20, 1.15, -98)],
    ];
    paths.forEach((path) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.cyl, new THREE.MeshStandardMaterial({
        color: 0x3a2a22, metalness: 0.55, roughness: 0.4, emissive: 0x220800, emissiveIntensity: 0.35,
      }));
      body.scale.set(0.28, 0.55, 0.28);
      const head = new THREE.Mesh(this.sph, new THREE.MeshStandardMaterial({
        color: 0x111111, metalness: 0.8, roughness: 0.25, emissive: 0xff2200, emissiveIntensity: 0.8,
      }));
      head.scale.set(0.22, 0.18, 0.22); head.position.y = 0.62;
      const lamp = new THREE.Mesh(this.cyl, new THREE.MeshBasicMaterial({ color: 0xff6622 }));
      lamp.scale.set(0.08, 0.12, 0.08); lamp.position.set(0, 0.62, 0.18);
      const leg = (x, z) => {
        const m = new THREE.Mesh(this.geo, this.M.rust);
        m.scale.set(0.08, 0.7, 0.08); m.position.set(x, -0.2, z); return m;
      };
      g.add(body, head, lamp, leg(0.22, 0.18), leg(-0.22, 0.18), leg(0.22, -0.18), leg(-0.22, -0.18));
      this.scene.add(g);
      this.drones.push({ mesh: g, path, i: 0, state: "patrol", pos: path[0].clone() });
      g.position.copy(path[0]);
    });
  }

  floorAt(x, z) {
    let y = -20;
    for (const f of this.floors) {
      if (x >= f.minx && x <= f.maxx && z >= f.minz && z <= f.maxz && f.y > y) y = f.y;
    }
    return y;
  }
  _inOpen(x, y, z) {
    for (const o of this.openings) {
      if (o.door && Math.abs(o.door.angle) < 0.5) continue;
      if (x > o.minx && x < o.maxx && y < o.maxy && z > o.minz && z < o.maxz) return true;
    }
    return false;
  }
  blocked(x, y, z, r) {
    for (const d of this.doors) {
      if (Math.abs(d.angle) > 0.6) continue;
      if (d.axis === "z") {
        if (Math.abs(z - d.z) < 0.2 + r && Math.abs(x - d.x) < d.gap / 2 - 0.02 && y < d.h) return true;
      } else if (Math.abs(x - d.x) < 0.2 + r && Math.abs(z - d.z) < d.gap / 2 - 0.02 && y < d.h) return true;
    }
    if (this._inOpen(x, y + 0.9, z)) return false;
    for (const s of this.solids) {
      if (x + r > s.minx && x - r < s.maxx && y + 1.5 > s.miny && y < s.maxy && z + r > s.minz && z - r < s.maxz) return true;
    }
    return false;
  }

  kickDebris(px, pz, force) {
    for (const d of this.debris) {
      const dx = d.mesh.position.x - px, dz = d.mesh.position.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.15 && dist > 0.01) {
        const k = (force * 5.5) / dist;
        d.vx += (dx / dist) * k;
        d.vz += (dz / dist) * k;
        d.vy = 1.8 * force;
      }
    }
  }

  update(dt, player) {
    for (const d of this.doors) {
      d.angle += (d.target - d.angle) * Math.min(1, dt * 5.5);
      d.pivot.rotation.y = d.angle;
    }
    if (this.rain && player.pos.z < -78) {
      const p = this.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 2) {
        let y = p.getY(i) - dt * 8;
        if (y < 0) y = 9;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    const g = 12;
    for (const d of this.debris) {
      d.vy = (d.vy || 0) - g * dt;
      d.vx *= Math.pow(0.22, dt);
      d.vz *= Math.pow(0.22, dt);
      let nx = d.mesh.position.x + d.vx * dt;
      let nz = d.mesh.position.z + d.vz * dt;
      let ny = (d.mesh.position.y) + d.vy * dt;
      const floor = Math.max(0.09, this.floorAt(nx, nz) + 0.09);
      if (ny <= floor) { ny = floor; d.vy *= -0.25; if (Math.abs(d.vy) < 0.4) d.vy = 0; }
      if (this.blocked(nx, 0, nz, d.r || 0.06)) { d.vx *= -0.4; d.vz *= -0.4; nx = d.mesh.position.x; nz = d.mesh.position.z; }
      d.mesh.position.set(nx, ny, nz);
      d.mesh.rotation.x += d.vz * dt * 6;
      d.mesh.rotation.z -= d.vx * dt * 6;
    }
    if (player.vel && player.vel.length() > 1.2) this.kickDebris(player.pos.x, player.pos.z, player.debug?.force || 1);

    if (this.flags.labOpen && !this.flags.crushDone) {
      const pz = player.pos.z, px = player.pos.x;
      if (px > 10 && px < 14 && pz < -50 && pz > -59) {
        this.events.crush = (this.events.crush || 0) + dt;
        const k = Math.min(1, this.events.crush / 8);
        this.shrinkWalls[0].position.x = 10.55 + k * 0.75;
        this.shrinkWalls[1].position.x = 13.45 - k * 0.75;
        if (k >= 1) this.flags.crushDone = true;
        if (k > 0.5 && Math.abs(px - 12) < 0.5) player.damage(dt * 12);
      }
    }
    if (!this.enemiesOn) {
      for (const d of this.drones) d.mesh.visible = false;
      return;
    }
    for (const d of this.drones) d.mesh.visible = true;
    const hear = player.vel.length() > 3 ? 1 : 0.4;
    for (const d of this.drones) {
      const toP = new THREE.Vector3(player.pos.x - d.pos.x, 0, player.pos.z - d.pos.z);
      const dist = toP.length();
      if (d.state === "patrol") {
        const tgt = d.path[d.i];
        const dir = new THREE.Vector3(tgt.x - d.pos.x, 0, tgt.z - d.pos.z);
        if (dir.length() < 0.4) d.i = (d.i + 1) % d.path.length;
        else { dir.normalize(); d.pos.addScaledVector(dir, 1.7 * dt); }
        if (dist < 8 + hear * 5) d.state = "chase";
      } else {
        if (dist > 0.25) { toP.normalize(); d.pos.addScaledVector(toP, 2.7 * dt); }
        if (dist < 1.05) player.damage(16 * dt);
        if (dist > 14) d.state = "patrol";
      }
      d.mesh.position.copy(d.pos);
      d.mesh.lookAt(player.pos.x, d.pos.y, player.pos.z);
    }
    player.surface = player.pos.z < -78 ? "dirt" : "concrete";
  }
  nearestInteract(pos) {
    let best = null, s = 2.2;
    for (const it of this.interacts) {
      const d = it.pos.distanceTo(pos);
      if (d < s) { s = d; best = it; }
    }
    return best;
  }
}
