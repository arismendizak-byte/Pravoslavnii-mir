(function (global) {
    'use strict';

    let allData = [];

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>'"]/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch];
        });
    }

    function typeLabel(type) {
        if (type === 'saint') return 'Святой';
        if (type === 'icon') return 'Икона';
        if (type === 'relic') return 'Мощи';
        if (type === 'shrine') return 'Святыня';
        return 'Святыня';
    }

    function relationLabel(type) {
        if (type === 'relics_at') return 'Мощи / почитание связано с местом';
        if (type === 'located_at') return 'Связано с местом';
        if (type === 'relic_of') return 'Мощи святого';
        return String(type || 'Связь');
    }

    function verificationLabel(status) {
        return status === 'source_verified' ? 'Источник подтверждён' : 'Требует проверки';
    }

    function provenanceLabel(relation) {
        const provenance = relation && relation.provenance ? relation.provenance : {};
        return [
            provenance.source_title || provenance.provider,
            provenance.source_title && provenance.provider ? provenance.provider : '',
            provenance.checked_at ? 'проверено ' + provenance.checked_at : '',
            provenance.source_file,
            provenance.source_id ? '#' + provenance.source_id : ''
        ].filter(Boolean).join(' · ');
    }

    function appendSourceLink(container, relation) {
        const provenance = relation && relation.provenance ? relation.provenance : {};
        const url = String(provenance.source_url || '').trim();
        if (!/^https:\/\//i.test(url)) return;
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Открыть источник';
        container.append(' · ', link);
    }

    function qualityLabel(flag) {
        const labels = {
            legacy_location_link_conflict: 'В прежних данных ссылка противоречила описанию местонахождения; эта связь исключена.',
            location_unresolved_to_canonical_place: 'Описание местонахождения сохранено, но связь с местом в каталоге не подтверждена.',
            saint_reference_unresolved: 'Связь с указанным святым пока не подтверждена.'
        };
        return labels[flag] || flag;
    }

    function routeAction(item) {
        const href = global.PravmirData.routesUrl({ entity: item.id, search: item.name });
        return `<a href="${escapeHtml(href)}" class="btn-route">🗺️ Маршруты</a>`;
    }

    function entityAction(item) {
        const href = global.PravmirData.entityDetailUrl(item);
        return `<a href="${escapeHtml(href)}" class="btn-location">Связи и источники</a>`;
    }

    function renderHoliness(data) {
        const grid = document.getElementById('holinessGrid');
        grid.innerHTML = '';

        if (!data.length) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
                    <span style="font-size:48px;display:block;">🔍</span>
                    <p>Ничего не найдено по вашему запросу</p>
                </div>`;
            return;
        }

        data.forEach(function (item) {
            const card = document.createElement('article');
            card.className = 'holiness-card';
            let metaHtml = '';

            if (item.entity_type === 'saint') {
                metaHtml = `
                    <div class="holiness-meta">
                        ${item.feast_day ? `<span class="holiness-feast">📅 ${escapeHtml(item.feast_day)}</span>` : ''}
                        ${item.location_text ? `<span class="holiness-location">⛪ ${escapeHtml(item.location_text)}</span>` : ''}
                    </div>`;
            } else if (item.entity_type === 'icon') {
                metaHtml = item.location_text ? `<div class="holiness-meta"><span class="holiness-location">📍 ${escapeHtml(item.location_text)}</span></div>` : '';
            } else if (item.entity_type === 'relic') {
                metaHtml = `
                    <div class="holiness-meta">
                        ${item.saint_name ? `<span class="holiness-feast">🙏 ${escapeHtml(item.saint_name)}</span>` : ''}
                        ${item.location_text ? `<span class="holiness-location">⛪ ${escapeHtml(item.location_text)}</span>` : ''}
                    </div>`;
            }

            const detailHref = global.PravmirData.entityDetailUrl(item);
            card.innerHTML = `
                <div class="holiness-card-img">${escapeHtml(item.emoji || '✦')}</div>
                <div class="holiness-body">
                    <div class="holiness-tag">${typeLabel(item.entity_type)}</div>
                    <a class="holiness-name holiness-name-link" href="${escapeHtml(detailHref)}">${escapeHtml(item.name)}</a>
                    <div class="holiness-title">${escapeHtml(item.title || '')}</div>
                    <div class="holiness-desc">${escapeHtml(item.description || '')}</div>
                    ${metaHtml}
                    <div class="holiness-verification ${item.verification_status === 'source_verified' ? 'verified' : 'unverified'}">${verificationLabel(item.verification_status)}</div>
                    <div class="holiness-actions">
                        ${entityAction(item)}
                        ${routeAction(item)}
                    </div>
                </div>`;
            grid.appendChild(card);
        });
    }

    function createText(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = value;
        return node;
    }

    function placeRegion(place) {
        return String(place && place.address && place.address.region || '').trim();
    }

    function placeAddress(place) {
        return String(place && place.address && place.address.formatted || '').trim();
    }

    function traversalReasonLabel(reason) {
        const labels = {
            direct_relation: 'Прямая связь',
            shared_place_or_entity: 'Общее место или святыня',
            route_via_graph_relation: 'Маршрут через связанное место',
            direct_route_stop: 'Прямая остановка маршрута',
            route_via_shared_place: 'Общее место на маршруте'
        };
        return labels[reason] || 'Связь через места и святыни';
    }

    async function renderEntityDetail(entity) {
        const section = document.getElementById('entityDetail');
        const root = document.getElementById('entityDetailContent');
        if (!section || !root) return;
        root.replaceChildren();

        const top = document.createElement('div');
        top.className = 'entity-detail-top';
        const copy = document.createElement('div');
        copy.className = 'entity-detail-copy';
        copy.append(
            createText('div', 'entity-detail-type', typeLabel(entity.entity_type)),
            createText('h2', 'entity-detail-name', entity.name),
            createText('div', 'entity-detail-title', entity.title || '')
        );
        if (entity.description) copy.appendChild(createText('p', 'entity-detail-description', entity.description));
        if (entity.location_text) {
            const legacy = createText('p', 'entity-detail-location', 'Местонахождение в прежнем описании: ' + entity.location_text);
            legacy.title = 'Описание не является подтверждением связи с местом в каталоге.';
            copy.appendChild(legacy);
        }

        const side = document.createElement('div');
        side.className = 'entity-detail-side';
        const verification = createText('span', 'entity-detail-badge ' + (entity.verification_status === 'source_verified' ? 'verified' : 'unverified'), verificationLabel(entity.verification_status));
        side.appendChild(verification);
        const close = document.createElement('a');
        close.href = global.PravmirData.resolveSiteUrl('holiness.html');
        close.className = 'entity-detail-close';
        close.textContent = 'Все святыни';
        side.appendChild(close);
        top.append(copy, side);
        root.appendChild(top);

        const flags = Array.isArray(entity.quality_flags) ? entity.quality_flags : [];
        if (flags.length) {
            const quality = document.createElement('div');
            quality.className = 'entity-detail-quality';
            quality.appendChild(createText('h3', '', 'Quality / проверка'));
            const list = document.createElement('ul');
            flags.forEach(flag => list.appendChild(createText('li', '', qualityLabel(flag))));
            quality.appendChild(list);
            root.appendChild(quality);
        }

        const related = await global.PravmirData.getRelatedPlacesForEntity(entity.id);
        const relationsBlock = document.createElement('div');
        relationsBlock.className = 'entity-detail-relations';
        relationsBlock.appendChild(createText('h3', '', 'Связанные места'));
        if (!related.length) {
            relationsBlock.appendChild(createText('p', 'entity-detail-empty', 'Подтверждённой связи с местом в каталоге пока нет. Выше сохранено исходное описание.'));
        } else {
            const list = document.createElement('div');
            list.className = 'entity-place-list';
            related.forEach(function (row) {
                const card = document.createElement('article');
                card.className = 'entity-place-card';
                const link = document.createElement('a');
                link.className = 'entity-place-name';
                link.href = global.PravmirData.placeDetailUrl(row.place);
                link.textContent = row.place.name || 'Без названия';
                const meta = createText('div', 'entity-place-meta', [placeRegion(row.place), placeAddress(row.place)].filter(Boolean).join(' · '));
                const rel = createText('div', 'entity-place-relation', relationLabel(row.relation.relation_type));
                const status = createText('span', 'entity-detail-badge ' + (row.relation.verification_status === 'source_verified' ? 'verified' : 'unverified'), verificationLabel(row.relation.verification_status));
                const sourceText = provenanceLabel(row.relation);
                const source = createText('div', 'entity-place-source', sourceText ? 'Источник связи: ' + sourceText : 'Источник связи не указан');
                appendSourceLink(source, row.relation);
                card.append(link, meta, rel, status, source);
                list.appendChild(card);
            });
            relationsBlock.appendChild(list);
        }
        root.appendChild(relationsBlock);

        const [relatedEntities, routeSuggestions] = await Promise.all([
            global.PravmirData.getRelatedEntitiesForEntity(entity.id),
            global.PravmirData.getRouteSuggestionsForEntity(entity.id)
        ]);

        if (relatedEntities.length) {
            const entitiesBlock = document.createElement('div');
            entitiesBlock.className = 'entity-detail-related';
            entitiesBlock.appendChild(createText('h3', '', 'Связанные сущности'));
            const list = document.createElement('div');
            list.className = 'entity-graph-list';
            relatedEntities.forEach(function (row) {
                const link = document.createElement('a');
                link.className = 'entity-graph-card';
                link.href = global.PravmirData.entityDetailUrl(row.node);
                link.append(
                    createText('strong', '', row.node.name || 'Без названия'),
                    createText('span', '', typeLabel(row.node.entity_type) + ' · ' + traversalReasonLabel(row.reason) + ' · ' + row.depth + ' переход' + (row.depth === 1 ? '' : 'а'))
                );
                list.appendChild(link);
            });
            entitiesBlock.appendChild(list);
            root.appendChild(entitiesBlock);
        }

        if (routeSuggestions.length) {
            const routesBlock = document.createElement('div');
            routesBlock.className = 'entity-detail-related';
            routesBlock.appendChild(createText('h3', '', 'Связанные маршруты'));
            const list = document.createElement('div');
            list.className = 'entity-graph-list';
            routeSuggestions.forEach(function (row) {
                const link = document.createElement('a');
                link.className = 'entity-graph-card';
                link.href = global.PravmirData.routeDetailUrl(row.node);
                link.append(
                    createText('strong', '', row.node.title || 'Маршрут'),
                    createText('span', '', traversalReasonLabel(row.reason) + ' · ' + row.depth + ' переход' + (row.depth === 1 ? '' : 'а'))
                );
                list.appendChild(link);
            });
            routesBlock.appendChild(list);
            root.appendChild(routesBlock);
        }

        if (global.PravmirContent) {
            const contentLinks = await global.PravmirContent.getRelated({ kind: 'entity', id: entity.id });
            const contentRows = contentLinks.filter(function (row) {
                return row.target && row.target.kind === 'content' && row.resolved && row.resolved.item;
            });
            if (contentRows.length) {
                const contentBlock = document.createElement('div');
                contentBlock.className = 'entity-detail-related';
                contentBlock.appendChild(createText('h3', '', 'Материалы по теме'));
                const list = document.createElement('div');
                list.className = 'entity-content-list';
                contentRows.forEach(function (row) {
                    const item = row.resolved.item;
                    const link = document.createElement('a');
                    link.className = 'entity-content-card';
                    link.href = global.PravmirData.resolveSiteUrl(item.canonical_path);
                    link.append(
                        createText('strong', '', item.title || 'Материал'),
                        createText('span', '', item.summary || 'Открыть связанный материал')
                    );
                    list.appendChild(link);
                });
                contentBlock.appendChild(list);
                root.appendChild(contentBlock);
            }
        }

        const sources = document.createElement('div');
        sources.className = 'entity-detail-sources';
        sources.appendChild(createText('h3', '', 'Происхождение entity'));
        const sourceList = document.createElement('ul');
        (entity.source_records || []).forEach(function (record) {
            const label = [record.provider, record.source_file, record.source_id ? '#' + record.source_id : ''].filter(Boolean).join(' · ');
            sourceList.appendChild(createText('li', '', label));
        });
        if (!sourceList.children.length) sourceList.appendChild(createText('li', '', 'Источник не указан'));
        sources.appendChild(sourceList);
        root.appendChild(sources);

        section.hidden = false;
    }

    async function applySearchAndFilter() {
        const searchText = document.getElementById('holinessSearch').value.trim();
        const active = document.querySelector('.filter-btn.active');
        const type = active ? active.dataset.filter : 'all';
        const filtered = await global.PravmirData.getEntities({ query: searchText, type: type });
        renderHoliness(filtered);
    }

    async function init() {
        try {
            allData = await global.PravmirData.getEntities();
            const params = new URLSearchParams(global.location.search);
            const searchText = String(params.get('search') || '').trim();
            const entityId = String(params.get('entity') || '').trim();
            const requestedType = String(params.get('type') || '').trim();
            const input = document.getElementById('holinessSearch');
            if (searchText) input.value = searchText;

            if (['saint', 'icon', 'relic'].includes(requestedType)) {
                document.querySelectorAll('.filter-btn').forEach(function (btn) {
                    btn.classList.toggle('active', btn.dataset.filter === requestedType);
                });
            }

            document.querySelectorAll('.filter-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    document.querySelectorAll('.filter-btn').forEach(function (other) { other.classList.remove('active'); });
                    btn.classList.add('active');
                    applySearchAndFilter();
                });
            });
            input.addEventListener('input', applySearchAndFilter);

            await applySearchAndFilter();
            if (entityId) {
                const entity = await global.PravmirData.getEntityById(entityId);
                if (entity) await renderEntityDetail(entity);
                else {
                    const section = document.getElementById('entityDetail');
                    const root = document.getElementById('entityDetailContent');
                    root.replaceChildren(createText('p', 'entity-detail-empty', 'Entity с таким stable ID не найдена.'));
                    section.hidden = false;
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки графа святынь:', error);
            document.getElementById('holinessGrid').innerHTML = '<p style="text-align:center;color:var(--text-muted);">Не удалось загрузить данные святынь.</p>';
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})(window);
