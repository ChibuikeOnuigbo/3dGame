// STILL WATER — main orchestrator.
// Flow: loading -> menu -> start -> play -> ending.
// All story beats are wired here as data-driven interactions (see interact/).

import * as THREE from "three";
import { GameState } from "./core/state.js";
import { Settings } from "./core/settings.js";
import { Input } from "./input/input.js";
import { AudioEngine } from "./audio/audio.js";
import { Materials } from "./world/materials.js";
import { World } from "./world/world.js";
import { Door } from "./world/doors.js";
import { Player } from "./player/player.js";
import { InteractSystem } from "./interact/interact.js";
import { HUD } from "./ui/hud.js";
import { Menus } from "./ui/menus.js";
import { QADebug } from "./qa/debug.js";
import { keycapHTML } from "./ui/keycap.js";
import objectivesData from "../data/objectives.json";
import notesData from "../data/notes.json";

class Game {
  constructor() {
    this.ready = false;
    this.started = false;
    this.menuHidden = false;
    this.settings = new Settings();
    this.state = new GameState(objectivesData);
    this.notes = new Map(notesData.notes.map((n) => [n.id, n]));

    const canvas = document.getElementById("game");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.settings.data.brightness;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070a10, 0.028);
    this.scene.background = new THREE.Color(0x05070a);

    this.camera = new THREE.PerspectiveCamera(this.settings.data.fov, innerWidth / innerHeight, 0.08, 90);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0x46536a, 0x1a1712, 0.55);
    this.scene.add(this.hemi);

    this.input = new Input(this.settings);
    document._input = this.input; // HUD reads live bindings

    this.audio = new AudioEngine(this.settings);
    this.hud = new HUD(this.state, this.audio);
    this.mats = new Materials();

    this._resize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    };
    addEventListener("resize", this._resize);

    this.qa = new QADebug(this);
    this._lastT = performance.now();
    this._loop = this._loop.bind(this);
    this._installGlobalHandlers(canvas);
  }

  _installGlobalHandlers(canvas) {
    // pointer lock loss (Esc) -> pause, unless a menu/note/ending already owns the screen
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement && this.started && !this.menus?.open && !this.state.flags.escaped) {
        if (this.hud.noteOpen) return;
        this.pause();
      }
    });
    canvas.addEventListener("click", () => {
      if (this.started && !this.menus?.open && !this.hud.noteOpen && !this.state.flags.escaped) {
        this._lockPointer();
        this.player.enabled = true;
        this.audio.resume();
      }
    });
    // main menu buttons
    document.getElementById("btn-start")?.addEventListener("click", () => this.startGame());
    document.getElementById("btn-settings")?.addEventListener("click", () => {
      this.audio.init().then(() => { this.audio.buildDefaultZones(); });
      this.menus.show("settings");
    });
    document.getElementById("btn-controls")?.addEventListener("click", () => {
      this.audio.init().then(() => { this.audio.buildDefaultZones(); });
      this.menus.show("controls");
    });
    // dynamic controls hint on main menu
    const hint = document.getElementById("menu-controls-hint");
    if (hint) {
      const b = this.settings.bindings;
      hint.innerHTML =
        `${keycapHTML(b.MOVE_FORWARD)}${keycapHTML(b.MOVE_LEFT)}${keycapHTML(b.MOVE_BACKWARD)}${keycapHTML(b.MOVE_RIGHT)} move · ` +
        `${keycapHTML(b.INTERACT)} interact · ${keycapHTML(b.SPRINT)} sprint · ${keycapHTML(b.FLASHLIGHT)} lamp`;
    }
  }

  async load() {
    const bar = document.querySelector("#loading .bar-fill");
    const label = document.querySelector("#loading .load-label");
    let done = 0;
    const total = 30;
    try {
      await this.mats.loadAll(() => {
        done++;
        if (bar) bar.style.width = `${Math.min(100, (done / total) * 100)}%`;
      });
    } catch (e) {
      this._fatal(`Failed to load materials: ${e.message}`);
      throw e;
    }
    if (label) label.textContent = "building station";
    await new Promise((r) => setTimeout(r, 30));
    this.world = new World(this.scene, this.mats, this.state, this.audio);
    this.player = new Player(this.camera, this.input, this.settings, this.world, this.audio);
    this.interact = new InteractSystem(this.player, this.input, this.state, this.audio);
    this.interact.ui = this.hud;
    this._wireInteractions();
    this._registerBlockers();
    this.menus = new Menus(this.settings, this.input, this.audio, {
      onResume: () => {
        if (this.started && !this.state.flags.escaped) this.resume();
        else this.menus.hide();
      },
      onRestart: () => this.restart(),
      applyGameSettings: () => this.applySettings(),
      onBindingsChanged: () => this.hud.promptChanged(this.interact.target),
    });
    this.applySettings();
    this.ready = true;
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("menu").classList.add("ready");
    requestAnimationFrame(this._loop);
  }

  _fatal(msg) {
    const el = document.getElementById("boot-error");
    el.textContent = msg;
    el.classList.add("visible");
  }

  _registerBlockers() {
    // large wall meshes block interaction LOS (list kept small for ray cost)
    const blockers = [];
    this.scene.traverse((o) => {
      if (o.isMesh && o.geometry?.type === "BoxGeometry") {
        const p = o.geometry.parameters;
        if (Math.max(p.width, p.height, p.depth) > 1.4) blockers.push(o);
      }
    });
    this.interact.blockers = blockers;
  }

  applySettings() {
    const s = this.settings.data;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure = s.brightness;
    this.audio.applyVolumes();
    const q = s.quality;
    this.renderer.shadowMap.enabled = q !== "low";
    this.renderer.setPixelRatio(q === "high" ? Math.min(devicePixelRatio, 2) : q === "medium" ? Math.min(devicePixelRatio, 1.5) : 1);
  }

  _lockPointer() {
    try {
      const p = document.body.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* user gesture required — QA/headless safe */ }
  }

  async startGame(lockPointer = true) {
    if (!this.ready) return;
    if (!this.started) {
      this.started = true;
      this.state.startClock();
      await this.audio.init();
      this.audio.buildDefaultZones();
    }
    this.audio.resume();
    document.getElementById("menu").classList.remove("ready");
    document.getElementById("menu").classList.add("hidden");
    this.menuHidden = true;
    if (lockPointer) this._lockPointer();
    this.player.enabled = true;
    this.hud.setObjective(this.state.currentObjective.text);
    this.hud.fade(false, 1.2);
    setTimeout(() => this.hud.toast("Work order 44-1130 — find the station logbook", 4200), 1600);
  }

  pause() {
    this.player.enabled = false;
    this.menus.show("pause");
  }

  resume() {
    this.menus.hide();
    if (this.started && !this.state.flags.escaped) {
      this._lockPointer();
      this.player.enabled = true;
      this.audio.resume();
    }
  }

  restart() {
    location.reload();
  }

  _addDoor(id, position, yaw, openSign) {
    const d = new Door({ id, materials: this.mats, position, yaw, width: 1.06, openSign });
    this.world.addDoor(d);
    d.onOpenSound = () => this.audio.doorCreak();
    d.onEndSound = () => this.audio.doorThunk();
    d.onCloseSound = () => this.audio.doorCreak();
    d.onLockedSound = () => this.audio.lockedRattle();
    this.interact.add({
      id,
      position: new THREE.Vector3(position[0], position[1] + 1.1, position[2]),
      verb: "Open door",
      radius: 2.1,
      interact: () => {
        const r = d.interact(this.player.pos);
        if (r.locked) this.hud.toast(r.message, 2400);
      },
    });
    return d;
  }

  _wireInteractions() {
    const w = this.world;
    const st = this.state;
    const hud = this.hud;
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const readNote = (id, after) => hud.showNote(this.notes.get(id), after);

    // --- kiosk ---
    const streetDoor = w.doors.get("door_street").door;
    this.interact.add({
      id: "door_street",
      position: V3(0, 4.2, -14.85),
      verb: "Open door",
      radius: 2.2,
      enabled: () => !st.flags.kiosk_locked,
      interact: () => streetDoor.open(),
    });
    this.interact.add({
      id: "note_dispatch",
      position: V3(1.45, 4.35, -13.0),
      verb: "Read work order",
      radius: 1.9,
      interact: () => readNote("note_dispatch"),
    });
    st.on("flag:kiosk_locked", () => {
      streetDoor.locked = true;
      streetDoor.lockedMessage = "Locked — the bolt threw itself";
      streetDoor.state = "closing";
      streetDoor.t = Math.max(streetDoor.t, 0.7);
      this.audio.doorSlam();
      hud.toast("The street door locked behind you.", 3200);
    });

    // --- doors ---
    // hinge positions sit at the jamb edge of each doorway gap:
    // d1 gap x[-.55,.55] opens -x -> hinge east edge; d2 gap x[-.55,.55] with
    // yaw-pi opens +x in world -> hinge west edge; d3 gap z[17.15,18.25] with
    // yaw+pi/2 opens -z in world -> hinge north edge
    this._addDoor("door_d1", [0.545, 0, 0.35], 0, -1);
    this._addDoor("door_d2", [-0.545, 0, 12.35], Math.PI, -1);
    this._addDoor("door_d3", [7.15, 0, 18.205], Math.PI / 2, 1);

    // --- atrium: logbook (O1) ---
    this.interact.add({
      id: "logbook",
      position: V3(-2.55, 0.82, -3.0),
      verb: "Read logbook",
      radius: 2.0,
      interact: () =>
        readNote("note_logbook", () => {
          if (!st.flags.logbook_read) {
            st.setFlag("logbook_read");
            st.completeObjectiveByFlag("logbook_read");
          }
        }),
    });

    // --- breaker nook (O2) ---
    this.interact.add({
      id: "breaker_lights",
      position: V3(-3.2, 1.5, 9.4),
      verb: "Reset lighting breaker",
      radius: 2.0,
      enabled: () => !st.flags.lights_on,
      interact: () => {
        st.setFlag("lights_on");
        w.restoreLighting();
        w.breakerBox.userData.levers?.forEach((l, i) => setTimeout(() => (l.rotation.x = -0.5), i * 120));
        st.completeObjectiveByFlag("lights_on");
      },
    });
    this.interact.add({
      id: "note_clipboard",
      position: V3(-2.9, 0.95, 8.9),
      verb: "Read clipboard",
      radius: 1.8,
      interact: () => readNote("note_clipboard"),
    });

    // --- pump hall (O3) ---
    this.interact.add({
      id: "control_panel",
      position: V3(-5.85, 1.25, 18.2),
      verb: "Read taped note",
      radius: 2.2,
      interact: () =>
        readNote("note_pump", () => {
          if (!st.flags.pumps_read) {
            st.setFlag("pumps_read");
            st.completeObjectiveByFlag("pumps_read");
            hud.toast("The valve gallery is through the east door", 3600);
          }
        }),
    });

    // --- gallery valves (O4) ---
    const valveState = { A: false, B: false };
    const tryDrain = () => {
      if (valveState.A && valveState.B && !st.flags.gallery_drained) {
        hud.toast("The gallery is draining…", 3000);
        this.audio.waterRush(5);
        setTimeout(() => {
          w.waterTarget = 0.02;
          st.setFlag("gallery_drained");
          st.completeObjectiveByFlag("gallery_drained");
          this.audio.gateGrind(3.2);
          w.sluice.locked = false;
          w.sluice.open();
        }, 2600);
      } else if (valveState.B && !valveState.A) {
        hud.toast("Nothing drains — the intake is still feeding.", 3200);
      }
    };
    this.interact.add({
      id: "valve_A",
      position: V3(12.0, 1.15, 15.0),
      verb: "Close intake A",
      hold: 2.6,
      enabled: () => !valveState.A,
      onHoldProgress: (p, dt) => {
        if (dt > 0 && p < 1 && Math.random() < 0.5) this.audio.valveTick();
        w.valveA.rotation.z -= dt * 2.4;
      },
      finishHold: () => {
        valveState.A = true;
        hud.toast("INTAKE A — CLOSED", 2400);
        this.audio.breakerClack();
        tryDrain();
      },
    });
    this.interact.add({
      id: "valve_B",
      position: V3(14.0, 1.15, 20.4),
      verb: "Open drain B",
      hold: 2.6,
      enabled: () => !valveState.B,
      onHoldProgress: (p, dt) => {
        if (dt > 0 && p < 1 && Math.random() < 0.5) this.audio.valveTick();
        w.valveB.rotation.z += dt * 2.4;
      },
      finishHold: () => {
        valveState.B = true;
        hud.toast("DRAIN B — OPEN", 2400);
        this.audio.breakerClack();
        tryDrain();
      },
    });

    // --- sump (O5, O6, O7) ---
    this.interact.add({
      id: "note_calendar",
      position: V3(19.0, -2.5, 22.35),
      verb: "Look at calendar",
      radius: 1.9,
      interact: () => readNote("note_calendar"),
    });
    this.interact.add({
      id: "note_last",
      position: V3(18.0, -2.55, 20.9),
      verb: "Read the last note",
      radius: 2.0,
      interact: () =>
        readNote("note_last", () => {
          if (!st.flags.nest_read) {
            st.setFlag("nest_read");
            st.completeObjectiveByFlag("nest_read");
            this._scare();
          }
        }),
    });
    this.interact.add({
      id: "master_breaker",
      position: V3(26.85, -2.6, 20.6),
      verb: "Pull master breaker",
      radius: 2.1,
      enabled: () => !st.flags.master_off && st.flags.nest_read,
      interact: () => {
        st.setFlag("master_off");
        w.killStation();
        if (w.masterBreaker.userData.handle) w.masterBreaker.userData.handle.rotation.x = -0.9;
        if (w.masterBreaker.userData.lamp) w.masterBreaker.userData.lamp.material = this.mats.get("glowGreen");
        st.completeObjectiveByFlag("master_off");
        hud.toast("Station isolated. Emergency lighting only.", 3600);
      },
    });
    this.interact.add({
      id: "winch",
      position: V3(23.4, -2.2, 22.2),
      verb: "Crank the winch",
      hold: 3.6,
      enabled: () => st.flags.master_off && !st.flags.gate_open,
      onHoldProgress: (p, dt) => {
        if (dt > 0 && p < 1 && Math.random() < 0.6) this.audio.crankTick();
        if (w.winch.userData.crank) w.winch.userData.crank.rotation.x += dt * 5;
        if (w.winch.userData.drum) w.winch.userData.drum.rotation.x += dt * 5;
      },
      finishHold: () => {
        st.setFlag("gate_open");
        this.audio.gateGrind(4);
        w.serviceGate.locked = false;
        w.serviceGate.open();
        hud.toast("The service gate is rising…", 3200);
        const dawn = (w.lightEntries || []).find((e) => e.circuit === "dawn");
        if (dawn) dawn.targetIntensity = 10;
      },
    });
  }

  _scare() {
    // single scripted beat: thud + string lights dip (restraint per design report)
    setTimeout(() => {
      this.audio.thud();
      const str = this.world.stringLights;
      if (!str) return;
      const restore = [];
      str.traverse((o) => {
        if (o.isMesh && o.material.emissive) {
          restore.push([o.material, o.material.emissiveIntensity]);
          o.material.emissiveIntensity *= 0.15;
        }
      });
      setTimeout(() => restore.forEach(([m, v]) => (m.emissiveIntensity = v)), 1100);
    }, 1800);
  }

  _checkTriggers() {
    const p = this.player.pos;
    if (!this.state.flags.kiosk_locked && p.z > -14.4 && p.z < -11.5 && p.y > 3) {
      this.state.setFlag("kiosk_locked");
    }
    const z = this.world.endingZone;
    if (!this.state.flags.escaped && z &&
        p.x > z.min.x && p.x < z.max.x && p.y > z.min.y && p.y < z.max.y && p.z > z.min.z && p.z < z.max.z) {
      this.hud.fade(true, 1.6);
      this.player.enabled = false;
      document.exitPointerLock();
      this.state.finish();
      this.audio.endSting();
      const minutes = ((performance.now() - this.state.startTime) / 60000).toFixed(1);
      setTimeout(() => {
        this.hud.showEnding({ minutes, notes: this.state.notesFound.size, total: this.state.notesTotal });
      }, 1900);
    }
  }

  _zoneAudio(dt) {
    const p = this.player.pos;
    const room = this.world.roomAt(p.x, p.y, p.z);
    const targets = {};
    if (room) {
      targets[room.zone] = 1;
      for (const r of this.world.rooms) {
        if (r.zone !== room.zone) {
          const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2;
          const d = Math.hypot(cx - p.x, cz - p.z);
          if (d < 14) targets[r.zone] = Math.max(targets[r.zone] || 0, 0.22 * (1 - d / 14));
        }
      }
    }
    this.audio.updateZones(targets, dt);
    let fogD = 0.032, fogC = 0x05070a;
    if (room?.zone === "street") { fogD = 0.012; fogC = 0x131a2a; }
    else if (room?.zone === "sump" || room?.zone === "shaft") { fogD = 0.05; fogC = 0x04050a; }
    else if (room?.zone === "pumphall") fogD = 0.026;
    if (this.state.flags.master_off) fogD *= 1.25;
    this.scene.fog.density += (fogD - this.scene.fog.density) * Math.min(1, dt * 1.5);
    this.scene.fog.color.lerp(new THREE.Color(fogC), Math.min(1, dt * 1.5));
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;

    if (!this.started) {
      const t = now / 1000;
      this.camera.position.set(Math.sin(t * 0.07) * 7.5, 5.8, -13 + Math.cos(t * 0.07) * 7.5);
      this.camera.lookAt(0, 4.5, -13);
      this.renderer.render(this.scene, this.camera);
      this.qa.tick();
      this.input.endFrame();
      return;
    }

    if (this.input.wasPressed("PAUSE")) {
      if (this.hud.noteOpen) this.hud.closeNote();
      else if (this.menus.open) this.resume();
      else if (this.player.enabled) this.pause();
    }
    if (this.hud.noteOpen && this.input.wasPressed("INTERACT")) {
      this.hud.closeNote();
      this.input.justPressed.clear();
    }
    if (this.input.wasPressed("DEBUG")) this.qa.toggle();

    if (this.player.enabled || this.player.noclip) {
      this.player.update(dt);
      this.world.update(dt, this.player.pos);
      this.interact.update(dt);
      this.hud.setHoldProgress(this.interact.holdProgress);
      this._checkTriggers();
      const room = this.world.roomAt(this.player.pos.x, this.player.pos.y, this.player.pos.z);
      if (room) this.state.visit(room.id);
    } else {
      this.world.update(dt * 0.4, null);
    }
    this._zoneAudio(dt);
    this.renderer.render(this.scene, this.camera);
    this.qa.tick();
    this.input.endFrame();
  }
}

const game = new Game();
window.game = game;
game.load().catch((e) => {
  console.error(e);
  const el = document.getElementById("boot-error");
  el.textContent = `Boot failure: ${e.message}`;
  el.classList.add("visible");
});
