#!/usr/bin/env python3
from __future__ import annotations

from argparse import ArgumentParser
from datetime import date, timedelta
from pathlib import Path
import hashlib
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SNAPSHOT_PATH = DATA / "schema/liturgical_source_snapshot.json"
MANIFEST_PATH = DATA / "liturgical_sources/source_manifest.json"
LEGACY_PATH = DATA / "content_sources/calendar_2026_legacy.json"
SEMANTICS_PATH = DATA / "liturgical_sources/calendar_2026_semantics.json"
READINGS_PATH = DATA / "liturgical_sources/readings_2026_editorial.json"
DEFAULT_OUT = DATA / "generated"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def snapshot_hash(snapshot: dict) -> str:
    raw = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def stable_id(prefix: str, *parts: object) -> str:
    raw = "\x1f".join(str(part) for part in parts).encode("utf-8")
    return prefix + hashlib.sha256(raw).hexdigest()[:20]


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я]+", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def slug_for(kind: str, source_id: str) -> str:
    # Stable opaque slug avoids pretending that transliterated text is identity.
    return f"{kind}-{hashlib.sha256(source_id.encode('utf-8')).hexdigest()[:16]}"


def verify_snapshot() -> dict:
    snapshot = read_json(SNAPSHOT_PATH)
    errors: list[str] = []
    for item in snapshot.get("files", []):
        rel = str(item.get("path") or "")
        path = ROOT / rel
        if not path.is_file():
            errors.append(f"missing source: {rel}")
            continue
        if path.stat().st_size != item.get("size"):
            errors.append(f"size mismatch: {rel}")
        if sha256_file(path) != item.get("sha256"):
            errors.append(f"sha256 mismatch: {rel}")
    if errors:
        raise SystemExit("liturgical source snapshot mismatch:\n - " + "\n - ".join(errors))
    return snapshot


def source_context() -> tuple[dict, dict, dict, dict, dict]:
    manifest = read_json(MANIFEST_PATH)
    providers = {str(row.get("provider") or ""): row for row in (manifest.get("providers") or [])}
    legacy = read_json(LEGACY_PATH)
    semantics = read_json(SEMANTICS_PATH)
    reading_source = read_json(READINGS_PATH)
    legacy_provider = providers.get(str(legacy.get("provider") or ""))
    reading_provider = providers.get(str(reading_source.get("provider") or ""))
    if not legacy_provider or semantics.get("provider") != legacy_provider.get("provider"):
        raise SystemExit("M5.3 legacy provider mismatch between manifest/legacy/semantics")
    if not reading_provider:
        raise SystemExit("v1.22 reading provider missing from liturgical source manifest")
    if reading_source.get("verification_status") != reading_provider.get("verification_status"):
        raise SystemExit("v1.22 reading source verification status mismatch")
    return legacy_provider, reading_provider, legacy, semantics, reading_source


def scope_from(provider: dict) -> dict:
    return {
        "jurisdiction": str((provider.get("jurisdiction") or {}).get("code") or "unspecified"),
        "tradition": str((provider.get("tradition") or {}).get("code") or "unspecified"),
        "calendar_style": str(provider.get("calendar_style") or "unspecified"),
        "locale": str(provider.get("locale") or "ru-RU"),
        "valid_from": str(provider.get("valid_from") or ""),
        "valid_to": str(provider.get("valid_to") or ""),
        "verified_at": provider.get("verified_at"),
    }


def source_record(provider: str, source_id: str, row: int | None, *, source_file: str | None = None, source_url: str | None = None, migrated_from: str | None = "calendar.html inline calendar2026/getFast") -> dict:
    return {
        "provider": provider,
        "source_id": source_id,
        "source_file": source_file or "data/content_sources/calendar_2026_legacy.json",
        "source_row": row,
        "source_url": source_url,
        "migrated_from": migrated_from,
    }


def legacy_entry_source_id(row: dict) -> str:
    return f"entry:{row.get('date')}:{normalize_text(row.get('title'))}"


def ensure_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit(f"invalid {label} date {value}: {exc}")


def relation(kind_from: str, id_from: str, kind_to: str, id_to: str, relation_type: str, status: str, records: list[dict]) -> dict:
    rid = stable_id("pm-lrel-", kind_from, id_from, relation_type, kind_to, id_to)
    return {
        "id": rid,
        "relation_type": relation_type,
        "from": {"kind": kind_from, "id": id_from},
        "to": {"kind": kind_to, "id": id_to},
        "verification_status": status,
        "source_records": records,
    }


def build_domain() -> dict[str, list[dict] | dict]:
    provider_meta, reading_provider_meta, legacy, semantics, reading_source = source_context()
    provider = str(provider_meta["provider"])
    status = str(provider_meta["verification_status"])
    scope = scope_from(provider_meta)
    reading_provider = str(reading_provider_meta["provider"])
    reading_status = str(reading_provider_meta["verification_status"])
    reading_scope = scope_from(reading_provider_meta)
    valid_from = ensure_date(scope["valid_from"], "coverage start")
    valid_to = ensure_date(scope["valid_to"], "coverage end")
    if valid_to < valid_from:
        raise SystemExit("liturgical source coverage is inverted")

    entries = list(legacy.get("entries") or [])
    fast_periods = list(legacy.get("fast_periods") or [])
    entry_rows = {legacy_entry_source_id(row): (i, row) for i, row in enumerate(entries, 1)}
    fast_rows = {str(row.get("source_id")): (len(entries) + i, row) for i, row in enumerate(fast_periods, 1)}

    fast_start_links = {str(x["entry_source_id"]): str(x["fast_source_id"]) for x in semantics.get("fast_start_links", [])}
    saint_map = {str(x["entry_source_id"]): list(x.get("saints") or []) for x in semantics.get("commemoration_saints", [])}

    unknown_start = sorted(set(fast_start_links) - set(entry_rows))
    unknown_period = sorted(set(fast_start_links.values()) - set(fast_rows))
    unknown_comm = sorted(set(saint_map) - set(entry_rows))
    if unknown_start or unknown_period or unknown_comm:
        raise SystemExit(f"semantic mapping contains dangling source ids: starts={unknown_start} fasts={unknown_period} comm={unknown_comm}")

    feasts: list[dict] = []
    commemorations: list[dict] = []
    saints_by_id: dict[str, dict] = {}
    fasts: list[dict] = []
    readings: list[dict] = []  # v1.22 adds only explicitly captured editorial reading references; no Scripture text.
    relations: list[dict] = []
    aliases: dict[str, list[dict]] = {}
    dated_refs: dict[str, list[dict]] = {}

    def add_dated_ref(start: str, end: str, kind: str, object_id: str, relation_type: str) -> None:
        current = ensure_date(start, "observance start")
        stop = ensure_date(end, "observance end")
        if stop < current:
            raise SystemExit(f"inverted range {start}..{end} for {kind}:{object_id}")
        while current <= stop:
            dated_refs.setdefault(current.isoformat(), []).append({"kind": kind, "id": object_id, "relation_type": relation_type})
            current += timedelta(days=1)

    for source_id, (row_number, row) in entry_rows.items():
        legacy_type = str(row.get("type") or "event")
        when = str(row.get("date") or "")
        title = str(row.get("title") or "").strip()
        records = [source_record(provider, source_id, row_number)]
        old_id = stable_id("pm-cal-", provider, source_id)

        if legacy_type == "fast":
            target_source_id = fast_start_links.get(source_id)
            if not target_source_id:
                raise SystemExit(f"legacy fast-start entry lacks explicit semantic mapping: {source_id}")
            # The canonical period is constructed below; alias is resolved after it exists.
            aliases.setdefault(old_id, []).append({"kind": "fasting_rule", "source_id": target_source_id, "relation_type": "legacy_fast_start"})
            continue

        kind = "feast" if legacy_type == "holiday" else "commemoration"
        prefix = "pm-feast-" if kind == "feast" else "pm-comm-"
        object_id = stable_id(prefix, provider, source_id)
        obj = {
            "id": object_id,
            "slug": slug_for(kind, source_id),
            "title": title,
            "canonical_path": f"calendar/item.html?kind={kind}&id={object_id}",
            "observance": {"date_start": when, "date_end": when},
            "scope": dict(scope),
            "verification_status": status,
            "aliases": [title],
            "references": [],
            "source_records": records,
        }
        (feasts if kind == "feast" else commemorations).append(obj)
        aliases.setdefault(old_id, []).append({"kind": kind, "id": object_id, "relation_type": "legacy_calendar_entry"})
        add_dated_ref(when, when, kind, object_id, "observed_on")

        if kind == "commemoration":
            for saint in saint_map.get(source_id, []):
                saint_source_id = str(saint.get("source_id") or "")
                if not saint_source_id:
                    raise SystemExit(f"saint semantic mapping without source_id for {source_id}")
                saint_id = stable_id("pm-saint-", provider, saint_source_id)
                if saint_id not in saints_by_id:
                    saints_by_id[saint_id] = {
                        "id": saint_id,
                        "slug": slug_for("saint", saint_source_id),
                        "name": str(saint.get("name") or "").strip(),
                        "display_name": str(saint.get("display_name") or saint.get("name") or "").strip(),
                        "canonical_path": f"calendar/item.html?kind=saint&id={saint_id}",
                        "scope": dict(scope),
                        "verification_status": status,
                        "aliases": sorted(set(str(x).strip() for x in (saint.get("aliases") or []) if str(x).strip())),
                        "references": [],
                        "source_records": records,
                    }
                rel = relation("commemoration", object_id, "saint", saint_id, "commemorates", status, records)
                relations.append(rel)
                obj["references"].append({"kind": "saint", "id": saint_id, "relation_type": "commemorates"})
                saints_by_id[saint_id]["references"].append({"kind": "commemoration", "id": object_id, "relation_type": "commemorated_by"})

    fast_id_by_source: dict[str, str] = {}
    for source_id, (row_number, row) in fast_rows.items():
        title = str(row.get("title") or "").strip()
        start = str(row.get("date_start") or "")
        end = str(row.get("date_end") or "")
        ensure_date(start, "fast start"); ensure_date(end, "fast end")
        records = [source_record(provider, source_id, row_number)]
        object_id = stable_id("pm-fast-", provider, source_id)
        fast_id_by_source[source_id] = object_id
        fasts.append({
            "id": object_id,
            "slug": slug_for("fast", source_id),
            "title": title,
            "canonical_path": f"calendar/item.html?kind=fasting_rule&id={object_id}",
            "date_start": start,
            "date_end": end,
            "rule_level": "period_only",
            "scope": dict(scope),
            "verification_status": status,
            "aliases": [title],
            "references": [],
            "source_records": records,
        })
        add_dated_ref(start, end, "fasting_rule", object_id, "fasting_period")
        old_id = stable_id("pm-cal-", provider, source_id)
        aliases.setdefault(old_id, []).append({"kind": "fasting_rule", "id": object_id, "relation_type": "legacy_calendar_entry"})

    # Resolve aliases from explicit "start of fast" legacy rows to the canonical period.
    for old_id, targets in list(aliases.items()):
        for target in targets:
            source_id = target.pop("source_id", None)
            if source_id:
                object_id = fast_id_by_source.get(source_id)
                if not object_id:
                    raise SystemExit(f"fast alias target missing: {source_id}")
                target["id"] = object_id

    # v1.22: editorial bibliographic reading references. These are date-scoped citations only;
    # Scripture text is intentionally not copied and missing dates are never inferred.
    seen_reading_source_ids: set[str] = set()
    reading_row = 0
    for day in reading_source.get("days") or []:
        when = str(day.get("date") or "")
        ensure_date(when, "reading date")
        if when < reading_scope["valid_from"] or when > reading_scope["valid_to"]:
            raise SystemExit(f"reading date outside provider scope: {when}")
        source_url = str(day.get("source_url") or "").strip()
        if not source_url.startswith("https://"):
            raise SystemExit(f"reading source URL must be https: {when}")
        for source_row in day.get("readings") or []:
            reading_row += 1
            source_id = str(source_row.get("source_id") or "").strip()
            service = str(source_row.get("service") or "").strip()
            citation = str(source_row.get("citation") or "").strip()
            lection = str(source_row.get("lection") or "").strip()
            if not source_id or source_id in seen_reading_source_ids:
                raise SystemExit(f"duplicate/empty reading source_id: {source_id!r}")
            if not service or not citation:
                raise SystemExit(f"reading source row missing service/citation: {source_id}")
            seen_reading_source_ids.add(source_id)
            object_id = stable_id("pm-reading-", reading_provider, source_id)
            records = [source_record(
                reading_provider, source_id, reading_row,
                source_file="data/liturgical_sources/readings_2026_editorial.json",
                source_url=source_url, migrated_from=None,
            )]
            title = f"{service}: {citation}" + (f" (зач. {lection})" if lection else "")
            readings.append({
                "id": object_id,
                "slug": slug_for("reading", source_id),
                "title": title,
                "canonical_path": f"calendar/item.html?kind=reading&id={object_id}",
                "date": when,
                "citation": citation,
                "text_ref": None,
                "scope": dict(reading_scope),
                "verification_status": reading_status,
                "aliases": [],
                "references": [{"kind": "calendar_day", "id": f"pm-day-{when}", "relation_type": "reading_for"}],
                "source_records": records,
            })
            add_dated_ref(when, when, "reading", object_id, "has_reading")

    calendar_days: list[dict] = []
    current = valid_from
    while current <= valid_to:
        day_str = current.isoformat()
        day_id = f"pm-day-{day_str}"
        refs = sorted(dated_refs.get(day_str, []), key=lambda x: (x["kind"], x["id"], x["relation_type"]))
        day = {
            "id": day_id,
            "date": day_str,
            "canonical_path": f"calendar/day.html?date={day_str}",
            "scope": dict(scope),
            "verification_status": "system_derived",
            "references": refs,
            "source_records": [{
                "provider": "pravmir-system-calendar",
                "source_id": f"civil-day:{day_str}",
                "source_file": "tools/build_liturgical.py",
                "source_row": None,
                "source_url": None,
                "migrated_from": None,
            }],
        }
        calendar_days.append(day)
        for ref in refs:
            # Day-to-record relation is derived from an explicit dated source record.
            target = None
            collections = {
                "feast": feasts,
                "commemoration": commemorations,
                "fasting_rule": fasts,
                "reading": readings,
            }
            for candidate in collections.get(ref["kind"], []):
                if candidate["id"] == ref["id"]:
                    target = candidate
                    break
            records = target["source_records"] if target else day["source_records"]
            relation_status = str(target.get("verification_status") or "system_derived") if target else "system_derived"
            relations.append(relation("calendar_day", day_id, ref["kind"], ref["id"], ref["relation_type"], relation_status, records))
        current += timedelta(days=1)

    saints = sorted(saints_by_id.values(), key=lambda row: row["id"])
    for rows in (feasts, commemorations, fasts, readings):
        rows.sort(key=lambda row: row["id"])
    relations = sorted({row["id"]: row for row in relations}.values(), key=lambda row: row["id"])

    alias_rows = []
    for legacy_id, targets in sorted(aliases.items()):
        alias_rows.append({"legacy_id": legacy_id, "targets": sorted(targets, key=lambda x: (x["kind"], x["id"]))})

    return {
        "calendar_days": calendar_days,
        "feasts": feasts,
        "saints": saints,
        "commemorations": commemorations,
        "fasting_rules": fasts,
        "readings": readings,
        "relations": relations,
        "aliases": alias_rows,
        "scope": scope,
        "verification_status": status,
    }


def build_index(domain: dict, source_hash: str) -> dict:
    kinds = {
        "calendar_day": domain["calendar_days"],
        "feast": domain["feasts"],
        "saint": domain["saints"],
        "commemoration": domain["commemorations"],
        "fasting_rule": domain["fasting_rules"],
        "reading": domain["readings"],
    }
    by_id: dict[str, dict] = {}
    by_date: dict[str, dict] = {}
    by_slug: dict[str, dict] = {}
    for kind, rows in kinds.items():
        for row in rows:
            by_id[row["id"]] = {"kind": kind}
            if row.get("slug"):
                by_slug[row["slug"]] = {"kind": kind, "id": row["id"]}
            if kind == "calendar_day":
                by_date[row["date"]] = {"id": row["id"], "references": row.get("references", [])}
    return {
        "schema_version": "1.0.0",
        "source_snapshot_sha256": source_hash,
        "coverage": {"valid_from": domain["scope"]["valid_from"], "valid_to": domain["scope"]["valid_to"]},
        "counts": {kind: len(rows) for kind, rows in kinds.items()} | {"relations": len(domain["relations"]), "legacy_aliases": len(domain["aliases"])},
        "by_id": dict(sorted(by_id.items())),
        "by_slug": dict(sorted(by_slug.items())),
        "by_date": dict(sorted(by_date.items())),
        "legacy_calendar_entry_aliases": domain["aliases"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = ArgumentParser(description="Build deterministic M5.3 Calendar / Liturgical Core")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)
    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir

    snapshot = verify_snapshot()
    source_hash = snapshot_hash(snapshot)
    domain = build_domain()
    payloads = {
        "calendar_days.json": ("days", domain["calendar_days"]),
        "feasts.json": ("feasts", domain["feasts"]),
        "saints.json": ("saints", domain["saints"]),
        "commemorations.json": ("commemorations", domain["commemorations"]),
        "fasting_rules.json": ("rules", domain["fasting_rules"]),
        "readings.json": ("readings", domain["readings"]),
        "liturgical_relations.json": ("relations", domain["relations"]),
        "liturgical_aliases.json": ("aliases", domain["aliases"]),
    }
    hashes: dict[str, str] = {}
    for filename, (key, rows) in payloads.items():
        payload = {"schema_version": "1.0.0", "source_snapshot_sha256": source_hash, "count": len(rows), key: rows}
        path = out_dir / filename
        write_json(path, payload)
        hashes[filename] = sha256_file(path)

    index = build_index(domain, source_hash)
    write_json(out_dir / "liturgical_index.json", index)
    hashes["liturgical_index.json"] = sha256_file(out_dir / "liturgical_index.json")

    report = {
        "schema_version": "1.0.0",
        "source_snapshot_sha256": source_hash,
        "result": "OK",
        "coverage": index["coverage"],
        "source_verification": {
            "legacy_provider_status": domain["verification_status"],
            "editorial_verified_readings": sum(1 for row in domain["readings"] if row.get("verification_status") == "editorial_verified"),
            "scripture_text_records": sum(1 for row in domain["readings"] if row.get("text_ref")),
            "note": "Legacy 2026 feast/saint/fast assertions remain legacy_unverified. v1.22 reading records are editorial-verified bibliographic citations with explicit source URLs; no Scripture text is copied."
        },
        "counts": index["counts"],
        "output_sha256": dict(sorted(hashes.items())),
    }
    write_json(out_dir / "liturgical_report.json", report)

    print("=== M5.3 LITURGICAL BUILD ===")
    print(f"source snapshot: {source_hash}")
    for name, digest in sorted(hashes.items()):
        print(f" - {name}: {digest}")
    print("counts=" + " ".join(f"{k}={v}" for k, v in index["counts"].items()))
    print("RESULT: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
