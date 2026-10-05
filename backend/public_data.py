from __future__ import annotations

import json
from pathlib import Path


class PublicDataAdapter:
    """Read-only adapter over canonical generated snapshots; never writes source data."""

    SOURCES = {
        "place": ("places_deduped.json", None),
        "content": ("content_items.json", "items"),
        "route": ("routes.json", "routes"),
        "work": ("library_works.json", "works"),
        "author": ("library_authors.json", "authors"),
        "news": ("news_records.json", "news"),
        "event": ("event_records.json", "events"),
        "saint": ("saints.json", "saints"),
        "feast": ("feasts.json", "feasts"),
        "amenity": ("amenity_records.json", "amenities"),
        "service": ("pilgrim_service_records.json", "services"),
    }

    def __init__(self, project_root: str | Path):
        self.root = Path(project_root)
        self.generated = self.root / "data" / "generated"
        self._cache: dict[str, tuple[int, dict[str, dict]]] = {}

    def _load(self, kind: str) -> dict[str, dict]:
        if kind not in self.SOURCES:
            raise KeyError(kind)
        filename, key = self.SOURCES[kind]
        path = self.generated / filename
        stamp = path.stat().st_mtime_ns
        cached = self._cache.get(kind)
        if cached and cached[0] == stamp:
            return cached[1]
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        rows = payload if key is None else payload.get(key, [])
        if not isinstance(rows, list):
            rows = []
        index = {str(row.get("id")): row for row in rows if isinstance(row, dict) and row.get("id")}
        self._cache[kind] = (stamp, index)
        return index

    def resolve(self, kind: str, stable_id: str) -> dict | None:
        return self._load(str(kind)).get(str(stable_id))

    def list(self, kind: str, *, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        index = self._load(str(kind))
        rows = list(index.values())
        total = len(rows)
        start = max(0, int(offset))
        end = start + min(200, max(1, int(limit)))
        return rows[start:end], total

    def summary(self) -> dict:
        return {kind: len(self._load(kind)) for kind in self.SOURCES}
