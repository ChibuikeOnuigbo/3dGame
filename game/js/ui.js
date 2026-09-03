export function $(id) { return document.getElementById(id); }

export function show(id, on) {
  $(id).classList.toggle("hidden", !on);
}

export function setPrompt(t) { $("prompt").textContent = t || ""; }
export function setObj(t) { $("obj").textContent = t; }
export function setSub(t) {
  const el = $("sub");
  if (!t) { el.style.display = "none"; return; }
  el.style.display = "block"; el.textContent = t;
}
