import re

w = open('/home/user/3dGame/game/src/world/world.js').read()

# ---- 1) world-scale UV density in box() (the "no textures on walls" fix) ----
a = '''  box(cx, cy, cz, sx, sy, sz, mat, opts = {}) {
    const { collide = true, cast = true, receive = true, variant = null } = opts;
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), variant || mat);'''
b = '''  // Bake world-scale UVs so texture density is uniform (~tile meters per
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
    const m = new THREE.Mesh(geo, variant || mat);'''
assert a in w, "box anchor missing"
w = w.replace(a, b)

# ---- 2) street asphalt: drop the coarse 6x variant hack, use UV scaling ----
a = '''    const asph = this.mats.variant("asphalt", 6, 6);
    this.slab(-10, 10, 3.05, 3.2, -20, -11.3, this.mats.get("asphalt"), { variant: asph });
    this.slab(-10, -1.3, 3.05, 3.2, -11.3, -10.4, this.mats.get("asphalt"), { variant: asph });
    this.slab(1.3, 10, 3.05, 3.2, -11.3, -10.4, this.mats.get("asphalt"), { variant: asph });'''
b = '''    this.slab(-10, 10, 3.05, 3.2, -20, -11.3, this.mats.get("asphalt"), { tile: 2.0 });
    this.slab(-10, -1.3, 3.05, 3.2, -11.3, -10.4, this.mats.get("asphalt"), { tile: 2.0 });
    this.slab(1.3, 10, 3.05, 3.2, -11.3, -10.4, this.mats.get("asphalt"), { tile: 2.0 });'''
assert a in w, "asphalt variant anchor missing"
w = w.replace(a, b)
# grass/soil verges: finer tile
w = w.replace('this.slab(-10, -7.6, 3.2, 3.28, -20, -10.9, vergeMat, { cast: false });',
              'this.slab(-10, -7.6, 3.2, 3.28, -20, -10.9, vergeMat, { cast: false, tile: 1.2 });')
w = w.replace('this.slab(7.6, 10, 3.2, 3.28, -20, -10.9, vergeMat, { cast: false });',
              'this.slab(7.6, 10, 3.2, 3.28, -20, -10.9, vergeMat, { cast: false, tile: 1.2 });')

open('/home/user/3dGame/game/src/world/world.js', 'w').write(w)
print("world UV density patch applied")

k = open('/home/user/3dGame/game/src/world/kit.js').read()
k = k.replace('const b = cyl(0.3, 0.3, 0.9, materials.get("bluePaint"), 0, 0.45, 0);',
              'const b = cyl(0.3, 0.3, 0.9, materials.get("metalPainted"), 0, 0.45, 0); // textured steel drum')
open('/home/user/3dGame/game/src/world/kit.js', 'w').write(k)
print("barrel textured")

p = open('/home/user/3dGame/game/src/player/player.js').read()
# stair judder: raise to clearly-perceptible amplitude (was 0.009 — imperceptible)
p = p.replace('const judder = this.bobAmp * this._slope * Math.sin(t * 34) * 0.009;',
              'const judder = this.bobAmp * this._slope * Math.sin(t * 34) * 0.022;')
# torch slightly larger and higher-contrast
p = p.replace('const s = 0.3 / Math.max(0.001, len);',
              'const s = 0.34 / Math.max(0.001, len);')
open('/home/user/3dGame/game/src/player/player.js', 'w').write(p)
print("judder + torch scale tuned")

d = open('/home/user/3dGame/game/src/world/doors.js').read()
# door close: smooth ease (no back-out overshoot below t=0 — known rough edge)
a = '''    } else if (this.state === "closing") {
      this.t = Math.max(0, this.t - dt * speed);
      if (this.kind === "hinge") this.group.rotation.y = this.baseYaw + backOut(this.t) * this.openSign * -1.85;
      else this.group.position.y = this.baseY + this.t * (this.height * 0.92);'''
b = '''    } else if (this.state === "closing") {
      this.t = Math.max(0, this.t - dt * speed);
      const ease = this.t * this.t * (3 - 2 * this.t); // smoothstep — no overshoot on close
      if (this.kind === "hinge") this.group.rotation.y = this.baseYaw + ease * this.openSign * -1.85;
      else this.group.position.y = this.baseY + ease * (this.height * 0.92);'''
assert a in d, "door close anchor missing"
d = d.replace(a, b)
open('/home/user/3dGame/game/src/world/doors.js', 'w').write(d)
print("door close easing fixed")
