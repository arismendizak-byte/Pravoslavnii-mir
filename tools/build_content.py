#!/usr/bin/env python3
from __future__ import annotations

from argparse import ArgumentParser
from datetime import date
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re
import unicodedata
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SNAPSHOT_PATH = DATA / "schema/content_source_snapshot.json"
DEFAULT_OUT = DATA / "generated"

RU_MONTHS = {
    "января": 1, "янв": 1,
    "февраля": 2, "фев": 2,
    "марта": 3, "мар": 3,
    "апреля": 4, "апр": 4,
    "мая": 5, "май": 5,
    "июня": 6, "июн": 6,
    "июля": 7, "июл": 7,
    "августа": 8, "авг": 8,
    "сентября": 9, "сен": 9,
    "октября": 10, "окт": 10,
    "ноября": 11, "ноя": 11,
    "декабря": 12, "дек": 12,
}
STOPWORDS = {
    "в", "во", "на", "с", "со", "и", "к", "ко", "у", "по", "при", "из", "за", "для", "от", "до",
    "о", "об", "а", "но", "как", "что", "г", "год", "года", "рф", "россия"
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def snapshot_hash(snapshot: dict) -> str:
    encoded = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(encoded)


def verify_snapshot() -> dict:
    snapshot = read_json(SNAPSHOT_PATH)
    errors: list[str] = []
    for source in snapshot.get("sources", []):
        rel = str(source.get("file") or "")
        path = ROOT / rel
        if not path.exists():
            errors.append(f"missing source: {rel}")
            continue
        actual_size = path.stat().st_size
        actual_sha = sha256_file(path)
        if actual_size != source.get("size"):
            errors.append(f"source size mismatch: {rel}: {actual_size} != {source.get('size')}")
        if actual_sha != source.get("sha256"):
            errors.append(f"source sha256 mismatch: {rel}")
    if errors:
        raise SystemExit("content source snapshot mismatch:\n - " + "\n - ".join(errors))
    return snapshot


def stable_id(prefix: str, *parts: object) -> str:
    raw = "\x1f".join(str(part) for part in parts).encode("utf-8")
    return prefix + hashlib.sha256(raw).hexdigest()[:20]


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я]+", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def search_tokens(*values: object) -> list[str]:
    tokens: set[str] = set()
    for value in values:
        for token in normalize_text(value).split():
            if len(token) >= 2 and token not in STOPWORDS:
                tokens.add(token)
    return sorted(tokens)


def slug_token(value: object) -> str:
    text = normalize_text(value)
    text = re.sub(r"[^0-9a-z]+", "-", text)
    return text.strip("-")


def parse_ru_date(label: object) -> str | None:
    text = str(label or "").strip().lower().replace(".", "")
    match = re.fullmatch(r"(\d{1,2})\s+([а-яё]+)\s+(\d{4})", text)
    if not match:
        return None
    day = int(match.group(1))
    month = RU_MONTHS.get(match.group(2))
    year = int(match.group(3))
    if not month:
        return None
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def nullable(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def author_id(name: object) -> str | None:
    value = nullable(name)
    return stable_id("pm-author-", "content-author", normalize_text(value)) if value else None


def category_id(name: object) -> str | None:
    value = nullable(name)
    return stable_id("pm-category-", "content-category", normalize_text(value)) if value else None


def canonical_article_path(slug: str) -> str:
    return f"articles/article.html?slug={slug}"


def media_from_emoji(value: object, title: str) -> list[dict]:
    emoji = nullable(value)
    if not emoji:
        return []
    return [{"kind": "emoji", "value": emoji, "alt": f"Иллюстрация к материалу «{title}»", "source_url": None}]


def local_articles() -> list[dict]:
    rows = read_json(DATA / "articles.json")
    out: list[dict] = []
    for row_number, row in enumerate(rows, 1):
        source_id = str(row.get("id"))
        item_id = stable_id("pm-content-", "pravmir-legacy-articles", source_id)
        slug = f"article-{source_id}"
        body_path = f"articles/{row.get('file')}" if row.get("file") else None
        title = str(row.get("title") or "").strip()
        author = nullable(row.get("author"))
        category = nullable(row.get("tag"))
        source_records = [{
            "provider": "pravmir-legacy-articles",
            "source_id": source_id,
            "source_file": "data/articles.json",
            "source_row": row_number,
            "source_url": None,
            "migrated_from": None,
        }]
        if body_path:
            source_records.append({
                "provider": "pravmir-legacy-article-html",
                "source_id": source_id,
                "source_file": body_path,
                "source_row": None,
                "source_url": None,
                "migrated_from": "legacy standalone article HTML",
            })
        out.append({
            "id": item_id,
            "slug": slug,
            "content_type": "article",
            "title": title,
            "summary": nullable(row.get("description")),
            "author": author,
            "author_ref": author_id(author),
            "published_on": parse_ru_date(row.get("date")),
            "published_label": nullable(row.get("date")),
            "publisher": "Православный Мир",
            "tags": [category] if category else [],
            "category_refs": [category_id(category)] if category else [],
            "emoji": nullable(row.get("emoji")),
            "media": media_from_emoji(row.get("emoji"), title),
            "body_path": body_path,
            "body_ref": item_id if body_path else None,
            "external_url": None,
            "canonical_path": canonical_article_path(slug),
            "status": "published",
            "verification_status": "legacy_curated",
            "references": [],
            "source_records": source_records,
        })
    return out


def journal_items() -> list[dict]:
    payload = read_json(DATA / "content_sources/journalpp_legacy.json")
    out: list[dict] = []
    publisher = "Православный паломник"
    author_ref = author_id(publisher)
    for section, content_type in (("articles", "external_article"), ("news", "news")):
        for row_number, row in enumerate(payload.get(section, []), 1):
            url = str(row.get("link") or "").strip()
            parsed = urlparse(url)
            path_key = parsed.path.strip("/") or f"{section}-{row_number}"
            source_id = f"{section}:{path_key}"
            item_id = stable_id("pm-content-", payload.get("provider"), source_id)
            slug = "journalpp-" + (slug_token(path_key) or hashlib.sha256(source_id.encode()).hexdigest()[:12])
            category = "Новость" if content_type == "news" else "Паломничество"
            title = str(row.get("title") or "").strip()
            out.append({
                "id": item_id,
                "slug": slug,
                "content_type": content_type,
                "title": title,
                "summary": nullable(row.get("description")),
                "author": publisher,
                "author_ref": author_ref,
                "published_on": parse_ru_date(row.get("date")),
                "published_label": nullable(row.get("date")),
                "publisher": publisher,
                "tags": [publisher, category],
                "category_refs": [category_id(category)],
                "emoji": nullable(row.get("emoji")),
                "media": media_from_emoji(row.get("emoji"), title),
                "body_path": None,
                "body_ref": None,
                "external_url": url or None,
                "canonical_path": canonical_article_path(slug),
                "status": "published",
                "verification_status": "legacy_curated",
                "references": [],
                "source_records": [{
                    "provider": str(payload.get("provider")),
                    "source_id": source_id,
                    "source_file": "data/content_sources/journalpp_legacy.json",
                    "source_row": row_number,
                    "source_url": url or None,
                    "migrated_from": str(payload.get("migrated_from") or "") or None,
                }],
            })
    return out


class ArticleBodyExtractor(HTMLParser):
    ALLOWED = {"p", "strong", "em", "b", "i", "h2", "h3", "ul", "ol", "li", "blockquote", "br", "a", "span"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.in_body = False
        self.capture_depth = 0
        self.skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        classes = set(str(attrs_dict.get("class") or "").split())
        if not self.in_body and tag == "div" and "article-content" in classes:
            self.in_body = True
            self.depth = 1
            return
        if not self.in_body:
            return
        self.depth += 1
        if self.skip_depth:
            self.skip_depth += 1
            return
        if tag == "button" or (tag == "a" and "back-btn" in classes):
            self.skip_depth = 1
            return
        if tag in self.ALLOWED:
            if tag == "a":
                href = str(attrs_dict.get("href") or "").strip()
                if href.startswith(("http://", "https://", "mailto:", "tel:", "#")) or (href and not href.startswith(("javascript:", "data:"))):
                    self.parts.append('<a href="' + escape(href, quote=True) + '">')
                else:
                    self.parts.append("<span>")
            elif tag == "br":
                self.parts.append("<br>")
            else:
                self.parts.append(f"<{tag}>")
            self.capture_depth += 1

    def handle_endtag(self, tag):
        if not self.in_body:
            return
        if self.skip_depth:
            self.skip_depth -= 1
            self.depth -= 1
            return
        if tag == "div" and self.depth == 1:
            self.in_body = False
            self.depth = 0
            return
        if tag in self.ALLOWED and tag != "br" and self.capture_depth:
            self.parts.append("</span>" if tag == "a" and self.parts and self.parts[-1] == "<span>" else f"</{tag}>")
            self.capture_depth -= 1
        self.depth -= 1

    def handle_data(self, data):
        if self.in_body and not self.skip_depth:
            self.parts.append(escape(data))


def extract_article_body(path: Path) -> str:
    parser = ArticleBodyExtractor()
    parser.feed(path.read_text(encoding="utf-8-sig", errors="strict"))
    html = "".join(parser.parts).strip()
    if not html:
        raise SystemExit(f"article body extraction failed: {path.relative_to(ROOT).as_posix()}")
    if "<script" in html.lower() or "<button" in html.lower():
        raise SystemExit(f"unsafe article body generated: {path.relative_to(ROOT).as_posix()}")
    return html


def build_article_bodies(content: list[dict]) -> list[dict]:
    bodies: list[dict] = []
    for item in content:
        path_value = item.get("body_path")
        if not path_value:
            continue
        path = ROOT / path_value
        bodies.append({
            "content_id": item["id"],
            "format": "trusted_html_fragment",
            "html": extract_article_body(path),
            "source_file": path_value,
            "source_sha256": sha256_file(path),
        })
    return sorted(bodies, key=lambda row: row["content_id"])


def build_authors(content: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for item in content:
        name = item.get("author")
        ref = item.get("author_ref")
        if not name or not ref:
            continue
        row = merged.setdefault(ref, {
            "id": ref,
            "name": name,
            "slug": "author-" + slug_token(name)[:64].strip("-"),
            "verification_status": item.get("verification_status", "legacy_curated"),
            "source_records": [],
        })
        for source in item.get("source_records", []):
            if source.get("source_file", "").startswith("articles/"):
                continue
            key = (source.get("provider"), source.get("source_id"), source.get("source_file"), source.get("source_row"))
            if not any((x.get("provider"), x.get("source_id"), x.get("source_file"), x.get("source_row")) == key for x in row["source_records"]):
                row["source_records"].append(dict(source))
    return sorted(merged.values(), key=lambda row: row["id"])


def build_categories(content: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for item in content:
        refs = item.get("category_refs") or []
        category_names = [tag for tag in (item.get("tags") or []) if category_id(tag) in refs]
        for ref, name in zip(refs, category_names):
            row = merged.setdefault(ref, {
                "id": ref,
                "name": name,
                "slug": "category-" + slug_token(name)[:64].strip("-"),
                "verification_status": item.get("verification_status", "legacy_curated"),
                "source_records": [],
            })
            for source in item.get("source_records", []):
                if source.get("source_file", "").startswith("articles/"):
                    continue
                key = (source.get("provider"), source.get("source_id"), source.get("source_file"), source.get("source_row"))
                if not any((x.get("provider"), x.get("source_id"), x.get("source_file"), x.get("source_row")) == key for x in row["source_records"]):
                    row["source_records"].append(dict(source))
    return sorted(merged.values(), key=lambda row: row["id"])


def calendar_entries() -> list[dict]:
    payload = read_json(DATA / "content_sources/calendar_2026_legacy.json")
    provider = str(payload.get("provider"))
    migrated_from = str(payload.get("migrated_from") or "") or None
    out: list[dict] = []
    type_map = {"holiday": "feast", "fast": "fast", "event": "commemoration"}
    for row_number, row in enumerate(payload.get("entries", []), 1):
        date_value = str(row.get("date") or "")
        title = str(row.get("title") or "").strip()
        legacy_type = str(row.get("type") or "event")
        source_id = f"entry:{date_value}:{normalize_text(title)}"
        out.append({
            "id": stable_id("pm-cal-", provider, source_id),
            "calendar_kind": type_map.get(legacy_type, "calendar_event"),
            "title": title,
            "date_start": date_value,
            "date_end": date_value,
            "calendar_system": "civil_date_legacy",
            "verification_status": "legacy_unverified",
            "references": [],
            "source_records": [{
                "provider": provider,
                "source_id": source_id,
                "source_file": "data/content_sources/calendar_2026_legacy.json",
                "source_row": row_number,
                "source_url": None,
                "migrated_from": migrated_from,
            }],
        })
    offset = len(payload.get("entries", []))
    for index, row in enumerate(payload.get("fast_periods", []), 1):
        source_id = str(row.get("source_id") or f"fast-{index}")
        out.append({
            "id": stable_id("pm-cal-", provider, source_id),
            "calendar_kind": "fast",
            "title": str(row.get("title") or "").strip(),
            "date_start": str(row.get("date_start") or ""),
            "date_end": str(row.get("date_end") or ""),
            "calendar_system": "civil_date_legacy",
            "verification_status": "legacy_unverified",
            "references": [],
            "source_records": [{
                "provider": provider,
                "source_id": source_id,
                "source_file": "data/content_sources/calendar_2026_legacy.json",
                "source_row": offset + index,
                "source_url": None,
                "migrated_from": migrated_from,
            }],
        })
    return out


def pilgrim_services() -> list[dict]:
    rows = read_json(DATA / "pilgrim-centers.json")
    out: list[dict] = []
    seen_identity: set[str] = set()
    for row_number, row in enumerate(rows, 1):
        identity = "|".join([
            normalize_text(row.get("name")),
            normalize_text(row.get("org")),
            normalize_text(row.get("region")),
        ])
        if not identity.strip("|"):
            raise SystemExit(f"data/pilgrim-centers.json row {row_number}: empty identity")
        if identity in seen_identity:
            raise SystemExit(f"data/pilgrim-centers.json row {row_number}: duplicate semantic identity")
        seen_identity.add(identity)
        source_id = "legacy:" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]
        out.append({
            "id": stable_id("pm-pilgrim-", "pravmir-legacy-pilgrim-services", source_id),
            "service_type": "pilgrimage_service",
            "name": str(row.get("name") or "").strip(),
            "region_text": nullable(row.get("region")),
            "organization": nullable(row.get("org")),
            "contacts": {
                "phone": nullable(row.get("phone")),
                "website": nullable(row.get("website")),
                "email": nullable(row.get("email")),
            },
            "verification_status": "legacy_unverified",
            "references": [],
            "source_records": [{
                "provider": "pravmir-legacy-pilgrim-services",
                "source_id": source_id,
                "source_file": "data/pilgrim-centers.json",
                "source_row": row_number,
                "source_url": nullable(row.get("website")),
                "migrated_from": None,
            }],
        })
    return out


def validate_dates(entries: list[dict]) -> None:
    for entry in entries:
        try:
            start = date.fromisoformat(entry["date_start"])
            end = date.fromisoformat(entry["date_end"])
        except Exception as exc:
            raise SystemExit(f"invalid calendar date in {entry.get('id')}: {exc}")
        if end < start:
            raise SystemExit(f"calendar range inverted: {entry.get('id')}")


def editorial_links(content_ids: set[str]) -> list[dict]:
    path = DATA / "content_sources/editorial_links.json"
    payload = read_json(path)
    provider = str(payload.get("provider") or "").strip()
    verification_status = str(payload.get("verification_status") or "editorial_verified").strip()
    if not provider:
        raise SystemExit("editorial content links: provider is required")
    if verification_status not in {"source_verified", "editorial_verified"}:
        raise SystemExit("editorial content links: unsupported verification_status")
    out: list[dict] = []
    seen_source_ids: set[str] = set()
    for row_number, row in enumerate(payload.get("links", []), 1):
        source_id = str(row.get("source_id") or "").strip()
        source_content_id = str(row.get("source_content_id") or "").strip()
        relation_type = str(row.get("relation_type") or "").strip()
        target = row.get("target") or {}
        target_kind = str(target.get("kind") or "").strip()
        target_id = str(target.get("id") or "").strip()
        if not source_id or source_id in seen_source_ids:
            raise SystemExit(f"editorial content links row {row_number}: source_id must be unique and non-empty")
        seen_source_ids.add(source_id)
        if source_content_id not in content_ids:
            raise SystemExit(f"editorial content links row {row_number}: unknown content {source_content_id}")
        if not relation_type or not target_kind or not target_id:
            raise SystemExit(f"editorial content links row {row_number}: relation_type and target are required")
        out.append({
            "id": stable_id("pm-clink-", provider, source_id),
            "relation_type": relation_type,
            "from": {"kind": "content", "id": source_content_id},
            "to": {"kind": target_kind, "id": target_id},
            "verification_status": verification_status,
            "source_records": [{
                "provider": provider,
                "source_id": source_id,
                "source_file": "data/content_sources/editorial_links.json",
                "source_row": row_number,
                "source_url": None,
                "migrated_from": None,
            }],
        })
    return sorted(out, key=lambda row: row["id"])


def validate_content(items: list[dict]) -> None:
    ids = set()
    slugs = set()
    for item in items:
        if not item["title"]:
            raise SystemExit(f"content item without title: {item.get('id')}")
        if item["id"] in ids:
            raise SystemExit(f"duplicate content id: {item['id']}")
        if item["slug"] in slugs:
            raise SystemExit(f"duplicate content slug: {item['slug']}")
        ids.add(item["id"])
        slugs.add(item["slug"])
        body_path = item.get("body_path")
        if body_path and not (ROOT / body_path).is_file():
            raise SystemExit(f"content body_path missing: {body_path}")


def index_doc(kind: str, row: dict) -> dict:
    if kind == "content":
        title = row["title"]
        subtitle = row.get("summary") or row.get("author") or ""
        region = ""
        slug = row.get("slug")
        date_start = row.get("published_on")
        type_value = row.get("content_type")
        extra = list(row.get("tags", [])) + [row.get("publisher") or "", row.get("author") or ""]
    elif kind == "event":
        title = row["title"]
        subtitle = row.get("summary") or ""
        region = ""
        slug = row.get("slug")
        date_start = row.get("starts_at", "")[:10]
        type_value = row.get("event_type")
        extra = []
    elif kind == "calendar_entry":
        title = row["title"]
        subtitle = row.get("calendar_kind") or ""
        region = ""
        slug = None
        date_start = row.get("date_start")
        type_value = row.get("calendar_kind")
        extra = []
    else:
        title = row["name"]
        subtitle = row.get("organization") or ""
        region = row.get("region_text") or ""
        slug = None
        date_start = None
        type_value = row.get("service_type")
        extra = [row.get("contacts", {}).get("website") or ""]
    return {
        "kind": kind,
        "id": row["id"],
        "slug": slug,
        "title": title,
        "subtitle": subtitle,
        "region": region,
        "date_start": date_start,
        "type": type_value,
        "tokens": search_tokens(title, subtitle, region, type_value, *extra),
    }


def build_search(docs: list[dict]) -> dict:
    docs = sorted(docs, key=lambda row: (row["kind"], row["id"]))
    postings: dict[str, list[int]] = {}
    compact_docs: list[dict] = []
    for ordinal, row in enumerate(docs):
        tokens = row.pop("tokens")
        compact_docs.append(row)
        for token in tokens:
            postings.setdefault(token, []).append(ordinal)
    terms = sorted(postings)
    return {
        "documents": compact_docs,
        "terms": terms,
        "postings": {term: postings[term] for term in terms},
    }


def main(argv: list[str] | None = None) -> int:
    parser = ArgumentParser(description="Build deterministic M5 Content Core outputs through M5.2")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT), help="Output directory (default data/generated)")
    args = parser.parse_args(argv)
    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir

    snapshot = verify_snapshot()
    source_hash = snapshot_hash(snapshot)

    content = sorted(local_articles() + journal_items(), key=lambda row: row["id"])
    authors = build_authors(content)
    categories = build_categories(content)
    bodies = build_article_bodies(content)
    events: list[dict] = []
    calendar = sorted(calendar_entries(), key=lambda row: (row["date_start"], row["date_end"], row["id"]))
    pilgrim = sorted(pilgrim_services(), key=lambda row: row["id"])
    validate_content(content)
    links = editorial_links({row["id"] for row in content})

    validate_dates(calendar)
    author_ids = {row["id"] for row in authors}
    category_ids = {row["id"] for row in categories}
    body_ids = {row["content_id"] for row in bodies}
    for item in content:
        if item.get("author_ref") and item["author_ref"] not in author_ids:
            raise SystemExit(f"dangling author_ref: {item['id']} -> {item['author_ref']}")
        if any(ref not in category_ids for ref in item.get("category_refs", [])):
            raise SystemExit(f"dangling category_ref: {item['id']}")
        if item.get("body_ref") and item["body_ref"] not in body_ids:
            raise SystemExit(f"dangling body_ref: {item['id']}")

    docs = [index_doc("content", dict(row)) for row in content]
    docs += [index_doc("event", dict(row)) for row in events]
    docs += [index_doc("calendar_entry", dict(row)) for row in calendar]
    docs += [index_doc("pilgrim_service", dict(row)) for row in pilgrim]
    search = build_search(docs)

    by_id: dict[str, dict] = {}
    by_slug: dict[str, str] = {}
    for kind, rows in (("content", content), ("event", events), ("calendar_entry", calendar), ("pilgrim_service", pilgrim)):
        for ordinal, row in enumerate(rows):
            if row["id"] in by_id:
                raise SystemExit(f"duplicate global content-core id: {row['id']}")
            by_id[row["id"]] = {"kind": kind, "doc": ordinal}
            if row.get("slug"):
                if row["slug"] in by_slug:
                    raise SystemExit(f"duplicate global content-core slug: {row['slug']}")
                by_slug[row["slug"]] = row["id"]

    payloads = {
        "content_items.json": {
            "schema_version": "1.1.0", "source_snapshot_sha256": source_hash,
            "count": len(content), "items": content,
        },
        "content_authors.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "count": len(authors), "authors": authors,
        },
        "content_categories.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "count": len(categories), "categories": categories,
        },
        "content_bodies.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "count": len(bodies), "bodies": bodies,
        },
        "events.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "count": len(events), "events": events,
        },
        "calendar_entries.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "count": len(calendar), "entries": calendar,
        },
        "pilgrim_services.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "count": len(pilgrim), "services": pilgrim,
        },
        "content_links.json": {
            "schema_version": "1.0.0", "source_snapshot_sha256": source_hash,
            "count": len(links), "links": links,
        },
        "content_index.json": {
            "schema_version": "1.1.0", "source_snapshot_sha256": source_hash,
            "counts": {
                "content": len(content), "authors": len(authors), "categories": len(categories), "article_bodies": len(bodies),
                "events": len(events), "calendar_entries": len(calendar), "pilgrim_services": len(pilgrim),
                "links": len(links), "search_documents": len(search["documents"]),
            },
            "by_id": dict(sorted(by_id.items())),
            "by_slug": dict(sorted(by_slug.items())),
            "search": search,
        },
        "content_report.json": {
            "schema_version": "1.1.0",
            "source_snapshot_sha256": source_hash,
            "source_counts": {
                "local_articles": len(read_json(DATA / "articles.json")),
                "local_article_html": len([row for row in content if row.get("body_path")]),
                "journal_articles": len(read_json(DATA / "content_sources/journalpp_legacy.json").get("articles", [])),
                "journal_news": len(read_json(DATA / "content_sources/journalpp_legacy.json").get("news", [])),
                "editorial_links": len(read_json(DATA / "content_sources/editorial_links.json").get("links", [])),
                "calendar_explicit_entries": len(read_json(DATA / "content_sources/calendar_2026_legacy.json").get("entries", [])),
                "calendar_fast_periods": len(read_json(DATA / "content_sources/calendar_2026_legacy.json").get("fast_periods", [])),
                "pilgrim_services": len(read_json(DATA / "pilgrim-centers.json")),
            },
            "generated_counts": {
                "content": len(content), "authors": len(authors), "categories": len(categories), "article_bodies": len(bodies),
                "events": len(events), "calendar_entries": len(calendar), "pilgrim_services": len(pilgrim),
                "links": len(links), "search_documents": len(search["documents"]),
            },
            "unresolved_or_inferred_graph_links": 0,
            "derived_related_content_is_canonical_relation": False,
            "notes": [
                "M5.2 journal/article delivery uses PravmirContent generated outputs only at runtime.",
                "Author/category records are deterministic materializations of explicit legacy metadata, not name-matched graph facts.",
                "Article bodies are generated from snapshotted legacy article HTML and sanitized to a small trusted HTML subset.",
                "Related-content suggestions are derived from explicit category/tag metadata and are not canonical graph relations.",
                "Cross-domain content links come only from data/content_sources/editorial_links.json; title/text matching never creates canonical links.",
                "Legacy calendar dates remain civil_date_legacy until M5.3 verification; pilgrim services remain legacy_unverified until M5.6."
            ],
        },
    }

    for filename, payload in payloads.items():
        write_json(out_dir / filename, payload)

    print("=== M5.2 CONTENT BUILD ===")
    print(f"source snapshot: {source_hash}")
    for filename in payloads:
        print(f" - {filename}: {sha256_file(out_dir / filename)}")
    print(f"content={len(content)} authors={len(authors)} categories={len(categories)} bodies={len(bodies)} events={len(events)} calendar={len(calendar)} pilgrim={len(pilgrim)} links={len(links)}")
    print("RESULT: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
