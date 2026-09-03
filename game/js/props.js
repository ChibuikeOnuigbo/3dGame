import * as THREE from "three";
import { gltfLoader } from "./assets.js";

/**
 * PropLibrary — data-driven GLB prop instancing.
 *
 * Registry comes from data/props.json: { id: { f, name, s, solid } }
 *   f     -> path under ./models/kenney/ (no .glb)
 *   name  -> display name for QA/manifest
 *   s     -> default uniform scale
 *   solid -> whether a player-blocking AABB is registered
 *
 * Every prop is loaded once and cloned on placement. Bounding boxes are
 * measured at load time so placement always rests the base on the floor.
 */
export class PropLibrary {
  constructor(scene, solids, registry = {}) {
    this.scene = scene;
    this.solids = solids;
    this.registry = registry;
    this.models = {}; // id -> { tmpl, h }
    this.stats = { loaded: 0, failed: [], placed: {} };
    this.ready = false;
  }

  async load(ids = Object.keys(this.registry), onProgress = () => {}) {
    if (typeof ids === "function") { onProgress = ids; ids = Object.keys(this.registry); }
    ids = Array.isArray(ids) ? ids : Object.keys(this.registry);
    let done = 0;
    // small concurrency pool to avoid a burst of parse work
    const pool = (arr, limit, fn) => {
      const ret = new Array(arr.length);
      let i = 0;
      const worker = async () => {
        while (i < arr.length) {
          const idx = i++;
          ret[idx] = await fn(arr[idx], idx);
        }
      };
      return Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker)).then(() => ret);
    };
    await pool(ids, 6, async (id) => {
      const def = this.registry[id];
      const url = `./models/kenney/${def.f}.glb`;
      try {
        const g = await new Promise((resolve, reject) => {
          gltfLoader.load(url, resolve, undefined, reject);
        });
        g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
        const box = new THREE.Box3().setFromObject(g.scene);
        const size = box.getSize(new THREE.Vector3());
        this.models[id] = { tmpl: g.scene, h: size.y, w: size.x, d: size.z, boxMinY: box.min.y };
        this.stats.loaded++;
        done++;
        onProgress(done, ids.length, id);
      } catch (e) {
        this.stats.failed.push({ id, url, error: String(e && e.message ? e.message : e) });
        done++;
        onProgress(done, ids.length, id);
      }
    });
    this.ready = true;
    return this.stats;
  }

  place(id, x, y, z, ry = 0, opts = {}) {
    const def = this.registry[id];
    const m = this.models[id];
    if (!def || !m) return null;
    const g = m.tmpl.clone(true);
    const s = opts.s ?? def.s ?? 1;
    g.scale.setScalar(s);
    // rest base on y (models whose origin is above/below their base are corrected)
    const box = new THREE.Box3().setFromObject(g);
    g.position.set(x, y - box.min.y, z);
    g.rotation.y = ry;
    g.userData.hcProp = id;      // tag for QA/scan
    g.userData.hcPos = [x, y, z];
    g.userData.hcRy = ry;
    this.scene.add(g);
    if (opts.solid ?? def.solid) {
      const bb = new THREE.Box3().setFromObject(g);
      this.solids.push({
        minx: bb.min.x + 0.02, maxx: bb.max.x - 0.02,
        miny: Math.max(0, bb.min.y), maxy: Math.max(bb.max.y, 0.25),
        minz: bb.min.z + 0.02, maxz: bb.max.z - 0.02,
      });
    }
    this.stats.placed[id] = (this.stats.placed[id] || 0) + 1;
    return g;
  }

  /** Convenience: place a prop and return it, ignoring missing models. */
  has(id) { return !!this.models[id]; }
}
