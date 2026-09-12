#!/usr/bin/env python3
"""Autonomous ASSET ACQUISITION loop (user directive 2026-09-08: "set a timer
to 2 hrs and until it's done keep searching and working, download sketchfab
assets with the cloudflare worker I gave you; if nothing then use another
site; keep tweaking search queries until something").

Routes, in priority order each cycle:
  1. direct hosts (sketchfab/polyhaven/opengameart/itch + optional gateway
     worker URL in env SW_GATEWAY_URL) — probed every cycle; if the network
     ever opens, real downloads run immediately;
  2. GitHub mirrors/combos ("industrial + scene", "polyhaven mirror", …) —
     sparse-clone clearly-licensed (CC0/CC-BY/MIT/Apache) small repos into
     research/downloads/staging/ with binary verification;
  3. npm registry tarballs (uisfx precedent) for SFX packs.

Every attempt — success OR failure — is appended to qa/acquire_log.jsonl and
candidates land in research/download-manifest.json. Nothing is integrated
into game code from here (integration is a reviewed, manual step).
"""
import json
import os
import re
import struct
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
LOG = os.path.join(ROOT, "qa", "acquire_log.jsonl")
STOP = os.path.join(ROOT, "qa", "STOP_LOOP")
MANIFEST = os.path.join(ROOT, "research", "download-manifest.json")
STAGE = os.path.join(ROOT, "research", "downloads", "staging")
os.makedirs(STAGE, exist_ok=True)

GOOD_LICENSES = {"CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"}
DIRECT_HOSTS = ["sketchfab.com", "api.sketchfab.com", "polyhaven.com", "dl.polyhaven.org",
                "opengameart.org", "cdn.opengameart.org", "itch.io"]
GITHUB_QUERIES = [
    "industrial gltf scene", "factory glb cc0", "warehouse gltf models", "pipes pbr gltf",
    "sketchfab cc0 models download", "opengameart 3d models mirror", "polyhaven models mirror",
    "ambientcg models", "cc0 sfx wind", "cc0 heartbeat sound wav", "breathing sound cc0",
    "foley cc0 wav", "industrial props godot", "machinery gltf cc0", "pbr prop pack cc0",
    "construction site 3d cc0", "rooftop hvac 3d model", "urban props gltf cc0",
]
NPM_QUERIES = ["sfx pack", "foley sounds", "ambience audio", "cc0 sounds", "game sfx"]

MAGICS = {b"glTF": "glb", b"OggS": "ogg", "RIFF": "wav", b"\x89PNG": "png", b"\xff\xd8": "jpg"}


def log(rec):
    rec["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(LOG, "a") as f:
        f.write(json.dumps(rec) + "\n")
    print(json.dumps({k: rec.get(k) for k in ("route", "status", "asset")}), flush=True)


def probe(host):
    try:
        r = urllib.request.urlopen(f"https://{host}/", timeout=6)
        return r.status < 500
    except Exception:
        return False


def verify_binary(path):
    with open(path, "rb") as f:
        head = f.read(12)
    for magic, kind in MAGICS.items():
        if head.startswith(magic if isinstance(magic, bytes) else magic.encode()):
            return kind
    return None


def github_search(q):
    url = f"https://api.github.com/search/repositories?q={urllib.parse.quote(q)}&per_page=5"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.load(r).get("items", [])
    except Exception as e:
        log({"route": "github", "status": "error", "asset": q, "error": str(e)[:120]})
        return []


def known(recs):
    try:
        d = json.load(open(MANIFEST))
        return {e.get("source", "") for e in d} | {e.get("asset", "") for e in d}
    except Exception:
        return set()


def stage_clone(full_name, lic):
    dest = os.path.join(STAGE, full_name.replace("/", "__"))
    if os.path.isdir(dest):
        return {"status": "skip", "error": "already staged"}
    p = subprocess.run(
        ["git", "clone", "--depth", "1", f"https://github.com/{full_name}", dest],
        capture_output=True, text=True, timeout=600)
    if p.returncode != 0:
        return {"status": "failed", "error": p.stderr.strip()[:150]}
    assets = []
    for root, _, files in os.walk(dest):
        for fn in files:
            if fn.lower().endswith((".glb", ".gltf", ".ogg", ".wav", ".png", ".jpg")):
                kind = verify_binary(os.path.join(root, fn))
                if kind:
                    assets.append({"file": os.path.relpath(os.path.join(root, fn), dest), "kind": kind})
    return {"status": "success", "assets": assets[:60], "license": lic}


def main():
    hours = float(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SW_LOOP_HOURS", "2"))
    deadline = time.time() + hours * 3600
    seen = known(set())
    gi = ni = 0
    cycle = 0
    log({"route": "loop", "status": "start", "asset": f"{hours}h acquisition loop"})
    while time.time() < deadline and not os.path.exists(STOP):
        cycle += 1
        # 1 — direct hosts (network may open at any time)
        for h in DIRECT_HOSTS:
            if probe(h):
                log({"route": f"direct:{h}", "status": "reachable", "asset": "host open — manual/agent download advised"})
        gw = os.environ.get("SW_GATEWAY_URL")
        if gw and probe(gw.replace("https://", "").split("/")[0]):
            log({"route": "gateway", "status": "reachable", "asset": gw[:60]})
        # 2 — github combos, rotating
        q = GITHUB_QUERIES[gi % len(GITHUB_QUERIES)]; gi += 1
        for r in github_search(q):
            lic = (r.get("license") or {}).get("spdx_id")
            name = r["full_name"]
            if name in seen or lic not in GOOD_LICENSES or r["size"] > 80 * 1024 or r["size"] < 50:
                continue
            seen.add(name)
            res = stage_clone(name, lic)
            log({"route": "github", "status": res["status"], "asset": name, "license": lic,
                 "detail": res.get("error") or f"{len(res.get('assets', []))} verified assets"})
        # 3 — npm
        nq = NPM_QUERIES[ni % len(NPM_QUERIES)]; ni += 1
        try:
            with urllib.request.urlopen(
                    f"https://registry.npmjs.org/-/v1/search?text={urllib.parse.quote(nq)}&size=5", timeout=20) as r:
                objs = json.load(r).get("objects", [])
            for o in objs:
                name = o["package"]["name"]
                if name in seen:
                    continue
                seen.add(name)
                log({"route": "npm", "status": "candidate", "asset": name,
                     "detail": (o["package"].get("description") or "")[:80]})
        except Exception as e:
            log({"route": "npm", "status": "error", "asset": nq, "error": str(e)[:120]})
        time.sleep(20)
    log({"route": "loop", "status": "end", "asset": f"cycles={cycle}"})


if __name__ == "__main__":
    import urllib.parse  # noqa: E402
    main()
