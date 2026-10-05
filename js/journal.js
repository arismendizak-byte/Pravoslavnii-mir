(function () {
    'use strict';

    const state = { tab: 'our', sub: 'articles', q: '', category: '', author: '' };
    const el = {};

    function text(node, value) { node.textContent = value == null ? '' : String(value); return node; }
    function create(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (value != null) text(node, value);
        return node;
    }

    function sourceLabel(item) {
        return item.external_url ? (item.publisher || 'Внешний источник') : 'Православный Мир';
    }

    async function storeReadLater(item) {
        if (!window.PravmirMyPm) return false;
        try {
            await window.PravmirMyPm.init();
            const ref = { kind: 'content', id: item.id };
            if (!(await window.PravmirMyPm.has('read_later', ref))) await window.PravmirMyPm.add('read_later', ref);
            return true;
        } catch (error) {
            console.warn('My PM read-later unavailable', error);
            return false;
        }
    }

    function makeCard(item, categoriesById) {
        const card = create('article', 'article-card');
        const link = create('a');
        link.href = item.canonical_path;
        link.className = 'article-card-link';
        link.style.cssText = 'color:inherit;text-decoration:none;display:block;';

        const visual = create('div', 'article-img');
        visual.innerHTML = window.PravmirUI.icon('book');
        const body = create('div', 'article-body');
        const source = create('div', 'article-source');
        source.appendChild(create('span', 'article-source-badge', sourceLabel(item)));
        source.appendChild(document.createTextNode(item.external_url ? ' · внешний источник' : ' · материал журнала'));
        body.appendChild(source);

        const categoryNames = (item.category_refs || []).map(function (id) { return categoriesById.get(id); }).filter(Boolean).map(function (row) { return row.name; });
        const tag = create('div', 'article-tag' + (item.content_type === 'news' ? ' news-tag' : ''), categoryNames[0] || item.content_type);
        if (item.content_type !== 'news') tag.style.cssText = 'background:var(--gold-pale);color:var(--dark-2);';
        body.appendChild(tag);
        body.appendChild(create('div', 'article-title', item.title));
        if (item.summary) body.appendChild(create('div', 'article-desc', item.summary));
        const meta = create('div', 'article-meta');
        meta.appendChild(create('span', 'article-author', item.author || item.publisher || '—'));
        meta.appendChild(create('span', 'article-date', item.published_label || item.published_on || '—'));
        body.appendChild(meta);
        const actions = create('div', 'article-card-actions');
        const read = create('a', 'article-link', item.external_url ? 'Карточка источника →' : 'Читать →');
        read.href = item.canonical_path; actions.appendChild(read);
        const later = create('button', 'btn-read-later');
        later.innerHTML = window.PravmirUI.icon('book');
        later.type = 'button';
        later.title = 'Читать позже';
        later.setAttribute('aria-label', 'Добавить в читать позже');
        later.setAttribute('aria-live', 'polite');
        later.addEventListener('click', async function () {
            const saved = await storeReadLater(item);
            later.textContent = saved ? '✓' : '!';
            later.setAttribute('aria-label', saved ? 'Сохранено в читать позже' : 'Не удалось сохранить на устройстве');
            later.title = saved ? 'Сохранено' : 'Сохранение в браузере недоступно';
        });
        actions.appendChild(later);
        link.appendChild(visual); link.appendChild(body); card.appendChild(link);
        card.appendChild(actions);
        return card;
    }

    function renderGrid(container, rows, categoriesById) {
        container.innerHTML = '';
        if (!rows.length) { container.appendChild(create('div', 'journal-state', 'По выбранным фильтрам материалов нет.')); return; }
        rows.forEach(function (item) { container.appendChild(makeCard(item, categoriesById)); });
    }

    function currentFilter() {
        return { q: state.q, category_ref: state.category, author_ref: state.author, limit: 200 };
    }

    async function render() {
        const api = window.PravmirContent;
        const categories = await api.getCategories();
        const categoriesById = new Map(categories.map(function (row) { return [row.id, row]; }));
        const base = currentFilter();
        const local = await api.getContentItems(Object.assign({}, base, { types: ['article', 'guide', 'recipe'] }));
        const externalArticles = await api.getContentItems(Object.assign({}, base, { type: 'external_article' }));
        const news = await api.getContentItems(Object.assign({}, base, { type: 'news' }));
        renderGrid(el.our, local, categoriesById);
        renderGrid(el.externalArticles, externalArticles, categoriesById);
        renderGrid(el.externalNews, news, categoriesById);
        text(el.ourCount, local.length);
        text(el.externalCount, externalArticles.length + news.length);
        text(el.externalArticlesCount, externalArticles.length);
        text(el.externalNewsCount, news.length);
    }

    function switchTab(tab) {
        state.tab = tab === 'external' ? 'external' : 'our';
        document.querySelectorAll('.journal-tab').forEach(function (node) {
            const active = node.dataset.tab === state.tab;
            node.classList.toggle('active', active);
            node.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.tab-content').forEach(function (node) { node.classList.toggle('active', node.id === 'tab-' + state.tab); });
        try { localStorage.setItem('journalTab', state.tab); } catch (_) {}
    }

    function switchSub(sub) {
        state.sub = sub === 'news' ? 'news' : 'articles';
        document.querySelectorAll('.rpz-subtab').forEach(function (node) { node.classList.toggle('active', node.dataset.sub === state.sub); });
        document.querySelectorAll('.rpz-sub-content').forEach(function (node) { node.classList.toggle('active', node.id === 'external-sub-' + state.sub); });
        try { localStorage.setItem('journalExternalSubtab', state.sub); } catch (_) {}
    }

    async function populateFilters() {
        const api = window.PravmirContent;
        const categories = await api.getCategories();
        const authors = await api.getAuthors();
        categories.forEach(function (row) { const option = create('option', '', row.name); option.value = row.id; el.category.appendChild(option); });
        authors.forEach(function (row) { const option = create('option', '', row.name); option.value = row.id; el.author.appendChild(option); });
    }

    async function init() {
        if (!window.PravmirContent) throw new Error('PravmirContent unavailable');
        Object.assign(el, {
            our: document.getElementById('ourArticlesGrid'),
            externalArticles: document.getElementById('externalArticlesGrid'),
            externalNews: document.getElementById('externalNewsGrid'),
            ourCount: document.getElementById('ourCount'), externalCount: document.getElementById('externalCount'),
            externalArticlesCount: document.getElementById('externalArticlesCount'), externalNewsCount: document.getElementById('externalNewsCount'),
            search: document.getElementById('journalSearch'), category: document.getElementById('journalCategory'), author: document.getElementById('journalAuthor')
        });
        await window.PravmirContent.init();
        await populateFilters();
        let savedTab = 'our'; let savedSub = 'articles';
        try { savedTab = localStorage.getItem('journalTab') || 'our'; savedSub = localStorage.getItem('journalExternalSubtab') || 'articles'; } catch (_) {}
        switchTab(savedTab); switchSub(savedSub);
        document.querySelectorAll('.journal-tab').forEach(function (node) { node.addEventListener('click', function () { switchTab(node.dataset.tab); }); });
        document.querySelectorAll('.rpz-subtab').forEach(function (node) { node.addEventListener('click', function () { switchSub(node.dataset.sub); }); });
        let debounce = null;
        el.search.addEventListener('input', function () { clearTimeout(debounce); debounce = setTimeout(function () { state.q = el.search.value.trim(); render(); }, 180); });
        el.category.addEventListener('change', function () { state.category = el.category.value; render(); });
        el.author.addEventListener('change', function () { state.author = el.author.value; render(); });
        await render();
    }

    document.addEventListener('DOMContentLoaded', function () {
        init().catch(function (error) {
            console.error(error);
            ['ourArticlesGrid','externalArticlesGrid','externalNewsGrid'].forEach(function (id) {
                const node = document.getElementById(id); if (node) node.innerHTML = '<div class="journal-state">Не удалось загрузить журнал.</div>';
            });
        });
    });
})();
