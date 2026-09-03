#!/usr/bin/env python3
"""Orchestrator: run the full metadata -> transcript -> frames -> analysis
pipeline for one reference video. De-duplicates repeated URLs (same ID).

Usage:  python fetch_video.py VIDEO_URL_OR_ID [--out research/]
"""
import argparse
import json
import sys
from pathlib import Path

import extract_metadata as m
import extract_transcript as t
import extract_frames as f
import analyze_video as a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="research")
    args = ap.parse_args()
    root = Path(args.out)
    vid = args.video
    m.get(vid, root / "video_metadata")
    t.get(vid, root / "transcripts")
    try:
        f.grab(vid, root / "video_frames" / vid.split("=")[-1].split("/")[-1].split("&")[0], 12)
    except Exception as e:  # frames are optional
        print(f"(frames skipped: {e})")
    a.analyze(vid, root / "video_analysis")
    print("done")


if __name__ == "__main__":
    main()
