// Door system: hinged doors + one vertical service gate.
// Pattern adapted from triomonnezza DoorController (no license file there —
// only the IDEA is reused: hinge pivot, heavy back-out easing, isAnimating
// guard; all code here is original).

import * as THREE from "three";

// heavy door back-out (slight overshoot, settles) — s tuned lower than
// tween.js default for a heavy metal door feel
function backOut(t, s = 1.15) {
  t -= 1;
  return t * t * ((s + 1) * t + s) + 1;
}

export class Door {
  constructor({ id, materials, position, yaw = 0, width = 1.06, height = 2.12, thickness = 0.07, openSign = 1, kind = "hinge", locked = false, lockedMessage = "Locked" }) {
    this.id = id;
    this.kind = kind;
    this.locked = locked;
    this.lockedMessage = lockedMessage;
    this.openSign = openSign; // swing direction (+1/-1)
    this.state = "closed"; // closed|opening|open|closing
    this.t = 0; // 0 closed -> 1 open
    this.width = width;
    this.height = height;

    this.group = new THREE.Group(); // pivot at hinge edge
    this.group.position.set(...position);
    this.group.rotation.y = yaw;

    // static frame (jambs + header) — never rotates with the leaf, so the
    // hinges visibly attach to something solid instead of floating in air
    this.frame = new THREE.Group();
    this.frame.position.set(...position);
    this.frame.rotation.y = yaw;

    if (kind === "hinge") {
      const metalPainted = materials.get("metalPainted");
      const darkMetal = materials.get("darkMetal");
      // frame: jambs either side + header over the top (static, in this.frame)
      const jambW = 0.1, jambD = 0.2;
      for (const side of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(jambW, height + 0.1, jambD), metalPainted);
        jamb.position.set(side * (width / 2 + jambW / 2 - 0.01), (height + 0.1) / 2, 0);
        jamb.castShadow = true; jamb.receiveShadow = true;
        this.frame.add(jamb);
      }
      const header = new THREE.Mesh(new THREE.BoxGeometry(width + jambW * 2 + 0.02, 0.12, jambD), metalPainted);
      header.position.set(0, height + 0.1 + 0.06, 0);
      header.castShadow = true;
      this.frame.add(header);
      // threshold strip
      const thresh = new THREE.Mesh(new THREE.BoxGeometry(width + jambW * 2, 0.035, jambD * 0.8), darkMetal);
      thresh.position.set(0, 0.017, 0);
      this.frame.add(thresh);
      // leaf: slab + two recessed panels each side
      const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), metalPainted);
      panel.position.set((openSign * width) / 2, height / 2, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      this.group.add(panel);
      for (const [py, ph] of [[0.62, 0.72], [1.52, 0.42]]) {
        const recess = new THREE.Mesh(new THREE.BoxGeometry(width * 0.58, ph, thickness + 0.012), darkMetal);
        recess.position.set(openSign * width / 2, py, 0);
        this.group.add(recess);
        const inset = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, ph - 0.09, thickness + 0.02), metalPainted);
        inset.position.set(openSign * width / 2, py, 0);
        this.group.add(inset);
      }
      // window slit near the top
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, thickness + 0.005), materials.get("lampOff"));
      slit.position.set(openSign * width * 0.42, 1.85, 0);
      this.group.add(slit);
      // push bar handle at latch edge, both faces
      for (const fz of [1, -1]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), darkMetal);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(openSign * (width - 0.16), 1.02, fz * (thickness / 2 + 0.045));
        this.group.add(bar);
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.03), darkMetal);
        mount.position.set(openSign * (width - 0.1), 1.02, fz * (thickness / 2 + 0.02));
        this.group.add(mount);
      }
      // hinge barrels along the hinge edge — attach leaf to jamb visually
      for (const hy of [0.32, height / 2, height - 0.32]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.11, 10), darkMetal);
        barrel.position.set(0, hy, 0);
        this.group.add(barrel);
        const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), darkMetal);
        knuckle.position.set(-openSign * 0.028, hy, 0);
        this.frame.add(knuckle);
      }
      this.panel = panel;
    } else {
      // vertical gate (service gate): rises up
      const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.14), materials.get("metalRaw"));
      panel.position.set(0, height / 2, 0);
      panel.castShadow = true;
      this.group.add(panel);
      for (let i = 1; i < 4; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.07, 0.17), materials.get("darkMetal"));
        bar.position.set(0, (height / 4) * i, 0);
        this.group.add(bar);
      }
      this.panel = panel;
      // guide channels for the rising gate
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, height + 0.3, 0.24), materials.get("darkMetal"));
        rail.position.set(side * (width / 2 + 0.07), (height + 0.3) / 2, 0);
        rail.castShadow = true;
        this.frame.add(rail);
      }
    }
    this.onOpenSound = null;
    this.onCloseSound = null;
    this.onLockedSound = null;
  }

  interact(playerPos) {
    if (this.locked) {
      if (this.onLockedSound) this.onLockedSound();
      return { locked: true, message: this.lockedMessage };
    }
    if (this.state === "opening" || this.state === "closing") return { busy: true };
    if (this.state === "closed" || this.state === "closing") this.open();
    else this.close(playerPos);
    return { ok: true };
  }

  open() {
    this.state = "opening";
    if (this.onOpenSound) this.onOpenSound();
  }

  close(playerPos) {
    if (playerPos && this.playerInThreshold(playerPos)) return; // never crush/close on player
    this.state = "closing";
    if (this.onCloseSound) this.onCloseSound();
  }

  playerInThreshold(p) {
    const wp = new THREE.Vector3();
    this.group.getWorldPosition(wp);
    const dx = p.x - wp.x, dz = p.z - wp.z;
    return Math.hypot(dx, dz) < Math.max(this.width, 0.9);
  }

  update(dt) {
    const speed = this.kind === "hinge" ? 1.6 : 0.24; // gate is slow/grindy
    if (this.state === "opening") {
      this.t = Math.min(1, this.t + dt * speed);
      if (this.kind === "hinge") this.group.rotation.y = this.baseYaw + backOut(this.t) * this.openSign * -1.85;
      else this.group.position.y = this.baseY + this.t * (this.height * 0.92);
      if (this.t >= 1) {
        this.state = "open";
        if (this.onEndSound) this.onEndSound();
      }
    } else if (this.state === "closing") {
      this.t = Math.max(0, this.t - dt * speed);
      if (this.kind === "hinge") this.group.rotation.y = this.baseYaw + backOut(this.t) * this.openSign * -1.85;
      else this.group.position.y = this.baseY + this.t * (this.height * 0.92);
      if (this.t <= 0) {
        this.state = "closed";
        if (this.onCloseSound) this.onCloseSound();
      }
    }
  }

  set base(yaw) { this._b = yaw; }

  get baseYaw() {
    if (this._b === undefined) this._b = this.group.rotation.y;
    return this._b;
  }

  get baseY() {
    if (this._by === undefined) this._by = this.group.position.y;
    return this._by;
  }

  // world AABB for collision (approx: bounding of current panel pose)
  colliderBox() {
    this.group.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(this.panel);
    return box;
  }

  get isOpenEnough() {
    return this.t > 0.6;
  }
}
