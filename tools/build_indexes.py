#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import argparse
import hashlib
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
INDEX_SCHEMA_VERSION = "1.0.0"
TOKEN_RE = re.compile(r"[0-9a-zа-я]+", re.IGNORECASE)
STOPWORDS = {
    "в", "во", "на", "с", "со", "и", "к", "ко", "у", "по", "при", "из", "за", "для", "от", "до",
    "рф", "россия", "обл", "область", "район", "ул", "улица", "дом", "город", "село", "пос", "поселок",
    "посёлок", "дер", "деревня",
}

CYRILLIC_TRANSLIT = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"i",
    "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f",
    "х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalize_text(value) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
    tokens = TOKEN_RE.findall(text)
    return " ".join(tokens)


def search_tokens(value) -> list[str]:
    return [token for token in normalize_text(value).split() if len(token) >= 2 and token not in STOPWORDS]


def region_slug(value: str) -> str:
    normalized = normalize_text(value)
    out: list[str] = []
    for ch in normalized:
        if ch in CYRILLIC_TRANSLIT:
            out.append(CYRILLIC_TRANSLIT[ch])
        elif ch.isascii() and ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug or "unknown-region"


def searchable_values(place: dict) -> list[str]:
    address = place.get("address") or {}
    values = [
        place.get("name"),
        *(place.get("alt_names") or []),
        *(place.get("dedications") or []),
        address.get("region"),
        address.get("district"),
        address.get("locality"),
        address.get("formatted"),
        place.get("place_type"),
        place.get("status"),
    ]
    return [str(v) for v in values if v not in (None, "")]


def search_document(place: dict) -> dict:
    address = place.get("address") or {}
    location = place.get("location") or {}
    links = place.get("links") or {}
    quality = place.get("quality") or {}
    return {
        "id": place["id"],
        "slug": place["slug"],
        "name": place.get("name"),
        "place_type": place.get("place_type"),
        "status": place.get("status"),
        "region": address.get("region"),
        "locality": address.get("locality"),
        "lat": location.get("lat"),
        "lon": location.get("lon"),
        "detail_path": links.get("detail_path"),
        "quality_score": quality.get("score"),
    }


def validate_source(places: list[dict]) -> None:
    if not isinstance(places, list):
        raise ValueError("places_deduped.json root must be a list")
    ids: set[str] = set()
    slugs: set[str] = set()
    for i, place in enumerate(places):
        if not isinstance(place, dict):
            raise ValueError(f"place[{i}] must be an object")
        item_id = str(place.get("id") or "")
        slug = str(place.get("slug") or "")
        region = str((place.get("address") or {}).get("region") or "")
        if not item_id or not slug or not region:
            raise ValueError(f"place[{i}] missing id/slug/region")
        if item_id in ids:
            raise ValueError(f"duplicate id: {item_id}")
        if slug in slugs:
            raise ValueError(f"duplicate slug: {slug}")
        ids.add(item_id)
        slugs.add(slug)


def build_payloads(places: list[dict], source_rel: str, source_sha256: str, runtime_aliases: dict[str, str] | None = None):
    validate_source(places)
    ordered = sorted(places, key=lambda p: str(p["id"]))

    region_groups: dict[str, list[dict]] = defaultdict(list)
    region_slugs: dict[str, str] = {}
    slug_owner: dict[str, str] = {}
    for place in ordered:
        region = str(place["address"]["region"])
        rslug = region_slugs.setdefault(region, region_slug(region))
        other = slug_owner.setdefault(rslug, region)
        if other != region:
            raise ValueError(f"region slug collision: {other!r} and {region!r} -> {rslug!r}")
        region_groups[region].append(place)

    regions = []
    region_payloads: dict[str, dict] = {}
    for region in sorted(region_groups, key=lambda x: (normalize_text(x), x)):
        rslug = region_slugs[region]
        rows = region_groups[region]
        rel_file = f"regions/{rslug}.json"
        regions.append({"name": region, "slug": rslug, "file": rel_file, "count": len(rows)})
        region_payloads[rslug] = {
            "schema_version": INDEX_SCHEMA_VERSION,
            "region": region,
            "region_slug": rslug,
            "count": len(rows),
            "places": rows,
        }

    by_id: dict[str, dict] = {}
    by_slug: dict[str, str] = {}
    for doc_index, place in enumerate(ordered):
        item_id = str(place["id"])
        slug = str(place["slug"])
        region = str(place["address"]["region"])
        rslug = region_slugs[region]
        by_id[item_id] = {
            "slug": slug,
            "region_slug": rslug,
            "doc": doc_index,
        }
        by_slug[slug] = item_id

    canonical_ids = set(by_id)
    runtime_aliases = runtime_aliases or {}
    filtered_runtime_aliases = {
        str(alias): str(target)
        for alias, target in runtime_aliases.items()
        if str(target) in canonical_ids
    }

    index_payload = {
        "schema_version": INDEX_SCHEMA_VERSION,
        "source": source_rel,
        "source_sha256": source_sha256,
        "place_count": len(ordered),
        "region_count": len(regions),
        "by_id": by_id,
        "by_slug": by_slug,
        "runtime_id_aliases": dict(sorted(filtered_runtime_aliases.items())),
        "regions": regions,
    }

    documents: list[dict] = []
    postings_sets: dict[str, set[int]] = defaultdict(set)
    exact_names: dict[str, list[int]] = defaultdict(list)
    for doc_index, place in enumerate(ordered):
        doc = search_document(place)
        documents.append(doc)
        exact = normalize_text(place.get("name"))
        if exact:
            exact_names[exact].append(doc_index)
        tokens: set[str] = set()
        for value in searchable_values(place):
            tokens.update(search_tokens(value))
        for token in tokens:
            postings_sets[token].add(doc_index)

    terms = sorted(postings_sets)
    postings = {term: sorted(postings_sets[term]) for term in terms}
    exact_names_sorted = {name: sorted(indices) for name, indices in sorted(exact_names.items())}
    search_payload = {
        "schema_version": INDEX_SCHEMA_VERSION,
        "source": source_rel,
        "source_sha256": source_sha256,
        "place_count": len(ordered),
        "document_count": len(documents),
        "term_count": len(terms),
        "terms": terms,
        "postings": postings,
        "exact_names": exact_names_sorted,
        "documents": documents,
    }

    regions_manifest = {
        "schema_version": INDEX_SCHEMA_VERSION,
        "source": source_rel,
        "source_sha256": source_sha256,
        "place_count": len(ordered),
        "region_count": len(regions),
        "regions": regions,
    }

    report = {
        "schema_version": INDEX_SCHEMA_VERSION,
        "source": source_rel,
        "source_sha256": source_sha256,
        "places_indexed": len(ordered),
        "unique_ids": len(by_id),
        "unique_slugs": len(by_slug),
        "regions": len(regions),
        "search_documents": len(documents),
        "search_terms": len(terms),
        "posting_references": sum(len(ids) for ids in postings.values()),
        "runtime_id_aliases": len(filtered_runtime_aliases),
    }
    return index_payload, search_payload, regions_manifest, region_payloads, report


def build_indexes(input_path: Path, output_dir: Path, runtime_aliases_path: Path | None = None) -> dict:
    places = read_json(input_path)
    runtime_aliases = {}
    if runtime_aliases_path is not None and runtime_aliases_path.exists():
        payload = read_json(runtime_aliases_path)
        if isinstance(payload, dict):
            runtime_aliases = payload
    try:
        source_rel = input_path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        source_rel = input_path.name
    source_sha = file_sha256(input_path)
    index_payload, search_payload, regions_manifest, region_payloads, report = build_payloads(
        places, source_rel, source_sha, runtime_aliases
    )

    regions_dir = output_dir / "regions"
    regions_dir.mkdir(parents=True, exist_ok=True)
    expected_region_files = {f"{slug}.json" for slug in region_payloads}
    for stale in regions_dir.glob("*.json"):
        if stale.name not in expected_region_files:
            stale.unlink()

    write_json(output_dir / "index.json", index_payload)
    write_json(output_dir / "search_index.json", search_payload)
    write_json(output_dir / "regions_manifest.json", regions_manifest)
    for slug, payload in sorted(region_payloads.items()):
        write_json(regions_dir / f"{slug}.json", payload)
    write_json(output_dir / "index_report.json", report)
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="Build deterministic M2.5 regional shards and lookup/search indexes")
    ap.add_argument("--input", default=str(ROOT / "data/generated/places_deduped.json"))
    ap.add_argument("--output-dir", default=str(ROOT / "data/generated"))
    ap.add_argument("--runtime-aliases", default=str(ROOT / "data/generated/runtime_id_aliases.json"))
    args = ap.parse_args()
    report = build_indexes(Path(args.input), Path(args.output_dir), Path(args.runtime_aliases))
    print("M2.5 indexes built")
    for key in ("places_indexed", "unique_ids", "unique_slugs", "regions", "search_documents", "search_terms", "posting_references", "runtime_id_aliases"):
        print(f"{key}: {report[key]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
