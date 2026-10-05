document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    const observer = window.IntersectionObserver && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                if (entry.target.animate) entry.target.animate([{ transform: 'translateY(12px)' }, { transform: 'translateY(0)' }], { duration: 350, easing: 'ease-out' });
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 }) : null;

    document.querySelectorAll('.place-card, .route-card, .pilgrim-card, .journal-main, .journal-small').forEach(function (el) {
        if (observer) observer.observe(el);
    });

    // ===== КАЛЕНДАРЬ: только canonical generated layer =====
    function localDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function calendarCandidate(row, kind) {
        const date = kind === 'fasting_rule' ? row.date_start : row.observance && row.observance.date_start;
        if (!date) return null;
        return {
            date: date,
            title: (kind === 'fasting_rule' ? 'Начало: ' : '') + (row.title || row.display_name || row.name || 'Календарная запись'),
            kind: kind,
            verification_status: row.verification_status
        };
    }

    async function renderCalendarWidget(container) {
        if (!window.PravmirLiturgical) throw new Error('PravmirLiturgical unavailable');
        await window.PravmirLiturgical.init();
        const groups = await Promise.all([
            window.PravmirLiturgical.getRecords('feast'),
            window.PravmirLiturgical.getRecords('commemoration'),
            window.PravmirLiturgical.getRecords('fasting_rule')
        ]);
        const kinds = ['feast', 'commemoration', 'fasting_rule'];
        const today = localDateKey(new Date());
        const seen = new Set();
        const entries = [];
        groups.forEach(function (rows, index) {
            rows.forEach(function (row) {
                const candidate = calendarCandidate(row, kinds[index]);
                if (!candidate || candidate.date < today) return;
                const key = candidate.date + '|' + candidate.title;
                if (!seen.has(key)) { seen.add(key); entries.push(candidate); }
            });
        });
        entries.sort(function (a, b) { return a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ru'); });
        container.replaceChildren();
        entries.slice(0, 4).forEach(function (entryData) {
            const date = new Date(entryData.date + 'T12:00:00');
            const entry = document.createElement('a');
            entry.className = 'cal-widget-entry';
            entry.href = 'calendar/day.html?date=' + encodeURIComponent(entryData.date);
            entry.style.cssText = 'color:inherit;text-decoration:none;';

            const dateBox = document.createElement('div');
            dateBox.className = 'cal-widget-date';
            const day = document.createElement('div'); day.className = 'cal-widget-date-day'; day.textContent = String(date.getDate());
            const month = document.createElement('div'); month.className = 'cal-widget-date-month'; month.textContent = date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '').toUpperCase();
            dateBox.append(day, month);

            const icon = document.createElement('div');
            icon.className = 'cal-widget-icon';
            icon.innerHTML = window.PravmirUI ? window.PravmirUI.icon(entryData.kind === 'fasting_rule' ? 'food' : (entryData.kind === 'feast' ? 'sun' : 'cross')) : '';

            const textBox = document.createElement('div');
            const title = document.createElement('div'); title.className = 'cal-widget-entry-title'; title.textContent = entryData.title;
            const sub = document.createElement('div'); sub.className = 'cal-widget-entry-sub';
            sub.textContent = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + (entryData.verification_status === 'legacy_unverified' ? ' · требует проверки источника' : '');
            textBox.append(title, sub);
            entry.append(dateBox, icon, textBox);
            container.appendChild(entry);
        });
        if (!container.children.length) {
            container.innerHTML = '<div class="cal-widget-entry"><div class="cal-widget-date"><div class="cal-widget-date-day">—</div><div class="cal-widget-date-month">—</div></div><div class="cal-widget-icon">' + (window.PravmirUI ? window.PravmirUI.icon('book') : '') + '</div><div><div class="cal-widget-entry-title">В текущем покрытии нет ближайших записей</div><div class="cal-widget-entry-sub">откройте полный календарь</div></div></div>';
        }
    }

    const widgetList = document.getElementById('calendarWidgetList');
    if (widgetList) {
        renderCalendarWidget(widgetList).catch(function (error) {
            console.warn('home calendar unavailable', error);
            widgetList.innerHTML = '<div class="cal-widget-entry"><div class="cal-widget-date"><div class="cal-widget-date-day">!</div><div class="cal-widget-date-month">—</div></div><div class="cal-widget-icon">' + (window.PravmirUI ? window.PravmirUI.icon('book') : '') + '</div><div><div class="cal-widget-entry-title">Календарь временно недоступен</div><div class="cal-widget-entry-sub">откройте раздел календаря</div></div></div>';
        });
    }

    // ===== TODAY / DAILY LAYER: orchestration only, no raw source reads =====
    function todayTitle(row) {
        return row && (row.title || row.display_name || row.name) || 'Запись';
    }

    function todayIcon(name) {
        return window.PravmirUI ? window.PravmirUI.icon(name) : '';
    }

    function todayCard(kicker, icon, title, modifier) {
        const card = document.createElement('article');
        card.className = 'today-card' + (modifier ? ' ' + modifier : '');
        const kick = document.createElement('div'); kick.className = 'today-card-kicker';
        const iconBox = document.createElement('span'); iconBox.innerHTML = todayIcon(icon);
        const kickText = document.createElement('span'); kickText.textContent = kicker;
        kick.append(iconBox, kickText);
        const heading = document.createElement('h3'); heading.textContent = title;
        card.append(kick, heading);
        return card;
    }

    function todayLink(list, href, title, meta) {
        const a = document.createElement('a'); a.className = 'today-card-item'; a.href = href;
        const strong = document.createElement('strong'); strong.textContent = title;
        a.appendChild(strong);
        if (meta) { const span = document.createElement('span'); span.textContent = meta; a.appendChild(span); }
        list.appendChild(a);
        return a;
    }

    function todayState(card, text, strongText) {
        const state = document.createElement('div'); state.className = 'today-card-state';
        if (strongText) { const strong = document.createElement('strong'); strong.textContent = strongText; state.append(strong, document.createTextNode(' ')); }
        state.appendChild(document.createTextNode(text)); card.appendChild(state); return state;
    }

    function todayAction(card, href, text) {
        const a = document.createElement('a'); a.className = 'today-card-action'; a.href = href; a.textContent = text + ' →'; card.appendChild(a); return a;
    }

    function liturgicalHref(kind, item) {
        if (kind === 'calendar_day') return 'calendar/day.html?date=' + encodeURIComponent(item.date);
        return 'calendar/item.html?kind=' + encodeURIComponent(kind) + '&id=' + encodeURIComponent(item.id);
    }

    async function renderTodayLayer() {
        const grid = document.getElementById('todayLayerGrid');
        const dateNode = document.getElementById('todayLayerDate');
        const note = document.getElementById('todayLayerNote');
        if (!grid || !dateNode) return;
        if (!window.PravmirToday) throw new Error('PravmirToday unavailable');

        const date = localDateKey(new Date());
        const snapshot = await window.PravmirToday.getSnapshot(date);
        const humanDate = new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        dateNode.textContent = humanDate.charAt(0).toUpperCase() + humanDate.slice(1);
        grid.replaceChildren();

        // Church day / canonical day composition.
        const dayCard = todayCard('Церковный день', 'calendar', 'Сегодня в календаре', 'today-card--day');
        const dayList = document.createElement('div'); dayList.className = 'today-card-list';
        const dayRows = snapshot.items.filter(function (entry) { return entry.kind !== 'reading'; });
        const lifeBySaint = new Map();
        (snapshot.saint_library || []).forEach(function (row) {
            if (!lifeBySaint.has(row.saint_ref)) lifeBySaint.set(row.saint_ref, []);
            lifeBySaint.get(row.saint_ref).push(row);
        });
        dayRows.slice(0, 7).forEach(function (entry) {
            const kindLabel = ({ feast:'Праздник', saint:'Святой', commemoration:'Память', fasting_rule:'Пост' })[entry.kind] || 'Календарь';
            todayLink(dayList, liturgicalHref(entry.kind, entry.item), todayTitle(entry.item), kindLabel + (entry.item.verification_status === 'legacy_unverified' ? ' · источник требует проверки' : ''));
            if (entry.kind === 'saint') {
                (lifeBySaint.get(entry.item.id) || []).slice(0, 1).forEach(function (row) {
                    todayLink(dayList, row.work.canonical_path, '↳ Житие · ' + row.work.title, 'Библиотека · explicit life_of relation');
                });
            }
        });
        const shownLifeIds = new Set();
        (snapshot.saint_library || []).slice(0, 3).forEach(function (row) {
            if (shownLifeIds.has(row.work.id)) return;
            shownLifeIds.add(row.work.id);
            todayLink(dayList, row.work.canonical_path, 'Житие · ' + row.work.title, 'Святой → житие · explicit life_of relation');
        });
        if (snapshot.related_media && snapshot.related_media.length) {
            snapshot.related_media.slice(0, 2).forEach(function (row) {
                todayLink(dayList, row.media.external_url, 'Медиа · ' + row.media.title, row.media.rights_status + ' · explicit feast relation');
            });
        }
        if (dayRows.length || dayList.children.length) dayCard.appendChild(dayList);
        else todayState(dayCard, 'В текущем source coverage нет отдельной литургической записи на эту дату.', 'Данные не придуманы.');
        todayAction(dayCard, 'calendar/day.html?date=' + encodeURIComponent(date), 'Открыть день полностью');
        grid.appendChild(dayCard);

        // Readings: only explicit editorial records; if none, show nearest known coverage.
        const readCard = todayCard('Чтения', 'book', snapshot.readings.length ? 'Чтения на сегодня' : 'Чтения на эту дату');
        if (snapshot.readings.length) {
            const list = document.createElement('div'); list.className = 'today-card-list';
            const libraryByReading = new Map((snapshot.reading_library || []).map(function (row) { return [row.reading_ref, row]; }));
            snapshot.readings.slice(0, 5).forEach(function (row) {
                const bridge = libraryByReading.get(row.id);
                todayLink(list, liturgicalHref('reading', row), row.citation || todayTitle(row), row.service || 'Чтение');
                if (bridge && bridge.work) todayLink(list, bridge.work.canonical_path, '↳ ' + bridge.work.title, 'Библиотека · metadata-only · explicit reading→work bridge');
            });
            readCard.appendChild(list);
        } else if (snapshot.next_reading) {
            const near = new Date(snapshot.next_reading.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
            todayState(readCard, 'Ближайший день, для которого в текущем editorial source есть библиографические ссылки: ' + near + '.', 'На сегодня источник не заполнен.');
            todayAction(readCard, 'calendar/day.html?date=' + encodeURIComponent(snapshot.next_reading.date), 'Открыть ближайшие чтения');
        } else {
            todayState(readCard, 'В текущем проверяемом покрытии библиографических ссылок нет.', 'Нет данных.');
            todayAction(readCard, 'calendar.html', 'Открыть календарь');
        }
        grid.appendChild(readCard);

        // Food: only recipes explicitly connected through food relations.
        const foodCard = todayCard('Трапеза', 'food', 'К календарю дня');
        if (snapshot.food && snapshot.food.recipes && snapshot.food.recipes.length) {
            const list = document.createElement('div'); list.className = 'today-card-list';
            snapshot.food.recipes.slice(0, 3).forEach(function (row) {
                todayLink(list, row.canonical_path || ('food/recipe.html?id=' + encodeURIComponent(row.id)), row.title, 'Редакционная кулинарная подборка');
            });
            foodCard.appendChild(list);
        } else {
            todayState(foodCard, 'Нет рецептов, явно связанных с литургическим контекстом этой даты. Общие рецепты доступны отдельно.', 'Без автоматических догадок.');
        }
        todayAction(foodCard, 'food.html?date=' + encodeURIComponent(date), 'Православная кухня');
        grid.appendChild(foodCard);

        // Journal: explicit relation when available; otherwise clearly-labelled latest content.
        const contentRows = snapshot.content_mode === 'related' ? snapshot.related_content : snapshot.latest_content;
        const journalCard = todayCard('Журнал', 'book', snapshot.content_mode === 'related' ? 'Связано с этим днём' : 'Из журнала');
        if (contentRows.length) {
            const list = document.createElement('div'); list.className = 'today-card-list';
            contentRows.slice(0, 3).forEach(function (row) {
                todayLink(list, row.canonical_path || ('articles/article.html?slug=' + encodeURIComponent(row.slug || '')), row.title, snapshot.content_mode === 'related' ? 'Explicit typed relation' : 'Свежий материал · не связь с календарным днём');
            });
            journalCard.appendChild(list);
        } else todayState(journalCard, 'Опубликованных материалов пока нет.', 'Журнал пуст.');
        todayAction(journalCard, 'journal.html', 'Все материалы');
        grid.appendChild(journalCard);

        // News: canonical/source-verified records only; legacy review never leaks into Today.
        const newsCard = todayCard('Новости', 'info', snapshot.news_mode === 'same_day' ? 'Новости этого дня' : 'Последние проверенные новости');
        if (snapshot.news && snapshot.news.length) {
            const list = document.createElement('div'); list.className = 'today-card-list';
            snapshot.news.forEach(function (row) {
                const meta = snapshot.news_mode === 'same_day'
                    ? 'Source verified · опубликовано сегодня'
                    : 'Source verified · последняя публикация до выбранной даты';
                todayLink(list, row.canonical_path || ('news/item.html?slug=' + encodeURIComponent(row.slug || '')), row.title, meta);
            });
            newsCard.appendChild(list);
        } else {
            todayState(newsCard, 'В canonical News нет проверенных публикаций на эту дату или раньше неё.', 'Проверенных новостей нет.');
        }
        todayAction(newsCard, 'news.html', 'Все новости');
        grid.appendChild(newsCard);

        // Events: canonical event layer only; review/demo never leaks into Today.
        const eventCard = todayCard('События', 'sun', 'Что происходит сегодня');
        if (snapshot.events.length) {
            const list = document.createElement('div'); list.className = 'today-card-list';
            snapshot.events.slice(0, 3).forEach(function (row) {
                todayLink(list, row.canonical_path || ('events/event.html?id=' + encodeURIComponent(row.id)), row.title, row.venue && row.venue.name ? row.venue.name : 'Подтверждённое событие');
            });
            eventCard.appendChild(list);
        } else {
            todayState(eventCard, 'Demo/review queue сюда не попадает. Сейчас в canonical event layer нет подтверждённых событий на эту дату.', 'Подтверждённых событий нет.');
        }
        todayAction(eventCard, 'events.html?date=' + encodeURIComponent(date), 'Афиша');
        grid.appendChild(eventCard);

        grid.setAttribute('aria-busy', 'false');
        if (note) {
            note.textContent = snapshot.trust.calendar_has_legacy_records
                ? 'Календарная база частично legacy_unverified; чтения имеют отдельный editorial provenance. Рецепты — editorial guidance, а события показываются только из canonical event layer.'
                : 'Данные собраны через domain APIs; чтения и жития связаны с Library только через stable IDs и explicit relations. ПМ не создаёт canonical связи по совпадению названий.';
        }
    }

    const todayGrid = document.getElementById('todayLayerGrid');
    if (todayGrid) {
        renderTodayLayer().catch(function (error) {
            console.warn('today layer unavailable', error);
            todayGrid.setAttribute('aria-busy', 'false');
            todayGrid.innerHTML = '<div class="today-layer-error">Сегодняшняя сводка временно недоступна. <a href="calendar.html">Открыть календарь →</a></div>';
        });
    }

    const mapEl = document.getElementById('map-our');
    if (!mapEl || !window.PravmirData || !window.PravmirMapRuntime || !window.PravmirMapDiscovery) return;

    const el = {
        q: document.getElementById('mapSearch'),
        region: document.getElementById('mapRegion'),
        type: document.getElementById('mapType'),
        status: document.getElementById('mapStatus'),
        reset: document.getElementById('mapReset'),
        summary: document.getElementById('mapDiscoverySummary'),
        catalog: document.getElementById('mapCatalogLink'),
        runtime: document.getElementById('mapRuntimeStatus'),
        runtimeError: document.getElementById('mapRuntimeError'),
        retry: document.getElementById('mapRetry'),
        yandexCanvas: document.getElementById('map-yandex-canvas'),
        yandexFallback: document.getElementById('mapYandexFallback'),
        yandexFallbackText: document.getElementById('mapYandexFallbackText'),
        yandexExternal: document.getElementById('mapYandexExternal'),
        lazyPrompt: document.getElementById('mapLazyPrompt'),
        loadNow: document.getElementById('mapLoadNow'),
        section: document.getElementById('map'),
        viewportResults: document.getElementById('mapViewportResults')
    };

    const escapeHtml = function (value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
        });
    };

    let allPlaces = [];
    let filteredPlaces = [];
    let state = window.PravmirMapDiscovery.parse(window.location.search);
    let markerLayer = null;
    let renderToken = 0;
    let searchToken = 0;
    let routingControl = null;
    let routePreviewLayer = null;
    let mapCapabilities = { cluster: false, routing: false };
    let yandexMap = null;
    let yandexApi = null;
    let yandexMarkers = [];

    function setRuntimeStatus(message, kind) {
        if (!el.runtime) return;
        el.runtime.textContent = message;
        el.runtime.classList.remove('is-error', 'is-ok');
        if (kind) el.runtime.classList.add(kind === 'error' ? 'is-error' : 'is-ok');
    }

    function fillSelect(select, values, labelFor, current) {
        if (!select) return;
        const first = select.options[0] ? select.options[0].cloneNode(true) : new Option('Все', 'all');
        select.innerHTML = '';
        select.appendChild(first);
        values.forEach(function (value) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = labelFor ? labelFor(value) : value;
            select.appendChild(option);
        });
        select.value = values.includes(current) ? current : 'all';
    }

    function syncControls() {
        if (el.q) el.q.value = state.q || '';
        if (el.region) el.region.value = state.region || 'all';
        if (el.type) el.type.value = state.type || 'all';
        if (el.status) el.status.value = state.status || 'all';
    }

    function updateLinksAndUrl() {
        const params = window.PravmirMapDiscovery.serialize(state);
        const query = params.toString();
        const nextUrl = window.location.pathname + (query ? '?' + query : '') + '#map';
        window.history.replaceState(null, '', nextUrl);

        if (el.catalog) {
            el.catalog.href = 'catalog/catalog.html' + (query ? '?' + query : '');
        }
        if (el.yandexExternal) {
            const text = state.q || (state.region !== 'all' ? state.region : 'православные храмы Россия');
            el.yandexExternal.href = 'https://yandex.ru/maps/?text=' + encodeURIComponent(text);
        }
    }

    function activeFilterCount() {
        return (state.q ? 1 : 0) + (state.region !== 'all' ? 1 : 0) + (state.type !== 'all' ? 1 : 0) + (state.status !== 'all' ? 1 : 0);
    }

    function updateSummary() {
        if (!el.summary) return;
        const coordinateCount = window.PravmirMapDiscovery.coordinateItems(filteredPlaces).length;
        const filters = activeFilterCount();
        el.summary.innerHTML = `<strong>${filteredPlaces.length.toLocaleString('ru-RU')} объектов</strong><span>с координатами: ${coordinateCount.toLocaleString('ru-RU')}</span>${filters ? `<span>активных фильтров: ${filters}</span>` : '<span>все регионы</span>'}`;
    }

    function popupHtml(item) {
        const category = item.category || window.PravmirData.typeLabel(item.place_type);
        const statusHtml = item.status && item.status !== 'unknown'
            ? `<br><span style="font-size:12px;color:#6B5A3A;">Статус: ${escapeHtml(item.status_label || window.PravmirData.statusLabel(item.status))}</span>`
            : '';
        const detail = window.PravmirData.getDetailUrl(item);
        const linkHtml = detail ? `<a href="${escapeHtml(detail)}">Открыть карточку →</a>` : '';
        return `<div style="min-width:190px;"><div style="font-weight:700;font-size:16px;margin-bottom:4px;">${escapeHtml(item.name)}</div><div style="font-size:13px;color:#6B5A3A;margin-bottom:4px;">${escapeHtml(item.region)} · ${escapeHtml(category)}</div>${statusHtml}<div style="margin-top:8px;">${linkHtml}</div></div>`;
    }

    function createMarkerLayer() {
        if (mapCapabilities.cluster && window.L.markerClusterGroup) {
            const layer = window.L.markerClusterGroup({
                maxClusterRadius: 40,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                chunkedLoading: true,
                iconCreateFunction: function (cluster) {
                    return window.L.divIcon({ html: `<div class="custom-cluster-icon">${cluster.getChildCount()}</div>`, className: '', iconSize: [32, 32] });
                }
            });
            layer._pravmirClustered = true;
            return layer;
        }
        // Leaflet.markercluster is an optional plugin. When its CDN is unavailable,
        // use Canvas paths instead of creating ~13k DOM marker nodes on mobile.
        const layer = window.L.layerGroup();
        layer._pravmirClustered = false;
        return layer;
    }


    function updateViewportResults() {
        if (!el.viewportResults || !window.pravmirMap || !filteredPlaces.length) return;
        const bounds = window.pravmirMap.getBounds();
        const center = window.pravmirMap.getCenter();
        const visible = window.PravmirMapDiscovery.coordinateItems(filteredPlaces).filter(function (item) {
            return bounds.contains([Number(item.lat), Number(item.lon)]);
        }).sort(function (a, b) {
            const ad = Math.pow(Number(a.lat) - center.lat, 2) + Math.pow(Number(a.lon) - center.lng, 2);
            const bd = Math.pow(Number(b.lat) - center.lat, 2) + Math.pow(Number(b.lon) - center.lng, 2);
            return ad - bd;
        }).slice(0, 6);
        if (!visible.length) {
            el.viewportResults.hidden = true;
            el.viewportResults.replaceChildren();
            return;
        }
        el.viewportResults.hidden = false;
        el.viewportResults.innerHTML = '<div class="map-viewport-head"><strong>В видимой области</strong><span>' + visible.length + ' ближайших к центру карты</span></div><div class="map-viewport-grid">' + visible.map(function (item) {
            const detail = window.PravmirData.getDetailUrl(item);
            const meta = [item.region, item.category || window.PravmirData.typeLabel(item.place_type)].filter(Boolean).join(' · ');
            return '<a class="map-viewport-card" href="' + escapeHtml(detail || window.PravmirData.catalogUrl({ q: item.name })) + '"><span class="map-viewport-icon">' + (window.PravmirUI ? window.PravmirUI.icon('cross') : '') + '</span><span><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(meta) + '</small></span></a>';
        }).join('') + '</div>';
    }

    function fitCurrentPlaces() {
        if (!window.pravmirMap) return;
        const valid = window.PravmirMapDiscovery.coordinateItems(filteredPlaces);
        if (!valid.length) return;
        if (valid.length === 1) {
            window.pravmirMap.setView([Number(valid[0].lat), Number(valid[0].lon)], 14);
            return;
        }
        const box = window.PravmirMapDiscovery.bounds(valid);
        if (box) window.pravmirMap.fitBounds(box, { padding: [28, 28], maxZoom: state.region !== 'all' ? 11 : 8 });
    }

    function renderMarkers(fit) {
        if (!window.pravmirMap || !markerLayer) return;
        const token = ++renderToken;
        markerLayer.clearLayers();
        const items = window.PravmirMapDiscovery.coordinateItems(filteredPlaces);
        const BATCH = 420;
        let cursor = 0;

        function addBatch() {
            if (token !== renderToken) return;
            const stop = Math.min(cursor + BATCH, items.length);
            const newMarkers = [];
            for (; cursor < stop; cursor += 1) {
                const item = items[cursor];
                let marker;
                if (markerLayer._pravmirClustered) {
                    const iconHtml = window.PravmirUI ? window.PravmirUI.icon('cross') : '';
                    const icon = window.L.divIcon({
                        html: '<span class="pravmir-marker-symbol">' + iconHtml + '</span>',
                        className: 'pravmir-place-icon', iconSize: [28, 28], popupAnchor: [0, -16]
                    });
                    marker = window.L.marker([Number(item.lat), Number(item.lon)], { icon: icon });
                } else {
                    marker = window.L.circleMarker([Number(item.lat), Number(item.lon)], {
                        radius: 4,
                        weight: 1,
                        color: '#8B6512',
                        fillColor: '#C8941A',
                        fillOpacity: 0.72
                    });
                }
                marker.bindPopup(popupHtml(item));
                newMarkers.push(marker);
            }
            if (typeof markerLayer.addLayers === 'function') markerLayer.addLayers(newMarkers);
            else newMarkers.forEach(function (marker) { markerLayer.addLayer(marker); });
            if (cursor < items.length) {
                if ('requestIdleCallback' in window) window.requestIdleCallback(addBatch, { timeout: 120 });
                else setTimeout(addBatch, 0);
            } else if (fit) {
                fitCurrentPlaces();
            }
        }
        addBatch();
    }

    async function computeFiltered() {
        const token = ++searchToken;
        let allowedIds = null;
        if (state.q) {
            const matches = await window.PravmirData.search(state.q, { limit: 'all' });
            if (token !== searchToken) return null;
            allowedIds = new Set(matches.map(function (item) { return item.id; }));
        }
        return window.PravmirMapDiscovery.filterItems(allPlaces, state, allowedIds);
    }

    async function applyState(options) {
        const opts = options || {};
        updateLinksAndUrl();
        const next = await computeFiltered();
        if (!next) return;
        filteredPlaces = next;
        updateSummary();
        renderMarkers(!!opts.fit);
        if (yandexMap) refreshYandex();
        updateViewportResults();
    }

    function readControls() {
        state = {
            q: el.q ? el.q.value.trim() : '',
            region: el.region ? el.region.value : 'all',
            type: el.type ? el.type.value : 'all',
            status: el.status ? el.status.value : 'all'
        };
    }

    function setupControlEvents() {
        let debounce = null;
        if (el.q) {
            el.q.addEventListener('input', function () {
                clearTimeout(debounce);
                debounce = setTimeout(function () { readControls(); applyState({ fit: false }); }, 220);
            });
            el.q.addEventListener('search', function () { readControls(); applyState({ fit: true }); });
        }
        [el.region, el.type, el.status].forEach(function (control) {
            if (!control) return;
            control.addEventListener('change', function () { readControls(); applyState({ fit: true }); });
        });
        if (el.reset) {
            el.reset.addEventListener('click', function () {
                state = window.PravmirMapDiscovery.defaultState();
                syncControls();
                applyState({ fit: true });
            });
        }
        window.addEventListener('popstate', function () {
            state = window.PravmirMapDiscovery.parse(window.location.search);
            syncControls();
            applyState({ fit: true });
        });
    }

    function showTargetFromSession() {
        const raw = sessionStorage.getItem('mapTarget');
        if (!raw || !window.pravmirMap) return;
        try {
            const target = JSON.parse(raw);
            const lat = Number(target.lat);
            const lon = Number(target.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('invalid target');
            window.switchMapTab('map-our', 'Наша карта');
            window.pravmirMap.setView([lat, lon], 14);
            const targetLink = target.link ? `<br><a href="${escapeHtml(target.link)}">Открыть карточку →</a>` : '';
            window.L.popup().setLatLng([lat, lon]).setContent(`<strong>${escapeHtml(target.name)}</strong>${targetLink}`).openOn(window.pravmirMap);
        } catch (error) {
            console.warn('Некорректная mapTarget:', error);
        } finally {
            sessionStorage.removeItem('mapTarget');
        }
    }

    function externalRoutePopup(route) {
        const lat = Number(route.lat);
        const lon = Number(route.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        window.pravmirMap.setView([lat, lon], 13);
        const yandex = `https://yandex.ru/maps/?rtext=~${lat},${lon}`;
        const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
        window.L.popup().setLatLng([lat, lon]).setContent(`<strong>${escapeHtml(route.name || 'Место')}</strong><br><span>Встроенная маршрутизация недоступна.</span><br><a href="${yandex}" target="_blank" rel="noopener">Яндекс маршрут →</a><br><a href="${google}" target="_blank" rel="noopener">Google маршрут →</a>`).openOn(window.pravmirMap);
        setRuntimeStatus('Карта работает; маршрут откроется во внешнем навигаторе.', 'ok');
    }

    async function drawRoute(startLat, startLon, route) {
        const endLat = Number(route.lat);
        const endLon = Number(route.lon);
        if (!mapCapabilities.routing || !window.L.Routing) {
            setRuntimeStatus('Подключение маршрутизации…');
            try {
                const extra = await window.PravmirMapRuntime.ensureLeaflet({ cluster: false, routing: true });
                mapCapabilities.routing = !!extra.routing;
            } catch (error) {
                mapCapabilities.routing = false;
            }
        }
        if (!mapCapabilities.routing || !window.L.Routing) {
            externalRoutePopup(route);
            return;
        }
        if (routingControl) window.pravmirMap.removeControl(routingControl);
        routingControl = window.L.Routing.control({
            waypoints: [window.L.latLng(startLat, startLon), window.L.latLng(endLat, endLon)],
            routeWhileDragging: true,
            addWaypoints: false,
            language: 'ru',
            collapsible: true,
            createMarker: function () { return null; },
            router: window.L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' })
        }).addTo(window.pravmirMap);
        routingControl.on('routingerror', function () { externalRoutePopup(route); });
        routingControl.on('routesfound', function () {
            const container = routingControl.getContainer();
            if (!container || document.getElementById('start_navigation_btn')) return;
            const panel = container.querySelector('.leaflet-routing-container') || container;
            const button = document.createElement('button');
            button.id = 'start_navigation_btn';
            button.className = 'btn-nav btn-gold';
            button.style.cssText = 'margin-top:12px;width:100%;padding:12px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;border:none;';
            button.textContent = 'Начать навигацию в Яндекс.Картах';
            button.onclick = function () { window.open(`https://yandex.ru/maps/?rtext=~${endLat},${endLon}`, '_blank', 'noopener'); };
            panel.appendChild(button);
        });
    }

    function showMultiStopRoute(route) {
        const points = Array.isArray(route.points) ? route.points.filter(function (point) {
            return Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon));
        }) : [];
        if (!points.length) return;
        if (routePreviewLayer && window.pravmirMap.hasLayer(routePreviewLayer)) {
            window.pravmirMap.removeLayer(routePreviewLayer);
        }
        routePreviewLayer = window.L.layerGroup().addTo(window.pravmirMap);
        const latlngs = [];
        points.forEach(function (point) {
            const latlng = [Number(point.lat), Number(point.lon)];
            latlngs.push(latlng);
            const icon = window.L.divIcon({
                className: '',
                html: '<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:2px solid #fff;border-radius:50%;background:#C8941A;color:#1A1208;font:800 13px/1 Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.28)">' + escapeHtml(point.order || '') + '</div>',
                iconSize: [30, 30], iconAnchor: [15, 15]
            });
            const marker = window.L.marker(latlng, { icon: icon });
            const link = point.detail_url ? '<br><a href="' + escapeHtml(point.detail_url) + '">Открыть точку →</a>' : '';
            marker.bindPopup('<strong>' + escapeHtml(point.name || 'Точка маршрута') + '</strong>' + link);
            routePreviewLayer.addLayer(marker);
        });
        if (latlngs.length > 1) routePreviewLayer.addLayer(window.L.polyline(latlngs, { weight: 3, opacity: 0.72, dashArray: '8 7' }));
        if (latlngs.length === 1) window.pravmirMap.setView(latlngs[0], 13);
        else window.pravmirMap.fitBounds(window.L.latLngBounds(latlngs), { padding: [34, 34], maxZoom: 12 });
        setRuntimeStatus('Показаны точки маршрута «' + (route.title || 'Маршрут') + '». Линия не является дорожной геометрией.', 'ok');
    }

    function showRouteFromSession() {
        const raw = sessionStorage.getItem('mapRoute');
        if (!raw || !window.pravmirMap) return;
        let route = null;
        try { route = JSON.parse(raw); } catch (error) { sessionStorage.removeItem('mapRoute'); return; }
        sessionStorage.removeItem('mapRoute');
        window.switchMapTab('map-our', 'Наша карта');
        if (Array.isArray(route.points)) {
            showMultiStopRoute(route);
            return;
        }
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function (position) { drawRoute(position.coords.latitude, position.coords.longitude, route); },
                function () { drawRoute(55.7558, 37.6173, route); },
                { enableHighAccuracy: false, timeout: 7000, maximumAge: 600000 }
            );
        } else {
            drawRoute(55.7558, 37.6173, route);
        }
    }

    function yandexLocationFor(items) {
        const valid = window.PravmirMapDiscovery.coordinateItems(items);
        if (!valid.length) return { center: [37.6173, 55.7558], zoom: 5 };
        const box = window.PravmirMapDiscovery.bounds(valid);
        if (!box) return { center: [37.6173, 55.7558], zoom: 5 };
        if (valid.length === 1) return { center: [Number(valid[0].lon), Number(valid[0].lat)], zoom: 14 };
        return { bounds: [[box[0][1], box[0][0]], [box[1][1], box[1][0]]] };
    }

    function clearYandexMarkers() {
        if (!yandexMap) return;
        yandexMarkers.forEach(function (marker) {
            try { yandexMap.removeChild(marker); } catch (error) {}
        });
        yandexMarkers = [];
    }

    function refreshYandex() {
        if (!yandexMap || !yandexApi) return;
        clearYandexMarkers();
        const valid = window.PravmirMapDiscovery.coordinateItems(filteredPlaces);
        yandexMap.setLocation(yandexLocationFor(valid));
        const limit = Math.min(valid.length, 700);
        for (let i = 0; i < limit; i += 1) {
            const item = valid[i];
            const markerElement = document.createElement('button');
            markerElement.type = 'button';
            markerElement.className = 'yandex-place-marker';
            markerElement.title = item.name;
            markerElement.setAttribute('aria-label', item.name);
            markerElement.addEventListener('click', function () {
                const detail = window.PravmirData.getDetailUrl(item);
                if (detail) window.location.href = detail;
            });
            const marker = new yandexApi.YMapMarker({ coordinates: [Number(item.lon), Number(item.lat)] }, markerElement);
            yandexMap.addChild(marker);
            yandexMarkers.push(marker);
        }
        if (el.yandexFallbackText && valid.length > limit) {
            el.yandexFallbackText.textContent = `Яндекс API показывает ${limit.toLocaleString('ru-RU')} из ${valid.length.toLocaleString('ru-RU')} точек без кластеризации. Для полного набора используйте «Нашу карту».`;
        }
    }

    async function initYandexMap() {
        if (yandexMap) { refreshYandex(); return; }
        const apiKey = window.CONFIG && window.CONFIG.maps ? window.CONFIG.maps.yandexJsApiKey : '';
        try {
            yandexApi = await window.PravmirMapRuntime.ensureYandex(apiKey);
            const YMap = yandexApi.YMap;
            const YMapDefaultSchemeLayer = yandexApi.YMapDefaultSchemeLayer;
            const YMapDefaultFeaturesLayer = yandexApi.YMapDefaultFeaturesLayer;
            yandexMap = new YMap(el.yandexCanvas, {
                location: yandexLocationFor(filteredPlaces),
                behaviors: ['drag', 'scrollZoom', 'dblClick', 'pinchZoom']
            });
            yandexMap.addChild(new YMapDefaultSchemeLayer());
            yandexMap.addChild(new YMapDefaultFeaturesLayer({ zIndex: 1800 }));
            if (el.yandexFallback) el.yandexFallback.hidden = true;
            refreshYandex();
        } catch (error) {
            if (el.yandexFallback) el.yandexFallback.hidden = false;
            if (el.yandexFallbackText) {
                el.yandexFallbackText.textContent = error && error.code === 'YANDEX_KEY_MISSING'
                    ? 'Для официального Яндекс JS API v3 нужен API-ключ с ограничением по HTTP Referer. Ключа в проекте нет, поэтому вместо пустой карты показывается безопасный переход во внешние Яндекс.Карты.'
                    : 'Яндекс JS API v3 не загрузился. Основная карта сайта продолжает работать независимо.';
            }
        }
    }

    window.addEventListener('pravmir:maptab', function (event) {
        if (!event.detail || event.detail.targetId !== 'map-yandex') return;
        startMapExperience().then(initYandexMap);
    });

    async function initMap() {
        try {
            setRuntimeStatus('Подключение Leaflet…');
            if (el.runtimeError) el.runtimeError.classList.remove('active');
            if (el.lazyPrompt) el.lazyPrompt.hidden = true;
            mapCapabilities = await window.PravmirMapRuntime.ensureLeaflet({ cluster: true, routing: false });
            window.pravmirMap = window.L.map('map-our', { zoomControl: false, preferCanvas: true }).setView([55.7558, 37.6173], 5);
            window.L.control.zoom({ position: 'topright' }).addTo(window.pravmirMap);
            const baseLayer = window.PravmirMapRuntime.createBaseLayer(window.pravmirMap, function (provider, fallback, meta) {
                if (meta && meta.failed) {
                    setRuntimeStatus('Тайлы карты недоступны. Попробуйте внешнюю карту.', 'error');
                    return;
                }
                if (meta && meta.ready) {
                    setRuntimeStatus((fallback ? 'Включён резервный слой ' : 'Карта подключена: ') + provider.toUpperCase() + (mapCapabilities.cluster ? '' : ' · облегчённые точки'), 'ok');
                    return;
                }
                setRuntimeStatus((fallback ? 'Переключение на резервный слой ' : 'Подключение слоя ') + provider.toUpperCase() + '…');
            });
            baseLayer.addTo(window.pravmirMap);
            markerLayer = createMarkerLayer();
            markerLayer.addTo(window.pravmirMap);
            window.pravmirMap.on('moveend', updateViewportResults);
        } catch (error) {
            console.error('Ошибка инициализации Leaflet:', error);
            setRuntimeStatus('Leaflet не загрузился. Доступны каталог и внешние карты.', 'error');
            if (el.runtimeError) el.runtimeError.classList.add('active');
            try {
                allPlaces = await window.PravmirData.getMapPlaces();
                filteredPlaces = allPlaces;
                updateSummary();
            } catch (dataError) {}
            throw error;
        }

        // Data failures must not cover a successfully initialized basemap.
        try {
            allPlaces = await window.PravmirData.getMapPlaces();
            if (el.q && el.q.value.trim()) state.q = el.q.value.trim();
            const opts = window.PravmirMapDiscovery.options(allPlaces);
            fillSelect(el.region, opts.regions, null, state.region);
            fillSelect(el.type, opts.types, window.PravmirData.typeLabel, state.type);
            fillSelect(el.status, opts.statuses, window.PravmirData.statusLabel, state.status);
            syncControls();
            setupControlEvents();
            await applyState({ fit: activeFilterCount() > 0 });

            const stats = await window.PravmirData.getStats();
            const routes = await window.PravmirData.getRoutes();
            const statObjects = document.getElementById('stat-objects');
            const statRoutes = document.getElementById('stat-routes');
            const statRegions = document.getElementById('stat-regions');
            const statGeo = document.getElementById('stat-geo');
            const geocoded = allPlaces.filter(function (place) { return Number.isFinite(place.lat) && Number.isFinite(place.lon); }).length;
            const geocodedPct = allPlaces.length ? Math.round((geocoded / allPlaces.length) * 100) : 0;
            if (statObjects) statObjects.textContent = stats.map_places.toLocaleString('ru-RU');
            if (statRoutes) statRoutes.textContent = routes.length.toLocaleString('ru-RU');
            if (statRegions) statRegions.textContent = stats.regions;
            if (statGeo) statGeo.textContent = geocodedPct + '%';

            showTargetFromSession();
            showRouteFromSession();
            setTimeout(function () { window.pravmirMap.invalidateSize(); }, 120);
        } catch (error) {
            console.error('Карта загружена, но данные мест недоступны:', error);
            setRuntimeStatus('Карта работает, но данные объектов не загрузились.', 'error');
            if (el.summary) el.summary.innerHTML = '<strong>Карта доступна</strong><span>данные объектов временно не загрузились</span>';
        }
    }

    let mapBootPromise = null;

    function startMapExperience() {
        if (mapBootPromise) return mapBootPromise;
        mapBootPromise = initMap().catch(function (error) {
            mapBootPromise = null;
            throw error;
        });
        return mapBootPromise;
    }

    function requestMapBoot() {
        startMapExperience().catch(function (error) {
            console.error('Не удалось запустить карту:', error);
        });
    }

    if (el.loadNow) el.loadNow.addEventListener('click', requestMapBoot);
    if (el.retry) el.retry.addEventListener('click', function () {
        if (el.runtimeError) el.runtimeError.classList.remove('active');
        requestMapBoot();
    });
    [el.q, el.region, el.type, el.status, el.reset].forEach(function (control) {
        if (!control) return;
        control.addEventListener('focus', requestMapBoot, { once: true });
        control.addEventListener('pointerdown', requestMapBoot, { once: true });
    });

    const hasPendingMapAction = window.location.hash === '#map' || sessionStorage.getItem('mapTarget') || sessionStorage.getItem('mapRoute');
    if (hasPendingMapAction) {
        requestMapBoot();
    } else if (window.IntersectionObserver && el.section) {
        const mapObserver = new IntersectionObserver(function (entries) {
            if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
            mapObserver.disconnect();
            requestMapBoot();
        }, { rootMargin: '420px 0px', threshold: 0.01 });
        mapObserver.observe(el.section);
    } else {
        // Old browsers keep the map functional, but defer it until the event loop is idle.
        if ('requestIdleCallback' in window) window.requestIdleCallback(requestMapBoot, { timeout: 2500 });
        else setTimeout(requestMapBoot, 1200);
    }
});
