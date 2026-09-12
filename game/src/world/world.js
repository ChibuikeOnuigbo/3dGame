// World builder: turns the level plan (game/data/level_map.json) into meshes,
// colliders, lights, doors, props, water, interaction objects, audio zones.
//
// Conventions:
// - Every static collider is an axis-aligned box registered in this.colliders
//   as THREE.Box3 (directive: simplified collision geometry).
// - Ground height is analytic (regions + ramps) via groundAt(x,z).
// - Rooms are 3D rects for room detection / audio zones / QA.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { makeSignTexture, makePaperTexture, makeChainLinkTexture } from "./materials.js";
import { Door } from "./doors.js";
import * as kit from "./kit.js";

const T = 0.3; // standard wall thickness

export class World {
  constructor(scene, materials, state, audio) {
    this.scene = scene;
    this.mats = materials;
    this.state = state;
    this.audio = audio;
    this.colliders = []; // {box:THREE.Box3, door?:string, active:true}
    this.rooms = [];
    this.groundRegions = [];
    this.doors = new Map();
    this.fixtures = []; // {group, set(on), room, circuit}
    this.spinners = [];
    this.interactables = [];
    this.water = null;
    this.waterLevel = 0.42;
    this.waterTarget = 0.42;
    this.sluice = null;
    this.time = 0;
    this.endingZone = null;
    this.scareDone = false;
    this.radios = [];
    this.stringLights = null;
    this.gateFlood = null;
    this.redLamps = [];
    this._buildAll();
  }

  // ---------------- primitives ----------------

  // Bake world-scale UVs so texture density is uniform (~tile meters per
  // repeat) no matter how large the surface — otherwise a 20 m wall stretches
  // ONE texture tile across it and reads as flat color.
  static scaleBoxUVs(geo, sx, sy, sz, tile, mat) {
    const rx = (mat && mat.map && mat.map.repeat.x) || 1;
    const ry = (mat && mat.map && mat.map.repeat.y) || 1;
    const uv = geo.attributes.uv;
    const reps = [
      [sz / tile / rx, sy / tile / ry], [sz / tile / rx, sy / tile / ry], // +x -x
      [sx / tile / rx, sz / tile / ry], [sx / tile / rx, sz / tile / ry], // +y -y
      [sx / tile / rx, sy / tile / ry], [sx / tile / rx, sy / tile / ry], // +z -z
    ];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * reps[f][0], uv.getY(i) * reps[f][1]);
      }
    }
    uv.needsUpdate = true;
  }

  box(cx, cy, cz, sx, sy, sz, mat, opts = {}) {
    const { collide = true, cast = true, receive = true, variant = null, tile = 1.5 } = opts;
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    if (!variant && mat && mat.map) World.scaleBoxUVs(geo, sx, sy, sz, tile, mat);
    const m = new THREE.Mesh(geo, variant || mat);
    m.position.set(cx, cy, cz);
    m.castShadow = cast;
    m.receiveShadow = receive;
    this.scene.add(m);
    if (collide) {
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
          new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
        ),
        active: true,
        soft: !!opts.soft,
      });
    }
    return m;
  }

  // wall along X (centered z), from x0..x1, y0..y1
  wallX(z, x0, x1, y0, y1, mat, opts = {}) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, z, Math.abs(x1 - x0), y1 - y0, T, mat, opts);
  }

  // wall along Z (centered x), from z0..z1, y0..y1
  wallZ(x, z0, z1, y0, y1, mat, opts = {}) {
    return this.box(x, (y0 + y1) / 2, (z0 + z1) / 2, T, y1 - y0, Math.abs(z1 - z0), mat, opts);
  }

  slab(x0, x1, y0, y1, z0, z1, mat, opts = {}) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, mat, opts);
  }

  room(def) {
    this.rooms.push(def);
  }

  ground(x0, x1, z0, z1, y, surface = "concrete", slope = null) {
    this.groundRegions.push({ x0, x1, z0, z1, y, surface, slope });
  }

  place(group, x, y, z, yaw = 0, { collide = true, soft = false } = {}) {
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    if (collide && group.userData.colliders) {
      for (const c of group.userData.colliders) {
        const [lx0, ly0, lz0, lx1, ly1, lz1] = c;
        const cos = Math.abs(Math.cos(yaw)), sin = Math.abs(Math.sin(yaw));
        const hx = (lx1 - lx0) / 2, hz = (lz1 - lz0) / 2;
        const ex = hx * cos + hz * sin, ez = hx * sin + hz * cos;
        const lcx = (lx0 + lx1) / 2, lcz = (lz0 + lz1) / 2;
        const wx = x + lcx * Math.cos(yaw) + lcz * Math.sin(yaw);
        const wz = z - lcx * Math.sin(yaw) + lcz * Math.cos(yaw);
        this.colliders.push({
          box: new THREE.Box3(
            new THREE.Vector3(wx - ex, y + ly0, wz - ez),
            new THREE.Vector3(wx + ex, y + ly1, wz + ez)
          ),
          active: true,
          soft,
          tag: (group.name || "prop"),
        });
      }
    }
    return group;
  }

  makeToggleable(group) {
    // clone emissive materials so this fixture switches independently
    const entries = [];
    group.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive && o.material.emissiveIntensity > 0) {
        o.material = o.material.clone();
        entries.push([o.material, o.material.emissiveIntensity, o.material.color.getHex()]);
      }
    });
    return {
      group,
      set(on) {
        for (const [m, intensity, color] of entries) {
          m.emissiveIntensity = on ? intensity : 0;
          m.color.setHex(on ? color : 0x565b60);
        }
        group.userData.on = on;
      },
    };
  }

  light(x, y, z, { color = 0xffe6c0, intensity = 8, distance = 12, circuit = "always", shadow = false, room = null } = {}) {
    const l = new THREE.PointLight(color, 0, distance, 2);
    l.position.set(x, y, z);
    l.castShadow = shadow;
    if (shadow) {
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.004;
    }
    this.scene.add(l);
    const entry = { light: l, intensity, circuit, room };
    this.lightEntries = this.lightEntries || [];
    this.lightEntries.push(entry);
    return entry;
  }

  // ---------------- build ----------------

  _buildAll() {
    this._street();
    this._kiosk();
    this._stairwell();
    this._atrium();
    this._corridor();
    this._pumphall();
    this._gallery();
    this._sump();
    this._shaft();
    this._bounds();
    this._applyInitialCircuits();
  }

  _bounds() {
    // Enclosure colliders ONLY (user QA 2026-09-07: the previous visible
    // bounds — four 14m near-black "trim" walls around the whole map — were
    // THE "black wall": light-reactive, spanning every view past the fence,
    // and unreachable behind the fence so they felt non-collidable. Collision
    // is kept (the player can never leave the map — box colliders, no
    // meshes); the horizon now opens to the sky dome + distant skyline.)
    const b = { x: [-9.5, 28.5], y: [-4.5, 8], z: [-20.5, 23.5] };
    const wall = (cx, cz, sx, sz) => {
      const sy = 14, cy = 2;
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
          new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
        ),
        active: true,
      });
    };
    wall(b.x[0] - 1, 2, 2, 50);
    wall(b.x[1] + 1, 2, 2, 50);
    wall(9, b.z[0] - 1, 40, 2);
    wall(9, b.z[1] + 1, 40, 2);
    // street side sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(55, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          top: { value: new THREE.Color(0x14203a) },
          bottom: { value: new THREE.Color(0x5c4a38) }, // sodium city haze — horizon must read as environment, not a black sheet (user QA)
        },
        vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float h = clamp(normalize(vP).y*0.5+0.5,0.,1.); gl_FragColor = vec4(mix(bottom, top, pow(h,0.7)),1.0); }",
      })
    );
    sky.position.set(0, 3, -13);
    this.scene.add(sky);
    this.sky = sky;

    // distant skyline (user QA: after removing the in-parcel silhouette
    // masses, the fog boundary still read as a flat black "wall" around the
    // map — the horizon needs real depth). Dark blocks 25m+ out, FAR beyond
    // the parcel fence: unreachable by the player, no colliders needed.
    // Sparse warm windows give the night a lived-in horizon.
    // QA 2026-09-07: 0x272e39 sat below the night fog colour and the skyline
    // read as a black void sheet. Lifted so silhouettes separate from sky.
    const skyMat = new THREE.MeshStandardMaterial({ color: 0x3a4350, roughness: 0.95 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    // QA 2026-09-07: blocks must sit fully OUTSIDE the playable bounds
    // (x -9.5..28.5, z -20.5..23.5) — the old (30,11,-8) and (26,16,6)
    // blocks intruded into the east parcel edge as giant dark walk-through
    // masses. Pushed to x>=31.5.
    const blocks = [
      [-26, 10, -34], [-12, 16, -40], [4, 13, -36], [18, 9, -32], [28, 14, -26],
      [-24, 8, -18], [-27, 12, -4], [37, 11, -6], [36, 16, 10], [-21, 9, 8],
    ];
    // Surroundings pass 2026-09-08 (reference direction: Mirror's Edge /
    // Spider-Man / Cyberpunk city depth — foreground/midground/background
    // layers, rooftop machinery, atmospheric perspective). All silhouettes
    // are 25m+ outside the playable bounds: no colliders, no lights, cheap
    // basic materials. Layered bands give the horizon real depth instead of
    // one row of blocks.
    // QA 2026-09-08: near band swaps my box towers for real low-poly CC0
    // buildings (Quaternius, via trebeljahr/quaternius-showcase) — textured
    // facades/rooflines mid-ground; far band stays cheap silhouette boxes.
    const decoPick = (bh) =>
      bh >= 14 ? ["6Story_Stack_Mat.glb", 20] :
      bh >= 11 ? ["4Story_Mat.glb", 14] :
      bh >= 9 ? ["3Story_Balcony_Mat.glb", 11] : ["2Story_Wide_Mat.glb", 8];
    const bands = [
      { list: blocks, deco: true }, // near band: real buildings
      { list: [ // far band: taller, hazier towers
          [-44, 26, -58], [-16, 34, -66], [10, 30, -62], [34, 24, -52], [52, 38, -40],
          [-48, 22, -10], [-42, 30, 16], [46, 28, 22], [40, 20, 40], [-30, 24, 42],
        ], tint: 0x2e3745 },
    ];
    const winMatCool = new THREE.MeshBasicMaterial({ color: 0xbfd4ff });
    for (const band of bands) {
      const mat = new THREE.MeshStandardMaterial({ color: band.tint || 0x3a4350, roughness: 0.95 });
      for (const [bx, bh, bz] of band.list) {
        if (band.deco) {
          const [file, est] = decoPick(bh);
          const yaw = ((Math.abs(bx) + Math.abs(bz)) % 4) * Math.PI / 2;
          const sc = bh / est;
          this._decoProp("assets/models/quaternius/" + file, bx, 3.15, bz, yaw, sc, { glow: true });
          // sparse lit windows on the viewer-facing (+z) facade
          const nWin = 2 + ((Math.abs(bx) + Math.abs(bz)) & 3);
          for (let i = 0; i < nWin; i++) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), i % 3 === 2 ? winMatCool : winMat);
            win.position.set(
              bx - 3 + ((i * 2.7 + Math.abs(bz)) % 6),
              3.2 + 3 + ((i * 3.3 + Math.abs(bx)) % Math.max(2, bh - 4)),
              bz + 3.2 * sc + 0.25
            );
            this.scene.add(win);
          }
          continue;
        }
        const bw = 7 + ((Math.abs(bx) * 7 + Math.abs(bz) * 3) % 5);
        const bd = 5 + ((Math.abs(bz) * 5 + Math.abs(bx)) % 4);
        const bld = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
        bld.position.set(bx, 3.2 + bh / 2, bz);
        this.scene.add(bld);
        // rooftop machinery silhouettes (HVAC, tanks, masts) — the reference
        // skylines are defined by cluttered rooflines, not clean boxes
        const roofY = 3.2 + bh;
        const rn = (Math.abs(bx) + Math.abs(bz)) % 4;
        for (let r = 0; r < rn; r++) {
          const rx = bx + ((r * 2.3 + bz) % Math.max(1, bw - 2)) - bw / 2 + 1;
          const rz = bz + ((r * 1.7 + bx) % Math.max(1, bd - 2)) - bd / 2 + 1;
          const kind = (r + Math.abs(bx)) % 3;
          if (kind === 0) { // HVAC box
            const hv = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.3), mat);
            hv.position.set(rx, roofY + 0.55, rz);
            this.scene.add(hv);
          } else if (kind === 1) { // water tank
            const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.7, 8), mat);
            tk.position.set(rx, roofY + 0.85, rz);
            this.scene.add(tk);
          } else { // antenna mast + beacon
            const ms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.4, 5), mat);
            ms.position.set(rx, roofY + 1.7, rz);
            this.scene.add(ms);
            const bc = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5),
              new THREE.MeshBasicMaterial({ color: 0xff4444 }));
            bc.position.set(rx, roofY + 3.4, rz);
            this.scene.add(bc);
          }
        }
        // sparse lit windows (warm + cool mix)
        const nWin = 2 + ((Math.abs(bx) + Math.abs(bz)) & 3);
        for (let i = 0; i < nWin; i++) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), i % 3 === 2 ? winMatCool : winMat);
          win.position.set(
            bx - bw / 2 + 1.2 + ((i * 3.1 + bh) % Math.max(1, bw - 2.4)),
            3.2 + 2 + ((i * 2.7 + Math.abs(bz)) % Math.max(1, bh - 3)),
            bz + bd / 2 + 0.06
          );
          this.scene.add(win);
        }
      }
    }

    // QA 2026-09-07: outside the parcel fence there was NO ground at all —
    // views along the fence line fell off into the void and read as black
    // walls around the game. A dim city-ground disc out to the horizon gives
    // the skyline and fog something to sit on.
    const extGeo = new THREE.CircleGeometry(60, 48);
    {
      const uv = extGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 40, uv.getY(i) * 40);
      uv.needsUpdate = true;
    }
    const ext = new THREE.Mesh(extGeo, this.mats.get("asphalt"));
    ext.rotation.x = -Math.PI / 2;
    ext.position.set(9, 3.14, 2);
    ext.receiveShadow = false;
    this.scene.add(ext);

    // star field on the dome (subtle, additive, static)
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 460; i++) {
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(rand() * 0.92); // upper hemisphere bias
      const r = 52;
      starVerts.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) + 2, r * Math.sin(ph) * Math.sin(th) - 13);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starVerts, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xcfd8ff, size: 0.42, sizeAttenuation: false,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.scene.add(stars);

    // moon + halo, high to the south-west so it is visible from the street
    const moonDir = new THREE.Vector3(-0.42, 0.55, -0.72).normalize();
    const moonPos = moonDir.clone().multiplyScalar(46).add(new THREE.Vector3(0, 2, -13));
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 40),
      new THREE.MeshBasicMaterial({ color: 0xf2f5e8, fog: false })
    );
    moon.position.copy(moonPos);
    moon.lookAt(0, 4, -13);
    this.scene.add(moon);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(5.6, 40),
      new THREE.MeshBasicMaterial({ color: 0x9db2d8, transparent: true, opacity: 0.16, fog: false, depthWrite: false })
    );
    halo.position.copy(moonPos).addScaledVector(moonDir, -0.5);
    halo.lookAt(0, 4, -13);
    this.scene.add(halo);
    this.moonLight = new THREE.DirectionalLight(0xbdd0f0, 1.05); // QA: 0.7 crushed to black post-tonemap
    this.moonLight.position.copy(moonDir.clone().multiplyScalar(30));
    this.scene.add(this.moonLight);
  }

  _street() {
    // asphalt around kiosk — built AROUND the stairwell shaft (the shaft
    // descends south of the kiosk; a slab across it swept players off the ramp)
    this.slab(-10, 10, 3.05, 3.2, -20, -11.3, this.mats.get("asphalt"), { tile: 2.0 });
    this.slab(-10, -1.3, 3.05, 3.2, -11.3, -10.4, this.mats.get("asphalt"), { tile: 2.0 });
    this.slab(1.3, 10, 3.05, 3.2, -11.3, -10.4, this.mats.get("asphalt"), { tile: 2.0 });
    this.ground(-10, 10, -20, -10.4, 3.2, "asphalt"); // to -10.4: match the visual asphalt (floor-audit fix)
    this.room({ id: "street", name: "Stadtfeld Street", min: [-10, 3, -20], max: [10, 8, -10.4], zone: "street" });

    // sodium lamp + pole
    const pole = kit.ladder(this.mats, 4.4);
    pole.rotation.z = 0;
    this.place(new THREE.Group(), 0, 0, 0, 0, { collide: false }); // noop keep structure
    const poleG = new THREE.Group();
    const poleM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 10), this.mats.get("darkMetal"));
    poleM.position.set(3.4, 5.4, -16.5);
    this.scene.add(poleM);
    this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(3.2, 3.2, -16.7), new THREE.Vector3(3.6, 7.6, -16.3)), active: true });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.24), this.mats.get("trim"));
    head.position.set(3.05, 7.5, -16.5);
    this.scene.add(head);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.16), this.mats.get("glowWarm").clone());
    bulb.position.set(2.95, 7.4, -16.5);
    this.scene.add(bulb);
    this.light(2.95, 7.2, -16.5, { color: 0xffb45e, intensity: 26, distance: 22, circuit: "always" });

    // (building silhouettes REMOVED 2026-09-07, user QA: two near-black
    // light-reactive masses with collide:false sat INSIDE the playable
    // parcel — they swallowed the grass verges, buried the bushes, cut
    // through the fence corners, and the player walked through them.
    // Night fog alone reads better than fake skyline at this scale.)

    // ---- grass verges inside the street parcel (CC0 Ground037) ----
    // USER 2026-09-12 floor audit: visuals AND ground regions used to stop at
    // z -10.9 while the asphalt ran to -10.4 — a visual asphalt strip with no
    // analytic floor and no boundary, i.e. a floor the player could walk off
    // into the void. Verges/regions now run to -10.4 like the asphalt, and a
    // fence line seals the south edge (see fenceLines below).
    const vergeMat = this.mats.get("grass");
    this.slab(-10, -7.6, 3.2, 3.28, -20, -10.4, vergeMat, { cast: false, tile: 1.2 });
    this.slab(7.6, 10, 3.2, 3.28, -20, -10.4, vergeMat, { cast: false, tile: 1.2 });
    this.ground(-10, -7.6, -20, -10.4, 3.28, "grass");
    this.ground(7.6, 10, -20, -10.4, 3.28, "grass");
    // soil strip in front of the buildings (CC0 Ground054)
    this.slab(-7.6, 7.6, 3.2, 3.26, -20, -18.4, this.mats.get("soil"), { cast: false });
    this.ground(-7.6, 7.6, -20, -18.4, 3.26, "grass");
    // low curb edging the verges
    this.slab(-7.75, -7.55, 3.2, 3.34, -20, -10.4, this.mats.get("concreteDark"), { cast: false });
    this.slab(7.55, 7.75, 3.2, 3.34, -20, -10.4, this.mats.get("concreteDark"), { cast: false });

    // QA 2026-09-07: parcel edges were uniform-black past the single sodium
    // lamp's pool — corner lamps keep the fence line legible as environment.
    for (const [lx, lz] of [[-9.6, -19.6], [9.6, -19.6]]) {
      this.light(lx, 5.4, lz, { color: 0xffb45e, intensity: 10, distance: 14, circuit: "service" });
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), this.mats.get("glowWarm").clone());
      bulb.position.set(lx, 5.35, lz);
      this.scene.add(bulb);
    }
    // QA 2026-09-08 (user: "delete some of the nonsense"): the icosahedron
    // bush blobs are gone — replaced by CC0 Quaternius street furniture
    // (real low-poly models, solid colliders added on load).
    this._decoProp("assets/models/quaternius/Streetlight_Double.glb", -8.8, 3.28, -19.2, 0, 1, { solid: true });
    this._decoProp("assets/models/quaternius/Streetlight_Single.glb", 8.7, 3.28, -16.2, Math.PI, 1, { solid: true });
    this._decoProp("assets/models/quaternius/TrafficLight.glb", 8.6, 3.28, -19.0, -Math.PI / 2, 1, { solid: true });
    this._decoProp("assets/models/quaternius/Sign_Stop.glb", -8.6, 3.28, -12.6, Math.PI / 2, 1, { solid: true });
    this._decoProp("assets/models/quaternius/Sign_NoParking.glb", 8.6, 3.28, -11.6, -Math.PI / 2, 1, { solid: true });

    // ---- perimeter fence at the slab edge: the street parcel is sealed ----
    const post = this.mats.get("darkMetal");
    const railMat = this.mats.get("metalRaw");
    const fenceH = 2.05;
    // USER 2026-09-12 floor audit: the parcel's SOUTH edge was open — the
    // side runs stopped at z -10.9 and nothing sealed the street, so a walker
    // could leave the map across the -10.9..-10.4 asphalt strip. New south
    // fence closes x beyond the stairwell block (its walls at x +/-1.0..1.3
    // close the middle). Side runs now meet the south line at z -10.55.
    const fenceLines = [
      { x0: -10.05, z0: -20.05, x1: 10.05, z1: -20.05 },
      { x0: -10.05, z0: -10.55, x1: -10.05, z1: -20.05 },
      { x0: 10.05, z0: -20.05, x1: 10.05, z1: -10.55 },
      { x0: -10.05, z0: -10.55, x1: -1.3, z1: -10.55 },
      { x0: 1.3, z0: -10.55, x1: 10.05, z1: -10.55 },
    ];
    for (const L of fenceLines) {
      const len = Math.hypot(L.x1 - L.x0, L.z1 - L.z0);
      const n = Math.max(2, Math.round(len / 2.1));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = L.x0 + (L.x1 - L.x0) * t;
        const pz = L.z0 + (L.z1 - L.z0) * t;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, fenceH, 0.09), post);
        p.position.set(px, 3.2 + fenceH / 2, pz);
        p.castShadow = true;
        this.scene.add(p);
      }
      // two horizontal rails
      for (const ry of [0.55, fenceH - 0.25]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.05), railMat);
        rail.position.set((L.x0 + L.x1) / 2, 3.2 + ry, (L.z0 + L.z1) / 2);
        rail.rotation.y = Math.atan2(L.z1 - L.z0, L.x1 - L.x0) * -1;
        this.scene.add(rail);
      }
      // mesh infill (visible chain-link substitute)
      // QA 2026-09-07: rotation was off by +PI/2 — the infill planes stood
      // PERPENDICULAR to the fence line, so three huge half-transparent dark
      // planes cut across the whole street parcel (one through the kiosk
      // door at x=0 out to z=-30) with no collision: THE "black wall".
      // Second pass same day: even correctly aligned, the solid 0.42-opacity
      // unlit metal sheet read as a black band at eye level in every view of
      // the parcel edge. Now an alpha-tested diamond lattice: see-through,
      // same alignment as the rails, collider unchanged along the line.
      const link = this.mats.chainLink || (this.mats.chainLink = (() => {
        const t = makeChainLinkTexture();
        return new THREE.MeshStandardMaterial({
          map: t, transparent: true, alphaTest: 0.35, color: 0x9aa3ad,
          roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide,
        });
      })());
      const fgeo = new THREE.PlaneGeometry(len, fenceH - 0.2);
      { // bake ~0.35m diamond pitch into UVs so the shared texture can stay
        // at repeat 1 across all three fence lines
        const uv = fgeo.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, uv.getX(i) * (len / 0.35), uv.getY(i) * ((fenceH - 0.2) / 0.35));
        }
        uv.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(fgeo, link);
      mesh.position.set((L.x0 + L.x1) / 2, 3.2 + fenceH / 2, (L.z0 + L.z1) / 2);
      mesh.rotation.y = Math.atan2(L.z1 - L.z0, L.x1 - L.x0) * -1;
      this.scene.add(mesh);
      // solid collider along the whole line
      const ex = Math.abs(L.x1 - L.x0) / 2 + 0.08, ez = Math.abs(L.z1 - L.z0) / 2 + 0.08;
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(Math.min(L.x0, L.x1) - 0.08, 3.1, Math.min(L.z0, L.z1) - 0.08),
          new THREE.Vector3(Math.max(L.x0, L.x1) + 0.08, 3.2 + fenceH, Math.max(L.z0, L.z1) + 0.08)
        ),
        active: true, tag: "fence",
      });
      void ex; void ez;
    }
    // curb — visual only (collider swept players off the stair ramp; QA-found)
    // QA 2026-09-08: the curb used to span the FULL width x -10..10, roofing
    // the stairwell opening (x -1.3..1.3) at head height with a no-collision
    // slab — players descending the stair walked into a floating concrete
    // strip. Split into two segments so the stair shaft stays clear.
    this.slab(-10, -1.3, 3.2, 3.3, -10.9, -10.4, this.mats.get("concreteDark"), { cast: false, collide: false });
    this.slab(1.3, 10, 3.2, 3.3, -10.9, -10.4, this.mats.get("concreteDark"), { cast: false, collide: false });

    this._streetProps();
  }

  // Research session 3 (2026-09-07): real CC0/CC-BY glTF props from the
  // Khronos glTF-Sample-Assets set (acquired via GitHub sparse clone — see
  // research/download-manifest.json). Additive street dressing; every prop
  // gets a matching AABB collider so nothing reads as a walk-through ghost.
  _streetProps() {
    // fridge against the east kerb, facing the roadway (CC-BY Eric Chadwick)
    this._gltfProp("assets/models/CommercialRefrigerator.glb", 8.4, 3.2, -15.0, -Math.PI / 2, { dim: "height", size: 1.95, solid: true });
    // traffic cones on the tarmac (CC-BY hinndia)
    this._gltfProp("assets/models/TrafficCone/TrafficCone.gltf", 2.6, 3.2, -12.3, 0.5, { dim: "height", size: 0.62, solid: false });
    this._gltfProp("assets/models/TrafficCone/TrafficCone.gltf", -3.4, 3.2, -17.3, -1.2, { dim: "height", size: 0.62, solid: false });
    // abandoned toy car near the west kerb (CC0 Guido Odendahl)
    this._gltfProp("assets/models/ToyCar.glb", -5.1, 3.2, -12.6, 0.4, { dim: "length", size: 0.46, solid: false });
    // boombox on the kiosk floor beside the meter box (CC0 Microsoft)
    this._gltfProp("assets/models/BoomBox.glb", 1.15, 3.2, -12.15, Math.PI * 0.75, { dim: "length", size: 0.5, solid: false });

    // ---- USER 2026-09-12: "the space is too scanty — create new houses". ----
    // A real neighbourhood row across the fence (CC0 KayKit City Builder
    // Bits, glTF — see CREDITS.md). These sit OUTSIDE the playable bounds on
    // the city-ground disc (fence + bounds colliders seal them off), so they
    // are decorative: no colliders, dim city-glow lift so facades don't read
    // black under fog. Native KayKit scale is ~2x2x[1.6..3] units — scaled
    // per-model to true house proportions (A/B ~9m 2-story, F ~8.9, D/G ~9.5+).
    const kk = "assets/models/kaykit/";
    const houses = [
      ["building_A.gltf", -14.5, -26.2, Math.PI, 4.5],
      ["building_D.gltf", -5.0, -26.8, Math.PI, 3.3],
      ["building_F.gltf", 4.6, -26.0, Math.PI, 3.8],
      ["building_B.gltf", 14.2, -26.6, Math.PI, 4.5],
      ["building_G.gltf", 23.4, -25.4, Math.PI * 0.97, 3.2],
    ];
    for (const [f, hx, hz, hy, hs] of houses) {
      this._decoProp(kk + f, hx, 3.12, hz, hy, hs, { glow: true });
    }
    // watertower silhouette closing the western end of the row
    this._decoProp(kk + "watertower.gltf", -21.5, 3.12, -27.6, 0.3, 7, { glow: true });
    // yard bushes along the house fronts (outside the fence, decorative)
    for (const [bx, bz, br] of [[-10.9, -21.6, 0.7], [-0.2, -21.8, 2.4], [9.4, -21.5, 1.2], [19.3, -21.9, 0.4]]) {
      this._decoProp(kk + "bush.gltf", bx, 3.14, bz, br, 3, { glow: true });
    }

    // In-parcel street furniture (these ARE reachable -> solid colliders).
    // Cars parked parallel to the kerbs (length along z) leave the centre
    // lane clear for the kiosk door. Positions verified against every other
    // prop collider (verify_world no_solid_overlaps).
    this._decoProp(kk + "car_sedan.gltf", 5.3, 3.22, -17.6, 0, 4.6, { solid: true });
    this._decoProp(kk + "car_taxi.gltf", -6.2, 3.22, -15.0, 0, 4.6, { solid: true });
    this._decoProp(kk + "firehydrant.gltf", 8.35, 3.2, -13.6, Math.PI / 2, 2.2, { solid: true });
    this._decoProp(kk + "bench.gltf", -8.3, 3.2, -14.2, -Math.PI / 2, 3, { solid: true });
    this._decoProp(kk + "dumpster.gltf", -8.7, 3.2, -17.2, Math.PI / 2, 3, { solid: true });
    this._decoProp(kk + "trash_A.gltf", 7.85, 3.2, -17.9, 0.8, 4, { solid: true });
    this._decoProp(kk + "trash_B.gltf", -7.9, 3.2, -12.4, -0.6, 5, { solid: true });
  }

  // Loads one glTF prop, normalizes it to `size` along `dim` ("height" |
  // "length"), grounds it at y, and registers a collider matching its
  // footprint. Failures are warnings only — the world must never break
  // because a dressing prop 404s.
  // USER 2026-09-12 (stair-shaft scan): the TrafficCone Sketchfab model
  // shipped a 19.7m "shadow-catcher" Plane node — two cones put two giant
  // collision-less planes through the street AND the stairwell shaft, reading
  // as a smooth false floor/ceiling cutting the staircase. Two defenses:
  //   1. the asset itself was cleaned (Plane/Camera/PointLight nodes removed)
  //   2. this guard drops any mesh whose longest side exceeds maxSide —
  //      a dressing prop can never smuggle in world-scale geometry again.
  _gltfProp(url, x, y, z, yaw, { dim = "height", size = 1, solid = false } = {}) {
    this.propsPending = (this.propsPending || 0) + 1;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(url, (gltf) => {
      this.propsPending--;
      const root = gltf.scene;
      // bbox from MESHES only — some GLBs carry far-away helper nodes
      // (cameras/lights/empties) that would inflate the collider absurdly.
      const meshBoxes = (obj) => {
        const list = [];
        obj.updateWorldMatrix(true, true);
        obj.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = false;
          o.receiveShadow = true;
          const g = o.geometry;
          if (!g.boundingBox) g.computeBoundingBox();
          list.push({ box: g.boundingBox.clone().applyMatrix4(o.matrixWorld), obj: o });
        });
        return list;
      };
      const unionBox = (boxes, maxSize) => {
        const b = new THREE.Box3();
        for (const bx of boxes) {
          const ext = bx.getSize(new THREE.Vector3());
          // Sketchfab-style exports often include a giant ground "Plane"
          // mesh — never let a dressing prop's collider/size derive from it.
          if (Math.max(ext.x, ext.y, ext.z) > maxSize) continue;
          b.union(bx);
        }
        return b;
      };
      const cap = Math.max(size * 6, 3);
      // QA 2026-09-08 (robot-arm incident): the helper-mesh exclusion is
      // decided in PRE-SCALE space and the surviving boxes are carried
      // through scaling. Re-filtering after scale let giant helper meshes
      // sneak back under the cap and blow up the collider.
      // USER 2026-09-12 (stair-shaft scan): oversized rogue meshes are now
      // also HIDDEN, not just excluded from the bbox — the TrafficCone's
      // 19.7m shadow-plane rendered as a collision-less false floor through
      // the street and the stairwell shaft while the collider math ignored
      // it. Visible-but-not-collidable is exactly the deception class this
      // loader must never ship.
      const entries = meshBoxes(root);
      let incl = entries.filter(({ box: b }) => {
        const e = b.getSize(new THREE.Vector3());
        return Math.max(e.x, e.y, e.z) <= cap;
      }).map(({ box }) => box);
      for (const { box: b, obj } of entries) {
        const e = b.getSize(new THREE.Vector3());
        if (Math.max(e.x, e.y, e.z) > cap) {
          obj.visible = false;
          console.warn(`[world] prop ${url}: hid oversized rogue mesh (${Math.max(e.x, e.y, e.z).toFixed(1)}m > cap ${cap.toFixed(1)}m)`);
        }
      }
      if (incl.length === 0) {
        // cm-scale models (whole mesh over the cap): fall back to every
        // non-flat mesh so the prop still sizes and collides (ToyCar,
        // wide_books_shelf incidents).
        for (const { obj } of entries) obj.visible = true; // un-hide: whole model is the outlier
        incl = entries.map(({ box }) => box).filter((b) => {
          const e = b.getSize(new THREE.Vector3());
          return Math.min(e.x, e.y, e.z) > 1e-3;
        });
      }
      const bb = new THREE.Box3();
      incl.forEach((b) => bb.union(b));      const cur = dim === "height" ? bb.max.y - bb.min.y : Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const s = cur > 0 ? size / cur : 1;
      root.scale.setScalar(s);
      const cx = ((bb.min.x + bb.max.x) / 2) * s, cz = ((bb.min.z + bb.max.z) / 2) * s;
      // re-center inside a wrapper so yaw rotates around the prop's own center
      root.position.set(-cx, -bb.min.y * s, -cz);
      const wrap = new THREE.Group();
      wrap.add(root);
      wrap.position.set(x, y, z);
      wrap.rotation.y = yaw;
      this.scene.add(wrap);
      root.updateWorldMatrix(true, false);
      const bb3 = new THREE.Box3();
      incl.forEach((b) => bb3.union(b.clone().applyMatrix4(root.matrixWorld)));
      // degenerate (empty-union => NaN) boxes never become colliders
      if (!isFinite(bb3.min.x + bb3.min.y + bb3.min.z + bb3.max.x + bb3.max.y + bb3.max.z)) {
        console.warn(`[world] prop bbox degenerate, no collider: ${url}`);
        return;
      }
      const pad = solid ? 0.02 : 0.0;
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(bb3.min.x - pad, bb3.min.y, bb3.min.z - pad),
          new THREE.Vector3(bb3.max.x + pad, bb3.max.y + 0.0, bb3.max.z + pad)
        ),
        active: true, soft: !solid, tag: "prop", url,
      });
    }, undefined, (err) => {
      this.propsPending--;
      console.warn(`[world] optional prop failed to load: ${url} (${err?.message || err})`);
    });
  }

  // Decorative GLB instance (CC0 packs — see research/download-manifest.json).
  // Base sits at (x,y,z); optional solid collider once loaded. Skyline use
  // stays non-collidable: those are 25m+ outside the playable bounds.
  _decoProp(url, x, y, z, yaw = 0, scale = 1, { solid = false, glow = false } = {}) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(url, (gltf) => {
      const root = gltf.scene;
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        if (glow) { // night skyline: unlit PBR reads black — lift with a dim city-glow emissive
          for (const mm of Array.isArray(o.material) ? o.material : [o.material]) {
            if (mm && mm.emissive) { mm.emissive.setHex(0x18222e); mm.emissiveIntensity = 1; }
          }
        }
      });
      const bb = new THREE.Box3().setFromObject(root);
      root.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      const wrap = new THREE.Group();
      wrap.add(root);
      wrap.position.set(x, y, z);
      wrap.rotation.y = yaw;
      wrap.scale.setScalar(scale);
      this.scene.add(wrap);
      if (solid) {
        wrap.updateWorldMatrix(true, true);
        const wb = new THREE.Box3().setFromObject(wrap);
        this.colliders.push({ box: wb, active: true, soft: false, tag: "prop", url });
      }
    }, undefined, (err) => console.warn(`[world] deco prop failed: ${url} (${err?.message || err})`));
  }

  _kiosk() {
    const m = this.mats;
    // floor
    this.slab(-1.7, 1.7, 2.9, 3.2, -14.7, -11.3, m.get("concreteDark"));
    this.ground(-1.7, 1.7, -14.7, -11.3, 3.2, "concrete");
    // walls (door gap north, stair opening south)
    // QA 2026-09-07: side walls stopped at 5.32/5.3 while the roof starts at
    // 5.6 — a black open slit ran across the whole north and south facades.
    // Sides now rise flush to the roof (the door headers stay above the gaps).
    this.wallX(-14.85, -1.85, -0.55, 3.2, 5.6, m.get("metalPainted"));
    this.wallX(-14.85, 0.55, 1.85, 3.2, 5.6, m.get("metalPainted"));
    this.wallX(-14.85, -0.55, 0.55, 5.32, 5.6, m.get("metalPainted"));
    this.wallZ(1.85, -14.85, -11.15, 3.2, 5.6, m.get("metalPainted"));
    this.wallZ(-1.85, -14.85, -11.15, 3.2, 5.6, m.get("metalPainted"));
    this.wallX(-11.15, -1.85, -0.8, 3.2, 5.6, m.get("metalPainted"));
    this.wallX(-11.15, 0.8, 1.85, 3.2, 5.6, m.get("metalPainted"));
    this.wallX(-11.15, -0.8, 0.8, 5.3, 5.6, m.get("metalPainted"));
    this.slab(-1.85, 1.85, 5.6, 5.9, -14.85, -11.15, m.get("metalPainted"));

    // street door (north) — locks behind player
    const dStreet = new Door({
      id: "door_street", materials: m, position: [-0.545, 3.2, -14.85], yaw: 0,
      width: 1.06, openSign: 1,
    });
    this.addDoor(dStreet, { swingCollider: true });

    // USER 2026-09-12: the framed poster sign above the first door is GONE
    // (removed on request — it read as a stuck-on poster). Style is now a
    // see-through hologram projection, no backing board, and it sits HIGHER
    // on the facade (old framed sign: y 4.85, h 0.47; hologram text center
    // y 5.02). Additive shader: scanlines + band sweep + glitch jitter, the
    // wall shows through it. Projector housing sits flush on the wall face.
    const holo = kit.hologramSign(m, makeSignTexture(["STORMWATER", "STATION 6"], { w: 512, h: 160, color: "#eef8ff", bg: "#010409", size: 44 }), 1.7, 0.53, { alpha: 0.62 });
    holo.position.set(0, 4.92, -14.92);
    holo.rotation.y = Math.PI; // face the street
    this.scene.add(holo);
    (this.holoMats = this.holoMats || []).push(holo.userData.holoMat);
    // faint cyan spill so the projection reads on the wet asphalt
    this.light(0, 5.1, -15.4, { color: 0x69c9ef, intensity: 2.6, distance: 6.5, circuit: "always" });
    // QA 2026-09-07: OpenCV pass found the first-door approach 86% uniform
    // black at night — the door must read as THE way in. Entry lamp over the
    // sign + a dim porch light, both on the always-live circuit.
    const porch = kit.wallLamp(m, { on: true });
    // QA 2026-09-11 (user screenshots): was at (0,5.35,-15.02) — the mount
    // plate floated 0.06 off the outer face and the open shade silhouetted
    // above the 5.6 parapet as a sky-arch. Mount now embeds in the wall
    // (outer face -15.0) and the closed dome tops out at 5.47.
    // USER 2026-09-12: shifted off-centre (x 1.5) so the dome no longer sits
    // in the middle of the hologram sign text above the door.
    this.place(porch, 1.5, 5.3, -14.95, Math.PI, { collide: false }); // faces street
    this.light(1.5, 5.1, -15.6, { color: 0xffd9a0, intensity: 6, distance: 8, circuit: "always" });
    // small meter box
    const meter = kit.breakerBox(m, { levers: 2 });
    this.place(meter, 1.55, 4.3, -13.0, Math.PI / 2, { collide: false });
    // QA 2026-09-08 (user: "guns rather than blocks"): CC0 flat-guns rack on
    // the kiosk west wall — the station kiosk doubles as a security post.
    this.box(-1.67, 4.2, -13.3, 0.05, 0.55, 1.15, m.get("wood"), { collide: false });
    this._gltfProp("assets/models/guns/rifle.glb", -1.6, 4.28, -12.9, Math.PI / 2, { dim: "length", size: 0.85 });
    this._gltfProp("assets/models/guns/pistol.glb", -1.6, 4.08, -13.8, Math.PI / 2, { dim: "length", size: 0.28 });
    // kiosk interior lamp so the first room isn't a black box
    const kl = kit.wallLamp(m, { on: true });
    this.place(kl, -1.7, 4.6, -13.0, Math.PI / 2, { collide: false });
    this.light(0, 5.0, -13.0, { color: 0xdfe8ff, intensity: 5, distance: 6, circuit: "lighting" });
    this.room({ id: "kiosk", name: "Street Kiosk", min: [-1.85, 3.2, -14.85], max: [1.85, 5.6, -11.15], zone: "street" });
  }

  _stairwell() {
    const m = this.mats;
    this.wallZ(-1.15, -11.3, -6.2, -0.3, 5.6, m.get("concreteWall"));
    this.wallZ(1.15, -11.3, -6.2, -0.3, 5.6, m.get("concreteWall"));
    // USER 2026-09-12 (stair-shaft scan): the shaft's south face above the
    // d5 archway header (y 3.4..5.6, x -1..1) was open to the night sky —
    // up-rays from the stairs showed stars over the atrium wall. Flush panel
    // across the full gap width closes the shaft to its roof line (door d5
    // swings into the atrium and tops out at y 2.12 — no conflict).
    this.wallX(-6.35, -1, 1, 3.4, 5.6, m.get("concreteWall"));
    this.slab(-1.0, 1.0, 5.3, 5.6, -11.3, -6.2, m.get("concreteDark")); // shaft roof
    // ramp: visual steps + handrail
    const steps = new THREE.Group();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const z = -11.3 + t * 5.1;
      const y = 3.2 - t * 3.2;
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.32, 5.1 / n + 0.02), this.mats.variant("concreteDark", 1, 1));
      st.position.set(0, y - 0.16, z + (5.1 / n) / 2);
      st.receiveShadow = true;
      steps.add(st);
    }
    // USER 2026-09-12 floor audit: the visual steps ended at z -6.37 while the
    // ramp's ground region runs to -6.2 — a thin see-through slot underfoot at
    // the ramp foot. Filler tops at y 0, flush with the atrium slab below.
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.34, 0.44), this.mats.variant("concreteDark", 1, 1));
    foot.position.set(0, -0.17, -6.27);
    foot.receiveShadow = true;
    steps.add(foot);
    this.scene.add(steps);
    this.ground(-1.0, 1.0, -11.3, -6.2, 3.2, "concrete", { axis: "z", from: -11.3, to: -6.2, y0: 3.2, y1: 0 });
    // handrail on east side
    const railPts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      railPts.push([0.92, 3.2 - t * 3.2 + 1.0, -11.3 + t * 5.1]);
    }
    this.scene.add(kit.pipeRun(m, railPts, 0.03));
    // wall lamp (on emergency circuit)
    const lamp = kit.wallLamp(m, { on: true });
    this.place(lamp, -1.0, 3.6, -8.5, Math.PI / 2, { collide: false });
    const fx = this.makeToggleable(lamp);
    this.light(-0.7, 3.5, -8.5, { color: 0xffd9a0, intensity: 4, distance: 7, circuit: "lighting" });
    // stencil
    const sten = kit.signPlane(m, makeSignTexture(["LEVEL -1"], { w: 256, h: 96, color: "#cfd6cf", bg: "#20241f", size: 34 }), 0.9, 0.34);
    sten.position.set(1.0, 2.8, -9.5);
    sten.rotation.y = -Math.PI / 2;
    this.scene.add(sten);
    this.room({ id: "stairwell", name: "Access Stair", min: [-1.15, 0, -11.3], max: [1.15, 5.6, -6.2], zone: "stair" });
  }

  _atrium() {
    const m = this.mats;
    this.slab(-4, 4, -0.3, 0, -6.2, 0.2, m.get("concreteFloor"));
    this.ground(-4, 4, -6.2, 0.2, 0, "concrete");
    // north wall with stair gap
    this.wallX(-6.35, -4.15, -0.8, 0, 3.4, m.get("concreteWall"));
    this.wallX(-6.35, 0.8, 4.15, 0, 3.4, m.get("concreteWall"));
    this.wallX(-6.35, -0.8, 0.8, 2.2, 3.4, m.get("concreteWall"));
    // south wall with D1 gap
    this.wallX(0.35, -4.15, -0.55, 0, 3.4, m.get("concreteWall"));
    this.wallX(0.35, 0.55, 4.15, 0, 3.4, m.get("concreteWall"));
    this.wallX(0.35, -0.55, 0.55, 2.15, 3.4, m.get("concreteWall"));
    this.wallZ(-4.15, -6.35, 0.35, 0, 3.4, m.get("concreteWall"));
    this.wallZ(4.15, -6.35, 0.35, 0, 3.4, m.get("concreteWall"));
    this.slab(-4.15, 4.15, 3.4, 3.7, -6.35, 0.35, m.get("concreteDark"));

    // backlit main sign (south wall above door)
    const sign = kit.signPlane(m, makeSignTexture(["STORMWATER LIFT — STN 6", "KEEP CLEAR — PUMP CIRCUIT LIVE"], { w: 640, h: 160, color: "#ffe9b0", bg: "#171a17", size: 40 }), 2.6, 0.65, { backing: true, lit: true });
    sign.position.set(0, 2.75, 0.18);
    sign.rotation.y = Math.PI;
    this.scene.add(sign);

    // reception desk (west), chair, logbook
    this.place(kit.desk(m), -2.6, 0, -3.2, Math.PI / 2);
    this.place(kit.chair(m), -1.6, 0, -3.4, -Math.PI / 2 + 0.4);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.24), m.get("paper"));
    book.position.set(-2.55, 0.79, -3.0);
    this.scene.add(book);
    this.bookMesh = book;

    // notice board on north wall
    this.place(kit.noticeBoard(m, [
      { title: "NOTICE", lines: ["Decommissioned", "by order 91-C", "No entry after", "dark."] },
      { title: "SHIFT", lines: ["Night crews", "stand down", "from Friday.", ""] },
      { title: "PUMP 2", lines: ["Do NOT stop", "pump 2 without", "sump beaters", "on manual."] },
    ]), 3.9, 1.7, -3.2, -Math.PI / 2, { collide: false });

    // lockers east wall + crates
    this.place(kit.locker(m), 3.69, 0, -5.2, -Math.PI / 2); // flush to east wall (face at x=4.0)
    this.place(kit.locker(m), 3.69, 0, -4.5, -Math.PI / 2);
    // dressing: toolbox beside the logbook desk (visual QA: lone-desk read;
    // kept clear of the desk and west wall colliders)
    this.place(kit.toolbox(m), -3.45, 0, -3.6, 0.2);
    this.place(kit.crate(m, 0.6), 3.3, 0, -1.2, 0.3);
    this.place(kit.barrel(m), -3.5, 0, -0.9, 0);
    // USER 2026-09-12: KayKit crate pair fills the bare NW corner
    this._decoProp("assets/models/kaykit/box_A.gltf", -3.4, 0, -5.65, 0.4, 3.6, { solid: true });
    this._decoProp("assets/models/kaykit/box_B.gltf", -2.35, 0, -5.8, -0.3, 3.4, { solid: true });

    // ceiling fixtures (lighting circuit)
    const f1 = kit.fluorescentFixture(m, { on: false });
    this.place(f1, -1.8, 3.32, -3.0, 0, { collide: false });
    const f2 = kit.fluorescentFixture(m, { on: false });
    this.place(f2, 1.8, 3.32, -3.0, 0, { collide: false });
    this.fixtures.push({ ...this.makeToggleable(f1), room: "atrium" });
    this.fixtures.push({ ...this.makeToggleable(f2), room: "atrium" });
    this.light(0, 3.1, -3.0, { color: 0xdfe8ff, intensity: 9, distance: 11, circuit: "lighting", room: "atrium" });

    this.room({ id: "atrium", name: "Reception", min: [-4.15, 0, -6.35], max: [4.15, 3.4, 0.35], zone: "atrium" });
  }

  _corridor() {
    const m = this.mats;
    this.slab(-1.3, 1.3, -0.3, 0, 0.35, 12.35, m.get("concreteFloor"));
    this.ground(-1.3, 1.3, 0.35, 12.35, 0, "concrete");
    this.wallZ(1.45, 0.35, 12.35, 0, 2.8, m.get("concreteWall"));
    this.wallZ(-1.45, 0.35, 8.9, 0, 2.8, m.get("concreteWall"));
    this.wallZ(-1.45, 10.9, 12.35, 0, 2.8, m.get("concreteWall"));
    this.wallZ(-1.45, 8.9, 10.9, 2.15, 2.8, m.get("concreteWall")); // nook header
    this.slab(-1.45, 1.45, 2.8, 3.1, 0.35, 12.35, m.get("concreteDark"));

    // ceiling pipe runs
    this.scene.add(kit.pipeRun(m, [[-1.1, 2.6, 1], [-1.1, 2.6, 6], [-0.9, 2.55, 9], [-0.9, 2.55, 12.2]], 0.09));
    this.scene.add(kit.pipeRun(m, [[0.95, 2.68, 1], [0.95, 2.68, 5], [0.75, 2.6, 8], [0.75, 2.6, 12.2]], 0.06));

    // signage: PUMP HALL arrow (lighting circuit glow)
    const s1 = kit.signPlane(m, makeSignTexture(["PUMP HALL"], { w: 512, h: 110, color: "#d8c26a", arrow: "right" }), 1.1, 0.24, { backing: true, lit: true });
    s1.position.set(1.28, 1.9, 9.6);
    s1.rotation.y = -Math.PI / 2;
    this.scene.add(s1);
    const s2 = kit.signPlane(m, makeSignTexture(["VALVE GALLERY"], { w: 512, h: 110, color: "#d8c26a" }), 1.0, 0.22, { backing: true, lit: true });
    s2.position.set(-1.28, 1.7, 5.2);
    s2.rotation.y = Math.PI / 2;
    this.scene.add(s2);

    this.place(kit.extinguisher(m), -1.28, 1.25, 4.2, Math.PI / 2, { collide: false });

    // fixtures
    for (const z of [2.5, 6.5, 10.5]) {
      const f = kit.fluorescentFixture(m, { on: false });
      this.place(f, 0, 2.72, z, 0, { collide: false });
      this.fixtures.push({ ...this.makeToggleable(f), room: "corridor" });
    }
    this.light(0, 2.5, 6.5, { color: 0xdfe8ff, intensity: 8, distance: 14, circuit: "lighting", room: "corridor" });

    this.room({ id: "corridor", name: "Service Corridor", min: [-1.45, 0, 0.35], max: [1.45, 2.8, 12.35], zone: "corridor" });

    this._breakernook();
  }

  _breakernook() {
    const m = this.mats;
    this.slab(-3.3, -1.3, -0.3, 0, 8.4, 10.4, m.get("concreteFloor"));
    this.ground(-3.3, -1.3, 8.4, 10.4, 0, "concrete");
    this.wallZ(-3.45, 8.25, 10.55, 0, 2.8, m.get("concreteWall"));
    this.wallX(8.25, -3.45, -1.45, 0, 2.8, m.get("concreteWall"));
    this.wallX(10.55, -3.45, -1.45, 0, 2.8, m.get("concreteWall"));
    this.slab(-3.45, -1.45, 2.8, 3.1, 8.25, 10.55, m.get("concreteDark"));

    // breaker box on west wall (INTERACTIVE — O2)
    const bb = kit.breakerBox(m, { levers: 6, wide: true });
    this.place(bb, -3.28, 1.5, 9.4, Math.PI / 2, { collide: false });
    this.breakerBox = bb;
    // lamp above (emergency circuit — listed ON in note)
    const f = kit.fluorescentFixture(m, { on: true });
    this.place(f, -2.4, 2.72, 9.4, 0, { collide: false });
    this.fixtures.push({ ...this.makeToggleable(f), room: "nook" });
    this.light(-2.4, 2.4, 9.4, { color: 0xdfe8ff, intensity: 5, distance: 7, circuit: "lighting" });

    // fuse crate + clipboard
    this.place(kit.crate(m, 0.55), -2.9, 0, 8.9, 0.2);
    this.clipboardMesh = this._paperProp("BREAKER SCHEDULE", ["1 corridor .... dead", "2 atrium ...... dead", "3 pump hall ... dead", "4 stairs ....... on", "5 nook ......... on"], -2.9, 0.86, 8.9, 0.25);

    this.room({ id: "breakernook", name: "Breaker Nook", min: [-3.45, 0, 8.25], max: [-1.45, 2.8, 10.55], zone: "corridor" });
  }

  _paperProp(title, lines, x, y, z, yaw = 0) {
    const tex = makePaperTexture(title, lines);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    p.position.set(x, y, z);
    p.rotation.set(-Math.PI / 2, 0, yaw);
    this.scene.add(p);
    return p;
  }

  _pumphall() {
    const m = this.mats;
    this.slab(-7, 7, -0.3, 0, 12.35, 23.35, m.get("concreteFloor"));
    this.ground(-7, 7, 12.35, 23.35, 0, "concrete");
    // north wall (two flanks + door gap + buttress above corridor)
    this.wallX(12.35, -7.15, -1.45, 0, 7, m.get("concreteWall"));
    this.wallX(12.35, 1.45, 7.15, 0, 7, m.get("concreteWall"));
    this.wallX(12.35, -1.45, -0.55, 0, 7, m.get("concreteWall"));
    this.wallX(12.35, 0.55, 1.45, 0, 7, m.get("concreteWall"));
    this.wallX(12.35, -0.55, 0.55, 2.15, 7, m.get("concreteWall"));
    // east wall with D3 gap
    this.wallZ(7.15, 12.35, 17.15, 0, 7, m.get("concreteWall"));
    this.wallZ(7.15, 18.25, 23.35, 0, 7, m.get("concreteWall"));
    this.wallZ(7.15, 17.15, 18.25, 2.15, 7, m.get("concreteWall"));
    this.wallZ(-7.15, 12.35, 23.35, 0, 7, m.get("concreteWall"));
    this.wallX(23.35, -7.15, 7.15, 0, 7, m.get("concreteWall"));
    this.slab(-7.15, 7.15, 7, 7.4, 12.35, 23.35, m.get("concreteDark"));
    // roof beams
    for (const z of [14, 17.7, 21.4]) {
      this.box(0, 6.75, z, 14.3, 0.5, 0.5, m.get("concreteDark"), { collide: false });
    }

    // pump trains (west + east machines, running)
    const p1 = kit.pumpTrain(m, 1);
    this.place(p1, -4.4, 0, 15.2, Math.PI / 2);
    const p2 = kit.pumpTrain(m, 2);
    this.place(p2, -4.4, 0, 20.2, Math.PI / 2);
    this.spinners.push(p1.userData.flywheel, p2.userData.flywheel);
    // status LEDs
    this.light(-5.9, 1.5, 15.2, { color: 0x39ff7a, intensity: 1.2, distance: 4, circuit: "pumps" });
    this.light(-5.9, 1.5, 20.2, { color: 0x39ff7a, intensity: 1.2, distance: 4, circuit: "pumps" });

    // gantry along east wall (viewing platform)
    const gantry = kit.gantryPlatform(m, 8);
    this.place(gantry, 4.4, 2.6, 17.85, Math.PI / 2, { collide: false });
    // QA 2026-09-07: OpenCV flagged the gantry end as a 31% uniform-black
    // mass (fixtures there are on the dead lighting circuit). Small always-on
    // lamps so the platform and its rail read at night.
    this.light(4.4, 3.4, 14.4, { color: 0xffd9a0, intensity: 5, distance: 7, circuit: "lighting" });
    this.light(4.4, 3.4, 21.4, { color: 0xffd9a0, intensity: 5, distance: 7, circuit: "lighting" });
    // stair onto gantry: steps rise EASTWARD toward the landing/deck
    // (QA 2026-09-08: the step line was mirrored — low steps sat at the
    // landing end, so the stairs visually climbed AWAY from the deck while
    // the ground ramp climbed toward it.)
    const gsteps = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.33, 1.1), m.variant("metalRaw", 1, 1));
      st.position.set(0.61 + i * 0.42, 0.16 + i * 0.325, 12.9);
      st.receiveShadow = true;
      gsteps.add(st);
    }
    this.scene.add(gsteps);
    // landing connecting stair top to deck
    this.box(4.4, 2.48, 13.62, 1.3, 0.24, 0.55, m.get("darkMetal"));
    this.ground(0.15, 3.78, 12.4, 13.2, 0, "metal", { axis: "x", from: 3.55, to: 0.19, y0: 2.6, y1: 0 });
    this.ground(3.75, 5.05, 13.35, 21.85, 2.6, "grating"); // deck + landing
    // QA 2026-09-07: the gantry railing posts were collision-less — the probe
    // walked through them along both deck edges. Thin solid rails so the deck
    // edge reads as protected (matches the visible post lines at x 3.8/5.0).
    this.colliders.push({
      box: new THREE.Box3(new THREE.Vector3(3.72, 2.6, 13.4), new THREE.Vector3(3.86, 3.7, 21.85)),
      active: true, tag: "gantry-rail",
    });
    this.colliders.push({
      box: new THREE.Box3(new THREE.Vector3(4.94, 2.6, 13.4), new THREE.Vector3(5.08, 3.7, 21.85)),
      active: true, tag: "gantry-rail",
    });

    // control panel with taped note (INTERACTIVE — O3)
    const cp = kit.controlPanel(m);
    this.place(cp, -6.3, 0, 18.2, Math.PI / 4);
    this.controlPanel = cp;

    // big red standby valve (locked, flavor)
    const vv = kit.valveWheel(m, "redPaint");
    vv.position.set(-6.85, 1.4, 21.8);
    vv.rotation.y = Math.PI / 2;
    this.scene.add(vv);

    // barrels + toolbox + drum
    this.place(kit.barrel(m), 6.3, 0, 22.6, 0);
    this.place(kit.barrel(m), 5.6, 0, 22.9, 0);
    // (original toolbox at (-2.2,0,22.8) removed — it sat inside the new
    // workbench desk footprint; QA pair-probe found the penetration)
    // QA 2026-09-08 (user: replace procedural dressing with real PBR props):
    // MIT warehouse-3d pack (hookex/warehouse-3d) — cardboard box + electrical
    // cabinet + racks + robot arm instead of procedural crate/box blobs.
    this._gltfProp("assets/models/warehouse/box/scene.gltf", 6.4, 0, 13.3, 0.15, { dim: "height", size: 0.8, solid: true });
    this._gltfProp("assets/models/warehouse/battery/scene.gltf", -6.55, 0, 13.2, Math.PI / 2, { dim: "height", size: 1.7, solid: true });
    this._gltfProp("assets/models/warehouse/shelf/scene.gltf", -6.5, 0, 15.6, Math.PI / 2, { dim: "height", size: 1.6, solid: true });
    this._gltfProp("assets/models/warehouse/shelf/scene.gltf", -6.5, 0, 16.7, Math.PI / 2, { dim: "height", size: 1.6, solid: true });
    this._gltfProp("assets/models/warehouse/wide_books_shelf/scene.gltf", -6.5, 0, 20.0, Math.PI / 2, { dim: "height", size: 1.8, solid: true });
    this._gltfProp("assets/models/warehouse/robotarm/scene.gltf", 15.6, 0, 15.6, Math.PI, { dim: "length", size: 2.2, solid: true });

    // dressing: maintenance workbench against the south wall (visual QA:
    // dead SW corner read as unfinished space) — desk + radio + toolbox,
    // each clear of every other collider (~0.1+ margins)
    this.place(kit.desk(m), -1.9, 0, 22.75, 0);
    const benchRadio = kit.radioSet(m, true);
    this.place(benchRadio, -1.6, 0.78, 22.7, Math.PI, { collide: false });
    this.radios.push(benchRadio);
    this.place(kit.toolbox(m), -3.2, 0, 22.2, 0.4);

    // USER 2026-09-12 (sections felt scanty): CC0 KayKit crate row in the
    // dead SW corner + NE corner by the barrels (spacing ≥0.05 m verified).
    this._decoProp("assets/models/kaykit/box_A.gltf", -6.3, 0, 22.5, 0.35, 3.6, { solid: true });
    this._decoProp("assets/models/kaykit/box_A.gltf", -5.2, 0, 22.4, 1.1, 3.4, { solid: true });
    this._decoProp("assets/models/kaykit/box_B.gltf", -4.3, 0, 22.7, 0.2, 3.8, { solid: true });
    this._decoProp("assets/models/kaykit/box_B.gltf", 6.35, 0, 21.3, 0.2, 3.8, { solid: true });

    // signage on east wall by D3
    const s = kit.signPlane(m, makeSignTexture(["VALVE GALLERY"], { w: 512, h: 110, color: "#d8c26a", arrow: "right" }), 1.2, 0.26, { backing: true, lit: true });
    s.position.set(7.0, 2.5, 16.5);
    s.rotation.y = -Math.PI / 2;
    this.scene.add(s);
    const s2 = kit.signPlane(m, makeSignTexture(["PUMP HALL"], { w: 512, h: 110, color: "#d8c26a" }), 1.4, 0.3, { backing: true, lit: true });
    s2.position.set(0, 4.4, 12.62);
    this.scene.add(s2);

    // high bay fixtures
    for (const [x, z] of [[-3, 15.2], [-3, 20.2], [3, 15.2], [3, 20.2]]) {
      const f = kit.fluorescentFixture(m, { on: false });
      this.place(f, x, 6.4, z, 0, { collide: false });
      this.fixtures.push({ ...this.makeToggleable(f), room: "pumphall" });
    }
    this.light(0, 6.1, 17.8, { color: 0xdfe8ff, intensity: 40, distance: 24, circuit: "lighting", room: "pumphall" });
    this.light(-4.4, 3.4, 17.7, { color: 0xcfe0ff, intensity: 14, distance: 13, circuit: "lighting", room: "pumphall", shadow: true });

    this.room({ id: "pumphall", name: "Pump Hall", min: [-7.15, 0, 12.35], max: [7.15, 7, 23.35], zone: "pumphall" });
  }

  _gallery() {
    const m = this.mats;
    this.slab(7.15, 17, -0.3, 0, 14.55, 20.85, m.get("concreteFloor"));
    this.ground(7.15, 17, 14.55, 20.85, 0, "concrete");
    this.wallX(14.55, 7.15, 17.15, 0, 3.2, m.get("concreteWall"));
    this.wallX(20.85, 7.15, 17.15, 0, 3.2, m.get("concreteWall"));
    this.wallZ(17.15, 14.55, 16.2, 0, 3.2, m.get("concreteWall"));
    this.wallZ(17.15, 19.2, 20.85, 0, 3.2, m.get("concreteWall"));
    // QA 2026-09-08 (user screenshots): the sluice leaf was built yaw 0 while
    // its opening sits in an X-normal wall — the panel stood PERPENDICULAR to
    // the hole (edge-on beam mid-doorway) and, raised, slammed into the solid
    // header/slab instead of a slot. Rebuild: leaf yaw PI/2, slotted header,
    // ceiling hole + hood housing, visible sprocket/chain/counterweight rig.
    this.slab(17.0, 17.05, 2.6, 3.2, 16.2, 19.2, m.get("concreteWall")); // header west sheet
    this.slab(17.25, 17.3, 2.6, 3.2, 16.2, 19.2, m.get("concreteWall")); // header east sheet (slot 17.05..17.25)
    // ceiling with a slot hole over the leaf path (was one solid slab the
    // raised leaf intersected)
    this.slab(7.15, 17.05, 3.2, 3.5, 14.55, 20.85, m.get("concreteDark"));
    this.slab(17.05, 17.15, 3.2, 3.5, 14.55, 16.2, m.get("concreteDark"));
    this.slab(17.05, 17.15, 3.2, 3.5, 19.2, 20.85, m.get("concreteDark"));
    this.slab(17.25, 17.3, 3.2, 3.5, 16.2, 19.2, m.get("concreteDark"));
    // hood housing above the ceiling: the hole the leaf rises into
    this.slab(17.0, 17.05, 3.5, 5.15, 16.1, 19.3, m.get("metalRaw"));
    this.slab(17.25, 17.3, 3.5, 5.15, 16.1, 19.3, m.get("metalRaw"));
    this.slab(17.0, 17.3, 5.15, 5.25, 16.1, 19.3, m.get("metalRaw"));
    this.slab(17.0, 17.3, 3.5, 5.15, 16.1, 16.2, m.get("metalRaw"));
    this.slab(17.0, 17.3, 3.5, 5.15, 19.2, 19.3, m.get("metalRaw"));

    // sluice gate in east opening (closed until drained)
    const sluice = new Door({
      id: "sluice", materials: m, position: [17.15, 0, 17.7], yaw: Math.PI / 2,
      width: 3.0, height: 2.6, thickness: 0.12, kind: "gate", locked: true,
      lockedMessage: "Chained — the water holds it shut",
    });
    this.addDoor(sluice, { swingCollider: true });
    this.sluice = sluice;

    // lifting rig: two sprockets over the header, chains dropping into the
    // slot, counterweights on guide rods that descend as the leaf rises
    const rig = { weights: [], chains: [], sprockets: [] };
    for (const z of [16.5, 18.9]) {
      const sp = new THREE.Group();
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 12), m.get("darkMetal"));
      wheel.rotation.x = Math.PI / 2;
      sp.add(wheel);
      for (let k = 0; k < 4; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), m.get("darkMetal"));
        spoke.rotation.z = (Math.PI / 4) + (k * Math.PI) / 2 - Math.PI / 2;
        sp.add(spoke);
      }
      sp.position.set(16.93, 2.82, z);
      this.scene.add(sp);
      rig.sprockets.push(sp);
      // guide rod + counterweight (gallery side, visible)
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6), m.get("darkMetal"));
      rod.position.set(16.9, 1.5, z);
      this.scene.add(rod);
      const weight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), m.get("metalRaw"));
      weight.position.set(16.9, 2.15, z);
      weight.userData.y0 = 2.15;
      this.scene.add(weight);
      rig.weights.push(weight);
      // chain: weight top -> sprocket (dynamic length)
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), m.get("darkMetal"));
      chain.geometry.translate(0, 0.5, 0);
      this.scene.add(chain);
      chain.userData.z = z;
      rig.chains.push(chain);
      // chain stub from sprocket into the slot (the "pull" side)
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), m.get("darkMetal"));
      stub.position.set(17.15, 2.85, z);
      this.scene.add(stub);
    }
    // crank gearbox on the wall between the sprockets
    const gbox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.3), m.get("yellowPaint"));
    gbox.position.set(16.95, 2.82, 17.7);
    this.scene.add(gbox);
    const gcrank = new THREE.Group();
    const garm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), m.get("darkMetal"));
    garm.position.y = -0.15;
    gcrank.add(garm);
    gcrank.position.set(16.86, 2.82, 17.7);
    this.scene.add(gcrank);
    rig.crank = gcrank;
    this.sluiceRig = rig;

    // grating catwalk strip
    const grating = this.box(12.1, 0.02, 17.7, 9.6, 0.04, 1.0, m.get("darkMetal"), { collide: false, cast: false });
    grating.material = m.variant("metalRaw", 4, 1);

    // valves A (north wall, close) + B (south wall, open) — INTERACTIVE O4
    const pipeA = kit.pipeRun(m, [[12.0, 1.6, 14.7], [12.0, 0.4, 14.7]], 0.16);
    this.scene.add(pipeA);
    const vA = kit.valveWheel(m, "yellowPaint");
    vA.position.set(12.0, 1.15, 14.86);
    this.scene.add(vA);
    this.valveA = vA;
    const pipeB = kit.pipeRun(m, [[14.0, 1.6, 20.7], [14.0, 0.4, 20.7]], 0.16);
    this.scene.add(pipeB);
    const vB = kit.valveWheel(m, "bluePaint");
    vB.position.set(14.0, 1.15, 20.54);
    vB.rotation.y = Math.PI;
    this.scene.add(vB);
    this.valveB = vB;
    // wall stencils
    const sA = kit.signPlane(m, makeSignTexture(["INTAKE A"], { w: 320, h: 90, color: "#e8c65a", bg: "#20241f", size: 34 }), 0.85, 0.24);
    sA.position.set(12.0, 2.3, 14.72);
    this.scene.add(sA);
    const sB = kit.signPlane(m, makeSignTexture(["DRAIN B"], { w: 320, h: 90, color: "#6aa4e8", bg: "#1f2430", size: 34 }), 0.85, 0.24);
    sB.position.set(14.0, 2.3, 20.68);
    sB.rotation.y = Math.PI;
    this.scene.add(sB);
    // penstock pipes along ceiling
    this.scene.add(kit.pipeRun(m, [[8.5, 2.9, 15.2], [12.0, 2.9, 15.2], [12.0, 1.9, 14.75]], 0.14));
    this.scene.add(kit.pipeRun(m, [[8.5, 3.0, 20.2], [14.0, 3.0, 20.2], [14.0, 1.9, 20.65]], 0.14));

    // water plane
    const wgeo = new THREE.PlaneGeometry(10.2, 6.6, 40, 26);
    this.waterMat = kit.waterMaterial();
    this.water = new THREE.Mesh(wgeo, this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(12.1, this.waterLevel, 17.7);
    this.scene.add(this.water);

    // sump beater (small pump) corner — decorative
    const beater = kit.pumpTrain(m, 3);
    this.place(beater, 8.0, 0, 19.8, Math.PI / 2, { collide: false });
    beater.scale.set(0.55, 0.55, 0.55);
    // QA 2026-09-07: probe walked straight through it (unscaled kit collider
    // would be oversized at 0.55 scale, so a fitted box instead).
    this.colliders.push({
      box: new THREE.Box3(new THREE.Vector3(7.62, 0, 19.0), new THREE.Vector3(8.38, 1.0, 20.8)),
      active: true, tag: "beater",
    });

    const f1 = kit.fluorescentFixture(m, { on: false });
    this.place(f1, 10, 3.12, 17.7, 0, { collide: false });
    const f2 = kit.fluorescentFixture(m, { on: false });
    this.place(f2, 14.5, 3.12, 17.7, 0, { collide: false });
    this.fixtures.push({ ...this.makeToggleable(f1), room: "gallery" });
    this.fixtures.push({ ...this.makeToggleable(f2), room: "gallery" });
    this.light(12, 2.9, 17.7, { color: 0xcfe0ff, intensity: 9, distance: 12, circuit: "lighting", room: "gallery" });

    this.room({ id: "valvegallery", name: "Valve Gallery", min: [7.15, 0, 14.55], max: [17.15, 3.2, 20.85], zone: "gallery" });
  }

  _sump() {
    const m = this.mats;
    // floor + ground
    this.slab(15, 27, -3.7, -3.4, 13.5, 22.5, m.get("concreteDark"));
    // pit floor — carved around the switchback chimney (QA-found: this region
    // under F1 kept winning groundNear's closest-match at the ramp foot, making
    // F1 unboardable by real walking once the ghost-climb fix landed; the north
    // lane now belongs to the F1 slope alone)
    this.ground(15, 24.3, 13.5, 22.5, -3.4, "concrete");      // west of chimney (gate approach)
    this.ground(24.3, 27, 13.5, 19.75, -3.4, "concrete");     // north of chimney
    this.ground(24.3, 27, 22.05, 22.5, -3.4, "concrete");     // south strip
    this.ground(24.3, 26.5, 20.95, 22.05, -3.4, "concrete");  // south lane base, under F2
    this.ground(24.3, 26.5, 20.85, 20.95, -3.4, "concrete");  // center gap (gate entry)
    // ramp from gallery opening down (ground + visual + fill)
    this.ground(17.0, 21.4, 16.2, 19.2, 0, "metal", { axis: "x", from: 17.0, to: 21.4, y0: 0, y1: -3.4 });
    // USER 2026-09-12 floor audit: the old single tilted slab covered only
    // x 17.5..20.9 of the 17.0..21.4 run (tilt shrinks the footprint by
    // cos(slope)) — the top/bottom of the descent had NO visual underfoot.
    // _rampVis now builds stepped treads that span the full run.
    this._rampVis(17.0, 21.4, 17.7, 0, -3.4, "x", 3.0);
    // under-ramp fill colliders
    this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(17, -3.4, 16.2), new THREE.Vector3(19.7, -2.2, 19.2)), active: true });
    // ramp retaining walls
    this.box(19.2, -1.4, 16.05, 4.6, 2.4, 0.3, m.get("concreteWall"));
    this.box(19.2, -1.4, 19.35, 4.6, 2.4, 0.3, m.get("concreteWall"));

    // walls (up to ceiling slab y 0)
    this.wallX(13.35, 14.85, 27.15, -3.7, 0, m.get("concreteWall"));
    this.wallX(22.65, 14.85, 27.15, -3.7, 0, m.get("concreteWall"));
    this.wallZ(14.85, 13.35, 22.65, -3.7, 0, m.get("concreteWall"));
    this.wallZ(27.15, 13.35, 22.65, -3.7, 0, m.get("concreteWall"));
    // ceiling slab (gallery floor extension) minus ramp hole & shaft top handled by shaft walls
    this.slab(21.4, 24.0, -0.3, 0, 13.35, 22.65, m.get("concreteDark"));
    this.slab(17.0, 21.4, -0.3, 0, 13.35, 16.2, m.get("concreteDark"));
    this.slab(17.0, 21.4, -0.3, 0, 19.2, 22.65, m.get("concreteDark"));
    this.slab(24.0, 27.15, -0.3, 0, 13.35, 19.45, m.get("concreteDark"));
    this.slab(24.0, 27.15, -0.3, 0, 22.35, 22.65, m.get("concreteDark"));

    // --- the old tunnel gate (west wall, story focal) ---
    // QA 2026-09-07: the whole gate sat INSIDE the west wall (wall inner
    // face at x=15.0; frame/plug/chains/lamp all at x<=14.95) so the story
    // beat read as plain rock wall. Rebuilt proud of the wall: plug behind,
    // dark frame around it, bars in front, chains draped, red lamp lit.
    const tombGate = new THREE.Group();
    const plug = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.7, 2.5), m.variant("rock", 2, 2));
    plug.position.set(15.12, -2.0, 17.7); // proud of the frame so rock shows
    tombGate.add(plug);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.0, 2.8), m.get("darkMetal"));
    frame.position.set(15.05, -1.9, 17.7);
    tombGate.add(frame);
    const bars = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8), m.get("metalRaw"));
      b.position.set(0.13, 0, -1.1 + i * 0.44);
      bars.add(b);
    }
    bars.position.set(15.19, -1.9, 17.7); // bars in front of the plug face
    tombGate.add(bars);
    // chains
    for (let i = 0; i < 3; i++) {
      const ch = kit.pipeRun(m, [[15.35, -1.0 - i * 0.5, 16.5], [15.35, -0.7 - i * 0.5, 18.9]], 0.025);
      tombGate.add(ch);
    }
    this.scene.add(tombGate);
    const tombLamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), m.get("glowRed").clone());
    tombLamp.position.set(15.42, -0.6, 16.4);
    this.scene.add(tombLamp);
    this.tombLamp = tombLamp;

    // --- the nest (SW corner) ---
    this.place(kit.bedroll(m), 16.6, -3.4, 21.6, 0);
    this.place(kit.shelfUnit(m, 3), 19.5, -3.4, 22.1, 0);
    // crate stack beside the shelf (visual QA: bare corner; placed clear of
    // the shelf and crateDesk colliders — pair-probe verified)
    this.place(kit.crate(m, 0.65), 19.2, -3.4, 21.0, 0.3);
    this.place(kit.crate(m, 0.6), 19.2, -2.74, 21.02, -0.2);  // rests exactly on the 0.65-crate top
    const crateDesk = kit.crate(m, 0.75);
    this.place(crateDesk, 18.0, -3.4, 20.9, 0.2);
    this.lastNoteMesh = this._paperProp("FOR THE ONE WHO COMES", ["Read me. Everything", "is in order. — M."], 18.0, -2.62, 20.9, 0.2);
    const radio = kit.radioSet(m, true);
    this.place(radio, 18.35, -3.4, 21.15, 2.6, { collide: false });
    this.radios.push(radio);
    // calendar on shelf side
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshStandardMaterial({ map: makePaperTexture("NOV", ["M T W T F S S", "x x x x x x x", "x x x x x x x", "x x x x ..."], { bg: "#b8b29c" }), roughness: 0.95 }));
    cal.position.set(19.0, -2.5, 22.5);
    cal.rotation.y = Math.PI;
    this.scene.add(cal);
    this.calendarMesh = cal;
    // string lights overhead
    const str = kit.stringLights(m, 9, 6.5);
    str.position.set(18.6, -0.9, 18.5);
    this.scene.add(str);
    this.stringLights = str;
    this.light(17.6, -1.2, 19.5, { color: 0xffc98a, intensity: 11, distance: 11, circuit: "service" });

    // barrels NE + salvaged pipe
    this.place(kit.barrel(m), 26.3, -3.4, 14.4, 0);
    this.place(kit.barrel(m), 25.5, -3.4, 14.2, 0);
    // QA 2026-09-07: was at y -2.2/-2.4 — head height on the -3.4 sump floor
    // (the probe capsule walked straight through it). Hung near the ceiling.
    this.scene.add(kit.pipeRun(m, [[22.5, -0.8, 14.2], [24.5, -1.0, 14.6], [26.2, -0.8, 15.2]], 0.12));

    // master breaker (east wall, INTERACTIVE O6)
    const mb = kit.masterBreakerCabinet(m);
    this.place(mb, 26.95, -3.4, 20.6, -Math.PI / 2, { collide: false });
    this.masterBreaker = mb;

    this.room({ id: "sump", name: "Lower Level", min: [14.85, -3.4, 13.35], max: [27.15, 0, 22.65], zone: "sump" });
  }

  _shaft() {
    const m = this.mats;
    const x0 = 24.0, x1 = 26.6, zn = 19.6, zs = 22.2;
    // walls up to above street (3.6)
    this.wallX(zn - 0.15, x0 - 0.15, x1 + 0.15, -3.7, 3.6, m.get("concreteWall"));
    this.wallX(zs + 0.15, x0 - 0.15, x1 + 0.15, -3.7, 3.6, m.get("concreteWall"));
    this.wallZ(x1 + 0.15, zn - 0.15, zs + 0.15, -3.7, 3.6, m.get("concreteWall"));
    // west wall with gate opening (z 19.6..22.2, y -3.4..-0.4)
    this.wallZ(x0 - 0.15, zn - 0.15, 19.6, -3.7, 3.6, m.get("concreteWall"));
    this.wallZ(x0 - 0.15, 22.2, zs + 0.15, -3.7, 3.6, m.get("concreteWall"));
    // QA 2026-09-08: was one solid wall — the raised gate leaf intersected it
    // ("forced to overlap with a cube"). Now two sheets with a 0.18 slot the
    // leaf rises into; the east sheet bulges 0.2 as a visible hood.
    this.slab(23.65, 23.81, -0.4, 3.6, 19.6, 22.2, m.get("concreteWall"));
    this.slab(23.93, 24.0, -0.4, 3.6, 19.6, 22.2, m.get("concreteWall"));

    // switchback ramps: 3 flights 45deg, landings
    // chimney lamps (visual QA: switchbacks read as a black void without them)
    // QA 2026-09-11: these were yaw PI at z 19.78 — backs to open space,
    // mounts floating 0.15+ off the north wall (inner face z=19.6). Now
    // mounted ON the north wall facing into the chimney (yaw 0, embedded).
    this.place(kit.wallLamp(m, { on: true }), 26.45, -2.4, 19.62, 0, { collide: false });
    this.light(26.3, -2.2, 20.3, { color: 0xffd9a0, intensity: 8, distance: 7, circuit: "service" });
    this.place(kit.wallLamp(m, { on: true }), 26.45, 0.4, 19.62, 0, { collide: false });
    this.light(26.3, 0.6, 20.3, { color: 0xffd9a0, intensity: 8, distance: 7, circuit: "emergency" });
    this.place(kit.wallLamp(m, { on: true }), 26.45, 3.3, 19.62, 0, { collide: false });
    this.light(26.3, 3.4, 20.3, { color: 0xffd9a0, intensity: 11, distance: 6, circuit: "emergency" });  // above the top platform (y3.2): a lamp below it is occluded by the grate
    // mid-chimney fill + gate-approach lamp (visual QA recapture: west-facing
    // landings and the winch read at mean-luma 0.4-2.4 with east-wall lamps
    // alone — the climb must be readable from every leg, not just from east)
    this.light(26.0, 0.2, 21.2, { color: 0xffd9a0, intensity: 6, distance: 6, circuit: "service" });
    this.place(kit.wallLamp(m, { on: true }), 24.3, -1.7, 19.62, 0, { collide: false });
    this.light(24.4, -1.6, 20.4, { color: 0xffd9a0, intensity: 5, distance: 5, circuit: "service" });
    // step-edge markers: high-visibility strips along each ramp's outer edge
    // every 0.55m of climb (visual QA: the 45deg flights were invisible)
    const marks = (xa, xb, z, y0, y1) => {
      for (let y = y0 + 0.275; y < y1; y += 0.55) {
        const t = (y - y0) / (y1 - y0);
        const x = xa + (xb - xa) * t;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.5), m.get("yellowPaint"));
        strip.position.set(x, y + 0.015, z);
        this.scene.add(strip);
      }
    };
    marks(24.4, 26.4, 19.78, -3.4, -1.2);   // F1 outer edge
    marks(26.4, 24.4, 22.02, -1.2, 1.0);    // F2 outer edge
    marks(24.4, 26.4, 19.78, 1.0, 3.2);     // F3 outer edge
    // F1: x 24.3->26.5 north lane (z 19.75..20.85), y -3.4 -> -1.2
    this._rampVis(24.4, 26.4, 20.3, -3.4, -1.2, "x", 1.1);
    this.ground(24.3, 26.5, 19.75, 20.85, -3.4, "metal", { axis: "x", from: 24.3, to: 26.5, y0: -3.4, y1: -1.2 });
    // L1: x 25.4..26.5 both lanes at -1.2
    this.box(25.95, -1.32, 20.9, 1.1, 0.24, 2.3, m.get("darkMetal"), { collide: false });
    this.ground(25.4, 26.5, 19.75, 22.05, -1.2, "grating");
    // F2: x 26.5->24.3 south lane (z 20.95..22.05), y -1.2 -> 1.0
    this._rampVis(24.4, 26.4, 21.5, -1.2, 1.0, "x", 1.1);
    this.ground(24.3, 26.5, 20.95, 22.05, -1.2, "metal", { axis: "x", from: 26.5, to: 24.3, y0: -1.2, y1: 1.0 });
    // L2: x 24.3..25.4 both lanes at 1.0
    this.box(24.85, 0.88, 20.9, 1.1, 0.24, 2.3, m.get("darkMetal"), { collide: false });
    this.ground(24.3, 25.4, 19.75, 22.05, 1.0, "grating");
    // F3: x 24.3->26.5 north lane, y 1.0 -> 3.2 (soft platform edge lets you step on top)
    this._rampVis(24.4, 26.4, 20.3, 1.0, 3.2, "x", 1.1);
    this.ground(24.3, 26.5, 19.75, 20.85, 1.0, "metal", { axis: "x", from: 24.3, to: 26.5, y0: 1.0, y1: 3.2 });
    // top platform x 25.4..26.5 at 3.2 + grate
    this.box(25.95, 3.08, 20.9, 1.1, 0.24, 2.3, m.get("darkMetal"), { collide: false });
    this.ground(25.4, 26.5, 19.75, 22.05, 3.2, "grating");
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 2.4), m.variant("metalRaw", 2, 3));
    grate.position.set(25.95, 3.45, 20.9);
    this.scene.add(grate);
    // railings on landings
    this.box(25.95, -1.0, 19.78, 1.1, 0.06, 0.05, m.get("trim"), { collide: false });
    this.box(24.85, 1.1, 19.78, 1.1, 0.06, 0.05, m.get("trim"), { collide: false });

    // service gate (vertical, INTERACTIVE winch)
    const gate = new Door({
      id: "gate_service", materials: m, position: [23.87, -3.4, 20.9], yaw: Math.PI / 2,
      width: 2.6, height: 3.0, kind: "gate", locked: true, lockedMessage: "Crank the winch to raise the gate",
    });
    gate.group.rotation.y = Math.PI / 2; // panel across z axis
    this.addDoor(gate, { swingCollider: true });
    this.serviceGate = gate;

    // winch drum (INTERACTIVE O7)
    const winch = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 14), m.get("metalRaw"));
    drum.rotation.z = Math.PI / 2;
    winch.add(drum);
    const crank = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), m.get("yellowPaint"));
    arm.position.x = 0.2;
    crank.add(arm);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), m.get("yellowPaint"));
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0.4, 0, 0);
    crank.add(grip);
    crank.position.set(0, 0.18, 0.3);
    winch.add(crank);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), m.get("darkMetal"));
    post.position.y = -0.55;
    winch.add(post);
    winch.userData.crank = crank;
    winch.userData.drum = drum;
    this.place(winch, 23.35, -2.4, 22.3, Math.PI * 0.25, { collide: false });
    this.winch = winch;
    // cable
    this.scene.add(kit.pipeRun(m, [[23.6, -2.2, 22.1], [23.9, -1.4, 21.4], [23.95, -0.5, 20.9]], 0.02));

    // gate floodlight (service circuit — ON after master off)
    this.gateFlood = new THREE.SpotLight(0xfff1cc, 0, 14, 0.6, 0.5, 1.5);
    this.gateFlood.position.set(23.4, -0.8, 20.9);
    this.gateFlood.target.position.set(24.2, -3.0, 20.9);
    this.scene.add(this.gateFlood);
    this.scene.add(this.gateFlood.target);
    const floodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.22, 10), m.get("trim"));
    floodMesh.position.copy(this.gateFlood.position);
    this.scene.add(floodMesh);

    // ladder visual on east wall
    const lad = kit.ladder(m, 6.4);
    lad.position.set(26.5, 0, 20.9);
    this.scene.add(lad);

    // sky grate glow at top
    this.light(25.9, 3.6, 20.9, { color: 0x8fa8ff, intensity: 0, distance: 8, circuit: "dawn" });

    this.room({ id: "exitshaft", name: "Service Shaft", min: [23.85, -3.4, 19.45], max: [26.75, 3.6, 22.35], zone: "shaft" });
    // ending trigger
    this.endingZone = { min: new THREE.Vector3(25.4, 3.0, 19.75), max: new THREE.Vector3(26.5, 4.2, 22.05) };
  }

  _rampVis(x0, x1, zc, y0, y1, axis, width) {
    // USER 2026-09-12 floor audit: the old single tilted slab's footprint
    // shrinks by cos(slope) — on the steep sump ramps (~38°) it covered only
    // half the run, leaving the top and bottom of the lane with NO visual
    // underfoot (the player floated on the analytic region looking through
    // the world). Stepped boxes now span the full run exactly, stay within
    // half-a-step of the analytic slope, and read as a real industrial stair.
    const len = Math.abs(x1 - x0);
    const n = Math.max(6, Math.round(len / 0.3));
    const step = len / n + 0.02; // tiny overlap: no seams between treads
    for (let i = 0; i < n; i++) {
      const ya = y0 + (y1 - y0) * (i / n);
      const yb = y0 + (y1 - y0) * ((i + 1) / n);
      const top = Math.max(ya, yb);
      const h = Math.abs(yb - ya) + 0.34; // drop below both ends: no under-gaps
      const t = (i + 0.5) / n;
      const s = new THREE.Mesh(
        axis === "x"
          ? new THREE.BoxGeometry(step, h, width)
          : new THREE.BoxGeometry(width, h, step),
        this.mats.variant("metalRaw", 2, 1)
      );
      s.position.set(
        axis === "x" ? x0 + (x1 - x0) * t : zc,
        top - h / 2,
        axis === "x" ? zc : z0_of(x0, x1, t) // (axis z unused today; symmetric)
      );
      s.receiveShadow = true;
      this.scene.add(s);
    }
    function z0_of(a, b, t) { return a + (b - a) * t; }
    // nosing strips for readability
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const s = new THREE.Mesh(
        axis === "x" ? new THREE.BoxGeometry(0.05, 0.05, width) : new THREE.BoxGeometry(width, 0.05, 0.05),
        this.mats.get("trim")
      );
      s.position.set(axis === "x" ? x0 + (x1 - x0) * t : zc, y0 + (y1 - y0) * t + 0.09, axis === "x" ? zc : x0 + (x1 - x0) * t);
      this.scene.add(s);
    }
  }

  // ---------------- doors ----------------

  addDoor(door, { swingCollider = true } = {}) {
    this.scene.add(door.group);
    if (door.frame) this.scene.add(door.frame);
    const col = { box: door.colliderBox(), door: door.id, active: true };
    this.colliders.push(col);
    this.doors.set(door.id, { door, col });
  }

  // ---------------- circuits / world state ----------------

  _applyInitialCircuits() {
    // QA 2026-09-07: "always" was never enabled here, so every always-on
    // light (street sodium lamp, porch/entry lamps, fence corner lamps)
    // stayed at intensity 0 — a whole class of invisible-but-present element.
    this.setCircuit("always", true);
    this.setCircuit("lighting", false);
    this.setCircuit("pumps", true);
    this.setCircuit("nest", true);
    this.setCircuit("emergency", true);
    this.setCircuit("service", false);
    this.setCircuit("dawn", false);
  }

  setCircuit(circuit, on, { instant = false } = {}) {
    for (const e of this.lightEntries || []) {
      if (e.circuit === circuit) {
        e.targetIntensity = on ? e.intensity : 0;
        if (instant) e.light.intensity = e.targetIntensity;
      }
    }
    if (circuit === "lighting") {
      for (const f of this.fixtures) f.set(on);
    }
    if (circuit === "nest" && !on) {
      // string lights die with the nest circuit
      this.stringLights.traverse((o) => {
        if (o.isMesh && o.material.emissive) o.material = o.material.clone(), o.material.emissiveIntensity = 0.05;
      });
    }
  }

  restoreLighting() {
    // staged restore: corridor -> atrium -> hall -> gallery
    this.audio.breakerClack();
    setTimeout(() => {
      this.setCircuit("lighting", true);
      for (const f of this.fixtures) if (f.room === "corridor" || f.room === "nook") f.set(true);
      this.audio.doorThunk();
    }, 250);
    setTimeout(() => {
      for (const f of this.fixtures) if (f.room === "atrium") f.set(true);
      this.audio.uiTick();
    }, 900);
    setTimeout(() => {
      for (const f of this.fixtures) if (f.room === "pumphall") f.set(true);
      this.audio.uiTick();
    }, 1600);
    setTimeout(() => {
      for (const f of this.fixtures) if (f.room === "gallery") f.set(true);
    }, 2200);
  }

  killStation() {
    this.setCircuit("lighting", false);
    this.setCircuit("pumps", false);
    this.setCircuit("nest", false);
    this.setCircuit("service", true);
    this.audio.spoolDown();
    if (this.tombLamp) this.tombLamp.material.emissiveIntensity = 2.6;
  }

  // ---------------- per-frame ----------------

  update(dt, playerPos) {
    this.time += dt;
    // door colliders follow
    for (const { door, col } of this.doors.values()) {
      const moving = door.state === "opening" || door.state === "closing";
      if (moving) {
        const nb = door.colliderBox();
        // anti-crush: if the sweeping leaf would intersect the player capsule,
        // disable collision for the sweep instead of holding a STALE box at
        // the closed pose (that stale box was the "invisible wall in the open
        // doorway" bug when a door was opened from the threshold)
        const p = playerPos;
        const crush = p && nb.max.x > p.x - 0.42 && nb.min.x < p.x + 0.42 &&
          nb.max.z > p.z - 0.42 && nb.min.z < p.z + 0.42 &&
          nb.max.y > p.y + 0.2 && nb.min.y < p.y + 1.7;
        if (crush) col.active = false;
        else { col.box.copy(nb); col.active = true; }
      } else if (door.kind === "gate") {
        col.active = door.t < 0.75;
      } else {
        col.active = true; // leaf solid in every pose; open leaf rests by the wall
      }
      door.update(dt);
      // settle: always resync the collider to the resting pose — guarantees
      // the doorway is physically clear the moment the door finishes moving
      if (moving && (door.state === "open" || door.state === "closed")) {
        col.box.copy(door.colliderBox());
        if (door.kind !== "gate") col.active = true;
      }
    }
    // sluice lifting rig (QA 2026-09-08): sprockets turn, counterweights slide
    // down their rods and chains stay taut while the leaf rises
    if (this.sluiceRig) {
      const rise = this.sluice ? this.sluice.rise : 0;
      const r = this.sluiceRig;
      for (const sp of r.sprockets) sp.rotation.z = -rise * 5;
      if (r.crank) r.crank.rotation.x = rise * 4;
      for (let i = 0; i < r.weights.length; i++) {
        const w = r.weights[i];
        w.position.y = Math.max(0.55, w.userData.y0 - rise * 0.8);
        const c = r.chains[i];
        const top = w.position.y + 0.25;
        c.position.set(16.9, top, c.userData.z);
        c.scale.y = Math.max(0.05, 2.82 - top);
      }
    }
    // light intensity lerp
    for (const e of this.lightEntries || []) {
      const target = e.targetIntensity ?? 0;
      e.light.intensity += (target - e.light.intensity) * Math.min(1, dt * 3.5);
    }
    // pumps spin
    if (this.state.flags.pumps_running) {
      for (const s of this.spinners) s.rotation.x += dt * 7.5;
    }
    // water drain animation
    if (Math.abs(this.waterLevel - this.waterTarget) > 0.001) {
      this.waterLevel += (this.waterTarget - this.waterLevel) * Math.min(1, dt * 0.4);
      this.water.position.y = this.waterLevel;
    }
    if (this.waterMat) this.waterMat.uniforms.uTime.value = this.time;
    this.water.visible = this.waterLevel > 0.03;
    // hologram sign shaders (scanline roll / flicker clock)
    for (const hm of this.holoMats || []) hm.uniforms.uTime.value = this.time;
  }

  groundAt(x, z) {
    // later registrations win (more specific regions registered after general)
    let result = null;
    for (const r of this.groundRegions) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
        let y = r.y;
        if (r.slope) {
          const s = r.slope;
          const t = Math.min(1, Math.max(0, (z - s.from) / (s.to - s.from) || (x - s.from) / (s.to - s.from)));
          const tt = s.axis === "z" ? (z - s.from) / (s.to - s.from) : (x - s.from) / (s.to - s.from);
          y = s.y0 + (s.y1 - s.y0) * Math.min(1, Math.max(0, tt));
        }
        result = { y, surface: r.surface };
      }
    }
    return result || { y: 0, surface: "concrete" };
  }

  // y-aware ground query: picks the region whose surface height is CLOSEST to
  // refY (the player's current feet height). QA-found: groundAt's
  // last-registered-wins rule picked the sump floor under the shaft chimney
  // and lifted the player mid-climb ("ghost climb"); player physics and
  // swQA.pose must use this instead.
  groundNear(x, z, refY) {
    let best = null;
    for (const r of this.groundRegions) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
        let y = r.y;
        if (r.slope) {
          const s = r.slope;
          const tt = s.axis === "z" ? (z - s.from) / (s.to - s.from) : (x - s.from) / (s.to - s.from);
          y = s.y0 + (s.y1 - s.y0) * Math.min(1, Math.max(0, tt));
        }
        if (!best || Math.abs(y - refY) < Math.abs(best.y - refY)) best = { y, surface: r.surface };
      }
    }
    return best || { y: refY, surface: "concrete" };
  }

  roomAt(x, y, z) {
    for (const r of this.rooms) {
      if (x >= r.min[0] && x <= r.max[0] && y >= r.min[1] - 0.3 && y <= r.max[1] + 0.3 && z >= r.min[2] && z <= r.max[2]) return r;
    }
    return null;
  }

  // USER 2026-09-12 floor audit: analytic ground regions ignore props, so a
  // player who hopped onto a crate/fridge-top would fall straight through it
  // to the floor. Highest suitable solid collider top under/nearly-under the
  // feet becomes standable support. Door leaves are excluded (they swing),
  // soft colliders (bushes) too, and the top must be within a small step of
  // the feet — walls/fences stay un-climbable.
  colliderTopNear(x, z, refY) {
    let best = null;
    for (const c of this.colliders) {
      if (!c.active || c.soft || c.door) continue;
      const b = c.box;
      if (x < b.min.x - 0.08 || x > b.max.x + 0.08 || z < b.min.z - 0.08 || z > b.max.z + 0.08) continue;
      const top = b.max.y;
      if (top > refY + 0.38 || refY - top > 2.4) continue;
      if (best === null || top > best) best = top;
    }
    return best;
  }

  waterAt(x, z, feetY) {
    if (!this.state.flags.gallery_drained && x > 7 && x < 17 && z > 14.5 && z < 20.9) {
      return feetY < this.waterLevel + 0.05;
    }
    return false;
  }
}
