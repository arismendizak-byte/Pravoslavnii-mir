(function () {
    'use strict';
    const ui = window.PravmirUI;
    let eventCount = 0, renderVersion = 0;
    function byId(id) { return document.getElementById(id); }
    function node(tag, className, value) { const el=document.createElement(tag); el.className=className||''; if(value!=null)el.textContent=value; return el; }
    function typeLabel(value) { return ({service:'Богослужение',procession:'Крестный ход',lecture:'Лекция',pilgrimage_trip:'Паломническая поездка',parish_event:'Приходское событие',pilgrim_event:'Паломническое событие',meeting:'Встреча',other:'Событие'})[value] || 'Событие'; }
    function card(row) {
        const a = node('a', 'event-card'); a.href = row.canonical_path;
        const head = node('div', 'event-card-head');
        head.append(node('span', 'event-type', typeLabel(row.event_type)), node('span', 'event-card-status', ui.statusLabel(row.status)));
        a.append(head, node('h2','',row.title), node('div','event-card-when',ui.eventTime(row)));
        if (row.summary) a.appendChild(node('p','',row.summary));
        const place = (row.venue && [row.venue.name,row.venue.address].filter(Boolean).join(' · ')) || '';
        if (place) a.appendChild(node('div','event-card-place',place));
        return a;
    }
    async function render() {
        const api=window.PravmirEvents;
        if(!api)throw new Error('PravmirEvents unavailable');
        const version=++renderVersion, list=byId('eventList');
        list.setAttribute('aria-busy','true');
        const from=byId('eventFrom').value, to=byId('eventTo').value;
        list.replaceChildren();
        if(from && to && from > to) {
            list.appendChild(node('div','event-empty','Дата окончания должна быть не раньше даты начала.'));
            list.setAttribute('aria-busy','false'); return;
        }
        const rows=await api.getEvents({q:byId('eventSearch').value,type:byId('eventType').value,from:from||undefined,to:to||undefined,limit:500});
        if(version!==renderVersion)return;
        byId('eventError').hidden=true;
        if(!rows.length) {
            const empty=node('div','event-empty');
            empty.appendChild(node('strong','',eventCount ? 'По выбранным фильтрам событий нет.' : 'Подтверждённых событий пока нет.'));
            empty.appendChild(node('span','',eventCount ? 'Измените тип события или диапазон дат.' : 'Афиша наполняется. Демонстрационные записи не публикуются как реальные церковные события.'));
            const calendar=node('a','','Открыть календарь →'); calendar.href='calendar.html';
            const routes=node('a','','Выбрать маршрут →'); routes.href='routes/routes.html';
            empty.append(calendar,routes); list.appendChild(empty);
        } else rows.forEach(function(row){list.appendChild(card(row));});
        list.setAttribute('aria-busy','false');
    }
    async function init() {
        const api=window.PravmirEvents;
        if(!api)throw new Error('PravmirEvents unavailable');
        const stats=await api.init(); eventCount=stats.events;
        byId('eventTrust').textContent=eventCount ? 'Опубликовано событий: '+eventCount+'. Перед поездкой уточняйте расписание у организатора.' : 'Здесь появятся события после проверки источника и организатора. Черновики и демонстрационные записи остаются вне афиши.';
        ['eventSearch','eventType','eventFrom','eventTo'].forEach(function(id){byId(id).addEventListener(id==='eventSearch'?'input':'change',function(){render().catch(showError);});});
        await render();
    }
    function showError(error) {
        console.warn('Events unavailable',error);
        const box=byId('eventError'); box.hidden=false;
        box.replaceChildren(node('p','','Не удалось загрузить афишу. Проверьте соединение и попробуйте ещё раз.'));
        const retry=node('button','retry-button','Обновить страницу');retry.type='button';
        retry.addEventListener('click',function(){window.location.reload();});box.appendChild(retry);
        byId('eventList').setAttribute('aria-busy','false');
    }
    document.addEventListener('DOMContentLoaded',function(){init().catch(showError);});
})();
