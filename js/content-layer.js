(function (global) {
    'use strict';

    const scriptUrl = (function () {
        if (global.__PRAVMIR_CONTENT_LAYER_URL__) {
            return new URL(global.__PRAVMIR_CONTENT_LAYER_URL__, global.location && global.location.href ? global.location.href : undefined);
        }
        if (global.document && global.document.currentScript && global.document.currentScript.src) {
            return new URL(global.document.currentScript.src);
        }
        const href = global.location && global.location.href ? global.location.href : 'http://localhost/index.html';
        return new URL('js/content-layer.js', href);
    })();
    const siteRoot = new URL('../', scriptUrl);
    const generatedRoot = new URL('data/generated/', siteRoot);
    const STOPWORDS = new Set(['в','во','на','с','со','и','к','ко','у','по','при','из','за','для','от','до','о','об','а','но','как','что','г','год','года','рф','россия']);
    let corePromise = null;

    function fetchJson(name) {
        const url = new URL(name, generatedRoot);
        return fetch(url).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
            return response.json();
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

    function tokens(value) {
        return normalizeText(value).split(' ').filter(function (token) {
            return token.length >= 2 && !STOPWORDS.has(token);
        });
    }

    function assertPayload(payload, sourceHash, key, label) {
        if (!payload || payload.source_snapshot_sha256 !== sourceHash || !Array.isArray(payload[key])) {
            throw new Error('M5 Content Core malformed payload: ' + label);
        }
    }

    function loadCore() {
        if (corePromise) return corePromise;
        corePromise = Promise.all([
            fetchJson('content_items.json'),
            fetchJson('content_authors.json'),
            fetchJson('content_categories.json'),
            fetchJson('content_bodies.json'),
            fetchJson('events.json'),
            fetchJson('calendar_entries.json'),
            fetchJson('pilgrim_services.json'),
            fetchJson('content_links.json'),
            fetchJson('content_index.json')
        ]).then(function (parts) {
            const content = parts[0];
            const authors = parts[1];
            const categories = parts[2];
            const bodies = parts[3];
            const events = parts[4];
            const calendar = parts[5];
            const pilgrim = parts[6];
            const links = parts[7];
            const index = parts[8];
            const sourceHash = index.source_snapshot_sha256;
            assertPayload(content, sourceHash, 'items', 'content_items');
            assertPayload(authors, sourceHash, 'authors', 'content_authors');
            assertPayload(categories, sourceHash, 'categories', 'content_categories');
            assertPayload(bodies, sourceHash, 'bodies', 'content_bodies');
            assertPayload(events, sourceHash, 'events', 'events');
            assertPayload(calendar, sourceHash, 'entries', 'calendar_entries');
            assertPayload(pilgrim, sourceHash, 'services', 'pilgrim_services');
            assertPayload(links, sourceHash, 'links', 'content_links');

            const byId = new Map();
            function register(kind, rows) {
                rows.forEach(function (row) {
                    if (byId.has(row.id)) throw new Error('Duplicate Content Core ID: ' + row.id);
                    byId.set(row.id, { kind: kind, row: row });
                });
            }
            register('content', content.items);
            register('event', events.events);
            register('calendar_entry', calendar.entries);
            register('pilgrim_service', pilgrim.services);
            register('author', authors.authors);

            const bySlug = new Map();
            content.items.concat(events.events).forEach(function (row) {
                if (!row.slug) return;
                if (bySlug.has(row.slug)) throw new Error('Duplicate Content Core slug: ' + row.slug);
                bySlug.set(row.slug, row.id);
            });
            const authorsById = new Map(authors.authors.map(function (row) { return [row.id, row]; }));
            const categoriesById = new Map(categories.categories.map(function (row) { return [row.id, row]; }));
            const bodiesById = new Map(bodies.bodies.map(function (row) { return [row.content_id, row]; }));
            const linksByRef = new Map();
            links.links.forEach(function (link) {
                [link.from, link.to].forEach(function (ref) {
                    const key = ref.kind + ':' + ref.id;
                    if (!linksByRef.has(key)) linksByRef.set(key, []);
                    linksByRef.get(key).push(link);
                });
            });
            return {
                sourceHash: sourceHash,
                content: content.items,
                authors: authors.authors,
                categories: categories.categories,
                bodies: bodies.bodies,
                events: events.events,
                calendar: calendar.entries,
                pilgrim: pilgrim.services,
                links: links.links,
                index: index,
                byId: byId,
                bySlug: bySlug,
                authorsById: authorsById,
                categoriesById: categoriesById,
                bodiesById: bodiesById,
                linksByRef: linksByRef
            };
        });
        return corePromise;
    }

    function clampLimit(value, fallback) {
        const n = Number(value);
        return Math.max(1, Math.min(500, Number.isFinite(n) ? n : fallback));
    }

    async function getStats() {
        const core = await loadCore();
        return Object.assign({}, core.index.counts, { source_snapshot_sha256: core.sourceHash });
    }

    async function getContentItems(options) {
        const core = await loadCore();
        const opts = options || {};
        const types = Array.isArray(opts.types) ? new Set(opts.types.map(String)) : null;
        const type = opts.type ? String(opts.type) : '';
        const tag = normalizeText(opts.tag || '');
        const authorRef = opts.author_ref ? String(opts.author_ref) : '';
        const categoryRef = opts.category_ref ? String(opts.category_ref) : '';
        const query = normalizeText(opts.q || '');
        const limit = clampLimit(opts.limit, 100);
        return core.content.filter(function (row) {
            if (types && !types.has(row.content_type)) return false;
            if (type && row.content_type !== type) return false;
            if (tag && !(row.tags || []).some(function (value) { return normalizeText(value) === tag; })) return false;
            if (authorRef && row.author_ref !== authorRef) return false;
            if (categoryRef && !(row.category_refs || []).includes(categoryRef)) return false;
            if (query) {
                const haystack = normalizeText([row.title, row.summary, row.author, row.publisher].concat(row.tags || []).join(' '));
                if (!query.split(' ').every(function (part) { return haystack.includes(part); })) return false;
            }
            return row.status === 'published';
        }).sort(function (a, b) {
            return String(b.published_on || '').localeCompare(String(a.published_on || '')) || a.title.localeCompare(b.title, 'ru');
        }).slice(0, limit);
    }

    async function getContentById(id) {
        const core = await loadCore();
        const hit = core.byId.get(String(id || ''));
        return hit && hit.kind === 'content' ? hit.row : null;
    }

    async function getContentBySlug(slug) {
        const core = await loadCore();
        const id = core.bySlug.get(String(slug || ''));
        return id ? getContentById(id) : null;
    }

    async function getAuthors() {
        const core = await loadCore();
        return core.authors.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    }

    async function getAuthorById(id) {
        const core = await loadCore();
        return core.authorsById.get(String(id || '')) || null;
    }

    async function getCategories() {
        const core = await loadCore();
        return core.categories.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    }

    async function getCategoryById(id) {
        const core = await loadCore();
        return core.categoriesById.get(String(id || '')) || null;
    }

    async function getArticleBody(ref) {
        const core = await loadCore();
        let id = String(ref || '');
        if (!id.startsWith('pm-content-')) {
            const bySlug = core.bySlug.get(id);
            if (bySlug) id = bySlug;
        }
        return core.bodiesById.get(id) || null;
    }

    async function getRelatedContent(ref, options) {
        const core = await loadCore();
        const opts = options || {};
        const item = typeof ref === 'string' ? (await getContentById(ref)) || (await getContentBySlug(ref)) : ref;
        if (!item) return [];
        const categorySet = new Set(item.category_refs || []);
        const tagSet = new Set((item.tags || []).map(normalizeText));
        return core.content.filter(function (candidate) {
            return candidate.id !== item.id && candidate.status === 'published';
        }).map(function (candidate) {
            const sharedCategories = (candidate.category_refs || []).filter(function (id) { return categorySet.has(id); });
            const sharedTags = (candidate.tags || []).filter(function (tag) { return tagSet.has(normalizeText(tag)); });
            return {
                item: candidate,
                score: sharedCategories.length * 10 + sharedTags.length,
                reason: sharedCategories.length ? 'shared_category' : (sharedTags.length ? 'shared_tag' : '')
            };
        }).filter(function (row) { return row.score > 0; })
            .sort(function (a, b) {
                return b.score - a.score || String(b.item.published_on || '').localeCompare(String(a.item.published_on || '')) || a.item.title.localeCompare(b.item.title, 'ru');
            }).slice(0, clampLimit(opts.limit, 4));
    }

    async function getEvents(options) {
        if (global.PravmirEvents && global.PravmirEvents.getEvents) return global.PravmirEvents.getEvents(options || {});
        const core = await loadCore();
        const opts = options || {};
        const from = opts.from ? String(opts.from) : '';
        const to = opts.to ? String(opts.to) : '';
        const type = opts.type ? String(opts.type) : '';
        const limit = clampLimit(opts.limit, 100);
        return core.events.filter(function (row) {
            const start = String(row.starts_at || '').slice(0, 10);
            if (from && start < from) return false;
            if (to && start > to) return false;
            if (type && row.event_type !== type) return false;
            return true;
        }).sort(function (a, b) { return a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title, 'ru'); }).slice(0, limit);
    }

    async function getCalendarEntries(options) {
        const core = await loadCore();
        const opts = options || {};
        const from = opts.from ? String(opts.from) : '';
        const to = opts.to ? String(opts.to) : '';
        const kind = opts.kind ? String(opts.kind) : '';
        const year = opts.year ? Number(opts.year) : null;
        const limit = clampLimit(opts.limit, 500);
        return core.calendar.filter(function (row) {
            if (from && row.date_end < from) return false;
            if (to && row.date_start > to) return false;
            if (kind && row.calendar_kind !== kind) return false;
            if (year && !(row.date_start.startsWith(String(year) + '-') || row.date_end.startsWith(String(year) + '-'))) return false;
            return true;
        }).slice(0, limit);
    }

    async function getCalendarEntriesForDate(dateValue) {
        const date = String(dateValue || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
        return getCalendarEntries({ from: date, to: date, limit: 100 });
    }

    async function getPilgrimServices(options) {
        const core = await loadCore();
        const opts = options || {};
        const region = normalizeText(opts.region || '');
        const query = normalizeText(opts.q || '');
        const limit = clampLimit(opts.limit, 200);
        return core.pilgrim.filter(function (row) {
            if (region && normalizeText(row.region_text) !== region) return false;
            if (query) {
                const haystack = normalizeText([row.name, row.organization, row.region_text, row.contacts && row.contacts.website].join(' '));
                if (!query.split(' ').every(function (part) { return haystack.includes(part); })) return false;
            }
            return true;
        }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); }).slice(0, limit);
    }

    function prefixPostings(search, token) {
        const exact = search.postings[token];
        if (exact) return exact;
        const result = [];
        for (let i = 0; i < search.terms.length; i += 1) {
            const term = search.terms[i];
            if (term.startsWith(token)) result.push.apply(result, search.postings[term] || []);
        }
        return result;
    }

    async function search(query, options) {
        const core = await loadCore();
        const opts = options || {};
        const queryTokens = tokens(query);
        if (!queryTokens.length) return [];
        const allowedKinds = Array.isArray(opts.kinds) && opts.kinds.length ? new Set(opts.kinds.map(String)) : null;
        const scores = new Map();
        queryTokens.forEach(function (token) {
            prefixPostings(core.index.search, token).forEach(function (ordinal) {
                scores.set(ordinal, (scores.get(ordinal) || 0) + 1);
            });
        });
        const docs = core.index.search.documents;
        const normalizedQuery = normalizeText(query);
        return Array.from(scores.entries()).map(function (entry) {
            const doc = docs[entry[0]];
            let score = entry[1] * 100;
            const title = normalizeText(doc.title);
            if (title === normalizedQuery) score += 1000;
            else if (title.startsWith(normalizedQuery)) score += 300;
            else if (title.includes(normalizedQuery)) score += 100;
            return { score: score, item: doc };
        }).filter(function (row) {
            return !allowedKinds || allowedKinds.has(row.item.kind);
        }).sort(function (a, b) {
            return b.score - a.score || a.item.title.localeCompare(b.item.title, 'ru');
        }).slice(0, clampLimit(opts.limit, 30)).map(function (row) { return row.item; });
    }

    async function getById(id) {
        const core = await loadCore();
        const hit = core.byId.get(String(id || ''));
        return hit ? { kind: hit.kind, item: hit.row } : null;
    }

    async function getLinksFor(ref) {
        const core = await loadCore();
        if (!ref || !ref.kind || !ref.id) return [];
        return (core.linksByRef.get(String(ref.kind) + ':' + String(ref.id)) || []).slice();
    }

    async function getRelated(ref) {
        const links = await getLinksFor(ref);
        return Promise.all(links.map(async function (link) {
            const isFrom = link.from.kind === ref.kind && link.from.id === ref.id;
            const target = isFrom ? link.to : link.from;
            return { link: link, target: target, resolved: await resolveReference(target) };
        }));
    }

    async function resolveReference(ref) {
        if (!ref || !ref.kind || !ref.id) return null;
        if (ref.kind === 'event' && global.PravmirEvents && global.PravmirEvents.getById) return global.PravmirEvents.getById(ref.id);
        if (['calendar_day','feast','saint','commemoration','fasting_rule','reading'].includes(ref.kind) && global.PravmirLiturgical && global.PravmirLiturgical.resolveReference) {
            return global.PravmirLiturgical.resolveReference(ref);
        }
        if (ref.kind === 'content' || ref.kind === 'event' || ref.kind === 'calendar_entry' || ref.kind === 'pilgrim_service' || ref.kind === 'author') {
            return getById(ref.id);
        }
        if (!global.PravmirData) return null;
        if (ref.kind === 'place' && global.PravmirData.getPlaceById) return global.PravmirData.getPlaceById(ref.id);
        if (ref.kind === 'entity' && global.PravmirData.getEntityById) return global.PravmirData.getEntityById(ref.id);
        if (ref.kind === 'route' && global.PravmirData.getRouteById) return global.PravmirData.getRouteById(ref.id);
        return null;
    }

    global.PravmirContent = Object.freeze({
        version: '1.21.0',
        compatibility: Object.freeze(['1.14.0', '1.13.0']),
        init: function () { return loadCore().then(getStats); },
        normalizeText: normalizeText,
        getStats: getStats,
        getContentItems: getContentItems,
        getContentById: getContentById,
        getContentBySlug: getContentBySlug,
        getAuthors: getAuthors,
        getAuthorById: getAuthorById,
        getCategories: getCategories,
        getCategoryById: getCategoryById,
        getArticleBody: getArticleBody,
        getRelatedContent: getRelatedContent,
        getEvents: getEvents,
        getCalendarEntries: getCalendarEntries,
        getCalendarEntriesForDate: getCalendarEntriesForDate,
        getPilgrimServices: getPilgrimServices,
        search: search,
        getById: getById,
        getLinksFor: getLinksFor,
        getRelated: getRelated,
        resolveReference: resolveReference
    });
})(window);
