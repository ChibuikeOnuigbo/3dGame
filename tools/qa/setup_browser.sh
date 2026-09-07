#!/usr/bin/env bash
# Bootstrap a Playwright-compatible Chromium in the sandbox.
# Official Playwright CDN is network-blocked here, so we use the
# @sparticuz/chromium npm package, which ships the Chromium binary inside
# the npm tarball (registry.npmjs.org is reachable).
# Extracted to /tmp (regenerable) with bundled shared libs in /tmp/al2023/lib.
# NOTE: @sparticuz/chromium >= 149 is ESM-only, so we use dynamic import().
set -e
BOOT=/home/user/.qa_bootstrap
mkdir -p "$BOOT"
cd "$BOOT"
if [ ! -d node_modules/@sparticuz/chromium ]; then
  [ -f package.json ] || echo '{"name":"qa-bootstrap","private":true}' > package.json
  npm i @sparticuz/chromium --no-audit --no-fund >/dev/null 2>&1
fi
if [ ! -x /tmp/chromium ]; then
  node --input-type=module -e "
    const m = await import('$BOOT/node_modules/@sparticuz/chromium/build/index.js');
    const c = m.default || m;
    const p = await c.executablePath();
    console.log('chromium:', p);
  "
fi
if [ ! -d /tmp/al2023/lib ]; then
  node -e "
    const zlib=require('zlib'),fs=require('fs');
    const c=fs.readFileSync('$BOOT/node_modules/@sparticuz/chromium/bin/al2023.tar.br');
    fs.writeFileSync('/tmp/al2023.tar', zlib.brotliDecompressSync(c));
  "
  mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023
fi
if [ ! -d /tmp/swiftshader ]; then
  node -e "
    const zlib=require('zlib'),fs=require('fs');
    const c=fs.readFileSync('$BOOT/node_modules/@sparticuz/chromium/bin/swiftshader.tar.br');
    fs.writeFileSync('/tmp/swiftshader.tar', zlib.brotliDecompressSync(c));
  "
  mkdir -p /tmp/swiftshader && tar -xf /tmp/swiftshader.tar -C /tmp/swiftshader
fi
echo "READY chromium=/tmp/chromium libs=/tmp/al2023/lib"
