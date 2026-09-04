// Materials: ambientCG CC0 PBR sets (via fps-asset-kit) -> MeshStandardMaterial.
// Textures are 1K JPGs processed by tools/process_textures.py.

import * as THREE from "three";

const SETS = {
  concreteFloor: { set: "Concrete034", repeat: [2.2, 2.2], rough: 1.0, metal: 0.0 },
  concreteWall: { set: "Concrete047A", repeat: [2.0, 1.0], rough: 1.0, metal: 0.0 },
  concreteDark: { set: "Concrete048", repeat: [1.8, 1.8], rough: 1.0, metal: 0.0 },
  plaster: { set: "Plaster002", repeat: [1.6, 0.9], rough: 1.0, metal: 0.0 },
  metalPainted: { set: "Metal049A", repeat: [1.2, 1.2], rough: 1.0, metal: 0.55 },
  metalRaw: { set: "Metal063", repeat: [1.0, 1.0], rough: 1.0, metal: 0.9 },
  wood: { set: "Wood094", repeat: [1.0, 1.0], rough: 1.0, metal: 0.0 },
  rock: { set: "Rock063", repeat: [1.6, 1.6], rough: 1.0, metal: 0.0 },
  asphalt: { set: "Asphalt031", repeat: [2.0, 2.0], rough: 1.0, metal: 0.0 },
  grass: { set: "Ground037", repeat: [1.8, 1.8], rough: 1.0, metal: 0.0 },
  soil: { set: "Ground054", repeat: [1.6, 1.6], rough: 1.0, metal: 0.0 },
  brick: { set: "Bricks102", repeat: [1.4, 1.0], rough: 1.0, metal: 0.0 },
};

export class Materials {
  constructor() {
    this.mats = new Map();
    this.variants = new Map();
    this.texLoads = 0;
  }

  texURL(set, map) {
    return `textures/${set}/${map}.jpg`;
  }

  loadAll(onProgress) {
    const loader = new THREE.TextureLoader();
    const jobs = [];
    const loaded = { n: 0 };
    for (const [key, cfg] of Object.entries(SETS)) {
      const maps = { map: "Color", normalMap: "NormalGL", roughnessMap: "Roughness" };
      const texes = {};
      for (const [slot, suffix] of Object.entries(maps)) {
        jobs.push(
          new Promise((resolve, reject) => {
            loader.load(
              this.texURL(cfg.set, suffix),
              (t) => {
                t.wrapS = t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(cfg.repeat[0], cfg.repeat[1]);
                t.anisotropy = 4;
                if (slot === "map") t.colorSpace = THREE.SRGBColorSpace;
                texes[slot] = t;
                loaded.n++;
                if (onProgress) onProgress(loaded.n);
                resolve();
              },
              undefined,
              (err) => reject(new Error(`texture ${cfg.set}/${suffix}: ${err.message || "load failed"}`))
            );
          })
        );
      }
      const mat = new THREE.MeshStandardMaterial({
        roughness: cfg.rough,
        metalness: cfg.metal,
        ...texes,
      });
      mat.normalScale.set(0.85, 0.85);
      this.mats.set(key, mat);
    }

    // Non-textured utility materials
    this.mats.set("trim", new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.85, metalness: 0.3 }));
    this.mats.set("darkMetal", new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.55, metalness: 0.8 }));
    this.mats.set("yellowPaint", new THREE.MeshStandardMaterial({ color: 0xc79a2a, roughness: 0.7, metalness: 0.15 }));
    this.mats.set("bluePaint", new THREE.MeshStandardMaterial({ color: 0x2d5d8e, roughness: 0.6, metalness: 0.2 }));
    this.mats.set("redPaint", new THREE.MeshStandardMaterial({ color: 0x8e2f26, roughness: 0.65, metalness: 0.15 }));
    this.mats.set("glowWarm", new THREE.MeshStandardMaterial({ color: 0xffdfb0, emissive: 0xffc880, emissiveIntensity: 2.4 }));
    this.mats.set("glowCool", new THREE.MeshStandardMaterial({ color: 0xdfeaff, emissive: 0xbfd4ff, emissiveIntensity: 2.6 }));
    this.mats.set("glowRed", new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff2a10, emissiveIntensity: 2.2 }));
    this.mats.set("glowGreen", new THREE.MeshStandardMaterial({ color: 0x7dffa0, emissive: 0x2aff60, emissiveIntensity: 2.2 }));
    this.mats.set("glowSign", new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xe8d9a8, emissiveIntensity: 1.6 }));
    this.mats.set("paper", new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.95 }));
    this.mats.set("lampOff", new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.6 }));

    return Promise.all(jobs);
  }

  get(key) {
    return this.mats.get(key);
  }

  // Variant with different texture repeat (cached). Shares geometry-level textures via clone.
  variant(key, rx, ry) {
    const k = `${key}|${rx}|${ry}`;
    if (this.variants.has(k)) return this.variants.get(k);
    const base = this.mats.get(key);
    if (!base) return base;
    const m = base.clone();
    for (const slot of ["map", "normalMap", "roughnessMap"]) {
      if (m[slot]) {
        m[slot] = m[slot].clone();
        m[slot].repeat.set(rx, ry);
        m[slot].needsUpdate = true;
      }
    }
    this.variants.set(k, m);
    return m;
  }
}

// Canvas-painted signage (stencil look) — wayfinding as diegetic art.
export function makeSignTexture(lines, opts = {}) {
  const w = opts.w || 512;
  const h = opts.h || 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = opts.bg || "#1d211f";
  ctx.fillRect(0, 0, w, h);
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  }
  ctx.fillStyle = opts.color || "#d8c26a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = opts.size || Math.floor(h / (lines.length * 1.7));
  ctx.font = `bold ${size}px "Arial Black", Arial, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1), w * 0.9);
  });
  if (opts.arrow === "right") {
    ctx.beginPath();
    const y = h / 2;
    ctx.moveTo(w - 90, y - 26);
    ctx.lineTo(w - 40, y);
    ctx.lineTo(w - 90, y + 26);
    ctx.lineTo(w - 76, y);
    ctx.closePath();
    ctx.fill();
  }
  if (opts.arrow === "left") {
    ctx.beginPath();
    const y = h / 2;
    ctx.moveTo(90, y - 26);
    ctx.lineTo(40, y);
    ctx.lineTo(90, y + 26);
    ctx.lineTo(76, y);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A short document texture (for notice board / calendar / notes in world).
export function makePaperTexture(title, bodyLines, opts = {}) {
  const w = 256, h = 340;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = opts.bg || "#cfc9b4";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2a2a26";
  ctx.textAlign = "center";
  ctx.font = "bold 20px Georgia, serif";
  ctx.fillText(title, w / 2, 40, w - 24);
  ctx.strokeStyle = "#8b8778";
  ctx.beginPath();
  ctx.moveTo(24, 54);
  ctx.lineTo(w - 24, 54);
  ctx.stroke();
  ctx.font = "13px Georgia, serif";
  ctx.textAlign = "left";
  bodyLines.forEach((line, i) => {
    ctx.fillText(line, 20, 84 + i * 20, w - 36);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
