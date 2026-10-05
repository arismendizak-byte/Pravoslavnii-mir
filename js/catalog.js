(function () {
    'use strict';

    const PAGE_SIZE = 60;
    const SEARCH_DEBOUNCE_MS = 180;
    const TYPE_ORDER = ['church', 'cathedral', 'chapel', 'monastery', 'skete', 'metochion', 'bell_tower', 'holy_spring', 'memorial', 'other', 'unknown'];
    const STATUS_ORDER = ['active', 'preserved', 'restoring', 'under_construction', 'inactive', 'ruined', 'lost', 'unknown'];

    let allData = [];
    let allById = new Map();
    let universe = { regions: [], types: [], statuses: [] };
    let state = { q: '', region: 'all', type: 'all', status: 'all', sort: 'name' };
    let queryCandidates = [];
    let queryRanks = new Map();
    let queryCacheKey = null;
    let filteredData = [];
    let renderedCount = 0;
    let requestSerial = 0;
    let searchTimer = null;
    let manualSort = false;

    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));

    function elements() {
        return {
            grid: document.getElementById('catalogGrid'),
            total: document.getElementById('catalogTotal'),
            search: document.getElementById('catalogSearch'),
            clear: document.getElementById('catalogSearchClear'),
            region: document.getElementById('catalogRegion'),
            reset: document.getElementById('catalogReset'),
            types: document.getElementById('catalogTypeFacets'),
            statuses: document.getElementById('catalogStatusFacets'),
            hint: document.getElementById('catalogFacetHint'),
            summary: document.getElementById('catalogSummary'),
            sort: document.getElementById('catalogSort'),
            loadMore: document.getElementById('catalogLoadMore')
        };
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
    }

    function formatObjectWord(value) {
        const n = Math.abs(Number(value) || 0) % 100;
        const n1 = n % 10;
        if (n > 10 && n < 20) return 'объектов';
        if (n1 === 1) return 'объект';
        if (n1 >= 2 && n1 <= 4) return 'объекта';
        return 'объектов';
    }

    function parseUrlState() {
        const params = new URLSearchParams(window.location.search);
        const q = String(params.get('q') || '').trim();
        const hasSort = params.has('sort');
        return {
            state: window.PravmirCatalogDiscovery.normalizeState({
                q: q,
                region: params.get('region') || 'all',
                type: params.get('type') || 'all',
                status: params.get('status') || 'all',
                sort: params.get('sort') || (q ? 'relevance' : 'name')
            }),
            hasSort: hasSort
        };
    }

    function validateState(input) {
        const next = window.PravmirCatalogDiscovery.normalizeState(input);
        if (next.region !== 'all' && !universe.regions.includes(next.region)) next.region = 'all';
        if (next.type !== 'all' && !universe.types.includes(next.type)) next.type = 'all';
        if (next.status !== 'all' && !universe.statuses.includes(next.status)) next.status = 'all';
        return next;
    }

    function syncUrl() {
        const url = new URL(window.location.href);
        url.search = '';
        const params = url.searchParams;
        if (state.q) params.set('q', state.q);
        if (state.region !== 'all') params.set('region', state.region);
        if (state.type !== 'all') params.set('type', state.type);
        if (state.status !== 'all') params.set('status', state.status);
        const defaultSort = state.q ? 'relevance' : 'name';
        if (state.sort !== defaultSort) params.set('sort', state.sort);
        window.history.replaceState(null, '', url.pathname + (params.toString() ? '?' + params.toString() : '') + url.hash);
    }

    function syncControls() {
        const el = elements();
        if (el.search) el.search.value = state.q;
        if (el.clear) el.clear.hidden = !state.q;
        if (el.region) el.region.value = state.region;
        if (el.sort) el.sort.value = state.sort;
    }

    function orderValues(values, preferred) {
        return values.slice().sort(function (a, b) {
            const ai = preferred.indexOf(a);
            const bi = preferred.indexOf(b);
            if (ai !== -1 || bi !== -1) {
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
            }
            return String(a).localeCompare(String(b), 'ru');
        });
    }

    function renderRegionOptions(counts) {
        const select = document.getElementById('catalogRegion');
        if (!select) return;
        const selected = state.region;
        const rows = ['<option value="all">Все регионы (' + formatNumber(counts.allRegion) + ')</option>'];
        universe.regions.forEach(function (region) {
            const count = counts.region.get(region) || 0;
            const disabled = count === 0 && region !== selected ? ' disabled' : '';
            rows.push('<option value="' + esc(region) + '"' + disabled + '>' + esc(region) + ' (' + formatNumber(count) + ')</option>');
        });
        select.innerHTML = rows.join('');
        select.value = selected;
    }

    function facetButton(kind, value, label, count, active, disabled) {
        return '<button type="button" class="facet-btn' + (active ? ' active' : '') + '" data-facet="' + kind + '" data-value="' + esc(value) + '" aria-pressed="' + (active ? 'true' : 'false') + '"' + (disabled ? ' disabled' : '') + '>' + esc(label) + '<span class="facet-count">' + formatNumber(count) + '</span></button>';
    }

    function renderFacets(counts) {
        const typeWrap = document.getElementById('catalogTypeFacets');
        const statusWrap = document.getElementById('catalogStatusFacets');
        if (typeWrap) {
            const rows = [facetButton('type', 'all', 'Все', counts.allType, state.type === 'all', false)];
            orderValues(universe.types, TYPE_ORDER).forEach(function (type) {
                const count = counts.type.get(type) || 0;
                rows.push(facetButton('type', type, window.PravmirData.typeLabel(type), count, state.type === type, count === 0 && state.type !== type));
            });
            typeWrap.innerHTML = rows.join('');
        }
        if (statusWrap) {
            const rows = [facetButton('status', 'all', 'Все', counts.allStatus, state.status === 'all', false)];
            orderValues(universe.statuses, STATUS_ORDER).forEach(function (status) {
                const count = counts.status.get(status) || 0;
                rows.push(facetButton('status', status, window.PravmirData.statusLabel(status), count, state.status === status, count === 0 && state.status !== status));
            });
            statusWrap.innerHTML = rows.join('');
        }
        renderRegionOptions(counts);
    }

    async function getQueryCandidates(query) {
        const normalized = window.PravmirData.normalizeText(query);
        if (queryCacheKey === normalized) return { items: queryCandidates, ranks: queryRanks };
        queryCacheKey = normalized;
        queryRanks = new Map();
        if (!normalized) {
            queryCandidates = allData.slice();
            return { items: queryCandidates, ranks: queryRanks };
        }
        const matches = await window.PravmirData.search(query, { limit: 'all' });
        const seen = new Set();
        queryCandidates = [];
        matches.forEach(function (match, index) {
            const item = allById.get(match.id);
            if (!item || seen.has(item.id)) return;
            seen.add(item.id);
            queryRanks.set(item.id, index);
            queryCandidates.push(item);
        });
        return { items: queryCandidates, ranks: queryRanks };
    }

    function renderSummary() {
        const summary = document.getElementById('catalogSummary');
        const hint = document.getElementById('catalogFacetHint');
        if (summary) {
            const query = state.q ? ' по запросу <span class="catalog-query-note">«' + esc(state.q) + '»</span>' : '';
            summary.innerHTML = '<strong>' + formatNumber(filteredData.length) + '</strong> ' + formatObjectWord(filteredData.length) + query;
        }
        if (hint) {
            const active = [state.region !== 'all', state.type !== 'all', state.status !== 'all'].filter(Boolean).length;
            hint.textContent = active ? 'Активных фильтров: ' + active + '. Можно добавить ещё.' : 'Фильтры можно комбинировать.';
        }
    }

    function cardHtml(item) {
        const detail = window.PravmirData.getDetailUrl(item);
        const category = item.category || window.PravmirData.typeLabel(item.place_type);
        const status = item.status && item.status !== 'unknown' ? (item.status_label || window.PravmirData.statusLabel(item.status)) : '';
        const locationParts = [item.region, item.locality].filter(Boolean);
        const hasMap = Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon));
        return '<article class="catalog-item" data-place-id="' + esc(item.id) + '">' +
            '<div class="catalog-item-meta">' +
                '<span class="catalog-badge catalog-badge-type">' + esc(category) + '</span>' +
                (status ? '<span class="catalog-badge catalog-badge-status">' + esc(status) + '</span>' : '') +
            '</div>' +
            '<h2 class="catalog-item-name">' + esc(item.name) + '</h2>' +
            '<div class="catalog-item-location"><span class="catalog-location-icon">' + (window.PravmirUI ? window.PravmirUI.icon('pin') : '') + '</span><strong>' + esc(locationParts.join(' · ') || 'Регион не указан') + '</strong></div>' +
            '<div class="catalog-item-spacer"></div>' +
            '<div class="catalog-item-actions">' +
                (detail ? '<a class="catalog-detail-link" href="' + esc(detail) + '">Открыть карточку →</a>' : '<span></span>') +
                (hasMap ? '<button class="catalog-map-btn" type="button" data-map-id="' + esc(item.id) + '">На карте</button>' : '') +
            '</div>' +
        '</article>';
    }

    function updateLoadMore() {
        const wrap = document.getElementById('catalogLoadMore');
        if (!wrap) return;
        const button = wrap.querySelector('button');
        const count = wrap.querySelector('.catalog-count');
        if (!filteredData.length) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = 'block';
        if (button) button.style.display = renderedCount < filteredData.length ? 'inline-block' : 'none';
        if (count) count.textContent = 'Показано ' + formatNumber(renderedCount) + ' из ' + formatNumber(filteredData.length);
    }

    function renderNextPage(reset) {
        const grid = document.getElementById('catalogGrid');
        if (!grid) return;
        if (reset) {
            grid.innerHTML = '';
            renderedCount = 0;
        }
        if (!filteredData.length) {
            grid.innerHTML = '<div class="no-results"><span class="big-icon">' + (window.PravmirUI ? window.PravmirUI.icon('compass') : '') + '</span><strong>Ничего не найдено</strong>Измените запрос или снимите один из фильтров.</div>';
            updateLoadMore();
            return;
        }
        const next = filteredData.slice(renderedCount, renderedCount + PAGE_SIZE);
        grid.insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
        renderedCount += next.length;
        updateLoadMore();
    }

    async function applyState(options) {
        const opts = options || {};
        const serial = ++requestSerial;
        const el = elements();
        if (el.grid) el.grid.setAttribute('aria-busy', 'true');
        if (state.q && el.summary) el.summary.textContent = 'Ищем по единому индексу…';
        state = validateState(state);
        syncControls();
        if (opts.updateUrl !== false) syncUrl();

        const result = await getQueryCandidates(state.q);
        if (serial !== requestSerial) return;
        const counts = window.PravmirCatalogDiscovery.facetCounts(result.items, state);
        renderFacets(counts);
        filteredData = window.PravmirCatalogDiscovery.filterItems(result.items, state);
        filteredData = window.PravmirCatalogDiscovery.sortItems(filteredData, state, result.ranks);
        renderSummary();
        renderNextPage(true);
        if (el.grid) el.grid.setAttribute('aria-busy', 'false');
    }

    function updateSearch(value) {
        const previousHadQuery = Boolean(state.q);
        state.q = String(value || '').trim();
        if (!manualSort && previousHadQuery !== Boolean(state.q)) {
            state.sort = state.q ? 'relevance' : 'name';
        }
        const clear = document.getElementById('catalogSearchClear');
        if (clear) clear.hidden = !state.q;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { applyState(); }, SEARCH_DEBOUNCE_MS);
    }

    function openOnMap(item) {
        const target = window.PravmirData.toMapTarget(item);
        if (!target) return;
        sessionStorage.setItem('mapTarget', JSON.stringify(target));
        window.location.href = window.PravmirData.mapUrl({ q: state.q, region: state.region, type: state.type, status: state.status });
    }

    function bindEvents() {
        const el = elements();
        if (el.search) el.search.addEventListener('input', function () { updateSearch(this.value); });
        if (el.clear) el.clear.addEventListener('click', function () {
            if (el.search) {
                el.search.value = '';
                el.search.focus();
            }
            updateSearch('');
        });
        if (el.region) el.region.addEventListener('change', function () {
            state.region = this.value || 'all';
            applyState();
        });
        if (el.sort) el.sort.addEventListener('change', function () {
            manualSort = true;
            state.sort = this.value;
            applyState();
        });
        if (el.reset) el.reset.addEventListener('click', function () {
            manualSort = false;
            state = { q: '', region: 'all', type: 'all', status: 'all', sort: 'name' };
            queryCacheKey = null;
            applyState();
        });
        [el.types, el.statuses].forEach(function (wrap) {
            if (!wrap) return;
            wrap.addEventListener('click', function (event) {
                const button = event.target.closest('[data-facet]');
                if (!button || button.disabled) return;
                const facet = button.dataset.facet;
                state[facet] = button.dataset.value || 'all';
                applyState();
            });
        });
        if (el.grid) el.grid.addEventListener('click', function (event) {
            const button = event.target.closest('[data-map-id]');
            if (!button) return;
            const item = allById.get(button.dataset.mapId);
            if (item) openOnMap(item);
        });
        if (el.loadMore) {
            const button = el.loadMore.querySelector('button');
            if (button) button.addEventListener('click', function () { renderNextPage(false); });
        }
        window.addEventListener('popstate', function () {
            const parsed = parseUrlState();
            manualSort = parsed.hasSort;
            state = validateState(parsed.state);
            queryCacheKey = null;
            applyState({ updateUrl: false });
        });
    }

    async function loadCatalogData() {
        const el = elements();
        if (!el.grid || !window.PravmirData || !window.PravmirCatalogDiscovery) return;
        try {
            allData = (await window.PravmirData.getCatalogPlaces()).filter(function (item) {
                return item && item.id && item.name && item.region;
            });
            allById = new Map(allData.map(function (item) { return [item.id, item]; }));
            universe = window.PravmirCatalogDiscovery.options(allData);

            const parsed = parseUrlState();
            manualSort = parsed.hasSort;
            state = validateState(parsed.state);
            if (el.total) el.total.innerHTML = '<strong>' + formatNumber(allData.length) + '</strong><span>' + formatObjectWord(allData.length) + ' в каталоге</span>';

            bindEvents();
            await applyState();
        } catch (error) {
            console.error('Ошибка загрузки discovery-каталога:', error);
            el.grid.innerHTML = '<div class="no-results"><span class="big-icon">' + (window.PravmirUI ? window.PravmirUI.icon('info') : '') + '</span><strong>Каталог не загрузился</strong><span>Данные временно недоступны.</span><button class="catalog-retry" id="catalogRetry" type="button">Попробовать ещё раз</button></div>';
            el.grid.setAttribute('aria-busy', 'false');
            if (el.summary) el.summary.textContent = 'Ошибка загрузки данных';
            const retry = document.getElementById('catalogRetry');
            if (retry) retry.addEventListener('click', loadCatalogData, { once: true });
        }
    }

    document.addEventListener('DOMContentLoaded', loadCatalogData);
})();
