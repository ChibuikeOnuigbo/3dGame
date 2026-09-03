import * as THREE from "three";
import { texLoader as loader } from "./assets.js";

function tex(url, repeat = 2) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function kelvinRGB(k) {
  k = Math.max(1000, Math.min(40000, k)) / 100;
  let r, g, b;
  if (k <= 66) {
    r = 255;
    g = 99.47056 * Math.log(k) - 161.11957;
    b = k <= 19 ? 0 : 138.51773 * Math.log(k - 10) - 305.04479;
  } else {
    r = 329.69873 * Math.pow(k - 60, -0.1332);
    g = 288.12217 * Math.pow(k - 60, -0.0755);
    b = 255;
  }
  return new THREE.Color(
    Math.max(0, Math.min(255, r)) / 255,
    Math.max(0, Math.min(255, g)) / 255,
    Math.max(0, Math.min(255, b)) / 255
  );
}

/** Approximate Three.js intensity from lumens for a local light. */
export function lumensToIntensity(lm) {
  return Math.max(0.05, lm / 450);
}

export function makeLibrary() {
  const std = (map, extra = {}) =>
    new THREE.MeshStandardMaterial({
      map,
      roughness: extra.roughness ?? 0.86,
      metalness: extra.metalness ?? 0.02,
      color: extra.color ?? 0xffffff,
      envMapIntensity: extra.env ?? 0.6,
    });
  return {
    concFloor: std(tex("./tex/concrete_floor_worn_001_diff_1k.jpg", 4), { roughness: 0.92 }),
    concWall: std(tex("./tex/concrete_wall_008_diff_1k.jpg", 3.2), { roughness: 0.88 }),
    paint: std(tex("./tex/painted_plaster_wall_diff_1k.jpg", 2.4), { roughness: 0.78 }),
    tile: std(tex("./tex/tiles_diff_1k.jpg", 4), { roughness: 0.35, metalness: 0.05 }),
    metal: std(tex("./tex/metal_plate_diff_1k.jpg", 2), { roughness: 0.42, metalness: 0.72 }),
    rust: std(tex("./tex/rust_diff_1k.jpg", 2), { roughness: 0.7, metalness: 0.45 }),
    wood: std(tex("./tex/wood_floor_deck_diff_1k.jpg", 1.6), { roughness: 0.8 }),
    dirt: std(tex("./tex/brown_mud_03_diff_1k.jpg", 3), { roughness: 0.95 }),
    rock: std(tex("./tex/aerial_rocks_02_diff_1k.jpg", 2), { roughness: 0.9 }),
    wet: std(tex("./tex/concrete_floor_worn_001_diff_1k.jpg", 2), { roughness: 0.22, metalness: 0.08, color: 0x8899aa }),
    asphalt: std(tex("./tex/asphalt_02_diff_1k.jpg", 3), { roughness: 0.9 }),
    gravel: std(tex("./tex/gravelly_sand_diff_1k.jpg", 3), { roughness: 0.95 }),
    rockWall: std(tex("./tex/rock_wall_09_diff_1k.jpg", 2), { roughness: 0.88 }),
    roof: std(tex("./tex/roof_07_diff_1k.jpg", 2), { roughness: 0.7 }),
    cardboard: std(tex("./tex/oga_cardboard.png", 1.2), { roughness: 0.92 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1c1b, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x88a0b0, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.28 }),
    warn: new THREE.MeshStandardMaterial({ color: 0xb08a22, roughness: 0.5, emissive: 0x332200, emissiveIntensity: 0.15 }),
    emitWarm: new THREE.MeshBasicMaterial({ color: 0xffd8a0 }),
    emitCool: new THREE.MeshBasicMaterial({ color: 0xa8c8ff }),
    emitAmber: new THREE.MeshBasicMaterial({ color: 0xff7a33 }),
    emitGreen: new THREE.MeshBasicMaterial({ color: 0x66ffaa }),
  };
}
