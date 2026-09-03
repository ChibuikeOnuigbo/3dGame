#!/usr/bin/env python3
"""Extract captions/transcript (prefer manual subs, fall back to auto-captions)
as .vtt/.srt + a plain-text transcript, for design-principle analysis.

Usage:  python extract_transcript.py VIDEO_URL_OR_ID [--out DIR]
"""
import argparse
import sys
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    sys.exit("install yt-dlp:  pip install -r requirements.txt")


def get(video, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-orig", "en-US", "en-GB"],
        "subtitlesformat": "vtt/srt/best",
        "outtmpl": str(out / "%(id)s.%(ext)s"),
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.extract_info(video, download=True)
    print(f"captions written to {out}")
    for p in sorted(out.iterdir()):
        print(" -", p.name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="research/transcripts")
    args = ap.parse_args()
    get(args.video, Path(args.out))


if __name__ == "__main__":
    main()
