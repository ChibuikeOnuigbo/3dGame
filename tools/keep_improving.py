#!/usr/bin/env python3
"""Autonomous improvement loop (user directive 2026-09-07: "set a timer to
3 hours and keep working/improving until I stop it").

This harness does NOT invent code edits on its own — it keeps the evidence
and verification loop hot for the whole window:

  * every cycle: world audit (verify_world), ghost/probe scan, surroundings
    screenshots + OpenCV extraction (the "black wall" detector),
  * every 3rd cycle: the full 40-check critical-path playthrough,
  * metrics appended to qa/improvement_log.jsonl; drift (new FAILs or a
    resurfaced black-wall flag) is highlighted in the per-cycle summary,
  * a hard timer (default 3 h, env SW_LOOP_HOURS or argv[1]) stops the loop;
    the user can also touch qa/STOP_LOOP to end it early.

Run:  .venv/bin/python tools/keep_improving.py [hours]
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
QA = os.path.join(ROOT, "tools", "qa")
VENV = os.path.join(ROOT, ".venv", "bin", "python")
URL = "http://127.0.0.1:5173/index.html"
LOG = os.path.join(ROOT, "qa", "improvement_log.jsonl")
STOP = os.path.join(ROOT, "qa", "STOP_LOOP")

env = dict(os.environ)
env["LD_LIBRARY_PATH"] = "/tmp/al2023/lib"


def run(script, extra=()):
    try:
        p = subprocess.run([VENV, os.path.join(QA, script), URL, *extra],
                           capture_output=True, text=True, timeout=1500, env=env, cwd=ROOT)
        return p.stdout + p.stderr
    except Exception as e:  # noqa: BLE001
        return f"EXC {e}"


def metrics(out):
    m = {}
    for line in out.splitlines():
        if "VERIFY WORLD" in line:
            m["verify"] = line.split("PASSED")[0].strip().split(":")[-1].strip()
        if "CRITICAL PATH" in line:
            m["critical"] = line.split("PASSED")[0].strip().split(":")[-1].strip()
    return m


def main():
    hours = float(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SW_LOOP_HOURS", "3"))
    deadline = time.time() + hours * 3600
    cycle = 0
    print(f"[loop] running for {hours}h until {time.ctime(deadline)}", flush=True)
    prev = {}
    while time.time() < deadline:
        if os.path.exists(STOP):
            print("[loop] STOP file present — ending early", flush=True)
            break
        cycle += 1
        rec = {"cycle": cycle, "t": time.ctime(), "metrics": {}}
        out = run("verify_world.py")
        rec["metrics"].update(metrics(out))
        out = run("scan_ghosts.py")
        try:
            g = json.load(open(os.path.join(ROOT, "qa", "ghost_scan.json")))
            rec["metrics"]["open_cells"] = len(g["probe"]["openCells"])
            rec["metrics"]["invisible_walls"] = len(g["probe"]["invisible"])
        except Exception:  # noqa: BLE001
            pass
        run("shoot_surroundings.py")
        out = run("opencv_analyze.py")
        flags = "NONE"
        for line in out.splitlines():
            if line.startswith("black-wall-flagged"):
                flags = line.split(":", 1)[1].strip()
        rec["metrics"]["black_wall_flags"] = flags
        if cycle % 3 == 0:
            out = run("critical_path.py")
            rec["metrics"].update(metrics(out))
        drift = {k: v for k, v in rec["metrics"].items() if prev.get(k) not in (None, v)}
        rec["drift"] = drift
        prev = rec["metrics"]
        with open(LOG, "a") as f:
            f.write(json.dumps(rec) + "\n")
        print(f"[loop] cycle {cycle}: {rec['metrics']} drift={drift}", flush=True)
        # pace: ~1 cycle per 7 minutes
        time.sleep(max(5, min(240, deadline - time.time() - 1, 60)))
    print("[loop] deadline reached — loop finished", flush=True)


if __name__ == "__main__":
    main()
