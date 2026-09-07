import re

w = open('/home/user/3dGame/game/src/world/world.js').read()

# ---- A) night sky: stars + moon + halo, attached to the sky dome ----
a = '''    sky.position.set(0, 3, -13);
    this.scene.add(sky);
    this.sky = sky;
  }'''
b = '''    sky.position.set(0, 3, -13);
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
  }'''
assert a in w, "sky anchor missing"
w = w.replace(a, b)

# ---- B) street: grass verges + perimeter fence + bushes (map sealed at slab edge) ----
a = '''    // building silhouettes (dark masses)
    this.box(-7.5, 8.5, -19, 6, 11, 6, this.mats.get("trim"), { collide: false, receive: false });
    this.box(8.5, 9.5, -18.5, 7, 13, 5, this.mats.get("trim"), { collide: false, receive: false });'''
b = '''    // building silhouettes (dark masses)
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
    }'''
assert a in w, "street anchor missing"
w = w.replace(a, b)

# ---- C) collider tags for the overlap audit ----
a = '''        this.colliders.push({
          box: new THREE.Box3(
            new THREE.Vector3(wx - ex, y + ly0, wz - ez),
            new THREE.Vector3(wx + ex, y + ly1, wz + ez)
          ),
          active: true,
          soft,
        });'''
b = '''        this.colliders.push({
          box: new THREE.Box3(
            new THREE.Vector3(wx - ex, y + ly0, wz - ez),
            new THREE.Vector3(wx + ex, y + ly1, wz + ez)
          ),
          active: true,
          soft,
          tag: (group.name || "prop"),
        });'''
assert a in w, "collider push anchor missing"
w = w.replace(a, b)

open('/home/user/3dGame/game/src/world/world.js', 'w').write(w)
print("world sky + street + tags done")
