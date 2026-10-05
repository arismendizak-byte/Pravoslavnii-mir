(function () {
    'use strict';

    const input = document.querySelector('.search-bar input');
    const button = document.querySelector('.search-bar .btn-search');
    const bar = document.querySelector('.search-bar');
    if (!input || !button || !bar || !window.PravmirData) return;

    const results = document.createElement('div');
    results.id = 'homeSearchResults';
    results.className = 'home-search-results';
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', 'Результаты поиска');
    bar.appendChild(results);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', results.id);
    input.setAttribute('aria-expanded', 'false');

    let lastPlaces = [];
    let activeIndex = -1;
    let requestSeq = 0;
    let debounceTimer = null;

    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));

    function icon(name) {
        return window.PravmirUI ? window.PravmirUI.icon(name) : '';
    }

    function iconForPlace(item) {
        if (item.place_type === 'monastery' || item.place_type === 'skete' || item.place_type === 'metochion') return 'cross';
        if (item.place_type === 'holy_spring') return 'pin';
        return 'cross';
    }

    function setOpen(open) {
        results.classList.toggle('open', !!open);
        input.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) activeIndex = -1;
    }

    function openItem(item) {
        setOpen(false);
        const detail = window.PravmirData.getDetailUrl(item);
        if (detail) {
            window.location.href = detail;
            return;
        }
        const target = window.PravmirData.toMapTarget(item);
        if (target) {
            sessionStorage.setItem('mapTarget', JSON.stringify(target));
            window.location.href = window.PravmirData.mapUrl();
        }
    }

    function catalogHref(extra) {
        return window.PravmirData.catalogUrl(Object.assign({ q: input.value.trim(), sort: 'relevance' }, extra || {}));
    }

    function contentHref(item) {
        if (!item) return '#';
        if (item.kind === 'content' && item.slug) return 'articles/article.html?slug=' + encodeURIComponent(item.slug);
        if (item.kind === 'calendar_entry' && item.date_start) return 'calendar/day.html?date=' + encodeURIComponent(item.date_start);
        if (item.kind === 'event') return 'events/event.html?id=' + encodeURIComponent(item.id || '');
        if (item.kind === 'pilgrim_service') return 'routes/routes.html?tab=services&search=' + encodeURIComponent(item.title || '');
        return 'journal.html';
    }

    function contentMeta(item) {
        if (item.kind === 'calendar_entry') return 'Календарь' + (item.date_start ? ' · ' + item.date_start : '');
        if (item.kind === 'event') return 'Событие';
        if (item.kind === 'pilgrim_service') return 'Паломническая служба';
        return 'Журнал';
    }

    function selectable() {
        return Array.from(results.querySelectorAll('[data-search-selectable]'));
    }

    function setActive(index) {
        const items = selectable();
        if (!items.length) { activeIndex = -1; return; }
        activeIndex = Math.max(0, Math.min(index, items.length - 1));
        items.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function renderShortcuts() {
        results.innerHTML = '<div class="home-search-shortcuts">' +
            '<div class="home-search-group-label">Исследовать</div>' +
            '<div class="home-search-shortcuts-grid">' +
            '<a class="home-search-shortcut" href="catalog/catalog.html">' + icon('pin') + '<span>Места</span></a>' +
            '<a class="home-search-shortcut" href="holiness.html">' + icon('cross') + '<span>Святыни</span></a>' +
            '<a class="home-search-shortcut" href="routes/routes.html">' + icon('route') + '<span>Маршруты</span></a>' +
            '<a class="home-search-shortcut" href="calendar.html">' + icon('calendar') + '<span>Календарь</span></a>' +
            '<a class="home-search-shortcut" href="journal.html">' + icon('book') + '<span>Журнал</span></a>' +
            '<a class="home-search-shortcut" href="news.html">' + icon('info') + '<span>Новости</span></a>' +
            '<a class="home-search-shortcut" href="library.html">' + icon('book') + '<span>Библиотека</span></a>' +
            '<a class="home-search-shortcut" href="food.html">' + icon('food') + '<span>Кухня</span></a>' +
            '<a class="home-search-shortcut" href="pilgrim/infrastructure.html">' + icon('route') + '<span>Паломнику</span></a>' +
            '</div></div>';
        setOpen(true);
    }

    function renderLoading() {
        results.innerHTML = '<div class="home-search-loading"><span class="home-search-spinner" aria-hidden="true"></span><span>Ищем по местам, маршрутам, материалам и инфраструктуре…</span></div>';
        setOpen(true);
    }

    function render(payload, routeItems, contentItems, pilgrimItems, newsItems, libraryItems) {
        const items = payload.items || [];
        const routes = Array.isArray(routeItems) ? routeItems : [];
        const content = Array.isArray(contentItems) ? contentItems : [];
        const pilgrim = Array.isArray(pilgrimItems) ? pilgrimItems : [];
        const news = Array.isArray(newsItems) ? newsItems : [];
        const library = libraryItems || { works: [], authors: [] };
        lastPlaces = items;
        activeIndex = -1;
        if (!items.length && !routes.length && !content.length && !pilgrim.length && !news.length && !(library.works||[]).length && !(library.authors||[]).length) {
            results.innerHTML = '<div class="home-search-empty">Ничего не найдено. Попробуйте название храма, святого, региона или более короткий запрос.</div>' +
                '<a class="home-search-all" href="' + esc(catalogHref()) + '">Открыть каталог →</a>';
            setOpen(true);
            return;
        }

        const suggestions = (payload.suggestions || []).slice(0, 5).map(suggestion => {
            const extra = suggestion.kind === 'region' ? { region: suggestion.value } : { type: suggestion.value };
            return '<a class="home-search-chip" href="' + esc(catalogHref(extra)) + '">' + esc(suggestion.label) + ' <span>' + Number(suggestion.count || 0).toLocaleString('ru-RU') + '</span></a>';
        }).join('');

        const placeHtml = items.map((item, index) => {
            const category = item.category || window.PravmirData.typeLabel(item.place_type);
            const place = item.region || item.locality || '';
            return '<button type="button" class="home-search-result" data-search-selectable data-place-index="' + index + '" role="option">' +
                '<span class="home-search-result-icon">' + icon(iconForPlace(item)) + '</span>' +
                '<span class="home-search-result-text"><span class="home-search-result-name">' + esc(item.name) + '</span>' +
                '<span class="home-search-result-meta">' + esc(place) + (place && category ? ' · ' : '') + esc(category) + '</span></span></button>';
        }).join('');

        const routeHtml = routes.slice(0, 3).map(route => {
            const href = window.PravmirData.routeDetailUrl(route);
            const meta = [route.location, route.duration].filter(Boolean).join(' · ');
            return '<a class="home-search-route" data-search-selectable href="' + esc(href) + '">' +
                '<span class="home-search-result-icon">' + icon('route') + '</span>' +
                '<span class="home-search-result-text"><span class="home-search-result-name">' + esc(route.title) + '</span>' +
                '<span class="home-search-result-meta">Маршрут' + (meta ? ' · ' + esc(meta) : '') + '</span></span></a>';
        }).join('');

        const contentHtml = content.slice(0, 4).map(item => '<a class="home-search-route" data-search-selectable href="' + esc(contentHref(item)) + '">' +
            '<span class="home-search-result-icon">' + icon(item.kind === 'calendar_entry' ? 'calendar' : 'book') + '</span>' +
            '<span class="home-search-result-text"><span class="home-search-result-name">' + esc(item.title) + '</span>' +
            '<span class="home-search-result-meta">' + esc(contentMeta(item)) + '</span></span></a>').join('');

        const pilgrimHtml = pilgrim.slice(0, 4).map(row => {
            const item = row.item;
            return '<a class="home-search-route" data-search-selectable href="' + esc(window.PravmirPilgrim.getDetailUrl(item)) + '">' +
                '<span class="home-search-result-icon">' + icon('route') + '</span>' +
                '<span class="home-search-result-text"><span class="home-search-result-name">' + esc(item.name || item.title) + '</span>' +
                '<span class="home-search-result-meta">Паломнику · источник проверен ' + esc((item.freshness || {}).verified_at || '') + '</span></span></a>';
        }).join('');

        const newsHtml = news.slice(0, 3).map(item => '<a class="home-search-route" data-search-selectable href="' + esc(item.canonical_path || ('news/item.html?slug=' + encodeURIComponent(item.slug || ''))) + '">' +
            '<span class="home-search-result-icon">' + icon('info') + '</span>' +
            '<span class="home-search-result-text"><span class="home-search-result-name">' + esc(item.title) + '</span>' +
            '<span class="home-search-result-meta">Новости · source verified</span></span></a>').join('');
        const libraryHtml = (library.works || []).slice(0, 3).map(item => '<a class="home-search-route" data-search-selectable href="' + esc(item.canonical_path) + '">' +
            '<span class="home-search-result-icon">' + icon('book') + '</span>' +
            '<span class="home-search-result-text"><span class="home-search-result-name">' + esc(item.title) + '</span>' +
            '<span class="home-search-result-meta">Библиотека · ' + esc(item.rights_status) + '</span></span></a>').concat((library.authors || []).slice(0, 2).map(item => '<a class="home-search-route" data-search-selectable href="' + esc(item.canonical_path) + '">' +
            '<span class="home-search-result-icon">' + icon('book') + '</span>' +
            '<span class="home-search-result-text"><span class="home-search-result-name">' + esc(item.display_name) + '</span>' +
            '<span class="home-search-result-meta">Автор · source verified</span></span></a>')).join('');

        const more = payload.total > items.length
            ? '<a class="home-search-all" href="' + esc(catalogHref()) + '">Все места: ' + Number(payload.total).toLocaleString('ru-RU') + ' →</a>'
            : '<a class="home-search-all" href="' + esc(catalogHref()) + '">Открыть каталог мест →</a>';

        results.innerHTML = (suggestions ? '<div class="home-search-suggestions">' + suggestions + '</div>' : '') +
            (placeHtml ? '<div class="home-search-section"><div class="home-search-group-label">Места</div>' + placeHtml + '</div>' : '') +
            (routeHtml ? '<div class="home-search-routes"><div class="home-search-group-label">Маршруты</div>' + routeHtml + '</div>' : '') +
            (contentHtml ? '<div class="home-search-routes"><div class="home-search-group-label">Материалы и календарь</div>' + contentHtml + '</div>' : '') +
            (newsHtml ? '<div class="home-search-routes"><div class="home-search-group-label">Новости</div>' + newsHtml + '</div>' : '') +
            (libraryHtml ? '<div class="home-search-routes"><div class="home-search-group-label">Библиотека</div>' + libraryHtml + '</div>' : '') +
            (pilgrimHtml ? '<div class="home-search-routes"><div class="home-search-group-label">Паломнику</div>' + pilgrimHtml + '<a class="home-search-all" href="pilgrim/infrastructure.html?q=' + encodeURIComponent(input.value.trim()) + '">Все проверенные сервисы →</a></div>' : '') + more;

        results.querySelectorAll('[data-place-index]').forEach(btn => {
            btn.addEventListener('click', () => openItem(lastPlaces[Number(btn.dataset.placeIndex)]));
        });
        setOpen(true);
    }

    async function search() {
        const query = input.value.trim();
        if (query.length < 2) {
            if (!query) renderShortcuts();
            else setOpen(false);
            return;
        }
        const seq = ++requestSeq;
        renderLoading();
        try {
            const data = await Promise.all([
                window.PravmirData.suggest(query, { limit: 7 }),
                window.PravmirData.getRoutes({ query: query }),
                window.PravmirContent && window.PravmirContent.search
                    ? window.PravmirContent.search(query, { kinds: ['content', 'calendar_entry'], limit: 4 })
                    : Promise.resolve([]),
                window.PravmirPilgrim
                    ? Promise.all([window.PravmirPilgrim.getAmenities({q:query,limit:4}), window.PravmirPilgrim.getServices({q:query,limit:4})]).then(parts => parts[0].map(item => ({kind:'amenity',item:item})).concat(parts[1].map(item => ({kind:'service',item:item}))))
                    : Promise.resolve([]),
                window.PravmirNews && window.PravmirNews.getNews
                    ? window.PravmirNews.getNews({ q: query, status: 'published', limit: 3 })
                    : Promise.resolve([]),
                window.PravmirLibrary
                    ? Promise.all([window.PravmirLibrary.getWorks({ q: query, limit: 3 }), window.PravmirLibrary.getAuthors({ q: query, limit: 2 })]).then(parts => ({ works: parts[0], authors: parts[1] }))
                    : Promise.resolve({ works: [], authors: [] })
            ]);
            if (seq !== requestSeq) return;
            render(data[0], data[1], data[2], data[3], data[4], data[5]);
        } catch (error) {
            console.error('Ошибка поиска:', error);
            if (seq !== requestSeq) return;
            results.innerHTML = '<div class="home-search-empty">Поиск временно недоступен.</div><a class="home-search-all" href="catalog/catalog.html">Открыть каталог →</a>';
            setOpen(true);
        }
    }

    function scheduleSearch() {
        clearTimeout(debounceTimer);
        if (input.value.trim().length < 2) {
            requestSeq += 1;
            if (!input.value.trim()) renderShortcuts();
            else setOpen(false);
            return;
        }
        debounceTimer = setTimeout(search, 180);
    }

    input.addEventListener('focus', function () {
        if (!input.value.trim()) renderShortcuts();
    });
    input.addEventListener('input', scheduleSearch);
    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' && results.classList.contains('open')) {
            event.preventDefault();
            setActive(activeIndex + 1);
            return;
        }
        if (event.key === 'ArrowUp' && results.classList.contains('open')) {
            event.preventDefault();
            setActive(activeIndex <= 0 ? 0 : activeIndex - 1);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const items = selectable();
            if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].click();
            else search();
        }
        if (event.key === 'Escape') setOpen(false);
    });

    button.addEventListener('click', event => {
        event.preventDefault();
        search();
    });

    document.addEventListener('click', event => {
        if (!bar.contains(event.target)) setOpen(false);
    });
})();
