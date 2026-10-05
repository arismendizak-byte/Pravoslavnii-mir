#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import json
import re
import sys
from typing import Any

ID_RE = re.compile(r"^pm-[0-9a-f]{32}$")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PROVIDER_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")

PLACE_TYPES = {
    "church", "cathedral", "chapel", "monastery", "skete",
    "metochion", "bell_tower", "holy_spring", "memorial",
    "other", "unknown",
}
STATUSES = {
    "active", "preserved", "inactive", "ruined", "lost",
    "under_construction", "restoring", "unknown",
}
PRECISIONS = {"exact", "approximate", "locality", "unknown"}

REQUIRED = {
    "schema_version", "id", "slug", "name", "place_type", "status",
    "address", "location", "source_records", "quality",
}

def _err(errors: list[str], prefix: str, message: str) -> None:
    errors.append(f"{prefix}: {message}")

def validate_place(place: Any, prefix: str = "place") -> list[str]:
    errors: list[str] = []

    if not isinstance(place, dict):
        return [f"{prefix}: expected object"]

    missing = sorted(REQUIRED - set(place))
    if missing:
        _err(errors, prefix, "missing required fields: " + ", ".join(missing))
        return errors

    if place.get("schema_version") != "1.0.0":
        _err(errors, prefix, "schema_version must be 1.0.0")

    item_id = place.get("id")
    if not isinstance(item_id, str) or not ID_RE.fullmatch(item_id):
        _err(errors, prefix, "invalid id")

    slug = place.get("slug")
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        _err(errors, prefix, "invalid slug")
    elif not 3 <= len(slug) <= 160:
        _err(errors, prefix, "slug length must be 3..160")

    if not isinstance(place.get("name"), str) or not place["name"].strip():
        _err(errors, prefix, "name must be non-empty string")
    elif len(place["name"]) > 500:
        _err(errors, prefix, "name too long")

    if place.get("place_type") not in PLACE_TYPES:
        _err(errors, prefix, f"unknown place_type {place.get('place_type')!r}")

    if place.get("status") not in STATUSES:
        _err(errors, prefix, f"unknown status {place.get('status')!r}")

    address = place.get("address")
    if not isinstance(address, dict):
        _err(errors, prefix, "address must be object")
    else:
        for key in ("country_code", "country", "region", "district", "locality", "formatted"):
            if key not in address:
                _err(errors, prefix, f"address.{key} missing")

    location = place.get("location")
    if not isinstance(location, dict):
        _err(errors, prefix, "location must be object")
    else:
        lat = location.get("lat")
        lon = location.get("lon")
        if (lat is None) != (lon is None):
            _err(errors, prefix, "lat/lon must both be null or both be numbers")
        if lat is not None:
            if not isinstance(lat, (int, float)) or isinstance(lat, bool) or not (-90 <= lat <= 90):
                _err(errors, prefix, "lat out of range")
            if not isinstance(lon, (int, float)) or isinstance(lon, bool) or not (-180 <= lon <= 180):
                _err(errors, prefix, "lon out of range")
        if location.get("precision") not in PRECISIONS:
            _err(errors, prefix, "invalid location.precision")

    sources = place.get("source_records")
    if not isinstance(sources, list) or not sources:
        _err(errors, prefix, "source_records must contain at least one source")
    else:
        for i, src in enumerate(sources):
            sp = f"{prefix}.source_records[{i}]"
            if not isinstance(src, dict):
                _err(errors, sp, "expected object")
                continue
            provider = src.get("provider")
            if not isinstance(provider, str) or not PROVIDER_RE.fullmatch(provider):
                _err(errors, sp, "invalid provider")
            if not isinstance(src.get("imported_at"), str) or not src["imported_at"].strip():
                _err(errors, sp, "imported_at required")
            source_region = src.get("source_region")
            if source_region is not None and not isinstance(source_region, str):
                _err(errors, sp, "source_region must be string or null")
            elif isinstance(source_region, str) and len(source_region) > 300:
                _err(errors, sp, "source_region too long")

    merged_from_ids = place.get("merged_from_ids", [])
    if not isinstance(merged_from_ids, list):
        _err(errors, prefix, "merged_from_ids must be array")
    else:
        seen_merged: set[str] = set()
        for j, merged_id in enumerate(merged_from_ids):
            if not isinstance(merged_id, str) or not ID_RE.fullmatch(merged_id):
                _err(errors, prefix, f"merged_from_ids[{j}] invalid")
            elif merged_id == item_id:
                _err(errors, prefix, "merged_from_ids must not contain canonical id")
            elif merged_id in seen_merged:
                _err(errors, prefix, f"merged_from_ids duplicate {merged_id}")
            seen_merged.add(merged_id)

    quality = place.get("quality")
    if not isinstance(quality, dict):
        _err(errors, prefix, "quality must be object")
    else:
        score = quality.get("score")
        if not isinstance(score, int) or isinstance(score, bool) or not 0 <= score <= 100:
            _err(errors, prefix, "quality.score must be integer 0..100")
        flags = quality.get("flags")
        if not isinstance(flags, list) or any(not isinstance(x, str) for x in flags):
            _err(errors, prefix, "quality.flags must be string array")

    return errors

def validate_payload(payload: Any) -> list[str]:
    places = payload if isinstance(payload, list) else [payload]
    errors: list[str] = []
    ids: set[str] = set()
    slugs: set[str] = set()
    source_owners: dict[tuple[str, str], str] = {}

    for i, place in enumerate(places):
        prefix = f"places[{i}]" if isinstance(payload, list) else "place"
        errors.extend(validate_place(place, prefix))
        if isinstance(place, dict):
            item_id = place.get("id")
            slug = place.get("slug")
            if isinstance(item_id, str):
                if item_id in ids:
                    errors.append(f"{prefix}: duplicate id {item_id}")
                ids.add(item_id)
            if isinstance(slug, str):
                if slug in slugs:
                    errors.append(f"{prefix}: duplicate slug {slug}")
                slugs.add(slug)

            for src in place.get("source_records") or []:
                if not isinstance(src, dict):
                    continue
                provider = src.get("provider")
                source_id = src.get("source_id")
                if isinstance(provider, str) and isinstance(source_id, str) and source_id.strip():
                    identity = (provider, source_id.strip())
                    owner = source_owners.get(identity)
                    if owner is not None and owner != item_id:
                        errors.append(f"{prefix}: source identity {provider}:{source_id} belongs to multiple records")
                    else:
                        source_owners[identity] = item_id

    return errors

def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python tools/validate_places.py <file.json> [more.json ...]")
        return 2

    total_errors = 0
    for name in argv[1:]:
        path = Path(name)
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception as exc:
            print(f"{path}: invalid JSON: {exc}")
            total_errors += 1
            continue

        errors = validate_payload(payload)
        if errors:
            print(f"{path}: FAIL ({len(errors)} errors)")
            for item in errors:
                print(" -", item)
            total_errors += len(errors)
        else:
            print(f"{path}: OK")

    return 1 if total_errors else 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
