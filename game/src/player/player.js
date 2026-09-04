// First-person player: capsule (cylinder) vs AABB collision, analytic ground
// (floors + ramps), sprint, head-bob, surface footsteps, hand lamp.
// Architecture per enari devlog: player owns position, camera follows player.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const RADIUS = 0.34;
const EYE = 1.62;
const WALK = 3.0;
const SPRINT_MULT = 1.65;
const WATER_MULT = 0.72;
const STEPH = 0.36; // barriers higher than feet+STEPH block; lower are steppable

export class Player {
  constructor(camera, input, settings, world, audio) {
    this.camera = camera;
    this.input = input;
    this.settings = settings;
    this.world = world;
    this.audio = audio;
    this.pos = new THREE.Vector3(0, 3.2, -16.4); // feet — on the street, north of kiosk
    this.yaw = Math.PI; // forward = (-sin yaw,0,-cos yaw) = +Z: the kiosk door ahead
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.stepAcc = 0;
    this.noclip = false;
    this.speedScale = 1;
    this.frozen = true;
    this.enabled = false; // pointer lock active
    this.inWater = false;
    this._bobY = 0;
    this._bobX = 0;
    this.vy = 0; // vertical velocity (gravity)
    this.airborne = false;
    this._landDip = 0; // landing camera dip
    this._slope = 0; // 0..1 — how slopey the ground underfoot is (stair judder)
    this.torchReady = false;

    // hand lamp
    this.lampOn = false;
    this.lamp = new THREE.SpotLight(0xfff3d8, 0, 16, 0.46, 0.55, 1.4);
    this.lampTarget = new THREE.Object3D();
    this.camera.add(this.lamp);
    this.camera.add(this.lampTarget);
    this.lamp.position.set(0.25, -0.22, 0.1);
    this.lamp.target = this.lampTarget;

    // viewmodel lamp body
    const vm = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.24, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.7 })
    );
    body.rotation.x = Math.PI / 2.4;
    vm.add(body);
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.036, 0.06, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.4, metalness: 0.8, emissive: 0xffe9c0, emissiveIntensity: 0 })
    );
    head.rotation.x = Math.PI / 2.4;
    head.position.set(0, 0.115, -0.085);
    vm.add(head);
    vm.position.set(0.26, -0.25, -0.42);
    vm.rotation.set(0.1, -0.12, 0.05);
    this.camera.add(vm);
    this.vmLamp = vm;
    this.vmHead = head;
    this._vmBase = vm.position.clone();
    this._loadTorch();
  }

  // Real hand torch: "Flashlight" by Brandon Baldwin (Sketchfab, CC-BY-4.0),
  // shipped via threejs-liminality clone with license.txt. Falls back to the
  // procedural body above if the model fails to load.
  _loadTorch() {
    new GLTFLoader().load(
      "models/flashlight/scene.gltf",
      (gltf) => {
        try {
          const model = gltf.scene;
          model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
          // center at origin
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          // longest axis -> Z (beam axis)
          const axes = [["x", size.x], ["y", size.y], ["z", size.z]].sort((a, b) => b[1] - a[1]);
          const [longest, len] = axes[0];
          const inner = new THREE.Group();
          inner.add(model);
          if (longest === "y") inner.rotation.x = -Math.PI / 2; // +Y -> -Z
          else if (longest === "x") inner.rotation.y = Math.PI / 2; // +X -> -Z
          // if longest z: leave (flip handled below if needed)
          // find which end has the glass (lens) meshes -> that end faces forward
          const glassBoxes = new THREE.Box3();
          let hasGlass = false;
          model.traverse((o) => {
            if (o.isMesh && o.material && /glass/i.test(o.material.name || "")) {
              glassBoxes.expandByObject(o);
              hasGlass = true;
            }
          });
          if (hasGlass) {
            const gc = glassBoxes.getCenter(new THREE.Vector3());
            const proj = longest === "y" ? gc.y : longest === "x" ? gc.x : gc.z;
            if (proj < 0) inner.rotation.y += Math.PI; // glass at back -> flip
          }
          // scale to hand-torch length
          const s = 0.34 / Math.max(0.001, len);
          inner.scale.setScalar(s);
          // swap into the viewmodel container (keeps sway/lamp wiring)
          while (this.vmLamp.children.length) this.vmLamp.remove(this.vmLamp.children[0]);
          this.vmLamp.add(inner);
          this.vmHead = null; // procedural head gone; glow handled on glass
          this._torchGlass = [];
          model.traverse((o) => {
            if (o.isMesh && o.material && /glass/i.test(o.material.name || "")) {
              o.material = o.material.clone();
              o.material.emissive = new THREE.Color(0xffe2b0);
              this._torchGlass.push(o.material);
            }
          });
          this.torchReady = true;
        } catch (e) {
          console.warn("torch model setup failed, keeping procedural", e);
        }
      },
      undefined,
      (err) => console.warn("torch model failed to load, keeping procedural", err && err.message)
    );
  }

  toggleLamp() {
    this.lampOn = !this.lampOn;
    this.audio.uiTick();
  }

  update(dt) {
    const inp = this.input;
    if (inp.wasPressed("FLASHLIGHT") && this.enabled) this.toggleLamp();
    this.lamp.intensity += ((this.lampOn ? 42 : 0) - this.lamp.intensity) * Math.min(1, dt * 12);
    if (this.vmHead) this.vmHead.material.emissiveIntensity = this.lamp.intensity / 42 * 1.6;
    if (this._torchGlass) {
      const glow = (this.lamp.intensity / 42) * 1.8;
      for (const gm of this._torchGlass) gm.emissiveIntensity = glow;
    }

    // mouse look
    const { dx, dy } = inp.consumeMouse();
    const sens = 0.0021 * this.settings.data.mouseSensitivity;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    // movement input
    let f = 0, s = 0;
    if (this.enabled || this.noclip) {
      f = (inp.isDown("MOVE_FORWARD") ? 1 : 0) - (inp.isDown("MOVE_BACKWARD") ? 1 : 0);
      s = (inp.isDown("MOVE_RIGHT") ? 1 : 0) - (inp.isDown("MOVE_LEFT") ? 1 : 0);
    }
    const sprint = inp.isDown("SPRINT") && f > 0;
    let speed = WALK * (sprint ? SPRINT_MULT : 1) * this.speedScale;
    this.inWater = this.world.waterAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.inWater) speed *= WATER_MULT;

    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); // forward
    const right = new THREE.Vector3(Math.sin(this.yaw - Math.PI / 2), 0, Math.cos(this.yaw - Math.PI / 2));
    const wish = new THREE.Vector3()
      .addScaledVector(dir, -f)
      .addScaledVector(right, -s);
    if (wish.lengthSq() > 0) wish.normalize();

    if (this.noclip) {
      const e = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
      const fly = new THREE.Vector3(0, 0, -1).applyEuler(e).multiplyScalar(f);
      fly.add(new THREE.Vector3(1, 0, 0).applyEuler(e).multiplyScalar(s));
      if (fly.lengthSq() > 0) fly.normalize();
      this.pos.addScaledVector(fly, speed * 2.4 * dt);
      this._applyCamera(dt, 0);
      return;
    }

    // accelerate/decelerate (snappy but smoothed)
    const target = wish.multiplyScalar(speed);
    const accel = wish.lengthSq() > 0 ? 14 : 10;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * accel);

    // move + collide, axis separated. Each axis only resolves when it moved;
    // resolution clamps position to the touched face (no teleport pushes).
    const nx = this.pos.x + this.vel.x * dt;
    this._tryAxis("x", nx);
    const nz = this.pos.z + this.vel.z * dt;
    this._tryAxis("z", nz);

    // gravity + ground follow
    const g = this.world.groundAt(this.pos.x, this.pos.z);
    const gdy = g.y - this.pos.y;
    this._slope = Math.min(1, Math.abs(gdy) * 5);
    if (!this.airborne && gdy < -STEPH) this.airborne = true; // walked off an edge
    if (this.airborne) {
      this.vy -= 26 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g.y) {
        if (this.vy < -4) this._landDip = Math.min(0.22, -this.vy * 0.022); // landing thump
        this.pos.y = g.y;
        this.vy = 0;
        this.airborne = false;
        if (Math.hypot(this.vel.x, this.vel.z) > 0.4) this.audio.step(this.inWater ? "water" : g.surface);
      }
    } else if (gdy > 0.9) {
      this.pos.y = g.y;
    } else {
      this.pos.y += gdy * Math.min(1, dt * 12);
    }

    // footsteps
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.4) {
      this.stepAcc += hSpeed * dt;
      const stride = sprint ? 2.0 : 1.7;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const surface = this.inWater ? "water" : g.surface;
        this.audio.step(surface);
      }
    }

    this._applyCamera(dt, hSpeed);
  }

  _barrierMax(c) {
    // how high a collider may reach above the feet before it blocks;
    // platform/deck colliders are climbable at their edge (soft)
    return this.pos.y + (c.soft ? 0.66 : STEPH);
  }

  _tryAxis(axis, next) {
    if (Math.abs(next - this.pos[axis]) < 1e-7) return;
    const other = axis === "x" ? "z" : "x";
    const dir = next > this.pos[axis] ? 1 : -1;
    const test = { x: this.pos.x, z: this.pos.z };
    test[axis] = next;
    const lo = this.pos.y + 0.25, hi = this.pos.y + 1.7;
    for (const c of this.world.colliders) {
      if (!c.active) continue;
      const b = c.box;
      if (b.max.y <= this._barrierMax(c)) continue; // steppable / walk-on-top
      if (b.min.y >= hi || b.max.y <= lo) continue; // above or below capsule
      if (test.x + RADIUS > b.min.x && test.x - RADIUS < b.max.x &&
          test.z + RADIUS > b.min.z && test.z - RADIUS < b.max.z) {
        test[axis] = dir > 0 ? b.min[axis] - RADIUS : b.max[axis] + RADIUS;
        this.vel[axis] = 0;
        break; // resolve first contact only — never chain pushes
      }
    }
    this.pos[axis] = test[axis];
  }

  _applyCamera(dt, hSpeed) {
    // dynamic FOV (enari FPSRenderer pattern): slight widening at sprint
    const fovTarget = (hSpeed > WALK * 1.15) ? 81 : 75;
    if (Math.abs(this.camera.fov - fovTarget) > 0.05) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
    // head bob
    const targetAmp = Math.min(1, hSpeed / (WALK * SPRINT_MULT));
    this.bobAmp += (targetAmp - this.bobAmp) * Math.min(1, dt * 6);
    this.bobPhase += hSpeed * dt * 2.1;
    const bobY = Math.sin(this.bobPhase * 2) * 0.032 * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.02 * this.bobAmp;
    this._bobY += (bobY - this._bobY) * Math.min(1, dt * 10);
    this._bobX += (bobX - this._bobX) * Math.min(1, dt * 10);

    const t = performance.now() / 1000;
    // stair/ramp judder: tiny high-frequency vibration while moving on slopes
    const judder = this.bobAmp * this._slope * Math.sin(t * 34) * 0.022;
    const camY = this.pos.y + EYE + this._bobY + judder - this._landDip;
    this._landDip *= Math.exp(-dt * 5.5);
    this.camera.position.set(this.pos.x + this._bobX * 0.4, camY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");

    // viewmodel sway
    const idle = Math.max(0, 1 - this.bobAmp * 1.6); // sway fades while moving
    this.vmLamp.position.set(
      this._vmBase.x + Math.sin(t * 1.1) * 0.004 - this._bobX * 0.15 + Math.sin(t * 0.6) * 0.006 * idle,
      this._vmBase.y + Math.sin(t * 1.7) * 0.003 + this._bobY * 0.4 + Math.sin(t * 0.83 + 1.2) * 0.005 * idle,
      this._vmBase.z + Math.cos(t * 0.45) * 0.004 * idle
    );
    this.vmLamp.rotation.z = Math.sin(t * 0.5) * 0.01 * idle;
    // lamp aims where camera aims
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    this.lampTarget.position.copy(fwd.multiplyScalar(6)).add(this.lamp.position);
  }

  eyePosition() {
    return this.camera.position;
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
  }
}
