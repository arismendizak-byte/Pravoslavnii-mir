#!/usr/bin/env python3
from __future__ import annotations

from argparse import ArgumentParser
from copy import deepcopy
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any, Iterable
import json
import re
import sys
import unicodedata

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ID_RE = re.compile(r"^pm-[0-9a-f]{32}$")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я]+", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def text_similarity(left: Any, right: Any) -> float:
    a, b = normalize_text(left), normalize_text(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def haversine_m(a: dict[str, Any], b: dict[str, Any]) -> float | None:
    try:
        lat1, lon1 = a.get("lat"), a.get("lon")
        lat2, lon2 = b.get("lat"), b.get("lon")
        if None in (lat1, lon1, lat2, lon2):
            return None
        lat1, lon1, lat2, lon2 = map(float, (lat1, lon1, lat2, lon2))
    except (TypeError, ValueError):
        return None
    r = 6_371_008.8
    p1, p2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    h = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlambda / 2) ** 2
    return 2 * r * asin(sqrt(h))


def region_key(place: dict[str, Any]) -> str:
    return normalize_text((place.get("address") or {}).get("region"))


def address_key(place: dict[str, Any]) -> str:
    return normalize_text((place.get("address") or {}).get("formatted"))


def types_compatible(a: dict[str, Any], b: dict[str, Any]) -> bool:
    left = str(a.get("place_type") or "unknown")
    right = str(b.get("place_type") or "unknown")
    return left == right or "unknown" in {left, right}


def source_identity(place: dict[str, Any]) -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for src in place.get("source_records") or []:
        provider = normalize_text((src or {}).get("provider"))
        source_id = str((src or {}).get("source_id") or "").strip()
        if provider and source_id:
            out.add((provider, source_id))
    return out


@dataclass(frozen=True)
class Match:
    kind: str
    reason: str
    confidence: float
    distance_m: float | None
    name_similarity: float
    address_similarity: float


def classify_pair(a: dict[str, Any], b: dict[str, Any]) -> Match | None:
    names = (normalize_text(a.get("name")), normalize_text(b.get("name")))
    name_sim = text_similarity(a.get("name"), b.get("name"))
    addresses = (address_key(a), address_key(b))
    address_sim = text_similarity(addresses[0], addresses[1])
    same_region = bool(region_key(a)) and region_key(a) == region_key(b)
    distance = haversine_m(a.get("location") or {}, b.get("location") or {})

    if source_identity(a) & source_identity(b):
        return Match("merge", "same_source_identity", 1.0, distance, name_sim, address_sim)

    # Exact same named object at essentially the same point is a safe duplicate even when one
    # source uses a shorter address string. Type compatibility prevents church/chapel pairs in
    # the same complex from being collapsed.
    if (
        same_region and all(names) and names[0] == names[1]
        and distance is not None and distance <= 10
        and types_compatible(a, b)
    ):
        return Match("merge", "same_name_within_10m", 0.997, distance, name_sim, address_sim)

    if same_region and all(names) and names[0] == names[1] and all(addresses) and addresses[0] == addresses[1]:
        if distance is None or distance <= 1000:
            return Match("merge", "same_name_and_address", 0.995, distance, name_sim, address_sim)
        return Match("review", "same_name_address_coordinate_conflict", 0.97, distance, name_sim, address_sim)

    if (
        same_region
        and all(names) and names[0] == names[1]
        and distance is not None and distance <= 40
        and types_compatible(a, b)
        and (not all(addresses) or address_sim >= 0.75)
    ):
        return Match("merge", "same_name_within_40m", 0.990, distance, name_sim, address_sim)

    if (
        same_region
        and distance is not None and distance <= 100
        and name_sim >= 0.985
        and address_sim >= 0.96
        and all(addresses)
    ):
        return Match("merge", "near_identical_name_address_within_100m", 0.985, distance, name_sim, address_sim)

    # Review only: intentionally broad enough to surface suspicious records without auto-merging them.
    review = False
    reason = ""
    confidence = 0.0
    if same_region and all(names) and names[0] == names[1] and distance is not None and distance <= 500:
        review, reason, confidence = True, "same_name_within_500m", 0.90
    elif (
        same_region and name_sim >= 0.94 and all(addresses) and address_sim >= 0.84
        and ((distance is not None and distance <= 5000) or (distance is None and address_sim >= 0.92))
    ):
        # Text-only similarity across distant settlements creates many false positives for churches
        # with common dedications. Keep this review rule local when coordinates exist, and stricter
        # when coordinates are missing.
        review, reason, confidence = True, "similar_name_and_address", min(0.94, (name_sim + address_sim) / 2)
    elif same_region and name_sim >= 0.92 and distance is not None and distance <= 250:
        review, reason, confidence = True, "similar_name_within_250m", min(0.93, 0.60 * name_sim + 0.40 * max(0.0, 1.0 - distance / 250.0))

    if review:
        return Match("review", reason, round(confidence, 4), distance, name_sim, address_sim)
    return None


class DSU:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))
        self.members: dict[int, set[int]] = {i: {i} for i in range(n)}

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> int:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return ra
        keep, drop = min(ra, rb), max(ra, rb)
        self.parent[drop] = keep
        self.members[keep] |= self.members.pop(drop)
        return keep

    def group(self, x: int) -> set[int]:
        return set(self.members[self.find(x)])


def completeness_score(place: dict[str, Any]) -> int:
    score = int((place.get("quality") or {}).get("score") or 0)
    score += 20 if (place.get("links") or {}).get("detail_path") else 0
    score += 4 if (place.get("descriptions") or {}).get("short") else 0
    score += 4 if (place.get("location") or {}).get("lat") is not None else 0
    score += 2 * len(place.get("source_records") or [])
    return score


def choose_canonical(group: list[dict[str, Any]], aliases: dict[str, str]) -> dict[str, Any]:
    ids = {str(x.get("id") or "") for x in group}
    preserved = sorted({aliases.get(item_id) for item_id in ids if aliases.get(item_id) in ids})
    if preserved:
        target = preserved[0]
        return next(x for x in group if x.get("id") == target)

    # Curated/manual detail links get preference; then richer data; final tie-break is stable ID.
    return sorted(
        group,
        key=lambda p: (
            0 if (p.get("links") or {}).get("detail_path") else 1,
            -completeness_score(p),
            str(p.get("id") or ""),
        ),
    )[0]


def unique_strings(values: Iterable[Any]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        text = str(value or "").strip()
        key = normalize_text(text)
        if text and key not in seen:
            seen.add(key)
            out.append(text)
    return out


def unique_dicts(values: Iterable[dict[str, Any]], key_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    out: list[dict[str, Any]] = []
    for value in values:
        key = tuple(value.get(field) for field in key_fields)
        if key in seen:
            continue
        seen.add(key)
        out.append(deepcopy(value))
    return out


def fill_dict_missing(target: dict[str, Any], source: dict[str, Any]) -> None:
    for key, value in source.items():
        if target.get(key) in (None, "", [], {}) and value not in (None, "", [], {}):
            target[key] = deepcopy(value)


def merge_group(group: list[dict[str, Any]], aliases: dict[str, str]) -> tuple[dict[str, Any], dict[str, str]]:
    from place_quality import compute_quality

    canonical_source = choose_canonical(group, aliases)
    merged = deepcopy(canonical_source)
    canonical_id = str(merged["id"])

    alt_names = list(merged.get("alt_names") or [])
    architects = list(merged.get("architects") or [])
    dedications = list(merged.get("dedications") or [])
    media = list(merged.get("media") or [])
    sources = list(merged.get("source_records") or [])
    merged_ids = list(merged.get("merged_from_ids") or [])

    alias_updates: dict[str, str] = {}
    for item in sorted(group, key=lambda p: str(p.get("id") or "")):
        item_id = str(item.get("id") or "")
        if item_id and item_id != canonical_id:
            merged_ids.append(item_id)
            alias_updates[item_id] = canonical_id
        for previous in item.get("merged_from_ids") or []:
            if previous != canonical_id:
                merged_ids.append(previous)
                alias_updates[str(previous)] = canonical_id
        if normalize_text(item.get("name")) != normalize_text(merged.get("name")):
            alt_names.append(item.get("name"))
        alt_names.extend(item.get("alt_names") or [])
        architects.extend(item.get("architects") or [])
        dedications.extend(item.get("dedications") or [])
        media.extend(item.get("media") or [])
        sources.extend(item.get("source_records") or [])

        if merged.get("place_type") == "unknown" and item.get("place_type") != "unknown":
            merged["place_type"] = item.get("place_type")
            merged["type_raw"] = item.get("type_raw")
        if merged.get("status") == "unknown" and item.get("status") != "unknown":
            merged["status"] = item.get("status")
            merged["status_raw"] = item.get("status_raw")

        for key in ("address", "location", "foundation", "descriptions", "links"):
            if isinstance(merged.get(key), dict) and isinstance(item.get(key), dict):
                fill_dict_missing(merged[key], item[key])

    merged["alt_names"] = unique_strings(alt_names)
    merged["architects"] = unique_strings(architects)
    merged["dedications"] = unique_strings(dedications)
    merged["media"] = unique_dicts(media, ("kind", "url", "path"))
    merged["source_records"] = unique_dicts(
        sources,
        ("provider", "source_id", "source_file", "source_row", "source_url"),
    )
    merged["source_records"].sort(key=lambda s: (
        str(s.get("provider") or ""), str(s.get("source_id") or ""),
        str(s.get("source_file") or ""), int(s.get("source_row") or 0),
    ))
    merged["merged_from_ids"] = sorted({str(x) for x in merged_ids if ID_RE.fullmatch(str(x)) and str(x) != canonical_id})
    merged["quality"] = compute_quality(merged)
    alias_updates[canonical_id] = canonical_id
    return merged, alias_updates


GENERIC_NAME_TOKENS = {
    "храм", "церковь", "собор", "часовня", "монастырь", "скит", "подворье",
    "колокольня", "источник", "святой", "святая", "святое", "святых", "святителя",
    "во", "в", "на", "при", "и", "имени", "преподобного", "блаженного", "апостола",
    "иконы", "икона", "божией", "богородицы", "матери", "господа", "господня",
    "архангела", "митрополита", "мученика", "великомученика", "равноапостольного",
}


def significant_name_tokens(place: dict[str, Any]) -> list[str]:
    tokens = [
        token for token in normalize_text(place.get("name")).split()
        if token not in GENERIC_NAME_TOKENS and len(token) >= 4
    ]
    if tokens:
        return tokens
    return [token for token in normalize_text(place.get("name")).split() if len(token) >= 4]


def _add_bucket_pairs(pair_set: set[tuple[int, int]], buckets: dict[Any, list[int]], *, max_bucket: int | None = None) -> None:
    for indexes in buckets.values():
        if len(indexes) < 2:
            continue
        # Extremely broad token buckets are not useful for entity resolution and create O(n²) work.
        if max_bucket is not None and len(indexes) > max_bucket:
            continue
        ordered = sorted(set(indexes))
        for pos, left in enumerate(ordered[:-1]):
            for right in ordered[pos + 1:]:
                pair_set.add((left, right))


def build_candidate_pairs(records: list[dict[str, Any]]) -> set[tuple[int, int]]:
    """Build a bounded candidate set instead of comparing large generic-name buckets."""
    pair_set: set[tuple[int, int]] = set()
    source_buckets: dict[tuple[str, str], list[int]] = defaultdict(list)
    exact_name_buckets: dict[tuple[str, str], list[int]] = defaultdict(list)
    exact_address_buckets: dict[tuple[str, str], list[int]] = defaultdict(list)
    rare_token_buckets: dict[tuple[str, str], list[int]] = defaultdict(list)
    geo_cells: dict[tuple[str, int, int], list[int]] = defaultdict(list)

    token_lists: list[list[str]] = []
    token_frequency: Counter[str] = Counter()
    for place in records:
        tokens = significant_name_tokens(place)
        token_lists.append(tokens)
        token_frequency.update(set(tokens))

    cell_size = 0.004  # about 444 m latitude; neighbour scan covers review threshold safely.
    for i, place in enumerate(records):
        region = region_key(place)
        name = normalize_text(place.get("name"))
        address = address_key(place)

        for identity in source_identity(place):
            source_buckets[identity].append(i)
        if region and name:
            exact_name_buckets[(region, name)].append(i)
        if region and address:
            exact_address_buckets[(region, address)].append(i)

        rare_tokens = sorted(set(token_lists[i]), key=lambda token: (token_frequency[token], token))
        for token in rare_tokens[:2]:
            if region and token_frequency[token] <= 120:
                rare_token_buckets[(region, token)].append(i)

        loc = place.get("location") or {}
        try:
            lat, lon = float(loc.get("lat")), float(loc.get("lon"))
        except (TypeError, ValueError):
            continue
        if region:
            gy, gx = int(lat // cell_size), int(lon // cell_size)
            geo_cells[(region, gy, gx)].append(i)

    _add_bucket_pairs(pair_set, source_buckets)
    _add_bucket_pairs(pair_set, exact_name_buckets)
    _add_bucket_pairs(pair_set, exact_address_buckets)
    _add_bucket_pairs(pair_set, rare_token_buckets, max_bucket=120)

    # Compare only neighbouring fine geo cells. This avoids the huge cross-product produced by
    # placing every point into all neighbouring kilometre-scale cells.
    for (region, gy, gx), indexes in geo_cells.items():
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                others = geo_cells.get((region, gy + dy, gx + dx), [])
                if not others:
                    continue
                for left in indexes:
                    for right in others:
                        if left < right:
                            pair_set.add((left, right))
    return pair_set


def dedupe_places(records: list[dict[str, Any]], aliases: dict[str, str] | None = None) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]], dict[str, str]]:
    aliases = dict(aliases or {})
    n = len(records)
    dsu = DSU(n)
    merge_matches: list[dict[str, Any]] = []
    review_candidates: list[dict[str, Any]] = []

    pair_set = build_candidate_pairs(records)

    strong_matches: list[tuple[int, int, Match, dict[str, Any]]] = []
    for i, j in sorted(pair_set):
        match = classify_pair(records[i], records[j])
        if not match:
            continue
        payload = {
            "left_id": records[i].get("id"),
            "right_id": records[j].get("id"),
            "reason": match.reason,
            "confidence": round(match.confidence, 4),
            "distance_m": None if match.distance_m is None else round(match.distance_m, 2),
            "name_similarity": round(match.name_similarity, 4),
            "address_similarity": round(match.address_similarity, 4),
        }
        if match.kind == "merge":
            strong_matches.append((i, j, match, payload))
        else:
            review_candidates.append(payload)

    # Complete-link clustering: a strong A↔B and B↔C chain must not silently merge A↔C
    # unless every cross-pair between both clusters independently meets the auto-merge rule.
    strong_matches.sort(key=lambda row: (-row[2].confidence, row[2].distance_m if row[2].distance_m is not None else 10**12, str(row[3]["left_id"]), str(row[3]["right_id"])))
    for i, j, match, payload in strong_matches:
        if dsu.find(i) == dsu.find(j):
            continue
        left_group, right_group = dsu.group(i), dsu.group(j)
        all_strong = True
        for li in left_group:
            for rj in right_group:
                cross = classify_pair(records[li], records[rj])
                if not cross or cross.kind != "merge":
                    all_strong = False
                    break
            if not all_strong:
                break
        if all_strong:
            dsu.union(i, j)
            merge_matches.append(payload)
        else:
            blocked = dict(payload)
            blocked["reason"] = "cluster_merge_conflict:" + match.reason
            blocked["confidence"] = min(float(blocked["confidence"]), 0.97)
            review_candidates.append(blocked)

    groups: dict[int, list[dict[str, Any]]] = {}
    for i, place in enumerate(records):
        groups.setdefault(dsu.find(i), []).append(place)

    deduped: list[dict[str, Any]] = []
    updated_aliases = dict(aliases)
    merged_groups: list[dict[str, Any]] = []
    for group in groups.values():
        merged, alias_updates = merge_group(group, updated_aliases)
        updated_aliases.update(alias_updates)
        deduped.append(merged)
        if len(group) > 1:
            merged_groups.append({
                "canonical_id": merged["id"],
                "merged_ids": sorted(str(x.get("id")) for x in group if x.get("id") != merged["id"]),
                "source_count": len(merged.get("source_records") or []),
            })

    # Normalize review references after merges so manual review never points only at disappeared IDs.
    normalized_review: list[dict[str, Any]] = []
    seen_review: set[tuple[str, str, str]] = set()
    for candidate in review_candidates:
        original_left = str(candidate["left_id"])
        original_right = str(candidate["right_id"])
        left = str(updated_aliases.get(original_left, original_left))
        right = str(updated_aliases.get(original_right, original_right))
        if left == right:
            continue
        left, right = sorted((left, right))
        key = (left, right, str(candidate.get("reason") or ""))
        if key in seen_review:
            continue
        seen_review.add(key)
        item = dict(candidate)
        item["left_id"] = left
        item["right_id"] = right
        if original_left != left or original_right != right:
            item["source_pair"] = [original_left, original_right]
        normalized_review.append(item)
    review_candidates = normalized_review

    unresolved_ids = {str(x["left_id"]) for x in review_candidates} | {str(x["right_id"]) for x in review_candidates}
    if unresolved_ids:
        from place_quality import compute_quality
        for place in deduped:
            if str(place.get("id")) in unresolved_ids:
                place["quality"] = compute_quality(place, possible_duplicate=True)

    deduped.sort(key=lambda p: str(p.get("id") or ""))
    review_candidates.sort(key=lambda x: (str(x["left_id"]), str(x["right_id"]), x["reason"]))
    merged_groups.sort(key=lambda x: str(x["canonical_id"]))

    report = {
        "schema_version": "1.0.0",
        "generated_at": now_iso(),
        "input_records": n,
        "candidate_pairs_evaluated": len(pair_set),
        "output_records": len(deduped),
        "records_removed_by_merge": n - len(deduped),
        "auto_merge_pairs": len(merge_matches),
        "auto_merged_groups": len(merged_groups),
        "review_candidates": len(review_candidates),
        "blocked_cluster_merges": sum(1 for x in review_candidates if str(x.get("reason", "")).startswith("cluster_merge_conflict:")),
        "merged_groups": merged_groups,
        "merge_matches": merge_matches,
    }
    return deduped, report, review_candidates, updated_aliases


def main(argv: list[str] | None = None) -> int:
    ap = ArgumentParser(description="Conservative dedupe for canonical place v1 data")
    ap.add_argument("--input", default=str(ROOT / "data/generated/places_imported.json"))
    ap.add_argument("--output", default=str(ROOT / "data/generated/places_deduped.json"))
    ap.add_argument("--report", default=str(ROOT / "data/generated/dedupe_report.json"))
    ap.add_argument("--review", default=str(ROOT / "data/generated/review_candidates.json"))
    ap.add_argument("--aliases", default=str(ROOT / "data/generated/dedupe_aliases.json"))
    ap.add_argument("--runtime-alias-input", default=str(ROOT / "data/generated/import_runtime_id_aliases.json"))
    ap.add_argument("--runtime-aliases", default=str(ROOT / "data/generated/runtime_id_aliases.json"))
    args = ap.parse_args(argv)

    in_path = Path(args.input)
    try:
        records = load_json(in_path)
        if not isinstance(records, list):
            raise ValueError("input root must be a JSON array")
    except Exception as exc:
        print(f"Dedupe input error: {exc}", file=sys.stderr)
        return 2

    sys.path.insert(0, str(HERE))
    from validate_places import validate_payload
    input_errors = validate_payload(records)
    if input_errors:
        print(f"Input validation failed: {len(input_errors)}", file=sys.stderr)
        for item in input_errors[:50]:
            print(" -", item, file=sys.stderr)
        return 2

    aliases = load_json(Path(args.aliases), default={}) or {}
    if not isinstance(aliases, dict):
        aliases = {}
    import_aliases = load_json(ROOT / "data/generated/import_id_aliases.json", default={}) or {}
    if isinstance(import_aliases, dict):
        # Import migration aliases take precedence over stale recovery aliases for the same old ID.
        aliases.update(import_aliases)

    deduped, report, review, aliases_out = dedupe_places(records, aliases)

    # Resolve alias chains so every historical ID points directly to the final canonical ID.
    for source_id in list(aliases_out):
        target = str(aliases_out[source_id])
        seen = {str(source_id)}
        while target in aliases_out and str(aliases_out[target]) != target and target not in seen:
            seen.add(target)
            target = str(aliases_out[target])
        aliases_out[source_id] = target
    output_errors = validate_payload(deduped)
    if output_errors:
        print(f"Output validation failed: {len(output_errors)}", file=sys.stderr)
        for item in output_errors[:50]:
            print(" -", item, file=sys.stderr)
        return 2

    runtime_alias_input = load_json(Path(args.runtime_alias_input), default={}) or {}
    runtime_aliases_out: dict[str, str] = {}
    if isinstance(runtime_alias_input, dict):
        canonical_ids = {str(place.get("id")) for place in deduped}
        for runtime_id, initial_target in runtime_alias_input.items():
            target = str(initial_target)
            seen = set()
            while target in aliases_out and str(aliases_out[target]) != target and target not in seen:
                seen.add(target)
                target = str(aliases_out[target])
            if target in canonical_ids:
                runtime_aliases_out[str(runtime_id)] = target

    write_json(Path(args.output), deduped)
    write_json(Path(args.report), report)
    write_json(Path(args.review), review)
    write_json(Path(args.aliases), dict(sorted(aliases_out.items())))
    write_json(Path(args.runtime_aliases), dict(sorted(runtime_aliases_out.items())))

    print(f"Input records: {report['input_records']}")
    print(f"Output records: {report['output_records']}")
    print(f"Merged away: {report['records_removed_by_merge']}")
    print(f"Review candidates: {report['review_candidates']}")
    print(f"Output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
