#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import hashlib
import json
import re
import unicodedata

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
GEN = DATA / 'generated'
SCHEMA = DATA / 'schema'
SOURCES = DATA / 'pilgrim_sources'
MANIFEST = SOURCES / 'source_manifest.json'
SNAPSHOT = SCHEMA / 'pilgrim_source_snapshot.json'


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def canonical_hash(payload) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def stable_id(prefix: str, *parts: object) -> str:
    raw = '\x1f'.join(str(x) for x in parts).encode('utf-8')
    return prefix + hashlib.sha256(raw).hexdigest()[:20]


def normalize_text(value: object) -> str:
    text = unicodedata.normalize('NFKC', str(value or '')).casefold().replace('ё', 'е')
    text = re.sub(r'[^0-9a-zа-я]+', ' ', text, flags=re.I)
    return re.sub(r'\s+', ' ', text).strip()


def nullable(value: object):
    text = str(value or '').strip()
    return text or None


def slug_part(value: object) -> str:
    text = str(value or '').lower().strip()
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return text or 'record'


def verify_snapshot() -> tuple[dict, str]:
    snap = read_json(SNAPSHOT)
    problems: list[str] = []
    for item in snap.get('files', []):
        path = ROOT / item['path']
        if not path.is_file():
            problems.append(f"missing source {item['path']}")
            continue
        if path.stat().st_size != item['size']:
            problems.append(f"size mismatch {item['path']}")
        if sha256_file(path) != item['sha256']:
            problems.append(f"sha mismatch {item['path']}")
    if problems:
        raise SystemExit('pilgrim source snapshot mismatch:\n - ' + '\n - '.join(problems))
    return snap, canonical_hash(snap)


def schema_registry():
    names = [
        'content_item.schema.json',
        'pilgrim_source_manifest.schema.json',
        'amenity_type.schema.json',
        'amenity.schema.json',
        'pilgrim_service_record.schema.json',
        'pilgrim_relation.schema.json',
        'pilgrim_review_item.schema.json',
    ]
    registry = Registry()
    schemas = {}
    for name in names:
        payload = read_json(SCHEMA / name)
        schemas[name] = payload
        if payload.get('$id'):
            registry = registry.with_resource(payload['$id'], Resource.from_contents(payload))
        registry = registry.with_resource(name, Resource.from_contents(payload))
    return registry, schemas


def validate(payload, schema, registry, label: str) -> None:
    validator = Draft202012Validator(schema, registry=registry)
    issues = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
    if issues:
        lines = []
        for issue in issues[:30]:
            path = '.'.join(str(x) for x in issue.path) or '<root>'
            lines.append(f'{label}:{path}: {issue.message}')
        raise SystemExit('pilgrim schema validation failed:\n - ' + '\n - '.join(lines))


def source_record(provider: str, source_file: str, source_id: str, row: int, source_url=None) -> dict:
    return {
        'provider': provider,
        'source_id': source_id,
        'source_file': source_file,
        'source_row': row,
        'source_url': source_url,
        'migrated_from': None,
    }


def legacy_identity(row: dict) -> tuple[str, str]:
    identity = '|'.join([
        normalize_text(row.get('name')),
        normalize_text(row.get('org')),
        normalize_text(row.get('region')),
    ])
    source_id = 'legacy:' + hashlib.sha256(identity.encode('utf-8')).hexdigest()[:20]
    return identity, source_id


def list_rows(payload, key: str) -> list[dict]:
    if isinstance(payload, list):
        return payload
    rows = payload.get(key, []) if isinstance(payload, dict) else []
    return rows if isinstance(rows, list) else []


def build() -> None:
    _snapshot, source_hash = verify_snapshot()
    registry, schemas = schema_registry()
    manifest = read_json(MANIFEST)
    validate(manifest, schemas['pilgrim_source_manifest.schema.json'], registry, 'pilgrim_manifest')

    providers = {row['purpose']: row for row in manifest['providers']}
    taxonomy_cfg = providers.get('system_taxonomy')
    legacy_cfg = providers.get('review_input')
    verified_cfg = providers.get('canonical_records')
    if not taxonomy_cfg or not legacy_cfg or not verified_cfg:
        raise SystemExit('pilgrim manifest must declare system_taxonomy, review_input and canonical_records providers')

    taxonomy = read_json(ROOT / taxonomy_cfg['source_file'])
    if taxonomy.get('provider') != taxonomy_cfg['provider']:
        raise SystemExit('pilgrim taxonomy provider mismatch')

    amenity_types: list[dict] = []
    type_ids: set[str] = set()
    type_keys: set[str] = set()
    for row_num, src in enumerate(taxonomy.get('types', []), 1):
        key = str(src.get('key') or '').strip()
        tid = 'pm-amenity-type-' + key.replace('_', '-')
        if not key or tid in type_ids or key in type_keys:
            raise SystemExit(f'duplicate/empty amenity type key: {key!r}')
        type_ids.add(tid); type_keys.add(key)
        record = {
            'id': tid,
            'key': key,
            'label': str(src.get('label') or '').strip(),
            'category': str(src.get('category') or '').strip(),
            'description': str(src.get('description') or '').strip(),
            'sort_order': int(src.get('sort_order') or 0),
            'capabilities': sorted({str(x).strip() for x in (src.get('capabilities') or []) if str(x).strip()}),
            'trust_layer': 'canonical_system',
            'verification_status': 'system_defined',
            'source_records': [source_record(taxonomy_cfg['provider'], taxonomy_cfg['source_file'], str(src.get('source_id') or key), row_num)],
        }
        validate(record, schemas['amenity_type.schema.json'], registry, f'amenity_type:{key}')
        amenity_types.append(record)
    amenity_types.sort(key=lambda x: (x['sort_order'], x['key']))
    if len(amenity_types) != 12:
        raise SystemExit(f'expected 12 system amenity types, got {len(amenity_types)}')
    type_by_key = {x['key']: x['id'] for x in amenity_types}

    # Load existing canonical targets. Relations are allowed only when the source bundle
    # explicitly names a stable ID that already exists; no name/address matching is used.
    place_rows = list_rows(read_json(GEN / 'places_deduped.json'), 'places')
    route_rows = list_rows(read_json(GEN / 'routes.json'), 'routes')
    place_ids = {str(x.get('id') or '') for x in place_rows}
    route_ids = {str(x.get('id') or '') for x in route_rows}

    verified = read_json(ROOT / verified_cfg['source_file'])
    if verified.get('provider') != verified_cfg['provider']:
        raise SystemExit('pilgrim verified-record provider mismatch')
    if verified.get('trust_layer') != 'editorial' or verified.get('verification_status') != 'source_verified':
        raise SystemExit('M5.6.2 source bundle must remain editorial/source_verified')
    observed_at = str(verified.get('observed_at') or '').strip()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', observed_at):
        raise SystemExit('pilgrim verified source requires observed_at YYYY-MM-DD')

    amenities: list[dict] = []
    services: list[dict] = []
    relations: list[dict] = []
    promoted_legacy: dict[str, dict] = {}
    canonical_ids: set[str] = set()
    slug_ids: set[str] = set()

    for row_num, src in enumerate(verified.get('records', []), 1):
        sid = str(src.get('source_id') or '').strip()
        kind = str(src.get('kind') or '').strip()
        source_url = nullable(src.get('source_url'))
        place_ref = str(src.get('place_ref') or '').strip()
        relation_type = str(src.get('relation_type') or '').strip()
        if not sid or kind not in {'amenity', 'service'} or not source_url:
            raise SystemExit(f'verified pilgrim source row {row_num}: source_id/kind/source_url required')
        if place_ref not in place_ids:
            raise SystemExit(f'verified pilgrim source row {row_num}: dangling explicit place_ref {place_ref}')
        if relation_type not in {'located_at', 'serves_place', 'available_at'}:
            raise SystemExit(f'verified pilgrim source row {row_num}: unsupported relation_type {relation_type}')
        rec_src = [source_record(verified_cfg['provider'], verified_cfg['source_file'], sid, row_num, source_url)]
        freshness = {'observed_at':observed_at,'verified_at':observed_at,'valid_from':None,'valid_to':None,'expires_at':None}

        if kind == 'amenity':
            aid = stable_id('pm-amenity-', verified_cfg['provider'], sid)
            slug = 'amenity-' + slug_part(sid) + '-' + aid[-8:]
            type_key = str(src.get('amenity_type') or '').strip()
            if type_key not in type_by_key:
                raise SystemExit(f'verified pilgrim source row {row_num}: unknown amenity_type {type_key}')
            record = {
                'id': aid, 'slug': slug, 'name': str(src.get('name') or '').strip(),
                'amenity_type_ref': type_by_key[type_key], 'status': str(src.get('status') or 'unknown'),
                'aliases': list(src.get('aliases') or []), 'canonical_path': f'pilgrim/item.html?slug={slug}',
                'address': nullable(src.get('address')), 'coordinates': src.get('coordinates'),
                'opening_hours': src.get('opening_hours') or {'text':None,'timezone':None},
                'contacts': src.get('contacts') or {'phone':None,'email':None,'website':None},
                'accessibility': src.get('accessibility') or {'wheelchair':'unknown','step_free':'unknown','accessible_toilet':'unknown','notes':None},
                'family_suitability': str(src.get('family_suitability') or 'unknown'),
                'availability_note': nullable(src.get('availability_note')),
                'trust_layer': 'editorial', 'verification_status': 'source_verified', 'freshness': freshness,
                'source_records': rec_src,
            }
            validate(record, schemas['amenity.schema.json'], registry, f'amenity:{sid}')
            amenities.append(record); canonical_ids.add(aid); slug_ids.add(slug)
            from_ref = {'kind':'amenity','id':aid}
        else:
            service_id = stable_id('pm-service-', verified_cfg['provider'], sid)
            slug = 'service-' + slug_part(sid) + '-' + service_id[-8:]
            record = {
                'id': service_id, 'slug': slug, 'title': str(src.get('title') or '').strip(),
                'service_type': str(src.get('service_type') or 'other'), 'status': str(src.get('status') or 'unknown'),
                'aliases': list(src.get('aliases') or []), 'canonical_path': f'pilgrim/item.html?slug={slug}',
                'provider_name': nullable(src.get('provider_name')),
                'contacts': src.get('contacts') or {'phone':None,'email':None,'website':None},
                'availability': src.get('availability') or {'text':None,'timezone':None},
                'trust_layer': 'editorial', 'verification_status': 'source_verified', 'freshness': freshness,
                'source_records': rec_src,
            }
            validate(record, schemas['pilgrim_service_record.schema.json'], registry, f'pilgrim_service:{sid}')
            services.append(record); canonical_ids.add(service_id); slug_ids.add(slug)
            from_ref = {'kind':'service','id':service_id}

        rel = {
            'id': stable_id('pm-pilgrim-rel-', verified_cfg['provider'], sid, relation_type, place_ref),
            'relation_type': relation_type, 'from': from_ref, 'to': {'kind':'place','id':place_ref},
            'trust_layer': 'editorial', 'verification_status': 'source_verified', 'source_records': rec_src,
        }
        validate(rel, schemas['pilgrim_relation.schema.json'], registry, f'pilgrim_relation:{sid}')
        relations.append(rel)

        legacy_ref = nullable(src.get('legacy_ref'))
        if legacy_ref:
            if legacy_ref in promoted_legacy:
                raise SystemExit(f'duplicate legacy promotion ref: {legacy_ref}')
            promoted_legacy[legacy_ref] = {
                'place_ref': place_ref, 'source_url': source_url, 'canonical_kind': kind,
                'canonical_id': from_ref['id'], 'source_id': sid,
            }

    if len(canonical_ids) != len(amenities) + len(services) or len(slug_ids) != len(amenities) + len(services):
        raise SystemExit('duplicate canonical pilgrim id or slug')
    amenities.sort(key=lambda x: (x['name'].casefold(), x['id']))
    services.sort(key=lambda x: (x['title'].casefold(), x['id']))
    relations.sort(key=lambda x: x['id'])

    conflicts: list[dict] = []
    for row_num, src in enumerate(verified.get('conflicts', []), 1):
        values = src.get('values') or []
        if len(values) < 2 or str(src.get('resolution_status') or '') != 'unresolved':
            raise SystemExit(f'pilgrim conflict row {row_num}: unresolved conflict needs at least two evidence values')
        if any(not nullable(v.get('source_url')) or not nullable(v.get('value')) for v in values):
            raise SystemExit(f'pilgrim conflict row {row_num}: source_url and value are required')
        conflicts.append({
            'id': stable_id('pm-pilgrim-conflict-', verified_cfg['provider'], str(src.get('source_id') or row_num)),
            'source_id': str(src.get('source_id') or ''), 'candidate_name': str(src.get('candidate_name') or ''),
            'field': str(src.get('field') or ''), 'resolution_status': 'unresolved',
            'values': values, 'note': nullable(src.get('note')), 'observed_at': observed_at,
        })

    legacy_rows = read_json(ROOT / legacy_cfg['source_file'])
    if not isinstance(legacy_rows, list):
        raise SystemExit('legacy pilgrim source must be a list')
    review: list[dict] = []
    rejected: list[dict] = []
    seen_identity: set[str] = set()
    legacy_ids: set[str] = set()
    for row_num, row in enumerate(legacy_rows, 1):
        identity, source_id = legacy_identity(row)
        if not identity.strip('|'):
            rejected.append({'source_row': row_num, 'reason': 'empty_identity', 'raw_fields': row})
            continue
        if identity in seen_identity:
            rejected.append({'source_row': row_num, 'reason': 'duplicate_semantic_identity', 'raw_fields': row})
            continue
        seen_identity.add(identity)
        legacy_id = stable_id('pm-pilgrim-', legacy_cfg['provider'], source_id)
        legacy_ids.add(legacy_id)
        promotion = promoted_legacy.get(legacy_id)
        item = {
            'id': stable_id('pm-pilgrim-review-', legacy_cfg['provider'], source_id),
            'legacy_ref': legacy_id, 'candidate_kind': 'pilgrim_service_provider',
            'name': str(row.get('name') or '').strip(), 'region_text': nullable(row.get('region')),
            'organisation_text': nullable(row.get('org')),
            'contacts': {'phone':nullable(row.get('phone')),'email':nullable(row.get('email')),'website':nullable(row.get('website'))},
            'review_status': 'promoted' if promotion else 'needs_evidence',
            'candidate_refs': ([{'kind':'place','id':promotion['place_ref'],'basis':'explicit_evidence'}] if promotion else []),
            'evidence': ([{
                'provider': verified_cfg['provider'], 'source_id': promotion['source_id'],
                'source_url': promotion['source_url'], 'observed_at': observed_at,
                'canonical_kind': promotion['canonical_kind'], 'canonical_id': promotion['canonical_id'],
            }] if promotion else []),
            'raw_fields': dict(row),
            'source_records': [source_record(legacy_cfg['provider'], legacy_cfg['source_file'], source_id, row_num, nullable(row.get('website')))],
        }
        validate(item, schemas['pilgrim_review_item.schema.json'], registry, f'pilgrim_review:{row_num}')
        review.append(item)

    review.sort(key=lambda x: (str(x.get('region_text') or '').casefold(), x['name'].casefold(), x['id']))
    if set(promoted_legacy) - legacy_ids:
        raise SystemExit('verified source references unknown legacy_ref(s): ' + ', '.join(sorted(set(promoted_legacy) - legacy_ids)))

    # Preserve compatibility projection and verify that the legacy identity set did not change.
    legacy_projection = GEN / 'pilgrim_services.json'
    if legacy_projection.is_file():
        projected = read_json(legacy_projection).get('services', [])
        projected_ids = {str(x.get('id') or '') for x in projected}
        if projected_ids != legacy_ids:
            raise SystemExit('M5.6 legacy review refs diverge from PravmirContent compatibility IDs')
        if any(x.get('verification_status') != 'legacy_unverified' for x in projected):
            raise SystemExit('legacy pilgrim compatibility data must remain legacy_unverified')

    by_region: dict[str, list[str]] = {}
    for item in review:
        region = item.get('region_text') or 'Регион не указан'
        by_region.setdefault(region, []).append(item['id'])
    for ids in by_region.values():
        ids.sort()

    amenity_by_id = {x['id']: i for i, x in enumerate(amenities)}
    service_by_id = {x['id']: i for i, x in enumerate(services)}
    by_slug = {x['slug']: x['id'] for x in amenities + services}
    promoted_services = sum(1 for x in promoted_legacy.values() if x['canonical_kind'] == 'service')
    promoted_amenities = sum(1 for x in promoted_legacy.values() if x['canonical_kind'] == 'amenity')

    payloads = {
        'amenity_types.json': {'schema_version':'1.0.0','source_snapshot_sha256':source_hash,'count':len(amenity_types),'types':amenity_types},
        'amenity_records.json': {'schema_version':'1.0.0','source_snapshot_sha256':source_hash,'count':len(amenities),'amenities':amenities},
        'pilgrim_service_records.json': {'schema_version':'1.0.0','source_snapshot_sha256':source_hash,'count':len(services),'services':services},
        'pilgrim_relations.json': {'schema_version':'1.0.0','source_snapshot_sha256':source_hash,'count':len(relations),'relations':relations},
        'pilgrim_review_queue.json': {'schema_version':'1.0.0','source_snapshot_sha256':source_hash,'count':len(review),'items':review},
        'pilgrim_conflicts.json': {'schema_version':'1.0.0','source_snapshot_sha256':source_hash,'count':len(conflicts),'items':conflicts},
        'pilgrim_rejected.json': {'schema_version':'1.0.0','source_snapshot_sha256':source_hash,'count':len(rejected),'items':rejected},
        'pilgrim_index.json': {
            'schema_version':'1.0.0','source_snapshot_sha256':source_hash,
            'counts': {'amenity_types':len(amenity_types),'amenities':len(amenities),'services':len(services),'relations':len(relations),'review_queue':len(review),'conflicts':len(conflicts),'rejected':len(rejected)},
            'amenity_type_by_key': type_by_key, 'amenity_by_id': amenity_by_id, 'service_by_id': service_by_id,
            'by_slug': by_slug, 'review_by_region': dict(sorted(by_region.items(), key=lambda kv: kv[0].casefold())),
        },
        'pilgrim_report.json': {
            'schema_version':'1.0.0','source_snapshot_sha256':source_hash,
            'legacy_records_seen': len(legacy_rows), 'legacy_records_in_review_queue': len(review),
            'legacy_records_promoted_with_explicit_evidence': len(promoted_legacy),
            'canonical_amenities_created_from_legacy': promoted_amenities,
            'canonical_services_created_from_legacy': promoted_services,
            'source_verified_canonical_records': len(amenities) + len(services),
            'unresolved_evidence_conflicts': len(conflicts),
            'inferred_place_route_organisation_links_created': 0, 'organisation_entities_created': 0,
            'notes': [
                'M5.6.2 creates canonical amenity/service records only from explicit official-source evidence captured in the verified source bundle.',
                'Two legacy service rows are promoted only after official-source verification and explicit stable place refs; no text/name matching creates relations.',
                'The remaining legacy rows stay in the review queue. Place != Organisation remains enforced and no organisation entities/relations are created before M7.',
                'Conflicting official evidence is preserved separately; unresolved candidates are not canonicalized.',
                'Mutable infrastructure records carry observed_at/verified_at freshness fields.'
            ]
        }
    }
    for filename, payload in payloads.items():
        write_json(GEN / filename, payload)

    print('=== M5.6.2 PILGRIM EVIDENCE BUILD ===')
    print(f'source snapshot: {source_hash}')
    print(f'amenity_types={len(amenity_types)} amenities={len(amenities)} services={len(services)} relations={len(relations)} review={len(review)} promoted={len(promoted_legacy)} conflicts={len(conflicts)} rejected={len(rejected)}')
    print('RESULT: OK')


if __name__ == '__main__':
    build()
