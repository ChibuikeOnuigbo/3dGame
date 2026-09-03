import * as THREE from "three";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { World } from "./world.js";
import { AudioSys } from "./audio.js";
import { saveGame, loadGame, hasSave, saveSettings, loadSettings } from "./save.js";
import { $, show, setPrompt, setObj, setSub } from "./ui.js";
import { manager, preload, prototypes } from "./assets.js";
import { PropLibrary } from "./props.js";

const canvas = document.getElementById("c");
window.__hcReady = false;
window.__hcT0 = performance.now();
manager.onProgress = (url, loaded, total) => {
  const fill = document.getElementById("bootFill");
  const msg = document.getElementById("bootMsg");
  if (fill) fill.style.width = (total ? (100 * loaded / total) : 8) + "%";
  if (msg) msg.textContent = total ? `${loaded}/${total} files` : "Loading…";
};
$("btnPlay").disabled = true;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.15));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 180);
const input = new Input();
const audio = new AudioSys();
const player = new Player(camera, input, audio);
const world = new World(scene);
window.__hcWorld = world;
window.__hcWorldMs = performance.now() - window.__hcT0;
player.attachLights(scene);

player.collide = (x, y, z, r) => world.blocked(x, y, z, r);
player.collide.floor = (x, z) => Math.max(0, world.floorAt(x, z));

let mode = "menu"; // menu | play | pause | end
let last = performance.now();
let interactLock = 0;
let flashLock = 0;
let pauseLock = 0;
let obj = "Workshop fuse → generator → security card → Lab B → valves → archive code → sea-gate.";
setObj(obj);

const defaultSet = {
  fov: 75, sensH: 0.0038, sensV: 0.0038, invertY: false, bob: 1, shake: 1, motion: 1,
  master: 0.7, music: 0.2, ambience: 0.45, effects: 0.7, ui: 0.5,
  quality: 1, brightness: 1, subSize: 15, uiScale: 1, difficulty: 1,
};
let settings = { ...defaultSet, ...(loadSettings() || {}) };
applySettings();

function applySettings() {
  player.applySettings(settings);
  audio.setVol("master", settings.master);
  audio.setVol("music", settings.music);
  audio.setVol("ambience", settings.ambience);
  audio.setVol("effects", settings.effects);
  audio.setVol("ui", settings.ui);
  renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality > 0.7 ? 1.2 : 1));
  document.documentElement.style.fontSize = 14 * settings.uiScale + "px";
  $("sub").style.fontSize = settings.subSize + "px";
  saveSettings(settings);
}

function bindSettingsUI() {
  const map = [
    ["sensH", "sensH"], ["sensV", "sensV"], ["fov", "fov"], ["bob", "bob"],
    ["shake", "shake"], ["motion", "motion"], ["master", "master"], ["ambience", "ambience"],
    ["effects", "effects"], ["brightness", "brightness"], ["quality", "quality"], ["uiScale", "uiScale"],
  ];
  for (const [id, k] of map) {
    const el = $(id);
    if (!el) continue;
    el.value = settings[k];
    el.oninput = () => { settings[k] = parseFloat(el.value); applySettings(); };
  }
  $("invertY").checked = settings.invertY;
  $("invertY").onchange = () => { settings.invertY = $("invertY").checked; applySettings(); };
}

function fillBinds() {
  const box = $("binds");
  box.innerHTML = "";
  const labels = input.labels();
  for (const k of Object.keys(labels)) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${labels[k]}</span>`;
    const b = document.createElement("button");
    b.className = "bind";
    b.textContent = input.pretty(input.binds[k]);
    b.onclick = () => {
      input.beginRebind(k);
      b.textContent = "Press a key…";
      const iv = setInterval(() => {
        if (!input.waiting) { b.textContent = input.pretty(input.binds[k]); clearInterval(iv); }
      }, 100);
    };
    row.appendChild(b);
    box.appendChild(row);
  }
}
input.onConflict = (action, occupied, code) => {
  if (confirm(`That key is already assigned to ${input.labels()[occupied]}. Replace?`)) {
    input.forceBind(action, code);
    fillBinds();
  } else input.cancelRebind();
};

window.hcStart = (cont) => start(!!cont);
window.hcResume = () => resume();
$("btnPlay").onclick = () => start(false);
$("btnContinue").onclick = () => start(true);
$("btnLoad").onclick = () => start(true);
$("btnSettings").onclick = () => { show("mainMenu", false); show("settings", true); };
$("btnControls").onclick = () => { show("mainMenu", false); show("controls", true); fillBinds(); };
$("btnAccess").onclick = () => { show("mainMenu", false); show("settings", true); };
$("btnCredits").onclick = () => { show("mainMenu", false); show("credits", true); };
$("btnQuit").onclick = () => { document.exitPointerLock(); mode = "menu"; };
$("backSet").onclick = $("backCtrl").onclick = $("backCred").onclick = () => {
  show("settings", false); show("controls", false); show("credits", false);
  if (mode === "pause") show("pause", true); else show("mainMenu", true);
};
$("resetBinds").onclick = () => { input.reset(); fillBinds(); };
$("resetSet").onclick = () => { settings = { ...defaultSet }; bindSettingsUI(); applySettings(); };

$("pResume").onclick = () => resume();
$("pSettings").onclick = () => { show("pause", false); show("settings", true); };
$("pControls").onclick = () => { show("pause", false); show("controls", true); fillBinds(); };
$("pMenu").onclick = () => {
  if (confirm("Return to main menu? Uncheckpointed progress may be lost.")) {
    document.exitPointerLock();
    mode = "menu";
    show("pause", false); show("hud", false); show("overlay", true); show("mainMenu", true);
  }
};

function refreshMenu() {
  $("btnContinue").disabled = !hasSave();
  $("btnLoad").disabled = !hasSave();
}
refreshMenu();
bindSettingsUI();

function start(cont) {
  audio.resume();
  audio.startAmbience("in");
  show("overlay", false); show("mainMenu", false); show("hud", true);
  mode = "play";
  input.captureLook = true;
  if (cont) {
    const s = loadGame();
    if (s) {
      player.pos.set(s.x, s.y, s.z);
      player.yaw = s.yaw; player.hp = s.hp; player.stamina = 1;
      Object.assign(world.flags, s.flags);
      obj = s.obj || obj; setObj(obj);
    }
  } else {
    player.pos.set(world.spawn.x, 0, world.spawn.z); player.yaw = 0; player.hp = 100;
  }
  canvas.requestPointerLock();
  checkpoint();
}

function resume() {
  show("pause", false); show("overlay", false); show("hud", true);
  mode = "play";
  input.captureLook = true;
  canvas.requestPointerLock();
}
function pause() {
  mode = "pause";
  input.captureLook = false;
  document.exitPointerLock();
  show("overlay", true); show("pause", true); show("mainMenu", false);
}

function checkpoint() {
  saveGame({
    x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw,
    hp: player.hp, flags: world.flags, obj,
  });
  refreshMenu();
}

canvas.addEventListener("click", () => { if (mode === "play") canvas.requestPointerLock(); });

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const dir = new THREE.Vector3();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pauseLock = Math.max(0, pauseLock - dt);
  if (mode === "play") {
    if (input.actionHeld("pause") && pauseLock <= 0) { pauseLock = 0.4; pause(); }
    if (input.actionHeld("flashlight") && flashLock <= 0) { player.toggleFlash(); flashLock = 0.3; audio.ui(); }
    flashLock = Math.max(0, flashLock - dt);
    player.update(dt, false);
    world.update(dt, player, audio);
    camera.getWorldDirection(dir);
    const it = world.nearestInteract(player.cam.position, dir);
    if (it) {
      setPrompt("E — " + it.label);
      if (input.actionHeld("interact") && interactLock <= 0) {
        interactLock = 0.35;
        audio.interact();
        const r = it.fn();
        if (r.text) { setSub(r.text); setTimeout(() => setSub(""), 5200); }
        if (r.event === "fuse") { obj = "Install the fuse and start the generator."; setObj(obj); checkpoint(); }
        if (r.event === "power") { obj = "Take the Lab B card from security."; setObj(obj); checkpoint(); }
        if (r.event === "card") { obj = "Use the card reader in Lab B."; setObj(obj); checkpoint(); }
        if (r.event === "lab") { obj = "Survive maintenance. Align three valves."; setObj(obj); checkpoint(); }
        if (r.event === "valves") { obj = "Get keypad code from archives, then sea-gate in the yard."; setObj(obj); checkpoint(); }
        if (r.event === "code") { obj = "Code 4-7-2-1. Cross the yard to the sea-gate."; setObj(obj); checkpoint(); }
        if (r.event === "end") {
          mode = "end";
          document.exitPointerLock();
          show("overlay", true); show("end", true); show("hud", false);
        }
        if (world.flags.seaGate && r.text && r.text.includes("Alignment 3/3")) {
          obj = "Sea-gate unlocked. Cross the yard. Avoid sentinels.";
          setObj(obj); checkpoint();
        }
      }
    } else setPrompt("");
    interactLock = Math.max(0, interactLock - dt);
    $("stam").style.width = player.stamina * 100 + "%";
    const sr = $("styleRank");
    if (sr) sr.textContent = player.styleRank;
    $("dmg").style.background = `rgba(90,10,8,${player.hp < 100 ? (100 - player.hp) / 280 : 0})`;
    if (player.hp <= 0) {
      player.hp = 100;
      const s = loadGame();
      if (s) { player.pos.set(s.x, s.y, s.z); player.yaw = s.yaw; }
      else player.pos.copy(world.spawn);
      setSub("You black out. The station puts you back.");
      setTimeout(() => setSub(""), 3000);
    }
    if (player.pos.y < -5) { player.pos.copy(world.spawn); player.vel.set(0, 0, 0); }
  } else {
    input.consumeLook();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function assetsDone() {
  if (window.__hcReady) return;
  window.__hcReady = true;
  window.__hcLoadMs = performance.now() - window.__hcT0;
  document.getElementById("boot")?.classList.add("hidden");
  $("btnPlay").disabled = false;
}
manager.onLoad = () => assetsDone();
preload().then(() => {
  player.attachViewmodels(prototypes);
  if (prototypes.door) world.applyDoorMeshes(prototypes.door);
  if (prototypes.warehouse) world.placeWarehouse(prototypes.warehouse);
}).catch((e) => console.warn(e));

// GLB prop library — loaded after the world is built so the world is never
// blocked on model fetch. Placements resolve against data/props.json.
fetch("./data/props.json")
  .then((r) => r.json())
  .catch(() => ({}))
  .then((registry) => {
    window.__hcPropLib = new PropLibrary(scene, world.solids, registry);
    return window.__hcPropLib.load(world.usedPropIds(), (done, total, id) => {
      const fill = document.getElementById("bootFill");
      const msg = document.getElementById("bootMsg");
      if (fill) fill.style.width = (total ? (60 + 40 * done / total) : 68) + "%";
      if (msg && id) msg.textContent = `Props ${done}/${total}…`;
    });
  })
  .then((stats) => {
    world.placeProps(window.__hcPropLib);
    window.__hcProps = { loaded: stats.loaded, failed: stats.failed, placed: { ...stats.placed } };
  })
  .catch((e) => console.warn("prop load fail", e));
setTimeout(assetsDone, 2500);

window.hcQA = {
  start() { start(false); },
  pose(x, y, z, yaw = 0, pitch = 0) {
    player.pos.set(x, y, z);
    player.yaw = yaw;
    player.pitch = pitch;
    player.flash = true;
    player.update(0.016, false);
  },
  noclip(on) { player.debug.noclip = !!on; if (on) player.debug.collide = false; },
  collide(on) { player.debug.collide = !!on; if (on) player.debug.noclip = false; },
  gravity(on) { player.debug.gravity = !!on; },
  enemies(on) { world.enemiesOn = !!on; },
  force(n) { player.debug.force = Math.max(0.1, Number(n) || 1); },
  unrestricted(on) {
    const v = on !== false;
    player.debug.noclip = v;
    player.debug.collide = !v;
    player.debug.gravity = !v;
    world.enemiesOn = !v;
  },
  openDoors() {
    for (const d of world.doors) { d.open = true; d.target = d.side * Math.PI * 0.92; d.angle = d.target; d.pivot.rotation.y = d.angle; }
  },
  closeDoors() {
    for (const d of world.doors) { d.open = false; d.target = 0; d.angle = 0; d.pivot.rotation.y = 0; }
  },
  doors() {
    return world.doors.map((d, i) => ({ i, x: d.x, z: d.z, axis: d.axis, open: d.open, angle: d.angle }));
  },
  torchTune(x, y, z, rx, ry, rz, s) {
    Object.assign(player.torchTune, { x, y, z, rx, ry, rz, s });
    player._applyTorchTune();
    return { ...player.torchTune };
  },
  fly(dx, dy, dz) {
    player.debug.noclip = true; player.debug.collide = false; player.debug.gravity = false;
    player.pos.x += dx; player.pos.y += dy; player.pos.z += dz;
    player.update(0.016, false);
  },
  look(yaw, pitch) { player.yaw = yaw; player.pitch = pitch; player.update(0.016, false); },
  state() {
    return {
      pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      yaw: player.yaw, pitch: player.pitch,
      debug: { ...player.debug, enemies: world.enemiesOn },
    };
  },
  floorAt(x, z) { return world.floorAt(x, z); },
  blocked(x, y, z, r) { return world.blocked(x, y, z, r); },
  rooms() {
    return [
      { id: "reception", x: 0, y: 1.2, z: 8, yaw: 0 },
      { id: "security", x: 0, y: 1.2, z: -4, yaw: 0 },
      { id: "corridor", x: 0, y: 1.2, z: -16, yaw: 0 },
      { id: "offices", x: -10, y: 1.2, z: -16, yaw: Math.PI / 2 },
      { id: "archives", x: -10, y: 1.2, z: -5, yaw: 0 },
      { id: "storeB", x: -20, y: 1.2, z: -16, yaw: 0 },
      { id: "storage", x: 10, y: 1.2, z: -16, yaw: -Math.PI / 2 },
      { id: "easthall", x: 18.05, y: 1.2, z: -16, yaw: 0 },
      { id: "canteen", x: 25.1, y: 1.2, z: -16, yaw: 0 },
      { id: "bunks", x: 18.05, y: 1.2, z: -6, yaw: 0 },
      { id: "locker", x: 19.5, y: 1.2, z: -27, yaw: 0 },
      { id: "workshop", x: 10, y: 1.2, z: -26, yaw: 0 },
      { id: "southhall", x: 0, y: 1.2, z: -28, yaw: 0 },
      { id: "generator", x: -4, y: 1.2, z: -42, yaw: 0 },
      { id: "boiler", x: -21, y: 1.2, z: -42, yaw: 0 },
      { id: "lab", x: 12, y: 1.2, z: -42, yaw: 0 },
      { id: "maintenance", x: 12, y: 1.2, z: -54, yaw: 0 },
      { id: "valves", x: 12, y: 1.2, z: -64, yaw: 0 },
      { id: "tunnel", x: 12, y: 1.2, z: -74, yaw: 0 },
      { id: "yard", x: 6, y: 1.2, z: -92, yaw: 0 },
      { id: "shack", x: -8, y: 1.2, z: -98, yaw: 0 },
      { id: "seagate", x: 22, y: 1.2, z: -92, yaw: Math.PI / 2 },
    ];
  },
  props() {
    return {
      registry: Object.keys(window.__hcPropLib ? window.__hcPropLib.registry : {}).length,
      loaded: window.__hcProps ? window.__hcProps.loaded : 0,
      placed: window.__hcProps ? window.__hcProps.placed : {},
      failed: window.__hcProps ? window.__hcProps.failed : [],
    };
  },
  interactIds() {
    return world.interacts.map((it) => it.label);
  },
  interact(label) {
    const it = world.interacts.find((i) => i.label.toLowerCase().includes(label.toLowerCase()));
    if (!it) return { error: "not found", label };
    const r = it.fn();
    return { label: it.label, text: r.text, event: r.event, flags: { ...world.flags } };
  },
  flags() { return { ...world.flags }; },
};
