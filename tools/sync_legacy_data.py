#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "data/spb_temples.json"
MIRROR = ROOT / "catalog/temples_active_spb.json"


def main() -> int:
    if not CANONICAL.exists():
        print(f"Missing canonical source: {CANONICAL}")
        return 1
    MIRROR.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CANONICAL, MIRROR)
    print(f"Synced {MIRROR.relative_to(ROOT)} <- {CANONICAL.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
