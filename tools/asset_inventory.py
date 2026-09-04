#!/usr/bin/env python3
"""Asset forensics: walk a tree, find 3D models, parse GLB/GLTF headers.

For each model: path, size, format, and (for GLB/GLTF) mesh count,
vertex count, triangle estimate, material count, texture ref count,
animation clip names, whether skeletons exist.

Pure stdlib: GLB = 12-byte header + JSON chunk + BIN chunk; we parse the
JSON chunk only (accessor counts give vertex/triangle estimates).
"""
import json
import os
import struct
import sys

MODEL_EXT = {".glb", ".gltf", ".fbx", ".obj", ".dae", ".blend", ".stl"}


def parse_gltf_json(data: bytes):
    """Return (gltf_dict, ok) for GLB or raw .gltf (path passed as data None)."""
    if data[:4] == b"glTF":
        # GLB: magic(4) version(4) length(4) then chunks
        off = 12
        json_chunk = None
        while off + 8 <= len(data):
            clen, ctype = struct.unpack("<I4s", data[off : off + 8])
            body = data[off + 8 : off + 8 + clen]
            if ctype == b"JSON":
                json_chunk = body
                break
            off += 8 + clen
        if json_chunk is None:
            return None, "no JSON chunk"
        try:
            return json.loads(json_chunk.decode("utf-8", "replace")), True
        except Exception as e:
            return None, f"json parse: {e}"
    try:
        return json.loads(data.decode("utf-8", "replace")), True
    except Exception as e:
        return None, f"json parse: {e}"


def summarize(g):
    meshes = len(g.get("meshes", []))
    verts = tris = 0
    for m in g.get("meshes", []):
        for p in m.get("primitives", []):
            pos = p.get("attributes", {}).get("POSITION")
            if pos is not None and pos < len(g.get("accessors", [])):
                acc = g["accessors"][pos]
                verts += acc.get("count", 0)
            idx = p.get("indices")
            if idx is not None and idx < len(g.get("accessors", [])):
                tris += g["accessors"][idx].get("count", 0) // 3
            else:
                # non-indexed: assume most common mode 4 (triangles)
                if pos is not None:
                    tris += g["accessors"][pos].get("count", 0) // 3
    mats = len(g.get("materials", []))
    imgs = len(g.get("images", []))
    anims = [a.get("name", "?") for a in g.get("animations", [])]
    skins = len(g.get("skins", []))
    return meshes, verts, tris, mats, imgs, anims, skins


def inventory(root: str):
    rows = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
        for fn in sorted(filenames):
            ext = os.path.splitext(fn)[1].lower()
            if ext not in MODEL_EXT:
                continue
            path = os.path.join(dirpath, fn)
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            row = {
                "path": os.path.relpath(path, root),
                "ext": ext.lstrip("."),
                "size": size,
                "meshes": None, "verts": None, "tris": None,
                "materials": None, "textures": None,
                "animations": [], "skeletons": None, "error": None,
            }
            if ext in (".glb", ".gltf"):
                try:
                    with open(path, "rb") as f:
                        data = f.read()
                    g, ok = parse_gltf_json(data)
                    if ok and isinstance(g, dict):
                        (me, ve, tr, ma, im, an, sk) = summarize(g)
                        row.update(meshes=me, verts=ve, tris=tr, materials=ma,
                                   textures=im, animations=an, skeletons=sk)
                    else:
                        row["error"] = str(g)
                except Exception as e:
                    row["error"] = f"{type(e).__name__}: {e}"
            rows.append(row)
    return rows


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    out = sys.argv[2] if len(sys.argv) > 2 else None
    rows = inventory(root)
    if out:
        with open(out, "w") as f:
            json.dump(rows, f, indent=1)
    tot = sum(r["tris"] or 0 for r in rows)
    print(f"{len(rows)} models, ~{tot:,} triangles total -> {out or 'stdout'}")
    for r in rows[:40]:
        print(f"  {r['path'][:90]:92s} {r['ext']:4s} {r['size']:>10,} "
              f"tris={r['tris']} anims={len(r['animations'])} err={r['error']}")
