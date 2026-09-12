#!/usr/bin/env python3
"""Decimate meshes inside a GLB to a target triangle budget.

Usage: decimate_glb.py in.glb out.glb [--tris 20000]

Loads with trimesh (process=False to preserve structure), simplifies each
mesh with fast-simplification, re-exports GLB. Materials/textures survive via
trimesh's glTF exporter (PBR metallic-roughness + baseColor/ORM textures).
"""
import sys

import trimesh


def main():
    src, dst = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    budget = 20000
    if "--tris" in args:
        budget = int(args[args.index("--tris") + 1])

    scene = trimesh.load(src, process=False)
    meshes = []
    if isinstance(scene, trimesh.Trimesh):
        meshes = [(None, scene)]
    else:
        meshes = list(scene.geometry.items())

    out = trimesh.Scene()
    total_before = total_after = 0
    for name, geo in meshes:
        if not hasattr(geo, "faces") or len(geo.faces) == 0:
            continue
        total_before += len(geo.faces)
        target = max(64, min(len(geo.faces), budget))
        if len(geo.faces) > budget:
            ratio = budget / len(geo.faces)
            try:
                simp = geo.simplify_quadric_decimation(face_count=target)
            except Exception:  # noqa: BLE001
                simp = geo
            geo = simp
        total_after += len(geo.faces)
        out.add_geometry(geo, geom_name=name or "mesh")
    out.export(dst)
    print(f"tris {total_before} -> {total_after}; wrote {dst}")


if __name__ == "__main__":
    main()
