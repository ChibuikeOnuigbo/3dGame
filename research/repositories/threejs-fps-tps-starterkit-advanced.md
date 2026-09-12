# Repository report — threejs-fps-tps-starterkit-advanced

- **Local clone:** `research/github/repos/threejs-fps-tps-starterkit-advanced`
- **Stack:** essentially the official three.js FPS example, single `index.html` (48 KB) with importmap to three@0.174.0 CDN, three/addons (GLTFLoader, Octree, Capsule, Sky, lil-gui, Stats).
- **License:** NO LICENSE FILE (upstream three.js examples are MIT; this mirror has none — treat as MIT-derived but cite three.js authors).

## Architecture (source tree)
- Player = `THREE.Capsule(start, end, 0.35)`; world collision via `worldOctree.fromGraphNode(scene)`; each frame: `worldOctree.capsuleIntersect(playerCollider)` → `playerCollider.translate(result.normal.multiplyScalar(result.depth))` (penetration push-out), ground flag = intersection with upward normal.
- Camera smoothing: `idealCameraPosition.copy(playerCollider.end)` then lerp; FPS/TPS toggle key C; sphere-throwing physics impulse demo; day/night cycle + Sky addon.

## Key patterns to steal
1. **Octree + capsuleIntersect** is the canonical three.js collision path. We use a hand-rolled AABB list instead — deliberate (O(n) against ~120 boxes is trivial, and the list is QA-visible). The octree pays off only past ~1k colliders or with arbitrary trimesh.
2. **Push-out by normal×depth** — we do per-axis rejection; equivalent stability for axis-aligned worlds.
3. Stats.js / lil-gui debug overlays — our `window.swQA` harness supersedes this.

## Techniques NOT to copy
- CDN importmap (offline-unfriendly, no lockfile) — Vite bundling wins.
- Octree when AABB count is small — extra memory & rebuild cost for no win here.

## Applicability to Still Water
Reference implementation for when/if the world grows into trimesh-heavy content (then: Octree or Rapier). Priority: none today.
