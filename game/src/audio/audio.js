// Audio engine: procedural Web Audio synthesis + CC0 OGG footstep samples
// (Fantozzi's Footsteps by Fantozzi, OpenGameArt, CC0). No external audio network deps.
//
// Design: three buses (ambience / sfx / ui). Zone room-tones are synthesized
// loops whose gains crossfade by player position. One-shots are small synth
// functions. Footsteps pick samples/synths by surface.

export const SURFACES = {
  CONCRETE: "concrete",
  METAL: "metal",
  GRATING: "grating",
  WATER: "water",
};

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.zones = new Map(); // id -> {gain, nodes:[], start(fn)}
    this.zoneGains = new Map();
    this.stepBuffers = { concrete: [], grass: [] };
    this.foley = {}; // name -> AudioBuffer (CC0 OpenGameArt packs, see CREDITS.md)
    this.ready = false;
    this._noise = null;
    this._dripTimers = [];
    this._pumpNodes = [];
  }

  async init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);

    this.busAmb = ctx.createGain();
    this.busSfx = ctx.createGain();
    this.busUi = ctx.createGain();
    for (const b of [this.busAmb, this.busSfx, this.busUi]) b.connect(this.master);
    this.applyVolumes();
    await this._loadSteps();
    this._loadFoley(); // fire-and-forget: synth fallbacks cover until decoded
    this.ready = true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings.data;
    this.master.gain.value = s.masterVolume;
    this.busAmb.gain.value = s.ambienceVolume;
    this.busSfx.gain.value = s.sfxVolume;
    this.busUi.gain.value = s.sfxVolume * 0.8;
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  // ---------- resources ----------
  noiseBuffer(seconds = 2) {
    if (this._noise) return this._noise;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  async _loadSteps() {
    const sets = [
      { names: ["StoneL1", "StoneL2", "StoneL3", "StoneR1", "StoneR2", "StoneR3"], into: "concrete" },
      { names: ["SandL1", "SandL2", "SandL3", "SandR1", "SandR2", "SandR3"], into: "grass" },
    ];
    for (const { names, into } of sets) {
      for (const n of names) {
        try {
          const res = await fetch(`sfx/footsteps/Fantozzi-${n}.ogg`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          this.stepBuffers[into].push(await this.ctx.decodeAudioData(buf));
        } catch (e) {
          console.warn(`footstep ${n} failed to load (${e.message}); synth fallback active`);
        }
      }
    }
  }

  // CC0 urban gunshots (fps-asset-kit) — rare muffled distant shots in the
  // street zone; the city beyond the fence has a life of its own.
  async _loadGuns() {
    try {
      const res = await fetch("sfx/guns/game_gunshot.wav");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.gunBuffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn(`gunshot sample failed (${e.message}); distant shots disabled`);
    }
  }

  distantShot() {
    if (!this.ready || !this.gunBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.gunBuffer;
    src.playbackRate.value = 0.55 + Math.random() * 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260 + Math.random() * 140;
    const g = ctx.createGain();
    g.gain.value = 0.05 + Math.random() * 0.03;
    src.connect(lp); lp.connect(g); g.connect(this.busAmb);
    src.start();
  }

  // ---------- real foley samples (USER 2026-09-12: "more sfx assets") ----------
  // CC0 OpenGameArt packs (Iwan Gabovitch door set, rubberduck 100 CC0 SFX,
  // laleksic doors, leonmire squeaky door, antumdeluge tree creak,
  // lampeight panel scrape) + one MIT uisfx blip — acquired via the
  // python-sound-generator / uisfx GitHub repos (network-reachable route;
  // see CREDITS.md + research/download-manifest.json). Every consumer keeps
  // its original synth as a fallback, so a missing sample is never fatal.
  _loadFoley() {
    const files = {
      creakOpen: "sfx/doors/creak_open.wav",
      creakClose: "sfx/doors/creak_close.wav",
      softOpen: "sfx/doors/soft_open.wav",
      softClose: "sfx/doors/soft_close.wav",
      cantOpen: "sfx/doors/cant_open.wav",
      slam1: "sfx/doors/slam_1.wav",
      slam2: "sfx/doors/slam_2.wav",
      iwan1: "sfx/doors/iwan_01.wav",
      iwan4: "sfx/doors/iwan_04.wav",
      iwan7: "sfx/doors/iwan_07.wav",
      rdOpen: "sfx/doors/rd_open.wav",
      gateSqueal: "sfx/doors/gate_squeal.wav",
      keyClick: "sfx/debris/key_click.wav",
      woodHit1: "sfx/debris/wood_hit_1.wav",
      woodHit2: "sfx/debris/wood_hit_2.wav",
      woodCreak: "sfx/debris/wood_creak.wav",
      panelScrape: "sfx/debris/panel_scrape.wav",
      holoOn: "sfx/holo/holo-on.ogg",
    };
    for (const [name, url] of Object.entries(files)) {
      fetch(url)
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.arrayBuffer(); })
        .then((ab) => this.ctx.decodeAudioData(ab))
        .then((buf) => { this.foley[name] = buf; })
        .catch((e) => console.warn(`foley ${name} failed to load (${e.message}); synth fallback stays active`));
    }
  }

  // One-shot sample playback. Returns the source node (or null): callers may
  // stop/re-pitch it. All doors/gates in Still Water are heavy — a mild
  // random pitch spread keeps repeats organic.
  _sample(name, { gain = 1, rate = 1, bus = null } = {}) {
    if (!this.ready || !this.foley[name]) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.foley[name];
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus || this.busSfx);
    src.start();
    return src;
  }

  // ---------- zone ambience ----------
  // Each zone builder returns node array; we keep a master gain per zone.
  ensureZone(id, builder) {
    if (this.zones.has(id)) return this.zones.get(id);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.busAmb);
    const nodes = builder(gain);
    const zone = { gain, nodes };
    this.zones.set(id, zone);
    return zone;
  }

  _loopNoise(gain, { type = "lowpass", freq = 400, q = 0.5, level = 0.3, playbackRate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    src.playbackRate.value = playbackRate;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(filt).connect(g).connect(gain);
    src.start();
    return { src, filt, g };
  }

  _hum(gain, base = 50, level = 0.16) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = base;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = base * 2.02;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 190;
    const g = ctx.createGain();
    g.gain.value = level;
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(gain);
    o1.start();
    o2.start();
    return { o1, o2, f, g };
  }

  buildDefaultZones() {
    // street: night air, distant traffic rumble
    this.ensureZone("street", (g) => [
      this._loopNoise(g, { freq: 220, level: 0.10, playbackRate: 0.6 }),
      this._loopNoise(g, { type: "bandpass", freq: 65, q: 0.7, level: 0.16, playbackRate: 0.4 }),
    ]);
    // stair: hollow shaft resonance
    this.ensureZone("stair", (g) => [
      this._loopNoise(g, { freq: 130, level: 0.06, playbackRate: 0.5 }),
      this._hum(g, 60, 0.02),
    ]);
    // atrium: still air, faint fluorescent buzz
    this.ensureZone("atrium", (g) => {
      const buzz = this._hum(g, 100, 0.012);
      return [buzz, this._loopNoise(g, { freq: 90, level: 0.035, playbackRate: 0.35 })];
    });
    // corridor: ventilation run
    this.ensureZone("corridor", (g) => [
      this._loopNoise(g, { type: "bandpass", freq: 240, q: 0.4, level: 0.07, playbackRate: 0.8 }),
    ]);
    // pumphall: the deep running hum (the star)
    this.ensureZone("pumphall", (g) => {
      const h1 = this._hum(g, 48, 0.11);
      const h2 = this._hum(g, 96.5, 0.045);
      const air = this._loopNoise(g, { freq: 150, level: 0.045, playbackRate: 0.5 });
      return [h1, h2, air];
    });
    // gallery: drips + water lap (drips scheduled)
    this.ensureZone("gallery", (g) => [
      this._loopNoise(g, { type: "bandpass", freq: 500, q: 0.3, level: 0.03, playbackRate: 0.9 }),
      this._loopNoise(g, { freq: 110, level: 0.05, playbackRate: 0.4 }),
    ]);
    // sump: close air, slow drips, a radio static somewhere
    this.ensureZone("sump", (g) => {
      const air = this._loopNoise(g, { freq: 80, level: 0.05, playbackRate: 0.3 });
      const radio = this._loopNoise(g, { type: "highpass", freq: 1800, level: 0.006, playbackRate: 1.4 });
      return [air, radio];
    });
    // shaft: vertical hollow, wind from above
    this.ensureZone("shaft", (g) => [
      this._loopNoise(g, { type: "bandpass", freq: 320, q: 0.5, level: 0.06, playbackRate: 0.55 }),
    ]);
    this._scheduleDrips();
  }

  _scheduleDrips() {
    const tick = () => {
      if (!this.ctx || this.ctx.state === "closed") return;
      for (const zoneId of ["gallery", "sump"]) {
        const z = this.zones.get(zoneId);
        if (z && z.gain.gain.value > 0.05 && Math.random() < 0.65) {
          this.drip(zoneId === "gallery" ? 0.7 : 0.4);
        }
      }
      this._dripTimers.push(setTimeout(tick, 1400 + Math.random() * 2600));
    };
    tick();
  }

  // Called every frame with target gains per zone id.
  updateZones(targets, dt) {
    if (!this.ready) return;
    const k = Math.min(1, dt * 2.2);
    for (const [id, zone] of this.zones) {
      const target = targets[id] || 0;
      const cur = zone.gain.gain.value;
      zone.gain.gain.value = cur + (target - cur) * k;
    }
  }

  setPumpsRunning(on) {
    // pump hall hum fades to near-silence; keep faint air
    const z = this.zones.get("pumphall");
    if (!z) return;
    for (const n of z.nodes) {
      if (n.g && n.o1) n.g.gain.value = on ? n.g.gain.value : 0; // handled by mute below
    }
    this.pumpsRunning = on;
    if (!on) {
      for (const n of z.nodes) if (n.g && n.o1) n.g.gain.value = 0.0;
      this.spoolDown();
    } else {
      for (const n of z.nodes) if (n.g && n.o1) n.g.gain.value = 0.11;
    }
  }

  // ---------- one-shots ----------
  drip(intensity = 0.6) {
    if (!this.ready) return;
    const f = 900 + Math.random() * 700;
    this._tone(this.busAmb, { freq: f, type: "sine", attack: 0.002, decay: 0.09, peak: 0.05 * intensity, slideTo: f * 0.55 });
    setTimeout(() => this._noiseShot(this.busAmb, { freq: 2400, q: 1, decay: 0.05, peak: 0.02 * intensity }), 40);
  }

  _env(dest, { attack = 0.005, decay = 0.15, peak = 1 }) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  _noiseShot(dest, { freq = 800, q = 1, type = "bandpass", attack = 0.003, decay = 0.12, peak = 0.5, rate = 1 }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = rate;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this._env(dest, { attack, decay, peak }));
    const t = this.ctx.currentTime;
    src.start(t, Math.random() * 1.2);
    src.stop(t + attack + decay + 0.05);
  }

  _tone(dest, { freq = 440, type = "sine", attack = 0.004, decay = 0.2, peak = 0.2, slideTo = null }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + attack + decay);
    o.connect(this._env(dest, { attack, decay, peak }));
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  uiTick() { if (this.ready) this._tone(this.busUi, { freq: 2200, type: "square", decay: 0.03, peak: 0.03 }); }
  uiConfirm() {
    if (!this.ready) return;
    this._tone(this.busUi, { freq: 660, decay: 0.08, peak: 0.05 });
    this._tone(this.busUi, { freq: 990, decay: 0.12, peak: 0.04 });
  }
  uiBack() { if (this.ready) this._tone(this.busUi, { freq: 330, decay: 0.09, peak: 0.04 }); }

  paper() {
    if (!this.ready) return;
    this._noiseShot(this.busSfx, { freq: 4200, q: 0.6, decay: 0.22, peak: 0.10, rate: 1.6 });
    this._noiseShot(this.busSfx, { freq: 2600, q: 0.5, decay: 0.18, peak: 0.06, rate: 1.2 });
  }

  chime() { // objective feedback
    if (!this.ready) return;
    this._tone(this.busUi, { freq: 523.25, decay: 0.5, peak: 0.05 });
    this._tone(this.busUi, { freq: 784, decay: 0.7, peak: 0.04, attack: 0.05 });
  }

  doorCreak() {
    if (!this.ready) return;
    // CC0 foley first (laleksic creaks, iwan/rubberduck sets for variety);
    // a whisper of the old synth underneath keeps the metal-station character.
    const which = Math.random();
    const s = which < 0.4
      ? this._sample("creakOpen", { gain: 0.5 })
      : which < 0.7
        ? this._sample("iwan1", { gain: 0.42 })
        : which < 0.85
          ? this._sample("iwan4", { gain: 0.42 })
          : this._sample("rdOpen", { gain: 0.5 });
    if (s) {
      this._noiseShot(this.busSfx, { freq: 900, q: 3, decay: 0.3, peak: 0.012, rate: 0.7 });
      return;
    }
    const f = 300 + Math.random() * 200;
    this._tone(this.busSfx, { freq: f, type: "sawtooth", slideTo: f * 1.6, attack: 0.08, decay: 0.55, peak: 0.028 });
    this._noiseShot(this.busSfx, { freq: 900, q: 3, decay: 0.4, peak: 0.02, rate: 0.7 });
  }

  doorThunk() {
    if (!this.ready) return;
    this._sample("softClose", { gain: 0.55, rate: 0.9 });
    this._tone(this.busSfx, { freq: 90, slideTo: 45, decay: 0.22, peak: 0.28 });
    this._noiseShot(this.busSfx, { freq: 300, q: 1.5, decay: 0.09, peak: 0.12 });
  }

  doorSlam() { // kiosk commitment beat
    if (!this.ready) return;
    this._sample("slam1", { gain: 0.8 });
    this.doorThunk();
    setTimeout(() => this.doorThunk(), 70);
    this._noiseShot(this.busSfx, { freq: 140, q: 0.8, decay: 0.5, peak: 0.3, rate: 0.6 });
  }

  lockedRattle() {
    if (!this.ready) return;
    this._sample("cantOpen", { gain: 0.7 });
    for (let i = 0; i < 3; i++) setTimeout(() =>
      this._noiseShot(this.busSfx, { freq: 1800, q: 2, decay: 0.05, peak: 0.08 }), i * 90);
  }

  breakerClack() {
    if (!this.ready) return;
    this._sample("keyClick", { gain: 0.5, rate: 0.85 });
    this._noiseShot(this.busSfx, { freq: 2400, q: 1.2, decay: 0.04, peak: 0.3 });
    this._tone(this.busSfx, { freq: 70, slideTo: 40, decay: 0.3, peak: 0.4 });
    setTimeout(() => this._tone(this.busSfx, { freq: 120, decay: 0.12, peak: 0.12 }), 120); // relay
  }

  // winch crank start: heavy wood/panel strain under the existing ratchet ticks
  winchCreak() {
    if (!this.ready) return;
    this._sample("woodCreak", { gain: 0.4, rate: 0.8 });
    this._sample("panelScrape", { gain: 0.3, rate: 1.1 });
  }

  // hologram sign power-on blip (street sign projector cycling up)
  holoBoot() {
    if (!this.ready) return;
    this._sample("holoOn", { gain: 0.16, rate: 0.9, bus: this.busAmb });
  }

  valveTick() { this._noiseShot(this.busSfx, { freq: 1600 + Math.random() * 500, q: 3, decay: 0.035, peak: 0.10 }); }

  waterRush(dur = 4) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(700, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + dur);
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.busSfx);
    src.start();
    src.stop(ctx.currentTime + dur + 0.1);
  }

  splash(intensity = 1) {
    if (!this.ready) return;
    this._noiseShot(this.busSfx, { freq: 900, q: 0.5, decay: 0.16, peak: 0.12 * intensity, rate: 1.3 });
    this._noiseShot(this.busSfx, { freq: 2600, q: 0.4, decay: 0.09, peak: 0.05 * intensity, rate: 1.8 });
  }

  step(surface) {
    if (!this.ready) return;
    if (surface === SURFACES.CONCRETE && this.stepBuffers.concrete.length) {
      const buf = this.stepBuffers.concrete[Math.floor(Math.random() * this.stepBuffers.concrete.length)];
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = 0.5 + Math.random() * 0.2;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 3400;
      src.connect(f).connect(g).connect(this.busSfx);
      src.start();
      return;
    }
    if (surface === SURFACES.GRASS && this.stepBuffers.grass.length) {
      const buf = this.stepBuffers.grass[Math.floor(Math.random() * this.stepBuffers.grass.length)];
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = 0.4 + Math.random() * 0.15;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2200; // softer, duller — soil/grass
      src.connect(f).connect(g).connect(this.busSfx);
      src.start();
      return;
    }
    if (surface === SURFACES.WATER) { this.splash(0.5); return; }
    if (surface === SURFACES.METAL) {
      this._tone(this.busSfx, { freq: 220 + Math.random() * 80, type: "triangle", decay: 0.09, peak: 0.10 });
      this._noiseShot(this.busSfx, { freq: 700, q: 2, decay: 0.06, peak: 0.07 });
      return;
    }
    if (surface === SURFACES.GRATING) {
      this._noiseShot(this.busSfx, { freq: 1300, q: 1.4, decay: 0.08, peak: 0.09, rate: 1.1 });
      this._tone(this.busSfx, { freq: 310, type: "triangle", decay: 0.07, peak: 0.06 });
      return;
    }
    // fallback synth concrete
    this._noiseShot(this.busSfx, { freq: 420, q: 0.9, decay: 0.07, peak: 0.12, rate: 0.9 });
  }

  // QA 2026-09-07 (user request): jump / landing / running SFX. Synthesized
  // here because OpenGameArt is network-blocked in this sandbox; the existing
  // CC0 FLAC footsteps still cover walking surfaces.
  jump() {
    if (!this.ready) return;
    this._noiseShot(this.busSfx, { freq: 520, q: 0.8, decay: 0.14, peak: 0.07, rate: 1.6 });
    this._tone(this.busSfx, { freq: 170, slideTo: 320, decay: 0.12, peak: 0.05 });
  }

  land(intensity = 1) {
    if (!this.ready) return;
    this._tone(this.busSfx, { freq: 72, slideTo: 38, attack: 0.005, decay: 0.16, peak: 0.16 * intensity });
    this._noiseShot(this.busSfx, { freq: 300, q: 0.8, decay: 0.09, peak: 0.1 * intensity, rate: 0.7 });
  }

  exert() { // quiet sprint breath
    if (!this.ready) return;
    this._noiseShot(this.busSfx, { freq: 900 + Math.random() * 300, q: 1.2, decay: 0.18, peak: 0.035, rate: 0.8 });
  }

  // FMOD-style parameter-driven exertion stack (user 2026-09-08): continuous
  // wind + breath layers + heartbeat pulses whose gains follow ONE exertion
  // parameter (0..1) fed by sustained sprinting. Synth layers are the
  // generated-asset fallback; acquired OGA/CC0 samples (if the acquisition
  // loop stages them) can replace the noise beds later.
  ensureExertion() {
    if (this._ex || !this.ctx) return this._ex;
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(this.busSfx);
    const windSrc = ctx.createBufferSource(); windSrc.buffer = this.noiseBuffer(2); windSrc.loop = true;
    const windF = ctx.createBiquadFilter(); windF.type = "bandpass"; windF.frequency.value = 480; windF.Q.value = 0.5;
    const windG = ctx.createGain(); windG.gain.value = 0;
    windSrc.connect(windF); windF.connect(windG); windG.connect(bus); windSrc.start();
    const brSrc = ctx.createBufferSource(); brSrc.buffer = this.noiseBuffer(2); brSrc.loop = true;
    const brF = ctx.createBiquadFilter(); brF.type = "bandpass"; brF.frequency.value = 950; brF.Q.value = 1.4;
    const brG = ctx.createGain(); brG.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.26; // breath cycle ~4s
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.0; // modulated below
    lfo.connect(lfoG); lfoG.connect(brG.gain); lfo.start();
    brSrc.connect(brF); brF.connect(brG); brG.connect(bus); brSrc.start();
    this._ex = { ctx, windG, brG, lfoG, phase: 0 };
    return this._ex;
  }

  setExertion(v, dt) {
    if (!this.ready) return;
    const ex = this.ensureExertion();
    if (!ex) return;
    const t = ex.ctx.currentTime;
    ex.windG.gain.setTargetAtTime(0.055 * v, t, 0.5);      // running wind rush
    ex.brG.gain.setTargetAtTime(0.028 * v, t, 0.7);        // breath bed
    ex.lfoG.gain.setTargetAtTime(0.02 * v, t, 0.7);        // breath swell depth
    ex.phase += dt * (0.8 + 1.4 * v);
    if (v > 0.55 && ex.phase >= 1) {                       // pulse layer at high exertion
      ex.phase = 0;
      this._tone(this.busSfx, { freq: 58, type: "sine", decay: 0.16, peak: 0.09 * v });
      setTimeout(() => this._tone(this.busSfx, { freq: 50, type: "sine", decay: 0.13, peak: 0.06 * v }), 190);
    }
  }

  spoolDown() { // pumps dying after master breaker
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(12, t + 3.2);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(f).connect(g).connect(this.busSfx);
    o.start(t);
    o.stop(t + 3.5);
  }

  thud() { // the single scripted beat
    if (!this.ready) return;
    this._tone(this.busSfx, { freq: 55, slideTo: 30, attack: 0.01, decay: 0.8, peak: 0.5 });
    this._noiseShot(this.busSfx, { freq: 180, q: 0.7, decay: 0.4, peak: 0.2, rate: 0.5 });
  }

  crankTick() { this._noiseShot(this.busSfx, { freq: 1100 + Math.random() * 300, q: 4, decay: 0.03, peak: 0.09 }); }

  gateGrind(dur = 3.5) {
    if (!this.ready) return;
    const ctx = this.ctx;
    // CC0 leonmire squeaky-door squeal rides on top of the synth grind
    this._sample("gateSqueal", { gain: 0.32, rate: 0.72 });
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;
    src.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 420;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.busSfx);
    src.start();
    src.stop(ctx.currentTime + dur + 0.1);
    this._tone(this.busSfx, { freq: 60, decay: dur, peak: 0.08, attack: 0.2 });
  }

  endSting() {
    if (!this.ready) return;
    const seq = [261.6, 311.1, 392.0, 523.3];
    seq.forEach((f, i) => setTimeout(() =>
      this._tone(this.busUi, { freq: f, decay: 1.4, peak: 0.045, attack: 0.03 }), i * 420));
  }
}
