#!/usr/bin/env python3
from __future__ import annotations

from html.parser import HTMLParser
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlsplit
import hashlib
import json
import os
import re
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "data" / "generated"
ERRORS: list[str] = []
WARNINGS: list[str] = []
SKIP_SCHEMES = ("http:", "https:", "mailto:", "tel:", "javascript:", "data:")


def err(msg: str) -> None:
    ERRORS.append(msg)


def warn(msg: str) -> None:
    WARNINGS.append(msg)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        err(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
        return None


def unique_ids(rows: list[dict], label: str) -> set[str]:
    seen: set[str] = set()
    for i, row in enumerate(rows):
        rid = str(row.get("id") or "")
        if not rid:
            err(f"{label}[{i}] missing id")
        elif rid in seen:
            err(f"{label}: duplicate id {rid}")
        else:
            seen.add(rid)
    return seen


def rows_from(name: str, key: str | None = None) -> list[dict]:
    data = load_json(GEN / name)
    if data is None:
        return []
    if key is None:
        if not isinstance(data, list):
            err(f"data/generated/{name}: expected list")
            return []
        return data
    rows = data.get(key) if isinstance(data, dict) else None
    if not isinstance(rows, list):
        err(f"data/generated/{name}: expected list field {key}")
        return []
    count = data.get("count")
    if isinstance(count, int) and count != len(rows):
        err(f"data/generated/{name}: count={count}, actual={len(rows)}")
    return rows


class RefParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ("href", "src"):
            value = attrs.get(key)
            if value:
                self.refs.append((key, value.strip()))


def local_target(base: Path, value: str) -> Path | None:
    if not value or value == "#" or value.startswith("#"):
        return None
    lower = value.lower()
    if lower.startswith(SKIP_SCHEMES) or value.startswith("//"):
        return None
    path = unquote(urlsplit(value).path)
    if not path:
        return None
    return (ROOT / path.lstrip("/")) if path.startswith("/") else (base / path).resolve()


def check_required() -> None:
    required = [
        "VERSION", "requirements.txt", "manifest.json", "index.html", "journal.html", "news.html", "calendar.html", "events.html",
        "catalog/catalog.html", "objects/place.html", "routes/route.html", "articles/article.html",
        "calendar/day.html", "calendar/item.html", "events/event.html",
        "js/data-layer.js", "js/content-layer.js", "js/news-layer.js", "js/news.js", "js/news-item.js", "js/knowledge-layer.js", "js/my-pm-layer.js", "js/liturgical-layer.js", "js/event-layer.js", "js/food-layer.js", "js/profile.js", "schemas/my_pm_state.schema.json",
        "tools/import_places.py", "tools/dedupe_places.py", "tools/build_indexes.py",
        "tools/import_graph_sources.py", "tools/build_graph.py", "tools/build_content.py",
        "tools/build_liturgical.py", "tools/build_food.py", "tools/build_events.py", "tools/build_news.py", "tools/build_library.py", "tools/run_m2.py", "tools/check_project.py", "tools/check_runtime.js",
        "data/generated/places_deduped.json", "data/generated/index.json", "data/generated/regions_manifest.json",
        "data/generated/entities.json", "data/generated/relations.json", "data/generated/routes.json", "data/generated/graph_index.json",
        "data/generated/content_items.json", "data/generated/content_index.json",
        "data/news_sources/source_manifest.json", "data/schema/news_source_snapshot.json", "data/schema/news_source_manifest.schema.json", "data/schema/news_record.schema.json", "data/schema/news_relation.schema.json", "data/schema/news_review_item.schema.json",
        "data/generated/news_sources.json", "data/generated/news_records.json", "data/generated/news_relations.json", "data/generated/news_review_queue.json", "data/generated/news_index.json", "data/generated/news_report.json",
        "data/library_sources/source_manifest.json", "data/library_sources/rights_taxonomy.json", "data/library_sources/scripture_catalog_azbyka_2026-10-05.json", "data/library_sources/rights_cleared_assets_2026-10-05.json", "data/schema/library_source_snapshot.json",
        "data/schema/library_source_manifest.schema.json", "data/schema/library_rights_policy.schema.json", "data/schema/library_scripture_catalog.schema.json", "data/schema/library_rights_cleared_assets.schema.json", "data/schema/library_scripture_reference.schema.json", "data/schema/library_work.schema.json", "data/schema/library_author.schema.json", "data/schema/library_edition.schema.json", "data/schema/library_text_asset.schema.json", "data/schema/library_media_asset.schema.json", "data/schema/library_relation.schema.json", "data/schema/library_review_item.schema.json",
        "data/generated/library_sources.json", "data/generated/library_rights.json", "data/generated/library_authors.json", "data/generated/library_works.json", "data/generated/library_editions.json", "data/generated/library_scripture_references.json", "data/generated/library_text_assets.json", "data/generated/library_media_assets.json", "data/generated/library_relations.json", "data/generated/library_review_queue.json", "data/generated/library_rejected.json", "data/generated/library_index.json", "data/generated/library_report.json",
        "data/generated/calendar_days.json", "data/generated/liturgical_index.json",
        "data/generated/event_records.json", "data/generated/event_index.json",
        "data/generated/recipe_records.json", "data/generated/food_relations.json", "data/generated/food_index.json",
        "food.html", "food/recipe.html", "css/food.css", "js/food.js", "js/food-page.js",
        "css/news.css", "news/item.html",
        "library.html", "library/item.html", "css/library.css", "js/library-layer.js", "js/library.js", "js/library-item.js", "tools/build_library.py",
        "pilgrim/infrastructure.html", "pilgrim/item.html", "css/pilgrim.css", "js/pilgrim-layer.js", "js/pilgrim-infrastructure.js", "js/pilgrim-item.js",
        "tools/build_pilgrim.py", "data/pilgrim_sources/source_manifest.json", "data/pilgrim_sources/amenity_types.json", "data/schema/pilgrim_source_snapshot.json",
        "data/generated/amenity_types.json", "data/generated/amenity_records.json", "data/generated/pilgrim_service_records.json",
        "data/generated/pilgrim_relations.json", "data/generated/pilgrim_review_queue.json", "data/generated/pilgrim_index.json",
        "docs/PROJECT_STATE.md", "docs/ROADMAP.md", "docs/MANIFEST.md", "docs/DATA_MODEL.md",
    ]
    for rel in required:
        if not (ROOT / rel).exists():
            err(f"missing required file: {rel}")


def check_json_tree() -> None:
    for path in sorted((ROOT / "data").rglob("*.json")):
        load_json(path)
    load_json(ROOT / "manifest.json")


def check_web_refs() -> None:
    legacy = {"temples_page.html"}
    for path in sorted(ROOT.rglob("*.html")):
        if path.relative_to(ROOT).as_posix() in legacy:
            continue
        parser = RefParser()
        try:
            parser.feed(path.read_text(encoding="utf-8-sig", errors="replace"))
        except Exception as exc:
            err(f"HTML parse failed {path.relative_to(ROOT)}: {exc}")
            continue
        for attr, value in parser.refs:
            if value.startswith("/"):
                err(f"{path.relative_to(ROOT)}: root-absolute {attr}={value!r}")
            target = local_target(path.parent, value)
            if target is not None and not target.exists():
                err(f"{path.relative_to(ROOT)}: broken {attr}={value!r}")
    url_re = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I)
    for path in sorted(ROOT.rglob("*.css")):
        for _, value in url_re.findall(path.read_text(encoding="utf-8-sig", errors="replace")):
            value = value.strip()
            if not value or value.lower().startswith(SKIP_SCHEMES):
                continue
            target = local_target(path.parent, value)
            if target is not None and not target.exists():
                err(f"{path.relative_to(ROOT)}: broken asset {value!r}")


def check_core_data() -> dict[str, set[str]]:
    places = rows_from("places_deduped.json")
    place_ids = unique_ids(places, "places")
    place_slugs = [str(x.get("slug") or "") for x in places]
    if len(set(place_slugs)) != len(place_slugs) or "" in place_slugs:
        err("places: slugs must be non-empty and unique")

    index = load_json(GEN / "index.json") or {}
    regions = load_json(GEN / "regions_manifest.json") or {}
    if index.get("place_count") != len(places):
        err("index.json place_count mismatch")
    if regions.get("place_count") != len(places):
        err("regions_manifest.json place_count mismatch")
    if index.get("region_count") != regions.get("region_count"):
        err("index/regions_manifest region_count mismatch")
    if len(index.get("by_id") or {}) != len(place_ids):
        err("index.json by_id coverage mismatch")

    entities_obj = load_json(GEN / "entities.json") or {}
    relations_obj = load_json(GEN / "relations.json") or {}
    routes_obj = load_json(GEN / "routes.json") or {}
    entities = entities_obj.get("entities") if isinstance(entities_obj, dict) else []
    relations = relations_obj.get("relations") if isinstance(relations_obj, dict) else []
    routes = routes_obj.get("routes") if isinstance(routes_obj, dict) else []
    if not isinstance(entities, list): entities = []
    if not isinstance(relations, list): relations = []
    if not isinstance(routes, list): routes = []
    entity_ids = unique_ids(entities, "entities")
    route_ids = unique_ids(routes, "routes")
    unique_ids(relations, "relations")
    targets = {"place": place_ids, "entity": entity_ids, "route": route_ids}
    for row in relations:
        for side in ("from", "to"):
            ref = row.get(side) or {}
            kind, rid = str(ref.get("kind") or ""), str(ref.get("id") or "")
            if kind in targets and rid not in targets[kind]:
                err(f"graph relation {row.get('id')}: dangling {side} {kind}:{rid}")
    for route in routes:
        for stop in route.get("stops") or []:
            pid = str(stop.get("place_id") or "")
            if pid and pid not in place_ids:
                err(f"route {route.get('id')}: dangling stop {pid}")
    return targets


def check_content(targets: dict[str, set[str]]) -> None:
    items = rows_from("content_items.json", "items")
    content_ids = unique_ids(items, "content")
    slugs = [str(x.get("slug") or "") for x in items]
    if "" in slugs or len(slugs) != len(set(slugs)):
        err("content: slugs must be non-empty and unique")
    index = load_json(GEN / "content_index.json") or {}
    counts = index.get("counts") or {}
    if counts.get("content") not in (None, len(items)):
        err("content_index count mismatch")
    targets["content"] = content_ids


def check_content_links(targets: dict[str, set[str]]) -> None:
    links = rows_from("content_links.json", "links")
    unique_ids(links, "content_links")
    index = load_json(GEN / "content_index.json") or {}
    counts = index.get("counts") or {}
    if counts.get("links") != len(links):
        err("content_index counts.links mismatch")
    for row in links:
        src = row.get("from") or {}
        dst = row.get("to") or {}
        if src.get("kind") != "content" or src.get("id") not in targets.get("content", set()):
            err(f"content link {row.get('id')}: invalid content source")
        kind, rid = str(dst.get("kind") or ""), str(dst.get("id") or "")
        if kind not in targets:
            err(f"content link {row.get('id')}: unsupported target kind {kind}")
        elif rid not in targets[kind]:
            err(f"content link {row.get('id')}: dangling target {kind}:{rid}")
        if row.get("verification_status") not in {"source_verified", "editorial_verified"}:
            err(f"content link {row.get('id')}: invalid verification status")


def check_liturgical(targets: dict[str, set[str]]) -> None:
    specs = {
        "calendar_day": ("calendar_days.json", "days"),
        "feast": ("feasts.json", "feasts"),
        "saint": ("saints.json", "saints"),
        "commemoration": ("commemorations.json", "commemorations"),
        "fasting_rule": ("fasting_rules.json", "rules"),
        "reading": ("readings.json", "readings"),
    }
    for kind, (name, key) in specs.items():
        rows = rows_from(name, key)
        targets[kind] = unique_ids(rows, kind)
        if kind == "calendar_day":
            dates = [str(x.get("date") or "") for x in rows]
            if "" in dates or len(dates) != len(set(dates)):
                err("calendar_day dates must be non-empty and unique")
        if kind == "fasting_rule":
            for row in rows:
                if str(row.get("date_start") or "") > str(row.get("date_end") or ""):
                    err(f"fasting_rule {row.get('id')}: invalid date range")

    reading_rows = rows_from("readings.json", "readings")
    reading_source = load_json(ROOT / "data/liturgical_sources/readings_2026_editorial.json") or {}
    expected_readings = sum(len(day.get("readings") or []) for day in (reading_source.get("days") or []))
    if len(reading_rows) != expected_readings or expected_readings != 48:
        err(f"v1.22 readings count mismatch: generated={len(reading_rows)} source={expected_readings}")
    for row in reading_rows:
        if row.get("verification_status") != "editorial_verified" or row.get("text_ref") is not None:
            err(f"reading {row.get('id')}: must be editorial_verified citation-only")
        records = row.get("source_records") or []
        if not records or not all(str(rec.get("source_url") or "").startswith("https://azbyka.ru/days/2026-") for rec in records):
            err(f"reading {row.get('id')}: missing captured source URL")
        if not any((ref.get("kind"), ref.get("id")) == ("calendar_day", f"pm-day-{row.get('date')}") for ref in (row.get("references") or [])):
            err(f"reading {row.get('id')}: missing calendar_day reference")

    relations = rows_from("liturgical_relations.json", "relations")
    unique_ids(relations, "liturgical_relations")
    for row in relations:
        for side in ("from", "to"):
            ref = row.get(side) or {}
            kind, rid = str(ref.get("kind") or ""), str(ref.get("id") or "")
            if kind in targets and rid not in targets[kind]:
                err(f"liturgical relation {row.get('id')}: dangling {side} {kind}:{rid}")
    reading_relation_targets = {str((row.get("to") or {}).get("id") or "") for row in relations if row.get("relation_type") == "has_reading" and (row.get("to") or {}).get("kind") == "reading"}
    if reading_relation_targets != targets.get("reading", set()):
        err("v1.22 calendar_day -> reading relation coverage mismatch")

    aliases = rows_from("liturgical_aliases.json", "aliases")
    for row in aliases:
        for target in row.get("targets") or []:
            kind, rid = str(target.get("kind") or ""), str(target.get("id") or "")
            if kind in targets and rid not in targets[kind]:
                err(f"liturgical alias {row.get('legacy_id')}: dangling target {kind}:{rid}")


def check_events(targets: dict[str, set[str]]) -> None:
    events = rows_from("event_records.json", "events")
    event_ids = unique_ids(events, "events")
    targets["event"] = event_ids
    slugs = [str(x.get("slug") or "") for x in events]
    if "" in slugs or len(slugs) != len(set(slugs)):
        err("events: slugs must be non-empty and unique")
    relations = rows_from("event_relations.json", "relations")
    unique_ids(relations, "event_relations")
    for row in relations:
        src = row.get("from") or {}
        dst = row.get("to") or {}
        if src.get("kind") != "event" or src.get("id") not in event_ids:
            err(f"event relation {row.get('id')}: invalid event source")
        kind, rid = str(dst.get("kind") or ""), str(dst.get("id") or "")
        if kind in targets and rid not in targets[kind]:
            err(f"event relation {row.get('id')}: dangling target {kind}:{rid}")
    review = rows_from("event_review_queue.json", "items")
    unique_ids(review, "event_review_queue")
    rejected = rows_from("event_rejected.json", "items")
    index = load_json(GEN / "event_index.json") or {}
    counts = index.get("counts") or {}
    expected = {"events": len(events), "relations": len(relations), "review_queue": len(review), "rejected": len(rejected)}
    for key, value in expected.items():
        if counts.get(key) != value:
            err(f"event_index counts.{key} mismatch")



def check_food(targets: dict[str, set[str]]) -> None:
    recipes = rows_from("recipe_records.json", "recipes")
    recipe_ids = unique_ids(recipes, "recipes")
    targets["recipe"] = recipe_ids
    slugs = [str(x.get("slug") or "") for x in recipes]
    if "" in slugs or len(slugs) != len(set(slugs)):
        err("recipes: slugs must be non-empty and unique")
    relations = rows_from("food_relations.json", "relations")
    unique_ids(relations, "food_relations")
    for row in relations:
        src = row.get("from") or {}
        dst = row.get("to") or {}
        if src.get("kind") != "recipe" or src.get("id") not in recipe_ids:
            err(f"food relation {row.get('id')}: invalid recipe source")
        kind, rid = str(dst.get("kind") or ""), str(dst.get("id") or "")
        if kind in targets and rid not in targets[kind]:
            err(f"food relation {row.get('id')}: dangling target {kind}:{rid}")
        if row.get("relation_class") == "editorial_guidance" and row.get("verification_status") != "editorial_guidance":
            err(f"food relation {row.get('id')}: editorial guidance status mismatch")
    index = load_json(GEN / "food_index.json") or {}
    counts = index.get("counts") or {}
    if counts.get("recipes") != len(recipes) or counts.get("relations") != len(relations):
        err("food_index counts mismatch")
    report = load_json(GEN / "food_report.json") or {}
    if report.get("canonical_liturgical_prescriptions_created") != 0:
        err("food domain must not create canonical liturgical prescriptions")



def check_pilgrim(targets: dict[str, set[str]]) -> None:
    types = rows_from("amenity_types.json", "types")
    type_ids = unique_ids(types, "amenity_types")
    if len(types) != 12:
        err(f"v1.25 amenity taxonomy count mismatch: {len(types)}")
    keys = [str(x.get("key") or "") for x in types]
    if "" in keys or len(keys) != len(set(keys)):
        err("amenity types: keys must be non-empty and unique")
    if any(x.get("trust_layer") != "canonical_system" or x.get("verification_status") != "system_defined" for x in types):
        err("v1.25 amenity taxonomy must stay canonical_system/system_defined")

    amenities = rows_from("amenity_records.json", "amenities")
    services = rows_from("pilgrim_service_records.json", "services")
    relations = rows_from("pilgrim_relations.json", "relations")
    review = rows_from("pilgrim_review_queue.json", "items")
    conflicts = rows_from("pilgrim_conflicts.json", "items")
    rejected = rows_from("pilgrim_rejected.json", "items")
    amenity_ids = unique_ids(amenities, "amenities")
    service_ids = unique_ids(services, "pilgrim_services")
    unique_ids(relations, "pilgrim_relations")
    unique_ids(review, "pilgrim_review_queue")
    unique_ids(conflicts, "pilgrim_conflicts")
    targets["amenity"] = amenity_ids
    targets["service"] = service_ids

    if len(amenities) != 2 or len(services) != 2 or len(relations) != 4:
        err(f"v1.25 verified pilgrim count mismatch: amenities={len(amenities)} services={len(services)} relations={len(relations)}")
    if len(review) != 85 or len(conflicts) != 1 or rejected:
        err(f"v1.25 evidence preservation mismatch: review={len(review)} conflicts={len(conflicts)} rejected={len(rejected)}")
    legacy_services = rows_from("pilgrim_services.json", "services")
    legacy_ids = {str(x.get("id") or "") for x in legacy_services}
    review_legacy_ids = {str(x.get("legacy_ref") or "") for x in review}
    if legacy_ids != review_legacy_ids:
        err("v1.25 pilgrim review queue must preserve all legacy Content compatibility IDs")
    promoted = [x for x in review if x.get("review_status") == "promoted"]
    if len(promoted) != 2:
        err(f"v1.25 must have exactly 2 evidence-backed legacy promotions, got {len(promoted)}")
    for row in review:
        status = row.get("review_status")
        refs = row.get("candidate_refs") or []
        evidence = row.get("evidence") or []
        if status == "promoted":
            if len(refs) != 1 or refs[0].get("kind") != "place" or refs[0].get("basis") != "explicit_evidence" or not evidence:
                err(f"pilgrim review {row.get('id')}: promoted row lacks explicit evidence binding")
        elif status == "needs_evidence":
            if refs or evidence:
                err(f"pilgrim review {row.get('id')}: unverified row must not gain refs/evidence")
        else:
            err(f"pilgrim review {row.get('id')}: unexpected status {status}")
        records = row.get("source_records") or []
        if not records or records[0].get("provider") != "pravmir-legacy-pilgrim-services":
            err(f"pilgrim review {row.get('id')}: legacy provenance missing")

    for row in amenities + services:
        if row.get("trust_layer") != "editorial" or row.get("verification_status") != "source_verified":
            err(f"canonical pilgrim record {row.get('id')}: must be editorial/source_verified in M5.6.2")
        fresh = row.get("freshness") or {}
        if set(fresh) != {"observed_at", "verified_at", "valid_from", "valid_to", "expires_at"} or not fresh.get("observed_at") or not fresh.get("verified_at"):
            err(f"canonical pilgrim record {row.get('id')}: incomplete freshness contract")
        records = row.get("source_records") or []
        if not records or records[0].get("provider") != "pravmir-editorial-pilgrim-verification-2026-10-04" or not records[0].get("source_url"):
            err(f"canonical pilgrim record {row.get('id')}: official-source evidence missing")

    for row in relations:
        src = row.get("from") or {}; dst = row.get("to") or {}
        sk, sid = str(src.get("kind") or ""), str(src.get("id") or "")
        dk, did = str(dst.get("kind") or ""), str(dst.get("id") or "")
        if sk not in {"amenity", "service"} or sid not in targets.get(sk, set()):
            err(f"pilgrim relation {row.get('id')}: invalid source")
        if row.get("verification_status") != "source_verified":
            err(f"pilgrim relation {row.get('id')}: relation must be source_verified")
        if dk == "organisation":
            err(f"pilgrim relation {row.get('id')}: organisation relation forbidden before M7")
        elif dk not in targets or did not in targets.get(dk, set()):
            err(f"pilgrim relation {row.get('id')}: dangling target {dk}:{did}")

    if any(x.get("resolution_status") != "unresolved" or len(x.get("values") or []) < 2 for x in conflicts):
        err("v1.25 pilgrim conflict must preserve unresolved multi-source evidence")
    index = load_json(GEN / "pilgrim_index.json") or {}
    counts = index.get("counts") or {}
    expected = {"amenity_types":len(types), "amenities":len(amenities), "services":len(services), "relations":len(relations), "review_queue":len(review), "conflicts":len(conflicts), "rejected":len(rejected)}
    for key, value in expected.items():
        if counts.get(key) != value:
            err(f"pilgrim_index counts.{key} mismatch")
    report = load_json(GEN / "pilgrim_report.json") or {}
    if report.get("legacy_records_promoted_with_explicit_evidence") != 2 or report.get("source_verified_canonical_records") != 4 or report.get("unresolved_evidence_conflicts") != 1:
        err("v1.25 pilgrim trust report count mismatch")
    if report.get("inferred_place_route_organisation_links_created") != 0 or report.get("organisation_entities_created") != 0:
        err("v1.25 pilgrim trust report indicates forbidden inference/organisation creation")

    # M5.6.4 domain gate: deep links, freshness, provenance and integration must stay explicit.
    canonical = amenities + services
    paths = [str(x.get("canonical_path") or "") for x in canonical]
    slugs = [str(x.get("slug") or "") for x in canonical]
    if len(set(paths)) != len(paths) or len(set(slugs)) != len(slugs) or any(not p.startswith("pilgrim/item.html?slug=") for p in paths):
        err("M5.6 domain gate: canonical deep links/slugs must be unique and use pilgrim/item.html")
    for row in canonical:
        if row.get("slug") not in str(row.get("canonical_path") or ""):
            err(f"M5.6 domain gate: canonical path does not contain slug for {row.get('id')}")
        fresh = row.get("freshness") or {}
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(fresh.get("verified_at") or "")):
            err(f"M5.6 domain gate: invalid verified_at for {row.get('id')}")
        for src in row.get("source_records") or []:
            url = str(src.get("source_url") or "")
            if not url.startswith("https://"):
                err(f"M5.6 domain gate: non-HTTPS canonical evidence for {row.get('id')}")

    place_relation_counts: dict[str, int] = {}
    direct_route_relations = 0
    organisation_relations = 0
    for row in relations:
        dst = row.get("to") or {}
        kind, rid = str(dst.get("kind") or ""), str(dst.get("id") or "")
        if row.get("trust_layer") != "editorial":
            err(f"M5.6 domain gate: relation {row.get('id')} must stay editorial trust layer")
        if kind == "place":
            place_relation_counts[rid] = place_relation_counts.get(rid, 0) + 1
        elif kind == "route":
            direct_route_relations += 1
        elif kind == "organisation":
            organisation_relations += 1
        for src in row.get("source_records") or []:
            if not str(src.get("source_url") or "").startswith("https://"):
                err(f"M5.6 domain gate: relation {row.get('id')} lacks HTTPS evidence")
    expected_place_relations = {
        "pm-9e8bc6fff182514f91cf1739e41d2839": 3,
        "pm-364155d04b9c5e14b86956cd81e950c0": 1,
    }
    if place_relation_counts != expected_place_relations or direct_route_relations != 0 or organisation_relations != 0:
        err(f"M5.6 domain gate: relation topology changed: places={place_relation_counts}, routes={direct_route_relations}, organisations={organisation_relations}")

    for row in promoted:
        refs = row.get("candidate_refs") or []
        if refs and str(refs[0].get("id") or "") not in targets.get("place", set()):
            err(f"M5.6 domain gate: promoted review {row.get('id')} targets missing place")
    canonical_names = {str(x.get("name") or x.get("title") or "").casefold() for x in canonical}
    for conflict in conflicts:
        if str(conflict.get("candidate_name") or "").casefold() in canonical_names:
            err(f"M5.6 domain gate: unresolved conflict {conflict.get('id')} leaked into canonical records")
        if any(not str(v.get("source_url") or "").startswith("https://") for v in conflict.get("values") or []):
            err(f"M5.6 domain gate: conflict {conflict.get('id')} has invalid evidence URL")

    snapshot_hash = str(index.get("source_snapshot_sha256") or "")
    for filename in ("amenity_types.json", "amenity_records.json", "pilgrim_service_records.json", "pilgrim_relations.json", "pilgrim_review_queue.json", "pilgrim_conflicts.json"):
        payload = load_json(GEN / filename) or {}
        if payload.get("source_snapshot_sha256") != snapshot_hash:
            err(f"M5.6 domain gate: {filename} snapshot hash diverges from pilgrim_index")



def check_news(targets: dict[str, set[str]]) -> None:
    # M5.7.4 News Domain Gate: schemas + stable IDs + temporal/provenance +
    # legacy isolation + explicit relation evidence + deterministic indexes.
    schema_expectations = {
        "news_record.schema.json": {
            "id", "slug", "title", "summary", "status", "published_at", "updated_at",
            "canonical_path", "original_url", "publisher", "trust_layer", "verification_status",
            "freshness", "source_records",
        },
        "news_relation.schema.json": {"id", "relation_type", "from", "to", "trust_layer", "verification_status", "source_records"},
        "news_review_item.schema.json": {
            "id", "title", "summary", "published_on", "source_url", "publisher_text", "trust_layer",
            "verification_status", "review_status", "legacy_content_ref", "source_records",
        },
        "news_source_manifest.schema.json": {"schema_version", "domain", "providers"},
    }
    for name, required in schema_expectations.items():
        schema = load_json(ROOT / "data" / "schema" / name) or {}
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema" or schema.get("additionalProperties") is not False:
            err(f"M5.7 domain gate: {name} must stay Draft 2020-12 with closed top-level properties")
        if set(schema.get("required") or []) != required:
            err(f"M5.7 domain gate: {name} required-field contract changed")
    record_schema = load_json(ROOT / "data/schema/news_record.schema.json") or {}
    relation_schema = load_json(ROOT / "data/schema/news_relation.schema.json") or {}
    review_schema = load_json(ROOT / "data/schema/news_review_item.schema.json") or {}
    if ((record_schema.get("properties") or {}).get("id") or {}).get("pattern") != r"^pm-news-[0-9a-f]{20}$":
        err("M5.7 domain gate: canonical news stable-ID schema changed")
    if ((relation_schema.get("properties") or {}).get("id") or {}).get("pattern") != r"^pm-news-rel-[0-9a-f]{20}$":
        err("M5.7 domain gate: relation stable-ID schema changed")
    if ((review_schema.get("properties") or {}).get("id") or {}).get("pattern") != r"^pm-news-review-[0-9a-f]{20}$":
        err("M5.7 domain gate: review stable-ID schema changed")

    snapshot = load_json(ROOT / "data/schema/news_source_snapshot.json") or {}
    if snapshot.get("domain") != "news" or snapshot.get("schema_version") != "1.0.0":
        err("M5.7 domain gate: invalid News source snapshot contract")
    snapshot_files = snapshot.get("files") if isinstance(snapshot.get("files"), list) else []
    expected_snapshot_paths = {
        "data/news_sources/source_manifest.json",
        "data/content_sources/journalpp_legacy.json",
        "data/news_sources/verified_records_2026-10-05.json",
    }
    if {str(row.get("path") or "") for row in snapshot_files} != expected_snapshot_paths:
        err("M5.7 domain gate: News source snapshot file coverage changed")
    for row in snapshot_files:
        relpath = str(row.get("path") or "")
        source = ROOT / relpath
        if not source.is_file():
            err(f"M5.7 domain gate: source snapshot target missing: {relpath}")
            continue
        if source.stat().st_size != row.get("size") or hashlib.sha256(source.read_bytes()).hexdigest() != row.get("sha256"):
            err(f"M5.7 domain gate: source snapshot mismatch: {relpath}")
    snapshot_hash = hashlib.sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    manifest = load_json(ROOT / "data/news_sources/source_manifest.json") or {}
    providers = manifest.get("providers") if isinstance(manifest.get("providers"), list) else []
    provider_map = {str(row.get("provider") or ""): row for row in providers}
    if len(provider_map) != 2 or "pravmir-legacy-journalpp" not in provider_map or "pravmir-editorial-patriarchia-verification-2026-10-05" not in provider_map:
        err("M5.7 domain gate: News provider manifest topology changed")

    sources = rows_from("news_sources.json", "sources")
    news = rows_from("news_records.json", "news")
    relations = rows_from("news_relations.json", "relations")
    review = rows_from("news_review_queue.json", "items")
    rejected = rows_from("news_rejected.json", "items")
    news_ids = unique_ids(news, "news")
    relation_ids = unique_ids(relations, "news_relations")
    review_ids = unique_ids(review, "news_review_queue")
    targets["news"] = news_ids

    if len(sources) != 2 or len(news) != 4 or len(relations) != 1 or len(review) != 5 or rejected:
        err(f"M5.7 domain gate count mismatch: sources={len(sources)} news={len(news)} relations={len(relations)} review={len(review)} rejected={len(rejected)}")
    if news_ids & review_ids or news_ids & relation_ids or review_ids & relation_ids:
        err("M5.7 domain gate: canonical/review/relation stable-ID namespaces collided")

    generated_sources = {str(row.get("provider") or ""): row for row in sources}
    if set(generated_sources) != set(provider_map):
        err("M5.7 domain gate: generated provider set diverges from manifest")
    for provider, source in generated_sources.items():
        declared = provider_map.get(provider) or {}
        for key in ("provider", "label", "mode", "trust_layer", "verification_status", "jurisdiction", "origin_url", "notes"):
            if source.get(key) != declared.get(key):
                err(f"M5.7 domain gate: generated source metadata mismatch for {provider}:{key}")

    legacy = provider_map.get("pravmir-legacy-journalpp", {})
    verified_provider = "pravmir-editorial-patriarchia-verification-2026-10-05"
    verified = provider_map.get(verified_provider, {})
    if legacy.get("mode") != "review_only" or legacy.get("trust_layer") != "legacy_unverified" or legacy.get("verification_status") != "legacy_unverified":
        err("M5.7 domain gate: legacy source must remain review_only/legacy_unverified")
    if verified.get("mode") != "canonical_source" or verified.get("trust_layer") != "editorial" or verified.get("verification_status") != "source_verified":
        err("M5.7 domain gate: verified source contract mismatch")

    raw_verified = load_json(ROOT / str(verified.get("source_file") or "")) or {}
    raw_rows = raw_verified.get(str(verified.get("source_section") or "records")) if isinstance(raw_verified, dict) else []
    if not isinstance(raw_rows, list) or len(raw_rows) != 4:
        err("M5.7 domain gate: verified source bundle must contain exactly four current records")
        raw_rows = []
    raw_by_sid = {str(row.get("source_id") or ""): (index + 1, row) for index, row in enumerate(raw_rows)}

    content_news = rows_from("content_items.json", "items")
    legacy_content_ids = {
        str(row.get("id") or "") for row in content_news
        if row.get("content_type") == "news" and row.get("verification_status") == "legacy_curated"
    }
    review_bridge_ids = {str(row.get("legacy_content_ref") or "") for row in review}
    if len(legacy_content_ids) != 5 or review_bridge_ids != legacy_content_ids:
        err("M5.7 domain gate: legacy review bridge changed")
    for row in review:
        if row.get("trust_layer") != "legacy_unverified" or row.get("verification_status") != "legacy_unverified" or row.get("review_status") != "needs_source_verification":
            err(f"news review {row.get('id')}: legacy isolation/trust changed")
        records = row.get("source_records") or []
        if len(records) != 1 or records[0].get("provider") != "pravmir-legacy-journalpp":
            err(f"news review {row.get('id')}: legacy provenance missing")

    def stable(prefix: str, *parts: object) -> str:
        return prefix + hashlib.sha256("\x1f".join(map(str, parts)).encode()).hexdigest()[:20]

    def slug(value: object) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
        return normalized or "news"

    def parse_dt(value: object, label: str):
        try:
            return datetime.fromisoformat(str(value))
        except Exception:
            err(f"M5.7 domain gate: invalid date-time {label}={value!r}")
            return None

    slugs: set[str] = set()
    paths: set[str] = set()
    seen_source_ids: set[str] = set()
    for row in news:
        records = row.get("source_records") or []
        if len(records) != 1:
            err(f"canonical news {row.get('id')}: expected exactly one provenance record")
            continue
        source_record = records[0]
        sid = str(source_record.get("source_id") or "")
        raw_info = raw_by_sid.get(sid)
        if source_record.get("provider") != verified_provider or not raw_info:
            err(f"canonical news {row.get('id')}: provenance does not resolve to verified bundle")
            continue
        source_row_number, raw = raw_info
        seen_source_ids.add(sid)
        expected_id = stable("pm-news-", verified_provider, sid)
        expected_slug = "news-" + slug(sid) + "-" + expected_id[-8:]
        if row.get("id") != expected_id or row.get("slug") != expected_slug:
            err(f"canonical news {row.get('id')}: deterministic stable ID/slug mismatch")
        if row.get("canonical_path") != f"news/item.html?slug={expected_slug}":
            err(f"canonical news {row.get('id')}: canonical deep link mismatch")
        if row.get("trust_layer") != "editorial" or row.get("verification_status") != "source_verified" or row.get("status") != "published":
            err(f"canonical news {row.get('id')}: trust/status mismatch")
        for key in ("title", "summary", "published_at", "updated_at", "status", "publisher", "original_url"):
            if row.get(key) != raw.get(key):
                err(f"canonical news {row.get('id')}: source-derived field changed: {key}")
        if source_record.get("source_row") != source_row_number or source_record.get("source_file") != verified.get("source_file") or source_record.get("source_url") != row.get("original_url"):
            err(f"canonical news {row.get('id')}: source provenance coordinates mismatch")
        url = str(row.get("original_url") or "")
        if not (url.startswith("https://patriarchia.ru/article/") or url.startswith("https://eparchia.patriarchia.ru/article/")):
            err(f"canonical news {row.get('id')}: official HTTPS source URL mismatch")
        published = parse_dt(row.get("published_at"), f"{row.get('id')}.published_at")
        fresh = row.get("freshness") or {}
        if set(fresh) != {"observed_at", "verified_at", "valid_from", "valid_to", "expires_at"}:
            err(f"canonical news {row.get('id')}: freshness shape mismatch")
        observed = parse_dt(fresh.get("observed_at"), f"{row.get('id')}.freshness.observed_at")
        verified_at = parse_dt(fresh.get("verified_at"), f"{row.get('id')}.freshness.verified_at")
        if fresh.get("observed_at") != raw_verified.get("observed_at") or fresh.get("verified_at") != raw_verified.get("observed_at"):
            err(f"canonical news {row.get('id')}: freshness must derive from verified source observation")
        if any(fresh.get(key) is not None for key in ("valid_from", "valid_to", "expires_at")):
            err(f"canonical news {row.get('id')}: unsupported temporal validity was invented")
        if published and verified_at and verified_at < published:
            err(f"canonical news {row.get('id')}: verified_at precedes publication")
        if observed and verified_at and observed != verified_at:
            err(f"canonical news {row.get('id')}: observed_at/verified_at diverge for frozen snapshot")
        slugs.add(str(row.get("slug") or ""))
        paths.add(str(row.get("canonical_path") or ""))
    if seen_source_ids != set(raw_by_sid):
        err("M5.7 domain gate: canonical News coverage diverges from verified source bundle")
    if len(slugs) != 4 or "" in slugs or len(paths) != 4 or "" in paths:
        err("M5.7 domain gate: canonical slugs/paths must be unique and complete")
    published_order = [str(row.get("published_at") or "") for row in news]
    if published_order != sorted(published_order, reverse=True):
        err("M5.7 domain gate: canonical News ordering is not deterministic published_at DESC")

    for relation in relations:
        src = relation.get("from") or {}
        dst = relation.get("to") or {}
        if src.get("kind") != "news" or src.get("id") not in news_ids:
            err(f"news relation {relation.get('id')}: invalid canonical News source")
            continue
        source_news = next((row for row in news if row.get("id") == src.get("id")), None)
        source_records = relation.get("source_records") or []
        if not source_news or source_records != (source_news.get("source_records") or []):
            err(f"news relation {relation.get('id')}: relation evidence must reuse exact News provenance")
            continue
        source_record = source_records[0] if source_records else {}
        sid = str(source_record.get("source_id") or "")
        raw_info = raw_by_sid.get(sid)
        raw = raw_info[1] if raw_info else {}
        if relation.get("relation_type") != raw.get("relation_type") or dst.get("id") != raw.get("place_ref") or dst.get("kind") != "place":
            err(f"news relation {relation.get('id')}: endpoint/type not backed by explicit source evidence")
        expected_rel_id = stable("pm-news-rel-", verified_provider, sid, relation.get("relation_type"), dst.get("id"))
        if relation.get("id") != expected_rel_id:
            err(f"news relation {relation.get('id')}: deterministic stable relation ID mismatch")
        if relation.get("trust_layer") != "editorial" or relation.get("verification_status") != "source_verified":
            err(f"news relation {relation.get('id')}: trust mismatch")
        target_ids = targets.get(str(dst.get("kind") or ""))
        if target_ids is not None and str(dst.get("id") or "") not in target_ids:
            err(f"news relation {relation.get('id')}: dangling target {dst.get('kind')}:{dst.get('id')}")
        if dst.get("kind") == "organisation":
            err("M5.7 domain gate: Organisation facts are forbidden before M7 domain layer")
    if len(relations) != 1:
        err("M5.7 domain gate: relation topology must remain exactly one explicit relation")
    elif (relations[0].get("to") or {}) != {"kind": "place", "id": "pm-9e8bc6fff182514f91cf1739e41d2839"} or relations[0].get("relation_type") != "about_place":
        err("M5.7 domain gate: explicit Lavra relation topology changed")

    index = load_json(GEN / "news_index.json") or {}
    expected_counts = {"sources": 2, "news": 4, "relations": 1, "review_queue": 5, "rejected": 0}
    if (index.get("counts") or {}) != expected_counts:
        err(f"M5.7 domain gate: news_index counts mismatch: {index.get('counts')}")
    expected_by_slug = {str(row.get("slug")): str(row.get("id")) for row in news}
    expected_by_id = {str(row.get("id")): position for position, row in enumerate(news)}
    if (index.get("news_by_slug") or {}) != expected_by_slug or (index.get("news_by_id") or {}) != expected_by_id:
        err("M5.7 domain gate: deterministic News lookup indexes diverge from canonical ordering")
    expected_review_years: dict[str, list[str]] = {}
    for row in review:
        year = str(row.get("published_on") or "")[:4]
        if year:
            expected_review_years.setdefault(year, []).append(str(row.get("id") or ""))
    if (index.get("review_by_year") or {}) != expected_review_years:
        err("M5.7 domain gate: deterministic legacy review index mismatch")

    report = load_json(GEN / "news_report.json") or {}
    if report.get("canonical_news_created") != 4 or report.get("source_verified_news") != 4 or report.get("canonical_relations_created") != 1:
        err("M5.7 domain gate: report canonical counts mismatch")
    if report.get("inferred_relations_created") != 0 or report.get("organisation_entities_created") != 0 or report.get("rejected") != 0:
        err("M5.7 domain gate: inferred relations/organisation facts/rejections must stay zero")

    for filename in (
        "news_sources.json", "news_records.json", "news_relations.json", "news_review_queue.json",
        "news_rejected.json", "news_index.json", "news_report.json",
    ):
        payload = load_json(GEN / filename) or {}
        if payload.get("source_snapshot_sha256") != snapshot_hash:
            err(f"M5.7 domain gate: {filename} snapshot hash diverges from frozen source snapshot")


def check_library(targets: dict[str, set[str]]) -> None:
    # M5.10.7: final Library/Knowledge engineering gate. Preserve the closed corpus
    # while validating schemas, stable identifiers/aliases, provenance/rights, topology,
    # deterministic indexes, discovery/Daily integration and the no-inference boundary.
    stage = "M5.10.7"
    expected_schema_files = {
        "library_work.schema.json": r"^pm-work-[0-9a-f]{20}$",
        "library_author.schema.json": r"^pm-author-[0-9a-f]{20}$",
        "library_edition.schema.json": r"^pm-edition-[0-9a-f]{20}$",
        "library_scripture_reference.schema.json": r"^pm-scripture-ref-[0-9a-f]{20}$",
        "library_text_asset.schema.json": r"^pm-text-[0-9a-f]{20}$",
        "library_media_asset.schema.json": r"^pm-media-[0-9a-f]{20}$",
        "library_relation.schema.json": r"^pm-library-rel-[0-9a-f]{20}$",
        "library_review_item.schema.json": r"^pm-library-review-[0-9a-f]{20}$",
    }
    for name, pattern in expected_schema_files.items():
        schema = load_json(ROOT / "data/schema" / name) or {}
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema" or schema.get("additionalProperties") is not False:
            err(f"{stage} schema contract invalid: {name}")
        if (((schema.get("properties") or {}).get("id") or {}).get("pattern")) != pattern:
            err(f"{stage} stable-ID schema changed: {name}")
    for name in ("library_source_manifest.schema.json", "library_rights_policy.schema.json", "library_scripture_catalog.schema.json", "library_rights_cleared_assets.schema.json"):
        schema = load_json(ROOT / "data/schema" / name) or {}
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema" or schema.get("additionalProperties") is not False:
            err(f"{stage} source/schema contract invalid: {name}")

    relation_schema = load_json(ROOT / "data/schema/library_relation.schema.json") or {}
    source_kinds = (((relation_schema.get("properties") or {}).get("from") or {}).get("properties") or {}).get("kind",{}).get("enum",[])
    target_kinds = (((relation_schema.get("properties") or {}).get("to") or {}).get("properties") or {}).get("kind",{}).get("enum",[])
    if not {"reading","text_asset","media_asset"}.issubset(set(source_kinds)) or "feast" not in target_kinds:
        err(f"{stage} library relation schema lacks required bridge kinds")

    snapshot = load_json(ROOT / "data/schema/library_source_snapshot.json") or {}
    snapshot_files = snapshot.get("files") if isinstance(snapshot.get("files"), list) else []
    expected_paths = {
        "data/library_sources/source_manifest.json",
        "data/library_sources/rights_taxonomy.json",
        "data/library_sources/scripture_catalog_azbyka_2026-10-05.json",
        "data/library_sources/rights_cleared_assets_2026-10-05.json",
        "data/library_sources/text_verification_2026-10-05.json",
    }
    cleared_source = load_json(ROOT / "data/library_sources/rights_cleared_assets_2026-10-05.json") or {}
    local_rows = [x for x in cleared_source.get("text_records",[]) if x.get("storage_mode")=="local_text"]
    expected_paths.update(str(x.get("local_source_file") or "") for x in local_rows)
    if snapshot.get("domain") != "library" or {str(x.get("path") or "") for x in snapshot_files} != expected_paths:
        err(f"{stage} library source snapshot coverage mismatch")
    for row in snapshot_files:
        rel = str(row.get("path") or ""); path = ROOT / rel
        if not path.is_file() or path.stat().st_size != row.get("size") or hashlib.sha256(path.read_bytes()).hexdigest() != row.get("sha256"):
            err(f"{stage} library source snapshot mismatch: {rel}")
    snapshot_hash = hashlib.sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    manifest = load_json(ROOT / "data/library_sources/source_manifest.json") or {}
    providers = manifest.get("providers") if isinstance(manifest.get("providers"), list) else []
    by_provider = {str(x.get("provider") or ""):x for x in providers}
    expected_providers = {"pravmir-library-rights-system","azbyka-scripture-metadata-2026-10-05","wikisource-public-domain-2026-10-05","wikimedia-commons-rights-2026-10-05"}
    if set(by_provider) != expected_providers:
        err(f"{stage} source providers mismatch: {sorted(by_provider)}")
    else:
        if by_provider["pravmir-library-rights-system"].get("trust_layer") != "canonical_system": err(f"{stage} rights provider trust mismatch")
        scripture_provider=by_provider["azbyka-scripture-metadata-2026-10-05"]
        if scripture_provider.get("verification_status")!="source_verified" or scripture_provider.get("rights_scope")!="metadata_only": err(f"{stage} Scripture provider contract mismatch")
        wiki=by_provider["wikisource-public-domain-2026-10-05"]
        commons=by_provider["wikimedia-commons-rights-2026-10-05"]
        if wiki.get("verification_status")!="rights_verified" or wiki.get("rights_scope")!="per_asset_verified_text": err(f"{stage} Wikisource rights provider mismatch")
        if commons.get("verification_status")!="rights_verified" or commons.get("rights_scope")!="explicit_open_media": err(f"{stage} Commons rights provider mismatch")

    rights_source = load_json(ROOT / "data/library_sources/rights_taxonomy.json") or {}
    source_policies = rights_source.get("policies") if isinstance(rights_source.get("policies"), list) else []
    expected_rights = {"public_domain_verified", "open_license", "permission_granted", "metadata_only", "external_link_only", "restricted", "review_required"}
    if len(source_policies)!=7 or {str(x.get("key") or "") for x in source_policies} != expected_rights:
        err(f"{stage} rights taxonomy changed unexpectedly")

    scripture_source = load_json(ROOT / "data/library_sources/scripture_catalog_azbyka_2026-10-05.json") or {}
    source_authors = scripture_source.get("authors") if isinstance(scripture_source.get("authors"),list) else []
    source_works = scripture_source.get("works") if isinstance(scripture_source.get("works"),list) else []
    prefixes=[str(x.get("citation_prefix") or "") for x in source_works]
    if scripture_source.get("rights_status")!="metadata_only" or len(source_authors)!=6 or len(source_works)!=14 or len(set(prefixes))!=14:
        err(f"{stage} frozen Scripture catalog contract mismatch")

    cleared = load_json(ROOT / "data/library_sources/rights_cleared_assets_2026-10-05.json") or {}
    if cleared.get("domain")!="library_rights_cleared_assets" or len(cleared.get("text_records") or [])!=19 or len(cleared.get("life_records") or [])!=5 or len(cleared.get("media_records") or [])!=2 or len(cleared.get("relations") or [])!=1:
        err(f"{stage} rights-cleared frozen source contract mismatch")

    sources = rows_from("library_sources.json", "sources")
    rights = rows_from("library_rights.json", "policies")
    authors = rows_from("library_authors.json", "authors")
    works = rows_from("library_works.json", "works")
    editions = rows_from("library_editions.json", "editions")
    scripture_refs = rows_from("library_scripture_references.json", "scripture_references")
    text_assets = rows_from("library_text_assets.json", "text_assets")
    media_assets = rows_from("library_media_assets.json", "media_assets")
    relations = rows_from("library_relations.json", "relations")
    review = rows_from("library_review_queue.json", "items")
    rejected = rows_from("library_rejected.json", "items")
    targets["author"] = unique_ids(authors, "library_authors")
    targets["work"] = unique_ids(works, "library_works")
    targets["edition"] = unique_ids(editions, "library_editions")
    targets["text_asset"] = unique_ids(text_assets, "library_text_assets")
    targets["media_asset"] = unique_ids(media_assets, "library_media_assets")
    ref_ids = unique_ids(scripture_refs, "library_scripture_references")
    unique_ids(relations, "library_relations"); unique_ids(review, "library_review_queue")

    expected_counts=(4,7,11,39,38,48,24,2,107,0,0)
    actual=(len(sources),len(rights),len(authors),len(works),len(editions),len(scripture_refs),len(text_assets),len(media_assets),len(relations),len(review),len(rejected))
    if actual != expected_counts:
        err(f"{stage} generated counts mismatch: {actual} != {expected_counts}")

    # Stable discovery identifiers must stay unambiguous. JSON Schema already rejects
    # exact duplicate aliases; the gate additionally rejects empty/normalization-only
    # duplicates that would make URL/search behaviour depend on ordering.
    def normalize_alias(value: object) -> str:
        text = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
        return re.sub(r"[^0-9a-zа-я]+", " ", text, flags=re.IGNORECASE).strip()

    for label, rows in (("work", works), ("author", authors)):
        slugs=[str(row.get("slug") or "") for row in rows]
        if any(not slug for slug in slugs) or len(slugs)!=len(set(slugs)):
            err(f"{stage} {label} slug uniqueness/emptiness gate failed")
        for row in rows:
            aliases=row.get("aliases") if isinstance(row.get("aliases"),list) else []
            normalized=[normalize_alias(alias) for alias in aliases]
            if any(not alias for alias in normalized) or len(normalized)!=len(set(normalized)):
                err(f"{stage} {label} aliases are empty/normalization-duplicate: {row.get('id')}")

    # Preserve the 14 M5.8.2 Scripture works/editions as metadata-only while allowing rights-cleared additions.
    scripture_works=[x for x in works if x.get("work_type")=="scripture"]
    scripture_editions=[x for x in editions if x.get("work_ref") in {w.get("id") for w in scripture_works}]
    if len(scripture_works)!=14 or len(scripture_editions)!=14 or any(x.get("rights_status")!="metadata_only" or x.get("verification_status")!="source_verified" for x in scripture_works+scripture_editions):
        err(f"{stage} M5.8.2 Scripture metadata boundary regressed")

    reading_ids = targets.get("reading", set()); work_ids=targets["work"]; edition_ids=targets["edition"]
    if len(reading_ids)!=48: err(f"{stage} expected existing 48 verified readings, got {len(reading_ids)}")
    covered_readings=set()
    for ref in scripture_refs:
        if ref.get("reading_ref") not in reading_ids or ref.get("work_ref") not in work_ids or ref.get("edition_ref") not in edition_ids:
            err(f"{stage} Scripture ref broken target: {ref.get('id')}")
        if ref.get("trust_layer")!="editorial" or ref.get("verification_status")!="source_verified_bridge" or len(ref.get("source_records") or [])<2:
            err(f"{stage} Scripture ref provenance/trust failed: {ref.get('id')}")
        covered_readings.add(ref.get("reading_ref"))
    if covered_readings != reading_ids or len(ref_ids)!=48: err(f"{stage} Scripture bridge coverage regressed")

    # Local texts have exact edition-level evidence and frozen deterministic bodies.
    if len(text_assets)!=24 or len(local_rows)!=9:
        err(f"{stage} textual/local source coverage mismatch")
    local_by_path={x.get("content_path"):x for x in local_rows}
    policy_by_key={x.get("key"):x for x in rights}
    text_work_refs=set()
    for asset in text_assets:
        text_work_refs.add(asset.get("work_ref")); rec=(asset.get("source_records") or [{}])[0]
        if not str(asset.get("external_url") or "").startswith("https://") or not str(rec.get("rights_evidence_url") or "").startswith("https://"):
            err(f"{stage} text provenance URL invalid: {asset.get('id')}")
        if asset.get("storage_mode")=="local_text":
            rel=asset.get("content_path") or ""; raw=local_by_path.get(rel)
            if not re.fullmatch(r"library/texts/[a-z0-9-]+\.txt",rel) or not raw:
                err(f"{stage} local text path/source mismatch: {asset.get('id')}"); continue
            frozen=load_json(ROOT/raw["local_source_file"]) or {}
            body=("\n\n".join(x["text"] for x in frozen.get("blocks",[]))+"\n").encode("utf-8")
            file=ROOT/rel
            if not file.is_file() or file.read_bytes()!=body or hashlib.sha256(body).hexdigest()!=asset.get("content_sha256") or len(body)!=asset.get("content_size_bytes"):
                err(f"{stage} local text bytes/checksum failed: {rel}")
            if not policy_by_key.get(asset.get("rights_status"),{}).get("local_text_allowed") or asset.get("verification_status")!="rights_verified" or asset.get("license_url")!="https://creativecommons.org/licenses/by-sa/4.0/":
                err(f"{stage} local text rights failed: {rel}")
            if rec.get("local_source_file")!=raw["local_source_file"] or rec.get("source_revision")!=frozen.get("source_revision") or rec.get("verified_on")!="2026-10-05" or not (frozen.get("author_evidence_url") or frozen.get("work_rights_evidence_url")) or not rec.get("completeness_scope"):
                err(f"{stage} local text version/evidence incomplete: {rel}")
        elif asset.get("storage_mode")!="external_url" or asset.get("content_path") is not None:
            err(f"{stage} external text storage failed: {asset.get('id')}")
        expected_verification="source_verified" if asset.get("rights_status")=="external_link_only" else "rights_verified"
        if asset.get("verification_status")!=expected_verification:
            err(f"{stage} text rights verification mismatch: {asset.get('id')}")
    if len(text_work_refs)!=24: err(f"{stage} text/work one-to-one coverage mismatch")
    local_assets=[x for x in text_assets if x.get("storage_mode")=="local_text"]
    if len(local_assets)!=9 or {x.get("content_path") for x in local_assets}!=set(local_by_path):
        err(f"{stage} exact local asset coverage mismatch")
    if {p.relative_to(ROOT).as_posix() for p in (ROOT/"library/texts").glob("*.txt")}!=set(local_by_path):
        err(f"{stage} orphan local text files")
    corrections=load_json(ROOT/"data/library_sources/text_verification_2026-10-05.json") or {}
    if {x.get("key") for x in corrections.get("rights_corrections",[])}!={"ignatius-word-on-man","ignatius-on-orthodoxy","philaret-longer-catechism"}:
        err(f"{stage} rights audit history missing")
    for correction in corrections.get("rights_corrections",[]):
        expected_slug="work-"+correction["key"]
        work=next((x for x in works if x.get("slug")==expected_slug),{})
        expected_work_rights="public_domain_verified" if correction.get("key")=="philaret-longer-catechism" else "external_link_only"
        linked_assets=[x for x in text_assets if x.get("work_ref")==work.get("id")]
        if work.get("rights_status")!=expected_work_rights or not correction.get("previous_assessment") or not linked_assets or any(x.get("storage_mode")!="external_url" or x.get("rights_status")!="external_link_only" for x in linked_assets):
            err(f"{stage} unresolved edition rights boundary failed: {expected_slug}")
    work_type_counts={kind:sum(1 for x in works if x.get("work_type")==kind) for kind in ("theology","catechesis","sermon","church_history","life","prayer","liturgy","hymnography")}
    if work_type_counts!={"theology":8,"catechesis":3,"sermon":3,"church_history":1,"life":5,"prayer":1,"liturgy":1,"hymnography":3}:
        err(f"{stage} textual work-type coverage mismatch: {work_type_counts}")
    expansion_keys={"lord-prayer-19c","heavenly-king-19c","worthy-is-19c","nicene-creed-tolstoy-1875"}
    expansion_rows=[x for x in cleared.get("text_records",[]) if x.get("key") in expansion_keys]
    if len(expansion_rows)!=4 or any(x.get("author_key") is not None or x.get("author_name") is not None or x.get("author_aliases")!=[] for x in expansion_rows):
        err(f"{stage} anonymous/traditional authorship contract mismatch")
    expansion_work_ids={x.get("id") for x in works if x.get("slug") in {"work-"+k for k in expansion_keys}}
    attributed_ids={(r.get("from") or {}).get("id") for r in relations if r.get("relation_type")=="author_attribution"}
    if len(expansion_work_ids)!=4 or any(x in attributed_ids for x in expansion_work_ids):
        err(f"{stage} synthetic author attribution leaked into traditional texts")
    for key in expansion_keys:
        row=next((x for x in expansion_rows if x.get("key")==key),{})
        if not str(row.get("classification_evidence_url") or "").startswith("https://") or not row.get("classification_evidence_summary"):
            err(f"{stage} classification evidence missing: {key}")
    m5105_keys={"theophan-sermons-orthodoxy-1863","philaret-gumilevsky-sacred-history-1850","pobedonostsev-orthodox-church-history-1891"}
    m5105_rows=[x for x in cleared.get("text_records",[]) if x.get("key") in m5105_keys]
    if len(m5105_rows)!=3 or {x.get("work_type") for x in m5105_rows}!={"sermon","catechesis","church_history"}:
        err(f"{stage} M5.10.5 source coverage mismatch")
    for row in m5105_rows:
        if row.get("storage_mode")!="external_url" or row.get("rights_status")!="open_license" or row.get("work_rights_status")!="public_domain_verified" or not str(row.get("source_url") or "").startswith("https://ru.wikisource.org/w/index.php?") or not row.get("source_revision") or row.get("verified_on")!="2026-10-05":
            err(f"{stage} pinned external publication contract failed: {row.get('key')}")
        if row.get("license_url")!="https://creativecommons.org/licenses/by-sa/4.0/deed.ru" or not row.get("classification_evidence_summary"):
            err(f"{stage} M5.10.5 rights/classification evidence failed: {row.get('key')}")
    catechism=next((x for x in cleared.get("text_records",[]) if x.get("key")=="philaret-longer-catechism"),{})
    if catechism.get("rights_status")!="external_link_only" or catechism.get("work_rights_status")!="public_domain_verified" or catechism.get("storage_mode")!="external_url":
        err(f"{stage} Philaret catechism exact-publication rights correction missing")
    if {x.get("media_kind") for x in media_assets}!={"audio","video"}:
        err(f"{stage} expected one audio and one video asset")
    for asset in media_assets:
        if asset.get("storage_mode")!="external_url" or asset.get("asset_path") is not None or asset.get("verification_status")!="rights_verified" or not str(asset.get("external_url") or "").startswith("https://"):
            err(f"{stage} media external storage/verification contract failed: {asset.get('id')}")
        rec=(asset.get("source_records") or [{}])[0]
        if not rec.get("rights_evidence_url") or not rec.get("source_sha1") or not rec.get("source_size") or not rec.get("source_creator"):
            err(f"{stage} media evidence metadata incomplete: {asset.get('id')}")
        if asset.get("media_kind")=="audio" and (asset.get("rights_status")!="public_domain_verified" or asset.get("license_url")!="https://creativecommons.org/publicdomain/zero/1.0/"):
            err(f"{stage} CC0 audio rights mismatch")
        if asset.get("media_kind")=="video" and (asset.get("rights_status")!="open_license" or asset.get("license_url")!="https://creativecommons.org/licenses/by-sa/4.0/"):
            err(f"{stage} CC BY-SA video rights mismatch")

    kinds={k:[r for r in relations if r.get("relation_type")==k] for k in ("author_attribution","scripture_citation_of","full_text_of","recording_of","depicts_feast","life_of")}
    expected_topology={"author_attribution":27,"scripture_citation_of":48,"full_text_of":24,"recording_of":1,"depicts_feast":1,"life_of":6}
    actual_topology={k:len(v) for k,v in kinds.items()}
    if actual_topology != expected_topology:
        err(f"{stage} relation topology mismatch: {actual_topology} != {expected_topology}")
    authored_work_ids={(r.get("from") or {}).get("id") for r in kinds["author_attribution"]}
    by_title={x.get("title"):x.get("id") for x in works}
    for title in ("Деяния святых Апостолов","Послание к Евреям"):
        if by_title.get(title) in authored_work_ids: err(f"{stage} uncertain authorship leaked: {title}")
    feast_links=kinds["depicts_feast"]
    if not feast_links or (feast_links[0].get("to") or {}) != {"kind":"feast","id":"pm-feast-0d16d133b2183b48ebb6"}:
        err(f"{stage} explicit Theophany→feast stable-ID relation mismatch")
    if feast_links and (feast_links[0].get("verification_status")!="rights_verified" or not (feast_links[0].get("source_records") or [{}])[0].get("evidence")):
        err(f"{stage} Theophany relation evidence missing")
    life_links=kinds["life_of"]
    expected_life_saints={
        "pm-saint-4efbfd490a4731dd4707", "pm-saint-5debdc29945c75da37dc", "pm-saint-5e9427d027db724c0adf",
        "pm-saint-c7191324786b992d64d1", "pm-saint-d65fcc88a283729e7147", "pm-saint-f78aee1ef3f22a9d0a76",
    }
    actual_life_saints={(r.get("to") or {}).get("id") for r in life_links if (r.get("to") or {}).get("kind")=="saint"}
    if actual_life_saints!=expected_life_saints or any((r.get("from") or {}).get("kind")!="work" or r.get("verification_status")!="rights_verified" or not (r.get("source_records") or [{}])[0].get("evidence") for r in life_links):
        err(f"{stage} life→saint explicit evidence topology mismatch")
    if "pm-saint-4db1cd8508af04e95c6d" in actual_life_saints:
        err(f"{stage} Anna of Kashin must remain unlinked until a verified life source is promoted")

    index = load_json(GEN / "library_index.json") or {}
    expected_index={"sources":4,"rights_policies":7,"authors":11,"works":39,"editions":38,"scripture_references":48,"text_assets":24,"media_assets":2,"relations":107,"review_queue":0,"rejected":0}
    if (index.get("counts") or {}) != expected_index: err(f"{stage} library index counts mismatch: {index.get('counts')}")
    if set((index.get("rights_by_key") or {}).keys())!=expected_rights or len(index.get("work_by_slug") or {})!=39 or len(index.get("author_by_slug") or {})!=11 or len(index.get("work_by_citation_prefix") or {})!=14 or len(index.get("scripture_by_reading") or {})!=48:
        err(f"{stage} deterministic library indexes mismatch")
    if len(index.get("text_assets_by_work") or {})!=24 or len(index.get("media_assets_by_work") or {})!=1:
        err(f"{stage} asset indexes mismatch")
    expected_work_by_slug={str(x.get("slug")):x.get("id") for x in works}
    expected_author_by_slug={str(x.get("slug")):x.get("id") for x in authors}
    scripture_work_by_key={}
    for work in scripture_works:
        for rec in work.get("source_records") or []:
            sid=str(rec.get("source_id") or "")
            if rec.get("provider")=="azbyka-scripture-metadata-2026-10-05" and sid.startswith("work:"):
                scripture_work_by_key[sid.split(":",1)[1]]=work.get("id")
    expected_citation={str(row.get("citation_prefix")):scripture_work_by_key.get(str(row.get("key"))) for row in source_works}
    expected_by_reading={str(x.get("reading_ref")):x.get("id") for x in scripture_refs}
    expected_text_by_work={}
    for asset in text_assets:
        expected_text_by_work.setdefault(str(asset.get("work_ref")),[]).append(asset.get("id"))
    expected_media_by_work={}
    for asset in media_assets:
        if asset.get("work_ref"):
            expected_media_by_work.setdefault(str(asset.get("work_ref")),[]).append(asset.get("id"))
    if (index.get("work_by_slug") or {})!=expected_work_by_slug or (index.get("author_by_slug") or {})!=expected_author_by_slug or (index.get("work_by_citation_prefix") or {})!=expected_citation or (index.get("scripture_by_reading") or {})!=expected_by_reading:
        err(f"{stage} deterministic lookup index contents mismatch")
    if (index.get("text_assets_by_work") or {})!=expected_text_by_work or (index.get("media_assets_by_work") or {})!=expected_media_by_work:
        err(f"{stage} deterministic asset index contents mismatch")

    # Canonical deep links must bind exactly to the stable slug they advertise.
    work_paths=[str(x.get("canonical_path") or "") for x in works]
    author_paths=[str(x.get("canonical_path") or "") for x in authors]
    if len(set(work_paths))!=len(work_paths) or any(x.get("canonical_path")!=f"library/item.html?slug={x.get('slug')}" for x in works):
        err(f"{stage} canonical work deep-link gate failed")
    if len(set(author_paths))!=len(author_paths) or any(x.get("canonical_path")!=f"library.html?author={x.get('slug')}" for x in authors):
        err(f"{stage} canonical author deep-link gate failed")
    provider_ids=set(by_provider)
    # Cross-domain Scripture bridges preserve the exact verified M5.3 reading provider
    # instead of copying that provider into the Library source manifest. The gate accepts
    # only the frozen Liturgical provider/source pair, not arbitrary generated providers.
    lit_manifest=load_json(ROOT / "data/liturgical_sources/source_manifest.json") or {}
    lit_providers={str(x.get("provider") or ""):x for x in (lit_manifest.get("providers") or []) if isinstance(x,dict)}
    lit_bridge=lit_providers.get("azbyka-calendar-2026-editorial") or {}
    if lit_bridge.get("verification_status")!="editorial_verified":
        err("M5.8.4 cross-domain Liturgical provider contract missing")
    allowed_provider_ids=provider_ids | ({"azbyka-calendar-2026-editorial"} if lit_bridge else set())
    provider_files={"azbyka-calendar-2026-editorial":"data/liturgical_sources/readings_2026_editorial.json"}
    source_rows=works+authors+editions+scripture_refs+text_assets+media_assets+relations
    for row in source_rows:
        records=row.get("source_records") if isinstance(row.get("source_records"),list) else []
        if not records:
            err(f"M5.8.4 provenance missing: {row.get('id')}")
            continue
        for rec in records:
            provider=rec.get("provider")
            if provider not in allowed_provider_ids:
                err(f"M5.8.4 unknown provenance provider: {row.get('id')} -> {provider}")
            expected_file=provider_files.get(provider)
            if expected_file and rec.get("source_file")!=expected_file:
                err(f"M5.8.4 cross-domain provenance source mismatch: {row.get('id')} -> {rec.get('source_file')}")
            url=str(rec.get("source_url") or "")
            if url and not url.startswith("https://"):
                err(f"M5.8.4 non-HTTPS provenance URL: {row.get('id')}")
            evidence=str(rec.get("rights_evidence_url") or "")
            if evidence and not evidence.startswith("https://"):
                err(f"M5.8.4 non-HTTPS rights evidence URL: {row.get('id')}")
    target_sets={
        "work":targets.get("work",set()),"author":targets.get("author",set()),"edition":targets.get("edition",set()),
        "text_asset":targets.get("text_asset",set()),"media_asset":targets.get("media_asset",set()),
        "reading":targets.get("reading",set()),"feast":targets.get("feast",set()),"place":targets.get("place",set()),
        "content":targets.get("content",set()),"news":targets.get("news",set()),"route":targets.get("route",set()),"event":targets.get("event",set()),"saint":targets.get("saint",set()),
    }
    for rel in relations:
        for side in ("from","to"):
            endpoint=rel.get(side) or {}; kind=endpoint.get("kind"); rid=endpoint.get("id")
            known=target_sets.get(kind)
            if known is not None and rid not in known:
                err(f"{stage} broken relation endpoint: {rel.get('id')} {side}={kind}:{rid}")
    # v1.44 closes the current corpus with no source-supported Library↔place edge.
    # Keep the absence explicit so later fuzzy/title matching cannot silently publish one.
    if any(((rel.get("from") or {}).get("kind")=="place" or (rel.get("to") or {}).get("kind")=="place") for rel in relations):
        err(f"{stage} Library place relation appeared without an approved evidence migration")
    if any(not str(x.get("external_url") or "").startswith("https://") for x in text_assets+media_assets):
        err(f"{stage} asset deep links must be HTTPS")

    report = load_json(GEN / "library_report.json") or {}
    expected_report={"canonical_works_created":39,"canonical_authors_created":11,"canonical_editions_created":38,"scripture_references_created":48,"explicit_relations_created":107,"rights_cleared_text_assets_created":21,"rights_cleared_media_assets_created":2}
    for key,value in expected_report.items():
        if report.get(key)!=value: err(f"{stage} report mismatch {key}={report.get(key)} expected={value}")
    if report.get("local_text_assets_created")!=9: err(f"{stage} local text report count mismatch")
    for key in ("local_media_assets_created","full_protected_texts_copied","unlicensed_local_assets_created","inferred_relations_created","organisation_entities_created"):
        if report.get(key)!=0: err(f"{stage} copyright/trust gate failed: {key}={report.get(key)}")

    for filename in ("library_sources.json","library_rights.json","library_authors.json","library_works.json","library_editions.json","library_scripture_references.json","library_text_assets.json","library_media_assets.json","library_relations.json","library_review_queue.json","library_rejected.json","library_index.json","library_report.json"):
        payload=load_json(GEN/filename) or {}
        if payload.get("source_snapshot_sha256")!=snapshot_hash: err(f"{stage} {filename}: source snapshot hash mismatch")

def check_my_pm() -> None:
    schema = load_json(ROOT / "schemas/my_pm_state.schema.json") or {}
    props = schema.get("properties", {}) if isinstance(schema, dict) else {}
    required = set(schema.get("required", [])) if isinstance(schema, dict) else set()
    if not {"schema_version", "storage_mode", "sync_status", "profile", "collections", "migration"}.issubset(required):
        err("M6.1 My PM schema missing required top-level state contract")
    if (props.get("schema_version") or {}).get("const") != 1 or (props.get("storage_mode") or {}).get("const") != "device_local" or (props.get("sync_status") or {}).get("const") != "local_only":
        err("M6.1 My PM schema/version/local-only contract mismatch")
    collections = ((props.get("collections") or {}).get("properties") or {})
    if set(collections) != {"favorites", "read_later", "saved_routes"}:
        err("M6.1 My PM collection contract mismatch")

    layer = (ROOT / "js/my-pm-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    for token in ("PravmirMyPm", "1.37.0", "pravmir.my_pm.v1", "schema_version", "device_local", "local_only", "legacy_migration", "unresolved", "favorites", "read_later", "saved_routes"):
        if token not in layer:
            err(f"M6.1 My PM layer missing contract token: {token}")
    if "fetch(" in layer or "data/generated" in layer or "data/" in layer:
        err("M6.1 My PM layer must not read canonical/raw domain datasets directly")
    if "row.title ===" in layer or "normalizeTitle" in layer:
        err("M6.1 legacy migration must not canonicalize personal refs by title matching")

    canonical_consumers = {
        "js/profile.js": ("PravmirMyPm",),
        "js/article.js": ("PravmirMyPm", "read_later"),
        "js/journal.js": ("PravmirMyPm", "read_later"),
        "js/object.js": ("PravmirMyPm", "favorites"),
        "js/route.js": ("PravmirMyPm", "saved_routes"),
    }
    forbidden_personal_storage = {
        "js/profile.js": ("localStorage", "pravmirLocalProfile"),
        "js/article.js": ("getItem('readLater'", "setItem('readLater'"),
        "js/journal.js": ("getItem('readLater'", "setItem('readLater'"),
        "js/object.js": ("getItem('favorites'", "setItem('favorites'"),
        "js/route.js": ("getItem('myRoutes'", "setItem('myRoutes'"),
    }
    for rel, tokens in canonical_consumers.items():
        text = (ROOT / rel).read_text(encoding="utf-8-sig", errors="replace")
        if any(token in text for token in forbidden_personal_storage[rel]):
            err(f"M6.1 canonical user consumer bypasses PravmirMyPm: {rel}")
        for token in tokens:
            if token not in text:
                err(f"M6.1 {rel} missing My PM token: {token}")

    surfaces = {
        "profile.html": ("js/my-pm-layer.js",),
        "journal.html": ("js/my-pm-layer.js",),
        "articles/article.html": ("../js/my-pm-layer.js",),
        "objects/place.html": ("../js/my-pm-layer.js", 'id="objectFavoriteBtn"'),
        "routes/route.html": ("../js/my-pm-layer.js", 'id="routeSaveBtn"'),
    }
    for rel, tokens in surfaces.items():
        text = (ROOT / rel).read_text(encoding="utf-8-sig", errors="replace")
        for token in tokens:
            if token not in text:
                err(f"M6.1 product surface missing My PM integration: {rel} -> {token}")



def check_m62_backend() -> None:
    required = (
        "backend/__init__.py", "backend/security.py", "backend/storage.py", "backend/service.py",
        "backend/public_data.py", "backend/server.py", "js/account-layer.js", "tools/check_backend.py",
    )
    for rel in required:
        if not (ROOT / rel).is_file():
            err(f"M6.2 backend file missing: {rel}")

    server = (ROOT / "backend/server.py").read_text(encoding="utf-8-sig", errors="replace")
    service = (ROOT / "backend/service.py").read_text(encoding="utf-8-sig", errors="replace")
    storage = (ROOT / "backend/storage.py").read_text(encoding="utf-8-sig", errors="replace")
    security = (ROOT / "backend/security.py").read_text(encoding="utf-8-sig", errors="replace")
    account = (ROOT / "js/account-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    profile_html = (ROOT / "profile.html").read_text(encoding="utf-8-sig", errors="replace")
    profile_js = (ROOT / "js/profile.js").read_text(encoding="utf-8-sig", errors="replace")

    for token in ("/api/v1", "httponly", "samesite", "X-Pravmir-CSRF", "127.0.0.1", "PRAVMIR_SECURE_COOKIES"):
        if token not in server:
            err(f"M6.2 server missing security/API contract token: {token}")
    for token in ("users", "sessions", "recovery_tokens", "my_pm_states", "schema_migrations", "REFERENCES users"):
        if token not in storage:
            err(f"M6.2 storage missing persistence contract token: {token}")
    for token in ("hashlib.scrypt", "compare_digest", "token_hash", "secrets.token_urlsafe"):
        if token not in security:
            err(f"M6.2 security missing password/session primitive: {token}")
    for token in ("register", "login", "logout", "request_recovery", "reset_password", "put_state", "StateConflict", "delete_account", "export_account"):
        if token not in service:
            err(f"M6.2 account service missing contract: {token}")
    for token in ("PravmirAccount", "1.45.0", "explicit_my_pm_push", "explicit_my_pm_pull", "automatic_upload: false", "credentials: 'same-origin'"):
        if token not in account:
            err(f"M6.2 browser account adapter missing contract token: {token}")
    for token in ("js/account-layer.js", 'id="accountLogin"', 'id="accountRegister"', 'id="accountPush"', 'id="accountPull"', 'id="accountDelete"', 'id="accountRecoveryReset"'):
        if token not in profile_html:
            err(f"M6.2 profile surface missing account control: {token}")
    for token in ("PravmirAccount", "pushLocalState", "pullRemoteState", "exportAccount", "deleteAccount", "resetPassword"):
        if token not in profile_js:
            err(f"M6.2 profile controller missing account integration: {token}")
    if "PravmirAccount.pushLocalState" in profile_js and "PravmirMyPm.exportState" not in profile_js:
        err("M6.2 explicit push must export through PravmirMyPm")
    if "PravmirMyPm.importState" not in profile_js or "window.confirm" not in profile_js:
        err("M6.2 remote restore must require explicit confirmed local import")

def check_frontend_boundaries() -> None:
    checks = [
        ("journal.html", "js/content-layer.js"),
        ("news.html", "js/news-layer.js"),
        ("library.html", "js/library-layer.js"),
        ("calendar.html", "js/liturgical-layer.js"),
        ("events.html", "js/event-layer.js"),
        ("food.html", "js/food-layer.js"),
        ("pilgrim/infrastructure.html", "../js/pilgrim-layer.js"),
    ]
    for html, needle in checks:
        text = (ROOT / html).read_text(encoding="utf-8-sig", errors="replace")
        if needle not in text:
            err(f"{html}: missing {needle}")
    journal = (ROOT / "journal.html").read_text(encoding="utf-8-sig", errors="replace")
    calendar = (ROOT / "calendar.html").read_text(encoding="utf-8-sig", errors="replace")
    home = (ROOT / "index.html").read_text(encoding="utf-8-sig", errors="replace")
    home_js = (ROOT / "js/home.js").read_text(encoding="utf-8-sig", errors="replace")
    routes = (ROOT / "routes/routes.html").read_text(encoding="utf-8-sig", errors="replace")
    if "data/articles.json" in journal:
        err("journal.html must not read raw article source")
    if "calendar2026" in calendar or "getFast(" in calendar:
        err("calendar.html must not contain legacy inline calendar logic")
    day_html = (ROOT / "calendar/day.html").read_text(encoding="utf-8-sig", errors="replace")
    lit_page = (ROOT / "js/liturgical-page.js").read_text(encoding="utf-8-sig", errors="replace")
    if 'id="readings"' not in day_html or "source_url" not in lit_page or "lit-source-link" not in lit_page:
        err("v1.22 calendar day must separate readings and expose provenance handoff")
    if "js/liturgical-layer.js" not in home or "calendar2026" in home_js:
        err("home calendar widget must use PravmirLiturgical")
    today_layer = (ROOT / "js/today-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    required_today_scripts = ("js/content-layer.js", "js/liturgical-layer.js", "js/event-layer.js", "js/food-layer.js", "js/news-layer.js", "js/library-layer.js", "js/today-layer.js", "js/knowledge-layer.js")
    if 'id="todayLayerGrid"' not in home or any(script not in home for script in required_today_scripts):
        err("v1.23 home Today surface must load all domain boundaries plus PravmirToday")
    if "fetch(" in today_layer or "data/generated" in today_layer or "data/" in today_layer:
        err("PravmirToday must compose domain APIs and must not read data files directly")
    for api_name in ("PravmirLiturgical", "PravmirContent", "PravmirEvents", "PravmirFood", "PravmirNews", "PravmirLibrary"):
        if api_name not in today_layer:
            err(f"PravmirToday missing domain composition: {api_name}")
    if "review/demo" not in home_js and "review queue" not in home_js:
        err("v1.23 Today event empty state must make review/demo exclusion explicit")
    home_content = (ROOT / "js/home-content.js").read_text(encoding="utf-8-sig", errors="replace")
    if 'id="homeRoutePreview"' not in home or "getRoutes(" not in home_content or "routeDetailUrl(" not in home_content:
        err("home route preview must use PravmirData and canonical route links")
    if "hero-bg.jpg" in (ROOT / "style.css").read_text(encoding="utf-8-sig", errors="replace"):
        err("watermarked legacy hero asset must not be a runtime background")
    data_layer = (ROOT / "js/data-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    if "loadSearchCore" not in data_layer or "loadLookupIndex" not in data_layer:
        err("v1.20 data-layer must keep search and lookup loading boundaries separate")
    if "mapLazyPrompt" not in home or "IntersectionObserver" not in home_js or "ensureLeaflet({ cluster: true, routing: false })" not in home_js:
        err("v1.20 home map must use lazy boot and defer routing")
    if "routing === true" not in (ROOT / "js/map-runtime.js").read_text(encoding="utf-8-sig", errors="replace"):
        err("v1.20 map runtime must keep routing opt-in")
    for rel in ("index.html", "catalog/catalog.html", "objects/place.html", "routes/route.html", "journal.html", "articles/article.html", "calendar.html", "calendar/day.html", "events.html", "food.html", "food/recipe.html", "library.html", "library/item.html", "profile.html"):
        text = (ROOT / rel).read_text(encoding="utf-8-sig", errors="replace")
        if "maximum-scale=1" in text or "user-scalable=no" in text:
            err(f"{rel}: product viewport must allow zoom")
        if "fonts.googleapis.com/css2" not in text:
            err(f"{rel}: shared typography stylesheet missing")
    if "../js/pilgrim-layer.js" not in routes or "PravmirPilgrim.getReviewQueue" not in routes or "../data/pilgrim-centers.json" in routes or "getFallbackData" in routes:
        err("routes pilgrim services must use PravmirPilgrim review boundary")
    place_page = (ROOT / "objects/place.html").read_text(encoding="utf-8-sig", errors="replace")
    object_js = (ROOT / "js/object.js").read_text(encoding="utf-8-sig", errors="replace")
    article_page = (ROOT / "articles/article.html").read_text(encoding="utf-8-sig", errors="replace")
    if "../js/content-layer.js" not in place_page or "relatedContentSection" not in place_page or "PravmirContent.getRelated" not in object_js:
        err("v1.21 place page must expose explicit Content Core links")
    if "../js/liturgical-layer.js" not in article_page or "article-graph-card" not in (ROOT / "js/article.js").read_text(encoding="utf-8-sig", errors="replace"):
        err("v1.21 article page must resolve typed cross-domain links")
    holiness_page = (ROOT / "holiness.html").read_text(encoding="utf-8-sig", errors="replace")
    holiness_js = (ROOT / "js/holiness.js").read_text(encoding="utf-8-sig", errors="replace")
    if "js/content-layer.js" not in holiness_page or "PravmirContent.getRelated" not in holiness_js:
        err("v1.21 holiness detail must expose linked Content Core materials")
    news_page = (ROOT / "news.html").read_text(encoding="utf-8-sig", errors="replace")
    news_layer = (ROOT / "js/news-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    config_js = (ROOT / "js/config.js").read_text(encoding="utf-8-sig", errors="replace")
    journal_html = (ROOT / "journal.html").read_text(encoding="utf-8-sig", errors="replace")
    if 'js/news-layer.js' not in news_page or 'content_sources/journalpp_legacy.json' in news_page or 'news_sources/' in news_layer:
        err("M5.7 News product surface must use PravmirNews generated boundary and not raw sources")
    if 'url: "news.html"' not in config_js or 'href="news.html"' not in journal_html:
        err("M5.7 News must be reachable from secondary navigation and legacy Journal handoff")
    if 'legacy' not in news_page.lower() or 'требуют' not in news_page.lower():
        err("M5.7 News core must disclose legacy review status in UI")
    news_item = (ROOT / 'news/item.html').read_text(encoding='utf-8-sig', errors='replace')
    if '../js/news-layer.js' not in news_item or '../js/news-item.js' not in news_item:
        err('M5.7.2 canonical news detail surface missing')
    home_js = (ROOT / "js/home.js").read_text(encoding="utf-8-sig", errors="replace")
    today_layer = (ROOT / "js/today-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    object_html = (ROOT / "objects/place.html").read_text(encoding="utf-8-sig", errors="replace")
    object_js = (ROOT / "js/object.js").read_text(encoding="utf-8-sig", errors="replace")
    index_html = (ROOT / "index.html").read_text(encoding="utf-8-sig", errors="replace")
    if 'src="js/news-layer.js"' not in index_html or "PravmirNews.getForDate" not in today_layer or "snapshot.news" not in home_js:
        err("M5.7.4 Today integration must use canonical PravmirNews")
    if '../js/news-layer.js' not in object_html or 'id="relatedNewsSection"' not in object_html or 'id="objectRelatedNews"' not in object_html or "PravmirNews.getRelatedNews" not in object_js:
        err("M5.7.4 place reverse-news integration missing")

    library_page = (ROOT / "library.html").read_text(encoding="utf-8-sig", errors="replace")
    library_item = (ROOT / "library/item.html").read_text(encoding="utf-8-sig", errors="replace")
    library_layer = (ROOT / "js/library-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    config_text = (ROOT / "js/config.js").read_text(encoding="utf-8-sig", errors="replace")
    if 'js/library-layer.js' not in library_page or '../js/library-layer.js' not in library_item or 'library.html' not in config_text:
        err("M5.8.1 Library product surface/navigation missing")
    if 'library_sources/' in library_page or 'library_sources/' in library_item or 'library_sources/' in library_layer or 'data/library_sources' in library_layer:
        err("M5.8.1 Library runtime must read generated boundary only")
    if 'Copyright-first' not in library_page or 'rights' not in library_layer.lower():
        err("M5.8.1 Library rights/copyright disclosure missing")

    knowledge_layer = (ROOT / "js/knowledge-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    if 'src="js/knowledge-layer.js"' not in index_html or 'src="js/library-layer.js"' not in index_html:
        err("M5.9 homepage must load Library + Knowledge integration layers")
    if "fetch(" in knowledge_layer or "data/generated" in knowledge_layer or "data/" in knowledge_layer:
        err("M5.9 PravmirKnowledge must remain consumer-only and never read data files directly")
    for api_name in ("PravmirData","PravmirContent","PravmirLiturgical","PravmirEvents","PravmirFood","PravmirPilgrim","PravmirNews","PravmirLibrary","PravmirToday"):
        if api_name not in knowledge_layer:
            err(f"M5.9 PravmirKnowledge missing domain composition: {api_name}")
    for method in ("getPlaceBundle","getFeastBundle","getRouteBundle","getReadingBundle","getDayBundle","getTrustSummary","collectProvenance"):
        if method not in knowledge_layer:
            err(f"M5.9 PravmirKnowledge missing integration method: {method}")
    if "reading_library" not in today_layer or "getScriptureForReading" not in today_layer or "getWorkById" not in today_layer:
        err("M5.9 Today must expose stable-ID Reading→Library integration")
    if "reading_library" not in home_js or "saint_library" not in home_js or "explicit life_of relation" not in home_js:
        err("M5.10.6 Today UI must disclose stable-ID reading and explicit saint-life binding")

    if "related_media" not in today_layer or "getRelatedForTarget" not in today_layer:
        err("M5.9 Today must expose explicit feast→Library media integration")
    search_js = (ROOT / "js/search.js").read_text(encoding="utf-8-sig", errors="replace")
    for token in ("PravmirNews", "getNews", "PravmirLibrary", "getWorks", "getAuthors"):
        if token not in search_js:
            err(f"M5.9 unified search missing News/Library integration token: {token}")
    calendar_day_page = (ROOT / "calendar/day.html").read_text(encoding="utf-8-sig", errors="replace")
    liturgical_page_js = (ROOT / "js/liturgical-page.js").read_text(encoding="utf-8-sig", errors="replace")
    if 'id="libraryLinks"' not in calendar_day_page or "../js/library-layer.js" not in calendar_day_page:
        err("M5.9 calendar day must expose Library/media surface through PravmirLibrary")
    for token in ("getScriptureForReading", "getWorkById", "getRelatedForTarget"):
        if token not in liturgical_page_js:
            err(f"M5.9 calendar integration missing stable relation traversal: {token}")
    library_ui = (ROOT / "js/library.js").read_text(encoding="utf-8-sig", errors="replace")
    if "getAuthorBySlug" not in library_ui or "getAuthorBundle" not in library_ui:
        err("M5.10.6 Library author canonical view must resolve through explicit author relations")
    for token in ("getDiscoveryFacets", "availability", "rights_status", "work_type", "getReadingsForWork", "getRelatedWorksForWork"):
        if token not in library_layer:
            err(f"M5.10.6 Library discovery/traversal API missing: {token}")
    for token in ('id="libraryFilters"', 'id="libraryQuery"', 'id="libraryType"', 'id="libraryRightsFilter"', 'id="libraryAvailability"'):
        if token not in library_page:
            err(f"M5.10.6 Library discovery UI missing: {token}")
    library_item_js = (ROOT / "js/library-item.js").read_text(encoding="utf-8-sig", errors="replace")
    for token in ("scripture_references", "calendar/day.html?date=", "related_author_works", "life_of"):
        if token not in library_item_js:
            err(f"M5.10.6 Library work traversal UI missing: {token}")
    if "saint_library" not in today_layer or "getLivesForSaint" not in today_layer or "commemorates" not in today_layer:
        err("M5.10.6 Today saint→life explicit traversal missing")

    pilgrim_page = (ROOT / "pilgrim/infrastructure.html").read_text(encoding="utf-8-sig", errors="replace")
    pilgrim_layer = (ROOT / "js/pilgrim-layer.js").read_text(encoding="utf-8-sig", errors="replace")
    if "../js/pilgrim-layer.js" not in pilgrim_page or "data/pilgrim-centers.json" in pilgrim_page:
        err("M5.6 infrastructure page must use PravmirPilgrim and never read legacy source directly")
    if "pilgrim-centers.json" in pilgrim_layer or "data/pilgrim_sources" in pilgrim_layer:
        err("PravmirPilgrim runtime must use generated domain payloads only")
    if "pilgrim/infrastructure.html#services" not in home or "pilgrim/infrastructure.html#review" not in home:
        err("home pilgrim cards must hand off to canonical infrastructure domain")
    search_js = (ROOT / "js/search.js").read_text(encoding="utf-8-sig", errors="replace")
    route_html = (ROOT / "routes/route.html").read_text(encoding="utf-8-sig", errors="replace")
    route_js = (ROOT / "js/route.js").read_text(encoding="utf-8-sig", errors="replace")
    infra_html = (ROOT / "pilgrim/infrastructure.html").read_text(encoding="utf-8-sig", errors="replace")
    if 'src="js/pilgrim-layer.js"' not in home or "PravmirPilgrim.getAmenities" not in search_js or "PravmirPilgrim.getServices" not in search_js:
        err("v1.26 unified search must expose canonical pilgrim infrastructure through PravmirPilgrim")
    if '../js/pilgrim-layer.js' not in route_html or 'id="routePilgrimSection"' not in route_html or "PravmirPilgrim.getForPlace" not in route_js:
        err("v1.26 route detail must discover pilgrim infrastructure through canonical route-stop places")
    if 'id="verifiedSearch"' not in infra_html or 'id="verifiedType"' not in infra_html or 'id="verifiedStatus"' not in infra_html:
        err("v1.26 pilgrim infrastructure filters missing")
    if 'id="pilgrimTrustSummary"' not in infra_html or "getTrustSummary" not in pilgrim_layer:
        err("v1.27 M5.6 domain gate trust summary missing")
    profile = (ROOT / "profile.html").read_text(encoding="utf-8-sig", errors="replace")
    if "js/data-layer.js" not in profile or "js/content-layer.js" not in profile or "js/my-pm-layer.js" not in profile or "js/profile.js" not in profile:
        err("M6.1 profile must resolve stable personal refs through domain APIs + PravmirMyPm")


def check_version() -> None:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+(?:\.\d+)?", version):
        err(f"VERSION: invalid value {version!r}")
        return
    for rel in ("docs/PROJECT_STATE.md", "docs/MANIFEST.md", "docs/ROADMAP.md"):
        text = (ROOT / rel).read_text(encoding="utf-8-sig", errors="replace")
        if f"v{version}" not in text:
            err(f"{rel}: current version v{version} not declared")


def check_cleanup() -> None:
    forbidden = []
    if (ROOT / "tests").exists():
        forbidden.extend(str(p.relative_to(ROOT)) for p in (ROOT / "tests").rglob("*") if p.is_file())
    forbidden.extend(str(p.relative_to(ROOT)) for p in (ROOT / "tools").glob("check_m*.py"))
    forbidden.extend(str(p.relative_to(ROOT)) for p in (ROOT / "tools").glob("check_data_core.py"))
    forbidden.extend(str(p.relative_to(ROOT)) for p in (ROOT / "tools").glob("check_release_runner.py"))
    forbidden.extend(str(p.relative_to(ROOT)) for p in [ROOT / "tools/release_contracts.py", ROOT / "tools/release_pipeline.py"] if p.exists())
    forbidden.extend(str(p.relative_to(ROOT)) for p in [GEN / "release_pipeline_state.json", GEN / "release_run_report.json"] if p.exists())
    if forbidden:
        err("obsolete verification files remain: " + ", ".join(sorted(forbidden)))
    junk = [p for p in ROOT.rglob("*") if p.is_file() and (p.suffix == ".pyc" or "__pycache__" in p.parts)]
    if junk:
        err(f"compiled Python junk present: {len(junk)} files")


def check_checksum_manifest() -> None:
    if os.environ.get("PRAVMIR_SKIP_CHECKSUMS") == "1":
        return
    path = ROOT / "FILE_SHA256SUMS.txt"
    if not path.exists():
        warn("FILE_SHA256SUMS.txt missing")
        return
    entries: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            digest, name = line.split("  ", 1)
        except ValueError:
            err("FILE_SHA256SUMS.txt: malformed line")
            continue
        name = name.removeprefix("./")
        entries[name] = digest
    # Verify only listed files here. Coverage is checked at release packaging time because
    # the manifest intentionally excludes itself and transient local files.
    for name, digest in entries.items():
        target = ROOT / name
        if not target.is_file():
            err(f"checksum target missing: {name}")
            continue
        actual = hashlib.sha256(target.read_bytes()).hexdigest()
        if actual != digest:
            err(f"checksum mismatch: {name}")

    excluded = {
        "FILE_SHA256SUMS.txt",
        "data/generated/import_report.json",
        "data/generated/dedupe_report.json",
    }
    shipped = {
        item.relative_to(ROOT).as_posix()
        for item in ROOT.rglob("*")
        if item.is_file() and item.relative_to(ROOT).as_posix() not in excluded
    }
    listed = set(entries)
    missing = sorted(shipped - listed)
    unexpected = sorted(listed - shipped)
    if missing:
        err("checksum manifest missing files: " + ", ".join(missing[:12]) + (f" (+{len(missing)-12})" if len(missing) > 12 else ""))
    if unexpected:
        err("checksum manifest has unexpected files: " + ", ".join(unexpected[:12]) + (f" (+{len(unexpected)-12})" if len(unexpected) > 12 else ""))


def main() -> int:
    check_required()
    check_version()
    check_json_tree()
    check_web_refs()
    targets = check_core_data()
    check_content(targets)
    check_liturgical(targets)
    check_events(targets)
    check_food(targets)
    check_pilgrim(targets)
    check_news(targets)
    check_library(targets)
    check_content_links(targets)
    check_my_pm()
    check_m62_backend()
    check_frontend_boundaries()
    check_cleanup()
    check_checksum_manifest()
    print(f"PROJECT CHECK: {len(ERRORS)} errors / {len(WARNINGS)} warnings")
    for msg in ERRORS:
        print("ERROR:", msg)
    for msg in WARNINGS:
        print("WARN:", msg)
    return 1 if ERRORS else 0


if __name__ == "__main__":
    raise SystemExit(main())
