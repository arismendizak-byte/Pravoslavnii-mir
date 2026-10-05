#!/usr/bin/env python3
from __future__ import annotations

from typing import Any, Iterable

EXTRA_FLAG_PENALTIES = {
    "region_conflict": 3,
    "region_ambiguous": 3,
    "source_identity_conflict": 15,
}


def compute_quality(
    place: dict[str, Any],
    *,
    possible_duplicate: bool = False,
    extra_flags: Iterable[str] = (),
) -> dict[str, Any]:
    """Compute deterministic quality score/flags for a normalized place record."""
    score = 100
    flags: list[str] = []

    def add(flag: str, penalty: int) -> None:
        nonlocal score
        if flag not in flags:
            flags.append(flag)
            score -= penalty

    location = place.get("location") or {}
    address = place.get("address") or {}
    descriptions = place.get("descriptions") or {}

    if location.get("lat") is None or location.get("lon") is None:
        add("coordinates_missing", 20)
    if not str(address.get("formatted") or "").strip():
        add("address_incomplete", 15)
    if not str(descriptions.get("short") or "").strip():
        add("description_missing", 5)
    if not place.get("dedications"):
        add("dedications_missing", 3)
    if place.get("place_type") == "unknown":
        add("type_unmapped", 8)
    if place.get("status") == "unknown":
        add("status_unmapped", 5)

    sources = place.get("source_records") or []
    if sources and not any((src or {}).get("source_url") for src in sources):
        add("source_url_missing", 2)
    if possible_duplicate:
        add("possible_duplicate", 10)

    for flag in sorted(set(str(x) for x in extra_flags if str(x).strip())):
        add(flag, EXTRA_FLAG_PENALTIES.get(flag, 0))

    return {"score": max(0, score), "flags": sorted(flags)}
