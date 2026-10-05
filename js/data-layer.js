(function (global) {
    'use strict';

    const TYPE_LABELS = Object.freeze({
        church: 'Храм',
        cathedral: 'Собор',
        chapel: 'Часовня',
        monastery: 'Монастырь',
        skete: 'Скит',
        metochion: 'Подворье',
        bell_tower: 'Колокольня',
        holy_spring: 'Святой источник',
        memorial: 'Памятный объект',
        other: 'Объект',
        unknown: 'Объект'
    });

    const STATUS_LABELS = Object.freeze({
        active: 'Действующий',
        preserved: 'Сохранившийся',
        inactive: 'Недействующий',
        ruined: 'Руинированный',
        lost: 'Утраченный',
        under_construction: 'Строится',
        restoring: 'Восстанавливается',
        unknown: 'Статус не указан'
    });

    const CATEGORY_TYPES = Object.freeze({
        'храм': 'church',
        'церковь': 'church',
        'собор': 'cathedral',
        'часовня': 'chapel',
        'монастырь': 'monastery',
        'скит': 'skete',
        'подворье': 'metochion',
        'колокольня': 'bell_tower',
        'святой источник': 'holy_spring'
    });

    const STOPWORDS = new Set([
        'в', 'во', 'на', 'с', 'со', 'и', 'к', 'ко', 'у', 'по', 'при', 'из', 'за', 'для', 'от', 'до',
        'рф', 'россия', 'обл', 'область', 'район', 'ул', 'улица', 'дом', 'город', 'село', 'пос', 'поселок',
        'посёлок', 'дер', 'деревня'
    ]);

    const scriptUrl = (function () {
        if (global.__PRAVMIR_DATA_LAYER_URL__) return new URL(global.__PRAVMIR_DATA_LAYER_URL__, global.location && global.location.href ? global.location.href : undefined);
        if (global.document && global.document.currentScript && global.document.currentScript.src) return new URL(global.document.currentScript.src);
        const href = global.location && global.location.href ? global.location.href : 'http://localhost/index.html';
        return new URL('js/data-layer.js', href);
    })();
    const siteRoot = new URL('../', scriptUrl);
    const generatedRoot = new URL('data/generated/', siteRoot);

    let searchCorePromise = null;
    let lookupIndexPromise = null;
    let compatibilityPromise = null;
    let graphPromise = null;
    const regionCache = new Map();

    function fetchJson(url, optional) {
        return fetch(url).then(function (response) {
            if (!response.ok) {
                if (optional) return null;
                throw new Error('HTTP ' + response.status + ' for ' + url);
            }
            return response.json();
        }).catch(function (error) {
            if (optional) return null;
            throw error;
        });
    }

    function normalizeText(value) {
        return String(value == null ? '' : value)
            .normalize('NFKC')
            .toLocaleLowerCase('ru-RU')
            .replace(/ё/g, 'е')
            .replace(/[^0-9a-zа-я]+/giu, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    }

    function searchTokens(value) {
        return normalizeText(value).split(' ').filter(function (token) {
            return token.length >= 2 && !STOPWORDS.has(token);
        });
    }

    function categoryToType(category) {
        return CATEGORY_TYPES[normalizeText(category)] || 'other';
    }

    function typeLabel(placeType) {
        return TYPE_LABELS[placeType] || TYPE_LABELS.other;
    }

    function statusLabel(status) {
        return STATUS_LABELS[status] || String(status || '');
    }

    function normalizeDetailPath(value) {
        if (!value) return null;
        return String(value).replace(/^\.\.\//, '').replace(/^\.\//, '');
    }

    function detailUrl(detailPath) {
        const path = normalizeDetailPath(detailPath);
        return path ? new URL(path, siteRoot).href : null;
    }

    function mapUrl(options) {
        const url = new URL('index.html', siteRoot);
        const opts = options || {};
        ['q', 'region', 'type', 'status'].forEach(function (key) {
            const value = opts[key];
            if (value && value !== 'all') url.searchParams.set(key, value);
        });
        url.hash = 'map';
        return url.href;
    }


    function catalogUrl(options) {
        const url = new URL('catalog/catalog.html', siteRoot);
        const opts = options || {};
        ['q', 'region', 'type', 'status', 'sort'].forEach(function (key) {
            const value = opts[key];
            if (value && value !== 'all' && !(key === 'sort' && value === 'name')) url.searchParams.set(key, value);
        });
        return url.href;
    }

    function genericDetailUrl(doc) {
        if (!doc) return null;
        const url = new URL('objects/place.html', siteRoot);
        if (doc.slug) url.searchParams.set('slug', doc.slug);
        else if (doc.id) url.searchParams.set('id', doc.id);
        else return null;
        return url.href;
    }

    function distanceSquared(a, b) {
        if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return Infinity;
        const dLat = a.lat - b.lat;
        const dLon = a.lon - b.lon;
        return dLat * dLat + dLon * dLon;
    }

    function canonicalUiDoc(doc) {
        return {
            id: doc.id,
            slug: doc.slug,
            name: doc.name || '',
            region: doc.region || '',
            locality: doc.locality || '',
            place_type: doc.place_type || 'unknown',
            category: typeLabel(doc.place_type),
            status: doc.status || 'unknown',
            status_label: statusLabel(doc.status || 'unknown'),
            lat: Number.isFinite(Number(doc.lat)) ? Number(doc.lat) : null,
            lon: Number.isFinite(Number(doc.lon)) ? Number(doc.lon) : null,
            detail_path: normalizeDetailPath(doc.detail_path),
            quality_score: doc.quality_score,
            source: 'canonical'
        };
    }

    function curatedDoc(item) {
        const rawId = item.id == null ? normalizeText(item.name).replace(/\s+/g, '-') : String(item.id);
        return {
            id: 'legacy-catalog-' + rawId,
            slug: null,
            name: item.name || '',
            region: String(item.region || '').replace(/^г\.\s*/i, ''),
            locality: '',
            address: item.address || '',
            place_type: categoryToType(item.category),
            category: item.category || typeLabel(categoryToType(item.category)),
            status: item.status || '',
            status_label: item.status || '',
            lat: Number.isFinite(Number(item.lat)) ? Number(item.lat) : null,
            lon: Number.isFinite(Number(item.lon)) ? Number(item.lon) : null,
            detail_path: normalizeDetailPath(item.link),
            quality_score: null,
            source: 'legacy-catalog'
        };
    }

    function loadSearchCore() {
        if (searchCorePromise) return searchCorePromise;
        searchCorePromise = fetchJson(new URL('search_index.json', generatedRoot)).then(function (search) {
            if (!search || !Array.isArray(search.documents) || !search.postings || !Array.isArray(search.terms)) {
                throw new Error('Некорректный M2.5 search_index');
            }
            if (search.place_count !== search.document_count || search.document_count !== search.documents.length) {
                throw new Error('M2.5 search document count mismatch');
            }
            const canonicalDocs = search.documents.map(canonicalUiDoc);
            const byIdDoc = new Map(canonicalDocs.map(function (doc) { return [doc.id, doc]; }));
            return { search: search, canonicalDocs: canonicalDocs, byIdDoc: byIdDoc, source_sha256: search.source_sha256 };
        });
        return searchCorePromise;
    }

    function loadLookupIndex() {
        if (lookupIndexPromise) return lookupIndexPromise;
        lookupIndexPromise = fetchJson(new URL('index.json', generatedRoot)).then(function (index) {
            if (!index || !index.by_id || !index.by_slug || !Array.isArray(index.regions)) {
                throw new Error('Некорректный M2.5 lookup index');
            }
            return index;
        });
        return lookupIndexPromise;
    }

    function loadCompatibility() {
        if (compatibilityPromise) return compatibilityPromise;
        compatibilityPromise = fetchJson(new URL('data/catalog.json', siteRoot), true).then(function (payload) {
            const curated = Array.isArray(payload) ? payload.map(curatedDoc).filter(function (x) { return x.name; }) : [];
            return { curated: curated };
        });
        return compatibilityPromise;
    }

    function findPrefixRange(sortedTerms, prefix) {
        let lo = 0;
        let hi = sortedTerms.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sortedTerms[mid] < prefix) lo = mid + 1;
            else hi = mid;
        }
        const start = lo;
        lo = start;
        hi = sortedTerms.length;
        const upper = prefix + '\uffff';
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sortedTerms[mid] <= upper) lo = mid + 1;
            else hi = mid;
        }
        return [start, lo];
    }

    function addPostingScores(scores, postings, weight) {
        if (!postings) return;
        postings.forEach(function (ordinal) {
            scores.set(ordinal, (scores.get(ordinal) || 0) + weight);
        });
    }

    function scoreUiDoc(doc, normalizedQuery, queryTokens, baseScore) {
        const name = normalizeText(doc.name);
        const region = normalizeText(doc.region);
        const category = normalizeText(doc.category || typeLabel(doc.place_type));
        const address = normalizeText(doc.address || '');
        let score = baseScore || 0;
        if (name === normalizedQuery) score += 1600;
        else if (name.startsWith(normalizedQuery)) score += 420;
        else if (name.includes(normalizedQuery)) score += 180;
        const words = name.split(' ');
        if (queryTokens.length && queryTokens.every(function (token) { return words.some(function (word) { return word.startsWith(token); }); })) score += 220;
        if (region === normalizedQuery) score += 120;
        else if (region.includes(normalizedQuery)) score += 55;
        let matchedTokens = 0;
        queryTokens.forEach(function (token) {
            let matched = false;
            if (name.includes(token)) { score += 35; matched = true; }
            if (region.includes(token)) { score += 16; matched = true; }
            if (category.includes(token)) { score += 10; matched = true; }
            if (address.includes(token)) { score += 8; matched = true; }
            if (matched) matchedTokens += 1;
        });
        if (queryTokens.length > 1 && matchedTokens === queryTokens.length) score += 260;
        return score;
    }

    function enrichWithCurated(baseDocs, curated) {
        if (!curated.length) return { docs: baseDocs, extras: [] };
        const byName = new Map();
        baseDocs.forEach(function (doc) {
            const key = normalizeText(doc.name);
            if (!byName.has(key)) byName.set(key, []);
            byName.get(key).push(doc);
        });
        const overrides = new Map();
        const extras = [];
        curated.forEach(function (curatedItem) {
            const matches = byName.get(normalizeText(curatedItem.name)) || [];
            let match = null;
            if (matches.length === 1) match = matches[0];
            else if (matches.length > 1) {
                match = matches.slice().sort(function (a, b) {
                    return distanceSquared(a, curatedItem) - distanceSquared(b, curatedItem);
                })[0];
            }
            if (!match && curatedItem.detail_path && curatedItem.place_type !== 'other' && Number.isFinite(curatedItem.lat) && Number.isFinite(curatedItem.lon)) {
                const nearby = baseDocs.filter(function (doc) {
                    if (doc.place_type !== curatedItem.place_type) return false;
                    if (normalizeText(doc.region) !== normalizeText(curatedItem.region)) return false;
                    return distanceSquared(doc, curatedItem) <= 0.000004;
                }).sort(function (a, b) {
                    return distanceSquared(a, curatedItem) - distanceSquared(b, curatedItem);
                });
                if (nearby.length) match = nearby[0];
            }
            if (match && curatedItem.detail_path) overrides.set(match.id, curatedItem.detail_path);
            else extras.push(curatedItem);
        });
        if (!overrides.size) return { docs: baseDocs, extras: extras };
        return {
            docs: baseDocs.map(function (doc) {
                const override = overrides.get(doc.id);
                return override ? Object.assign({}, doc, { detail_path: override }) : doc;
            }),
            extras: extras
        };
    }

    async function getMapPlaces() {
        const parts = await Promise.all([loadSearchCore(), loadCompatibility()]);
        return enrichWithCurated(parts[0].canonicalDocs, parts[1].curated).docs;
    }

    async function getCatalogPlaces() {
        return getMapPlaces();
    }

    async function getRegions() {
        const index = await loadLookupIndex();
        return index.regions.map(function (row) { return { name: row.name, count: row.count }; })
            .sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    }

    async function getStats() {
        const index = await loadLookupIndex();
        return {
            canonical_places: Number(index.place_count || 0),
            compatibility_places: 0,
            map_places: Number(index.place_count || 0),
            regions: Number(index.region_count || index.regions.length || 0),
            runtime_id_aliases: Object.keys(index.runtime_id_aliases || {}).length,
            source_sha256: index.source_sha256
        };
    }

    async function search(query, options) {
        const opts = options || {};
        const requestedLimit = opts.limit === 'all' ? 20000 : (Number(opts.limit) || 20);
        const limit = Math.max(1, Math.min(requestedLimit, 20000));
        const normalizedQuery = normalizeText(query);
        if (!normalizedQuery) return [];
        const queryTokens = searchTokens(query);
        const parts = await Promise.all([loadSearchCore(), loadCompatibility()]);
        const core = parts[0];
        const compat = parts[1];
        const scores = new Map();
        const exact = core.search.exact_names[normalizedQuery];
        addPostingScores(scores, exact, 260);

        queryTokens.forEach(function (token) {
            addPostingScores(scores, core.search.postings[token], 70);
            const range = findPrefixRange(core.search.terms, token);
            const prefixEnd = Math.min(range[1], range[0] + 120);
            for (let i = range[0]; i < prefixEnd; i += 1) {
                const term = core.search.terms[i];
                if (term === token) continue;
                addPostingScores(scores, core.search.postings[term], 18);
            }
        });

        const enriched = enrichWithCurated(core.canonicalDocs, compat.curated);
        const enrichedById = new Map(enriched.docs.map(function (doc) { return [doc.id, doc]; }));
        const candidateDocs = [];
        scores.forEach(function (baseScore, ordinal) {
            const original = core.canonicalDocs[ordinal];
            if (!original) return;
            const doc = enrichedById.get(original.id) || original;
            candidateDocs.push({ doc: doc, score: scoreUiDoc(doc, normalizedQuery, queryTokens, baseScore) });
        });

        enriched.extras.forEach(function (doc) {
            const score = scoreUiDoc(doc, normalizedQuery, queryTokens, 0);
            if (score > 0) candidateDocs.push({ doc: doc, score: score });
        });

        const seen = new Set();
        return candidateDocs
            .filter(function (entry) { return entry.score > 0; })
            .sort(function (a, b) {
                if (b.score !== a.score) return b.score - a.score;
                return a.doc.name.localeCompare(b.doc.name, 'ru');
            })
            .filter(function (entry) {
                if (seen.has(entry.doc.id)) return false;
                seen.add(entry.doc.id);
                return true;
            })
            .slice(0, limit)
            .map(function (entry) { return entry.doc; });
    }


    function filterSearchItems(items, options, skip) {
        const opts = options || {};
        const omitted = skip || null;
        return items.filter(function (item) {
            if (omitted !== 'region' && opts.region && opts.region !== 'all' && item.region !== opts.region) return false;
            if (omitted !== 'type' && opts.type && opts.type !== 'all' && item.place_type !== opts.type) return false;
            if (omitted !== 'status' && opts.status && opts.status !== 'all' && item.status !== opts.status) return false;
            return true;
        });
    }

    function countFacet(items, key) {
        const counts = new Map();
        items.forEach(function (item) {
            const value = item[key] || 'unknown';
            counts.set(value, (counts.get(value) || 0) + 1);
        });
        return Array.from(counts, function (entry) { return { value: entry[0], count: entry[1] }; })
            .sort(function (a, b) { return b.count - a.count || String(a.value).localeCompare(String(b.value), 'ru'); });
    }

    async function searchAdvanced(query, options) {
        const opts = options || {};
        const normalized = normalizeText(query);
        const base = normalized ? await search(query, { limit: 'all' }) : await getMapPlaces();
        const filtered = filterSearchItems(base, opts);
        const requestedLimit = opts.limit === 'all' ? filtered.length : (Number(opts.limit) || 20);
        const limit = Math.max(1, Math.min(requestedLimit, 20000));
        const regionBase = filterSearchItems(base, opts, 'region');
        const typeBase = filterSearchItems(base, opts, 'type');
        const statusBase = filterSearchItems(base, opts, 'status');
        const regionFacets = countFacet(regionBase, 'region');
        const typeFacets = countFacet(typeBase, 'place_type');
        const statusFacets = countFacet(statusBase, 'status');
        const suggestions = [];
        regionFacets.slice(0, 4).forEach(function (row) {
            if (row.value && row.value !== 'unknown') suggestions.push({ kind: 'region', value: row.value, label: row.value, count: row.count });
        });
        typeFacets.slice(0, 3).forEach(function (row) {
            if (row.value && row.value !== 'unknown') suggestions.push({ kind: 'type', value: row.value, label: typeLabel(row.value), count: row.count });
        });
        return {
            items: filtered.slice(0, limit),
            total: filtered.length,
            facets: { regions: regionFacets, types: typeFacets, statuses: statusFacets },
            suggestions: suggestions.slice(0, 6)
        };
    }

    async function suggest(query, options) {
        const opts = options || {};
        const limit = Math.max(1, Math.min(Number(opts.limit) || 8, 20));
        const result = await searchAdvanced(query, Object.assign({}, opts, { limit: limit }));
        return { items: result.items, total: result.total, suggestions: result.suggestions };
    }

    async function loadRegionShard(regionSlug) {
        if (regionCache.has(regionSlug)) return regionCache.get(regionSlug);
        const promise = fetchJson(new URL('regions/' + encodeURIComponent(regionSlug) + '.json', generatedRoot)).then(function (payload) {
            if (!payload || !Array.isArray(payload.places)) throw new Error('Некорректный region shard: ' + regionSlug);
            return payload;
        });
        regionCache.set(regionSlug, promise);
        return promise;
    }

    async function getPlaceById(id) {
        if (String(id).startsWith('legacy-catalog-')) {
            const compat = await loadCompatibility();
            return compat.curated.find(function (doc) { return doc.id === id; }) || null;
        }
        const core = await loadLookupIndex();
        const requestedId = String(id);
        const canonicalId = (core.runtime_id_aliases || {})[requestedId] || requestedId;
        const ref = core.by_id[canonicalId];
        if (!ref) return null;
        const shard = await loadRegionShard(ref.region_slug);
        return shard.places.find(function (place) { return place.id === canonicalId; }) || null;
    }

    async function getPlaceBySlug(slug) {
        const core = await loadLookupIndex();
        const id = core.by_slug[slug];
        return id ? getPlaceById(id) : null;
    }

    async function getRegionPlaces(regionNameOrSlug) {
        const key = normalizeText(regionNameOrSlug);
        const core = await loadLookupIndex();
        const region = core.regions.find(function (item) {
            return item.slug === regionNameOrSlug || normalizeText(item.name) === key;
        });
        if (!region) return [];
        const shard = await loadRegionShard(region.slug);
        return shard.places.slice();
    }

    function toMapTarget(doc) {
        if (!doc) return null;
        const lat = Number(doc.lat != null ? doc.lat : doc.location && doc.location.lat);
        const lon = Number(doc.lon != null ? doc.lon : doc.location && doc.location.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
            id: doc.id || null,
            lat: lat,
            lon: lon,
            name: doc.name || '',
            link: getDetailUrl(doc)
        };
    }

    function getDetailUrl(doc) {
        if (!doc) return null;
        return detailUrl(doc.detail_path || (doc.links && doc.links.detail_path)) || genericDetailUrl(doc);
    }

    function placeDetailUrl(doc) {
        return genericDetailUrl(doc);
    }

    function resolveSiteUrl(path) {
        if (!path) return null;
        return new URL(String(path).replace(/^\/+/, ''), siteRoot).href;
    }

    function routesUrl(options) {
        const opts = options || {};
        const url = new URL('routes/routes.html', siteRoot);
        ['search', 'entity', 'place'].forEach(function (key) {
            if (opts[key]) url.searchParams.set(key, String(opts[key]));
        });
        return url.href;
    }

    function entityDetailUrl(entityOrId) {
        const value = entityOrId && typeof entityOrId === 'object' ? entityOrId.id : entityOrId;
        if (!value) return null;
        const url = new URL('holiness.html', siteRoot);
        url.searchParams.set('entity', String(value));
        return url.href;
    }

    function routeDetailUrl(routeOrId) {
        const route = routeOrId && typeof routeOrId === 'object' ? routeOrId : null;
        const value = route ? (route.id || route.slug) : routeOrId;
        if (!value) return null;
        const url = new URL('routes/route.html', siteRoot);
        const text = String(value);
        if (/^pm-route-[a-f0-9]{24}$/.test(text)) url.searchParams.set('id', text);
        else url.searchParams.set('slug', route && route.slug ? route.slug : text);
        return url.href;
    }

    function loadGraph() {
        if (graphPromise) return graphPromise;
        graphPromise = Promise.all([
            fetchJson(new URL('entities.json', generatedRoot)),
            fetchJson(new URL('relations.json', generatedRoot)),
            fetchJson(new URL('routes.json', generatedRoot)),
            fetchJson(new URL('graph_index.json', generatedRoot))
        ]).then(function (parts) {
            const entities = Array.isArray(parts[0].entities) ? parts[0].entities : [];
            const relations = Array.isArray(parts[1].relations) ? parts[1].relations : [];
            const routes = Array.isArray(parts[2].routes) ? parts[2].routes : [];
            return {
                entities: entities,
                relations: relations,
                routes: routes,
                index: parts[3] || {},
                entityById: new Map(entities.map(function (row) { return [row.id, row]; })),
                relationById: new Map(relations.map(function (row) { return [row.id, row]; })),
                routeById: new Map(routes.map(function (row) { return [row.id, row]; }))
            };
        });
        return graphPromise;
    }

    async function getEntities(options) {
        const opts = options || {};
        const graph = await loadGraph();
        const query = normalizeText(opts.query || '');
        const type = String(opts.type || '').trim();
        return graph.entities.filter(function (row) {
            if (type && type !== 'all' && row.entity_type !== type) return false;
            if (!query) return true;
            const haystack = normalizeText([
                row.name, row.title, row.description, row.feast_day,
                row.location_text, row.saint_name
            ].filter(Boolean).join(' '));
            return haystack.includes(query);
        });
    }

    async function getEntityById(id) {
        const graph = await loadGraph();
        return graph.entityById.get(String(id || '')) || null;
    }

    async function getRelationsForEntity(id) {
        const graph = await loadGraph();
        const relationIds = (graph.index.relations_by_entity || {})[String(id || '')] || [];
        return relationIds.map(function (relId) { return graph.relationById.get(relId); }).filter(Boolean);
    }

    async function getRelationsForPlace(id) {
        const graph = await loadGraph();
        const relationIds = (graph.index.relations_by_place || {})[String(id || '')] || [];
        return relationIds.map(function (relId) { return graph.relationById.get(relId); }).filter(Boolean);
    }

    async function getRelatedEntitiesForPlace(id) {
        const placeId = String(id || '');
        if (!placeId) return [];
        const graph = await loadGraph();
        const relationIds = (graph.index.relations_by_place || {})[placeId] || [];
        const rows = relationIds.map(function (relId) {
            const relation = graph.relationById.get(relId);
            if (!relation) return null;
            const endpoints = [relation.from, relation.to];
            const hasPlace = endpoints.some(function (ref) { return ref && ref.kind === 'place' && ref.id === placeId; });
            if (!hasPlace) return null;
            const entityRef = endpoints.find(function (ref) { return ref && ref.kind === 'entity'; });
            const entity = entityRef ? graph.entityById.get(entityRef.id) : null;
            return entity ? { entity: entity, relation: relation } : null;
        }).filter(Boolean);
        rows.sort(function (a, b) {
            return String(a.entity.name).localeCompare(String(b.entity.name), 'ru') || String(a.relation.id).localeCompare(String(b.relation.id));
        });
        return rows;
    }

    async function getRelatedPlacesForEntity(id) {
        const entityId = String(id || '');
        if (!entityId) return [];
        const graph = await loadGraph();
        const relationIds = (graph.index.relations_by_entity || {})[entityId] || [];
        const refs = relationIds.map(function (relId) {
            const relation = graph.relationById.get(relId);
            if (!relation) return null;
            const endpoints = [relation.from, relation.to];
            const hasEntity = endpoints.some(function (ref) { return ref && ref.kind === 'entity' && ref.id === entityId; });
            if (!hasEntity) return null;
            const placeRef = endpoints.find(function (ref) { return ref && ref.kind === 'place'; });
            return placeRef ? { place_id: placeRef.id, relation: relation } : null;
        }).filter(Boolean);
        const hydrated = await Promise.all(refs.map(async function (row) {
            const place = await getPlaceById(row.place_id);
            return place ? { place: place, relation: row.relation } : null;
        }));
        return hydrated.filter(Boolean).sort(function (a, b) {
            return String(a.place.name).localeCompare(String(b.place.name), 'ru') || String(a.relation.id).localeCompare(String(b.relation.id));
        });
    }

    async function getRoutes(options) {
        const opts = options || {};
        const graph = await loadGraph();
        const query = normalizeText(opts.query || '');
        let routes = graph.routes.slice();
        if (opts.entity) {
            const ids = new Set((graph.index.routes_by_entity || {})[String(opts.entity)] || []);
            routes = routes.filter(function (row) { return ids.has(row.id); });
        }
        if (opts.place) {
            const ids = new Set((graph.index.routes_by_place || {})[String(opts.place)] || []);
            routes = routes.filter(function (row) { return ids.has(row.id); });
        }
        if (query) {
            routes = routes.filter(function (row) {
                const haystack = normalizeText([
                    row.title, row.location, row.duration, row.distance, row.description,
                    (row.waypoints || []).map(function (point) { return point.label; }).join(' ')
                ].filter(Boolean).join(' '));
                return haystack.includes(query);
            });
        }
        return routes;
    }

    async function getRouteById(id) {
        const graph = await loadGraph();
        return graph.routeById.get(String(id || '')) || null;
    }

    async function getRouteBySlug(slug) {
        const graph = await loadGraph();
        const key = String(slug || '');
        return graph.routes.find(function (row) { return row.slug === key; }) || null;
    }

    async function resolveRoute(routeOrId) {
        if (routeOrId && typeof routeOrId === 'object') return routeOrId;
        const key = String(routeOrId || '');
        if (!key) return null;
        return /^pm-route-[a-f0-9]{24}$/.test(key) ? getRouteById(key) : getRouteBySlug(key);
    }

    async function getRoutePoints(routeOrId) {
        const route = await resolveRoute(routeOrId);
        if (!route) return [];
        const canonical = await Promise.all((route.stops || []).map(async function (stop) {
            const place = await getPlaceById(stop.place_id);
            if (!place) return null;
            const lat = Number(place.location && place.location.lat);
            const lon = Number(place.location && place.location.lon);
            const address = place.address && place.address.formatted ? place.address.formatted : '';
            return {
                kind: 'place',
                order: Number(stop.order),
                place_id: stop.place_id,
                name: place.name || '',
                region: place.address && place.address.region ? place.address.region : '',
                address: address,
                lat: Number.isFinite(lat) ? lat : null,
                lon: Number.isFinite(lon) ? lon : null,
                detail_url: genericDetailUrl(place),
                quality_flags: (stop.quality_flags || []).slice(),
                place: place
            };
        }));
        const legacy = (route.waypoints || []).map(function (point) {
            const lat = Number(point.lat);
            const lon = Number(point.lon);
            return {
                kind: 'legacy_waypoint',
                order: Number(point.order),
                place_id: null,
                name: point.label || '',
                region: '',
                address: '',
                lat: Number.isFinite(lat) ? lat : null,
                lon: Number.isFinite(lon) ? lon : null,
                detail_url: point.detail_path ? resolveSiteUrl(point.detail_path) : null,
                quality_flags: (point.quality_flags || []).slice(),
                place: null
            };
        });
        return canonical.filter(Boolean).concat(legacy).sort(function (a, b) {
            return a.order - b.order || String(a.name).localeCompare(String(b.name), 'ru');
        });
    }

    function parseGraphKey(value) {
        const text = String(value || '');
        const split = text.indexOf(':');
        if (split <= 0) return null;
        const kind = text.slice(0, split);
        const id = text.slice(split + 1);
        if (!id || !['place', 'entity', 'route'].includes(kind)) return null;
        return { kind: kind, id: id };
    }

    function normalizeGraphRef(value) {
        if (!value) return null;
        if (typeof value === 'string') return parseGraphKey(value);
        const kind = String(value.kind || '');
        const id = String(value.id || '');
        if (!id || !['place', 'entity', 'route'].includes(kind)) return null;
        return { kind: kind, id: id };
    }

    function graphKey(ref) {
        const normalized = normalizeGraphRef(ref);
        return normalized ? normalized.kind + ':' + normalized.id : '';
    }

    async function traverseGraph(startRef, options) {
        const start = normalizeGraphRef(startRef);
        if (!start) return [];
        const opts = options || {};
        const graph = await loadGraph();
        const adjacency = graph.index.adjacency || {};
        const maxDepth = Math.max(1, Math.min(4, Number(opts.maxDepth) || 2));
        const limit = Math.max(1, Math.min(100, Number(opts.limit) || 50));
        const requestedKinds = Array.isArray(opts.targetKinds)
            ? new Set(opts.targetKinds.map(String).filter(function (kind) { return ['place', 'entity', 'route'].includes(kind); }))
            : null;
        const startKey = graphKey(start);
        const queue = [{ ref: start, key: startKey, depth: 0, path: [] }];
        const visited = new Map([[startKey, 0]]);
        const results = [];

        while (queue.length && results.length < limit) {
            const current = queue.shift();
            if (current.depth >= maxDepth) continue;
            const edges = Array.isArray(adjacency[current.key]) ? adjacency[current.key] : [];
            for (const edge of edges) {
                const next = parseGraphKey(edge && edge.to);
                if (!next) continue;
                const nextKey = graphKey(next);
                const nextDepth = current.depth + 1;
                if (visited.has(nextKey)) continue;
                visited.set(nextKey, nextDepth);
                const step = Object.assign({ from: current.key, to: nextKey }, edge);
                const path = current.path.concat([step]);
                const row = { kind: next.kind, id: next.id, depth: nextDepth, path: path };
                if (!requestedKinds || requestedKinds.has(next.kind)) {
                    results.push(row);
                    if (results.length >= limit) break;
                }
                if (nextDepth < maxDepth) queue.push({ ref: next, key: nextKey, depth: nextDepth, path: path });
            }
        }

        return results.sort(function (a, b) {
            return a.depth - b.depth || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
        });
    }

    async function hydrateTraversalRow(row) {
        if (!row) return null;
        const graph = await loadGraph();
        let node = null;
        if (row.kind === 'place') node = await getPlaceById(row.id);
        else if (row.kind === 'entity') node = graph.entityById.get(row.id) || null;
        else if (row.kind === 'route') node = graph.routeById.get(row.id) || null;
        return node ? Object.assign({}, row, { node: node }) : null;
    }

    function traversalReason(row) {
        const path = row && Array.isArray(row.path) ? row.path : [];
        const edgeTypes = path.map(function (edge) { return edge.edge_type; });
        if (row && row.kind === 'route') {
            if (path.length === 1 && edgeTypes[0] === 'route_stop') return 'direct_route_stop';
            if (edgeTypes.includes('relation')) return 'route_via_graph_relation';
            if (edgeTypes.filter(function (type) { return type === 'route_stop'; }).length >= 2) return 'route_via_shared_place';
        }
        if (row && row.kind === 'place' && path.length === 2) {
            if (edgeTypes.every(function (type) { return type === 'relation'; })) return 'shared_entity';
            if (edgeTypes.every(function (type) { return type === 'route_stop'; })) return 'shared_route';
        }
        if (row && row.kind === 'entity') {
            if (path.length === 1 && edgeTypes[0] === 'relation') return 'direct_relation';
            if (path.length === 2 && edgeTypes.every(function (type) { return type === 'relation'; })) return 'shared_place_or_entity';
            if (edgeTypes.includes('route_stop')) return 'entity_via_route_place';
        }
        return 'graph_path';
    }

    async function hydrateTraversal(rows) {
        const hydrated = await Promise.all((rows || []).map(hydrateTraversalRow));
        return hydrated.filter(Boolean).map(function (row) {
            row.reason = traversalReason(row);
            return row;
        });
    }

    async function getRelatedPlacesForPlace(placeId, options) {
        const opts = options || {};
        const rows = await traverseGraph({ kind: 'place', id: String(placeId || '') }, {
            maxDepth: Math.min(2, Number(opts.maxDepth) || 2),
            targetKinds: ['place'],
            limit: opts.limit || 20
        });
        return hydrateTraversal(rows);
    }

    async function getRelatedEntitiesForEntity(entityId, options) {
        const opts = options || {};
        const rows = await traverseGraph({ kind: 'entity', id: String(entityId || '') }, {
            maxDepth: Math.min(2, Number(opts.maxDepth) || 2),
            targetKinds: ['entity'],
            limit: opts.limit || 20
        });
        return hydrateTraversal(rows);
    }

    async function getRouteSuggestionsForPlace(placeId, options) {
        const opts = options || {};
        const rows = await traverseGraph({ kind: 'place', id: String(placeId || '') }, {
            maxDepth: Math.min(3, Number(opts.maxDepth) || 3),
            targetKinds: ['route'],
            limit: opts.limit || 12
        });
        return hydrateTraversal(rows);
    }

    async function getRouteSuggestionsForEntity(entityId, options) {
        const opts = options || {};
        const rows = await traverseGraph({ kind: 'entity', id: String(entityId || '') }, {
            maxDepth: Math.min(3, Number(opts.maxDepth) || 3),
            targetKinds: ['route'],
            limit: opts.limit || 12
        });
        return hydrateTraversal(rows);
    }

    async function getRelatedRoutesForRoute(routeId, options) {
        const opts = options || {};
        const rows = await traverseGraph({ kind: 'route', id: String(routeId || '') }, {
            maxDepth: Math.min(4, Number(opts.maxDepth) || 4),
            targetKinds: ['route'],
            limit: opts.limit || 12
        });
        return hydrateTraversal(rows);
    }

    async function getEntitiesForRoute(routeOrId) {
        const route = await resolveRoute(routeOrId);
        if (!route) return [];
        const rows = await traverseGraph({ kind: 'route', id: route.id }, {
            maxDepth: 2, targetKinds: ['entity'], limit: 50
        });
        const hydrated = await hydrateTraversal(rows);
        return hydrated.map(function (row) { return row.node; })
            .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); });
    }

    async function getRoutesForEntity(entityId) {
        return getRoutes({ entity: entityId });
    }

    async function getRoutesForPlace(placeId) {
        return getRoutes({ place: placeId });
    }

    global.PravmirData = Object.freeze({
        version: '1.20.0',
        init: function () { return Promise.all([loadSearchCore(), loadLookupIndex(), loadCompatibility()]).then(function () { return getStats(); }); },
        normalizeText: normalizeText,
        typeLabel: typeLabel,
        statusLabel: statusLabel,
        getStats: getStats,
        getRegions: getRegions,
        getMapPlaces: getMapPlaces,
        getCatalogPlaces: getCatalogPlaces,
        search: search,
        searchAdvanced: searchAdvanced,
        suggest: suggest,
        getPlaceById: getPlaceById,
        getPlaceBySlug: getPlaceBySlug,
        getRegionPlaces: getRegionPlaces,
        getDetailUrl: getDetailUrl,
        placeDetailUrl: placeDetailUrl,
        toMapTarget: toMapTarget,
        mapUrl: mapUrl,
        catalogUrl: catalogUrl,
        resolveSiteUrl: resolveSiteUrl,
        routesUrl: routesUrl,
        entityDetailUrl: entityDetailUrl,
        routeDetailUrl: routeDetailUrl,
        getEntities: getEntities,
        getEntityById: getEntityById,
        getRelationsForEntity: getRelationsForEntity,
        getRelationsForPlace: getRelationsForPlace,
        getRelatedEntitiesForPlace: getRelatedEntitiesForPlace,
        getRelatedPlacesForEntity: getRelatedPlacesForEntity,
        getRoutes: getRoutes,
        getRouteById: getRouteById,
        getRouteBySlug: getRouteBySlug,
        getRoutePoints: getRoutePoints,
        traverseGraph: traverseGraph,
        getRelatedPlacesForPlace: getRelatedPlacesForPlace,
        getRelatedEntitiesForEntity: getRelatedEntitiesForEntity,
        getRouteSuggestionsForPlace: getRouteSuggestionsForPlace,
        getRouteSuggestionsForEntity: getRouteSuggestionsForEntity,
        getRelatedRoutesForRoute: getRelatedRoutesForRoute,
        getEntitiesForRoute: getEntitiesForRoute,
        getRoutesForEntity: getRoutesForEntity,
        getRoutesForPlace: getRoutesForPlace
    });
})(window);
