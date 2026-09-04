// HUD: objective line, interaction prompt (dynamic keycaps), toasts,
// note reader overlay, screen fade, ending card. Minimal, consistent.

import { bindPromptHTML } from "./keycap.js";

export class HUD {
  constructor(state, audio) {
    this.state = state;
    this.audio = audio;
    this.root = document.getElementById("hud");
    this.objectiveEl = document.getElementById("objective");
    this.promptEl = document.getElementById("prompt");
    this.toastEl = document.getElementById("toast");
    this.noteEl = document.getElementById("note");
    this.noteTitle = document.getElementById("note-title");
    this.noteBody = document.getElementById("note-body");
    this.fadeEl = document.getElementById("fade");
    this.endEl = document.getElementById("ending");
    this.noteOpen = false;
    this._toastTimer = null;

    this.state.on("objective:new", (o) => {
      this.setObjective(o.text);
      this.toast(`OBJECTIVE — ${o.text}`);
      this.audio.chime();
    });
    this.state.on("objective:done", (o) => {
      this.toast(`DONE — ${o.text}`);
    });
    this.state.on("note:found", (n) => {
      this.toast(`NOTES ${n.count}/${n.total}`);
    });
  }

  setObjective(text) {
    this.objectiveEl.innerHTML = text
      ? `<span class="obj-label">OBJECTIVE</span><span class="obj-text">${text}</span>`
      : "";
  }

  promptChanged(current) {
    if (!current) {
      this.promptEl.classList.remove("visible");
      this.promptEl.innerHTML = "";
      return;
    }
    const key = this._interactKey();
    let html = "";
    if (current.hold) {
      html = `<div class="hold"><div class="hold-ring"><svg viewBox="0 0 36 36"><circle class="track" cx="18" cy="18" r="15.5"/><circle class="fill" cx="18" cy="18" r="15.5"/></svg><span class="hold-pct"></span></div>${bindPromptHTML(key, `${current.verb} — hold`)}</div>`;
    } else {
      html = bindPromptHTML(key, current.verb);
    }
    this.promptEl.innerHTML = html;
    this.promptEl.classList.add("visible");
  }

  _interactKey() {
    // read live binding so rebinding updates the prompt instantly
    return document._input ? document._input.settings.binding("INTERACT") : "KeyE";
  }

  setHoldProgress(p) {
    const fill = this.promptEl.querySelector(".hold .fill");
    const pct = this.promptEl.querySelector(".hold-pct");
    if (fill) {
      const C = 2 * Math.PI * 15.5;
      fill.style.strokeDasharray = `${C}`;
      fill.style.strokeDashoffset = `${C * (1 - p)}`;
    }
    if (pct) pct.textContent = `${Math.round(p * 100)}%`;
  }

  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("visible");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove("visible"), ms);
  }

  showNote(note, onClose) {
    this.noteTitle.textContent = note.title;
    this.noteBody.textContent = note.text;
    this.noteEl.classList.add("visible");
    this.noteOpen = true;
    this._noteClose = onClose;
    this.state.findNote(note.id);
    this.audio.paper();
  }

  closeNote() {
    if (!this.noteOpen) return false;
    this.noteEl.classList.remove("visible");
    this.noteOpen = false;
    this.audio.paper();
    if (this._noteClose) this._noteClose();
    return true;
  }

  fade(toBlack, seconds = 1) {
    this.fadeEl.style.transition = `opacity ${seconds}s ease`;
    this.fadeEl.style.opacity = toBlack ? 1 : 0;
  }

  showEnding(stats) {
    this.fade(false, 0.1);
    const el = this.endEl;
    el.querySelector(".end-title").textContent = "STILL WATER";
    el.querySelector(".end-lines").innerHTML = `
      <p class="end-main">Station 6 is dark. The feeder reads zero.<br>
      Somewhere under the plug line, the water is already rising.</p>
      <p class="end-stats">TIME ${stats.minutes} MIN &nbsp;·&nbsp; NOTES ${stats.notes}/${stats.total}</p>
      <p class="end-quote">"Do your job. Then go home while it's still dark."</p>`;
    el.classList.add("visible");
  }
}
