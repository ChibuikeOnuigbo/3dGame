#!/usr/bin/env bash
# Reproducibly rebuild the QA toolchain after a sandbox reset.
# - Python venv with playwright + pillow + numpy
# - Playwright Chromium (headless, SwiftShader software GL)
#
# Usage: bash qa/setup_qa_env.sh
set -euo pipefail

VENV="${VENV:-/home/user/venv}"

if [ ! -x "$VENV/bin/python" ]; then
    python3 -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --upgrade pip >/dev/null
"$VENV/bin/python" -m pip install --quiet playwright pillow numpy

if ! "$VENV/bin/python" -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(headless=True, args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); b.close(); p.stop(); print('chromium ok')" 2>/dev/null; then
    echo "Installing Playwright Chromium..."
    "$VENV/bin/python" -m playwright install chromium
fi

echo "QA env ready: $VENV"
"$VENV/bin/python" -c "import playwright, PIL, numpy; print('playwright', playwright.__version__ if hasattr(playwright,'__version__') else 'ok')"
