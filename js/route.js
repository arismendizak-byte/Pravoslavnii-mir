(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    let activeRoute = null;
    let activePoints = [];

    function text(value) { return String(value == null ? '' : value).trim(); }

    function addFact(root, label, value) {
        const clean = text(value);
        if (!clean) return;
        const row = document.createElement('div');
        row.className = 'route-meta-row';
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = clean;
        row.append(dt, dd);
        root.appendChild(row);
    }

    function qualityLabel(flag) {
        const labels = {
            contains_legacy_waypoint: 'В маршруте есть точка из прежнего описания, ещё не сопоставленная с каталогом.',
            legacy_label_differs_from_canonical_name: 'Название в прежнем описании отличалось от названия в каталоге.',
            legacy_noncanonical_waypoint: 'Точка из прежнего описания сохранена отдельно от каталога мест.',
            curated_stop_without_canonical_place: 'Связь этой точки с местом в каталоге ещё не подтверждена.'
        };
        return labels[flag] || flag;
    }

    function renderMeta(route) {
        const meta = $('routeMeta');
        [route.location, route.duration, route.distance].filter(Boolean).forEach(value => {
            const chip = document.createElement('span');
            chip.className = 'route-meta-chip';
            chip.textContent = value;
            meta.appendChild(chip);
        });
        const facts = $('routeFacts');
        addFact(facts, 'Регион / направление', route.location);
        addFact(facts, 'Длительность', route.duration);
        addFact(facts, 'Дистанция / объём', route.distance);
        addFact(facts, 'Стоимость', route.price);
        addFact(facts, 'Статус данных', route.verification_status === 'source_verified' ? 'Источник проверен' : 'Legacy, требует верификации');
        const quality = (route.quality_flags || []).map(qualityLabel);
        $('routeQuality').textContent = quality.length
            ? quality.join(' ')
            : 'Дополнительных quality flags для маршрута нет.';
    }

    function renderPoints(points) {
        const root = $('routePoints');
        root.replaceChildren(...points.map(point => {
            const card = document.createElement('article');
            card.className = 'route-point';
            const order = document.createElement('div');
            order.className = 'route-point-order';
            order.textContent = String(point.order);
            const body = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'route-point-title';
            title.textContent = point.name || 'Без названия';
            body.appendChild(title);

            const metaParts = [];
            if (point.region) metaParts.push(point.region);
            if (point.address) metaParts.push(point.address);
            const meta = document.createElement('div');
            meta.className = 'route-point-meta';
            meta.textContent = metaParts.join(' · ') || (point.lat != null && point.lon != null ? 'Координаты из прежнего описания' : 'Координаты отсутствуют');
            body.appendChild(meta);

            const kind = document.createElement('span');
            kind.className = 'route-point-kind' + (point.kind === 'legacy_waypoint' ? ' legacy' : '');
            kind.textContent = point.kind === 'place' ? 'Место в каталоге' : 'Точка из прежнего описания';
            body.appendChild(kind);

            if (point.detail_url) {
                const link = document.createElement('a');
                link.className = 'route-point-link';
                link.href = point.detail_url;
                link.textContent = point.kind === 'place' ? 'Открыть объект →' : 'Открыть сохранённую curated-страницу →';
                body.appendChild(link);
            }
            card.append(order, body);
            return card;
        }));
    }

    function renderEntities(entities) {
        if (!entities.length) return;
        const root = $('routeEntities');
        root.replaceChildren(...entities.map(entity => {
            const link = document.createElement('a');
            link.className = 'route-related-link';
            link.href = window.PravmirData.entityDetailUrl(entity);
            link.textContent = entity.name;
            return link;
        }));
        $('routeEntitiesSection').hidden = false;
    }

    function routeSuggestionReason(reason) {
        const labels = {
            route_via_graph_relation: 'Связан через место или святыню',
            route_via_shared_place: 'Общее место на пути',
            direct_route_stop: 'Общий маршрутный узел'
        };
        return labels[reason] || 'Связан через места и святыни';
    }

    function renderRouteSuggestions(rows) {
        if (!rows.length) return;
        const root = $('routeSuggestions');
        root.replaceChildren(...rows.map(row => {
            const link = document.createElement('a');
            link.className = 'route-related-link route-suggestion-link';
            link.href = window.PravmirData.routeDetailUrl(row.node);
            const title = document.createElement('strong');
            title.textContent = row.node.title || 'Маршрут';
            const meta = document.createElement('span');
            meta.textContent = routeSuggestionReason(row.reason) + ' · ' + row.depth + ' переход' + (row.depth === 1 ? '' : 'а');
            link.append(title, meta);
            return link;
        }));
        $('routeSuggestionsSection').hidden = false;
    }

    async function renderPilgrimInfrastructure(points) {
        const section = $('routePilgrimSection');
        const root = $('routePilgrim');
        if (!section || !root || !window.PravmirPilgrim) return;
        const canonicalStops = points.filter(point => point.kind === 'place' && point.place_id);
        if (!canonicalStops.length) return;
        const groups = await Promise.all(canonicalStops.map(async point => ({ point: point, rows: await window.PravmirPilgrim.getForPlace(point.place_id) })));
        const seen = new Set();
        const rows = [];
        groups.forEach(group => group.rows.forEach(row => {
            if (!row || !row.item || seen.has(row.item.id)) return;
            seen.add(row.item.id);
            rows.push({ point: group.point, kind: row.kind, item: row.item });
        }));
        if (!rows.length) return;
        root.replaceChildren(...rows.map(row => {
            const link = document.createElement('a');
            link.className = 'route-pilgrim-item';
            link.href = '../' + row.item.canonical_path;
            const title = document.createElement('strong');
            title.textContent = row.item.name || row.item.title;
            const meta = document.createElement('span');
            meta.textContent = (row.kind === 'amenity' ? 'Инфраструктура' : 'Сервис') + ' · у точки «' + row.point.name + '» · проверено ' + ((row.item.freshness || {}).verified_at || '—');
            link.append(title, meta);
            return link;
        }));
        section.hidden = false;
    }

    function validMapPoints(points) {
        return points.filter(point => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)));
    }

    async function renderMap(points) {
        const status = $('routeMapStatus');
        const valid = validMapPoints(points);
        if (!valid.length) {
            status.textContent = 'У маршрута нет точек с координатами.';
            return;
        }
        try {
            await window.PravmirMapRuntime.ensureLeaflet({ extras: false });
            const map = window.L.map('routeMap', { preferCanvas: true, scrollWheelZoom: false });
            const baseLayer = window.PravmirMapRuntime.createBaseLayer(map, function (provider, fallback, state) {
                if (state && state.failed) status.textContent = 'Базовая карта временно недоступна; точки маршрута сохранены.';
                else if (state && state.ready) status.textContent = fallback ? 'Карта загружена через резервный тайловый источник.' : 'Карта готова.';
            });
            baseLayer.addTo(map);
            const latlngs = [];
            valid.forEach(point => {
                const latlng = [Number(point.lat), Number(point.lon)];
                latlngs.push(latlng);
                const icon = window.L.divIcon({
                    className: '',
                    html: '<div class="route-number-icon">' + String(point.order) + '</div>',
                    iconSize: [30, 30], iconAnchor: [15, 15]
                });
                const marker = window.L.marker(latlng, { icon: icon }).addTo(map);
                const popup = document.createElement('div');
                const strong = document.createElement('strong');
                strong.textContent = point.name;
                popup.appendChild(strong);
                if (point.detail_url) {
                    const link = document.createElement('a');
                    link.href = point.detail_url;
                    link.textContent = 'Открыть';
                    link.style.display = 'block';
                    link.style.marginTop = '6px';
                    popup.appendChild(link);
                }
                marker.bindPopup(popup);
            });
            if (latlngs.length > 1) window.L.polyline(latlngs, { weight: 3, opacity: 0.7, dashArray: '8 7' }).addTo(map);
            if (latlngs.length === 1) map.setView(latlngs[0], 13);
            else map.fitBounds(window.L.latLngBounds(latlngs), { padding: [34, 34], maxZoom: 12 });
            setTimeout(() => map.invalidateSize(), 0);
        } catch (error) {
            console.error('Route map init failed:', error);
            status.textContent = 'Не удалось запустить карту. Список точек маршрута остаётся доступен.';
        }
    }

    function openOnMainMap() {
        const points = validMapPoints(activePoints).map(point => ({
            order: point.order, name: point.name, lat: Number(point.lat), lon: Number(point.lon), detail_url: point.detail_url || null
        }));
        if (!points.length) return;
        sessionStorage.setItem('mapRoute', JSON.stringify({ route_id: activeRoute.id, title: activeRoute.title, points: points }));
        window.location.href = window.PravmirData.mapUrl();
    }

    function externalNavigation() {
        const points = validMapPoints(activePoints);
        if (!points.length) return;
        const rtext = points.map(point => Number(point.lat) + ',' + Number(point.lon)).join('~');
        const url = 'https://yandex.ru/maps/?rtext=' + encodeURIComponent(rtext) + '&rtt=auto';
        window.open(url, '_blank', 'noopener');
    }

    async function bindSavedRoute(route) {
        const btn = $('routeSaveBtn');
        if (!btn) return;
        if (!window.PravmirMyPm) { btn.disabled = true; btn.title = 'Мой ПМ недоступен'; return; }
        await window.PravmirMyPm.init();
        const ref = { kind: 'route', id: route.id };
        async function paint() {
            const active = await window.PravmirMyPm.has('saved_routes', ref);
            btn.textContent = active ? '♥ Маршрут сохранён' : '♡ Сохранить маршрут';
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        await paint();
        btn.addEventListener('click', async function () { await window.PravmirMyPm.toggle('saved_routes', ref); await paint(); });
    }

    function showError(message) {
        $('routeLoading').hidden = true;
        $('routeContent').hidden = true;
        $('routeErrorText').textContent = message || 'Проверьте ссылку или вернитесь к списку маршрутов.';
        $('routeError').hidden = false;
    }

    async function loadRoute() {
        if (!window.PravmirData) return showError('Единый слой данных недоступен.');
        const params = new URLSearchParams(window.location.search);
        const id = text(params.get('id'));
        const slug = text(params.get('slug'));
        if (!id && !slug) return showError('В ссылке отсутствует идентификатор маршрута.');
        try {
            const route = id ? await window.PravmirData.getRouteById(id) : await window.PravmirData.getRouteBySlug(slug);
            if (!route) return showError('Такого маршрута нет в текущем graph layer.');
            const [points, entities, relatedRoutes] = await Promise.all([
                window.PravmirData.getRoutePoints(route),
                window.PravmirData.getEntitiesForRoute(route),
                window.PravmirData.getRelatedRoutesForRoute(route.id)
            ]);
            activeRoute = route;
            activePoints = points;
            document.title = route.title + ' — Православный Мир';
            $('routeBreadcrumb').textContent = route.title;
            $('routeTitle').textContent = route.title;
            $('routeBadge').textContent = route.badge || 'Маршрут';
            $('routeDescription').textContent = route.description || 'Описание маршрута пока не добавлено.';
            renderMeta(route);
            renderPoints(points);
            renderEntities(entities);
            renderRouteSuggestions(relatedRoutes);
            await renderPilgrimInfrastructure(points);
            $('routeFullMapBtn').disabled = !validMapPoints(points).length;
            $('routeExternalBtn').disabled = !validMapPoints(points).length;
            $('routeFullMapBtn').addEventListener('click', openOnMainMap);
            $('routeExternalBtn').addEventListener('click', externalNavigation);
            await bindSavedRoute(route);
            $('routeLoading').hidden = true;
            $('routeContent').hidden = false;
            await renderMap(points);
        } catch (error) {
            console.error('Route detail load failed:', error);
            showError('Не удалось загрузить маршрут.');
        }
    }

    document.addEventListener('DOMContentLoaded', loadRoute);
})();
