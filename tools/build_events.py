#!/usr/bin/env python3
from __future__ import annotations

from argparse import ArgumentParser
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pathlib import Path
import hashlib
import json
import re
import unicodedata

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GEN = DATA / "generated"
SCHEMA = DATA / "schema"
EVENT_SOURCES = DATA / "event_sources"
SNAPSHOT_PATH = SCHEMA / "event_source_snapshot.json"
MANIFEST_PATH = EVENT_SOURCES / "source_manifest.json"

CANONICAL_TRUST = {"editorial", "verified_organisation"}
TARGET_FILES = {
    "place": ("places_deduped.json", None),
    "entity": ("entities.json", "entities"),
    "route": ("routes.json", "routes"),
    "content": ("content_items.json", "items"),
    "calendar_day": ("calendar_days.json", "days"),
    "feast": ("feasts.json", "feasts"),
    "saint": ("saints.json", "saints"),
    "commemoration": ("commemorations.json", "commemorations"),
    "fasting_rule": ("fasting_rules.json", "rules"),
    "reading": ("readings.json", "readings"),
}


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


def canonical_hash(payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def stable_id(prefix: str, *parts: object) -> str:
    raw = "\x1f".join(str(part) for part in parts).encode("utf-8")
    return prefix + hashlib.sha256(raw).hexdigest()[:20]


def normalized_slug(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
    text = re.sub(r"[^0-9a-z]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text


def nullable(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def verify_snapshot() -> tuple[dict, str]:
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
        raise SystemExit("event source snapshot mismatch:\n - " + "\n - ".join(errors))
    return snapshot, canonical_hash(snapshot)


def schema_registry() -> tuple[Registry, dict[str, dict]]:
    registry = Registry()
    schemas: dict[str, dict] = {}
    for name in (
        "content_item.schema.json",
        "event_source_manifest.schema.json",
        "event_source_bundle.schema.json",
        "event.schema.json",
        "event_relation.schema.json",
        "event_review_item.schema.json",
    ):
        payload = read_json(SCHEMA / name)
        schemas[name] = payload
        if payload.get("$id"):
            registry = registry.with_resource(payload["$id"], Resource.from_contents(payload))
        registry = registry.with_resource(name, Resource.from_contents(payload))
    return registry, schemas


def validate_json(payload, schema: dict, registry: Registry, label: str) -> None:
    validator = Draft202012Validator(schema, registry=registry)
    issues = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
    if issues:
        lines = []
        for issue in issues[:40]:
            at = ".".join(str(x) for x in issue.path)
            lines.append(f"{label}{'.' + at if at else ''}: {issue.message}")
        raise SystemExit("event source schema validation failed:\n - " + "\n - ".join(lines))


def load_targets() -> dict[str, set[str]]:
    targets: dict[str, set[str]] = {}
    for kind, (name, field) in TARGET_FILES.items():
        path = GEN / name
        if not path.is_file():
            raise SystemExit(f"M5.4 requires generated dependency: data/generated/{name}")
        payload = read_json(path)
        rows = payload if field is None else payload.get(field, [])
        targets[kind] = {str(row.get("id")) for row in rows if isinstance(row, dict) and row.get("id")}
    return targets


def iso_date_part(value: object, label: str) -> date:
    text = str(value or "")
    if len(text) < 10:
        raise ValueError(f"{label} must contain ISO date")
    return date.fromisoformat(text[:10])


def validate_temporal(row: dict) -> list[str]:
    errors: list[str] = []
    temporal = row.get("temporal") or {}
    try:
        start_date = iso_date_part(temporal.get("starts_at"), "starts_at")
    except Exception as exc:
        errors.append(str(exc))
        return errors
    end_value = temporal.get("ends_at")
    if end_value:
        try:
            end_date = iso_date_part(end_value, "ends_at")
            if end_date < start_date:
                errors.append("ends_at precedes starts_at")
        except Exception as exc:
            errors.append(str(exc))
    if not temporal.get("all_day"):
        starts = str(temporal.get("starts_at") or "")
        if "T" not in starts:
            errors.append("non-all-day event requires datetime starts_at")
        timezone_name = nullable(temporal.get("timezone"))
        if not timezone_name:
            errors.append("non-all-day event requires explicit IANA timezone")
        else:
            try:
                ZoneInfo(timezone_name)
            except (ZoneInfoNotFoundError, ValueError):
                errors.append("non-all-day event requires valid IANA timezone")
        if end_value and "T" not in str(end_value):
            errors.append("non-all-day event requires datetime ends_at when present")
        try:
            start_dt = datetime.fromisoformat(starts.replace("Z", "+00:00"))
            if start_dt.tzinfo is None or start_dt.utcoffset() is None:
                errors.append("non-all-day starts_at requires explicit UTC offset")
        except Exception:
            errors.append("invalid ISO datetime starts_at")
        if end_value and "T" in str(end_value):
            try:
                end_dt = datetime.fromisoformat(str(end_value).replace("Z", "+00:00"))
                if end_dt.tzinfo is None or end_dt.utcoffset() is None:
                    errors.append("non-all-day ends_at requires explicit UTC offset")
            except Exception:
                errors.append("invalid ISO datetime ends_at")
    recurrence = temporal.get("recurrence") or {}
    if recurrence.get("kind") == "rrule" and not nullable(recurrence.get("rrule")):
        errors.append("recurrence kind rrule requires rrule")
    if recurrence.get("kind") == "none" and recurrence.get("rrule") is not None:
        errors.append("recurrence kind none requires rrule=null")
    return errors


def target_reference_errors(refs: list[dict], targets: dict[str, set[str]]) -> list[str]:
    errors: list[str] = []
    for ref in refs:
        kind = str(ref.get("kind") or "")
        rid = str(ref.get("id") or "")
        if kind == "organisation":
            errors.append(f"organisation target {rid} cannot be canonical before M7 organisation registry")
        elif kind not in targets:
            errors.append(f"unsupported event reference kind {kind}")
        elif rid not in targets[kind]:
            errors.append(f"dangling event reference {kind}:{rid}")
    return errors


def normalize_references(row: dict) -> list[dict]:
    refs = [dict(ref) for ref in (row.get("references") or [])]
    venue = row.get("venue") or {}
    place_ref = nullable(venue.get("place_ref"))
    if place_ref and not any(ref.get("kind") == "place" and ref.get("id") == place_ref for ref in refs):
        refs.append({"kind": "place", "id": place_ref, "relation_type": "held_at"})
    organizer = row.get("organizer") or {}
    org_ref = nullable(organizer.get("organisation_ref"))
    if org_ref and not any(ref.get("kind") == "organisation" and ref.get("id") == org_ref for ref in refs):
        refs.append({"kind": "organisation", "id": org_ref, "relation_type": "organised_by"})
    unique: dict[tuple[str, str, str], dict] = {}
    for ref in refs:
        key = (str(ref.get("kind") or ""), str(ref.get("id") or ""), str(ref.get("relation_type") or ""))
        unique[key] = {"kind": key[0], "id": key[1], "relation_type": key[2]}
    return [unique[key] for key in sorted(unique)]


def source_record(provider: dict, row: dict, row_number: int) -> dict:
    return {
        "provider": provider["provider"],
        "source_id": str(row.get("source_id") or ""),
        "source_file": provider["source_file"],
        "source_row": row_number,
        "source_url": nullable(row.get("source_url")),
        "migrated_from": None,
    }


def event_slug(provider: str, source_id: str) -> str:
    base = normalized_slug(source_id)
    if not base:
        base = hashlib.sha256(f"{provider}:{source_id}".encode("utf-8")).hexdigest()[:12]
    return "event-" + base


def build(out_dir: Path) -> dict:
    _, source_hash = verify_snapshot()
    registry, schemas = schema_registry()
    manifest = read_json(MANIFEST_PATH)
    validate_json(manifest, schemas["event_source_manifest.schema.json"], registry, "source_manifest")
    targets = load_targets()

    events: list[dict] = []
    relations: list[dict] = []
    aliases: list[dict] = []
    review: list[dict] = []
    rejected: list[dict] = []
    source_rows = 0
    providers_seen: list[str] = []
    event_ids: set[str] = set()
    event_slugs: set[str] = set()
    alias_keys: set[str] = set()

    for provider in manifest.get("providers", []):
        providers_seen.append(provider["provider"])
        source_path = ROOT / provider["source_file"]
        bundle = read_json(source_path)
        validate_json(bundle, schemas["event_source_bundle.schema.json"], registry, provider["source_file"])
        if bundle.get("provider") != provider.get("provider") or bundle.get("trust_layer") != provider.get("trust_layer"):
            raise SystemExit(f"provider identity mismatch in {provider['source_file']}")
        for row_number, row in enumerate(bundle.get("events", []), 1):
            source_rows += 1
            sid = str(row.get("source_id") or "")
            record = source_record(provider, row, row_number)
            trust_layer = provider["trust_layer"]
            if trust_layer == "community":
                review.append({
                    "id": stable_id("pm-event-review-", provider["provider"], sid),
                    "status": "pending_review",
                    "provider": provider["provider"],
                    "source_id": sid,
                    "source_file": provider["source_file"],
                    "reason": "community_contribution_requires_verification",
                    "raw_event": row,
                })
                continue
            if row.get("status") == "draft":
                review.append({
                    "id": stable_id("pm-event-review-", provider["provider"], sid),
                    "status": "pending_review",
                    "provider": provider["provider"],
                    "source_id": sid,
                    "source_file": provider["source_file"],
                    "reason": "draft_is_not_canonical_delivery",
                    "raw_event": row,
                })
                continue

            row_errors = validate_temporal(row)
            freshness = row.get("freshness") or {}
            if not nullable(freshness.get("verified_at")):
                row_errors.append("canonical-eligible event requires freshness.verified_at")
            if not nullable(row.get("source_url")) and not nullable(row.get("evidence_note")):
                row_errors.append("canonical-eligible event requires source_url or evidence_note")
            refs = normalize_references(row)
            row_errors.extend(target_reference_errors(refs, targets))
            if row_errors:
                rejected.append({
                    "provider": provider["provider"],
                    "source_id": sid,
                    "source_file": provider["source_file"],
                    "source_row": row_number,
                    "reasons": sorted(set(row_errors)),
                    "raw_event": row,
                })
                continue

            eid = stable_id("pm-event-", provider["provider"], sid)
            slug = event_slug(provider["provider"], sid)
            if eid in event_ids:
                raise SystemExit(f"duplicate event id: {eid}")
            if slug in event_slugs:
                # Never silently merge by slug/title; collision becomes explicit source failure.
                raise SystemExit(f"duplicate event slug without explicit migration: {slug}")
            event_ids.add(eid)
            event_slugs.add(slug)
            event = {
                "id": eid,
                "slug": slug,
                "title": str(row.get("title") or "").strip(),
                "summary": nullable(row.get("summary")),
                "event_type": row["event_type"],
                "temporal": row["temporal"],
                "status": row["status"],
                "canonical_path": f"events/event.html?slug={slug}",
                "venue": row.get("venue"),
                "organizer": row.get("organizer"),
                "registration": row.get("registration"),
                "trust_layer": trust_layer,
                "verification_status": provider["verification_status"],
                "freshness": row["freshness"],
                "scope": {
                    "jurisdiction": (row.get("scope") or {}).get("jurisdiction", provider.get("jurisdiction")),
                    "tradition": (row.get("scope") or {}).get("tradition", provider.get("tradition")),
                    "locale": (row.get("scope") or {}).get("locale", provider.get("locale")),
                },
                "references": refs,
                "source_records": [record],
            }
            validate_json(event, schemas["event.schema.json"], registry, f"event:{sid}")
            events.append(event)

            for ref in refs:
                relation = {
                    "id": stable_id("pm-erel-", eid, ref["relation_type"], ref["kind"], ref["id"]),
                    "relation_type": ref["relation_type"],
                    "from": {"kind": "event", "id": eid},
                    "to": {"kind": ref["kind"], "id": ref["id"]},
                    "trust_layer": trust_layer,
                    "verification_status": provider["verification_status"],
                    "source_records": [record],
                }
                validate_json(relation, schemas["event_relation.schema.json"], registry, f"event_relation:{sid}")
                relations.append(relation)

            for alias in sorted(set(row.get("aliases") or [])):
                alias = str(alias).strip()
                if not alias:
                    continue
                if alias in alias_keys:
                    raise SystemExit(f"duplicate event alias: {alias}")
                alias_keys.add(alias)
                aliases.append({"alias": alias, "event_id": eid, "source_records": [record]})

    events.sort(key=lambda row: (str(row["temporal"]["starts_at"]), row["id"]))
    relations.sort(key=lambda row: row["id"])
    aliases.sort(key=lambda row: row["alias"])
    review.sort(key=lambda row: row["id"])
    rejected.sort(key=lambda row: (row["provider"], row.get("source_row") or 0, row["source_id"]))

    by_id = {}
    by_slug = {}
    by_start_date: dict[str, list[str]] = {}
    by_type: dict[str, list[str]] = {}
    by_target: dict[str, list[str]] = {}
    range_rows: list[dict] = []
    for row in events:
        start_date = str(row["temporal"]["starts_at"])[:10]
        end_date = str(row["temporal"].get("ends_at") or row["temporal"]["starts_at"])[:10]
        by_id[row["id"]] = {
            "slug": row["slug"], "event_type": row["event_type"], "starts_at": row["temporal"]["starts_at"],
            "ends_at": row["temporal"].get("ends_at"), "status": row["status"], "trust_layer": row["trust_layer"]
        }
        by_slug[row["slug"]] = row["id"]
        by_start_date.setdefault(start_date, []).append(row["id"])
        by_type.setdefault(row["event_type"], []).append(row["id"])
        range_rows.append({"id": row["id"], "date_start": start_date, "date_end": end_date})
    for rel in relations:
        key = rel["to"]["kind"] + ":" + rel["to"]["id"]
        by_target.setdefault(key, []).append(rel["from"]["id"])
    for mapping in (by_start_date, by_type, by_target):
        for key in list(mapping):
            mapping[key] = sorted(set(mapping[key]))

    coverage = None
    if range_rows:
        coverage = {
            "valid_from": min(row["date_start"] for row in range_rows),
            "valid_to": max(row["date_end"] for row in range_rows),
        }

    payloads = {
        "event_records.json": {"schema_version": "1.0.0", "source_snapshot_sha256": source_hash, "count": len(events), "events": events},
        "event_relations.json": {"schema_version": "1.0.0", "source_snapshot_sha256": source_hash, "count": len(relations), "relations": relations},
        "event_aliases.json": {"schema_version": "1.0.0", "source_snapshot_sha256": source_hash, "count": len(aliases), "aliases": aliases},
        "event_review_queue.json": {"schema_version": "1.0.0", "source_snapshot_sha256": source_hash, "count": len(review), "items": review},
        "event_rejected.json": {"schema_version": "1.0.0", "source_snapshot_sha256": source_hash, "count": len(rejected), "items": rejected},
        "event_index.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "counts": {"events": len(events), "relations": len(relations), "aliases": len(aliases), "review_queue": len(review), "rejected": len(rejected)},
            "coverage": coverage,
            "by_id": dict(sorted(by_id.items())), "by_slug": dict(sorted(by_slug.items())),
            "by_start_date": dict(sorted(by_start_date.items())), "by_type": dict(sorted(by_type.items())),
            "by_target": dict(sorted(by_target.items())), "ranges": sorted(range_rows, key=lambda x: (x["date_start"], x["date_end"], x["id"])),
        },
        "event_report.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "providers": providers_seen,
            "source_rows": source_rows,
            "accepted_events": len(events), "relations": len(relations), "aliases": len(aliases),
            "community_or_draft_review_queue": len(review), "rejected_rows": len(rejected),
            "inferred_text_links": 0,
            "legacy_journal_promoted_to_events": 0,
            "policy": {
                "automatic_text_to_event_promotion": False,
                "automatic_title_place_binding": False,
                "community_writes_canonical": False,
                "organisation_is_place": False
            }
        },
    }
    for name, payload in payloads.items():
        write_json(out_dir / name, payload)
    print(
        f"events={len(events)} relations={len(relations)} aliases={len(aliases)} "
        f"review={len(review)} rejected={len(rejected)} source_rows={source_rows}"
    )
    return payloads


def main() -> int:
    parser = ArgumentParser(description="Build M5.4 canonical Event domain")
    parser.add_argument("--out-dir", default=str(GEN))
    args = parser.parse_args()
    build(Path(args.out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
