const DEFAULTS = {
  forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD",
  jump: "Space", sprint: "ShiftLeft", crouch: "KeyC", interact: "KeyE",
  flashlight: "KeyF", pause: "Escape",
};

const LABELS = {
  forward: "Move Forward", back: "Move Backward", left: "Strafe Left", right: "Strafe Right",
  jump: "Jump", sprint: "Sprint", crouch: "Crouch", interact: "Interact",
  flashlight: "Flashlight", pause: "Pause",
};

export class Input {
  constructor() {
    this.binds = { ...DEFAULTS };
    this.down = new Set();
    this.lookX = 0; this.lookY = 0;
    this.waiting = null;
    this.onConflict = null;
    this.captureLook = false;
    this.dragging = false;
    this.lastMX = 0; this.lastMY = 0;
    this.load();
    window.addEventListener("keydown", (e) => this._kd(e));
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("mousemove", (e) => this._mm(e));
    window.addEventListener("mousedown", (e) => {
      if (!this.captureLook) return;
      this.dragging = true;
      this.lastMX = e.clientX; this.lastMY = e.clientY;
    });
    window.addEventListener("mouseup", () => { this.dragging = false; });
    window.addEventListener("blur", () => { this.down.clear(); this.dragging = false; });
    window.addEventListener("contextmenu", (e) => { if (this.captureLook) e.preventDefault(); });
  }
  _mm(e) {
    if (!this.captureLook) return;
    const locked = !!document.pointerLockElement;
    if (locked && (e.movementX || e.movementY)) {
      this.lookX += e.movementX;
      this.lookY += e.movementY;
      return;
    }
    // Fallback: any mouse motion while playing (or drag if the iframe eats lock)
    if (locked || this.dragging || e.buttons) {
      const dx = e.movementX || (e.clientX - this.lastMX);
      const dy = e.movementY || (e.clientY - this.lastMY);
      this.lookX += dx;
      this.lookY += dy;
    } else {
      // still look while cursor is over the game without lock
      const dx = e.movementX;
      const dy = e.movementY;
      if (dx || dy) { this.lookX += dx; this.lookY += dy; }
    }
    this.lastMX = e.clientX; this.lastMY = e.clientY;
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem("hc_binds") || "null");
      if (s) this.binds = { ...DEFAULTS, ...s };
    } catch (e) {}
  }
  save() { localStorage.setItem("hc_binds", JSON.stringify(this.binds)); }
  reset() { this.binds = { ...DEFAULTS }; this.save(); }
  actionHeld(name) { return this.down.has(this.binds[name]); }
  consumeLook() {
    // arrow-key look assist
    let x = this.lookX, y = this.lookY;
    if (this.down.has("ArrowLeft")) x -= 18;
    if (this.down.has("ArrowRight")) x += 18;
    if (this.down.has("ArrowUp")) y -= 18;
    if (this.down.has("ArrowDown")) y += 18;
    this.lookX = 0; this.lookY = 0;
    return { x, y };
  }
  beginRebind(action) { this.waiting = action; }
  cancelRebind() { this.waiting = null; }
  _kd(e) {
    if (this.waiting) {
      e.preventDefault();
      if (e.code === "Escape" && this.waiting !== "pause") { this.cancelRebind(); return; }
      const occupied = Object.keys(this.binds).find((k) => k !== this.waiting && this.binds[k] === e.code);
      if (occupied) {
        if (this.onConflict) this.onConflict(this.waiting, occupied, e.code);
        return;
      }
      this.binds[this.waiting] = e.code;
      this.save();
      this.waiting = null;
      return;
    }
    this.down.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  }
  forceBind(action, code) {
    for (const k of Object.keys(this.binds)) if (this.binds[k] === code) this.binds[k] = "";
    this.binds[action] = code;
    this.save();
    this.waiting = null;
  }
  labels() { return LABELS; }
  pretty(code) {
    if (!code) return "—";
    return code.replace("Key", "").replace("Digit", "").replace("Left", " L").replace("Right", " R");
  }
}
