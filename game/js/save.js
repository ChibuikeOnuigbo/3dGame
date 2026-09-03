export function saveGame(data) {
  localStorage.setItem("hc_save", JSON.stringify({ v: 1, t: Date.now(), ...data }));
}
export function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem("hc_save") || "null");
    return s && s.v === 1 ? s : null;
  } catch (e) { return null; }
}
export function hasSave() { return !!loadGame(); }
export function saveSettings(s) { localStorage.setItem("hc_set", JSON.stringify(s)); }
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem("hc_set") || "null"); } catch (e) { return null; }
}
