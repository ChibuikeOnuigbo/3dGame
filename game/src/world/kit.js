// Prop & machinery kit. All geometry authored in code (CC0 by project);
// surfaces use ambientCG CC0 PBR materials. Every factory returns a THREE.Group
// with userData.colliders = local-space AABB list [minX,minY,minZ,maxX,maxY,maxZ]
// so the world can build collision from placements (directive: simple collision
// geometry, decorative micro-detail excluded).

import * as THREE from "three";
import { makePaperTexture } from "./materials.js";

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 18) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function torus(r, t, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 26), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function collider(g, minX, minY, minZ, maxX, maxY, maxZ) {
  if (!g.userData.colliders) g.userData.colliders = [];
  g.userData.colliders.push([minX, minY, minZ, maxX, maxY, maxZ]);
}

// ---------------- machinery ----------------

export function pumpTrain(materials, index) {
  const g = new THREE.Group();
  const metal = materials.get("metalPainted");
  const raw = materials.get("metalRaw");
  const trim = materials.get("trim");

  const base = box(3.4, 0.4, 1.7, metal, 0, 0.2, 0);
  g.add(base);
  collider(g, -1.7, 0, -0.85, 1.7, 1.1, 0.85);

  // motor block
  const motor = cyl(0.62, 0.62, 1.7, metal, -0.9, 1.05, 0);
  motor.rotation.z = Math.PI / 2;
  g.add(motor);
  // cooling fins
  for (let i = 0; i < 5; i++) {
    const fin = cyl(0.68, 0.68, 0.05, raw, -1.5 + i * 0.3, 1.05, 0);
    fin.rotation.z = Math.PI / 2;
    g.add(fin);
  }
  // flywheel (spins when running)
  const fly = cyl(0.5, 0.5, 0.16, raw, -0.05, 1.05, 0);
  fly.rotation.z = Math.PI / 2;
  g.add(fly);
  const spoke = box(0.9, 0.07, 0.07, trim, -0.05, 1.05, 0);
  fly.add(spoke.clone());
  const spoke2 = spoke.clone();
  spoke2.rotation.x = Math.PI / 2;
  fly.add(spoke2);
  fly.userData.spin = true;
  g.userData.flywheel = fly;

  // volute + suction down + discharge up
  const volute = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), metal);
  volute.position.set(0.75, 1.0, 0);
  volute.scale.set(1, 0.85, 1);
  volute.castShadow = true;
  g.add(volute);
  const discharge = cyl(0.22, 0.22, 1.5, raw, 0.75, 2.0, 0);
  g.add(discharge);
  const flange = cyl(0.3, 0.3, 0.08, raw, 0.75, 2.72, 0);
  g.add(flange);

  // junction box + gauge
  const jb = box(0.42, 0.5, 0.3, trim, -0.9, 1.85, 0.25);
  g.add(jb);
  const gauge = new THREE.Group();
  const gface = cyl(0.09, 0.09, 0.03, materials.get("paper"), 0, 0, 0);
  gface.rotation.x = Math.PI / 2;
  gauge.add(gface);
  gauge.position.set(-1.35, 1.5, 0.45);
  g.add(gauge);

  // grease points / small detail
  g.add(box(0.5, 0.08, 0.5, raw, 0.75, 0.44, 0));
  g.userData.name = `pump_${index}`;
  return g;
}

export function valveWheel(materials, colorMatKey) {
  const g = new THREE.Group();
  const mat = materials.get(colorMatKey || "yellowPaint");
  const wheel = torus(0.34, 0.045, mat, 0, 0, 0);
  g.add(wheel);
  for (let i = 0; i < 4; i++) {
    const spoke = box(0.06, 0.66, 0.06, mat, 0, 0, 0);
    spoke.rotation.z = (i * Math.PI) / 4;
    g.add(spoke);
  }
  g.add(cyl(0.09, 0.09, 0.14, materials.get("metalRaw"), 0, 0, 0.02).rotateX(Math.PI / 2));
  g.userData.wheel = wheel;
  return g;
}

export function breakerBox(materials, { levers = 4, wide = false } = {}) {
  const g = new THREE.Group();
  const w = wide ? 1.1 : 0.62;
  const cabinet = box(w, 0.85, 0.22, materials.get("metalPainted"), 0, 0, 0);
  g.add(cabinet);
  const frame = box(w + 0.06, 0.91, 0.05, materials.get("trim"), 0, 0, 0.1);
  g.add(frame);
  const leverList = [];
  for (let i = 0; i < levers; i++) {
    const lx = -w / 2 + (w / levers) * (i + 0.5);
    const lever = new THREE.Group();
    lever.add(box(0.09, 0.3, 0.07, materials.get("redPaint"), 0, 0, 0));
    lever.position.set(lx, 0.05, 0.13);
    g.add(lever);
    leverList.push(lever);
  }
  g.userData.levers = leverList;
  collider(g, -w / 2 - 0.05, -0.45, -0.15, w / 2 + 0.05, 0.45, 0.15);
  return g;
}

export function masterBreakerCabinet(materials) {
  const g = new THREE.Group();
  const body = box(0.9, 1.5, 0.35, materials.get("metalPainted"), 0, 0.75, 0);
  g.add(body);
  const band = box(0.96, 0.2, 0.37, materials.get("redPaint"), 0, 1.32, 0);
  g.add(band);
  const handle = new THREE.Group();
  handle.add(box(0.14, 0.55, 0.1, materials.get("redPaint")));
  handle.position.set(0, 0.85, 0.22);
  g.add(handle);
  g.userData.handle = handle;
  const lamp = box(0.1, 0.1, 0.06, materials.get("glowRed"), 0.3, 1.32, 0.2);
  g.add(lamp);
  g.userData.lamp = lamp;
  collider(g, -0.5, 0, -0.2, 0.5, 1.55, 0.2);
  return g;
}

export function controlPanel(materials) {
  const g = new THREE.Group();
  const body = box(1.5, 1.05, 0.55, materials.get("metalPainted"), 0, 0.52, 0);
  g.add(body);
  const slant = box(1.5, 0.08, 0.5, materials.get("darkMetal"), 0, 1.06, 0.18);
  slant.rotation.x = -0.35;
  g.add(slant);
  const screen = box(0.55, 0.34, 0.03, materials.get("glowCool"), -0.32, 1.13, 0.32);
  screen.rotation.x = -0.35;
  g.add(screen);
  for (let i = 0; i < 6; i++) {
    g.add(box(0.09, 0.09, 0.05, i % 2 ? materials.get("glowGreen") : materials.get("redPaint"), 0.18 + (i % 3) * 0.2, 1.1 + Math.floor(i / 3) * 0.18, 0.34));
  }
  collider(g, -0.75, 0, -0.28, 0.75, 1.1, 0.28);
  return g;
}

export function pipeRun(materials, points, radius = 0.11) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), radius, 10, false);
  const m = new THREE.Mesh(geo, materials.get("metalRaw"));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------- furniture / props ----------------

export function desk(materials) {
  const g = new THREE.Group();
  const wood = materials.get("wood");
  const top = box(1.7, 0.06, 0.8, wood, 0, 0.75, 0);
  g.add(top);
  g.add(box(0.06, 0.72, 0.75, wood, -0.8, 0.38, 0));
  g.add(box(0.06, 0.72, 0.75, wood, 0.8, 0.38, 0));
  g.add(box(0.7, 0.3, 0.7, wood, -0.4, 0.55, 0)); // drawer block
  for (let i = 0; i < 2; i++) {
    g.add(box(0.55, 0.03, 0.02, materials.get("trim"), -0.4, 0.45 + i * 0.12, 0.36));
  }
  collider(g, -0.85, 0, -0.4, 0.85, 0.78, 0.4);
  return g;
}

export function chair(materials) {
  const g = new THREE.Group();
  const wood = materials.get("wood");
  const trim = materials.get("trim");
  g.add(box(0.45, 0.05, 0.45, wood, 0, 0.46, 0));
  g.add(box(0.45, 0.55, 0.05, wood, 0, 0.75, -0.2));
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    g.add(box(0.05, 0.46, 0.05, trim, x, 0.23, z));
  }
  collider(g, -0.24, 0, -0.24, 0.24, 0.5, 0.24);
  return g;
}

export function shelfUnit(materials, crates = 2) {
  const g = new THREE.Group();
  const wood = materials.get("wood");
  const trim = materials.get("trim");
  for (const [x, z] of [[-0.85, -0.25], [0.85, -0.25], [-0.85, 0.25], [0.85, 0.25]]) {
    g.add(box(0.07, 2.0, 0.07, trim, x, 1.0, z));
  }
  for (const y of [0.35, 1.0, 1.65]) {
    g.add(box(1.8, 0.05, 0.6, wood, 0, y, 0));
  }
  for (let i = 0; i < crates; i++) {
    g.add(box(0.55, 0.4, 0.45, wood, -0.4 + i * 0.8, 0.6, 0));
  }
  collider(g, -0.95, 0, -0.35, 0.95, 2.0, 0.35);
  return g;
}

export function locker(materials) {
  const g = new THREE.Group();
  const body = box(0.5, 1.9, 0.55, materials.get("metalPainted"), 0, 0.95, 0);
  g.add(body);
  g.add(box(0.02, 1.7, 0.02, materials.get("trim"), 0, 0.95, 0.28));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.34, 0.015, 0.02, materials.get("trim"), 0, 0.35 + i * 0.09, 0.29));
  }
  collider(g, -0.28, 0, -0.3, 0.28, 1.9, 0.3);
  return g;
}

export function barrel(materials) {
  const g = new THREE.Group();
  const b = cyl(0.3, 0.3, 0.9, materials.get("metalPainted"), 0, 0.45, 0); // textured steel drum
  g.add(b);
  for (const y of [0.15, 0.45, 0.75]) {
    const ring = cyl(0.315, 0.315, 0.04, materials.get("darkMetal"), 0, y, 0);
    g.add(ring);
  }
  collider(g, -0.32, 0, -0.32, 0.32, 0.9, 0.32);
  return g;
}

export function crate(materials, s = 0.7) {
  const g = new THREE.Group();
  g.add(box(s, s, s, materials.get("wood"), 0, s / 2, 0));
  g.add(box(s + 0.02, 0.06, 0.08, materials.get("trim"), 0, s - 0.08, 0));
  g.add(box(s + 0.02, 0.06, 0.08, materials.get("trim"), 0, 0.08, 0));
  collider(g, -s / 2, 0, -s / 2, s / 2, s, s / 2);
  return g;
}

export function toolbox(materials) {
  const g = new THREE.Group();
  g.add(box(0.55, 0.25, 0.28, materials.get("redPaint"), 0, 0.125, 0));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 14, Math.PI), materials.get("darkMetal"));
  handle.position.set(0, 0.26, 0);
  g.add(handle);
  collider(g, -0.28, 0, -0.15, 0.28, 0.3, 0.15);
  return g;
}

export function extinguisher(materials) {
  const g = new THREE.Group();
  g.add(cyl(0.075, 0.075, 0.5, materials.get("redPaint"), 0, 0.55, 0));
  g.add(cyl(0.03, 0.03, 0.1, materials.get("darkMetal"), 0, 0.85, 0));
  g.add(box(0.12, 0.03, 0.05, materials.get("darkMetal"), 0.05, 0.78, 0));
  return g; // wall-mounted, no collider
}

export function bedroll(materials) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.1, 4, 10), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }));
  m.rotation.z = Math.PI / 2;
  m.position.y = 0.26;
  m.scale.set(1, 1, 0.55);
  m.receiveShadow = true;
  g.add(m);
  const pillow = box(0.34, 0.12, 0.5, new THREE.MeshStandardMaterial({ color: 0x8a7d5f, roughness: 0.95 }), -0.72, 0.3, 0);
  g.add(pillow);
  collider(g, -0.9, 0, -0.3, 0.9, 0.4, 0.3);
  return g;
}

export function radioSet(materials, on) {
  const g = new THREE.Group();
  g.add(box(0.34, 0.2, 0.14, materials.get("trim"), 0, 0.1, 0));
  g.add(cyl(0.006, 0.006, 0.3, materials.get("darkMetal"), 0.12, 0.3, -0.03));
  const dial = box(0.2, 0.08, 0.01, materials.get(on ? "glowWarm" : "lampOff"), -0.04, 0.12, 0.075);
  g.add(dial);
  g.userData.dial = dial;
  collider(g, -0.18, 0, -0.08, 0.18, 0.22, 0.08);
  return g;
}

export function noticeBoard(materials, papers) {
  const g = new THREE.Group();
  g.add(box(1.5, 1.0, 0.06, materials.get("wood"), 0, 0, 0));
  g.add(box(1.6, 1.1, 0.03, materials.get("trim"), 0, 0, -0.03));
  papers.forEach((p, i) => {
    const tex = makePaperTexture(p.title, p.lines);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.45), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    paper.position.set(-0.5 + (i % 3) * 0.5, 0.18 - Math.floor(i / 3) * 0.5, 0.045);
    paper.rotation.z = (Math.random() - 0.5) * 0.14;
    g.add(paper);
  });
  collider(g, -0.8, -0.55, -0.06, 0.8, 0.55, 0.06);
  return g;
}

export function gantryPlatform(materials, length = 6) {
  const g = new THREE.Group();
  const deck = box(length, 0.1, 1.3, materials.get("darkMetal"), 0, 0, 0);
  g.add(deck);
  // grating texture: cross bars
  for (let i = 0; i < length * 4; i++) {
    g.add(box(0.05, 0.02, 1.28, materials.get("trim"), -length / 2 + i * (length / (length * 4)) * 4, 0.06, 0));
  }
  for (const side of [-0.6, 0.6]) {
    for (let i = 0; i <= length; i += 1.5) {
      g.add(box(0.05, 1.05, 0.05, materials.get("trim"), -length / 2 + i, 0.55, side));
    }
    g.add(box(length, 0.05, 0.05, materials.get("trim"), 0, 1.05, side));
    g.add(box(length, 0.05, 0.05, materials.get("trim"), 0, 0.6, side));
  }
  collider(g, -length / 2, -0.05, -0.65, length / 2, 0.35, 0.65);
  return g;
}

export function ladder(materials, height) {
  const g = new THREE.Group();
  const mat = materials.get("darkMetal");
  for (const x of [-0.25, 0.25]) {
    g.add(box(0.06, height, 0.06, mat, x, height / 2, 0));
  }
  const rungGeo = new THREE.BoxGeometry(0.5, 0.035, 0.035);
  const rungs = Math.floor(height / 0.32);
  const inst = new THREE.InstancedMesh(rungGeo, mat, rungs);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < rungs; i++) {
    dummy.position.set(0, 0.25 + i * 0.32, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  g.add(inst);
  return g;
}

// ---------------- light fixtures ----------------

export function fluorescentFixture(materials, { on = true, warm = false } = {}) {
  const g = new THREE.Group();
  g.add(box(1.3, 0.07, 0.16, materials.get("trim"), 0, 0.04, 0));
  const tube = box(1.15, 0.05, 0.09, materials.get(on ? (warm ? "glowWarm" : "glowCool") : "lampOff"), 0, -0.015, 0);
  g.add(tube);
  g.userData.tube = tube;
  return g;
}

export function wallLamp(materials, { on = true } = {}) {
  const g = new THREE.Group();
  g.add(box(0.16, 0.24, 0.12, materials.get("trim"), 0, 0, 0.02));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 0.18, 14, 1, true),
    materials.get(on ? "glowWarm" : "lampOff")
  );
  shade.material = shade.material.clone();
  shade.position.set(0, -0.02, 0.16);
  shade.rotation.x = Math.PI;
  g.add(shade);
  g.userData.bulb = shade;
  return g;
}

export function stringLights(materials, count = 7, span = 4.5) {
  const g = new THREE.Group();
  const bulbGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const mat = materials.get("gloWwarm") ? materials.get("glowWarm") : materials.get("glowWarm");
  g.userData.bulbs = [];
  const wireMat = materials.get("trim");
  for (let i = 0; i < count; i++) {
    const x = -span / 2 + (span / (count - 1)) * i;
    const y = -0.12 - Math.sin((i / (count - 1)) * Math.PI) * 0.18;
    const bulb = new THREE.Mesh(bulbGeo, mat);
    bulb.position.set(x, y, 0);
    g.add(bulb);
    g.userData.bulbs.push(bulb);
    if (i > 0) {
      const px = -span / 2 + (span / (count - 1)) * (i - 1);
      const py = -0.12 - Math.sin(((i - 1) / (count - 1)) * Math.PI) * 0.18;
      const seg = box(Math.hypot(x - px, y - py) * 1.02, 0.008, 0.008, wireMat, (x + px) / 2, (y + py) / 2, 0);
      seg.rotation.z = Math.atan2(y - py, x - px);
      g.add(seg);
    }
  }
  return g;
}

// ---------------- signage ----------------

export function signPlane(materials, texture, w, h, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: opts.lit ? 0.55 : 0.0,
    roughness: 0.6,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  if (opts.backing) {
    const back = box(w + 0.06, h + 0.06, 0.04, materials.get("trim"), 0, 0, -0.03);
    const g = new THREE.Group();
    g.add(m);
    g.add(back);
    return g;
  }
  return m;
}

// ---------------- water ----------------

export function waterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x24343c) },
      uOpacity: { value: 0.82 },
    },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      uniform float uTime;
      float wave(vec2 p, vec2 dir, float freq, float speed, float amp){
        return sin(dot(p, dir) * freq + uTime * speed) * amp;
      }
      void main(){
        vec3 pos = position;
        float h = wave(pos.xy, vec2(1.0,0.35), 2.1, 1.3, 0.012)
                + wave(pos.xy, vec2(-0.4,1.0), 3.3, 1.7, 0.008);
        pos.z += h;
        float e = 0.08;
        float hx = wave(pos.xy + vec2(e,0.), vec2(1.0,0.35),2.1,1.3,0.012) + wave(pos.xy + vec2(e,0.), vec2(-0.4,1.0),3.3,1.7,0.008);
        float hy = wave(pos.xy + vec2(0.,e), vec2(1.0,0.35),2.1,1.3,0.012) + wave(pos.xy + vec2(0.,e), vec2(-0.4,1.0),3.3,1.7,0.008);
        vNormal = normalize(vec3(h - hx, h - hy, e));
        vPos = (modelViewMatrix * vec4(pos,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      void main(){
        vec3 viewDir = normalize(-vPos);
        float fres = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.2);
        vec3 col = mix(uColor, vec3(0.55,0.65,0.7), fres * 0.8);
        float shimmer = sin(vPos.x*14.0 + uTime*2.0) * sin(vPos.y*11.0 - uTime*1.4);
        col += vec3(0.02) * smoothstep(0.86, 1.0, shimmer);
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
}
