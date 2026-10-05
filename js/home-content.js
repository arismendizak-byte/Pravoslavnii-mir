(function () {
    'use strict';
    function node(tag, className, value) {
        const el = document.createElement(tag); if (className) el.className = className; if (value != null) el.textContent = String(value); return el;
    }
    function hrefFor(item) { return item.canonical_path || ('articles/article.html?slug=' + encodeURIComponent(item.slug)); }
    async function init() {
        const featured = document.getElementById('homeJournalFeatured');
        const list = document.getElementById('homeJournalList');
        if (!featured || !list || !window.PravmirContent) return;
        const rows = await window.PravmirContent.getContentItems({ limit: 3 });
        if (!rows.length) { featured.textContent = 'Материалы пока не опубликованы.'; return; }
        const first = rows[0];
        const main = node('a', 'journal-main'); main.href = hrefFor(first);
        const mainVisual = node('div', 'journal-main-img'); mainVisual.innerHTML = window.PravmirUI.icon('book'); main.appendChild(mainVisual);
        const body = node('div', 'journal-main-body');
        body.appendChild(node('span', 'journal-tag', (first.tags || [first.content_type])[0] || first.content_type));
        body.appendChild(node('div', 'journal-main-title', first.title));
        if (first.summary) body.appendChild(node('div', 'journal-main-sub', first.summary));
        body.appendChild(node('div', 'journal-date', first.published_label || first.published_on || ''));
        main.appendChild(body);
        featured.replaceWith(main);
        list.innerHTML = '';
        rows.slice(1,3).forEach(function (item) {
            const link = node('a', 'journal-small'); link.href = hrefFor(item);
            const visual = node('div', 'journal-small-img'); visual.innerHTML = window.PravmirUI.icon('book'); link.appendChild(visual);
            const wrap = node('div'); wrap.appendChild(node('div', 'journal-small-title', item.title)); wrap.appendChild(node('div', 'journal-small-date', item.published_label || item.published_on || ''));
            link.appendChild(wrap); list.appendChild(link);
        });
    }
    async function renderRoutes() {
        const grid = document.getElementById('homeRoutePreview');
        if (!grid) return;
        try {
            if (!window.PravmirData) throw new Error('PravmirData unavailable');
            const rows = await window.PravmirData.getRoutes({ limit: 4 });
            grid.replaceChildren();
            rows.forEach(function (route) {
                const link = node('a', 'route-card');
                link.href = window.PravmirData.routeDetailUrl(route);
                const visual = node('div', 'route-card-img');
                visual.innerHTML = window.navIcon ? window.navIcon('route') : '';
                const body = node('div', 'route-card-body');
                body.appendChild(node('div', 'route-card-title', route.title));
                body.appendChild(node('div', 'route-card-region', route.location || ''));
                body.appendChild(node('p', 'route-preview-description', route.description));
                if (route.duration) body.appendChild(node('div', 'route-meta', 'По исходному описанию: ' + route.duration));
                body.appendChild(node('div', 'route-preview-status', route.verification_status === 'source_verified' ? 'Источник проверен' : 'Маршрут из прежней версии · требует проверки'));
                body.appendChild(node('div', 'route-link', 'Открыть маршрут →'));
                link.append(visual, body); grid.appendChild(link);
            });
            if (!rows.length) grid.appendChild(node('div', 'home-state', 'Маршруты пока не добавлены.'));
        } catch (error) {
            grid.replaceChildren(node('div', 'home-state', 'Не удалось загрузить маршруты. Откройте раздел «Паломничество» или попробуйте позже.'));
            console.warn('home route preview unavailable', error);
        } finally { grid.setAttribute('aria-busy', 'false'); }
    }
    document.addEventListener('DOMContentLoaded', function () {
        renderRoutes();
        init().catch(function (error) {
            const featured = document.getElementById('homeJournalFeatured');
            if (featured) { featured.textContent = 'Не удалось загрузить материалы. Откройте журнал или попробуйте позже.'; featured.setAttribute('aria-busy', 'false'); }
            console.warn('home journal preview unavailable', error);
        });
    });
})();
