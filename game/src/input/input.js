// Input: action-based keyboard state + rebind capture + pointer-lock mouse look.
// Patterns adapted from enari-engine InputManager/KeyBinding (MIT, iercann).

import { keyLabel } from "../core/settings.js";

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.pressed = new Set(); // codes currently down
    this.justPressed = new Set(); // codes pressed this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.capturing = null; // action name while listening for a rebind
    this.onCapture = null; // callback(code) during rebind
    this.onEscapeCapture = null; // callback when capture canceled via Escape
    this.suppressNext = new Set(); // swallow key that was used in a menu

    this._down = (e) => this._onDown(e);
    this._up = (e) => this._onUp(e);
    this._move = (e) => this._onMove(e);
    window.addEventListener("keydown", this._down);
    window.addEventListener("keyup", this._up);
    window.addEventListener("mousemove", this._move);
  }

  dispose() {
    window.removeEventListener("keydown", this._down);
    window.removeEventListener("keyup", this._up);
    window.removeEventListener("mousemove", this._move);
  }

  _onDown(e) {
    if (this.capturing) {
      e.preventDefault();
      // Escape cancels the capture, anything else (incl. Escape remap via
      // dedicated handling) binds; we exclude nothing else.
      const cb = this.onCapture;
      this.capturing = null;
      if (cb) cb(e.code);
      return;
    }
    if (e.repeat) return;
    this.pressed.add(e.code);
    this.justPressed.add(e.code);
    if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
  }

  _onUp(e) {
    this.pressed.delete(e.code);
  }

  _onMove(e) {
    if (document.pointerLockElement) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  }

  beginCapture(onCapture) {
    this.capturing = true;
    this.onCapture = onCapture;
  }

  cancelCapture() {
    this.capturing = null;
    this.onCapture = null;
  }

  // Action queries — resolve through bindings every frame (cheap, correct after rebind).
  isDown(action) {
    return this.pressed.has(this.settings.binding(action));
  }

  wasPressed(action) {
    return this.justPressed.has(this.settings.binding(action));
  }

  pressedCodeLabel(action) {
    return keyLabel(this.settings.binding(action));
  }

  consumeMouse() {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.justPressed.clear();
  }
}
