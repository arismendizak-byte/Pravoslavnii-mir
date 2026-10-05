(function () {
    'use strict';
    let renderVersion = 0, dateVersion = 0, dateIds = null;
    const ui = window.PravmirUI;
    function byId(id) { return document.getElementById(id); }
    function node(tag, className, value) {
        const el = document.createElement(tag); el.className = className || '';
        if (value != null) el.textContent = value; return el;
    }
    function typeLabel(v) { return ({soup:'Суп',main:'Основное блюдо',salad:'Салат',breakfast:'Завтрак',dessert:'Десерт',baking:'Выпечка',drink:'Напиток',other:'Другое'})[v] || 'Рецепт'; }
    function card(row) {
        const a = node('a', 'food-card'); a.href = row.canonical_path;
        a.appendChild(node('div', 'food-card-meta', typeLabel(row.recipe_type) + ' · ' + row.servings + ' порц. · ' + (row.prep_minutes + row.cook_minutes) + ' мин'));
        a.appendChild(node('h2', '', row.title));
        a.appendChild(node('p', '', row.summary));
        const tags = node('div', 'food-tags');
        (row.tags || []).slice(0, 4).forEach(function(t) { tags.appendChild(node('span', '', t)); });
        a.appendChild(tags);
        const fast = row.fasting_compatibility || {};
        const oil = ({none:'без масла',optional:'масло можно исключить',used:'с маслом'})[fast.oil_mode] || '';
        a.appendChild(node('div', 'food-fast', (fast.classification === 'general_fast_friendly' ? 'Постный по общему составу' : 'Праздничный рецепт') + (oil ? ' · ' + oil : '')));
        return a;
    }
    function resetFilters() {
        ['foodSearch','foodType','foodFasting','foodOil','foodDate'].forEach(function(id) { byId(id).value = ''; });
        dateIds = null; dateVersion++;
        byId('foodDateContext').textContent = 'Выберите дату для календарной подборки или смотрите все рецепты ниже.';
        render().catch(showError);
    }
    async function render() {
        const version = ++renderVersion;
        const box = byId('foodList'); box.setAttribute('aria-busy', 'true');
        const rows = await window.PravmirFood.getRecipes({q:byId('foodSearch').value,type:byId('foodType').value,fasting:byId('foodFasting').value,oil_mode:byId('foodOil').value,limit:500});
        if (version !== renderVersion) return;
        const filtered = dateIds ? rows.filter(function(row) { return dateIds.has(row.id); }) : rows;
        box.replaceChildren(); byId('foodError').hidden = true;
        byId('foodResultCount').textContent = 'Найдено рецептов: ' + filtered.length + (dateIds ? ' · подборка к выбранной дате' : '');
        if (!filtered.length) {
            const empty = node('div', 'food-empty', dateIds ? 'Для выбранной даты и фильтров рецептов пока нет. Можно открыть общую подборку.' : 'Ничего не найдено. Попробуйте другое блюдо или сбросьте фильтры.');
            const reset = node('button', 'empty-reset', 'Все рецепты'); reset.type = 'button';
            reset.addEventListener('click', resetFilters); empty.appendChild(reset); box.appendChild(empty);
        } else filtered.forEach(function(row) { box.appendChild(card(row)); });
        box.setAttribute('aria-busy', 'false');
    }
    async function renderDate() {
        const version = ++dateVersion;
        const date = byId('foodDate').value, ctx = byId('foodDateContext');
        if (!date) { dateIds = null; ctx.textContent = 'Выберите дату для календарной подборки или смотрите все рецепты ниже.'; await render(); return; }
        ctx.textContent = 'Подбираем рецепты к дате…';
        const result = await window.PravmirFood.getForDate(date);
        if (version !== dateVersion) return;
        dateIds = new Set(result.recipes.map(function(row) { return row.id; }));
        const parts = [ui.dateLabel(date)];
        if (result.feasts.length) parts.push(result.feasts.map(function(x) { return x.title; }).join(', '));
        if (result.fasting_rules.length) parts.push(result.fasting_rules.map(function(x) { return x.title; }).join(', '));
        parts.push(result.recipes.length ? 'В подборке: ' + result.recipes.length : 'Отдельной подборки для этой даты пока нет');
        ctx.textContent = parts.join(' · ') + '. ' + result.disclaimer;
        await render();
    }
    async function init() {
        if (!window.PravmirFood) throw new Error('PravmirFood unavailable');
        const stats = await window.PravmirFood.init();
        byId('foodTrust').textContent = 'В подборке ' + stats.recipes + ' редакционных рецептов. ' + stats.disclaimer;
        ['foodSearch','foodType','foodFasting','foodOil'].forEach(function(id) {
            byId(id).addEventListener(id === 'foodSearch' ? 'input' : 'change', function() { render().catch(showError); });
        });
        byId('foodDate').addEventListener('change', function() { renderDate().catch(showError); });
        const date = new URLSearchParams(location.search).get('date');
        if (date) byId('foodDate').value = date;
        if (byId('foodDate').value) await renderDate(); else await render();
    }
    function showError(error) {
        console.warn('Food unavailable', error);
        const box = byId('foodError'); box.hidden = false;
        box.replaceChildren(node('p', '', 'Не удалось загрузить рецепты. Проверьте соединение и попробуйте ещё раз.'));
        const retry = node('button', 'retry-button', 'Обновить страницу'); retry.type = 'button';
        retry.addEventListener('click', function() { window.location.reload(); }); box.appendChild(retry);
        byId('foodList').setAttribute('aria-busy', 'false');
    }
    document.addEventListener('DOMContentLoaded', function() { init().catch(showError); });
})();
