(function () {
    'use strict';

    const $ = id => document.getElementById(id);

    function asText(value) {
        return String(value == null ? '' : value).trim();
    }

    function safeHttpUrl(value) {
        try {
            const url = new URL(asText(value), window.location.href);
            return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
        } catch (_) {
            return null;
        }
    }

    function uniqueStrings(values) {
        const seen = new Set();
        return (Array.isArray(values) ? values : []).map(asText).filter(value => {
            if (!value) return false;
            const key = value.toLocaleLowerCase('ru-RU');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function placeRegion(place) {
        return asText((place.address && place.address.region) || place.region);
    }

    function placeAddress(place) {
        return asText((place.address && place.address.formatted) || place.address);
    }

    function placeType(place) {
        return asText(place.place_type) || 'unknown';
    }

    function typeIcon(type) {
        if (!window.PravmirUI) return '';
        if (type === 'holy_spring') return window.PravmirUI.icon('pin');
        return window.PravmirUI.icon('cross');
    }

    function statusText(place) {
        if (place.status_label) return asText(place.status_label);
        return window.PravmirData.statusLabel(asText(place.status) || 'unknown');
    }

    function foundationText(place) {
        const foundation = place.foundation || {};
        if (asText(foundation.raw_text)) return asText(foundation.raw_text);
        if (foundation.from_year && foundation.to_year && foundation.from_year !== foundation.to_year) {
            return `${foundation.from_year}–${foundation.to_year}`;
        }
        return asText(foundation.from_year || foundation.to_year);
    }

    function addFact(dl, label, value) {
        value = asText(value);
        if (!value) return;
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.append(dt, dd);
    }

    function renderList(sectionId, listId, values) {
        const section = $(sectionId);
        const list = $(listId);
        const items = uniqueStrings(values);
        if (!section || !list || !items.length) return;
        list.replaceChildren(...items.map(value => {
            const li = document.createElement('li');
            li.textContent = value;
            return li;
        }));
        section.hidden = false;
    }

    function renderDescription(place) {
        const section = $('descriptionSection');
        const root = $('objectDescription');
        const descriptions = place.descriptions || {};
        const text = asText(descriptions.full || descriptions.short || place.description);
        if (!section || !root || !text) return;
        const paragraphs = text.split(/\n{2,}/).map(asText).filter(Boolean);
        root.replaceChildren(...paragraphs.map(value => {
            const p = document.createElement('p');
            p.textContent = value;
            return p;
        }));
        section.hidden = false;
    }

    function renderSource(place) {
        const section = $('sourceBlock');
        const root = $('objectSource');
        if (!section || !root) return;
        if (Array.isArray(place.source_records) && place.source_records.length) {
            const providers = uniqueStrings(place.source_records.map(record => record.provider));
            const verified = uniqueStrings(place.source_records.map(record => record.last_verified_at));
            root.textContent = providers.length ? providers.join(', ') : 'Импортированный каталог';
            if (verified.length) {
                const small = document.createElement('div');
                small.className = 'data-object-source-note';
                small.textContent = `Последняя отметка источника: ${verified[0]}`;
                root.appendChild(small);
            }
            section.hidden = false;
            return;
        }
    }

    function renderTags(place) {
        const tags = $('objectTags');
        if (!tags) return;
        const values = [];
        const status = statusText(place);
        if (status && status !== 'Статус не указан') values.push(status);
        const district = asText(place.address && place.address.district);
        if (district) values.push(district);
        tags.replaceChildren(...values.map(value => {
            const span = document.createElement('span');
            span.className = 'object-tag';
            span.textContent = value;
            return span;
        }));
    }

    function entityTypeText(type) {
        if (type === 'saint') return 'Святой';
        if (type === 'icon') return 'Икона';
        if (type === 'relic') return 'Мощи';
        if (type === 'shrine') return 'Святыня';
        return 'Сущность';
    }

    function relationTypeText(type) {
        if (type === 'relics_at') return 'святые мощи / почитание в этом месте';
        if (type === 'located_at') return 'связано с этим местом';
        if (type === 'relic_of') return 'мощи святого';
        return asText(type) || 'связь';
    }

    function verificationText(status) {
        return status === 'source_verified' ? 'Источник подтверждён' : 'Требует проверки';
    }

    function provenanceText(relation) {
        const provenance = relation && relation.provenance ? relation.provenance : {};
        const provider = asText(provenance.provider);
        const sourceTitle = asText(provenance.source_title);
        const sourceFile = asText(provenance.source_file);
        const sourceId = asText(provenance.source_id);
        const checkedAt = asText(provenance.checked_at);
        const source = [sourceTitle || provider, sourceTitle && provider ? provider : '', checkedAt ? 'проверено ' + checkedAt : '', sourceFile, sourceId ? '#' + sourceId : ''].filter(Boolean).join(' · ');
        return source ? 'Источник связи: ' + source : 'Источник связи не указан';
    }

    function appendSourceLink(container, relation) {
        const provenance = relation && relation.provenance ? relation.provenance : {};
        const url = asText(provenance.source_url);
        if (!url || !/^https:\/\//i.test(url)) return;
        const link = document.createElement('a');
        link.className = 'data-relation-source-link';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Открыть источник';
        container.append(' · ', link);
    }

    async function renderRelatedEntities(place) {
        const section = $('relatedEntitiesSection');
        const root = $('objectRelatedEntities');
        if (!section || !root || !place || !place.id) return;
        const rows = await window.PravmirData.getRelatedEntitiesForPlace(place.id);
        if (!rows.length) return;
        root.replaceChildren(...rows.map(row => {
            const card = document.createElement('article');
            card.className = 'data-object-related-entity';

            const header = document.createElement('div');
            header.className = 'data-object-related-entity-header';
            const link = document.createElement('a');
            link.className = 'data-object-related-entity-name';
            link.href = window.PravmirData.entityDetailUrl(row.entity);
            link.textContent = row.entity.name;
            const badge = document.createElement('span');
            badge.className = 'data-relation-status ' + (row.relation.verification_status === 'source_verified' ? 'verified' : 'unverified');
            badge.textContent = verificationText(row.relation.verification_status);
            header.append(link, badge);

            const meta = document.createElement('div');
            meta.className = 'data-object-related-entity-meta';
            meta.textContent = entityTypeText(row.entity.entity_type) + ' · ' + relationTypeText(row.relation.relation_type);

            const source = document.createElement('div');
            source.className = 'data-relation-provenance';
            source.textContent = provenanceText(row.relation);
            appendSourceLink(source, row.relation);

            card.append(header, meta, source);
            return card;
        }));
        section.hidden = false;
    }

    function traversalReasonText(reason) {
        const labels = {
            direct_route_stop: 'Маршрут проходит через этот объект',
            route_via_graph_relation: 'Связан через святыню',
            route_via_shared_place: 'Общее место на пути',
            shared_entity: 'Общая святыня',
            shared_route: 'Общий маршрут',
            direct_relation: 'Прямая связь',
            shared_place_or_entity: 'Связан через места и святыни'
        };
        return labels[reason] || 'Связан через места и святыни';
    }

    async function renderRelatedRoutes(place) {
        const section = $('relatedRoutesSection');
        const root = $('objectRelatedRoutes');
        if (!section || !root || !place || !place.id) return;
        const rows = await window.PravmirData.getRouteSuggestionsForPlace(place.id);
        if (!rows.length) return;
        root.replaceChildren(...rows.map(row => {
            const link = document.createElement('a');
            link.className = 'data-object-related-route data-object-graph-card';
            link.href = window.PravmirData.routeDetailUrl(row.node);
            const title = document.createElement('strong');
            title.textContent = row.node.title;
            const meta = document.createElement('span');
            meta.textContent = traversalReasonText(row.reason) + ' · ' + row.depth + ' переход' + (row.depth === 1 ? '' : 'а');
            link.append(title, meta);
            return link;
        }));
        section.hidden = false;
    }

    async function renderRelatedPlaces(place) {
        const section = $('relatedPlacesSection');
        const root = $('objectRelatedPlaces');
        if (!section || !root || !place || !place.id) return;
        const rows = await window.PravmirData.getRelatedPlacesForPlace(place.id);
        if (!rows.length) return;
        root.replaceChildren(...rows.map(row => {
            const link = document.createElement('a');
            link.className = 'data-object-related-place data-object-graph-card';
            link.href = window.PravmirData.placeDetailUrl(row.node);
            const title = document.createElement('strong');
            title.textContent = row.node.name;
            const meta = document.createElement('span');
            const region = row.node.address && row.node.address.region ? row.node.address.region : '';
            meta.textContent = [traversalReasonText(row.reason), region].filter(Boolean).join(' · ');
            link.append(title, meta);
            return link;
        }));
        section.hidden = false;
    }


    function contentRelationText(type) {
        return ({about_place:'Материал об этом месте',mentions_place:'Место упомянуто в материале',related_route:'Связанный маршрут'})[type] || 'Связанный материал';
    }

    async function renderRelatedContent(place) {
        const section = $('relatedContentSection');
        const root = $('objectRelatedContent');
        if (!section || !root || !place || !place.id || !window.PravmirContent) return;
        const rows = await window.PravmirContent.getRelated({ kind: 'place', id: place.id });
        const contentRows = rows.filter(row => row.target && row.target.kind === 'content' && row.resolved && row.resolved.item);
        if (!contentRows.length) return;
        root.replaceChildren(...contentRows.map(row => {
            const item = row.resolved.item;
            const link = document.createElement('a');
            link.className = 'data-object-content-card';
            link.href = '../' + item.canonical_path;
            const kicker = document.createElement('span');
            kicker.className = 'data-object-content-kicker';
            kicker.textContent = contentRelationText(row.link.relation_type);
            const title = document.createElement('strong');
            title.textContent = item.title;
            const summary = document.createElement('span');
            summary.textContent = asText(item.summary || item.publisher || 'Открыть материал');
            link.append(kicker, title, summary);
            return link;
        }));
        section.hidden = false;
    }

    async function renderRelatedNews(place) {
        const section = $('relatedNewsSection');
        const root = $('objectRelatedNews');
        if (!section || !root || !place || !place.id || !window.PravmirNews) return;
        const rows = await window.PravmirNews.getRelatedNews({ kind: 'place', id: place.id }, { limit: 6 });
        if (!rows.length) return;
        root.replaceChildren(...rows.map(row => {
            const link = document.createElement('a');
            link.className = 'data-object-content-card';
            link.href = '../' + row.canonical_path;
            const kicker = document.createElement('span');
            kicker.className = 'data-object-content-kicker';
            kicker.textContent = 'Source-verified news · explicit relation';
            const title = document.createElement('strong');
            title.textContent = row.title;
            const summary = document.createElement('span');
            const date = row.published_at ? String(row.published_at).slice(0, 10) : '';
            summary.textContent = [date, row.publisher || ''].filter(Boolean).join(' · ');
            link.append(kicker, title, summary);
            return link;
        }));
        section.hidden = false;
    }


    async function renderPilgrimInfrastructure(place) {
        const section = $('relatedPilgrimSection');
        const root = $('objectRelatedPilgrim');
        if (!section || !root || !place || !place.id || !window.PravmirPilgrim) return;
        const rows = await window.PravmirPilgrim.getForPlace(place.id);
        if (!rows.length) return;
        root.replaceChildren(...rows.map(row => {
            const item = row.item;
            const link = document.createElement('a');
            link.className = 'data-object-content-card';
            link.href = '../' + item.canonical_path;
            const kicker = document.createElement('span');
            kicker.className = 'data-object-content-kicker';
            kicker.textContent = row.kind === 'amenity' ? 'Инфраструктура' : 'Паломнический сервис';
            const title = document.createElement('strong');
            title.textContent = item.name || item.title;
            const summary = document.createElement('span');
            const verified = item.freshness && item.freshness.verified_at ? 'проверено ' + item.freshness.verified_at : 'источник проверен';
            summary.textContent = [item.address || item.provider_name || '', verified].filter(Boolean).join(' · ');
            link.append(kicker, title, summary);
            return link;
        }));
        section.hidden = false;
    }

    function renderExternalLink(place, facts) {
        const official = safeHttpUrl(place.links && place.links.official_url);
        if (!official) return;
        const dt = document.createElement('dt');
        dt.textContent = 'Сайт';
        const dd = document.createElement('dd');
        const link = document.createElement('a');
        link.href = official;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Открыть официальный сайт';
        dd.appendChild(link);
        facts.append(dt, dd);
    }

    function renderPlace(place) {
        const region = placeRegion(place);
        const address = placeAddress(place);
        const type = placeType(place);
        const category = asText(place.category) || window.PravmirData.typeLabel(type);
        const title = asText(place.name) || 'Без названия';
        const description = asText((place.descriptions || {}).short || place.description);

        document.title = `${title} — Православный Мир`;
        $('objectBreadcrumbs').lastElementChild.textContent = title;
        $('objectCategory').textContent = category;
        $('objectTitle').textContent = title;
        $('objectLocation').textContent = [region, address && address !== region ? address : ''].filter(Boolean).join(' · ');
        $('objectIcon').innerHTML = typeIcon(type);
        $('objectLead').textContent = description || 'Подробное описание для этого объекта пока не добавлено.';
        renderTags(place);
        renderDescription(place);
        renderList('dedicationsSection', 'objectDedications', place.dedications);
        renderList('architectsSection', 'objectArchitects', place.architects);
        renderSource(place);

        const facts = $('objectFacts');
        addFact(facts, 'Тип', category);
        addFact(facts, 'Статус', statusText(place));
        addFact(facts, 'Регион', region);
        addFact(facts, 'Адрес', address);
        addFact(facts, 'Основание', foundationText(place));
        if (place.location && place.location.precision) addFact(facts, 'Координаты', place.location.precision === 'exact' ? 'уточнены' : place.location.precision);
        renderExternalLink(place, facts);

        const target = window.PravmirData.toMapTarget(place);
        const mapBtn = $('objectMapBtn');
        const routeBtn = $('objectRouteBtn');
        if (!target) {
            mapBtn.disabled = true;
            routeBtn.disabled = true;
            mapBtn.title = 'Координаты объекта не указаны';
            routeBtn.title = 'Координаты объекта не указаны';
        } else {
            mapBtn.addEventListener('click', () => {
                sessionStorage.setItem('mapTarget', JSON.stringify(target));
                window.location.href = window.PravmirData.mapUrl();
            });
            routeBtn.addEventListener('click', () => {
                sessionStorage.setItem('mapRoute', JSON.stringify({ lat: target.lat, lon: target.lon, name: target.name }));
                window.location.href = window.PravmirData.mapUrl();
            });
        }

        $('objectLoading').hidden = true;
        $('objectContent').hidden = false;
    }

    async function bindFavorite(place) {
        const btn = $('objectFavoriteBtn');
        if (!btn) return;
        if (!window.PravmirMyPm) { btn.disabled = true; btn.title = 'Мой ПМ недоступен'; return; }
        await window.PravmirMyPm.init();
        const ref = { kind: 'place', id: place.id };
        async function paint() {
            const active = await window.PravmirMyPm.has('favorites', ref);
            btn.textContent = active ? '♥ В избранном' : '♡ В избранное';
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        await paint();
        btn.addEventListener('click', async function () { await window.PravmirMyPm.toggle('favorites', ref); await paint(); });
    }

    function showError(message) {
        $('objectLoading').hidden = true;
        $('objectContent').hidden = true;
        $('objectErrorText').textContent = message || 'Проверьте ссылку или вернитесь в каталог.';
        $('objectError').hidden = false;
    }

    async function loadObject() {
        if (!window.PravmirData) {
            showError('Единый слой данных недоступен.');
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const slug = asText(params.get('slug'));
        const id = asText(params.get('id'));
        if (!slug && !id) {
            showError('В ссылке отсутствует идентификатор объекта.');
            return;
        }
        try {
            const place = slug
                ? await window.PravmirData.getPlaceBySlug(slug)
                : await window.PravmirData.getPlaceById(id);
            if (!place) {
                showError('Такого объекта нет в текущем каталоге.');
                return;
            }
            renderPlace(place);
            await bindFavorite(place);
            await Promise.all([renderRelatedEntities(place), renderRelatedRoutes(place), renderRelatedPlaces(place), renderRelatedContent(place), renderRelatedNews(place), renderPilgrimInfrastructure(place)]);
        } catch (error) {
            console.error('Ошибка загрузки карточки объекта:', error);
            showError('Не удалось загрузить данные объекта.');
        }
    }

    document.addEventListener('DOMContentLoaded', loadObject);
})();
