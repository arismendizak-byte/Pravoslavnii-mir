(function (global) {
    'use strict';

    const ALL = 'all';

    function normalize(value) {
        return String(value == null ? '' : value).trim();
    }

    function defaultState() {
        return { q: '', region: ALL, type: ALL, status: ALL };
    }

    function parse(search) {
        const state = defaultState();
        const params = new URLSearchParams(search || '');
        state.q = normalize(params.get('q'));
        state.region = normalize(params.get('region')) || ALL;
        state.type = normalize(params.get('type')) || ALL;
        state.status = normalize(params.get('status')) || ALL;
        return state;
    }

    function serialize(state) {
        const params = new URLSearchParams();
        if (state.q) params.set('q', state.q);
        if (state.region && state.region !== ALL) params.set('region', state.region);
        if (state.type && state.type !== ALL) params.set('type', state.type);
        if (state.status && state.status !== ALL) params.set('status', state.status);
        return params;
    }

    function filterItems(items, state, allowedIds) {
        const idSet = allowedIds instanceof Set ? allowedIds : null;
        return items.filter(function (item) {
            if (idSet && !idSet.has(item.id)) return false;
            if (state.region !== ALL && item.region !== state.region) return false;
            if (state.type !== ALL && item.place_type !== state.type) return false;
            if (state.status !== ALL && item.status !== state.status) return false;
            return true;
        });
    }

    function options(items) {
        const regions = new Set();
        const types = new Set();
        const statuses = new Set();
        items.forEach(function (item) {
            if (item.region) regions.add(item.region);
            if (item.place_type) types.add(item.place_type);
            if (item.status) statuses.add(item.status);
        });
        return {
            regions: Array.from(regions).sort(function (a, b) { return a.localeCompare(b, 'ru'); }),
            types: Array.from(types).sort(),
            statuses: Array.from(statuses).sort()
        };
    }

    function coordinateItems(items) {
        return items.filter(function (item) {
            const lat = Number(item.lat);
            const lon = Number(item.lon);
            return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
        });
    }

    function bounds(items) {
        const valid = coordinateItems(items);
        if (!valid.length) return null;
        let minLat = Infinity;
        let minLon = Infinity;
        let maxLat = -Infinity;
        let maxLon = -Infinity;
        valid.forEach(function (item) {
            const lat = Number(item.lat);
            const lon = Number(item.lon);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);
        });
        return [[minLat, minLon], [maxLat, maxLon]];
    }

    global.PravmirMapDiscovery = Object.freeze({
        ALL: ALL,
        defaultState: defaultState,
        parse: parse,
        serialize: serialize,
        filterItems: filterItems,
        coordinateItems: coordinateItems,
        bounds: bounds,
        options: options
    });
})(window);
