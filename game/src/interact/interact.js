// Data-driven interaction system: registry of interactables with gating,
// prompt text, hold-progress (valves/winch), and guaranteed state changes.

import * as THREE from "three";

export class InteractSystem {
  constructor(player, input, state, audio) {
    this.player = player;
    this.input = input;
    this.state = state;
    this.audio = audio;
    this.items = new Map();
    this.target = null;
    this.holdProgress = 0; // 0..1 for hold-interactions
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 2.6;
    this.blockers = []; // meshes that can block interaction LOS
    this.ui = null; // set by HUD
  }

  add(item) {
    // item: {id, object3d?, position:Vector3, label, verb, hold?:seconds,
    //        enabled:()=>bool, interact:()=>void, onHoldProgress?:(p)=>void,
    //        finishHold?:()=>void}
    this.items.set(item.id, item);
    return item;
  }

  bestTarget() {
    const eye = this.player.eyePosition();
    const fwd = this.player.forward();
    let best = null;
    let bestScore = -1;
    for (const item of this.items.values()) {
      if (item.enabled && !item.enabled()) continue;
      const to = item.position.clone().sub(eye);
      const dist = to.length();
      if (dist > (item.radius || 2.3)) continue;
      const dot = to.normalize().dot(fwd);
      if (dot < 0.55) continue;
      // LOS: wall between player and item blocks interaction
      if (this._blocked(eye, item.position)) continue;
      const score = dot * 2 - dist * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  }

  _blocked(a, b) {
    const dir = b.clone().sub(a);
    const dist = dir.length();
    dir.normalize();
    this.raycaster.set(a, dir);
    this.raycaster.far = dist - 0.15;
    if (this.raycaster.far <= 0) return false;
    const hits = this.raycaster.intersectObjects(this.blockers, false);
    return hits.length > 0;
  }

  update(dt) {
    const prev = this.target;
    this.target = this.player.enabled || this.player.noclip ? this.bestTarget() : null;
    if (this.target !== prev && this.ui) this.ui.promptChanged(this.target, prev);

    const item = this.target;
    if (!item) {
      this.holdProgress = 0;
      return;
    }

    if (!item.hold) {
      this.holdProgress = 0;
      if (this.input.wasPressed("INTERACT")) {
        this.audio.uiTick();
        item.interact();
      }
      return;
    }

    // hold interactions (valves, winch)
    if (this.input.isDown("INTERACT")) {
      this.holdProgress = Math.min(1, this.holdProgress + dt / item.hold);
      if (item.onHoldProgress) item.onHoldProgress(this.holdProgress, dt);
      if (this.holdProgress >= 1 && !item._done) {
        item._done = true;
        if (item.finishHold) item.finishHold();
      }
    } else {
      if (this.holdProgress > 0 && this.holdProgress < 1) {
        this.holdProgress = Math.max(0, this.holdProgress - dt * 0.5);
        if (item.onHoldProgress) item.onHoldProgress(this.holdProgress, dt, true);
      } else {
        this.holdProgress = 0;
      }
      if (item._done && this.holdProgress <= 0) item._done = false;
    }
  }
}
