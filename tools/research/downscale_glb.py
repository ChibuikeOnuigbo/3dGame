#!/usr/bin/env python3
"""Downscale embedded textures inside a GLB (binary glTF) file.

Pure stdlib + Pillow. Rebuilds the BIN chunk with resized JPEG images.
Usage: downscale_glb.py in.glb out.glb [--max 1024] [--quality 82]
"""
import io
import json
import struct
import sys

from PIL import Image


def pad4(b):
    return b + b"\x00" * ((4 - len(b) % 4) % 4)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    maxdim, quality = 1024, 82
    args = sys.argv[3:]
    if "--max" in args: maxdim = int(args[args.index("--max") + 1])
    if "--quality" in args: quality = int(args[args.index("--quality") + 1])

    with open(src, "rb") as f:
        data = f.read()
    magic, version, total = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF", "not a GLB"
    off = 12
    json_chunk = bin_chunk = None
    while off < total:
        ln, tp = struct.unpack("<II", data[off:off + 8])
        payload = data[off + 8:off + 8 + ln]
        if tp == 0x4E4F534A: json_chunk = payload
        elif tp == 0x004E4942: bin_chunk = payload
        off += 8 + ln
    j = json.loads(json_chunk)
    buf = bytearray(bin_chunk)

    # image bufferView -> new bytes
    replaced = {}
    for i, img in enumerate(j.get("images", [])):
        bv = img.get("bufferView")
        if bv is None: continue
        view = j["bufferViews"][bv]
        b = bytes(buf[view["byteOffset"]:view["byteOffset"] + view["byteLength"]])
        try:
            im = Image.open(io.BytesIO(b))
            im.load()
        except Exception as e:  # noqa: BLE001
            print(f"  img {i}: skip ({e})")
            continue
        w, h = im.size
        scale = min(1.0, maxdim / max(w, h))
        mime = img.get("mimeType", "")
        if scale < 1.0 or "png" in mime:
            if scale < 1.0:
                im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
            out = io.BytesIO()
            rgb = im.convert("RGB") if im.mode not in ("RGB", "L") else im
            rgb.save(out, "JPEG", quality=quality, optimize=True)
            replaced[bv] = out.getvalue()
            img["mimeType"] = "image/jpeg"
            print(f"  img {i}: {w}x{h} -> {im.size[0]}x{im.size[1]} jpg {len(replaced[bv])}B")

    if not replaced:
        print("nothing to do")
        return

    # rebuild buffer: replace views in place (append new data, repoint views)
    for bv, nb in replaced.items():
        view = j["bufferViews"][bv]
        view["byteOffset"] = len(buf)
        view["byteLength"] = len(nb)
        view.pop("byteStride", None)
        buf += pad4(nb)
    j["buffers"][0]["byteLength"] = len(buf)

    jbytes = pad4(json.dumps(j, separators=(",", ":")).encode())
    bbytes = pad4(bytes(buf))
    out_total = 12 + 8 + len(jbytes) + 8 + len(bbytes)
    with open(dst, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, out_total))
        f.write(struct.pack("<II", len(jbytes), 0x4E4F534A) + jbytes)
        f.write(struct.pack("<II", len(bbytes), 0x004E4942) + bbytes)
    print(f"wrote {dst} ({out_total} bytes)")


if __name__ == "__main__":
    main()
