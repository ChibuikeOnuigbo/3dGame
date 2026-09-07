#!/usr/bin/env python3
"""Programmatic screenshot analysis (no vision available in this session).

Checks per screenshot:
- not near-black (mean luminance) unless a dark scene is expected
- color variance (a broken render is flat)
- region brightness spread (top/middle/bottom thirds differ -> depth exists)
Writes qa/shots/analysis.json and prints a table.
"""
import json
import os
import sys

from PIL import Image

DIR = sys.argv[1] if len(sys.argv) > 1 else "/home/user/3dGame/qa/shots"

DARK_OK = {"01_gallery", "01_sump", "00_menu"}  # scenes expected dark-ish


def lum(px):
    return 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]


def analyze(path):
    im = Image.open(path).convert("RGB")
    im = im.resize((160, 90))
    px = list(im.getdata())
    lums = [lum(p) for p in px]
    mean = sum(lums) / len(lums)
    var = sum((l - mean) ** 2 for l in lums) / len(lums)
    h = im.height
    thirds = []
    for band in range(3):
        band_px = [lum(p) for i, p in enumerate(px) if (i // im.width) // (h // 3) == band]
        thirds.append(sum(band_px) / len(band_px))
    spread = max(thirds) - min(thirds)
    # color diversity: count distinct quantized colors
    colors = {(p[0] // 24, p[1] // 24, p[2] // 24) for p in px}
    return {
        "file": os.path.basename(path),
        "mean_lum": round(mean, 1),
        "variance": round(var, 1),
        "thirds": [round(t, 1) for t in thirds],
        "thirds_spread": round(spread, 1),
        "colors": len(colors),
    }


def main():
    rows = []
    for f in sorted(os.listdir(DIR)):
        if not f.endswith(".png"):
            continue
        r = analyze(os.path.join(DIR, f))
        name = f.rsplit(".", 1)[0]
        issues = []
        dark_ok = name in DARK_OK
        if r["mean_lum"] < 4 and not dark_ok:
            issues.append("NEAR-BLACK")
        if r["variance"] < 40:
            issues.append("FLAT")
        if r["colors"] < 12:
            issues.append("MONO")
        if r["thirds_spread"] < 3:
            issues.append("NO-DEPTH")
        r["issues"] = issues
        rows.append(r)
        print(f"{r['file']:24s} lum={r['mean_lum']:6.1f} var={r['variance']:7.1f} "
              f"thirds={r['thirds']} colors={r['colors']:3d} {'⚠ ' + ','.join(issues) if issues else 'OK'}")
    with open(os.path.join(DIR, "analysis.json"), "w") as f:
        json.dump(rows, f, indent=1)
    bad = [r for r in rows if r["issues"]]
    print(f"\n{len(rows) - len(bad)}/{len(rows)} shots pass programmatic checks")


if __name__ == "__main__":
    main()
