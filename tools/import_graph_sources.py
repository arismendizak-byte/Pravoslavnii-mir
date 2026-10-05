#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
SCHEMA = DATA / 'schema'
GENERATED = DATA / 'generated'
SOURCE_SCHEMA = SCHEMA / 'verified_graph_source.schema.json'
SNAPSHOT = SCHEMA / 'graph_source_snapshot.json'
OUT = GENERATED / 'verified_graph_claims.json'
REPORT = GENERATED / 'verified_graph_source_report.json'


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def stable_claim_id(provider: str, source_id: str, relation: dict) -> str:
    raw = json.dumps(
        {'provider': provider, 'source_id': source_id, 'relation': relation},
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')
    return 'pm-gclaim-' + hashlib.sha256(raw).hexdigest()[:24]


def snapshot_hash(snapshot: dict) -> str:
    return hashlib.sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()


def validate_snapshot(snapshot: dict) -> list[dict]:
    errors: list[str] = []
    verified_rows: list[dict] = []
    for row in snapshot.get('sources', []):
        file_name = row.get('file')
        if not file_name:
            errors.append('graph snapshot source without file')
            continue
        path = ROOT / file_name
        if not path.is_file():
            errors.append(f'missing graph source {file_name}')
            continue
        if sha256(path) != row.get('sha256') or path.stat().st_size != row.get('size'):
            errors.append(f'graph source snapshot mismatch: {file_name}')
        if row.get('kind') == 'verified_graph_claims':
            verified_rows.append(row)
    if errors:
        raise ValueError('\n'.join(errors))
    return verified_rows


def validate_endpoint_shape(relation: dict, label: str) -> None:
    from_ref = relation['from']
    to_ref = relation['to']
    kinds = (from_ref['kind'], to_ref['kind'])
    rel_type = relation['relation_type']
    if rel_type in {'located_at', 'relics_at'}:
        if kinds != ('entity', 'place'):
            raise ValueError(f'{label}: {rel_type} must be entity -> place, got {kinds}')
    elif rel_type == 'relic_of':
        if kinds != ('entity', 'entity'):
            raise ValueError(f'{label}: relic_of must be entity -> entity, got {kinds}')


def build_payloads() -> tuple[dict, dict]:
    if not SNAPSHOT.is_file():
        raise ValueError('missing data/schema/graph_source_snapshot.json')
    snapshot = read_json(SNAPSHOT)
    verified_rows = validate_snapshot(snapshot)
    if not verified_rows:
        raise ValueError('graph source snapshot has no verified_graph_claims sources')

    schema = read_json(SOURCE_SCHEMA)
    validator = Draft202012Validator(schema)
    normalized: list[dict] = []
    seen_source_keys: set[tuple[str, str]] = set()
    seen_claim_ids: set[str] = set()
    providers = Counter()
    authorities = Counter()

    for source_row in sorted(verified_rows, key=lambda row: row['file']):
        source_file = source_row['file']
        payload = read_json(ROOT / source_file)
        issues = sorted(validator.iter_errors(payload), key=lambda issue: list(issue.path))
        if issues:
            messages = [f'{source_file}: {"/".join(map(str, issue.path)) or "root"}: {issue.message}' for issue in issues]
            raise ValueError('\n'.join(messages))
        checked_at = payload['checked_at']
        for claim in payload['claims']:
            key = (claim['provider'], claim['source_id'])
            if key in seen_source_keys:
                raise ValueError(f'duplicate verified source key: {key[0]} / {key[1]}')
            seen_source_keys.add(key)
            validate_endpoint_shape(claim['relation'], f'{key[0]}/{key[1]}')
            claim_id = stable_claim_id(claim['provider'], claim['source_id'], claim['relation'])
            if claim_id in seen_claim_ids:
                raise ValueError(f'duplicate verified claim id: {claim_id}')
            seen_claim_ids.add(claim_id)
            providers[claim['provider']] += 1
            authorities[claim['authority']] += 1
            normalized.append({
                'claim_id': claim_id,
                'provider': claim['provider'],
                'source_id': claim['source_id'],
                'source_file': source_file,
                'source_url': claim['source_url'],
                'source_title': claim['source_title'],
                'authority': claim['authority'],
                'checked_at': checked_at,
                'evidence_note': claim['evidence_note'].strip(),
                'relation': claim['relation'],
            })

    normalized.sort(key=lambda row: row['claim_id'])
    snap_hash = snapshot_hash(snapshot)
    payload = {
        'schema_version': '1.0.0',
        'source_snapshot_sha256': snap_hash,
        'claims': normalized,
    }
    report = {
        'schema_version': '1.0.0',
        'source_snapshot_sha256': snap_hash,
        'source_files': [row['file'] for row in sorted(verified_rows, key=lambda row: row['file'])],
        'claims': len(normalized),
        'providers': dict(sorted(providers.items())),
        'authorities': dict(sorted(authorities.items())),
    }
    return payload, report


def main() -> int:
    try:
        payload, report = build_payloads()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
    write_json(OUT, payload)
    write_json(REPORT, report)
    print(f"verified_graph_claims={report['claims']} providers={len(report['providers'])} source_files={len(report['source_files'])}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
