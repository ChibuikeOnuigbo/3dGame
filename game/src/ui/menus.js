// Menus: pause + settings (audio/graphics) + controls with live rebinding,
// conflict detection, reset defaults. All keycaps are dynamic components.

import { keycapHTML } from "./keycap.js";
import { ACTION_LABELS, DEFAULT_BINDINGS, keyLabel } from "../core/settings.js";

export class Menus {
  constructor(settings, input, audio, hooks) {
    this.settings = settings;
    this.input = input;
    this.audio = audio;
    this.hooks = hooks; // {onResume, onRestart, applyGameSettings}
    this.el = document.getElementById("menus");
    this.open = false;
    this.panel = null;
    this.listening = null; // action being rebound
    this._build();
  }

  _build() {
    this.el.innerHTML = `
      <div class="menu-card">
        <div class="menu-head">
          <div class="menu-title">STILL WATER</div>
          <div class="menu-sub">stormwater lift station 6</div>
        </div>
        <div class="menu-body" id="menu-body"></div>
        <div class="menu-foot">Original student-style build · three.js · CC0 assets</div>
      </div>`;
    this.body = this.el.querySelector("#menu-body");
  }

  show(panel = "pause") {
    this.open = true;
    this.el.classList.add("visible");
    this.panel = panel;
    this.render();
  }

  hide() {
    this.open = false;
    this.el.classList.remove("visible");
    this.listening = null;
  }

  toggle() {
    if (this.open) this.hide(), this.hooks.onResume();
    else this.show("pause");
  }

  render() {
    if (this.panel === "pause") this._renderPause();
    else if (this.panel === "settings") this._renderSettings();
    else if (this.panel === "controls") this._renderControls();
  }

  _btn(label, id, primary = false) {
    return `<button class="mbtn ${primary ? "primary" : ""}" data-act="${id}">${label}</button>`;
  }

  _renderPause() {
    this.body.innerHTML = `
      ${this._btn("Resume", "resume", true)}
      ${this._btn("Settings", "settings")}
      ${this._btn("Controls", "controls")}
      ${this._btn("Restart", "restart")}`;
    this._wire();
  }

  _renderSettings() {
    const s = this.settings.data;
    this.body.innerHTML = `
      <div class="mback" data-act="pause">← Back</div>
      <div class="sec">AUDIO</div>
      ${this._slider("Master", "masterVolume", s.masterVolume)}
      ${this._slider("Ambience", "ambienceVolume", s.ambienceVolume)}
      ${this._slider("Effects", "sfxVolume", s.sfxVolume)}
      <div class="sec">MOUSE & VIEW</div>
      ${this._slider("Sensitivity", "mouseSensitivity", s.mouseSensitivity, 0.2, 3)}
      ${this._slider("Field of view", "fov", s.fov, 55, 100, 1)}
      <div class="sec">VIDEO</div>
      ${this._slider("Brightness", "brightness", s.brightness, 0.5, 1.8)}
      ${this._select("Quality", "quality", ["low", "medium", "high"], s.quality)}
      ${this._btn("Toggle fullscreen", "fullscreen")}
      <div class="row">${this._btn("Reset all defaults", "resetall")}</div>`;
    this._wire();
  }

  _slider(label, key, val, min = 0, max = 1, step = 0.05) {
    return `<label class="mrow"><span class="mlabel">${label}</span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-set="${key}"/>
      <span class="mval" data-val="${key}">${(+val).toFixed(step === 1 ? 0 : 2)}</span></label>`;
  }

  _select(label, key, options, val) {
    return `<label class="mrow"><span class="mlabel">${label}</span>
      <select data-set="${key}">${options.map((o) => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
  }

  _renderControls() {
    const rows = Object.keys(ACTION_LABELS)
      .map((action) => {
        const code = this.settings.binding(action);
        const listening = this.listening === action;
        return `<div class="crow" data-action="${action}">
          <span class="clabel">${ACTION_LABELS[action]}</span>
          <button class="ckey ${listening ? "listening" : ""}" data-rebind="${action}">
            ${listening ? "PRESS A KEY…" : keycapHTML(code)}
          </button>
        </div>`;
      })
      .join("");
    this.body.innerHTML = `
      <div class="mback" data-act="pause">← Back</div>
      <div class="chint">Click a key to rebind. <kbd class="keycap norm">ESC</kbd> cancels. Duplicates are flagged.</div>
      <div class="clist">${rows}</div>
      <div class="row">${this._btn("Reset defaults", "resetbinds")}</div>`;
    this._wire();
    this.body.querySelectorAll("[data-rebind]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.rebind;
        this.listening = action;
        this.render();
        this.input.beginCapture((code) => this._applyBind(action, code));
      });
    });
  }

  _applyBind(action, code) {
    if (code === "Escape") {
      this.audio.uiBack();
      this.listening = null;
      this.render();
      return;
    }
    const conflict = this.settings.conflict(code, action);
    if (conflict) {
      // replace: give the new action the key, the old action falls back to its default or unbound
      const oldDefault = DEFAULT_BINDINGS[conflict];
      this.settings.rebind(conflict, this._freeFallback(conflict, oldDefault, code));
      this.audio.uiBack();
    } else {
      this.audio.uiConfirm();
    }
    this.settings.rebind(action, code);
    this.listening = null;
    this.render();
    if (this.hooks.onBindingsChanged) this.hooks.onBindingsChanged();
  }

  _freeFallback(action, wantedCode, takenCode) {
    // if the old default for the displaced action is free, use it; else keep unbound marker
    if (wantedCode !== takenCode && !this.settings.conflict(wantedCode, action)) return wantedCode;
    return "Unassigned_" + action;
  }

  _wire() {
    this.body.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        this.audio.uiTick();
        if (act === "resume") { this.hide(); this.hooks.onResume(); }
        else if (act === "restart") { this.hide(); this.hooks.onRestart(); }
        else { this.panel = act; this.render(); }
      })
    );
    this.body.querySelectorAll("[data-set]").forEach((inp) => {
      const handler = () => {
        const key = inp.dataset.set;
        const val = inp.type === "range" ? parseFloat(inp.value) : inp.value;
        this.settings.set(key, val);
        const valEl = this.body.querySelector(`[data-val="${key}"]`);
        if (valEl) valEl.textContent = valEl.step === undefined ? val : (+val).toFixed(0);
        this.audio.applyVolumes();
        if (this.hooks.applyGameSettings) this.hooks.applyGameSettings();
      };
      inp.addEventListener("input", handler);
      inp.addEventListener("change", handler);
    });
    const rl = this.body.querySelector('[data-act="resetall"]');
    if (rl) rl.addEventListener("click", () => { this.settings.resetAll(); this.render(); this.hooks.applyGameSettings(); });
    const rb = this.body.querySelector('[data-act="resetbinds"]');
    if (rb) rb.addEventListener("click", () => { this.settings.resetBindings(); this.render(); this.hooks.onBindingsChanged(); });
    const fs = this.body.querySelector('[data-act="fullscreen"]');
    if (fs) fs.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
  }
}
