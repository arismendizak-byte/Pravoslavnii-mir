(function (global) {
    'use strict';

    const scriptUrl = (function () {
        if (global.__PRAVMIR_LITURGICAL_LAYER_URL__) return new URL(global.__PRAVMIR_LITURGICAL_LAYER_URL__, global.location && global.location.href ? global.location.href : undefined);
        if (global.document && global.document.currentScript && global.document.currentScript.src) return new URL(global.document.currentScript.src);
        const href = global.location && global.location.href ? global.location.href : 'http://localhost/index.html';
        return new URL('js/liturgical-layer.js', href);
    })();
    const baseUrl = new URL('../data/generated/', scriptUrl).href;
    let corePromise = null;

    function fetchJson(name) {
        return fetch(new URL(name, baseUrl).href).then(function (response) {
            if (!response.ok) throw new Error('PravmirLiturgical: failed to load ' + name + ' (' + response.status + ')');
            return response.json();
        });
    }

    function assertPayload(payload, expectedHash, key, name) {
        if (!payload || payload.source_snapshot_sha256 !== expectedHash || !Array.isArray(payload[key])) {
            throw new Error('PravmirLiturgical: invalid payload ' + name);
        }
        if (payload.count !== payload[key].length) throw new Error('PravmirLiturgical: count mismatch ' + name);
    }

    function normalizeDate(value) {
        const text = String(value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
        const d = new Date(text + 'T00:00:00Z');
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) return null;
        return text;
    }

    async function loadCore() {
        if (corePromise) return corePromise;
        corePromise = Promise.all([
            fetchJson('calendar_days.json'),
            fetchJson('feasts.json'),
            fetchJson('saints.json'),
            fetchJson('commemorations.json'),
            fetchJson('fasting_rules.json'),
            fetchJson('readings.json'),
            fetchJson('liturgical_relations.json'),
            fetchJson('liturgical_aliases.json'),
            fetchJson('liturgical_index.json'),
            fetchJson('liturgical_report.json')
        ]).then(function (parts) {
            const days = parts[0], feasts = parts[1], saints = parts[2], commemorations = parts[3];
            const fasting = parts[4], readings = parts[5], relations = parts[6], aliases = parts[7];
            const index = parts[8], report = parts[9];
            const sourceHash = index && index.source_snapshot_sha256;
            if (!sourceHash || !report || report.source_snapshot_sha256 !== sourceHash) throw new Error('PravmirLiturgical: snapshot mismatch');
            assertPayload(days, sourceHash, 'days', 'calendar_days.json');
            assertPayload(feasts, sourceHash, 'feasts', 'feasts.json');
            assertPayload(saints, sourceHash, 'saints', 'saints.json');
            assertPayload(commemorations, sourceHash, 'commemorations', 'commemorations.json');
            assertPayload(fasting, sourceHash, 'rules', 'fasting_rules.json');
            assertPayload(readings, sourceHash, 'readings', 'readings.json');
            assertPayload(relations, sourceHash, 'relations', 'liturgical_relations.json');
            assertPayload(aliases, sourceHash, 'aliases', 'liturgical_aliases.json');

            const byKind = {
                calendar_day: new Map(), feast: new Map(), saint: new Map(), commemoration: new Map(), fasting_rule: new Map(), reading: new Map()
            };
            const collections = {
                calendar_day: days.days, feast: feasts.feasts, saint: saints.saints,
                commemoration: commemorations.commemorations, fasting_rule: fasting.rules, reading: readings.readings
            };
            Object.keys(collections).forEach(function (kind) {
                collections[kind].forEach(function (row) { byKind[kind].set(row.id, row); });
            });
            const dayByDate = new Map(days.days.map(function (row) { return [row.date, row]; }));
            const relationByRef = new Map();
            relations.relations.forEach(function (row) {
                [row.from, row.to].forEach(function (ref) {
                    const key = ref.kind + ':' + ref.id;
                    if (!relationByRef.has(key)) relationByRef.set(key, []);
                    relationByRef.get(key).push(row);
                });
            });
            const legacyAliases = new Map(aliases.aliases.map(function (row) { return [row.legacy_id, row.targets]; }));
            return { sourceHash, collections, byKind, dayByDate, relationByRef, legacyAliases, index, report };
        }).catch(function (error) {
            corePromise = null;
            throw error;
        });
        return corePromise;
    }

    async function getStats() {
        const core = await loadCore();
        return Object.assign({}, core.index.counts, { coverage: Object.assign({}, core.index.coverage), source_snapshot_sha256: core.sourceHash });
    }

    async function getCoverage() {
        const core = await loadCore();
        return Object.assign({}, core.index.coverage);
    }

    async function getCalendarDay(value) {
        const date = normalizeDate(value);
        if (!date) return null;
        const core = await loadCore();
        return core.dayByDate.get(date) || null;
    }

    async function getById(kind, id) {
        const core = await loadCore();
        const map = core.byKind[String(kind || '')];
        return map ? (map.get(String(id || '')) || null) : null;
    }

    async function getBySlug(slug) {
        const core = await loadCore();
        const hit = core.index.by_slug && core.index.by_slug[String(slug || '')];
        return hit ? getById(hit.kind, hit.id) : null;
    }

    async function resolveReference(ref) {
        if (!ref || !ref.kind || !ref.id) return null;
        return getById(ref.kind, ref.id);
    }

    async function getDayBundle(value) {
        const day = await getCalendarDay(value);
        if (!day) return null;
        const items = [];
        for (const ref of (day.references || [])) {
            const item = await resolveReference(ref);
            if (item) items.push({ kind: ref.kind, relation_type: ref.relation_type, item: item });
        }
        items.sort(function (a, b) {
            const order = { feast: 1, commemoration: 2, saint: 3, fasting_rule: 4, reading: 5 };
            return (order[a.kind] || 9) - (order[b.kind] || 9) || String(a.item.title || a.item.display_name || '').localeCompare(String(b.item.title || b.item.display_name || ''), 'ru');
        });
        return { day: day, items: items };
    }

    async function getRelations(ref) {
        if (!ref || !ref.kind || !ref.id) return [];
        const core = await loadCore();
        return (core.relationByRef.get(ref.kind + ':' + ref.id) || []).slice();
    }

    async function resolveLegacyCalendarEntry(id) {
        const core = await loadCore();
        return (core.legacyAliases.get(String(id || '')) || []).slice();
    }

    async function getRecords(kind) {
        const core = await loadCore();
        const rows = core.collections[String(kind || '')];
        return rows ? rows.slice() : [];
    }

    global.PravmirLiturgical = Object.freeze({
        version: '1.22.0',
        init: function () { return loadCore().then(getStats); },
        normalizeDate: normalizeDate,
        getStats: getStats,
        getCoverage: getCoverage,
        getCalendarDay: getCalendarDay,
        getDayBundle: getDayBundle,
        getById: getById,
        getBySlug: getBySlug,
        getRecords: getRecords,
        getRelations: getRelations,
        resolveReference: resolveReference,
        resolveLegacyCalendarEntry: resolveLegacyCalendarEntry
    });
})(window);
