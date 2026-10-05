(function (global) {
    'use strict';

    const scriptUrl = (function () {
        if (global.__PRAVMIR_PILGRIM_LAYER_URL__) return new URL(global.__PRAVMIR_PILGRIM_LAYER_URL__, global.location && global.location.href ? global.location.href : undefined);
        if (global.document && global.document.currentScript && global.document.currentScript.src) return new URL(global.document.currentScript.src);
        const href = global.location && global.location.href ? global.location.href : 'http://localhost/index.html';
        return new URL('js/pilgrim-layer.js', href);
    })();
    const root = new URL('../data/generated/', scriptUrl);
    let corePromise = null;

    function fetchJson(name) {
        const url = new URL(name, root);
        return fetch(url).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
            return response.json();
        });
    }

    function normalize(value) {
        return String(value == null ? '' : value).normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/giu, ' ').trim().replace(/\s+/g, ' ');
    }

    function assertPayload(payload, hash, key, label) {
        if (!payload || payload.source_snapshot_sha256 !== hash || !Array.isArray(payload[key])) throw new Error('M5.6 malformed payload: ' + label);
    }

    function loadCore() {
        if (corePromise) return corePromise;
        corePromise = Promise.all([
            fetchJson('amenity_types.json'), fetchJson('amenity_records.json'), fetchJson('pilgrim_service_records.json'),
            fetchJson('pilgrim_relations.json'), fetchJson('pilgrim_review_queue.json'), fetchJson('pilgrim_conflicts.json'), fetchJson('pilgrim_index.json')
        ]).then(function (parts) {
            const types = parts[0], amenities = parts[1], services = parts[2], relations = parts[3], review = parts[4], conflicts = parts[5], index = parts[6];
            const hash = index.source_snapshot_sha256;
            assertPayload(types, hash, 'types', 'amenity_types');
            assertPayload(amenities, hash, 'amenities', 'amenity_records');
            assertPayload(services, hash, 'services', 'pilgrim_service_records');
            assertPayload(relations, hash, 'relations', 'pilgrim_relations');
            assertPayload(review, hash, 'items', 'pilgrim_review_queue');
            assertPayload(conflicts, hash, 'items', 'pilgrim_conflicts');
            const byId = new Map();
            types.types.forEach(function (x) { byId.set(x.id, {kind:'amenity_type', item:x}); });
            amenities.amenities.forEach(function (x) { byId.set(x.id, {kind:'amenity', item:x}); });
            services.services.forEach(function (x) { byId.set(x.id, {kind:'service', item:x}); });
            const bySlug = new Map();
            amenities.amenities.concat(services.services).forEach(function (x) { if (x.slug) bySlug.set(x.slug, x.id); });
            return {hash:hash, types:types.types, amenities:amenities.amenities, services:services.services, relations:relations.relations, review:review.items, conflicts:conflicts.items, index:index, byId:byId, bySlug:bySlug};
        });
        return corePromise;
    }

    function limit(value, fallback) {
        const n = Number(value);
        return Math.max(1, Math.min(500, Number.isFinite(n) ? n : fallback));
    }

    async function getStats() {
        const core = await loadCore();
        return Object.assign({}, core.index.counts, {source_snapshot_sha256: core.hash});
    }
    async function getTrustSummary() {
        const c = await loadCore();
        const promoted = c.review.filter(function (x) { return x.review_status === 'promoted'; }).length;
        const pending = c.review.filter(function (x) { return x.review_status === 'needs_evidence'; }).length;
        const unresolved = c.conflicts.filter(function (x) { return x.resolution_status === 'unresolved'; }).length;
        const placeRelations = c.relations.filter(function (x) { return x.to && x.to.kind === 'place'; }).length;
        const routeRelations = c.relations.filter(function (x) { return x.to && x.to.kind === 'route'; }).length;
        const organisationRelations = c.relations.filter(function (x) { return x.to && x.to.kind === 'organisation'; }).length;
        return {
            canonical_records:c.amenities.length + c.services.length,
            promoted_review:promoted, pending_review:pending, unresolved_conflicts:unresolved,
            explicit_place_relations:placeRelations, direct_route_relations:routeRelations, organisation_relations:organisationRelations
        };
    }
    async function getAmenityTypes() { const c = await loadCore(); return c.types.slice(); }
    async function getAmenities(options) {
        const c = await loadCore(), o = options || {}, type = String(o.type || ''), status = String(o.status || ''), q = normalize(o.q || '');
        return c.amenities.filter(function (x) {
            if (type && x.amenity_type_ref !== type && !x.amenity_type_ref.endsWith('-' + type.replace(/_/g,'-'))) return false;
            if (status && x.status !== status) return false;
            if (q && !normalize([x.name,x.address].join(' ')).includes(q)) return false;
            return true;
        }).slice(0, limit(o.limit, 100));
    }
    async function getServices(options) {
        const c = await loadCore(), o = options || {}, type = String(o.type || ''), status = String(o.status || ''), q = normalize(o.q || '');
        return c.services.filter(function (x) {
            if (type && x.service_type !== type) return false;
            if (status && x.status !== status) return false;
            if (q && !normalize([x.title,x.provider_name].join(' ')).includes(q)) return false;
            return true;
        }).slice(0, limit(o.limit, 100));
    }
    async function getReviewQueue(options) {
        const c = await loadCore(), o = options || {}, region = normalize(o.region || ''), q = normalize(o.q || '');
        return c.review.filter(function (x) {
            if (region && normalize(x.region_text) !== region) return false;
            if (!q) return true;
            const contacts = x.contacts || {};
            return normalize([x.name,x.region_text,x.organisation_text,contacts.phone,contacts.email,contacts.website].join(' ')).includes(q);
        }).slice(0, limit(o.limit, 200));
    }
    async function getConflicts() { const c = await loadCore(); return c.conflicts.slice(); }
    async function getReviewRegions() {
        const c = await loadCore();
        return Object.keys(c.index.review_by_region || {}).sort(function (a,b) { return a.localeCompare(b,'ru'); });
    }
    async function getById(kind, id) {
        const c = await loadCore(); const hit = c.byId.get(String(id || ''));
        return hit && (!kind || hit.kind === kind) ? hit.item : null;
    }
    async function getBySlug(slug) { const c = await loadCore(); const id = c.bySlug.get(String(slug || '')); return id ? getById('', id) : null; }
    async function getRelations(ref) {
        const c = await loadCore(); const kind = String(ref && ref.kind || ''), id = String(ref && ref.id || '');
        return c.relations.filter(function (r) { return (r.from.kind === kind && r.from.id === id) || (r.to.kind === kind && r.to.id === id); });
    }
    async function getForPlace(placeId) {
        const c = await loadCore(), ids = new Set();
        c.relations.forEach(function (r) { if (r.to.kind === 'place' && r.to.id === placeId && (r.from.kind === 'amenity' || r.from.kind === 'service')) ids.add(r.from.id); });
        return Array.from(ids).map(function (id) { return c.byId.get(id); }).filter(Boolean).map(function (x) { return {kind:x.kind,item:x.item}; });
    }
    async function getForRoute(routeId) {
        const c = await loadCore(), ids = new Set();
        c.relations.forEach(function (r) { if (r.to.kind === 'route' && r.to.id === routeId && (r.from.kind === 'amenity' || r.from.kind === 'service')) ids.add(r.from.id); });
        return Array.from(ids).map(function (id) { return c.byId.get(id); }).filter(Boolean).map(function (x) { return {kind:x.kind,item:x.item}; });
    }
    function getDetailUrl(item) { const siteRoot = new URL('../', scriptUrl); return item && item.canonical_path ? new URL(item.canonical_path, siteRoot).href : new URL('pilgrim/infrastructure.html', siteRoot).href; }

    global.PravmirPilgrim = Object.freeze({
        version:'1.27.0', init:function(){return loadCore().then(getStats)}, getStats:getStats,
        getTrustSummary:getTrustSummary, getAmenityTypes:getAmenityTypes, getAmenities:getAmenities, getServices:getServices, getReviewQueue:getReviewQueue, getReviewRegions:getReviewRegions, getConflicts:getConflicts,
        getById:getById, getBySlug:getBySlug, getRelations:getRelations, getForPlace:getForPlace, getForRoute:getForRoute, getDetailUrl:getDetailUrl
    });
})(window);
