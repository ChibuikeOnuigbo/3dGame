"""Shared helpers for Playwright QA runs against the game.

Chromium comes from the @sparticuz/chromium npm package because the
official Playwright browser CDN is not reachable from this sandbox.
WebGL works via SwiftShader (verified: ANGLE Vulkan SwiftShader renderer).
"""
import os
import sys

from playwright.sync_api import sync_playwright

CHROME = "/tmp/chromium"
LIBS = "/tmp/al2023/lib"
ARGS = [
    "--no-sandbox",
    "--disable-gpu",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
]


def launch(headless: bool = True):
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = LIBS
    pw = sync_playwright().start()
    browser = pw.chromium.launch(
        executable_path=CHROME, headless=headless, env=env, args=ARGS
    )
    return pw, browser


def stderr(*msg):
    print(*msg, file=sys.stderr, flush=True)
