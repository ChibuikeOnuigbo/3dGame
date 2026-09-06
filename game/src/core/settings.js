// Settings + control bindings, persisted to localStorage.
// Bindings are action -> KeyboardEvent.code (physical key, layout independent).

const LS_KEY = "stillwater.settings.v1";

export const DEFAULT_BINDINGS = {
  MOVE_FORWARD: "KeyW",
  MOVE_BACKWARD: "KeyS",
  MOVE_LEFT: "KeyA",
  MOVE_RIGHT: "KeyD",
  INTERACT: "KeyE",
  SPRINT: "ShiftLeft",
  FLASHLIGHT: "KeyF",
  PAUSE: "Escape",
  DEBUG: "Backquote",
  DEBUG_SHOT: "KeyN",
  DEBUG_COLLIDERS: "KeyB",
};

export const ACTION_LABELS = {
  MOVE_FORWARD: "Move forward",
  MOVE_BACKWARD: "Move backward",
  MOVE_LEFT: "Move left",
  MOVE_RIGHT: "Move right",
  INTERACT: "Interact",
  SPRINT: "Sprint",
  FLASHLIGHT: "Hand lamp",
  PAUSE: "Pause",
  DEBUG: "Debug overlay",
  DEBUG_SHOT: "Debug: save screenshot",
  DEBUG_COLLIDERS: "Debug: collider boxes",
};

export const DEFAULT_SETTINGS = {
  masterVolume: 0.9,
  ambienceVolume: 0.8,
  sfxVolume: 1.0,
  mouseSensitivity: 1.0,
  fov: 72,
  quality: "medium", // low | medium | high
  brightness: 1.0,
  debugMode: false, // human QA loop: N saves a screenshot, B toggles colliders
  bindings: { ...DEFAULT_BINDINGS },
};

function deepCopy(o) {
  return JSON.parse(JSON.stringify(o));
}

export class Settings {
  constructor() {
    this.data = deepCopy(DEFAULT_SETTINGS);
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      this.data = { ...deepCopy(DEFAULT_SETTINGS), ...saved };
      // merge bindings so new actions get defaults
      this.data.bindings = { ...DEFAULT_BINDINGS, ...(saved.bindings || {}) };
    } catch (e) {
      console.warn("settings load failed, using defaults", e);
    }
  }

  save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn("settings save failed", e);
    }
  }

  get bindings() {
    return this.data.bindings;
  }

  binding(action) {
    return this.data.bindings[action];
  }

  rebind(action, code) {
    this.data.bindings[action] = code;
    this.save();
  }

  // Returns action owning `code`, excluding `except` — for conflict detection.
  conflict(code, exceptAction) {
    for (const [action, bound] of Object.entries(this.data.bindings)) {
      if (action !== exceptAction && bound === code) return action;
    }
    return null;
  }

  set(path, value) {
    this.data[path] = value;
    this.save();
  }

  resetBindings() {
    this.data.bindings = { ...DEFAULT_BINDINGS };
    this.save();
  }

  resetAll() {
    this.data = deepCopy(DEFAULT_SETTINGS);
    this.save();
  }
}

// Normalize a KeyboardEvent.code into a readable keycap label.
export function keyLabel(code) {
  if (!code) return "?";
  const map = {
    Space: "SPACE", ShiftLeft: "SHIFT", ShiftRight: "R-SHIFT",
    ControlLeft: "CTRL", ControlRight: "R-CTRL",
    AltLeft: "ALT", AltRight: "R-ALT",
    Escape: "ESC", Enter: "ENTER", NumpadEnter: "ENTER",
    Backspace: "BKSP", Tab: "TAB", CapsLock: "CAPS",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
    Semicolon: ";", Quote: "'", Backslash: "\\", Comma: ",",
    Period: ".", Slash: "/", Backquote: "`", Insert: "INS",
    Delete: "DEL", Home: "HOME", End: "END",
    PageUp: "PGUP", PageDown: "PGDN",
  };
  if (map[code]) return map[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "NUM " + code.slice(6);
  return code.toUpperCase();
}

// Wider keycaps for these labels (visual polish).
export function keyWidth(label) {
  if (label === "SPACE") return "wide2";
  if (["SHIFT", "R-SHIFT", "CTRL", "R-CTRL", "ENTER", "BKSP"].includes(label)) return "wide1";
  return "norm";
}
