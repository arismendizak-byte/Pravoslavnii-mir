#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
GENERATED = DATA / 'generated'
SCHEMA = DATA / 'schema'

PROVIDER_HOLINESS = 'pravmir-legacy-holiness'
PROVIDER_ROUTES = 'pravmir-legacy-routes'


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


def stable_id(prefix: str, *parts: object) -> str:
    raw = '|'.join(str(x) for x in parts).encode('utf-8')
    return f'{prefix}{hashlib.sha256(raw).hexdigest()[:24]}'


def normalize_path(value: str | None) -> str | None:
    if not value:
        return None
    value = str(value).strip().replace('\\', '/')
    while value.startswith('../'):
        value = value[3:]
    return value.lstrip('/') or None


def normalize_text(value: object) -> str:
    text = str(value or '').casefold().replace('ё', 'е')
    return ' '.join(re.findall(r'[\w]+', text, flags=re.UNICODE))


def meaningful_tokens(value: object) -> set[str]:
    stop = {'храм', 'собор', 'монастырь', 'церковь', 'свято', 'святой', 'святая', 'санкт', 'петербург', 'москва'}
    return {x for x in normalize_text(value).split() if len(x) >= 5 and x not in stop}


def verify_snapshot() -> dict:
    snapshot_path = SCHEMA / 'graph_source_snapshot.json'
    if not snapshot_path.exists():
        raise SystemExit('missing data/schema/graph_source_snapshot.json')
    snapshot = read_json(snapshot_path)
    errors = []
    for row in snapshot.get('sources', []):
        path = ROOT / row['file']
        if not path.exists():
            errors.append(f"missing graph source {row['file']}")
            continue
        actual_sha = sha256(path)
        actual_size = path.stat().st_size
        if actual_sha != row.get('sha256') or actual_size != row.get('size'):
            errors.append(f"graph source snapshot mismatch: {row['file']}")
    if errors:
        raise SystemExit('\n'.join(errors))
    return snapshot


def main() -> int:
    snapshot = verify_snapshot()
    snapshot_hash = hashlib.sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
    verified_claims_path = GENERATED / 'verified_graph_claims.json'
    if not verified_claims_path.exists():
        raise SystemExit('missing data/generated/verified_graph_claims.json; run tools/import_graph_sources.py')
    verified_payload = read_json(verified_claims_path)
    if verified_payload.get('source_snapshot_sha256') != snapshot_hash:
        raise SystemExit('verified graph claims are stale; run tools/import_graph_sources.py')
    verified_claims = verified_payload.get('claims', [])
    holiness = read_json(DATA / 'holiness.json')
    routes_source = read_json(DATA / 'routes.json')
    canonical_places = read_json(GENERATED / 'places_deduped.json')
    canonical_ids = {row['id'] for row in canonical_places}
    catalog = read_json(DATA / 'catalog.json')

    curated_by_path = {}
    for row in catalog:
        path = normalize_path(row.get('link'))
        if path:
            curated_by_path[path] = row

    # Explicit route stop bindings are the currently auditable bridge from curated pages to canonical places.
    detail_to_place = {}
    for route in routes_source.get('routes', []):
        for stop in route.get('stops', []):
            path = normalize_path(stop.get('detail_path'))
            place_id = stop.get('place_id')
            if place_id:
                if place_id not in canonical_ids:
                    raise SystemExit(f'route stop references missing canonical place: {place_id}')
                if path:
                    existing = detail_to_place.get(path)
                    if existing and existing != place_id:
                        raise SystemExit(f'conflicting detail_path binding: {path}')
                    detail_to_place[path] = place_id

    entities = []
    entity_by_legacy_id = {}
    entity_by_name = {}
    unresolved = []
    conflicts = []

    for row in holiness:
        source_id = str(row.get('id'))
        entity_type = str(row.get('type') or '').strip()
        entity_id = stable_id('pm-ent-', PROVIDER_HOLINESS, source_id)
        detail_path = normalize_path(row.get('link'))
        location_text = row.get('relics') if entity_type == 'saint' else row.get('location')
        flags = []

        if detail_path:
            curated = curated_by_path.get(detail_path)
            if curated and location_text:
                expected = meaningful_tokens(curated.get('name'))
                actual = meaningful_tokens(location_text)
                if expected and not (expected & actual) and detail_path not in detail_to_place:
                    flags.append('legacy_location_link_conflict')
                    conflicts.append({'source_id': source_id, 'entity': row.get('name'), 'detail_path': detail_path, 'location_text': location_text})
                elif detail_path not in detail_to_place:
                    flags.append('location_unresolved_to_canonical_place')
                    unresolved.append({'source_id': source_id, 'entity': row.get('name'), 'detail_path': detail_path, 'location_text': location_text})
            elif detail_path not in detail_to_place:
                flags.append('location_unresolved_to_canonical_place')
                unresolved.append({'source_id': source_id, 'entity': row.get('name'), 'detail_path': detail_path, 'location_text': location_text})

        entity = {
            'id': entity_id,
            'entity_type': entity_type,
            'name': str(row.get('name') or '').strip(),
            'title': row.get('title') or None,
            'description': row.get('description') or None,
            'feast_day': row.get('feast_day') or None,
            'saint_name': row.get('saint') or None,
            'location_text': location_text or None,
            'emoji': row.get('emoji') or None,
            'detail_path': detail_path,
            'verification_status': 'legacy_unverified',
            'quality_flags': sorted(set(flags)),
            'source_records': [{
                'provider': PROVIDER_HOLINESS,
                'source_id': source_id,
                'source_file': 'data/holiness.json'
            }]
        }
        entities.append(entity)
        entity_by_legacy_id[source_id] = entity
        entity_by_name[normalize_text(entity['name'])] = entity

    relations = []

    def add_relation(relation_type: str, from_kind: str, from_id: str, to_kind: str, to_id: str, source_id: str, evidence_field: str) -> None:
        rel_id = stable_id('pm-rel-', relation_type, from_kind, from_id, to_kind, to_id, PROVIDER_HOLINESS, source_id)
        source_record = {
            'provider': PROVIDER_HOLINESS,
            'source_id': source_id,
            'source_file': 'data/holiness.json',
            'evidence_field': evidence_field
        }
        relations.append({
            'id': rel_id,
            'relation_type': relation_type,
            'from': {'kind': from_kind, 'id': from_id},
            'to': {'kind': to_kind, 'id': to_id},
            'verification_status': 'legacy_unverified',
            'provenance': dict(source_record),
            'source_records': [source_record]
        })

    for row in holiness:
        source_id = str(row.get('id'))
        entity = entity_by_legacy_id[source_id]
        detail_path = normalize_path(row.get('link'))
        place_id = detail_to_place.get(detail_path) if detail_path else None
        if place_id and 'legacy_location_link_conflict' not in entity['quality_flags']:
            relation_type = 'relics_at' if entity['entity_type'] == 'saint' else 'located_at'
            evidence = 'relics' if entity['entity_type'] == 'saint' else 'location'
            add_relation(relation_type, 'entity', entity['id'], 'place', place_id, source_id, evidence)

        if entity['entity_type'] == 'relic' and row.get('saint'):
            saint = entity_by_name.get(normalize_text(row.get('saint')))
            if saint:
                add_relation('relic_of', 'entity', entity['id'], 'entity', saint['id'], source_id, 'saint')
            else:
                entity['quality_flags'] = sorted(set(entity['quality_flags'] + ['saint_reference_unresolved']))

    # M4.5: merge normalized claims from independently snapshotted verified sources.
    # Existing logical relations keep their stable IDs; verified evidence upgrades
    # their status without losing legacy provenance. New logical relations receive
    # provider-independent stable IDs based on canonical endpoints.
    entity_ids = {entity['id'] for entity in entities}

    def relation_key(relation_type: str, from_ref: dict, to_ref: dict) -> tuple[str, str, str, str, str]:
        return (relation_type, from_ref['kind'], from_ref['id'], to_ref['kind'], to_ref['id'])

    relation_by_key = {relation_key(rel['relation_type'], rel['from'], rel['to']): rel for rel in relations}

    for claim in verified_claims:
        spec = claim.get('relation') or {}
        relation_type = spec.get('relation_type')
        from_ref = spec.get('from') or {}
        to_ref = spec.get('to') or {}
        for ref in (from_ref, to_ref):
            kind = ref.get('kind')
            ref_id = ref.get('id')
            if kind == 'entity' and ref_id not in entity_ids:
                raise SystemExit(f'verified claim {claim.get("claim_id")}: dangling entity {ref_id}')
            if kind == 'place' and ref_id not in canonical_ids:
                raise SystemExit(f'verified claim {claim.get("claim_id")}: dangling place {ref_id}')
        key = relation_key(relation_type, from_ref, to_ref)
        source_record = {
            'provider': claim['provider'],
            'source_id': claim['source_id'],
            'source_file': claim['source_file'],
            'source_url': claim.get('source_url'),
            'source_title': claim.get('source_title'),
            'authority': claim.get('authority'),
            'checked_at': claim.get('checked_at'),
            'evidence_note': claim.get('evidence_note'),
            'claim_id': claim.get('claim_id')
        }
        relation = relation_by_key.get(key)
        if relation is None:
            relation = {
                'id': stable_id('pm-rel-', 'canonical-graph-relation', *key),
                'relation_type': relation_type,
                'from': dict(from_ref),
                'to': dict(to_ref),
                'verification_status': 'source_verified',
                'provenance': dict(source_record),
                'source_records': [source_record]
            }
            relations.append(relation)
            relation_by_key[key] = relation
        else:
            records = list(relation.get('source_records') or [relation.get('provenance') or {}])
            identity = {(row.get('provider'), row.get('source_id'), row.get('source_file')) for row in records}
            source_identity = (source_record['provider'], source_record['source_id'], source_record['source_file'])
            if source_identity not in identity:
                records.append(source_record)
            relation['source_records'] = sorted(
                records, key=lambda row: (row.get('provider', ''), row.get('source_id', ''), row.get('source_file', ''))
            )
            relation['verification_status'] = 'source_verified'
            relation['provenance'] = dict(source_record)

    routes = []
    for row in routes_source.get('routes', []):
        source_id = str(row['source_id'])
        route_id = stable_id('pm-route-', PROVIDER_ROUTES, source_id)
        try:
            from import_places import slugify
            slug = slugify(row['title'])
        except Exception:
            slug = re.sub(r'[^a-z0-9]+', '-', normalize_text(row['title'])).strip('-') or route_id
        quality_flags = []
        stops = []
        waypoints = []
        for stop in sorted(row.get('stops', []), key=lambda x: x.get('order', 0)):
            place_id = stop.get('place_id')
            flags = sorted(set(stop.get('quality_flags') or []))
            if place_id and place_id not in canonical_ids:
                raise SystemExit(f'route {source_id}: dangling place_id {place_id}')
            if place_id:
                # Canonical route stops are references only. Name/address/coordinates
                # are hydrated from the canonical place Data Core at runtime.
                stops.append({
                    'order': int(stop['order']),
                    'place_id': place_id,
                    'quality_flags': flags
                })
            else:
                # Preserve legacy city/curated points without pretending that they
                # are canonical places. They remain ordered route waypoints.
                quality_flags.append('contains_legacy_waypoint')
                waypoints.append({
                    'order': int(stop['order']),
                    'label': str(stop['label']),
                    'place_id': None,
                    'detail_path': normalize_path(stop.get('detail_path')),
                    'lat': stop.get('lat'),
                    'lon': stop.get('lon'),
                    'quality_flags': sorted(set(flags + ['legacy_noncanonical_waypoint']))
                })
        routes.append({
            'id': route_id,
            'slug': slug,
            'title': row['title'],
            'location': row.get('location') or None,
            'duration': row.get('duration') or None,
            'distance': row.get('distance') or None,
            'price': row.get('price') or None,
            'description': row.get('description') or None,
            'badge': row.get('badge') or None,
            'image': row.get('image') or None,
            'verification_status': routes_source.get('verification_status', 'legacy_unverified'),
            'quality_flags': sorted(set(quality_flags)),
            'stops': stops,
            'waypoints': waypoints,
            'source_records': [{
                'provider': PROVIDER_ROUTES,
                'source_id': source_id,
                'source_file': 'data/routes.json'
            }]
        })

    entities.sort(key=lambda x: x['id'])
    relations.sort(key=lambda x: x['id'])
    routes.sort(key=lambda x: x['id'])

    relations_by_entity = defaultdict(list)
    relations_by_place = defaultdict(list)
    entity_places = defaultdict(set)
    place_entities = defaultdict(set)
    for rel in relations:
        for endpoint in ('from', 'to'):
            ref = rel[endpoint]
            if ref['kind'] == 'entity':
                relations_by_entity[ref['id']].append(rel['id'])
            else:
                relations_by_place[ref['id']].append(rel['id'])
        if rel['from']['kind'] == 'entity' and rel['to']['kind'] == 'place':
            entity_places[rel['from']['id']].add(rel['to']['id'])
            place_entities[rel['to']['id']].add(rel['from']['id'])
        if rel['to']['kind'] == 'entity' and rel['from']['kind'] == 'place':
            entity_places[rel['to']['id']].add(rel['from']['id'])
            place_entities[rel['from']['id']].add(rel['to']['id'])

    routes_by_place = defaultdict(list)
    for route in routes:
        for stop in route['stops']:
            if stop['place_id']:
                routes_by_place[stop['place_id']].append(route['id'])

    routes_by_entity = {}
    for entity in entities:
        route_ids = set()
        for place_id in entity_places.get(entity['id'], set()):
            route_ids.update(routes_by_place.get(place_id, []))
        routes_by_entity[entity['id']] = sorted(route_ids)

    # M4.4: generic, deterministic adjacency for indexed graph traversal.
    # Only canonical graph relations and canonical route stops become edges.
    # Legacy waypoints intentionally stay outside this index until they have a
    # verified canonical place binding.
    adjacency = defaultdict(list)

    def node_key(kind: str, ref_id: str) -> str:
        return f'{kind}:{ref_id}'

    def add_arc(source_kind: str, source_id: str, target_kind: str, target_id: str, payload: dict) -> None:
        adjacency[node_key(source_kind, source_id)].append({
            'to': node_key(target_kind, target_id),
            **payload
        })

    for rel in relations:
        left = rel['from']
        right = rel['to']
        edge = {
            'edge_type': 'relation',
            'relation_id': rel['id'],
            'relation_type': rel['relation_type'],
            'verification_status': rel.get('verification_status', 'legacy_unverified')
        }
        add_arc(left['kind'], left['id'], right['kind'], right['id'], edge)
        add_arc(right['kind'], right['id'], left['kind'], left['id'], edge)

    for route in routes:
        for stop in route['stops']:
            edge = {
                'edge_type': 'route_stop',
                'route_id': route['id'],
                'order': int(stop['order']),
                'verification_status': route.get('verification_status', 'legacy_unverified')
            }
            add_arc('route', route['id'], 'place', stop['place_id'], edge)
            add_arc('place', stop['place_id'], 'route', route['id'], edge)

    adjacency_sorted = {}
    for key, edges in sorted(adjacency.items()):
        adjacency_sorted[key] = sorted(
            edges,
            key=lambda edge: (
                edge['to'], edge['edge_type'], edge.get('relation_id', ''),
                edge.get('route_id', ''), int(edge.get('order', 0))
            )
        )

    entity_payload = {'schema_version': '1.0.0', 'source_snapshot_sha256': snapshot_hash, 'entities': entities}
    relation_payload = {'schema_version': '1.1.0', 'source_snapshot_sha256': snapshot_hash, 'relations': relations}
    route_payload = {'schema_version': '1.1.0', 'source_snapshot_sha256': snapshot_hash, 'routes': routes}
    graph_index = {
        'schema_version': '1.3.0',
        'source_snapshot_sha256': snapshot_hash,
        'entity_ids': [x['id'] for x in entities],
        'route_ids': [x['id'] for x in routes],
        'relations_by_entity': {k: sorted(v) for k, v in sorted(relations_by_entity.items())},
        'relations_by_place': {k: sorted(v) for k, v in sorted(relations_by_place.items())},
        'places_by_entity': {k: sorted(v) for k, v in sorted(entity_places.items())},
        'entities_by_place': {k: sorted(v) for k, v in sorted(place_entities.items())},
        'routes_by_place': {k: sorted(set(v)) for k, v in sorted(routes_by_place.items())},
        'routes_by_entity': {k: v for k, v in sorted(routes_by_entity.items())},
        'source_verified_relation_ids': sorted(rel['id'] for rel in relations if rel.get('verification_status') == 'source_verified'),
        'adjacency': adjacency_sorted
    }
    report = {
        'schema_version': '1.4.0',
        'entities': len(entities),
        'relations': len(relations),
        'routes': len(routes),
        'canonical_route_stops': sum(len(r['stops']) for r in routes),
        'legacy_route_waypoints': sum(len(r.get('waypoints', [])) for r in routes),
        'noncanonical_route_stops': 0,
        'canonical_place_entity_links': sum(len(v) for v in entity_places.values()),
        'traversal_nodes': len(adjacency_sorted),
        'traversal_edges': len(relations) + sum(len(route['stops']) for route in routes),
        'traversal_arcs': sum(len(edges) for edges in adjacency_sorted.values()),
        'relation_verification': {
            'source_verified': sum(1 for rel in relations if rel.get('verification_status') == 'source_verified'),
            'legacy_unverified': sum(1 for rel in relations if rel.get('verification_status') == 'legacy_unverified')
        },
        'verified_source_claims': len(verified_claims),
        'verified_source_files': sorted(set(claim.get('source_file') for claim in verified_claims if claim.get('source_file'))),
        'legacy_location_link_conflicts': conflicts,
        'unresolved_canonical_locations': unresolved
    }

    write_json(GENERATED / 'entities.json', entity_payload)
    write_json(GENERATED / 'relations.json', relation_payload)
    write_json(GENERATED / 'routes.json', route_payload)
    write_json(GENERATED / 'graph_index.json', graph_index)
    write_json(GENERATED / 'graph_report.json', report)

    print(f"entities={len(entities)} relations={len(relations)} routes={len(routes)} canonical_stops={report['canonical_route_stops']} legacy_waypoints={report['legacy_route_waypoints']} noncanonical_stops={report['noncanonical_route_stops']}")
    print(f"conflicts={len(conflicts)} unresolved={len(unresolved)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
