#!/usr/bin/env python3
"""Asset/video acquisition pipeline (directive 2026-09-07).

Order per target: DIRECT request -> GATEWAY request. Every attempt is
diagnosed (DNS / TCP / TLS / HTTP status / Content-Type / size / magic
bytes) and logged to research/download-manifest.json (successes) and
research/download-errors.json (failures). Never saves HTML as a model or
video: magic-byte validation per expected kind.
"""
import json
import os
import socket
import ssl
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MANIFEST = os.path.join(ROOT, "research", "download-manifest.json")
ERRORS = os.path.join(ROOT, "research", "download-errors.json")
GATEWAY = "https://arena-asset-gateway.onuigbochibuike15.workers.dev/?url="

MAGIC = {
    "glb": lambda b: b[:4] == b"glTF",
    "zip": lambda b: b[:2] == b"PK",
    "mp4": lambda b: b[4:8] == b"ftyp",
    "wav": lambda b: b[:4] == b"RIFF",
    "jpg": lambda b: b[:3] == b"\xff\xd8\xff",
    "png": lambda b: b[:8] == b"\x89PNG\r\n\x1a\n",
    "flac": lambda b: b[:4] == b"fLaC",
}


def _load(p):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return []


def _save(p, data):
    with open(p, "w") as f:
        json.dump(data, f, indent=1)


def diagnose_host(url):
    host = urllib.parse.urlparse(url).hostname
    out = {"host": host}
    try:
        out["dns"] = socket.gethostbyname(host)
    except Exception as e:  # noqa: BLE001
        out["dns"] = f"FAIL {type(e).__name__}"
        return out
    try:
        t = time.time()
        socket.create_connection((host, 443), timeout=6).close()
        out["tcp443"] = f"ok {(time.time() - t) * 1000:.0f}ms"
    except Exception as e:  # noqa: BLE001
        out["tcp443"] = f"FAIL {type(e).__name__}"
        return out
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=8) as raw:
            with ctx.wrap_socket(raw, server_hostname=host) as s:
                out["tls"] = f"ok {s.version()}"
    except Exception as e:  # noqa: BLE001
        out["tls"] = f"FAIL {type(e).__name__}: {e}"
    return out


def fetch(url, timeout=25):
    """Return (status, content_type, bytes, error)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "still-water-research/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
            data = r.read(200_000_000)
            return r.status, r.headers.get("Content-Type", "?"), data, None
    except Exception as e:  # noqa: BLE001
        return None, None, b"", f"{type(e).__name__}: {e}"


def attempt(target):
    """target: dict(kind, source, source_url, expect, local_path, extra)."""
    entry = {"type": target["kind"], "source": target["source"],
             "source_url": target["source_url"], "retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
             **target.get("extra", {})}
    errs = {"source": target["source"], "url": target["source_url"],
            "direct": diagnose_host(target["source_url"]), "attempts": []}
    for method, url in (("direct", target["source_url"]),
                        ("gateway", GATEWAY + urllib.parse.quote(target["source_url"], safe=""))):
        status, ctype, data, err = fetch(url)
        rec = {"method": method, "status": status, "content_type": ctype,
               "bytes": len(data), "error": err}
        ok = status == 200 and data and not err
        if ok:
            check = MAGIC.get(target["expect"])
            if check and not check(data[:16]):
                rec["validation"] = f"FAILED magic bytes {data[:8]!r} != {target['expect']}"
                ok = False
            elif ctype and "text/html" in ctype and target["expect"] not in ("html",):
                rec["validation"] = "FAILED content-type text/html for binary kind"
                ok = False
            else:
                rec["validation"] = "ok"
        errs["attempts"].append(rec)
        if ok:
            os.makedirs(os.path.dirname(target["local_path"]), exist_ok=True)
            with open(target["local_path"], "wb") as f:
                f.write(data)
            entry.update({"status": "success", "method": method,
                          "local_path": os.path.relpath(target["local_path"], ROOT),
                          "size_bytes": len(data),
                          "license_or_permission": target.get("license", "see extra")})
            return entry, None
    entry.update({"status": "failed", "error": errs["attempts"][-1].get("error")})
    errs["next_recommended"] = ("ask user to restore egress / provide proxy" if
                                all("SSL" in (a.get("error") or "") or a.get("error") for a in errs["attempts"])
                                else "retry with provider API/auth")
    return entry, errs


def main():
    T = []
    # Poly Haven CC0 (Rob Tuytel) — 1k jpgs, small, ideal for web
    ph = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_02/concrete_floor_02_{m}_1k.jpg"
    for m, slot in (("diff", "Color"), ("nor_gl", "NormalGL"), ("rough", "Roughness")):
        T.append({"kind": "texture", "source": "PolyHaven", "expect": "jpg",
                  "source_url": ph.format(m=m),
                  "local_path": os.path.join(ROOT, "research/assets/textures/ConcreteFloor02PH", f"{slot}.jpg"),
                  "license": "CC0 (Poly Haven)",
                  "extra": {"asset": "concrete_floor_02", "author": "Rob Tuytel", "map": slot}})
    # OpenGameArt CC0 jump/landing (Dan Knoflicek)
    for i in (1, 2, 3):
        T.append({"kind": "audio", "source": "OpenGameArt", "expect": "wav",
                  "source_url": f"https://opengameart.org/sites/default/files/Jump%20{i}.wav",
                  "local_path": os.path.join(ROOT, "research/assets/audio", f"oga_jump_{i}.wav"),
                  "license": "CC0", "extra": {"title": "Jump Landing", "author": "Dan Knoflicek"}})
    # Sketchfab download API, anonymous (expected: 401 — download needs auth)
    for mid, name in (("804fbe0cd1fa44fa9ca86ae42c82d63d", "simple-factory-scene"),
                      ("4b3cc287c76c4ede92c433f9d19c1006", "small-industrial-scene")):
        T.append({"kind": "3d-model", "source": "Sketchfab", "expect": "zip",
                  "source_url": f"https://api.sketchfab.com/v3/models/{mid}/download",
                  "local_path": os.path.join(ROOT, "research/assets/models", f"{name}.zip"),
                  "license": "CC-BY-4.0 per model page", "extra": {"model_id": mid, "model_name": name}})
    # itch free-tier download pages (expected: login/purchase wall)
    T.append({"kind": "3d-model", "source": "itch.io", "expect": "zip",
              "source_url": "https://godgoldfear.itch.io/psx-industrial-environment-asset-pack/purchase",
              "local_path": os.path.join(ROOT, "research/assets/models", "psx-industrial.zip"),
              "license": "CC-BY-4.0", "extra": {"author": "godgoldfear"}})

    manifest, errors = _load(MANIFEST), _load(ERRORS)
    for t in T:
        entry, err = attempt(t)
        manifest.append(entry)
        if err:
            errors.append(err)
        print(entry["status"], entry["source"], entry["source_url"][:80])
    _save(MANIFEST, manifest)
    _save(ERRORS, errors)
    print(f"manifest={len(manifest)} errors={len(errors)}")


if __name__ == "__main__":
    main()
