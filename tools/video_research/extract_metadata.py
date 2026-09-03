#!/usr/bin/env python3
"""Extract video metadata (title, channel, duration, thumbnails, formats,
captions list) for the research references. Uses yt-dlp.

Usage:  python extract_metadata.py VIDEO_URL_OR_ID [--out DIR]
"""
import argparse
import json
import sys
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    sys.exit("install yt-dlp:  pip install -r requirements.txt")


def get(video, out: Path):
    opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "writethumbnail": False,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(video, download=False)

    keep = {
        "id": info.get("id"),
        "title": info.get("title"),
        "channel": info.get("channel"),
        "channel_url": info.get("channel_url"),
        "uploader": info.get("uploader"),
        "duration": info.get("duration"),
        "view_count": info.get("view_count"),
        "upload_date": info.get("upload_date"),
        "thumbnail": info.get("thumbnail"),
        "categories": info.get("categories"),
        "tags": info.get("tags", [])[:30],
        "subtitles": {k: [s.get("name") for s in v] for k, v in (info.get("subtitles") or {}).items()},
        "automatic_captions": {k: [s.get("name") for s in v] for k, v in (info.get("automatic_captions") or {}).items()},
        "formats": [
            {"id": f.get("format_id"), "ext": f.get("ext"), "resolution": f.get("resolution"),
             "vcodec": f.get("vcodec"), "acodec": f.get("acodec")}
            for f in info.get("formats", []) if f.get("height") or f.get("vcodec") != "none"
        ][:20],
    }
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"{info.get('id')}.json"
    dest.write_text(json.dumps(keep, indent=2))
    print(f"wrote {dest}")
    return keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="research/video_metadata")
    args = ap.parse_args()
    get(args.video, Path(args.out))


if __name__ == "__main__":
    main()
