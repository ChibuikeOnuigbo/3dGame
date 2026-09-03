import * as THREE from "three";
import { GLTFLoader } from "../vendor/GLTFLoader.js";

export class Player {
  constructor(camera, input, audio) {
    this.cam = camera;
    this.input = input;
    this.audio = audio;
    this.pos = new THREE.Vector3(0, 1.7, 8);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.7; this.crouchEye = 1.05;
    this.height = 1.7;
    this.onGround = true;
    this.stamina = 1;
    this.hp = 100;
    this.crouch = false;
    this.flash = true;
    this.bob = 0;
    this.stepAcc = 0;
    this.radius = 0.35;
    this.shake = 0;
    this.collide = null;
    this.surface = "concrete";
    this.debug = { collide: true, gravity: true, noclip: false, force: 1 };
    this.coyote = 0;
    this.style = 0;
    this.styleRank = "NORMAL";
    this.settings = {
      sensH: 0.0038, sensV: 0.0038, invertY: false, fov: 75,
      bob: 1, shake: 1, motion: 1, smooth: 0,
    };
    this.light = new THREE.SpotLight(0xd8eeff, 0, 22, 0.38, 0.35, 1.05);
    this.light.castShadow = false;
    this.fill = new THREE.PointLight(0xcde8ff, 0, 6, 1.8);
    this.flashBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0x33383a, metalness: 0.6, roughness: 0.4, emissive: 0x88aacc, emissiveIntensity: 0.4 })
    );
    this._buildArms(camera);
  }
  _buildArms(cam) {
    const g = new THREE.Group();
    g.position.set(0, -0.22, -0.28);
    const matSkin = new THREE.MeshLambertMaterial({ color: 0x6a5344 });
    const matCloth = new THREE.MeshLambertMaterial({ color: 0x2a3230 });
    const matMetal = new THREE.MeshLambertMaterial({ color: 0x8a9194 });
    const matGold = new THREE.MeshLambertMaterial({ color: 0xb9974a });
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.14), matCloth);
    sleeve.position.set(0.22, -0.12, 0.18);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), matSkin);
    arm.position.set(0.22, -0.28, 0.05);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.16), matSkin);
    hand.position.set(0.22, -0.38, -0.08);
    const gun = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.28), matMetal);
    body.position.set(0.18, -0.34, -0.22);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), matMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.18, -0.32, -0.4);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), matGold);
    grip.position.set(0.18, -0.42, -0.14);
    gun.add(body, barrel, grip);
    const lSleeve = sleeve.clone(); lSleeve.position.x = -0.2;
    const lArm = arm.clone(); lArm.position.x = -0.2;
    const lHand = hand.clone(); lHand.position.x = -0.18;
    this.lArm = lArm; this.lHand = lHand;
    this.flashBeam.rotation.x = Math.PI / 2;
    this.flashBeam.position.set(-0.16, -0.32, -0.28);
    g.add(sleeve, arm, hand, gun, lSleeve, lArm, lHand, this.flashBeam);
    this.arms = g;
    cam.add(g);
    cam.near = 0.05;
    this.torchTune = { x: 0.04, y: 0.02, z: 0.1, rx: 1.2, ry: 0, rz: 0.15, s: 0.006 };
  }
  attachViewmodels(proto) {
    const grip = new THREE.Group();
    grip.position.set(-0.16, -0.34, -0.18);
    this.arms.add(grip);
    this.torchGrip = grip;
    if (proto.hand) {
      const h = proto.hand.clone(true);
      h.scale.set(0.22, 0.22, 0.22);
      h.rotation.set(1.15, 0.35, 0.2);
      grip.add(h);
      this.viewHand = h;
      if (this.lHand) this.lHand.visible = false;
    }
    if (proto.flashlight) {
      const t = proto.flashlight.clone(true);
      this.viewTorch = t;
      grip.add(t);
      this._applyTorchTune();
      if (this.flashBeam) this.flashBeam.visible = false;
    }
  }
  _applyTorchTune() {
    if (!this.viewTorch) return;
    const t = this.torchTune;
    this.viewTorch.position.set(t.x, t.y, t.z);
    this.viewTorch.rotation.set(t.rx, t.ry, t.rz);
    this.viewTorch.scale.setScalar(t.s);
  }
  applySettings(s) {
    Object.assign(this.settings, s);
    this.cam.fov = s.fov; this.cam.updateProjectionMatrix();
  }
  damage(n) {
    this.hp = Math.max(0, this.hp - n);
    this.shake = 0.35;
  }
  update(dt, paused) {
    if (paused) return;
    const look = this.input.consumeLook();
    const inv = this.settings.invertY ? 1 : -1;
    this.yaw -= look.x * this.settings.sensH;
    this.pitch += look.y * this.settings.sensV * inv;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
    const wantCrouch = this.input.actionHeld("crouch");
    this.crouch = wantCrouch;
    const targetEye = this.crouch ? this.crouchEye : this.eye;
    this.height += (targetEye - this.height) * Math.min(1, dt * 10);
    const sprint = this.input.actionHeld("sprint") && this.stamina > 0.05 && !this.crouch;
    const F = this.debug.force || 1;
    let spd = (this.crouch ? 2.1 : sprint ? 6.4 : 3.6) * F;
    if (this.debug.noclip) spd = 9 * F;
    if (sprint) this.stamina = Math.max(0, this.stamina - dt * 0.22);
    else this.stamina = Math.min(1, this.stamina + dt * 0.18);
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.input.actionHeld("forward")) wish.add(f);
    if (this.input.actionHeld("back")) wish.sub(f);
    if (this.input.actionHeld("right")) wish.add(r);
    if (this.input.actionHeld("left")) wish.sub(r);
    if (this.debug.noclip) {
      if (this.input.actionHeld("jump")) wish.y += 1;
      if (this.input.actionHeld("crouch")) wish.y -= 1;
    }
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(spd);
    const accel = this.onGround ? 16 : 7;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, dt * accel);
    if (this.debug.noclip) this.vel.y += (wish.y - this.vel.y) * Math.min(1, dt * 12);
    else if (this.input.actionHeld("jump") && (this.onGround || this.coyote > 0)) {
      this.vel.y = 5.6 * F; this.onGround = false; this.coyote = 0;
    }
    if (!this.debug.noclip && this.debug.gravity) this.vel.y -= 16 * dt;
    else if (!this.debug.gravity && !this.debug.noclip) this.vel.y = 0;
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    let ny = this.pos.y + this.vel.y * dt;
    const useCol = this.debug.collide && !this.debug.noclip && this.collide;
    if (useCol) {
      const hx = this.collide(nx, this.pos.y, this.pos.z, this.radius);
      if (!hx) this.pos.x = nx; else this.vel.x = 0;
      const hz = this.collide(this.pos.x, this.pos.y, nz, this.radius);
      if (!hz) this.pos.z = nz; else this.vel.z = 0;
    } else { this.pos.x = nx; this.pos.z = nz; }
    const floorY = this.collide ? this.collide.floor(this.pos.x, this.pos.z) : 0;
    if (!this.debug.noclip && this.debug.gravity) {
      if (ny <= floorY + 0.02) {
        if (!this.onGround && this.vel.y < -4) this.shake = 0.12 * this.settings.shake;
        ny = floorY; this.vel.y = 0; this.onGround = true; this.coyote = 0.14;
      } else { this.onGround = false; this.coyote = Math.max(0, this.coyote - dt); }
      this.pos.y = ny;
    } else {
      this.pos.y = ny;
      this.onGround = true;
    }
    const moving = wish.lengthSq() > 0.1 && this.onGround;
    if (moving) {
      this.bob += dt * (sprint ? 14 : 9);
      this.stepAcc += dt * (sprint ? 2.4 : 1.6);
      if (this.stepAcc > 1) { this.stepAcc = 0; this.audio.foot(this.surface); }
    }
    const bobA = 0.018 * this.settings.bob * this.settings.motion;
    const bobY = Math.sin(this.bob * 2) * bobA * (moving ? 1 : 0);
    const bobX = Math.sin(this.bob) * bobA * 0.6 * (moving ? 1 : 0);
    this.shake *= Math.pow(0.08, dt);
    const sh = this.shake * this.settings.shake * this.settings.motion;
    this.cam.position.set(this.pos.x + bobX + (Math.random() - 0.5) * sh, this.pos.y + this.height + bobY, this.pos.z);
    this.cam.rotation.order = "YXZ";
    this.cam.rotation.y = this.yaw;
    this.cam.rotation.x = this.pitch;
    this.cam.updateMatrixWorld();
    const origin = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    this.cam.getWorldPosition(origin);
    this.cam.getWorldDirection(ahead);
    this.light.position.copy(origin);
    this.light.target.position.copy(origin).addScaledVector(ahead, 8);
    this.light.target.updateMatrixWorld();
    this.fill.position.copy(origin);
    this.light.intensity = this.flash ? 7.5 : 0;
    this.fill.intensity = this.flash ? 1.35 : 0.08;
    if (this.flashBeam) this.flashBeam.material.emissiveIntensity = this.flash ? 2.2 : 0.05;
    if (this.arms) {
      this.arms.position.y = -0.22 + bobY * 0.4;
      this.arms.rotation.x = this.pitch * 0.08;
    }
  }
  attachLights(scene) {
    scene.add(this.light);
    scene.add(this.light.target);
    scene.add(this.fill);
  }
  toggleFlash() { this.flash = !this.flash; }
}
