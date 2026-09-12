#!/usr/bin/env python3
"""OpenCV analysis of the surroundings shots.

User QA 2026-09-07: "generate img of surrounding and extract data with
opencv to understand all models needed". For every shot we extract:
  * luminance stats + near-black pixel fraction (the "black wall" metric);
  * dominant colour palette (k-means, k=6) mapped to coarse material classes
    (asphalt/concrete, soil, grass, metal, sky, light);
  * Canny edge density (geometric detail per view);
  * largest dark connected regions (wall-sized dark masses -> flagged);
Annotated copies (red outlines + labels on the largest dark regions) are
written next to each shot. Results: qa/surroundings_analysis.json + INDEX.md.
"""
import glob
import json
import os

import cv2
import numpy as np

HERE = os.path.dirname(__file__)
SHOTS = os.path.normpath(os.path.join(HERE, "..", "..", "qa", "shots", "surroundings"))
OUT_JSON = os.path.normpath(os.path.join(HERE, "..", "..", "qa", "surroundings_analysis.json"))
OUT_MD = os.path.normpath(os.path.join(HERE, "..", "..", "qa", "surroundings_INDEX.md"))


def material_class(bgr):
    b, g, r = [int(v) for v in bgr]
    mx, mn = max(r, g, b), min(r, g, b)
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = 0 if mx == 0 else (mx - mn) / mx
    if luma > 150 and sat < 0.35:
        return "light/sky-glow"
    if luma > 95:
        return "sky"
    if sat > 0.28 and g > r and g > b:
        return "foliage/grass"
    if sat > 0.3 and r > g > b:
        return "soil/rust"
    if luma < 26:
        return "near-black mass"
    if sat < 0.18:
        return "concrete/asphalt/metal"
    return "mixed-prop"


def analyze(path):
    img = cv2.imread(path)
    if img is None:
        return None
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    luma_mean = float(gray.mean())
    dark_frac = float((gray < 24).mean())
    edges = cv2.Canny(gray, 60, 160)
    edge_density = float(edges.mean() / 255.0)

    # palette via k-means
    z = img.reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 8, 1.0)
    _, labels, centers = cv2.kmeans(z, 6, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=6)
    order = np.argsort(-counts)
    palette = []
    for k in order:
        frac = float(counts[k]) / (h * w)
        if frac < 0.02:
            continue
        c = centers[k]
        palette.append({
            "bgr": [int(v) for v in c],
            "hex": "#{:02x}{:02x}{:02x}".format(int(c[2]), int(c[1]), int(c[0])),
            "coverage": round(frac, 3),
            "class": material_class(c),
        })

    # dark connected regions (candidate "black wall" masses).
    # Discriminator vs legit night darkness: the old artifact was a UNIFORM
    # black sheet -> near-zero internal luma variance, no edges inside.
    mask = (gray < 24).astype(np.uint8) * 255
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    regions = []
    for i in range(1, n):
        x, y, rw, rh, area = stats[i]
        frac = area / (h * w)
        if frac < 0.01:
            continue
        sel = labels == i
        inner_std = float(gray[sel].std()) if sel.any() else 0.0
        edge_in = float(edges[sel].mean() / 255.0)
        rows = np.where(sel)[0]
        # share of the region below the horizon line (65% down the frame).
        # The old black-wall sheet filled the LOWER half of the view; legit
        # night sky + skyline stays above it.
        bottom_frac = float((rows > h * 0.65).mean()) if rows.size else 0.0
        regions.append({
            "bbox": [int(x), int(y), int(rw), int(rh)],
            "area_frac": round(frac, 3),
            "inner_std": round(inner_std, 2),
            "edge_in": round(edge_in, 4),
            "bottom_frac": round(bottom_frac, 3),
            "wallish": bool(rw > w * 0.12 and rh > h * 0.25),
        })
    regions.sort(key=lambda r: -r["area_frac"])

    # annotate top dark regions
    ann = img.copy()
    for r in regions[:3]:
        x, y, rw, rh = r["bbox"]
        col = (0, 0, 255) if r["wallish"] else (0, 165, 255)
        cv2.rectangle(ann, (x, y), (x + rw, y + rh), col, 2)
        cv2.putText(ann, f"{r['area_frac']:.0%}", (x + 4, y + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2)
    ann_path = path.replace(".png", "_annotated.png")
    cv2.imwrite(ann_path, ann)

    return {
        "shot": os.path.basename(path),
        "luma_mean": round(luma_mean, 1),
        "dark_frac": round(dark_frac, 3),
        "edge_density": round(edge_density, 4),
        "palette": palette,
        "dark_regions": regions[:5],
        # a real black-wall sheet occupies the lower half of the view; sky /
        # skyline silhouettes live above the horizon.
        "black_wall_flag": bool(any(
            r["wallish"] and r["area_frac"] > 0.18 and r["inner_std"] < 4.0 and
            r["bottom_frac"] > 0.25
            for r in regions)),
    }


def main():
    shots = sorted(glob.glob(os.path.join(SHOTS, "*.png")))
    shots = [s for s in shots if not s.endswith("_annotated.png")]
    report = []
    for s in shots:
        r = analyze(s)
        if r:
            report.append(r)
            print(f"{r['shot']:30s} luma={r['luma_mean']:5.1f} dark={r['dark_frac']:.2f} "
                  f"edges={r['edge_density']:.3f} flag={r['black_wall_flag']}")
    with open(OUT_JSON, "w") as f:
        json.dump(report, f, indent=1)
    lines = ["# Surroundings analysis (OpenCV)", "",
             "Shots: `qa/shots/surroundings/` — annotated copies end in `_annotated.png`.", "",
             "| shot | luma | dark% | edge% | black-wall flag | top materials |",
             "| --- | --- | --- | --- | --- | --- |"]
    for r in report:
        mats = ", ".join(f"{p['class']} {p['coverage']:.0%}" for p in r["palette"][:3])
        lines.append(f"| {r['shot']} | {r['luma_mean']} | {r['dark_frac']:.0%} | "
                     f"{r['edge_density']:.1%} | {'**YES**' if r['black_wall_flag'] else 'no'} | {mats} |")
    with open(OUT_MD, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\nwrote {OUT_JSON}\nwrote {OUT_MD}")
    flagged = [r["shot"] for r in report if r["black_wall_flag"]]
    print("black-wall-flagged shots:", flagged if flagged else "NONE")


if __name__ == "__main__":
    main()
