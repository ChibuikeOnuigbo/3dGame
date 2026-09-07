// Reusable keycap component. Renders any binding as a styled DOM keycap,
// including wide keys (SHIFT/CTRL/ENTER/SPACE). States: idle/hover/pressed/
// active/disabled via classes. No images, no WASD assumptions anywhere.

import { keyLabel, keyWidth } from "../core/settings.js";

export function keycapHTML(code) {
  const label = keyLabel(code);
  const w = keyWidth(label);
  return `<kbd class="keycap ${w}" data-code="${code}">${label}</kbd>`;
}

export function bindPromptHTML(code, text) {
  return `<span class="bp">${keycapHTML(code)}<span class="bp-text">${text}</span></span>`;
}

export function makeKeycap(code) {
  const el = document.createElement("kbd");
  el.className = "keycap";
  setKeycap(el, code);
  return el;
}

export function setKeycap(el, code) {
  const label = keyLabel(code);
  el.textContent = label;
  el.dataset.code = code;
  el.className = "keycap " + keyWidth(label);
}
