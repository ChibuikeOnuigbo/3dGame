import * as THREE from "three";
import { GLTFLoader } from "../vendor/GLTFLoader.js";

export const manager = new THREE.LoadingManager();
export const texLoader = new THREE.TextureLoader(manager);
export const gltfLoader = new GLTFLoader(manager);
export const prototypes = {};

export function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
}

export function preload() {
  const jobs = [
    ["./models/flashlight/scene.gltf", "flashlight"],
    ["./models/hand_c/scene.gltf", "hand"],
    ["./models/warehouse/scene.gltf", "warehouse"],
  ].map(([url, key]) =>
    loadGltf(url).then((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) o.frustumCulled = false;
      });
      prototypes[key] = g.scene;
    }).catch((e) => {
      console.warn("asset fail", url, e);
    })
  );
  return Promise.all(jobs);
}
