#!/usr/bin/env python3
"""Parse a GLB and report dimensions, node/mesh/material counts, and texture refs.

Used by the asset pipeline to (a) validate downloads and (b) produce a
props manifest with real bounding-box sizes so world.py can scale props
data-driven instead of guessing.
"""
import json
import struct
import sys
from pathlib import Path


def parse_glb(path: Path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:  # 'glTF'
        raise ValueError(f"{path}: bad magic {magic:#x}")
    off = 12
    json_chunk = None
    bin_blob = None
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:  # JSON
            json_chunk = chunk
        elif ctype == 0x004E4942:  # BIN
            bin_blob = chunk
    if json_chunk is None:
        raise ValueError(f"{path}: no JSON chunk")
    gltf = json.loads(json_chunk.decode("utf-8"))
    return gltf, bin_blob


def accessor_bounds(gltf, bin_blob, acc_idx):
    """Return (min, max) as (x,y,z) tuples for a POSITION vec3 float accessor."""
    acc = gltf["accessors"][acc_idx]
    if "min" in acc and "max" in acc:
        return tuple(acc["min"]), tuple(acc["max"])
    if acc.get("componentType") != 5126 or acc.get("type") != "VEC3":
        return None
    bv = gltf["bufferViews"][acc["bufferView"]]
    bo = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    stride = bv.get("byteStride", 12)
    # buffer index 0 -> BIN blob
    buf = gltf["buffers"][bv.get("buffer", 0)]
    if buf.get("uri") is not None:
        return None  # external .bin, skip
    vals = []
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for i in range(count):
        o = bo + i * stride
        (x, y, z) = struct.unpack_from("<fff", bin_blob, o)
        for a in range(3):
            v = (x, y, z)[a]
            mn[a] = min(mn[a], v)
            mx[a] = max(mx[a], v)
    return tuple(mn), tuple(mx)


def inspect(path: Path):
    gltf, bin_blob = parse_glb(path)
    meshes = gltf.get("meshes", [])
    nodes = gltf.get("nodes", [])
    materials = gltf.get("materials", [])
    textures = gltf.get("textures", [])
    images = gltf.get("images", [])
    ext_uris = [im.get("uri") for im in images if im.get("uri")]
    prims = 0
    verts = 0
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for m in meshes:
        for p in m.get("primitives", []):
            prims += 1
            pos = p.get("attributes", {}).get("POSITION")
            if pos is not None:
                verts += gltf["accessors"][pos]["count"]
                b = accessor_bounds(gltf, bin_blob, pos)
                if b:
                    for a in range(3):
                        mn[a] = min(mn[a], b[0][a])
                        mx[a] = max(mx[a], b[1][a])
    if mn[0] == 1e9:
        return None
    size = [mx[a] - mn[a] for a in range(3)]
    return {
        "name": path.name,
        "nodes": len(nodes),
        "meshes": len(meshes),
        "prims": prims,
        "verts": verts,
        "materials": len(materials),
        "textures": len(textures),
        "ext_uris": ext_uris,
        "min": [round(v, 3) for v in mn],
        "max": [round(v, 3) for v in mx],
        "size": [round(v, 3) for v in size],
        "bytes": path.stat().st_size,
    }


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    rows = []
    for p in paths:
        try:
            info = inspect(p)
            if info:
                rows.append(info)
                print(f"{info['name']:34s} size=({info['size'][0]:>6},{info['size'][1]:>6},{info['size'][2]:>6}) "
                      f"y=[{info['min'][1]:>6},{info['max'][1]:>6}] verts={info['verts']:>6} prims={info['prims']:>4} "
                      f"mat={info['materials']} tex={info['textures']} ext={info['ext_uris']}")
        except Exception as e:
            print(f"{p.name}: ERROR {e}", file=sys.stderr)
    if len(paths) > 1:
        out = Path("/tmp/glb_manifest.json")
        out.write_text(json.dumps(rows, indent=2))
        print(f"\nwrote {out} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
