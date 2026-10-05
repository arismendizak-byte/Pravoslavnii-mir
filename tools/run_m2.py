#!/usr/bin/env python3
"""Lean project build/release runner.

Historical filename is kept for Termux/backward compatibility. The old matrix of
per-milestone checkers/tests, proof caches, cold/deep modes and nested orchestration
was removed in v1.17. This runner does one canonical rebuild and then two compact
checks: structural/data integrity and JS runtime smoke.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
MIN_PYTHON = (3, 10)
BUILD_DEPENDENCIES = {
    "jsonschema": "jsonschema",
    "referencing": "referencing",
}

BUILD_STEPS = [
    ("M2 import", [PYTHON, "tools/import_places.py"]),
    ("M2 dedupe", [PYTHON, "tools/dedupe_places.py"]),
    ("M2 indexes", [PYTHON, "tools/build_indexes.py"]),
    ("M3 legacy report", [PYTHON, "tools/build_m35_spb_report.py"]),
    ("M4 verified graph sources", [PYTHON, "tools/import_graph_sources.py"]),
    ("M4 graph", [PYTHON, "tools/build_graph.py"]),
    ("M5 content", [PYTHON, "tools/build_content.py"]),
    ("M5 liturgical", [PYTHON, "tools/build_liturgical.py"]),
    ("M5 food", [PYTHON, "tools/build_food.py"]),
    ("M5 events", [PYTHON, "tools/build_events.py"]),
    ("M5 pilgrim infrastructure", [PYTHON, "tools/build_pilgrim.py"]),
    ("M5 news", [PYTHON, "tools/build_news.py"]),
    ("M5 library/media", [PYTHON, "tools/build_library.py"]),
]


def run(label: str, cmd: list[str], timeout: int = 120, env: dict[str, str] | None = None) -> None:
    started = time.perf_counter()
    print(f"START {label}", flush=True)
    proc = subprocess.run(cmd, cwd=ROOT, timeout=timeout, env=env)
    elapsed = time.perf_counter() - started
    if proc.returncode:
        print(f"FAIL  {label} ({elapsed:.2f}s)", flush=True)
        raise SystemExit(proc.returncode)
    print(f"OK    {label} ({elapsed:.2f}s)", flush=True)



def clean_python_junk() -> None:
    for path in ROOT.rglob("__pycache__"):
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
    for path in ROOT.rglob("*.pyc"):
        try:
            path.unlink()
        except FileNotFoundError:
            pass


def preflight(*, require_build: bool, require_runtime: bool) -> str | None:
    if sys.version_info < MIN_PYTHON:
        return f"Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ required; current: {sys.version.split()[0]}"
    if require_build:
        missing = [package for module, package in BUILD_DEPENDENCIES.items() if importlib.util.find_spec(module) is None]
        if missing:
            return "missing build dependencies: " + ", ".join(missing) + ". Install: python -m pip install -r requirements.txt"
    if require_runtime and not shutil.which("node"):
        return "Node.js is required for runtime verification; install Node.js and retry"
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Pravmir lean build/release runner")
    parser.add_argument("--verify-only", action="store_true", help="Skip rebuild and only run compact verification")
    parser.add_argument("--build-only", action="store_true", help="Rebuild generated data without verification")
    args = parser.parse_args()
    if args.verify_only and args.build_only:
        parser.error("--verify-only and --build-only are mutually exclusive")

    total = time.perf_counter()
    clean_python_junk()
    problem = preflight(require_build=not args.verify_only, require_runtime=not args.build_only)
    if problem:
        print("PREFLIGHT ERROR:", problem, file=sys.stderr)
        return 2

    child_env = dict(os.environ)
    child_env["PYTHONDONTWRITEBYTECODE"] = "1"
    try:
        if not args.verify_only:
            for label, cmd in BUILD_STEPS:
                run(label, cmd, env=child_env)
        if not args.build_only:
            clean_python_junk()
            verify_env = dict(child_env)
            # A rebuild intentionally changes generated files before the release
            # manifest is refreshed. Verify-only is the strict final ZIP gate.
            if not args.verify_only:
                verify_env["PRAVMIR_SKIP_CHECKSUMS"] = "1"
            run("project integrity", [PYTHON, "tools/check_project.py"], env=verify_env)
            run("backend/API smoke", [PYTHON, "tools/check_backend.py"], timeout=60, env=child_env)
            run("runtime smoke", [shutil.which("node") or "node", "tools/check_runtime.js"], timeout=60, env=child_env)
        print(f"DONE  total={time.perf_counter()-total:.2f}s")
        return 0
    finally:
        clean_python_junk()


if __name__ == "__main__":
    raise SystemExit(main())
