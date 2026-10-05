(function (global) {
    'use strict';

    const scriptUrl = (function () {
        if (global.__PRAVMIR_NEWS_LAYER_URL__) {
            return new URL(global.__PRAVMIR_NEWS_LAYER_URL__, global.location && global.location.href ? global.location.href : undefined);
        }
        if (global.document && global.document.currentScript && global.document.currentScript.src) {
            return new URL(global.document.currentScript.src);
        }
        return new URL('js/news-layer.js', global.location && global.location.href ? global.location.href : 'http://localhost/index.html');
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
        return String(value == null ? '' : value)
            .normalize('NFKC')
            .toLocaleLowerCase('ru-RU')
            .replace(/ё/g, 'е')
            .replace(/[^0-9a-zа-я]+/giu, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    }

    function limit(value, fallback) {
        const number = Number(value);
        return Math.max(1, Math.min(500, Number.isFinite(number) ? Math.floor(number) : fallback));
    }

    function assertPayload(payload, snapshotHash, key, name) {
        if (!payload || payload.source_snapshot_sha256 !== snapshotHash || !Array.isArray(payload[key])) {
            throw new Error('PravmirNews malformed payload: ' + name);
        }
    }

    function normalizeDate(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? match[0] : null;
    }

    function loadCore() {
        if (corePromise) return corePromise;
        corePromise = Promise.all([
            fetchJson('news_sources.json'),
            fetchJson('news_records.json'),
            fetchJson('news_relations.json'),
            fetchJson('news_review_queue.json'),
            fetchJson('news_rejected.json'),
            fetchJson('news_index.json'),
            fetchJson('news_report.json')
        ]).then(function (parts) {
            const sources = parts[0], news = parts[1], relations = parts[2], review = parts[3], rejected = parts[4], index = parts[5], report = parts[6];
            const snapshotHash = index.source_snapshot_sha256;
            if (!snapshotHash || report.source_snapshot_sha256 !== snapshotHash) throw new Error('PravmirNews snapshot mismatch');
            assertPayload(sources, snapshotHash, 'sources', 'news_sources');
            assertPayload(news, snapshotHash, 'news', 'news_records');
            assertPayload(relations, snapshotHash, 'relations', 'news_relations');
            assertPayload(review, snapshotHash, 'items', 'news_review_queue');
            assertPayload(rejected, snapshotHash, 'items', 'news_rejected');

            const byId = new Map(news.news.map(function (item) { return [item.id, item]; }));
            const bySlug = new Map(news.news.filter(function (item) { return item.slug; }).map(function (item) { return [item.slug, item.id]; }));
            const relByNews = new Map();
            const relByTarget = new Map();
            relations.relations.forEach(function (relation) {
                if (relation.from && relation.from.kind === 'news') {
                    if (!relByNews.has(relation.from.id)) relByNews.set(relation.from.id, []);
                    relByNews.get(relation.from.id).push(relation);
                }
                if (relation.to) {
                    const key = relation.to.kind + ':' + relation.to.id;
                    if (!relByTarget.has(key)) relByTarget.set(key, []);
                    relByTarget.get(key).push(relation);
                }
            });
            return {
                snapshotHash,
                sources: sources.sources,
                news: news.news,
                relations: relations.relations,
                review: review.items,
                rejected: rejected.items,
                index,
                report,
                byId,
                bySlug,
                relByNews,
                relByTarget
            };
        }).catch(function (error) {
            corePromise = null;
            throw error;
        });
        return corePromise;
    }

    async function getStats() {
        const core = await loadCore();
        return Object.assign({}, core.index.counts, { source_snapshot_sha256: core.snapshotHash });
    }

    async function getSources() {
        return (await loadCore()).sources.slice();
    }

    async function getNews(options) {
        const core = await loadCore();
        const opts = options || {};
        const query = normalize(opts.q || '');
        const status = String(opts.status || '');
        const publisher = normalize(opts.publisher || '');
        return core.news.filter(function (item) {
            if (status && item.status !== status) return false;
            if (publisher && !normalize(item.publisher).includes(publisher)) return false;
            if (query && !normalize([item.title, item.summary, item.publisher].join(' ')).includes(query)) return false;
            return true;
        }).sort(function (a, b) {
            return String(b.published_at).localeCompare(String(a.published_at));
        }).slice(0, limit(opts.limit, 100));
    }

    async function getForDate(value, options) {
        const date = normalizeDate(value);
        if (!date) throw new Error('PravmirNews: invalid date');
        const core = await loadCore();
        const max = limit((options || {}).limit, 3);
        const published = core.news.filter(function (item) {
            return item.status === 'published' && item.verification_status === 'source_verified';
        }).sort(function (a, b) {
            return String(b.published_at).localeCompare(String(a.published_at));
        });
        const sameDay = published.filter(function (item) { return String(item.published_at).slice(0, 10) === date; });
        if (sameDay.length) return { date, mode: 'same_day', news: sameDay.slice(0, max) };
        const latestBefore = published.filter(function (item) { return String(item.published_at).slice(0, 10) < date; });
        return { date, mode: latestBefore.length ? 'latest_before' : 'none', news: latestBefore.slice(0, max) };
    }

    async function getReviewQueue(options) {
        const core = await loadCore();
        const opts = options || {};
        const query = normalize(opts.q || '');
        const year = String(opts.year || '');
        return core.review.filter(function (item) {
            if (year && String(item.published_on || '').slice(0, 4) !== year) return false;
            if (query && !normalize([item.title, item.summary, item.publisher_text].join(' ')).includes(query)) return false;
            return true;
        }).sort(function (a, b) {
            return String(b.published_on || '').localeCompare(String(a.published_on || ''));
        }).slice(0, limit(opts.limit, 200));
    }

    async function getReviewYears() {
        const core = await loadCore();
        return Object.keys(core.index.review_by_year || {}).sort().reverse();
    }

    async function getById(id) {
        return (await loadCore()).byId.get(String(id || '')) || null;
    }

    async function getBySlug(slug) {
        const core = await loadCore();
        const id = core.bySlug.get(String(slug || ''));
        return id ? core.byId.get(id) || null : null;
    }

    async function getRelations(newsId) {
        const core = await loadCore();
        return (core.relByNews.get(String(newsId || '')) || []).slice();
    }

    async function getRelatedNews(ref, options) {
        if (!ref || !ref.kind || !ref.id) return [];
        const core = await loadCore();
        const relations = core.relByTarget.get(String(ref.kind) + ':' + String(ref.id)) || [];
        const ids = Array.from(new Set(relations.map(function (relation) { return relation.from.id; })));
        return ids.map(function (id) { return core.byId.get(id); }).filter(Boolean).sort(function (a, b) {
            return String(b.published_at).localeCompare(String(a.published_at));
        }).slice(0, limit((options || {}).limit, 100));
    }

    async function getTrustSummary() {
        const core = await loadCore();
        const relationTopology = {};
        core.relations.forEach(function (relation) {
            const key = String(relation.from && relation.from.kind) + '→' + String(relation.to && relation.to.kind) + ':' + String(relation.relation_type || '');
            relationTopology[key] = (relationTopology[key] || 0) + 1;
        });
        return {
            source_snapshot_sha256: core.snapshotHash,
            canonical_news: core.news.length,
            source_verified_news: core.news.filter(function (item) { return item.verification_status === 'source_verified'; }).length,
            legacy_review_items: core.review.length,
            rejected: core.rejected.length,
            explicit_relations: core.relations.length,
            inferred_relations: Number(core.report.inferred_relations_created || 0),
            organisation_entities: Number(core.report.organisation_entities_created || 0),
            relation_topology: relationTopology
        };
    }

    function getDetailUrl(item) {
        const siteRoot = new URL('../', scriptUrl);
        return item && item.canonical_path ? new URL(item.canonical_path, siteRoot).href : new URL('news.html', siteRoot).href;
    }

    global.PravmirNews = Object.freeze({
        version: '1.31.0',
        init: function () { return loadCore().then(getStats); },
        getStats,
        getSources,
        getNews,
        getForDate,
        getReviewQueue,
        getReviewYears,
        getById,
        getBySlug,
        getRelations,
        getRelatedNews,
        getTrustSummary,
        getDetailUrl
    });
})(window);
