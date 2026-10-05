(function (global) {
    'use strict';

    const scriptUrl = (function () {
        if (global.__PRAVMIR_EVENT_LAYER_URL__) return new URL(global.__PRAVMIR_EVENT_LAYER_URL__, global.location && global.location.href ? global.location.href : undefined);
        if (global.document && global.document.currentScript && global.document.currentScript.src) return new URL(global.document.currentScript.src);
        const href = global.location && global.location.href ? global.location.href : 'http://localhost/index.html';
        return new URL('js/event-layer.js', href);
    })();
    const baseUrl = new URL('../data/generated/', scriptUrl).href;
    let corePromise = null;

    function fetchJson(name) {
        return fetch(new URL(name, baseUrl).href).then(function (response) {
            if (!response.ok) throw new Error('PravmirEvents: failed to load ' + name + ' (' + response.status + ')');
            return response.json();
        });
    }

    function assertPayload(payload, expectedHash, key, name) {
        if (!payload || payload.source_snapshot_sha256 !== expectedHash || !Array.isArray(payload[key])) {
            throw new Error('PravmirEvents: invalid payload ' + name);
        }
        if (payload.count !== payload[key].length) throw new Error('PravmirEvents: count mismatch ' + name);
    }

    function datePart(value) {
        const text = String(value || '');
        return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
    }

    function normalizeDate(value) {
        const text = String(value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
        const d = new Date(text + 'T00:00:00Z');
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) return null;
        return text;
    }

    function clampLimit(value, fallback) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.max(1, Math.min(1000, Math.floor(num)));
    }

    async function loadCore() {
        if (corePromise) return corePromise;
        corePromise = Promise.all([
            fetchJson('event_records.json'),
            fetchJson('event_relations.json'),
            fetchJson('event_aliases.json'),
            fetchJson('event_index.json'),
            fetchJson('event_report.json')
        ]).then(function (parts) {
            const events = parts[0], relations = parts[1], aliases = parts[2], index = parts[3], report = parts[4];
            const sourceHash = index && index.source_snapshot_sha256;
            if (!sourceHash || !report || report.source_snapshot_sha256 !== sourceHash) throw new Error('PravmirEvents: snapshot mismatch');
            assertPayload(events, sourceHash, 'events', 'event_records.json');
            assertPayload(relations, sourceHash, 'relations', 'event_relations.json');
            assertPayload(aliases, sourceHash, 'aliases', 'event_aliases.json');
            const byId = new Map(events.events.map(function (row) { return [row.id, row]; }));
            const bySlug = new Map(Object.keys(index.by_slug || {}).map(function (slug) { return [slug, index.by_slug[slug]]; }));
            const relationByEvent = new Map();
            const relationByTarget = new Map();
            relations.relations.forEach(function (row) {
                const eventId = row.from && row.from.kind === 'event' ? row.from.id : null;
                if (eventId) {
                    if (!relationByEvent.has(eventId)) relationByEvent.set(eventId, []);
                    relationByEvent.get(eventId).push(row);
                }
                if (row.to) {
                    const key = row.to.kind + ':' + row.to.id;
                    if (!relationByTarget.has(key)) relationByTarget.set(key, []);
                    relationByTarget.get(key).push(row);
                }
            });
            const aliasMap = new Map(aliases.aliases.map(function (row) { return [row.alias, row.event_id]; }));
            return { sourceHash: sourceHash, events: events.events, byId: byId, bySlug: bySlug, relationByEvent: relationByEvent, relationByTarget: relationByTarget, aliasMap: aliasMap, index: index, report: report };
        }).catch(function (error) {
            corePromise = null;
            throw error;
        });
        return corePromise;
    }

    async function getStats() {
        const core = await loadCore();
        return {
            events: core.index.counts.events,
            relations: core.index.counts.relations,
            aliases: core.index.counts.aliases,
            review_queue: core.index.counts.review_queue,
            rejected: core.index.counts.rejected,
            coverage: core.index.coverage ? Object.assign({}, core.index.coverage) : null,
            providers: (core.report.providers || []).slice(),
            source_snapshot_sha256: core.sourceHash
        };
    }

    async function getEvents(options) {
        const core = await loadCore();
        const opts = options || {};
        const from = opts.from ? normalizeDate(opts.from) : null;
        const to = opts.to ? normalizeDate(opts.to) : null;
        const type = opts.type ? String(opts.type) : '';
        const status = opts.status ? String(opts.status) : '';
        const trust = opts.trust_layer ? String(opts.trust_layer) : '';
        const q = String(opts.q || '').trim().toLocaleLowerCase('ru-RU');
        return core.events.filter(function (row) {
            const start = datePart(row.temporal && row.temporal.starts_at);
            const end = datePart((row.temporal && row.temporal.ends_at) || (row.temporal && row.temporal.starts_at));
            if (from && end < from) return false;
            if (to && start > to) return false;
            if (type && row.event_type !== type) return false;
            if (status && row.status !== status) return false;
            if (trust && row.trust_layer !== trust) return false;
            if (q) {
                const hay = [row.title, row.summary, row.venue && row.venue.name, row.venue && row.venue.address, row.organizer && row.organizer.name].filter(Boolean).join(' ').toLocaleLowerCase('ru-RU');
                if (!q.split(/\s+/).every(function (part) { return hay.includes(part); })) return false;
            }
            return true;
        }).sort(function (a, b) {
            return String(a.temporal.starts_at).localeCompare(String(b.temporal.starts_at)) || a.title.localeCompare(b.title, 'ru');
        }).slice(0, clampLimit(opts.limit, 200));
    }

    async function getForDate(value, options) {
        const date = normalizeDate(value);
        if (!date) return [];
        const opts = Object.assign({}, options || {}, { from: date, to: date });
        return getEvents(opts);
    }

    async function getUpcoming(value, options) {
        const date = normalizeDate(value);
        if (!date) return [];
        return getEvents(Object.assign({}, options || {}, { from: date }));
    }

    async function getById(id) {
        const core = await loadCore();
        const key = String(id || '');
        const direct = core.byId.get(key);
        if (direct) return direct;
        const aliased = core.aliasMap.get(key);
        return aliased ? (core.byId.get(aliased) || null) : null;
    }

    async function getBySlug(slug) {
        const core = await loadCore();
        const id = core.bySlug.get(String(slug || ''));
        return id ? (core.byId.get(id) || null) : null;
    }

    async function getRelations(eventId) {
        const core = await loadCore();
        return (core.relationByEvent.get(String(eventId || '')) || []).slice();
    }

    async function getRelatedEvents(ref, options) {
        if (!ref || !ref.kind || !ref.id) return [];
        const core = await loadCore();
        const rels = core.relationByTarget.get(String(ref.kind) + ':' + String(ref.id)) || [];
        const ids = Array.from(new Set(rels.map(function (row) { return row.from.id; })));
        const rows = ids.map(function (id) { return core.byId.get(id); }).filter(Boolean);
        const opts = options || {};
        const status = opts.status ? String(opts.status) : '';
        return rows.filter(function (row) { return !status || row.status === status; })
            .sort(function (a, b) { return String(a.temporal.starts_at).localeCompare(String(b.temporal.starts_at)); })
            .slice(0, clampLimit(opts.limit, 100));
    }

    async function resolveReference(ref) {
        if (!ref || !ref.kind || !ref.id) return null;
        if (ref.kind === 'event') return getById(ref.id);
        if (ref.kind === 'content' && global.PravmirContent && global.PravmirContent.getContentById) return global.PravmirContent.getContentById(ref.id);
        if (['calendar_day', 'feast', 'saint', 'commemoration', 'fasting_rule', 'reading'].includes(ref.kind) && global.PravmirLiturgical && global.PravmirLiturgical.getById) {
            if (ref.kind === 'calendar_day' && global.PravmirLiturgical.getCalendarDay && String(ref.id).startsWith('pm-day-')) return global.PravmirLiturgical.getCalendarDay(String(ref.id).slice(7));
            return global.PravmirLiturgical.getById(ref.kind, ref.id);
        }
        if (global.PravmirData) {
            if (ref.kind === 'place' && global.PravmirData.getPlaceById) return global.PravmirData.getPlaceById(ref.id);
            if (ref.kind === 'entity' && global.PravmirData.getEntityById) return global.PravmirData.getEntityById(ref.id);
            if (ref.kind === 'route' && global.PravmirData.getRouteById) return global.PravmirData.getRouteById(ref.id);
        }
        return null;
    }

    global.PravmirEvents = Object.freeze({
        version: '1.16.0',
        init: function () { return loadCore().then(getStats); },
        normalizeDate: normalizeDate,
        getStats: getStats,
        getEvents: getEvents,
        getForDate: getForDate,
        getUpcoming: getUpcoming,
        getById: getById,
        getBySlug: getBySlug,
        getRelations: getRelations,
        getRelatedEvents: getRelatedEvents,
        resolveReference: resolveReference
    });
})(window);
