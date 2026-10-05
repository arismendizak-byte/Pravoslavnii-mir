(function (global) {
    'use strict';

    const ALLOWED_SORTS = new Set(['relevance', 'name', 'region', 'quality']);

    function normalizeState(input) {
        const state = input || {};
        return {
            q: String(state.q || '').trim(),
            region: String(state.region || 'all'),
            type: String(state.type || 'all'),
            status: String(state.status || 'all'),
            sort: ALLOWED_SORTS.has(String(state.sort || '')) ? String(state.sort) : 'relevance'
        };
    }

    function matches(item, state, ignoredFacet) {
        if (!item) return false;
        if (ignoredFacet !== 'region' && state.region !== 'all' && item.region !== state.region) return false;
        if (ignoredFacet !== 'type' && state.type !== 'all' && item.place_type !== state.type) return false;
        if (ignoredFacet !== 'status' && state.status !== 'all' && item.status !== state.status) return false;
        return true;
    }

    function filterItems(items, stateInput) {
        const state = normalizeState(stateInput);
        return items.filter(function (item) { return matches(item, state, null); });
    }

    function countBy(items, field, state, ignoredFacet) {
        const counts = new Map();
        items.forEach(function (item) {
            if (!matches(item, state, ignoredFacet)) return;
            const value = item[field] || 'unknown';
            counts.set(value, (counts.get(value) || 0) + 1);
        });
        return counts;
    }

    function countMatching(items, state, ignoredFacet) {
        let count = 0;
        items.forEach(function (item) {
            if (matches(item, state, ignoredFacet)) count += 1;
        });
        return count;
    }

    function facetCounts(items, stateInput) {
        const state = normalizeState(stateInput);
        return {
            region: countBy(items, 'region', state, 'region'),
            type: countBy(items, 'place_type', state, 'type'),
            status: countBy(items, 'status', state, 'status'),
            allRegion: countMatching(items, state, 'region'),
            allType: countMatching(items, state, 'type'),
            allStatus: countMatching(items, state, 'status')
        };
    }

    function qualityValue(item) {
        const value = Number(item && item.quality_score);
        return Number.isFinite(value) ? value : -1;
    }

    function sortItems(items, stateInput, relevanceRanks) {
        const state = normalizeState(stateInput);
        const ranks = relevanceRanks || new Map();
        return items.slice().sort(function (a, b) {
            if (state.sort === 'quality') {
                const qualityDiff = qualityValue(b) - qualityValue(a);
                if (qualityDiff) return qualityDiff;
            } else if (state.sort === 'region') {
                const regionDiff = String(a.region || '').localeCompare(String(b.region || ''), 'ru');
                if (regionDiff) return regionDiff;
            } else if (state.sort === 'relevance' && state.q) {
                const rankA = ranks.has(a.id) ? ranks.get(a.id) : Number.MAX_SAFE_INTEGER;
                const rankB = ranks.has(b.id) ? ranks.get(b.id) : Number.MAX_SAFE_INTEGER;
                if (rankA !== rankB) return rankA - rankB;
            }
            return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
        });
    }

    function options(items) {
        const regions = Array.from(new Set(items.map(function (item) { return item.region; }).filter(Boolean)))
            .sort(function (a, b) { return a.localeCompare(b, 'ru'); });
        const types = Array.from(new Set(items.map(function (item) { return item.place_type; }).filter(Boolean)))
            .sort();
        const statuses = Array.from(new Set(items.map(function (item) { return item.status; }).filter(Boolean)))
            .sort();
        return { regions: regions, types: types, statuses: statuses };
    }

    const api = Object.freeze({
        normalizeState: normalizeState,
        filterItems: filterItems,
        facetCounts: facetCounts,
        sortItems: sortItems,
        options: options
    });

    global.PravmirCatalogDiscovery = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
