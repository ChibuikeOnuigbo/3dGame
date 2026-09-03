#!/usr/bin/env python3
"""Intelligent frame sampling: grab a bounded number of representative frames
(thumbnail + uniformly spaced) instead of every frame. Keeps research artifacts
small. Uses yt-dlp (downloads a low-res stream) + ffmpeg for frame grabbing.

Usage:  python extract_frames.py VIDEO_URL_OR_ID [--out DIR] [--count 12]
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    sys.exit("install yt-dlp:  pip install -r requirements.txt")


def grab(video, out: Path, count: int):
    out.mkdir(parents=True, exist_ok=True)
    tmp = out / ".tmp"
    tmp.mkdir(exist_ok=True)
    dl_opts = {
        "format": "best[height<=480]/best",
        "outtmpl": str(tmp / "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(dl_opts) as ydl:
        info = ydl.extract_info(video, download=True)
        vid = ydl.prepare_filename(info)
    dur = info.get("duration") or 0
    steps = sorted({int(dur * i / max(count - 1, 1)) for i in range(count)})
    manifest = []
    for i, t in enumerate(steps):
        png = out / f"{info['id']}_{i:02d}_{t:05d}s.png"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(t), "-i", vid, "-frames:v", "1", "-q:v", "3", str(png)],
            check=True, capture_output=True)
        manifest.append({"frame": i, "t": t, "file": png.name})
    (out / f"{info['id']}_frames.json").write_text(json.dumps(manifest, indent=2))
    # keep the low-res video only if it is small; otherwise discard
    vp = Path(vid)
    if vp.stat().st_size > 50 * 1024 * 1024:
        vp.unlink(missing_ok=True)
    print(f"{len(steps)} frames -> {out}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="research/video_frames")
    ap.add_argument("--count", type=int, default=12)
    args = ap.parse_args()
    grab(args.video, Path(args.out) / args.video.split("=")[-1].split("/")[-1].split("&")[0], args.count)


if __name__ == "__main__":
    main()
