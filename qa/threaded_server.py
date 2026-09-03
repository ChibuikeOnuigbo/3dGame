#!/usr/bin/env python3
"""Threaded static server for the game preview + QA (faster than http.server
for the ~150 concurrent GLB/texture requests Chromium issues)."""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "game")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8081


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):  # keep logs quiet
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
