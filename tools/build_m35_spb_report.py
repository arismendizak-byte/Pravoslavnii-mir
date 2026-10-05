#!/usr/bin/env python3
from __future__ import annotations

from collections import Counter, defaultdict
from difflib import SequenceMatcher
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
import hashlib
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
PROVIDER = "pravmir-legacy-spb"
SOURCE_FILE = "data/spb_temples.json"
RUNTIME_PREFIX = "legacy-spb-"


def read_json(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8-sig"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def norm(value) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я]+", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def haversine_m(a: dict, b: dict) -> float | None:
    try:
        lat1, lon1 = float(a.get("lat")), float(a.get("lon"))
        lat2, lon2 = float(b.get("lat")), float(b.get("lon"))
    except (TypeError, ValueError):
        return None
    r = 6_371_008.8
    p1, p2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    h = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlambda / 2) ** 2
    return 2 * r * asin(sqrt(h))


def source_records(place: dict) -> list[dict]:
    return [src for src in (place.get("source_records") or []) if (src or {}).get("provider") == PROVIDER]


def cross_canonical_candidates(spb_places: list[dict], other_places: list[dict]) -> list[dict]:
    # Global, region-independent audit. Dedupe remains conservative, but M3.5 explicitly checks
    # migrated SPB against every pre-existing canonical record for suspicious near matches.
    cell = 0.01
    grid: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for place in other_places:
        loc = place.get("location") or {}
        try:
            lat, lon = float(loc.get("lat")), float(loc.get("lon"))
        except (TypeError, ValueError):
            continue
        grid[(int(lat // cell), int(lon // cell))].append(place)

    out: list[dict] = []
    for place in spb_places:
        loc = place.get("location") or {}
        try:
            lat, lon = float(loc.get("lat")), float(loc.get("lon"))
        except (TypeError, ValueError):
            continue
        gy, gx = int(lat // cell), int(lon // cell)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for other in grid.get((gy + dy, gx + dx), []):
                    distance = haversine_m(loc, other.get("location") or {})
                    if distance is None or distance > 500:
                        continue
                    left_name, right_name = norm(place.get("name")), norm(other.get("name"))
                    name_similarity = SequenceMatcher(None, left_name, right_name).ratio() if left_name and right_name else 0.0
                    left_addr = norm((place.get("address") or {}).get("formatted"))
                    right_addr = norm((other.get("address") or {}).get("formatted"))
                    address_similarity = SequenceMatcher(None, left_addr, right_addr).ratio() if left_addr and right_addr else 0.0
                    if left_name == right_name or name_similarity >= 0.92 or (address_similarity >= 0.94 and name_similarity >= 0.80):
                        out.append({
                            "spb_id": place.get("id"),
                            "canonical_id": other.get("id"),
                            "distance_m": round(distance, 2),
                            "name_similarity": round(name_similarity, 4),
                            "address_similarity": round(address_similarity, 4),
                        })
    return sorted(out, key=lambda x: (x["spb_id"], x["canonical_id"]))


def curated_page_audit(canonical: list[dict]) -> list[dict]:
    curated = read_json("data/catalog.json")
    by_name: dict[str, list[dict]] = defaultdict(list)
    for place in canonical:
        by_name[norm(place.get("name"))].append(place)

    category_type = {"храм": "church", "собор": "cathedral", "часовня": "chapel", "монастырь": "monastery"}
    rows = []
    for item in curated:
        detail = str(item.get("link") or "").replace("../", "")
        target = ROOT / detail if detail else None
        match = None
        matches = by_name.get(norm(item.get("name"))) or []
        if len(matches) == 1:
            match = matches[0]
        elif len(matches) > 1:
            point = {"lat": item.get("lat"), "lon": item.get("lon")}
            match = min(matches, key=lambda p: haversine_m(point, p.get("location") or {}) or 10**12)
        if match is None:
            ptype = category_type.get(norm(item.get("category")))
            if ptype and item.get("lat") is not None and item.get("lon") is not None:
                point = {"lat": item.get("lat"), "lon": item.get("lon")}
                nearby = []
                for place in canonical:
                    if place.get("place_type") != ptype:
                        continue
                    distance = haversine_m(point, place.get("location") or {})
                    if distance is not None and distance <= 150:
                        nearby.append((distance, place))
                if nearby:
                    match = min(nearby, key=lambda x: x[0])[1]
        rows.append({
            "name": item.get("name"),
            "detail_path": detail or None,
            "page_exists": bool(target and target.is_file()),
            "canonical_match_id": match.get("id") if match else None,
        })

    universal = ROOT / "objects/place.html"
    rows.append({
        "name": "universal-place-page",
        "detail_path": "objects/place.html",
        "page_exists": universal.is_file(),
        "canonical_match_id": None,
    })
    return rows


def build_report() -> dict:
    legacy = read_json(SOURCE_FILE)
    canonical = read_json("data/generated/places_deduped.json")
    runtime_aliases = read_json("data/generated/runtime_id_aliases.json")
    review = read_json("data/generated/review_candidates.json")
    snapshot = read_json("data/schema/legacy_source_snapshot.json")

    spb_places = [place for place in canonical if source_records(place)]
    other_places = [place for place in canonical if not source_records(place)]
    canonical_by_id = {str(place.get("id")): place for place in canonical}

    source_to_canonical: dict[str, str] = {}
    source_records_preserved = 0
    internal_groups = []
    cross_provider_merges = []
    for place in spb_places:
        srcs = source_records(place)
        source_records_preserved += len(srcs)
        for src in srcs:
            if src.get("source_id") is not None:
                source_to_canonical[str(src["source_id"])] = str(place["id"])
        if len(srcs) > 1:
            internal_groups.append({
                "canonical_id": place["id"],
                "legacy_source_ids": sorted(str(src.get("source_id")) for src in srcs),
            })
        providers = sorted({str(src.get("provider")) for src in place.get("source_records") or []})
        if len(providers) > 1:
            cross_provider_merges.append({"canonical_id": place["id"], "providers": providers})

    spb_ids = {str(place["id"]) for place in spb_places}
    spb_review = [item for item in review if str(item.get("left_id")) in spb_ids or str(item.get("right_id")) in spb_ids]
    alias_targets_valid = all(str(target) in canonical_by_id for target in runtime_aliases.values())
    source_alias_coverage = all(runtime_aliases.get(RUNTIME_PREFIX + str(row.get("id"))) == source_to_canonical.get(str(row.get("id"))) for row in legacy)

    data_layer = (ROOT / "js/data-layer.js").read_text(encoding="utf-8")
    mirror = ROOT / "catalog/temples_active_spb.json"
    source = ROOT / SOURCE_FILE
    cross_candidates = cross_canonical_candidates(spb_places, other_places)

    return {
        "schema_version": "1.0.0",
        "stage": "M3.5",
        "source": {
            "provider": PROVIDER,
            "file": SOURCE_FILE,
            "snapshot_at": snapshot.get("snapshot_at"),
            "sha256": sha256(source),
            "size": source.stat().st_size,
            "records": len(legacy),
            "unique_source_ids": len({str(row.get("id")) for row in legacy}),
            "external_upstream_provenance": "not_present_in_legacy_dataset",
        },
        "migration": {
            "canonical_records_with_spb_source": len(spb_places),
            "legacy_source_records_preserved": source_records_preserved,
            "runtime_aliases": len(runtime_aliases),
            "runtime_alias_targets_valid": alias_targets_valid,
            "source_to_alias_coverage_complete": source_alias_coverage,
            "internal_auto_merge_groups": internal_groups,
            "cross_provider_auto_merges": cross_provider_merges,
            "cross_canonical_suspicious_candidates": cross_candidates,
            "review_candidates_involving_spb": spb_review,
            "region_counts": dict(sorted(Counter((place.get("address") or {}).get("region") for place in spb_places).items())),
            "type_counts": dict(sorted(Counter(place.get("place_type") for place in spb_places).items())),
            "status_counts": dict(sorted(Counter(place.get("status") for place in spb_places).items())),
        },
        "compatibility": {
            "runtime_dependency_on_spb_source_removed": "spb_temples.json" not in data_layer and "legacySpbDoc" not in data_layer,
            "legacy_source_archive_retained": source.is_file(),
            "compatibility_mirror_retained": mirror.is_file(),
            "mirror_matches_source": mirror.is_file() and sha256(mirror) == sha256(source),
        },
        "curated_pages": curated_page_audit(canonical),
    }


def main() -> int:
    report = build_report()
    out = ROOT / "data/generated/spb_migration_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"M3.5 SPB migration report: {out.relative_to(ROOT)}")
    print(f"legacy={report['source']['records']} canonical_spb={report['migration']['canonical_records_with_spb_source']} aliases={report['migration']['runtime_aliases']}")
    print(f"internal_merges={len(report['migration']['internal_auto_merge_groups'])} cross_candidates={len(report['migration']['cross_canonical_suspicious_candidates'])} review={len(report['migration']['review_candidates_involving_spb'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
