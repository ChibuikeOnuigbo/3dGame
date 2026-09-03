export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buses = {};
    this.vols = { master: 0.7, music: 0.25, ambience: 0.45, effects: 0.7, dialogue: 0.8, ui: 0.5 };
    this.amb = null;
    this.rain = null;
  }
  ensure() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vols.master;
    this.master.connect(this.ctx.destination);
    for (const k of Object.keys(this.vols)) {
      if (k === "master") continue;
      const g = this.ctx.createGain();
      g.gain.value = this.vols[k];
      g.connect(this.master);
      this.buses[k] = g;
    }
  }
  setVol(bus, v) {
    this.vols[bus] = v;
    if (bus === "master" && this.master) this.master.gain.value = v;
    else if (this.buses[bus]) this.buses[bus].gain.value = v;
  }
  resume() { this.ensure(); this.ctx.resume(); }
  tone(freq, dur, type, bus, gain, pan) {
    this.ensure();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain || 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = pan || 0;
    o.connect(g); g.connect(p); p.connect(this.buses[bus || "effects"]);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, bus, gain, hp) {
    this.ensure();
    const n = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = n;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hp || 400;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.buses[bus || "effects"]);
    src.start();
  }
  foot(surface) {
    const f = surface === "metal" ? 180 : surface === "dirt" ? 90 : 140;
    this.noise(0.08, "effects", 0.06, f);
    this.tone(f, 0.06, "triangle", "effects", 0.02);
  }
  ui() { this.tone(520, 0.05, "square", "ui", 0.03); }
  interact() { this.tone(240, 0.12, "sawtooth", "effects", 0.04); this.noise(0.1, "effects", 0.03, 200); }
  alarm() { this.tone(880, 0.4, "square", "effects", 0.05); }
  drone(near) { this.tone(70 + near * 40, 0.2, "sawtooth", "effects", 0.02 + near * 0.04); }
  startAmbience(kind) {
    this.ensure();
    if (this.amb) { try { this.amb.stop(); } catch (e) {} }
    const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.15;
    const src = this.ctx.createBufferSource();
    src.buffer = n; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = kind === "out" ? 900 : kind === "machine" ? 400 : 700;
    const g = this.ctx.createGain();
    g.gain.value = 0.18;
    src.connect(f); f.connect(g); g.connect(this.buses.ambience);
    src.start();
    this.amb = src;
  }
}
