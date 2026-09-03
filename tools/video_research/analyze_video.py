#!/usr/bin/env python3
"""Analyze one reference video's metadata + transcript into a design-principles
JSON (environment / gameplay / horror / camera / pacing observations).

This does NOT copy dialogue or narrative — it extracts DESIGN PRINCIPLES only.

Usage:  python analyze_video.py VIDEO_URL_OR_ID [--out DIR]
"""
import argparse
import json
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    sys.exit("install yt-dlp:  pip install -r requirements.txt")


# Category taxonomy used for observations
CATEGORIES = [
    "environment", "gameplay", "horror", "camera", "pacing",
    "lighting", "sound", "navigation", "interaction", "story",
]

_TEMPLATE = {
    "id": None,
    "title": None,
    "channel": None,
    "duration": None,
    "design_principles": {
        "environment": [],
        "gameplay": [],
        "horror": [],
        "camera": [],
        "pacing": [],
        "lighting": [],
        "sound": [],
        "navigation": [],
        "interaction": [],
        "story": [],
    },
    "notes": "Auto-generated skeleton. Fill observations per category after "
             "viewing/transcript review. Each observation: what we can learn, "
             "not what was said verbatim.",
}


def analyze(video, out: Path):
    with yt_dlp.YoutubeDL({"skip_download": True, "quiet": True, "no_warnings": True}) as ydl:
        info = ydl.extract_info(video, download=False)
    doc = dict(_TEMPLATE)
    doc["id"] = info.get("id")
    doc["title"] = info.get("title")
    doc["channel"] = info.get("channel")
    doc["duration"] = info.get("duration")
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"{info.get('id')}.json"
    dest.write_text(json.dumps(doc, indent=2))
    print(f"wrote {dest}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="research/video_analysis")
    args = ap.parse_args()
    analyze(args.video, Path(args.out))


if __name__ == "__main__":
    main()
