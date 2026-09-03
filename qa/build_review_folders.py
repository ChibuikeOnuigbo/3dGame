#!/usr/bin/env python3
"""Build the approved/declined view structure inside visual_review/.

Per scene folder, keeps the canonical 4 views at the root (general.png +
01_turn/02_left/03_right.png = "all views"), and sorts each view into an
approved/ or declined/ subfolder according to its pixel-level `lit` verdict in
review.json. Declined views are kept (as reference), not deleted.

Usage: python qa/build_review_folders.py [--root visual_review]
"""
import argparse
import json
import shutil
from pathlib import Path


def build(root: Path):
    summary = json.loads((root / "_summary.json").read_text())
    total_approved = total_declined = 0
    for entry in summary:
        scene = entry["scene"]
        sdir = root / scene
        rj = sdir / "review.json"
        if not rj.exists():
            print(f"skip {scene}: no review.json")
            continue
        review = json.loads(rj.read_text())
        ap = sdir / "approved"
        dc = sdir / "declined"
        ap.mkdir(exist_ok=True)
        dc.mkdir(exist_ok=True)
        # clear stale copies
        for d in (ap, dc):
            for f in d.glob("*.png"):
                f.unlink()
        n_a = n_d = 0
        for v in review.get("views", []):
            fname = v.get("file")
            if not fname or not (sdir / fname).exists():
                continue
            if v.get("lit"):
                shutil.copy2(sdir / fname, ap / fname)
                n_a += 1
            else:
                shutil.copy2(sdir / fname, dc / fname)
                n_d += 1
        total_approved += n_a
        total_declined += n_d
        print(f"{scene:12s} approved={n_a} declined={n_d}")
    print(f"\nTOTAL approved views={total_approved} declined views={total_declined}")
    print("structure written under", root)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="visual_review")
    args = ap.parse_args()
    build(Path(args.root))


if __name__ == "__main__":
    main()
