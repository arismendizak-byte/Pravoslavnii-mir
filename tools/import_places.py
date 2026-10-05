#!/usr/bin/env python3
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from difflib import SequenceMatcher
import argparse
import csv
import hashlib
import json
import re
import sys
import unicodedata
import uuid
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt

from place_quality import compute_quality

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

HEADER_ALIASES = {
    "id": {"id", "ID", "Id"},
    "name": {"name", "Название"},
    "type": {"type", "Тип постройки"},
    "foundation_date": {"foundation_date", "Дата основания"},
    "architect": {"architect", "Архитектор"},
    "status": {"status", "Статус"},
    "address": {"address", "Современный адрес"},
    "short_description": {"short_description", "Краткое описание"},
    "dedications": {"dedications", "Посвящение"},
    "lat": {"lat", "latitude", "широта"},
    "lon": {"lon", "lng", "longitude", "долгота"},
}

CYR = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
})


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path | str):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def clean(value) -> str:
    return str(value or "").strip()


def norm(value) -> str:
    text = unicodedata.normalize("NFKC", clean(value)).casefold().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я]+", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold()).translate(CYR)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return re.sub(r"-{2,}", "-", text) or "place"


def make_slug(name: str, record_id: str, max_length: int = 160) -> str:
    suffix = record_id[-8:]
    base_limit = max(1, max_length - len(suffix) - 1)
    base = slugify(name)[:base_limit].rstrip("-") or "place"
    return f"{base}-{suffix}"

def canonical_header_map(header: list[str]) -> dict[str, int]:
    vals = [clean(x).lstrip("\ufeff") for x in header]
    out: dict[str, int] = {}
    for key, aliases in HEADER_ALIASES.items():
        for i, value in enumerate(vals):
            if value in aliases:
                out[key] = i
                break
    return out


def decode_csv(path: Path | str) -> tuple[str, str]:
    raw = Path(path).read_bytes()
    if b"\x00" in raw[:8192]:
        raise ValueError("NUL bytes in CSV")
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            pass
    raise ValueError("unsupported encoding")


def map_value(raw, mapping: dict, *, contains_key: str = "contains") -> str:
    value = norm(raw)
    if not value:
        return mapping.get("default", "unknown")
    exact = {norm(k): v for k, v in mapping.get("exact", {}).items()}
    if value in exact:
        return exact[value]
    for rule in mapping.get(contains_key, mapping.get("contains", [])):
        if norm(rule["needle"]) in value:
            return rule["value"]
    return mapping.get("default", "unknown")




def legacy_name_type(name: str, raw_type: str, type_map: dict) -> str:
    """Refine generic legacy categories when the object kind is explicit at the start of the name."""
    normalized_name = norm(name)
    leading = (
        ("собор ", "cathedral"),
        ("часовня ", "chapel"),
        ("монастырь ", "monastery"),
        ("скит ", "skete"),
        ("подворье ", "metochion"),
        ("колокольня ", "bell_tower"),
    )
    mapped = map_value(raw_type, type_map)
    for prefix, value in leading:
        if normalized_name.startswith(prefix) and (mapped in {"unknown", "church"} or mapped == value):
            return value
    if mapped != "unknown":
        return mapped
    return map_value(name, type_map, contains_key="name_contains")

def parse_year_range(raw: str) -> tuple[int | None, int | None]:
    years = [int(x) for x in re.findall(r"(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)", raw or "")]
    return (min(years), max(years)) if years else (None, None)


def split_list(value: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in clean(value).split(";"):
        item = item.strip()
        key = item.casefold()
        if item and key not in seen:
            seen.add(key)
            out.append(item)
    return out


def parse_coord(value, lo: float, hi: float) -> float | None:
    text = clean(value).replace(",", ".")
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if lo <= number <= hi else None


def stable_id(provider: str, source_id: str, filename: str, row: int) -> str:
    """Stable ID v1.0: source identity is provider+source_id; file/row is fallback only."""
    source_file = Path(filename).name.casefold()
    key = f"{provider}:{source_id}" if source_id else f"{provider}:{source_file}:row:{row}"
    return "pm-" + uuid.uuid5(uuid.NAMESPACE_URL, key).hex


def recovery_v0_id(provider: str, source_id: str, filename: str, row: int) -> str:
    """ID formula used by the issued M2.4 recovery ZIP; retained only for migration aliases."""
    source_file = Path(filename).name.casefold()
    key = f"{provider}:{source_file}:{source_id}" if source_id else f"{provider}:{source_file}:row:{row}"
    return "pm-" + uuid.uuid5(uuid.NAMESPACE_URL, key).hex


def rv(row: list[str], header_map: dict[str, int], key: str) -> str:
    index = header_map.get(key)
    return clean(row[index]) if index is not None and index < len(row) else ""


def detect_region(address: str, declared_region: str | None, region_mapping: dict) -> tuple[str | None, list[str]]:
    """Prefer the most explicit region phrase in the address; flag real disagreement only."""
    text = norm(address)
    if not text:
        return declared_region, []
    haystack = f" {text} "
    scores: dict[str, int] = {}
    for canonical, aliases in region_mapping.get("regions", {}).items():
        best = 0
        for alias in aliases:
            normalized = norm(alias)
            needle = f" {normalized} "
            if normalized and needle in haystack:
                tokens = len(normalized.split())
                specificity = tokens * 10
                if any(marker in normalized.split() for marker in ("область", "обл", "республика", "г")):
                    specificity += 5
                best = max(best, specificity)
        if best:
            scores[canonical] = best
    if not scores:
        return declared_region, []
    top_score = max(scores.values())
    top = sorted(region for region, score in scores.items() if score == top_score)
    if len(top) == 1:
        region = top[0]
        flags = ["region_conflict"] if declared_region and region != declared_region else []
        return region, flags
    return declared_region, ["region_ambiguous"]


def haversine_m(a: dict, b: dict) -> float | None:
    try:
        lat1, lon1 = a.get("lat"), a.get("lon")
        lat2, lon2 = b.get("lat"), b.get("lon")
        if None in (lat1, lon1, lat2, lon2):
            return None
        lat1, lon1, lat2, lon2 = map(float, (lat1, lon1, lat2, lon2))
    except (TypeError, ValueError):
        return None
    radius = 6_371_008.8
    p1, p2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    h = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlambda / 2) ** 2
    return 2 * radius * asin(sqrt(h))


def unique_strings(values) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        text = clean(value)
        key = norm(text)
        if text and key not in seen:
            seen.add(key)
            out.append(text)
    return out


def source_record_key(src: dict) -> tuple:
    return (
        src.get("provider"), src.get("source_id"), src.get("source_file"),
        src.get("source_row"), src.get("source_url"),
    )


def fill_missing(target: dict, source: dict) -> None:
    for key, value in source.items():
        if target.get(key) in (None, "", [], {}) and value not in (None, "", [], {}):
            target[key] = deepcopy(value)


def merge_source_group(group: list[dict]) -> tuple[dict, str | None]:
    """Merge repeated exports of the same provider/source_id before global validation/dedupe."""
    ordered = sorted(group, key=lambda p: (-int((p.get("quality") or {}).get("score") or 0), str((p.get("source_records") or [{}])[0].get("source_file") or "")))
    merged = deepcopy(ordered[0])
    flags = set((merged.get("quality") or {}).get("flags") or [])
    alt_names = list(merged.get("alt_names") or [])
    architects = list(merged.get("architects") or [])
    dedications = list(merged.get("dedications") or [])
    sources = list(merged.get("source_records") or [])

    conflict: str | None = None
    base_name = norm(merged.get("name"))
    base_loc = merged.get("location") or {}
    for item in ordered[1:]:
        item_name = norm(item.get("name"))
        if item_name and item_name != base_name:
            similarity = SequenceMatcher(None, base_name, item_name).ratio() if base_name else 0.0
            if similarity < 0.70:
                conflict = f"source identity has incompatible names: {merged.get('name')!r} vs {item.get('name')!r}"
            alt_names.append(item.get("name"))
        distance = haversine_m(base_loc, item.get("location") or {})
        if distance is not None and distance > 500:
            conflict = f"source identity coordinates differ by {distance:.1f} m"

        flags.update((item.get("quality") or {}).get("flags") or [])
        architects.extend(item.get("architects") or [])
        dedications.extend(item.get("dedications") or [])
        sources.extend(item.get("source_records") or [])
        if merged.get("place_type") == "unknown" and item.get("place_type") != "unknown":
            merged["place_type"] = item.get("place_type")
            merged["type_raw"] = item.get("type_raw")
        if merged.get("status") == "unknown" and item.get("status") != "unknown":
            merged["status"] = item.get("status")
            merged["status_raw"] = item.get("status_raw")
        for key in ("address", "location", "foundation", "descriptions", "links"):
            if isinstance(merged.get(key), dict) and isinstance(item.get(key), dict):
                fill_missing(merged[key], item[key])

    merged["alt_names"] = unique_strings(alt_names)
    merged["architects"] = unique_strings(architects)
    merged["dedications"] = unique_strings(dedications)
    dedup_sources: list[dict] = []
    seen_sources: set[tuple] = set()
    for src in sources:
        key = source_record_key(src)
        if key not in seen_sources:
            seen_sources.add(key)
            dedup_sources.append(deepcopy(src))
    dedup_sources.sort(key=lambda s: (str(s.get("provider") or ""), str(s.get("source_id") or ""), str(s.get("source_file") or ""), int(s.get("source_row") or 0)))
    merged["source_records"] = dedup_sources
    merged["quality"] = compute_quality(merged, extra_flags=flags)
    return merged, conflict


def aggregate_source_duplicates(records: list[dict]) -> tuple[list[dict], list[str], int]:
    groups: dict[tuple, list[dict]] = {}
    for index, record in enumerate(records):
        src = (record.get("source_records") or [{}])[0]
        provider = clean(src.get("provider"))
        source_id = clean(src.get("source_id"))
        key = (provider, source_id) if provider and source_id else ("__row__", index)
        groups.setdefault(key, []).append(record)

    out: list[dict] = []
    conflicts: list[str] = []
    merged_count = 0
    for key, group in groups.items():
        if len(group) == 1:
            out.append(group[0])
            continue
        merged_count += len(group) - 1
        merged, conflict = merge_source_group(group)
        if conflict:
            conflicts.append(f"{key}: {conflict}")
        out.append(merged)
    out.sort(key=lambda p: str(p.get("id") or ""))
    return out, conflicts, merged_count


def import_file(path: Path, spec: dict, provider: str, type_map: dict, status_map: dict, region_map: dict, imported_at: str):
    text, encoding = decode_csv(path)
    rows = list(csv.reader(text.splitlines(), delimiter=";", quotechar='"'))
    header_idx = None
    header_map = None
    header_values: list[str] = []
    for i, row in enumerate(rows):
        if not any(clean(x) for x in row):
            continue
        candidate = canonical_header_map(row)
        if "name" in candidate and ("id" in candidate or "address" in candidate):
            header_idx = i
            header_map = candidate
            header_values = [clean(x).lstrip("\ufeff") for x in row]
            break
    if header_map is None or header_idx is None:
        raise ValueError("header not recognized")

    records: list[dict] = []
    issues: list[dict] = []
    rejected: list[dict] = []
    id_aliases: dict[str, str] = {}
    seen = blank = missing_name = 0

    for zero_index, row in enumerate(rows[header_idx + 1:], start=header_idx + 1):
        rowno = zero_index + 1
        if not any(clean(x) for x in row):
            blank += 1
            continue
        seen += 1
        name = rv(row, header_map, "name")
        source_id = rv(row, header_map, "id")
        if not name:
            missing_name += 1
            issue = {"row": rowno, "source_id": source_id or None, "code": "missing_name", "severity": "warning"}
            issues.append(issue)
            raw_fields = {header_values[i] if i < len(header_values) and header_values[i] else f"column_{i+1}": clean(value) for i, value in enumerate(row)}
            rejected.append({
                "source_file": path.name,
                "source_region": spec.get("region"),
                "source_row": rowno,
                "source_id": source_id or None,
                "reason": "missing_name",
                "raw_row": row,
                "raw_fields": raw_fields,
            })
            continue

        raw_type = rv(row, header_map, "type")
        raw_status = rv(row, header_map, "status")
        foundation_raw = rv(row, header_map, "foundation_date")
        address_raw = rv(row, header_map, "address")
        raw_lat = rv(row, header_map, "lat")
        raw_lon = rv(row, header_map, "lon")
        lat = parse_coord(raw_lat, -90, 90)
        lon = parse_coord(raw_lon, -180, 180)
        if (lat is None) != (lon is None):
            lat = lon = None
            issues.append({"row": rowno, "source_id": source_id or None, "code": "coordinates_incomplete", "severity": "warning"})
        elif (raw_lat or raw_lon) and lat is None and lon is None:
            issues.append({"row": rowno, "source_id": source_id or None, "code": "coordinates_invalid", "severity": "warning"})

        year_from, year_to = parse_year_range(foundation_raw)
        architect_raw = rv(row, header_map, "architect")
        architects = [] if norm(architect_raw) in {"", "нет данных", "неизвестен", "неизвестно"} else [architect_raw]

        place_type = map_value(raw_type, type_map)
        if place_type == "unknown":
            place_type = map_value(name, type_map, contains_key="name_contains")
        status = map_value(raw_status, status_map)
        declared_region = spec.get("region")
        region, region_flags = detect_region(address_raw, declared_region, region_map)

        record_id = stable_id(provider, source_id, path.name, rowno)
        old_id = recovery_v0_id(provider, source_id, path.name, rowno)
        if old_id != record_id:
            id_aliases[old_id] = record_id

        record = {
            "schema_version": "1.0.0",
            "id": record_id,
            "slug": make_slug(name, record_id),
            "name": name,
            "alt_names": [],
            "place_type": place_type,
            "type_raw": raw_type or None,
            "status": status,
            "status_raw": raw_status or None,
            "foundation": {"raw_text": foundation_raw or None, "from_year": year_from, "to_year": year_to},
            "architects": architects,
            "address": {
                "country_code": "RU",
                "country": "Россия",
                "region": region,
                "district": None,
                "locality": None,
                "formatted": address_raw or None,
            },
            "location": {"lat": lat, "lon": lon, "precision": "exact" if lat is not None else "unknown"},
            "descriptions": {"short": rv(row, header_map, "short_description") or None, "full": None},
            "dedications": split_list(rv(row, header_map, "dedications")),
            "media": [],
            "links": {"detail_path": None, "official_url": None, "map_url": None},
            "source_records": [{
                "provider": provider,
                "source_id": source_id or None,
                "source_url": None,
                "source_file": path.name,
                "source_row": rowno,
                "source_region": declared_region,
                "raw_type": raw_type or None,
                "raw_status": raw_status or None,
                "imported_at": imported_at,
                "last_verified_at": None,
            }],
            "merged_from_ids": [],
            "quality": {"score": 0, "flags": []},
        }
        record["quality"] = compute_quality(record, extra_flags=region_flags)
        records.append(record)

    return records, rejected, id_aliases, {
        "file": path.name,
        "region": spec.get("region"),
        "encoding": encoding,
        "rows_seen": seen,
        "imported_before_source_aggregation": len(records),
        "skipped_empty": blank,
        "skipped_missing_name": missing_name,
        "issues": issues,
    }



def import_legacy_json(path: Path, spec: dict, provider: str, type_map: dict, status_map: dict, region_map: dict, imported_at: str):
    payload = load_json(path)
    if not isinstance(payload, list):
        raise ValueError("legacy JSON root must be an array")

    records: list[dict] = []
    issues: list[dict] = []
    rejected: list[dict] = []
    runtime_aliases: dict[str, str] = {}
    seen = missing_name = 0
    source_file = str(spec.get("source_file") or path.as_posix())
    runtime_prefix = clean(spec.get("runtime_id_prefix")) or "legacy-spb-"

    for index, item in enumerate(payload):
        rowno = index + 1
        if not isinstance(item, dict):
            rejected.append({
                "source_file": source_file,
                "source_region": spec.get("region"),
                "source_row": rowno,
                "source_id": None,
                "reason": "invalid_object",
                "raw_row": item,
                "raw_fields": {},
            })
            issues.append({"row": rowno, "source_id": None, "code": "invalid_object", "severity": "warning"})
            continue
        seen += 1
        source_id = clean(item.get(spec.get("source_id_field", "id")))
        name = clean(item.get("name"))
        if not name:
            missing_name += 1
            rejected.append({
                "source_file": source_file,
                "source_region": spec.get("region"),
                "source_row": rowno,
                "source_id": source_id or None,
                "reason": "missing_name",
                "raw_row": item,
                "raw_fields": deepcopy(item),
            })
            issues.append({"row": rowno, "source_id": source_id or None, "code": "missing_name", "severity": "warning"})
            continue

        raw_type = clean(item.get("category"))
        raw_status = clean(item.get("status"))
        address_raw = clean(item.get("address"))
        lat = parse_coord(item.get("lat"), -90, 90)
        lon = parse_coord(item.get("lon"), -180, 180)
        if (lat is None) != (lon is None):
            lat = lon = None
            issues.append({"row": rowno, "source_id": source_id or None, "code": "coordinates_incomplete", "severity": "warning"})
        elif (item.get("lat") not in (None, "") or item.get("lon") not in (None, "")) and lat is None and lon is None:
            issues.append({"row": rowno, "source_id": source_id or None, "code": "coordinates_invalid", "severity": "warning"})

        declared_region = clean(item.get("region")) or clean(spec.get("region")) or None
        region, region_flags = detect_region(address_raw, declared_region, region_map)
        place_type = legacy_name_type(name, raw_type, type_map)
        status = map_value(raw_status, status_map)
        record_id = stable_id(provider, source_id, source_file, rowno)
        if source_id:
            runtime_aliases[runtime_prefix + source_id] = record_id

        record = {
            "schema_version": "1.0.0",
            "id": record_id,
            "slug": make_slug(name, record_id),
            "name": name,
            "alt_names": [],
            "place_type": place_type,
            "type_raw": raw_type or None,
            "status": status,
            "status_raw": raw_status or None,
            "foundation": {"raw_text": None, "from_year": None, "to_year": None},
            "architects": [],
            "address": {
                "country_code": "RU",
                "country": "Россия",
                "region": region,
                "district": None,
                "locality": None,
                "formatted": address_raw or None,
            },
            "location": {"lat": lat, "lon": lon, "precision": "exact" if lat is not None else "unknown"},
            "descriptions": {"short": None, "full": None},
            "dedications": [],
            "media": [],
            "links": {"detail_path": None, "official_url": None, "map_url": None},
            "source_records": [{
                "provider": provider,
                "source_id": source_id or None,
                "source_url": None,
                "source_file": source_file,
                "source_row": rowno,
                "source_region": declared_region,
                "raw_type": raw_type or None,
                "raw_status": raw_status or None,
                "imported_at": imported_at,
                "last_verified_at": None,
            }],
            "merged_from_ids": [],
            "quality": {"score": 0, "flags": []},
        }
        record["quality"] = compute_quality(record, extra_flags=region_flags)
        records.append(record)

    return records, rejected, runtime_aliases, {
        "file": source_file,
        "region": spec.get("region"),
        "format": spec.get("format", "legacy_json"),
        "encoding": "utf-8",
        "rows_seen": seen,
        "imported_before_source_aggregation": len(records),
        "skipped_empty": 0,
        "skipped_missing_name": missing_name,
        "issues": issues,
    }

def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-root", default=str(ROOT))
    parser.add_argument("--output", default=str(ROOT / "data/generated/places_imported.json"))
    parser.add_argument("--report", default=str(ROOT / "data/generated/import_report.json"))
    parser.add_argument("--rejected", default=str(ROOT / "data/generated/rejected_rows.json"))
    parser.add_argument("--id-aliases", default=str(ROOT / "data/generated/import_id_aliases.json"))
    parser.add_argument("--runtime-id-aliases", default=str(ROOT / "data/generated/import_runtime_id_aliases.json"))
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args(argv)

    input_root = Path(args.input_root).resolve()
    source_cfg = load_json(ROOT / "data/schema/source_files.json")
    snapshot_cfg = load_json(ROOT / "data/schema/source_snapshot.json")
    legacy_cfg = load_json(ROOT / "data/schema/legacy_sources.json") if (ROOT / "data/schema/legacy_sources.json").exists() else {"sources": {}}
    legacy_snapshot_cfg = load_json(ROOT / "data/schema/legacy_source_snapshot.json") if (ROOT / "data/schema/legacy_source_snapshot.json").exists() else {"sources": {}}
    type_map = load_json(ROOT / "data/schema/type_mapping.json")
    status_map = load_json(ROOT / "data/schema/status_mapping.json")
    region_map = load_json(ROOT / "data/schema/region_mapping.json")
    run_stamp = now_iso()
    imported_at = clean(snapshot_cfg.get("snapshot_at"))
    legacy_imported_at = clean(legacy_snapshot_cfg.get("snapshot_at"))
    all_sources = list(source_cfg["files"].keys()) + list((legacy_cfg.get("sources") or {}).keys())
    selected = set(args.only or all_sources)

    raw_records: list[dict] = []
    rejected_rows: list[dict] = []
    import_aliases: dict[str, str] = {}
    runtime_aliases: dict[str, str] = {}
    reports: list[dict] = []
    fatal: list[str] = []

    csv_selected = any(filename in selected for filename in source_cfg["files"])
    legacy_selected = any(filename in selected for filename in (legacy_cfg.get("sources") or {}))
    if csv_selected and not imported_at:
        fatal.append("source_snapshot.json: snapshot_at required")
    if csv_selected and snapshot_cfg.get("provider") != source_cfg.get("provider"):
        fatal.append("source_snapshot.json: provider mismatch")
    if legacy_selected and not legacy_imported_at:
        fatal.append("legacy_source_snapshot.json: snapshot_at required")

    for filename, spec in source_cfg["files"].items():
        if filename not in selected:
            continue
        path = input_root / filename
        if not path.exists():
            fatal.append(f"missing source file: {filename}")
            reports.append({
                "file": filename,
                "region": spec.get("region"),
                "missing": True,
                "imported_before_source_aggregation": 0,
                "issues": [{"code": "source_file_missing", "severity": "error"}],
            })
            continue

        snapshot_entry = (snapshot_cfg.get("sources") or {}).get(filename)
        if not snapshot_entry:
            fatal.append(f"source snapshot missing entry: {filename}")
            reports.append({
                "file": filename,
                "region": spec.get("region"),
                "imported_before_source_aggregation": 0,
                "issues": [{"code": "source_snapshot_missing", "severity": "error"}],
            })
            continue
        raw_bytes = path.read_bytes()
        actual_sha256 = hashlib.sha256(raw_bytes).hexdigest()
        expected_sha256 = clean(snapshot_entry.get("sha256"))
        expected_size = snapshot_entry.get("size")
        if actual_sha256 != expected_sha256 or (expected_size is not None and len(raw_bytes) != int(expected_size)):
            fatal.append(f"source snapshot mismatch: {filename}")
            reports.append({
                "file": filename,
                "region": spec.get("region"),
                "imported_before_source_aggregation": 0,
                "issues": [{
                    "code": "source_snapshot_mismatch",
                    "severity": "error",
                    "expected_sha256": expected_sha256,
                    "actual_sha256": actual_sha256,
                    "expected_size": expected_size,
                    "actual_size": len(raw_bytes),
                }],
            })
            continue
        try:
            records, rejected, aliases, report = import_file(
                path, spec, source_cfg.get("provider", "templesru"),
                type_map, status_map, region_map, imported_at,
            )
            raw_records.extend(records)
            rejected_rows.extend(rejected)
            import_aliases.update(aliases)
            reports.append(report)
        except Exception as exc:
            fatal.append(f"{filename}: {exc}")
            reports.append({
                "file": filename,
                "region": spec.get("region"),
                "imported_before_source_aggregation": 0,
                "issues": [{"code": "import_failed", "severity": "error", "detail": str(exc)}],
            })


    for filename, spec0 in (legacy_cfg.get("sources") or {}).items():
        if filename not in selected:
            continue
        spec = dict(spec0 or {})
        spec["source_file"] = filename
        path = input_root / filename
        provider = clean(spec.get("provider"))
        if not provider:
            fatal.append(f"legacy source provider missing: {filename}")
            continue
        if not path.exists():
            fatal.append(f"missing source file: {filename}")
            reports.append({
                "file": filename,
                "region": spec.get("region"),
                "missing": True,
                "imported_before_source_aggregation": 0,
                "issues": [{"code": "source_file_missing", "severity": "error"}],
            })
            continue
        snapshot_entry = (legacy_snapshot_cfg.get("sources") or {}).get(filename)
        if not snapshot_entry:
            fatal.append(f"legacy source snapshot missing entry: {filename}")
            reports.append({
                "file": filename,
                "region": spec.get("region"),
                "imported_before_source_aggregation": 0,
                "issues": [{"code": "source_snapshot_missing", "severity": "error"}],
            })
            continue
        if clean(snapshot_entry.get("provider")) != provider:
            fatal.append(f"legacy source snapshot provider mismatch: {filename}")
            continue
        raw_bytes = path.read_bytes()
        actual_sha256 = hashlib.sha256(raw_bytes).hexdigest()
        expected_sha256 = clean(snapshot_entry.get("sha256"))
        expected_size = snapshot_entry.get("size")
        if actual_sha256 != expected_sha256 or (expected_size is not None and len(raw_bytes) != int(expected_size)):
            fatal.append(f"source snapshot mismatch: {filename}")
            reports.append({
                "file": filename,
                "region": spec.get("region"),
                "imported_before_source_aggregation": 0,
                "issues": [{
                    "code": "source_snapshot_mismatch",
                    "severity": "error",
                    "expected_sha256": expected_sha256,
                    "actual_sha256": actual_sha256,
                    "expected_size": expected_size,
                    "actual_size": len(raw_bytes),
                }],
            })
            continue
        try:
            records0, rejected0, runtime0, report0 = import_legacy_json(
                path, spec, provider, type_map, status_map, region_map, legacy_imported_at,
            )
            raw_records.extend(records0)
            rejected_rows.extend(rejected0)
            runtime_aliases.update(runtime0)
            reports.append(report0)
        except Exception as exc:
            fatal.append(f"{filename}: {exc}")
            reports.append({
                "file": filename,
                "region": spec.get("region"),
                "imported_before_source_aggregation": 0,
                "issues": [{"code": "import_failed", "severity": "error", "detail": str(exc)}],
            })

    records, source_conflicts, source_duplicates_merged = aggregate_source_duplicates(raw_records)
    fatal.extend(f"source_identity_conflict: {item}" for item in source_conflicts)

    sys.path.insert(0, str(HERE))
    from validate_places import validate_payload
    validation_errors = validate_payload(records)

    for report in reports:
        report["imported"] = report.get("imported_before_source_aggregation", 0)

    summary = {
        "schema_version": "1.0.0",
        "release_version": "1.7",
        "generated_at": run_stamp,
        "source_snapshot_at": imported_at,
        "source_snapshot_file": "data/schema/source_snapshot.json",
        "source_snapshots": {
            "regional_csv": {"file": "data/schema/source_snapshot.json", "snapshot_at": imported_at},
            "legacy_spb": {"file": "data/schema/legacy_source_snapshot.json", "snapshot_at": legacy_imported_at},
        },
        "source_files_expected": len(selected),
        "source_files_processed": sum(1 for item in reports if not item.get("missing")),
        "source_rows_imported_before_aggregation": len(raw_records),
        "source_identity_duplicates_merged": source_duplicates_merged,
        "records_imported": len(records),
        "records_rejected": len(rejected_rows),
        "validation_errors": validation_errors[:1000],
        "fatal_errors": fatal,
        "files": reports,
    }

    output = Path(args.output)
    report_path = Path(args.report)
    rejected_path = Path(args.rejected)
    aliases_path = Path(args.id_aliases)
    runtime_aliases_path = Path(args.runtime_id_aliases)
    for path in (output, report_path, rejected_path, aliases_path, runtime_aliases_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rejected_path.write_text(json.dumps(rejected_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    aliases_path.write_text(json.dumps(dict(sorted(import_aliases.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    runtime_aliases_path.write_text(json.dumps(dict(sorted(runtime_aliases.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Source rows normalized: {len(raw_records)}")
    print(f"Source identity duplicates merged: {source_duplicates_merged}")
    print(f"Imported canonical records: {len(records)}")
    print(f"Rejected rows: {len(rejected_rows)}")
    print(f"Validation errors: {len(validation_errors)}")
    print(f"Fatal errors: {len(fatal)}")
    print(f"Output: {output}")
    print(f"Report: {report_path}")
    return 1 if validation_errors or fatal else 0


if __name__ == "__main__":
    raise SystemExit(main())
