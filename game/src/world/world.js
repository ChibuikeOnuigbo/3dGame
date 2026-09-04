// World builder: turns the level plan (game/data/level_map.json) into meshes,
// colliders, lights, doors, props, water, interaction objects, audio zones.
//
// Conventions:
// - Every static collider is an axis-aligned box registered in this.colliders
//   as THREE.Box3 (directive: simplified collision geometry).
// - Ground height is analytic (regions + ramps) via groundAt(x,z).
// - Rooms are 3D rects for room detection / audio zones / QA.

import * as THREE from "three";
import { makeSignTexture, makePaperTexture } from "./materials.js";
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

  box(cx, cy, cz, sx, sy, sz, mat, opts = {}) {
    const { collide = true, cast = true, receive = true, variant = null } = opts;
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), variant || mat);
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
    const b = { x: [-9.5, 28.5], y: [-4.5, 8], z: [-20.5, 23.5] };
    const mk = (cx, cy, cz, sx, sy, sz) => this.box(cx, cy, cz, sx, sy, sz, this.mats.get("trim"), { collide: true, cast: false, receive: false });
    mk((b.x[0] - 1), 2, 2, 2, 14, 50);
    mk((b.x[1] + 1), 2, 2, 2, 14, 50);
    mk(9, 2, (b.z[0] - 1), 40, 14, 2);
    mk(9, 2, (b.z[1] + 1), 40, 14, 2);
    // street side sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(55, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          top: { value: new THREE.Color(0x0a1224) },
          bottom: { value: new THREE.Color(0x2c2320) },
        },
        vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float h = clamp(normalize(vP).y*0.5+0.5,0.,1.); gl_FragColor = vec4(mix(bottom, top, pow(h,0.7)),1.0); }",
      })
    );
    sky.position.set(0, 3, -13);
    this.scene.add(sky);
    this.sky = sky;

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
    this.moonLight = new THREE.DirectionalLight(0xbdd0f0, 0.5);
    this.moonLight.position.copy(moonDir.clone().multiplyScalar(30));
    this.scene.add(this.moonLight);
  }

  _street() {
    // asphalt around kiosk — built AROUND the stairwell shaft (the shaft
    // descends south of the kiosk; a slab across it swept players off the ramp)
    const asph = this.mats.variant("asphalt", 6, 6);
    this.slab(-10, 10, 3.05, 3.2, -20, -11.3, this.mats.get("asphalt"), { variant: asph });
    this.slab(-10, -1.3, 3.05, 3.2, -11.3, -10.4, this.mats.get("asphalt"), { variant: asph });
    this.slab(1.3, 10, 3.05, 3.2, -11.3, -10.4, this.mats.get("asphalt"), { variant: asph });
    this.ground(-10, 10, -20, -10.9, 3.2, "asphalt");
    this.room({ id: "street", name: "Stadtfeld Street", min: [-10, 3, -20], max: [10, 8, -10.9], zone: "street" });

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

    // building silhouettes (dark masses)
    this.box(-7.5, 8.5, -19, 6, 11, 6, this.mats.get("trim"), { collide: false, receive: false });
    this.box(8.5, 9.5, -18.5, 7, 13, 5, this.mats.get("trim"), { collide: false, receive: false });

    // ---- grass verges inside the street parcel (CC0 Ground037) ----
    const vergeMat = this.mats.get("grass");
    this.slab(-10, -7.6, 3.2, 3.28, -20, -10.9, vergeMat, { cast: false });
    this.slab(7.6, 10, 3.2, 3.28, -20, -10.9, vergeMat, { cast: false });
    this.ground(-10, -7.6, -20, -10.9, 3.28, "grass");
    this.ground(7.6, 10, -20, -10.9, 3.28, "grass");
    // soil strip in front of the buildings (CC0 Ground054)
    this.slab(-7.6, 7.6, 3.2, 3.26, -20, -18.4, this.mats.get("soil"), { cast: false });
    this.ground(-7.6, 7.6, -20, -18.4, 3.26, "grass");
    // low curb edging the verges
    this.slab(-7.75, -7.55, 3.2, 3.34, -20, -10.9, this.mats.get("concreteDark"), { cast: false });
    this.slab(7.55, 7.75, 3.2, 3.34, -20, -10.9, this.mats.get("concreteDark"), { cast: false });

    // bushes on the verges (dark foliage clumps, solid)
    const leaf = new THREE.MeshStandardMaterial({ color: 0x274d22, roughness: 0.95 });
    const bushSpots = [[-8.9, -19.2], [-8.4, -16.8], [-9.1, -13.9], [8.3, -19.0], [8.9, -16.2], [8.4, -12.6]];
    for (const [bx, bz] of bushSpots) {
      const bush = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const s = 0.28 + Math.random() * 0.3;
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leaf);
        b.position.set((Math.random() - 0.5) * 0.5, s * 0.8, (Math.random() - 0.5) * 0.5);
        b.scale.y = 0.75;
        bush.add(b);
      }
      this.place(bush, bx, 3.28, bz, 0, { collide: false });
    }

    // ---- perimeter fence at the slab edge: the street parcel is sealed ----
    const post = this.mats.get("darkMetal");
    const railMat = this.mats.get("metalRaw");
    const fenceH = 2.05;
    const fenceLines = [
      { x0: -10.05, z0: -20.05, x1: 10.05, z1: -20.05 },
      { x0: -10.05, z0: -10.9, x1: -10.05, z1: -20.05 },
      { x0: 10.05, z0: -20.05, x1: 10.05, z1: -10.9 },
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
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(len, fenceH - 0.2),
        new THREE.MeshStandardMaterial({ color: 0x5a626b, roughness: 0.6, metalness: 0.7, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
      );
      mesh.position.set((L.x0 + L.x1) / 2, 3.2 + fenceH / 2, (L.z0 + L.z1) / 2);
      mesh.rotation.y = Math.atan2(L.z1 - L.z0, L.x1 - L.x0) * -1 + Math.PI / 2;
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
    this.slab(-10, 10, 3.2, 3.3, -10.9, -10.4, this.mats.get("concreteDark"), { cast: false, collide: false });
  }

  _kiosk() {
    const m = this.mats;
    // floor
    this.slab(-1.7, 1.7, 2.9, 3.2, -14.7, -11.3, m.get("concreteDark"));
    this.ground(-1.7, 1.7, -14.7, -11.3, 3.2, "concrete");
    // walls (door gap north, stair opening south)
    this.wallX(-14.85, -1.85, -0.55, 3.2, 5.32, m.get("metalPainted"));
    this.wallX(-14.85, 0.55, 1.85, 3.2, 5.32, m.get("metalPainted"));
    this.wallX(-14.85, -0.55, 0.55, 5.32, 5.6, m.get("metalPainted"));
    this.wallZ(1.85, -14.85, -11.15, 3.2, 5.6, m.get("metalPainted"));
    this.wallZ(-1.85, -14.85, -11.15, 3.2, 5.6, m.get("metalPainted"));
    this.wallX(-11.15, -1.85, -0.8, 3.2, 5.3, m.get("metalPainted"));
    this.wallX(-11.15, 0.8, 1.85, 3.2, 5.3, m.get("metalPainted"));
    this.wallX(-11.15, -0.8, 0.8, 5.3, 5.6, m.get("metalPainted"));
    this.slab(-1.85, 1.85, 5.6, 5.9, -14.85, -11.15, m.get("metalPainted"));

    // street door (north) — locks behind player
    const dStreet = new Door({
      id: "door_street", materials: m, position: [-0.545, 3.2, -14.85], yaw: 0,
      width: 1.06, openSign: 1,
    });
    this.addDoor(dStreet, { swingCollider: true });

    // entry sign above door
    const sign = kit.signPlane(m, makeSignTexture(["STORMWATER", "STATION 6"], { w: 512, h: 160, color: "#e8d27a", size: 44 }), 1.5, 0.47, { backing: true, lit: true });
    sign.position.set(0, 4.85, -14.98);
    sign.rotation.y = Math.PI;
    this.scene.add(sign);
    // small meter box
    const meter = kit.breakerBox(m, { levers: 2 });
    this.place(meter, 1.55, 4.3, -13.0, Math.PI / 2, { collide: false });
    this.room({ id: "kiosk", name: "Street Kiosk", min: [-1.85, 3.2, -14.85], max: [1.85, 5.6, -11.15], zone: "street" });
  }

  _stairwell() {
    const m = this.mats;
    this.wallZ(-1.15, -11.3, -6.2, -0.3, 5.6, m.get("concreteWall"));
    this.wallZ(1.15, -11.3, -6.2, -0.3, 5.6, m.get("concreteWall"));
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
    this.light(-0.7, 3.5, -8.5, { color: 0xffd9a0, intensity: 4, distance: 7, circuit: "emergency" });
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
    this.place(kit.crate(m, 0.6), 3.3, 0, -1.2, 0.3);
    this.place(kit.barrel(m), -3.5, 0, -0.9, 0);

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
    this.light(-2.4, 2.4, 9.4, { color: 0xdfe8ff, intensity: 5, distance: 7, circuit: "emergency" });

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
    // stair onto gantry: steps rise eastward along the north wall, landing meets the deck
    const gsteps = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.33, 1.1), m.variant("metalRaw", 1, 1));
      st.position.set(3.55 - i * 0.42, 0.16 + i * 0.325, 12.9);
      st.receiveShadow = true;
      gsteps.add(st);
    }
    this.scene.add(gsteps);
    // landing connecting stair top to deck
    this.box(4.4, 2.48, 13.62, 1.3, 0.24, 0.55, m.get("darkMetal"));
    this.ground(0.15, 3.78, 12.4, 13.2, 0, "metal", { axis: "x", from: 3.55, to: 0.19, y0: 2.6, y1: 0 });
    this.ground(3.75, 5.05, 13.35, 21.85, 2.6, "grating"); // deck + landing

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
    this.place(kit.toolbox(m), -2.2, 0, 22.8, 0.5);
    this.place(kit.crate(m, 0.8), 6.4, 0, 13.3, 0.15);

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
    this.wallZ(17.15, 16.2, 19.2, 2.6, 3.2, m.get("concreteWall")); // header over sluice opening
    this.slab(7.15, 17.15, 3.2, 3.5, 14.55, 20.85, m.get("concreteDark"));

    // sluice gate in east opening (closed until drained)
    const sluice = new Door({
      id: "sluice", materials: m, position: [17.15, 0, 17.7], yaw: 0,
      width: 3.0, height: 2.6, thickness: 0.12, kind: "gate", locked: true,
      lockedMessage: "Chained — the water holds it shut",
    });
    this.addDoor(sluice, { swingCollider: true });
    this.sluice = sluice;

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

    // sump beater (small pump) corner — decorative, no collider
    const beater = kit.pumpTrain(m, 3);
    this.place(beater, 8.0, 0, 19.8, Math.PI / 2, { collide: false });
    beater.scale.set(0.55, 0.55, 0.55);

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
    this.ground(15, 27, 13.5, 22.5, -3.4, "concrete");
    // ramp from gallery opening down (ground + visual + fill)
    this.ground(17.0, 21.4, 16.2, 19.2, 0, "metal", { axis: "x", from: 17.0, to: 21.4, y0: 0, y1: -3.4 });
    const rampVis = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 3.0), m.variant("metalRaw", 3, 1));
    rampVis.position.set(19.2, -1.7, 17.7);
    rampVis.rotation.z = Math.atan2(3.4, 4.4);
    rampVis.receiveShadow = true;
    this.scene.add(rampVis);
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
    const tombGate = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.0, 2.8), m.get("darkMetal"));
    frame.position.set(14.85, -1.9, 17.7);
    tombGate.add(frame);
    const bars = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8), m.get("metalRaw"));
      b.position.set(0.1, 0, -1.1 + i * 0.44);
      bars.add(b);
    }
    tombGate.add(bars);
    const plug = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.7, 2.5), m.variant("rock", 2, 2));
    plug.position.set(14.7, -2.0, 17.7);
    tombGate.add(plug);
    // chains
    for (let i = 0; i < 3; i++) {
      const ch = kit.pipeRun(m, [[14.9, -1.0 - i * 0.5, 16.5], [14.9, -0.7 - i * 0.5, 18.9]], 0.025);
      tombGate.add(ch);
    }
    this.scene.add(tombGate);
    const tombLamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), m.get("glowRed").clone());
    tombLamp.position.set(14.9, -0.6, 16.4);
    this.scene.add(tombLamp);
    this.tombLamp = tombLamp;

    // --- the nest (SW corner) ---
    this.place(kit.bedroll(m), 16.6, -3.4, 21.6, 0);
    this.place(kit.shelfUnit(m, 3), 19.5, -3.4, 22.1, 0);
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
    this.light(17.6, -1.2, 19.5, { color: 0xffc98a, intensity: 11, distance: 11, circuit: "nest" });

    // barrels NE + salvaged pipe
    this.place(kit.barrel(m), 26.3, -3.4, 14.4, 0);
    this.place(kit.barrel(m), 25.5, -3.4, 14.2, 0);
    this.scene.add(kit.pipeRun(m, [[22.5, -2.2, 14.2], [24.5, -2.4, 14.6], [26.2, -2.2, 15.2]], 0.12));

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
    this.wallZ(x0 - 0.15, 19.6, 22.2, -0.4, 3.6, m.get("concreteWall"));

    // switchback ramps: 3 flights 45deg, landings
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
      id: "gate_service", materials: m, position: [23.95, -3.4, 20.9], yaw: Math.PI / 2,
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
    const len = Math.abs(x1 - x0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, width), this.mats.variant("metalRaw", 2, 1));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2 - 0.08 * 0, zc);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    m.receiveShadow = true;
    this.scene.add(m);
    // steps overlay for readability
    const n = Math.floor(len / 0.3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, width), this.mats.get("trim"));
      s.position.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 0.09, zc);
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
      if (door.state === "opening" || door.state === "closing") {
        const nb = door.colliderBox();
        // anti-crush: hold the collider back if the sweeping leaf would
        // intersect the player capsule this frame
        const p = playerPos;
        const crush = p && nb.max.x > p.x - 0.42 && nb.min.x < p.x + 0.42 &&
          nb.max.z > p.z - 0.42 && nb.min.z < p.z + 0.42 &&
          nb.max.y > p.y + 0.2 && nb.min.y < p.y + 1.7;
        if (!crush) col.box.copy(nb);
      }
      if (door.kind === "gate") col.active = door.t < 0.75;
      else col.active = true; // leaf solid in every pose; open leaf rests by the wall
      door.update(dt);
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

  roomAt(x, y, z) {
    for (const r of this.rooms) {
      if (x >= r.min[0] && x <= r.max[0] && y >= r.min[1] - 0.3 && y <= r.max[1] + 0.3 && z >= r.min[2] && z <= r.max[2]) return r;
    }
    return null;
  }

  waterAt(x, z, feetY) {
    if (!this.state.flags.gallery_drained && x > 7 && x < 17 && z > 14.5 && z < 20.9) {
      return feetY < this.waterLevel + 0.05;
    }
    return false;
  }
}
