#!/usr/bin/env python3
"""Process ambientCG CC0 PBR sets (from fps-asset-kit) into game-ready 1K JPGs.

Source license: CC0 (ambientCG.com, via github.com/petroulacl/fps-asset-kit).
Provenance recorded in research/ASSET_PROVENANCE.md.
"""
import os
import sys

from PIL import Image

SRC = "/home/user/3dGame/research/github/repos/fps-asset-kit/textures"
DST = "/home/user/3dGame/game/public/textures"
MAPS = ["Color", "NormalGL", "Roughness", "AmbientOcclusion"]
SIZE = 1024

SETS = {
    "Concrete034": "main concrete floors",
    "Concrete047A": "concrete walls (dirty)",
    "Concrete048": "concrete floors variant (sump)",
    "Plaster002": "painted plaster walls (atrium)",
    "Metal049A": "painted metal (machines/doors)",
    "Metal063": "raw metal (pipes/valves)",
    "Wood094": "wood (desk/shelf/nest)",
    "Rock063": "excavated rock (shaft/tunnel)",
    "Asphalt031": "street surface (entry/exit)",
    "Bricks102": "brick (atrium lower wall)",
}


def process():
    total = 0
    for name in SETS:
        sdir = os.path.join(SRC, name)
        if not os.path.isdir(sdir):
            print("MISSING", name)
            continue
        files = {m: os.path.join(sdir, f"{name}_2K-JPG_{m}.jpg") for m in MAPS}
        # AO sometimes named differently; detect what exists
        outdir = os.path.join(DST, name)
        os.makedirs(outdir, exist_ok=True)
        for m, path in files.items():
            if not os.path.exists(path):
                # try alternate AO naming
                alts = [p for p in os.listdir(sdir) if m.lower() in p.lower() and p.endswith(".jpg")]
                if not alts:
                    print("  skip", name, m)
                    continue
                path = os.path.join(sdir, alts[0])
            out = os.path.join(outdir, f"{m}.jpg")
            im = Image.open(path)
            if im.mode != "RGB":
                im = im.convert("RGB")
            if max(im.size) > SIZE:
                im = im.resize((SIZE, SIZE), Image.LANCZOS)
            im.save(out, "JPEG", quality=84, optimize=True)
            total += os.path.getsize(out)
        print("ok", name, "->", sorted(os.listdir(outdir)))
    print(f"total {total/1e6:.1f} MB")


if __name__ == "__main__":
    process()
