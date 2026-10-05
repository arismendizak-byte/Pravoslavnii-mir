(function () {
    'use strict';

    function byId(id) { return document.getElementById(id); }
    function appendMeta(container, value, className) {
        if (!value) return;
        if (container.childNodes.length) container.appendChild(document.createTextNode(' • '));
        const span = document.createElement('span');
        if (className) span.className = className;
        span.textContent = value;
        container.appendChild(span);
    }
    function verificationLabel(value) {
        return {
            legacy_curated: 'материал из прежней версии, источник требует проверки',
            source_verified: 'источник проверен',
            editorial_verified: 'проверено редакцией'
        }[value] || 'статус проверки не указан';
    }
    async function saveReadLater(item) {
        const btn = byId('readLaterBtn');
        if (!window.PravmirMyPm) { btn.textContent = 'Сохранение недоступно'; return; }
        try {
            await window.PravmirMyPm.init();
            const ref = { kind: 'content', id: item.id };
            if (!(await window.PravmirMyPm.has('read_later', ref))) await window.PravmirMyPm.add('read_later', ref);
            btn.textContent = '✓ В списке';
            btn.setAttribute('aria-pressed', 'true');
        } catch (error) {
            console.warn('My PM read-later unavailable', error);
            btn.textContent = 'Не удалось сохранить';
        }
    }

    function resolvedItem(resolved) {
        return resolved && resolved.item ? resolved.item : resolved;
    }
    function refKindLabel(kind) {
        return ({place:'Место',entity:'Святыня или святой',route:'Маршрут',feast:'Праздник',saint:'Святой',calendar_day:'День календаря',commemoration:'Память',fasting_rule:'Пост',reading:'Чтение'})[kind] || 'Связанный объект';
    }
    function relationLabel(type) {
        return ({about_entity:'Материал посвящён этой сущности',mentions_place:'Место упомянуто в материале',about_place:'Материал об этом месте',related_route:'Связанный маршрут',about_feast:'Материал о празднике'})[type] || 'Явная редакционная связь';
    }
    function refTitle(target, resolved) {
        const item = resolvedItem(resolved) || {};
        return item.title || item.name || item.display_name || item.label || target.id;
    }
    function refUrl(target, resolved) {
        if (!target || !resolved) return null;
        const item = resolvedItem(resolved);
        if (target.kind === 'place' && window.PravmirData && window.PravmirData.getDetailUrl) return window.PravmirData.getDetailUrl(item);
        if (target.kind === 'entity' && window.PravmirData && window.PravmirData.entityDetailUrl) return window.PravmirData.entityDetailUrl(item || target.id);
        if (target.kind === 'route' && window.PravmirData && window.PravmirData.routeDetailUrl) return window.PravmirData.routeDetailUrl(item || target.id);
        if (target.kind === 'calendar_day' && item && item.date) return '../calendar/day.html?date=' + encodeURIComponent(item.date);
        if (['feast','saint','commemoration','fasting_rule','reading'].includes(target.kind)) return '../calendar/item.html?kind=' + encodeURIComponent(target.kind) + '&id=' + encodeURIComponent(target.id);
        if (target.kind === 'content' && item && item.canonical_path) return '../' + item.canonical_path;
        return null;
    }

    async function init() {
        const api = window.PravmirContent;
        if (!api) throw new Error('PravmirContent unavailable');
        await api.init();
        const params = new URLSearchParams(window.location.search);
        const slug = params.get('slug');
        const id = params.get('id');
        const item = slug ? await api.getContentBySlug(slug) : (id ? await api.getContentById(id) : null);
        if (!item) throw new Error('Материал не найден');

        document.title = item.title + ' — Православный Мир';
        byId('breadcrumbTitle').textContent = item.title;
        byId('articleTitle').textContent = item.title;
        byId('articleSummary').textContent = item.summary || '';
        byId('articleSummary').hidden = !item.summary;
        byId('articleEmoji').innerHTML = window.PravmirUI.icon('book');
        const canonical = new URL('../' + item.canonical_path, window.location.href);
        byId('canonicalLink').href = canonical.href;

        const categories = await Promise.all((item.category_refs || []).map(function (ref) { return api.getCategoryById(ref); }));
        const catBox = byId('articleCategories');
        categories.filter(Boolean).forEach(function (row) { const span = document.createElement('span'); span.textContent = row.name; catBox.appendChild(span); });
        const meta = byId('articleMeta');
        appendMeta(meta, item.author || item.publisher, 'author');
        appendMeta(meta, item.published_label || item.published_on);
        appendMeta(meta, ({article:'Статья',external_article:'Внешний материал',news:'Новость',guide:'Путеводитель',recipe:'Рецепт'})[item.content_type]);

        byId('sourceStatus').textContent = 'Статус: ' + verificationLabel(item.verification_status) + '.';
        const sources = (item.source_records || []).map(function (source) {
            return source.provider + ' · ' + source.source_file + (source.source_row ? ' · строка ' + source.source_row : '');
        });
        byId('sourceDetails').textContent = sources.join(' | ');
        if (item.external_url) {
            const sourceLink = byId('externalSourceLink');
            sourceLink.href = item.external_url;
            sourceLink.hidden = false;
            byId('sourceHeading').textContent = 'Внешний источник';
        }
        byId('readLaterBtn').setAttribute('aria-live', 'polite');
        byId('readLaterBtn').setAttribute('aria-pressed', 'false');
        if (window.PravmirMyPm) {
            await window.PravmirMyPm.init();
            if (await window.PravmirMyPm.has('read_later', {kind:'content', id:item.id})) { byId('readLaterBtn').textContent = '✓ В списке'; byId('readLaterBtn').setAttribute('aria-pressed', 'true'); }
        }
        byId('readLaterBtn').addEventListener('click', function () { saveReadLater(item); });

        const body = await api.getArticleBody(item.id);
        const bodyNode = byId('articleBody');
        if (body) {
            bodyNode.innerHTML = body.html;
        } else {
            bodyNode.classList.add('is-empty');
            const p = document.createElement('p');
            p.textContent = item.external_url ? 'Полный текст опубликован на сайте источника. Здесь сохранены описание материала и сведения о его происхождении.' : 'Текст материала пока не добавлен. Посмотрите другие статьи в журнале.';
            bodyNode.appendChild(p);
        }

        const graph = await api.getRelated({ kind: 'content', id: item.id });
        if (graph.length) {
            const list = byId('graphLinksList');
            graph.forEach(function (row) {
                const card = document.createElement('article');
                card.className = 'article-graph-card';
                const kicker = document.createElement('span');
                kicker.className = 'article-graph-kicker';
                kicker.textContent = refKindLabel(row.target.kind);
                const title = document.createElement('strong');
                title.textContent = refTitle(row.target, row.resolved);
                const meta = document.createElement('span');
                meta.className = 'article-graph-meta';
                meta.textContent = relationLabel(row.link.relation_type) + ' · ' + (window.PravmirUI ? window.PravmirUI.statusLabel(row.link.verification_status) : row.link.verification_status);
                const url = refUrl(row.target, row.resolved);
                if (url) {
                    const link = document.createElement('a');
                    link.href = url;
                    link.className = 'article-graph-target';
                    link.append(title);
                    card.append(kicker, link, meta);
                } else {
                    card.append(kicker, title, meta);
                }
                list.appendChild(card);
            });
            byId('graphLinks').hidden = false;
        }

        const related = await api.getRelatedContent(item, { limit: 4 });
        if (related.length) {
            const grid = byId('relatedGrid');
            related.forEach(function (row) {
                const link = document.createElement('a');
                link.className = 'article-related-card';
                link.href = '../' + row.item.canonical_path;
                const strong = document.createElement('strong'); strong.textContent = row.item.title;
                const small = document.createElement('span'); small.textContent = row.reason === 'shared_category' ? 'Из той же категории' : 'На близкую тему';
                link.appendChild(strong); link.appendChild(small); grid.appendChild(link);
            });
            byId('relatedSection').hidden = false;
        }

        byId('articleLoading').hidden = true;
        byId('articleView').hidden = false;
    }

    document.addEventListener('DOMContentLoaded', function () {
        init().catch(function (error) {
            const loading = byId('articleLoading');
            loading.textContent = error && error.message ? error.message : 'Не удалось открыть материал.';
        });
    });
})();
