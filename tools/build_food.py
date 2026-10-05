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
SOURCES = DATA / 'food_sources'
MANIFEST = SOURCES / 'source_manifest.json'
SNAPSHOT = SCHEMA / 'food_source_snapshot.json'
DISCLAIMER = (
    'Подборка носит редакционный кулинарный характер и не является указанием меры поста. '
    'Конкретные ограничения зависят от дня, традиции, благословения и личных обстоятельств.'
)


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


def slugify(value: object) -> str:
    text = unicodedata.normalize('NFKC', str(value or '')).casefold().replace('ё', 'е')
    text = re.sub(r'[^0-9a-z]+', '-', text)
    text = re.sub(r'-+', '-', text).strip('-')
    return text


def verify_snapshot() -> str:
    snap = read_json(SNAPSHOT)
    problems = []
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
        raise SystemExit('food source snapshot mismatch:\n - ' + '\n - '.join(problems))
    return canonical_hash(snap)


def schema_registry():
    names = [
        'content_item.schema.json',
        'food_source_manifest.schema.json',
        'food_source_bundle.schema.json',
        'recipe.schema.json',
        'food_relation.schema.json',
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
        raise SystemExit('food schema validation failed:\n - ' + '\n - '.join(lines))


def source_record(provider: str, source_file: str, source_id: str, row: int) -> dict:
    return {
        'provider': provider,
        'source_id': source_id,
        'source_file': source_file,
        'source_row': row,
        'source_url': None,
        'migrated_from': None,
    }


def build() -> None:
    source_hash = verify_snapshot()
    registry, schemas = schema_registry()
    manifest = read_json(MANIFEST)
    validate(manifest, schemas['food_source_manifest.schema.json'], registry, 'food_manifest')

    fasting_obj = read_json(GEN / 'fasting_rules.json')
    fasting_rules = fasting_obj.get('rules', [])
    fasting_ids = {x['id'] for x in fasting_rules}
    feast_obj = read_json(GEN / 'feasts.json')
    feast_ids = {x['id'] for x in feast_obj.get('feasts', [])}

    recipes: list[dict] = []
    relations: list[dict] = []
    ids: set[str] = set()
    slugs: set[str] = set()
    providers: list[str] = []

    for provider_cfg in manifest['providers']:
        provider = provider_cfg['provider']
        providers.append(provider)
        source_file = provider_cfg['source_file']
        bundle = read_json(ROOT / source_file)
        validate(bundle, schemas['food_source_bundle.schema.json'], registry, source_file)
        if bundle.get('provider') != provider:
            raise SystemExit(f'provider mismatch: {source_file}')
        for row_num, src in enumerate(bundle.get('recipes', []), 1):
            sid = src['source_id']
            rid = stable_id('pm-recipe-', provider, sid)
            slug = 'recipe-' + (slugify(sid) or hashlib.sha256(sid.encode()).hexdigest()[:12])
            if rid in ids or slug in slugs:
                raise SystemExit(f'duplicate recipe identity: {sid}')
            ids.add(rid); slugs.add(slug)
            record = source_record(provider, source_file, sid, row_num)
            recipe = {
                'id': rid,
                'slug': slug,
                'title': src['title'],
                'summary': src['summary'],
                'recipe_type': src['recipe_type'],
                'servings': src['servings'],
                'prep_minutes': src['prep_minutes'],
                'cook_minutes': src['cook_minutes'],
                'ingredients': src['ingredients'],
                'steps': src['steps'],
                'tags': sorted(src.get('tags', []), key=lambda x: x.casefold()),
                'dietary_profile': src['dietary_profile'],
                'fasting_compatibility': {
                    **src['fasting_compatibility'],
                    'disclaimer': DISCLAIMER,
                },
                'canonical_path': f'food/recipe.html?slug={slug}',
                'trust_layer': provider_cfg['trust_layer'],
                'verification_status': provider_cfg['verification_status'],
                'source_records': [record],
            }
            validate(recipe, schemas['recipe.schema.json'], registry, f'recipe:{sid}')
            recipes.append(recipe)

            if recipe['fasting_compatibility']['classification'] == 'general_fast_friendly':
                for fast in fasting_rules:
                    relation = {
                        'id': stable_id('pm-foodrel-', rid, 'editorial_suggestion_for_fast_period', fast['id']),
                        'relation_type': 'editorial_suggestion_for_fast_period',
                        'relation_class': 'editorial_guidance',
                        'from': {'kind': 'recipe', 'id': rid},
                        'to': {'kind': 'fasting_rule', 'id': fast['id']},
                        'verification_status': 'editorial_guidance',
                        'note': 'Рецепт подходит по общему составу; связь не является каноническим предписанием меры поста.',
                        'source_records': [record],
                    }
                    validate(relation, schemas['food_relation.schema.json'], registry, f'food_relation:{sid}:{fast["id"]}')
                    relations.append(relation)


            for feast_id in src.get('feast_refs', []):
                if feast_id not in feast_ids:
                    raise SystemExit(f'unknown feast_ref {feast_id} in {sid}')
                relation = {
                    'id': stable_id('pm-foodrel-', rid, 'related_to_feast', feast_id),
                    'relation_type': 'related_to_feast',
                    'relation_class': 'editorial_guidance',
                    'from': {'kind': 'recipe', 'id': rid},
                    'to': {'kind': 'feast', 'id': feast_id},
                    'verification_status': 'editorial_guidance',
                    'note': 'Редакционная праздничная подборка; связь не является литургическим или дисциплинарным предписанием.',
                    'source_records': [record],
                }
                validate(relation, schemas['food_relation.schema.json'], registry, f'food_relation:{sid}:{feast_id}')
                relations.append(relation)

    recipes.sort(key=lambda x: (x['title'].casefold(), x['id']))
    relations.sort(key=lambda x: x['id'])

    by_id = {x['id']: {'slug': x['slug'], 'title': x['title']} for x in recipes}
    by_slug = {x['slug']: x['id'] for x in recipes}
    by_type: dict[str, list[str]] = {}
    by_tag: dict[str, list[str]] = {}
    by_fasting_rule: dict[str, list[str]] = {fid: [] for fid in sorted(fasting_ids)}
    by_feast: dict[str, list[str]] = {fid: [] for fid in sorted(feast_ids)}
    for x in recipes:
        by_type.setdefault(x['recipe_type'], []).append(x['id'])
        for tag in x['tags']:
            by_tag.setdefault(tag, []).append(x['id'])
    for rel in relations:
        if rel['to']['kind'] == 'fasting_rule':
            by_fasting_rule.setdefault(rel['to']['id'], []).append(rel['from']['id'])
        elif rel['to']['kind'] == 'feast':
            by_feast.setdefault(rel['to']['id'], []).append(rel['from']['id'])

    outputs = {
        'recipe_records.json': {'schema_version': '1.0.0', 'source_snapshot_sha256': source_hash, 'count': len(recipes), 'recipes': recipes},
        'food_relations.json': {'schema_version': '1.0.0', 'source_snapshot_sha256': source_hash, 'count': len(relations), 'relations': relations},
        'food_index.json': {
            'schema_version': '1.0.0', 'source_snapshot_sha256': source_hash,
            'counts': {'recipes': len(recipes), 'relations': len(relations), 'fasting_rules_linked': len([k for k,v in by_fasting_rule.items() if v]), 'feasts_linked': len([k for k,v in by_feast.items() if v])},
            'by_id': by_id, 'by_slug': by_slug,
            'by_type': {k: sorted(v) for k,v in sorted(by_type.items())},
            'by_tag': {k: sorted(v) for k,v in sorted(by_tag.items())},
            'by_fasting_rule': {k: sorted(v) for k,v in sorted(by_fasting_rule.items())},
            'by_feast': {k: sorted(v) for k,v in sorted(by_feast.items())},
        },
        'food_report.json': {
            'schema_version': '1.0.0', 'source_snapshot_sha256': source_hash,
            'providers': providers,
            'recipes': len(recipes), 'relations': len(relations),
            'fasting_guidance_relations': len([x for x in relations if x['to']['kind'] == 'fasting_rule']),
            'feast_guidance_relations': len([x for x in relations if x['to']['kind'] == 'feast']),
            'editorial_guidance_relations': len(relations),
            'canonical_liturgical_prescriptions_created': 0,
            'disclaimer': DISCLAIMER,
        },
    }
    for name, payload in outputs.items():
        write_json(GEN / name, payload)
    print(f"food build: recipes={len(recipes)} relations={len(relations)} fasting_rules={len(fasting_rules)}")


if __name__ == '__main__':
    build()
