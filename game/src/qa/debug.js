// Debug overlay + QA API (window.swQA) for Playwright-driven testing.
// The API is deliberately deterministic: pose()/interact()/setFlag() let a
// test drive the entire critical path without pixel-perfect input synthesis.

export class QADebug {
  constructor(game) {
    this.game = game;
    this.visible = false;
    this.el = document.getElementById("debug");
    this.frames = 0;
    this.fps = 0;
    this._last = performance.now();
    this._install();
  }

  tick() {
    this.frames++;
    const now = performance.now();
    if (now - this._last > 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this._last));
      this.frames = 0;
      this._last = now;
    }
    if (!this.visible) return;
    const p = this.game.player;
    const room = this.game.world.roomAt(p.pos.x, p.pos.y, p.pos.z);
    const target = this.game.interact.target;
    this.el.innerHTML =
      `<b>STILL WATER dev</b> fps=${this.fps}<br>` +
      `pos ${p.pos.x.toFixed(2)}, ${p.pos.y.toFixed(2)}, ${p.pos.z.toFixed(2)} yaw=${(p.yaw * 57.3).toFixed(0)}<br>` +
      `room ${room ? room.id : "?"} · ground ${this.game.world.groundAt(p.pos.x, p.pos.z).y.toFixed(2)}<br>` +
      `objective ${this.game.state.currentObjective ? this.game.state.currentObjective.id : "—"}<br>` +
      `colliders ${this.game.world.colliders.length} · interact ${target ? target.id : "—"}<br>` +
      `water ${this.game.world.waterLevel.toFixed(2)} · doors ${[...this.game.world.doors.values()].map((d) => `${d.door.id}:${d.door.state}${d.door.locked ? "🔒" : ""}`).join(" ")}`;
  }

  toggle() {
    this.visible = !this.visible;
    this.el.classList.toggle("visible", this.visible);
  }

  _install() {
    const g = this.game;
    window.swQA = {
      version: () => "1.0",
      start: (lock = false) => g.startGame(lock),
      state: () => g.state.dump(),
      rooms: () => g.world.rooms.map((r) => ({ id: r.id, zone: r.zone })),
      roomAt: () => {
        const r = g.world.roomAt(g.player.pos.x, g.player.pos.y, g.player.pos.z);
        return r ? r.id : null;
      },
      pose: (x, y, z, yaw = 0, pitch = 0) => {
        // Ground the player: snap to the support surface unless the caller
        // deliberately asks for elevation (>0.6 above ground). Without this,
        // gravity drops a mid-air pose ~2m before the first frame renders,
        // silently ruining every staged screenshot (QA-found).
        const gr = g.world.groundNear(x, z, y);
        const fy = y - gr.y > 0.6 ? y : gr.y;
        g.player.pos.set(x, fy, z);
        g.player.yaw = yaw;
        g.player.pitch = pitch;
        g.player.vel.set(0, 0, 0);
        g.player.vy = 0;
        g.player.airborne = false;
      },
      groundAt: (x, z) => g.world.groundAt(x, z),
      groundNear: (x, z, refY) => g.world.groundNear(x, z, refY),
      noclip: (on) => { g.player.noclip = !!on; },
      interact: (id) => {
        const item = g.interact.items.get(id);
        if (!item) return { error: `no interactable ${id}` };
        if (item.enabled && !item.enabled()) return { blocked: true };
        if (item.hold) {
          item.interact && item.interact();
          item.onHoldProgress && item.onHoldProgress(0.999, 0.016);
          item.finishHold && item.finishHold();
          return { ok: true, held: true };
        }
        item.interact();
        return { ok: true };
      },
      interactables: () => [...g.interact.items.values()].map((i) => ({
        id: i.id, label: i.verb, hold: !!i.hold,
        enabled: i.enabled ? i.enabled() : true,
      })),
      doors: () => [...g.world.doors.values()].map((d) => ({
        id: d.door.id, state: d.door.state, locked: d.door.locked, t: +d.door.t.toFixed(2),
      })),
      openDoor: (id) => {
        const d = g.world.doors.get(id);
        if (!d) return { error: "no door" };
        if (d.door.locked) return { locked: true };
        d.door.open();
        return { ok: true };
      },
      setFlag: (name, value = true) => {
        g.state.setFlag(name, value);
        return g.state.dump().flags;
      },
      objective: () => (g.state.currentObjective ? g.state.currentObjective.id : null),
      fps: () => this.fps,
      colliders: () => g.world.colliders.map((c) => ({
        active: c.active,
        min: c.box.min.toArray().map((v) => +v.toFixed(2)),
        max: c.box.max.toArray().map((v) => +v.toFixed(2)),
      })),
      ending: () => g.state.flags.escaped,
      stats: () => ({
        triangles: g.renderer.info.render.triangles,
        calls: g.renderer.info.render.calls,
        textures: g.renderer.info.memory.textures,
        geometries: g.renderer.info.memory.geometries,
      }),
      ready: () => ({ loaded: g.ready, started: g.started, menuHidden: !!g.menuHidden }),
    };
  }
}
